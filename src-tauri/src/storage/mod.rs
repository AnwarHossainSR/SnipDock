pub mod database;

mod items;
mod organization;
mod settings;
mod sync;

use sqlx::SqlitePool;
use std::{error::Error, fmt, path::Path};

pub type RepositoryResult<T> = Result<T, RepositoryError>;

#[derive(Debug)]
pub enum RepositoryError {
    Validation(&'static str),
    NotFound,
    CorruptData(&'static str),
    Storage(sqlx::Error),
}

impl fmt::Display for RepositoryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Validation(message) => write!(formatter, "validation: {message}"),
            Self::NotFound => formatter.write_str("item not found"),
            Self::CorruptData(message) => write!(formatter, "corrupt item: {message}"),
            Self::Storage(error) => write!(formatter, "database: {error}"),
        }
    }
}

impl Error for RepositoryError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Storage(error) => Some(error),
            _ => None,
        }
    }
}

impl From<sqlx::Error> for RepositoryError {
    fn from(error: sqlx::Error) -> Self {
        Self::Storage(error)
    }
}

#[derive(Clone)]
pub struct Repository {
    pool: SqlitePool,
}

impl Repository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn snapshot_to(&self, path: &Path) -> RepositoryResult<()> {
        sqlx::query("VACUUM INTO ?")
            .bind(path.to_string_lossy().as_ref())
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
