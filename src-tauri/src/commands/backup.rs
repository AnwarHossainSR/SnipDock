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

fn listing(dir: &Path) -> Vec<LocalBackup> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut backups: Vec<LocalBackup> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let name = path.file_name()?.to_str()?.to_string();
            if !name.ends_with(".sqlite") {
                return None;
            }
            let pre_upgrade = name.starts_with("pre-upgrade-");
            if !pre_upgrade && !name.starts_with("backup-") {
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
    // Newest first: the copy the user most likely wants is the one at the top.
    backups.sort_by(|left, right| right.name.cmp(&left.name));
    backups
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
    backups.sort_by(|left, right| right.name.cmp(&left.name));
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
        .any(|backup| PathBuf::from(&backup.path) == candidate);
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
