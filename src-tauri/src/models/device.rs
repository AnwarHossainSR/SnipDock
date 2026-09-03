use serde::{Deserialize, Serialize};

/// This installation's identity in a sync group.
///
/// Generated on first launch and stable across restarts and updates. The
/// `counter` is this device's Lamport clock: monotonic, stamped onto every
/// record it writes, and advanced past the highest value seen in anything it
/// pulls, so ordering never depends on two machines agreeing about the time.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, sqlx::FromRow)]
pub struct DeviceIdentity {
    pub device_id: String,
    /// User-visible and editable in Settings; defaults to the host name.
    pub name: String,
    pub counter: i64,
    pub created_at: String,
}

/// Another device in the sync group, and how far this one has read its log.
///
/// `watermark` is the highest counter successfully pulled from that peer. A
/// steady-state pull lists from it rather than re-reading the whole prefix,
/// and compaction refuses to delete records a peer has not passed yet.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, sqlx::FromRow)]
pub struct SyncPeer {
    pub device_id: String,
    pub name: Option<String>,
    pub watermark: i64,
    pub last_seen_at: String,
}
