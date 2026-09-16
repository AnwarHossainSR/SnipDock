use crate::{
    backup::{run_and_record, test_cloud_destination, BackupRunReport},
    error::AppError,
    state::AppState,
};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::State;

const LIVE_DB: &str = "snipdock.sqlite";

/// One recoverable file in the local backup folder. Both kinds are listed
/// together because, from the user's side, "what can I go back to" is one
/// question: the scheduled copies they asked for and the snapshots the app
/// takes before it upgrades a schema.
#[derive(Serialize)]
pub struct LocalBackup {
    pub path: String,
    pub name: String,
    pub bytes: u64,
    pub modified_at: Option<String>,
    /// `true` for a snapshot taken automatically before a schema upgrade.
    pub pre_upgrade: bool,
}

fn database_path(state: &AppState) -> PathBuf {
    state.data_dir().join(LIVE_DB)
}

/// Both kinds of recoverable file, recognised by the modules that write them
/// rather than by a pattern spelled out again here.
fn listing(dir: &Path) -> Vec<LocalBackup> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut backups: Vec<LocalBackup> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let name = path.file_name()?.to_str()?.to_string();
            let pre_upgrade = crate::db::is_pre_upgrade_snapshot(&name);
            if !pre_upgrade && !crate::backup::is_generated_local_backup(&name) {
                return None;
            }
            let metadata = entry.metadata().ok()?;
            Some(LocalBackup {
                path: path.to_string_lossy().into_owned(),
                name,
                bytes: metadata.len(),
                modified_at: metadata.modified().ok().map(|time| {
                    chrono::DateTime::<chrono::Utc>::from(time).to_rfc3339()
                }),
                pre_upgrade,
            })
        })
        .collect();
    sort_newest_first(&mut backups);
    backups
}

/// Newest first: the copy the user most likely wants is the one at the top.
///
/// By modification time, not by name. The two kinds of file carry differently
/// shaped stamps - `pre-upgrade-20260101T000000Z-...` against
/// `2026-01-01_00-00-00_...` - so sorting the merged list lexically grouped it
/// by prefix and only ordered within each group, putting a months-old snapshot
/// above this morning's backup. Name is the tie-break, so a listing stays
/// stable when two files share a timestamp.
fn sort_newest_first(backups: &mut [LocalBackup]) {
    backups.sort_by(|left, right| {
        right
            .modified_at
            .cmp(&left.modified_at)
            .then_with(|| right.name.cmp(&left.name))
    });
}

#[tauri::command]
pub(super) async fn run_backup_now(state: State<'_, AppState>) -> Result<BackupRunReport, AppError> {
    let settings = super::actions::get_settings(state.repository()).await?;
    run_and_record(state.repository(), &database_path(&state), &settings.backup).await
}

#[tauri::command]
pub(super) async fn test_backup_destination(
    state: State<'_, AppState>,
) -> Result<String, AppError> {
    let settings = super::actions::get_settings(state.repository()).await?;
    test_cloud_destination(&settings.backup).await
}

/// The folders `list_local_backups` reads, and the only ones a restore may name.
fn backup_dirs(state: &AppState, settings: &crate::models::BackupSettings) -> Vec<PathBuf> {
    let database = database_path(state);
    let configured = crate::backup::local_backup_dir(settings, &database);
    let automatic = crate::db::auto_backup_dir(&database);
    if configured == automatic {
        vec![automatic]
    } else {
        vec![configured, automatic]
    }
}

#[tauri::command]
pub(super) async fn list_local_backups(
    state: State<'_, AppState>,
) -> Result<Vec<LocalBackup>, AppError> {
    let settings = super::actions::get_settings(state.repository()).await?;
    // A configured folder elsewhere does not move the pre-upgrade snapshots, so
    // the default folder is always read too -- otherwise the safety net would
    // be invisible the moment someone points backups at a drive.
    let mut backups: Vec<LocalBackup> = backup_dirs(&state, &settings.backup)
        .iter()
        .flat_map(|dir| listing(dir))
        .collect();
    // Re-sorted after the merge: each folder was ordered on its own.
    sort_newest_first(&mut backups);
    Ok(backups)
}

/// Restores one of the plain snapshots from `list_local_backups`.
///
/// Local snapshots are unencrypted SQLite files rather than the sealed envelope
/// `restore_backup` reads, so they need their own path. It is deliberately not
/// a general "open this file": only names that came from `list_local_backups`
/// are accepted, so the command cannot be turned into a way to copy an
/// arbitrary file into the app's data directory.
#[tauri::command]
pub(super) async fn restore_local_backup(
    state: State<'_, AppState>,
    path: String,
    dry_run: bool,
) -> Result<crate::models::RestoreReport, AppError> {
    let settings = super::actions::get_settings(state.repository()).await?;
    let candidate = PathBuf::from(&path);
    let known = backup_dirs(&state, &settings.backup)
        .iter()
        .flat_map(|dir| listing(dir))
        .any(|backup| Path::new(&backup.path) == candidate);
    if !known {
        return Err(AppError::new(
            crate::error::ErrorCode::Validation,
            "that file is not one of SnipDock's local backups",
        ));
    }

    let schema_version = crate::db::validate_snapshot(&candidate)
        .await
        .map_err(|error| AppError::new(crate::error::ErrorCode::Validation, error.to_string()))?;
    let item_count = crate::db::snapshot_item_count(&candidate)
        .await
        .map_err(|error| AppError::new(crate::error::ErrorCode::Storage, error.to_string()))?;

    if !dry_run {
        let pending = state.data_dir().join("snipdock.restore-pending.sqlite");
        if pending.exists() {
            return Err(AppError::new(
                crate::error::ErrorCode::Validation,
                "a restore is already pending",
            ));
        }
        // Staged, not swapped: the next launch performs the swap and can roll
        // back if the staged database turns out not to open.
        std::fs::copy(&candidate, &pending).map_err(|error| {
            AppError::new(crate::error::ErrorCode::Storage, error.to_string())
        })?;
    }

    Ok(crate::models::RestoreReport {
        schema_version: schema_version as u32,
        item_count,
        warnings: Vec::new(),
        restart_required: !dry_run,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The regression this file exists to prevent: `listing` used to match a
    /// hard-coded `backup-*.sqlite`, which is what local backups were called
    /// before they were renamed. Nothing failed loudly -- backups kept being
    /// written -- they simply stopped appearing in Settings and could no
    /// longer be restored, because `restore_local_backup` uses this same
    /// listing as its allowlist. Building the name through the writer's own
    /// helpers is what keeps the two ends honest.
    #[test]
    fn lists_the_local_backups_the_writer_actually_produces() {
        let dir = tempfile::tempdir().expect("temp dir");
        let scheduled = crate::backup::local_backup_name_for_test("2026-09-06_22-53-38");
        std::fs::write(dir.path().join(&scheduled), b"x").expect("write backup");
        std::fs::write(
            dir.path().join("pre-upgrade-20260101T000000Z-schema5-to6.sqlite"),
            b"x",
        )
        .expect("write snapshot");
        // Neither ours, and neither may be offered for restore.
        std::fs::write(dir.path().join("notes.sql"), b"x").expect("write stray");
        std::fs::write(dir.path().join("holiday.sqlite"), b"x").expect("write stray");

        let found = listing(dir.path());

        let mut names: Vec<&str> = found.iter().map(|backup| backup.name.as_str()).collect();
        names.sort_unstable();
        assert_eq!(
            names,
            vec![
                "2026-09-06_22-53-38_snipdock_local.sql",
                "pre-upgrade-20260101T000000Z-schema5-to6.sqlite",
            ],
        );
        assert_eq!(scheduled, "2026-09-06_22-53-38_snipdock_local.sql");
        assert!(
            found
                .iter()
                .find(|backup| backup.name == scheduled)
                .is_some_and(|backup| !backup.pre_upgrade),
            "a scheduled backup is not a pre-upgrade snapshot",
        );
    }

    /// Two shapes of stamp in one list, so the order has to come from the
    /// filesystem rather than from the names.
    #[test]
    fn orders_both_kinds_by_age_rather_than_by_prefix() {
        let mut backups = vec![
            LocalBackup {
                path: "a".into(),
                name: "pre-upgrade-20260101T000000Z-schema5-to6.sqlite".into(),
                bytes: 1,
                modified_at: Some("2026-01-01T00:00:00+00:00".into()),
                pre_upgrade: true,
            },
            LocalBackup {
                path: "b".into(),
                name: "2026-09-06_22-53-38_snipdock_local.sql".into(),
                bytes: 1,
                modified_at: Some("2026-09-06T22:53:38+00:00".into()),
                pre_upgrade: false,
            },
        ];

        sort_newest_first(&mut backups);

        assert_eq!(backups[0].name, "2026-09-06_22-53-38_snipdock_local.sql");
    }
}
