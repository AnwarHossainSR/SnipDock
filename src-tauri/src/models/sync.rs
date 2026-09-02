use super::Id;
use serde::{Deserialize, Serialize};

/// A single encrypted revision of a library record staged for cross-device
/// sync. The `ciphertext` is a self-contained token produced by
/// [`crate::crypto::encrypt`]; plaintext never touches this row.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, sqlx::FromRow)]
pub struct SyncRecord {
    pub id: Id,
    /// The device that wrote this revision. Half of the merge key, and what
    /// lets a pull skip records this device wrote itself.
    pub device_id: String,
    pub record_id: Id,
    /// Per-record revision, incremented each time this device restages the
    /// same item. Local bookkeeping; the merge compares `counter` first.
    pub revision: i64,
    /// The writing device's Lamport counter at the moment it staged this
    /// revision. `(counter, device_id)` is the total order the merge uses,
    /// because wall-clock time is not comparable across devices.
    pub counter: i64,
    pub tombstone: bool,
    pub ciphertext: String,
    /// The object this revision was uploaded as, or `None` while it is still
    /// waiting in the outbox.
    pub object_key: Option<String>,
    pub updated_at: String,
}

impl SyncRecord {
    /// The total order the merge compares: a higher counter wins, and the
    /// device id breaks a tie so every device reaches the same answer without
    /// talking to any other.
    pub fn merge_key(&self) -> (i64, &str) {
        (self.counter, self.device_id.as_str())
    }

    /// True when `self` should replace `other` as the active revision.
    pub fn supersedes(&self, other: &Self) -> bool {
        self.merge_key() > other.merge_key()
    }
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
