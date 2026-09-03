use sqlx::{
    migrate::Migrator,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
    SqlitePool,
};
use std::{error::Error, path::Path, path::PathBuf, time::Duration};

static MIGRATOR: Migrator = sqlx::migrate!();
const LIVE_DB: &str = "snipdock.sqlite";
const PENDING_DB: &str = "snipdock.restore-pending.sqlite";
const ROLLBACK_DB: &str = "snipdock.restore-rollback.sqlite";
const FAILED_DB: &str = "snipdock.restore-failed.sqlite";
const FILE_OPERATION_ATTEMPTS: usize = 10;
const FILE_OPERATION_RETRY_DELAY: Duration = Duration::from_millis(50);
/// Where a pre-upgrade snapshot is written, relative to the database's own
/// directory. Kept beside the live database so a restore never has to hunt for
/// a path the user may have since changed in Settings.
pub const AUTO_BACKUP_DIR: &str = "backups";
/// How many pre-upgrade snapshots to keep. Enough to step back through a few
/// bad releases without letting the folder grow without bound.
const AUTO_BACKUP_KEEP: usize = 5;

pub type DatabaseResult<T> = Result<T, Box<dyn Error + Send + Sync>>;

/// The newest migration this build carries. Read from the embedded migrator
/// rather than written down, because a hand-kept copy has already fallen behind
/// twice: every backup a build takes is stamped with the live database version,
/// so a stale constant makes the build reject its own backups as "newer".
pub fn current_schema_version() -> i64 {
    MIGRATOR
        .iter()
        .map(|migration| migration.version)
        .max()
        .unwrap_or(0)
}

/// Whether the database carries migrations this build does not ship, which
/// happens when a newer SnipDock has already opened it: an update that was
/// rolled back, a downgrade, or two builds sharing one data directory.
///
/// Refusing to start in that situation leaves the app permanently unopenable
/// with no way back, so a database that is merely *ahead* is accepted as long
/// as every migration this build does ship is applied and unmodified. The
/// schema is then a superset of what this build's queries expect. A mismatch of
/// any other kind -- an edited migration, one of ours missing -- still fails,
/// because those mean the schema is not what the queries were written against.
///
/// Returns the database's highest applied version when it is ahead, `None`
/// when this build is level with it or newer.
async fn schema_ahead_of_build(pool: &SqlitePool) -> DatabaseResult<Option<i64>> {
    let applied: Vec<(i64, Vec<u8>, bool)> =
        match sqlx::query_as("SELECT version, checksum, success FROM _sqlx_migrations")
            .fetch_all(pool)
            .await
        {
            Ok(applied) => applied,
            // No migration table: a database this build has never opened, so
            // there is nothing ahead of us. Let the migrator create it.
            Err(_) => return Ok(None),
        };

    let highest_applied = applied
        .iter()
        .map(|(version, _, _)| *version)
        .max()
        .unwrap_or(0);
    if highest_applied <= current_schema_version() {
        return Ok(None);
    }

    // Returning early skips the migrator, and with it the dirty check it would
    // have run. A half-applied migration leaves the schema in a state nothing
    // was written against, so it has to fail here instead.
    if let Some((version, _, _)) = applied.iter().find(|(_, _, success)| !success) {
        return Err(std::io::Error::other(format!(
            "migration {version} was left half-applied and must be repaired before SnipDock can start"
        ))
        .into());
    }

    for migration in MIGRATOR.iter() {
        let matches = applied.iter().any(|(version, checksum, _)| {
            *version == migration.version && checksum.as_slice() == migration.checksum.as_ref()
        });
        if !matches {
            return Err(std::io::Error::other(format!(
                "database schema is newer than this build, and migration {} does not match",
                migration.version
            ))
            .into());
        }
    }

    Ok(Some(highest_applied))
}

pub struct Database {
    pool: SqlitePool,
}

pub(crate) async fn retry_locked_file_operation<T>(
    mut operation: impl FnMut() -> std::io::Result<T>,
) -> std::io::Result<T> {
    for attempt in 1..=FILE_OPERATION_ATTEMPTS {
        match operation() {
            Err(error)
                if cfg!(windows)
                    && matches!(error.raw_os_error(), Some(32 | 33))
                    && attempt < FILE_OPERATION_ATTEMPTS =>
            {
                tokio::time::sleep(FILE_OPERATION_RETRY_DELAY).await;
            }
            result => return result,
        }
    }
    unreachable!()
}

/// The write-ahead log and shared-memory files SQLite keeps beside a database
/// in WAL mode. A cleanly closed database has neither -- the last connection to
/// go checkpoints and deletes them -- but a database left behind by a crash
/// has both, and they belong to that database file alone. Moving or deleting a
/// `.sqlite` without them leaves a log beside whatever file takes its place.
const WAL_SIDECARS: [&str; 2] = ["-wal", "-shm"];

fn sidecar_path(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(suffix);
    PathBuf::from(name)
}

async fn rename_database(from: &Path, to: &Path) -> std::io::Result<()> {
    retry_locked_file_operation(|| std::fs::rename(from, to)).await?;
    for suffix in WAL_SIDECARS {
        let source = sidecar_path(from, suffix);
        if source.exists() {
            // Best effort: a sidecar that will not move is recoverable -- SQLite
            // rebuilds the shared-memory file, and an orphaned log is ignored
            // once its database is gone -- whereas failing the rename here would
            // strand a restore with the database already half moved.
            let _ = retry_locked_file_operation(|| {
                std::fs::rename(&source, sidecar_path(to, suffix))
            })
            .await;
        }
    }
    Ok(())
}

/// The highest migration already applied, or `None` for a database this build
/// has never opened -- there is no migration table to read yet, and a brand new
/// file has nothing worth snapshotting.
async fn applied_schema_version(pool: &SqlitePool) -> Option<i64> {
    sqlx::query_scalar::<_, i64>("SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations")
        .fetch_one(pool)
        .await
        .ok()
        .filter(|version| *version > 0)
}

/// The directory pre-upgrade snapshots are written to, given the live database.
pub fn auto_backup_dir(database_path: &Path) -> PathBuf {
    database_path
        .parent()
        .unwrap_or(Path::new("."))
        .join(AUTO_BACKUP_DIR)
}

/// Deletes all but the newest `AUTO_BACKUP_KEEP` snapshots. Best effort: a
/// snapshot that cannot be removed is a tidiness problem, not a data one, so it
/// never fails the caller.
fn prune_auto_backups(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut snapshots: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("pre-upgrade-") && name.ends_with(".sqlite"))
        })
        .collect();
    // The names embed a sortable UTC timestamp, so lexical order is
    // chronological and no metadata call is needed to rank them.
    snapshots.sort();
    let excess = snapshots.len().saturating_sub(AUTO_BACKUP_KEEP);
    for path in snapshots.into_iter().take(excess) {
        let _ = std::fs::remove_file(path);
    }
}

/// Copies the database before the migrator touches it, so a release that adds
/// or rebuilds a table can always be stepped back from.
///
/// `VACUUM INTO` rather than a file copy: the pool runs in WAL mode, so the
/// `.sqlite` file on its own can be missing committed pages that are still in
/// the write-ahead log. This produces one consistent, self-contained file.
async fn snapshot_before_migrating(
    pool: &SqlitePool,
    database_path: &Path,
    from_version: i64,
) -> DatabaseResult<PathBuf> {
    let dir = auto_backup_dir(database_path);
    std::fs::create_dir_all(&dir)?;
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%SZ");
    let target = dir.join(format!(
        "pre-upgrade-{stamp}-schema{from_version}-to{}.sqlite",
        current_schema_version(),
    ));
    // VACUUM INTO refuses to overwrite, and a same-second retry is the only way
    // to collide, so clear any leftover first.
    if target.exists() {
        std::fs::remove_file(&target)?;
    }
    sqlx::query("VACUUM INTO ?")
        .bind(target.to_string_lossy().as_ref())
        .execute(pool)
        .await?;
    prune_auto_backups(&dir);
    Ok(target)
}

async fn remove_database(path: &Path) -> std::io::Result<()> {
    retry_locked_file_operation(|| std::fs::remove_file(path)).await?;
    for suffix in WAL_SIDECARS {
        let sidecar = sidecar_path(path, suffix);
        if sidecar.exists() {
            let _ = retry_locked_file_operation(|| std::fs::remove_file(&sidecar)).await;
        }
    }
    Ok(())
}

impl Database {
    pub async fn open(path: impl AsRef<Path>) -> DatabaseResult<Self> {
        let path = path.as_ref().to_path_buf();
        let options = SqliteConnectOptions::new()
            .filename(&path)
            .create_if_missing(true)
            .foreign_keys(true)
            // Every capture is a write, and on the rollback-journal default
            // each one costs a journal file created, fsynced and deleted while
            // readers are locked out. WAL lets the history page render while a
            // capture commits, and `Normal` drops the per-commit fsync: a
            // crashed app still recovers every committed row from the log, and
            // only an OS-level power loss can cost the last few. For clipboard
            // history that is the right end of the trade.
            .journal_mode(SqliteJournalMode::Wal)
            .synchronous(SqliteSynchronous::Normal)
            // WAL admits one writer at a time, and the pool is wide enough to
            // have several. Without this a capture landing during a search
            // fails outright instead of waiting its turn.
            .busy_timeout(Duration::from_secs(5))
            // Negative is KiB, per SQLite. 8 MB of page cache and a 128 MB
            // memory map keep the hot pages of a long history off the disk.
            .pragma("cache_size", "-8000")
            .pragma("mmap_size", "134217728");
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await?;

        match schema_ahead_of_build(&pool).await {
            // Nothing of ours is pending -- a newer build applied all of it --
            // and running the migrator would only rediscover the extra
            // versions and refuse.
            Ok(Some(highest_applied)) => {
                eprintln!(
                    "Database schema is {highest_applied}, newer than this build's {}. Opening it anyway; update SnipDock so every feature matches the data.",
                    current_schema_version(),
                );
                return Ok(Self { pool });
            }
            Ok(None) => {}
            Err(error) => {
                pool.close().await;
                return Err(error);
            }
        }

        // A migration can rebuild a table (0004 already did) or drop one, and
        // none of that is reversible once it has run. Snapshot first, and treat
        // a snapshot that cannot be written as a reason not to migrate at all:
        // refusing to start leaves the data intact and is fixable by freeing
        // disk space, whereas migrating unbacked risks losing it outright.
        if let Some(applied) = applied_schema_version(&pool).await {
            if applied < current_schema_version() {
                match snapshot_before_migrating(&pool, &path, applied).await {
                    Ok(target) => eprintln!(
                        "Backed up the database to {} before upgrading schema {applied} to {}.",
                        target.display(),
                        current_schema_version(),
                    ),
                    Err(error) => {
                        pool.close().await;
                        return Err(std::io::Error::other(format!(
                            "could not back up the database before upgrading it, so the upgrade was not started: {error}"
                        ))
                        .into());
                    }
                }
            }
        }

        if let Err(error) = MIGRATOR.run(&pool).await {
            pool.close().await;
            return Err(error.into());
        }
        Ok(Self { pool })
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub async fn close(self) {
        // Fold the write-ahead log back into the database and truncate it
        // before the pool goes. Closing the last connection does this anyway,
        // but doing it explicitly means a restore or a backup that runs right
        // after a close finds one self-contained file and no stale sidecars.
        let _ = sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
            .execute(&self.pool)
            .await;
        self.pool.close().await;
    }

    pub async fn open_with_pending_restore(data_dir: &Path) -> DatabaseResult<Self> {
        let live = data_dir.join(LIVE_DB);
        let pending = data_dir.join(PENDING_DB);
        let rollback = data_dir.join(ROLLBACK_DB);
        let failed = data_dir.join(FAILED_DB);

        if rollback.exists() && !live.exists() {
            rename_database(&rollback, &live).await?;
        } else if rollback.exists() && live.exists() {
            match Self::open(&live).await {
                Ok(database) => {
                    remove_database(&rollback).await?;
                    return Ok(database);
                }
                Err(_) => {
                    if failed.exists() {
                        remove_database(&failed).await?;
                    }
                    rename_database(&live, &failed).await?;
                    rename_database(&rollback, &live).await?;
                    return Self::open(&live).await;
                }
            }
        }

        if !pending.exists() {
            return Self::open(live).await;
        }
        if failed.exists() {
            remove_database(&failed).await?;
        }
        if live.exists() {
            rename_database(&live, &rollback).await?;
        }
        rename_database(&pending, &live).await?;
        match Self::open(&live).await {
            Ok(database) => {
                if rollback.exists() {
                    remove_database(&rollback).await?;
                }
                Ok(database)
            }
            Err(_) if rollback.exists() => {
                rename_database(&live, &failed).await?;
                rename_database(&rollback, &live).await?;
                Self::open(live).await
            }
            Err(error) => Err(error),
        }
    }
}

pub async fn validate_snapshot(path: &Path) -> DatabaseResult<i64> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .read_only(true)
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await?;
    let check: String = sqlx::query_scalar("PRAGMA quick_check")
        .fetch_one(&pool)
        .await?;
    if check != "ok" {
        pool.close().await;
        return Err(std::io::Error::other(format!(
            "database integrity check failed: {check}"
        ))
        .into());
    }
    let version: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations",
    )
    .fetch_one(&pool)
    .await?;
    pool.close().await;
    if version > current_schema_version() {
        return Err(std::io::Error::other("backup schema is newer").into());
    }
    Ok(version)
}

pub async fn snapshot_item_count(path: &Path) -> DatabaseResult<i64> {
    let options = SqliteConnectOptions::new().filename(path).read_only(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await?;
    let count = sqlx::query_scalar("SELECT COUNT(*) FROM items")
        .fetch_one(&pool)
        .await?;
    pool.close().await;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use uuid::Uuid;

    async fn database_with_marker(path: &Path, marker: &str) {
        let database = Database::open(path).await.unwrap();
        sqlx::query(
            "INSERT INTO items (id, kind, content, content_hash, created_at, updated_at) \
             VALUES ('marker', 'note', ?, 'hash', '1', '1')",
        )
        .bind(marker)
        .execute(database.pool())
        .await
        .unwrap();
        database.close().await;
    }

    async fn marker(database: &Database) -> String {
        sqlx::query_scalar("SELECT CAST(content AS TEXT) FROM items WHERE id = 'marker'")
            .fetch_one(database.pool())
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn pending_database_replaces_live_database() {
        let root = std::env::temp_dir().join(format!("snipdock-swap-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        database_with_marker(&root.join("snipdock.sqlite"), "original").await;
        database_with_marker(&root.join("snipdock.restore-pending.sqlite"), "restored").await;

        let database = Database::open_with_pending_restore(&root).await.unwrap();
        assert_eq!(marker(&database).await, "restored");
        assert!(!root.join("snipdock.restore-rollback.sqlite").exists());
        database.close().await;
        retry_locked_file_operation(|| fs::remove_dir_all(&root))
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn invalid_pending_database_rolls_back_live_database() {
        let root = std::env::temp_dir().join(format!("snipdock-swap-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        database_with_marker(&root.join("snipdock.sqlite"), "original").await;
        let pending = root.join("snipdock.restore-pending.sqlite");
        fs::write(&pending, b"not sqlite").unwrap();

        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            let lock = fs::OpenOptions::new()
                .read(true)
                .share_mode(0)
                .open(&pending)
                .unwrap();
            tokio::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(75)).await;
                drop(lock);
            });
        }

        let database = Database::open_with_pending_restore(&root).await.unwrap();
        assert_eq!(marker(&database).await, "original");
        assert!(root.join("snipdock.restore-failed.sqlite").exists());
        database.close().await;
        retry_locked_file_operation(|| fs::remove_dir_all(&root))
            .await
            .unwrap();
    }
}
