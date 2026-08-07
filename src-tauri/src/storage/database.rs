use sqlx::{
    migrate::Migrator,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    SqlitePool,
};
use std::{error::Error, path::Path, time::Duration};

static MIGRATOR: Migrator = sqlx::migrate!();
const LIVE_DB: &str = "snipdock.sqlite";
const PENDING_DB: &str = "snipdock.restore-pending.sqlite";
const ROLLBACK_DB: &str = "snipdock.restore-rollback.sqlite";
const FAILED_DB: &str = "snipdock.restore-failed.sqlite";
const FILE_OPERATION_ATTEMPTS: usize = 10;
const FILE_OPERATION_RETRY_DELAY: Duration = Duration::from_millis(50);

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
    let applied: Vec<(i64, Vec<u8>)> =
        match sqlx::query_as("SELECT version, checksum FROM _sqlx_migrations")
            .fetch_all(pool)
            .await
        {
            Ok(applied) => applied,
            // No migration table: a database this build has never opened, so
            // there is nothing ahead of us. Let the migrator create it.
            Err(_) => return Ok(None),
        };

    let highest_applied = applied.iter().map(|(version, _)| *version).max().unwrap_or(0);
    if highest_applied <= current_schema_version() {
        return Ok(None);
    }

    for migration in MIGRATOR.iter() {
        let matches = applied.iter().any(|(version, checksum)| {
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

async fn rename_database(from: &Path, to: &Path) -> std::io::Result<()> {
    retry_locked_file_operation(|| std::fs::rename(from, to)).await
}

async fn remove_database(path: &Path) -> std::io::Result<()> {
    retry_locked_file_operation(|| std::fs::remove_file(path)).await
}

impl Database {
    pub async fn open(path: impl AsRef<Path>) -> DatabaseResult<Self> {
        let options = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            .foreign_keys(true);
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
