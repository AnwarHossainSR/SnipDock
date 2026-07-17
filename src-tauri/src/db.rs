use sqlx::{
    migrate::Migrator,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    SqlitePool,
};
use std::{error::Error, path::Path};

static MIGRATOR: Migrator = sqlx::migrate!();

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

        MIGRATOR.run(&pool).await?;
        Ok(Self { pool })
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub async fn close(self) {
        self.pool.close().await;
    }
}
