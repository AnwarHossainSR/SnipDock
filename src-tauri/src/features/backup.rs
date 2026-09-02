//! Running a backup to the destinations configured in Settings.
//!
//! One snapshot feeds every destination, so a local copy and an upload can
//! never disagree about what was backed up. The two destinations are
//! deliberately different formats:
//!
//! * **Local** keeps the plain `.sqlite` snapshot, renamed to
//!   `<YYYY-MM-DD_HH-MM-SS>_snipdock_local.sql` so the date is obvious in
//!   `ls`. It never leaves the machine, it sits in the same folder as the
//!   pre-upgrade snapshots, and it can be opened with any SQLite tool if
//!   SnipDock itself will not start.
//! * **Cloud** uploads the encrypted envelope `create_backup` produces,
//!   sealed on this machine before the request is made, named
//!   `<YYYY-MM-DD_HH-MM-SS>_snipdock_r2.sql` under the configured prefix, and
//!   restorable through the same Settings → Restore path as a manual
//!   backup file.

use crate::{
    db::auto_backup_dir,
    error::{AppError, ErrorCode},
    models::{BackupSchedule, BackupSettings, CloudProvider},
    repository::Repository,
};
use serde::Serialize;
use std::path::{Path, PathBuf};

const LOCAL_EXTENSION: &str = "sql";
const CLOUD_EXTENSION: &str = "sql";
const LOCAL_BASENAME: &str = "snipdock_local";
const CLOUD_BASENAME: &str = "snipdock_r2";
/// Written and deleted by the connection test, so a misconfigured bucket fails
/// in Settings rather than silently at 3am.
const PROBE_KEY: &str = ".snipdock-connection-test";

fn backup_error(message: impl Into<String>) -> AppError {
    AppError::new(ErrorCode::Internal, message)
}

/// What one backup run did, per destination. Both are optional because a run
/// with only a cloud destination configured writes nothing locally, and vice
/// versa.
#[derive(Clone, Debug, Default, Serialize)]
pub struct BackupRunReport {
    pub local_path: Option<String>,
    pub cloud_url: Option<String>,
    pub bytes: u64,
    pub created_at: String,
    pub warnings: Vec<String>,
}

/// Where local backups go: the configured folder, or the `backups` directory
/// beside the database, which is also where pre-upgrade snapshots land so
/// everything recoverable is in one place.
pub fn local_backup_dir(settings: &BackupSettings, database_path: &Path) -> PathBuf {
    let configured = settings.local_dir.trim();
    if configured.is_empty() {
        auto_backup_dir(database_path)
    } else {
        PathBuf::from(configured)
    }
}

/// Human-readable local-time stamp for backup filenames:
/// `2026-09-01_15-30-42`. The format is fixed-width and zero-padded so
/// filenames sort in the order they were written and the date is obvious in
/// `ls` and the R2 dashboard. Seconds are part of the stamp because two runs
/// in the same minute - a manual backup right after a scheduled one - would
/// otherwise overwrite each other's local file and cloud object.
fn local_timestamp(now: chrono::DateTime<chrono::Local>) -> String {
    format!("{}", now.format("%Y-%m-%d_%H-%M-%S"))
}

fn local_backup_name(stamp: &str) -> String {
    format!("{stamp}_{LOCAL_BASENAME}.{LOCAL_EXTENSION}")
}

fn cloud_backup_name(stamp: &str) -> String {
    format!("{stamp}_{CLOUD_BASENAME}.{CLOUD_EXTENSION}")
}

/// Deletes the oldest local backups past `keep`. Only files this module wrote
/// are considered: pre-upgrade snapshots share the folder and are the app's
/// last line of defence, so a retention setting must never sweep them up.
fn prune_local(dir: &Path, keep: u32) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut backups: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(is_generated_local_backup)
        })
        .collect();
    // Names embed a sortable local-time stamp, so lexical order is chronological.
    backups.sort();
    let excess = backups.len().saturating_sub(keep.max(1) as usize);
    let mut warnings = Vec::new();
    for path in backups.into_iter().take(excess) {
        if let Err(error) = std::fs::remove_file(&path) {
            warnings.push(format!("Could not remove {}: {error}", path.display()));
        }
    }
    warnings
}

/// True only for a filename this module generated: the full stamp, then the
/// fixed basename and extension. Matching the suffix alone would let an
/// unrelated file that happens to end in `_snipdock_local.sql` be swept up by
/// retention. The seconds group is optional so backups written before the
/// stamp gained seconds are still pruned rather than accumulating forever.
fn is_generated_local_backup(name: &str) -> bool {
    let suffix = format!("_{LOCAL_BASENAME}.{LOCAL_EXTENSION}");
    let Some(stamp) = name.strip_suffix(&suffix) else {
        return false;
    };
    let mut parts = stamp.split('_');
    let (Some(date), Some(time), None) = (parts.next(), parts.next(), parts.next()) else {
        return false;
    };
    let date_shape: Vec<usize> = vec![4, 2, 2];
    let date_parts: Vec<&str> = date.split('-').collect();
    if date_parts.len() != date_shape.len() {
        return false;
    }
    if !date_parts
        .iter()
        .zip(date_shape)
        .all(|(part, width)| part.len() == width && part.bytes().all(|byte| byte.is_ascii_digit()))
    {
        return false;
    }
    let time_parts: Vec<&str> = time.split('-').collect();
    if time_parts.len() != 2 && time_parts.len() != 3 {
        return false;
    }
    time_parts
        .iter()
        .all(|part| part.len() == 2 && part.bytes().all(|byte| byte.is_ascii_digit()))
}

/// Backs the database up to every configured destination.
///
/// A destination that fails does not cancel the others -- a broken bucket must
/// not cost the user their local copy -- but the run as a whole fails if
/// nothing was written anywhere, because a backup that silently stored nothing
/// is worse than no backup at all.
pub async fn run_backup(
    repository: &Repository,
    database_path: &Path,
    settings: &BackupSettings,
) -> Result<BackupRunReport, AppError> {
    if !settings.local && settings.cloud.provider == CloudProvider::None {
        return Err(AppError::new(
            ErrorCode::Validation,
            "no backup destination is turned on",
        ));
    }

    let stamp = local_timestamp(chrono::Local::now());
    let staging_dir = auto_backup_dir(database_path);
    std::fs::create_dir_all(&staging_dir)
        .map_err(|error| backup_error(format!("could not prepare the backup folder: {error}")))?;
    let snapshot = staging_dir.join(format!(".staging-{}.sqlite", uuid::Uuid::new_v4()));
    repository
        .snapshot_to(&snapshot)
        .await
        .map_err(|error| backup_error(format!("could not snapshot the database: {error}")))?;

    let result = write_destinations(&snapshot, database_path, settings, &stamp).await;
    let _ = std::fs::remove_file(&snapshot);
    result
}

async fn write_destinations(
    snapshot: &Path,
    database_path: &Path,
    settings: &BackupSettings,
    stamp: &str,
) -> Result<BackupRunReport, AppError> {
    let mut report = BackupRunReport {
        created_at: chrono::Utc::now().to_rfc3339(),
        bytes: std::fs::metadata(snapshot).map(|meta| meta.len()).unwrap_or(0),
        ..Default::default()
    };
    let mut failures = Vec::new();

    if settings.local {
        let dir = local_backup_dir(settings, database_path);
        match std::fs::create_dir_all(&dir)
            .and_then(|()| {
                let target = dir.join(local_backup_name(stamp));
                std::fs::copy(snapshot, &target).map(|_| target)
            }) {
            Ok(target) => {
                report.warnings.extend(prune_local(&dir, settings.keep));
                report.local_path = Some(target.to_string_lossy().into_owned());
            }
            Err(error) => failures.push(format!("Local backup failed: {error}")),
        }
    }

    if settings.cloud.provider != CloudProvider::None {
        match upload(snapshot, settings, stamp).await {
            Ok(url) => report.cloud_url = Some(url),
            Err(error) => failures.push(format!("Upload failed: {}", error.message)),
        }
    }

    if report.local_path.is_none() && report.cloud_url.is_none() {
        return Err(backup_error(failures.join(" ")));
    }
    report.warnings.extend(failures);
    Ok(report)
}

/// Summarises a finished run in one line, for the Settings panel.
fn describe(report: &Result<BackupRunReport, AppError>) -> String {
    match report {
        Ok(report) => match (&report.local_path, &report.cloud_url) {
            (Some(path), Some(url)) => format!("Saved to {path} and uploaded to {url}"),
            (Some(path), None) => format!("Saved to {path}"),
            (None, Some(url)) => format!("Uploaded to {url}"),
            (None, None) => "Nothing was written".to_string(),
        },
        Err(error) => format!("Failed: {}", error.message),
    }
}

/// Runs a backup and records when it ran and how it went.
///
/// The outcome is stored whether or not it succeeded: a failure nobody is told
/// about is exactly what leaves people believing they have backups when they do
/// not, and Settings reads these two fields to say so.
pub async fn run_and_record(
    repository: &Repository,
    database_path: &Path,
    settings: &BackupSettings,
) -> Result<BackupRunReport, AppError> {
    let report = run_backup(repository, database_path, settings).await;
    let recorded = BackupSettings {
        last_run_at: Some(chrono::Utc::now().to_rfc3339()),
        last_result: Some(describe(&report)),
        ..settings.clone()
    };
    if let Ok(value) = serde_json::to_value(recorded) {
        let _ = repository
            .save_settings(crate::models::SettingsPatch {
                values: std::collections::BTreeMap::from([("backup".to_string(), value)]),
            })
            .await;
    }
    report
}

/// Whether a scheduled backup is due. `Manual` never is -- the schedule is the
/// user's statement about unattended runs, and "back up now" is a separate
/// button.
pub fn backup_is_due(settings: &BackupSettings, now: chrono::DateTime<chrono::Utc>) -> bool {
    let interval = match settings.schedule {
        BackupSchedule::Manual => return false,
        BackupSchedule::Daily => chrono::Duration::days(1),
        BackupSchedule::Weekly => chrono::Duration::weeks(1),
    };
    match settings.last_run_at.as_deref() {
        // Turning a schedule on should produce a backup, not a promise of one
        // in 24 hours, so a destination that has never run is due immediately.
        None => true,
        Some(stamp) => match chrono::DateTime::parse_from_rfc3339(stamp) {
            Ok(last) => now - last.with_timezone(&chrono::Utc) >= interval,
            // An unreadable timestamp is treated as "never": erring towards one
            // extra backup is the safe direction to be wrong in.
            Err(_) => true,
        },
    }
}

async fn upload(
    snapshot: &Path,
    settings: &BackupSettings,
    stamp: &str,
) -> Result<String, AppError> {
    // Sealed here, before any request is made: what leaves the machine is
    // ciphertext, and the passphrase never does.
    let sealed = crate::transfer::seal_snapshot(&settings.cloud.passphrase, snapshot).await?;
    let bucket = crate::cloud::Bucket::from_settings(&settings.cloud)?;
    let key = object_key(&settings.cloud.prefix, stamp);
    bucket.put_object(&key, sealed).await?;
    Ok(bucket.url_for(&key))
}

fn object_key(prefix: &str, stamp: &str) -> String {
    let name = cloud_backup_name(stamp);
    let prefix = prefix.trim().trim_matches('/');
    if prefix.is_empty() {
        name
    } else {
        format!("{prefix}/{name}")
    }
}

/// Writes a small object and deletes it again, so Settings can say whether the
/// credentials actually permit a backup instead of waiting for the first
/// scheduled run to find out.
pub async fn test_cloud_destination(settings: &BackupSettings) -> Result<String, AppError> {
    if settings.cloud.provider == CloudProvider::None {
        return Err(AppError::new(
            ErrorCode::Validation,
            "choose S3 or R2 before testing the connection",
        ));
    }
    let bucket = crate::cloud::Bucket::from_settings(&settings.cloud)?;
    let key = object_key(&settings.cloud.prefix, PROBE_KEY);
    bucket
        .put_object(&key, b"snipdock connection test".to_vec())
        .await?;
    // A bucket that allows writes but not deletes can still hold backups, so a
    // failed cleanup is reported rather than treated as a failed test.
    match bucket.delete_object(&key).await {
        Ok(()) => Ok(format!("Wrote and removed {}.", bucket.url_for(&key))),
        Err(_) => Ok(format!(
            "Wrote {}, but it could not be deleted again -- remove it by hand if you do not want it there.",
            bucket.url_for(&key),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::CloudBackupSettings;
    use chrono::TimeZone;

    #[test]
    fn object_keys_sit_under_the_prefix_when_there_is_one() {
        assert_eq!(object_key("", "2026-09-01_15-30"), "2026-09-01_15-30_snipdock_r2.sql");
        assert_eq!(
            object_key("/team/laptop/", "2026-09-01_15-30"),
            "team/laptop/2026-09-01_15-30_snipdock_r2.sql",
        );
    }

    #[test]
    fn local_timestamp_pads_single_digit_hours_minutes_and_seconds() {
        // Naive date-times are interpreted as local time on the host, so the
        // assertion is timezone-independent.
        let fixed: chrono::DateTime<chrono::Local> = chrono::Local
            .from_local_datetime(&chrono::NaiveDate::from_ymd_opt(2026, 1, 2)
                .unwrap()
                .and_hms_opt(0, 5, 0)
                .unwrap())
            .unwrap();
        assert_eq!(local_timestamp(fixed), "2026-01-02_00-05-00");
    }

    #[test]
    fn local_timestamp_handles_midnight_and_end_of_day() {
        let midnight: chrono::DateTime<chrono::Local> = chrono::Local
            .from_local_datetime(&chrono::NaiveDate::from_ymd_opt(2026, 9, 1)
                .unwrap()
                .and_hms_opt(0, 0, 0)
                .unwrap())
            .unwrap();
        let end_of_day: chrono::DateTime<chrono::Local> = chrono::Local
            .from_local_datetime(&chrono::NaiveDate::from_ymd_opt(2026, 9, 1)
                .unwrap()
                .and_hms_opt(23, 59, 0)
                .unwrap())
            .unwrap();
        let midnight_stamp = local_timestamp(midnight);
        let end_stamp = local_timestamp(end_of_day);
        assert!(midnight_stamp.ends_with("_00-00-00"));
        assert!(end_stamp.ends_with("_23-59-00"));
        assert!(midnight_stamp < end_stamp, "lexical order must match chronological");
    }

    #[test]
    fn retention_keeps_the_newest_and_never_touches_upgrade_snapshots() {
        let dir = std::env::temp_dir().join(format!("snipdock-prune-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        for stamp in ["2026-01-01_00-00", "2026-02-01_00-00", "2026-03-01_00-00"] {
            std::fs::write(
                dir.join(local_backup_name(stamp)),
                b"x",
            )
            .unwrap();
        }
        // The safety net a bad release falls back on. Retention is about the
        // user's scheduled copies and must leave it alone.
        std::fs::write(dir.join("pre-upgrade-20260101T000000Z-schema5-to6.sqlite"), b"x").unwrap();
        // A legacy .backup/.sqlite file from before the rename must also be
        // ignored by retention so an upgrade does not silently delete it.
        std::fs::write(dir.join("backup-20260101T000000Z.sqlite"), b"x").unwrap();
        // A user's own file that merely ends in the generated suffix is not a
        // backup this module wrote, so retention must leave it where it is.
        std::fs::write(dir.join("2026-01-01_00-00_notes_snipdock_local.sql"), b"x").unwrap();

        let warnings = prune_local(&dir, 2);
        let mut left: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();
        left.sort();

        assert!(warnings.is_empty(), "unexpected warnings: {warnings:?}");
        assert_eq!(
            left,
            vec![
                "2026-01-01_00-00_notes_snipdock_local.sql",
                "2026-02-01_00-00_snipdock_local.sql",
                "2026-03-01_00-00_snipdock_local.sql",
                "backup-20260101T000000Z.sqlite",
                "pre-upgrade-20260101T000000Z-schema5-to6.sqlite",
            ],
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_schedule_catches_up_rather_than_waiting_for_a_missed_slot() {
        let now = chrono::Utc::now();
        let daily = |last: Option<String>| BackupSettings {
            schedule: BackupSchedule::Daily,
            last_run_at: last,
            ..Default::default()
        };

        // Turning a schedule on should produce a backup, not a promise of one.
        assert!(backup_is_due(&daily(None), now));
        assert!(backup_is_due(
            &daily(Some((now - chrono::Duration::hours(30)).to_rfc3339())),
            now,
        ));
        assert!(!backup_is_due(
            &daily(Some((now - chrono::Duration::hours(2)).to_rfc3339())),
            now,
        ));
        // A machine that was off for a week owes one backup, not seven, and the
        // hourly wake-up finds it due the moment it opens.
        assert!(backup_is_due(
            &daily(Some((now - chrono::Duration::days(9)).to_rfc3339())),
            now,
        ));

        // Manual means unattended runs are off, however long it has been.
        assert!(!backup_is_due(
            &BackupSettings {
                schedule: BackupSchedule::Manual,
                last_run_at: None,
                ..Default::default()
            },
            now,
        ));
        // An unreadable stamp errs towards one extra backup.
        assert!(backup_is_due(&daily(Some("not a date".into())), now));
    }

    #[tokio::test]
    async fn a_run_with_no_destination_is_refused() {
        let settings = BackupSettings {
            local: false,
            cloud: CloudBackupSettings::default(),
            ..Default::default()
        };
        let error = run_backup(
            &Repository::new(
                crate::db::Database::open(
                    std::env::temp_dir().join(format!("snipdock-nodest-{}.sqlite", uuid::Uuid::new_v4())),
                )
                .await
                .unwrap()
                .pool()
                .clone(),
            ),
            Path::new("snipdock.sqlite"),
            &settings,
        )
        .await
        .unwrap_err();
        assert!(error.message.contains("no backup destination"));
    }
}
