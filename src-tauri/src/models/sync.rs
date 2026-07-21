use super::Id;
use serde::{Deserialize, Serialize};

/// A single encrypted revision of a library record staged for cross-device
/// sync. The `ciphertext` is a self-contained token produced by
/// [`crate::crypto::encrypt`]; plaintext never touches this row.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, sqlx::FromRow)]
pub struct SyncRecord {
    pub id: Id,
    pub device_id: String,
    pub record_id: Id,
    pub revision: i64,
    pub tombstone: bool,
    pub ciphertext: String,
    pub updated_at: String,
}

/// A divergence discovered while ingesting a remote revision: the local and
/// remote sides both advanced the same record from a shared base.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, sqlx::FromRow)]
pub struct SyncConflict {
    pub id: Id,
    pub record_id: Id,
    pub local_revision: i64,
    pub remote_revision: i64,
    pub created_at: String,
}

/// The result of ingesting one remote [`SyncRecord`] into the local store.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum IngestOutcome {
    /// The record was previously unknown locally and was stored.
    New,
    /// The remote revision was newer and replaced the local one.
    Updated,
    /// Local and remote diverged at the same revision; a conflict was recorded.
    Conflict,
    /// The remote revision was older than or identical to the local one.
    Stale,
}
