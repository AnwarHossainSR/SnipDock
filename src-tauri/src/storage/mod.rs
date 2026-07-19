pub mod database;

mod items;
mod organization;
mod settings;

use sqlx::SqlitePool;
use std::{error::Error, fmt};

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
}
