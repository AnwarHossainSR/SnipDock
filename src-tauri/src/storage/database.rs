use sqlx::{
    migrate::Migrator,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    SqlitePool,
};
use std::{error::Error, path::Path};

static MIGRATOR: Migrator = sqlx::migrate!();
pub const CURRENT_SCHEMA_VERSION: i64 = 3;
const LIVE_DB: &str = "snipdock.sqlite";
const PENDING_DB: &str = "snipdock.restore-pending.sqlite";
const ROLLBACK_DB: &str = "snipdock.restore-rollback.sqlite";
const FAILED_DB: &str = "snipdock.restore-failed.sqlite";

pub type DatabaseResult<T> = Result<T, Box<dyn Error + Send + Sync>>;

pub struct Database {
    pool: SqlitePool,
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
            std::fs::rename(&rollback, &live)?;
        } else if rollback.exists() && live.exists() {
            match Self::open(&live).await {
                Ok(database) => {
                    std::fs::remove_file(&rollback)?;
                    return Ok(database);
                }
                Err(_) => {
                    if failed.exists() {
                        std::fs::remove_file(&failed)?;
                    }
                    std::fs::rename(&live, &failed)?;
                    std::fs::rename(&rollback, &live)?;
                    return Self::open(&live).await;
                }
            }
        }

        if !pending.exists() {
            return Self::open(live).await;
        }
        if failed.exists() {
            std::fs::remove_file(&failed)?;
        }
        if live.exists() {
            std::fs::rename(&live, &rollback)?;
        }
        std::fs::rename(&pending, &live)?;
        match Self::open(&live).await {
            Ok(database) => {
                if rollback.exists() {
                    std::fs::remove_file(rollback)?;
                }
                Ok(database)
            }
            Err(_) if rollback.exists() => {
                std::fs::rename(&live, &failed)?;
                std::fs::rename(&rollback, &live)?;
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
    if version > CURRENT_SCHEMA_VERSION {
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
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn invalid_pending_database_rolls_back_live_database() {
        let root = std::env::temp_dir().join(format!("snipdock-swap-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        database_with_marker(&root.join("snipdock.sqlite"), "original").await;
        fs::write(root.join("snipdock.restore-pending.sqlite"), b"not sqlite").unwrap();

        let database = Database::open_with_pending_restore(&root).await.unwrap();
        assert_eq!(marker(&database).await, "original");
        assert!(root.join("snipdock.restore-failed.sqlite").exists());
        database.close().await;
        fs::remove_dir_all(root).unwrap();
    }
}
