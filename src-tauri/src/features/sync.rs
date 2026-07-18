use crate::models::SyncStatus;
use uuid::Uuid;

pub fn status() -> SyncStatus {
    SyncStatus {
        enabled: false,
        device_id: Uuid::new_v4().to_string(),
        pending: 0,
        conflicts: Vec::new(),
    }
}
