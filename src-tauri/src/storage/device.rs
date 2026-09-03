use super::{Repository, RepositoryError, RepositoryResult};
use crate::models::{DeviceIdentity, SyncPeer};
use uuid::Uuid;

/// The device registry: this installation's identity and Lamport clock, and
/// how far it has read each peer's log.
///
/// Ordering across devices is the counter, not wall-clock time — see
/// `migrations/0008_device_registry.sql` for why. Every method that moves the
/// counter does so in a single statement so two concurrent stagings cannot be
/// handed the same value.
impl Repository {
    /// This device's identity, generated on the first call and stable
    /// afterwards. The default name comes from the host; the user can change
    /// it in Settings.
    pub async fn device_identity(&self) -> RepositoryResult<DeviceIdentity> {
        if let Some(identity) = self.stored_identity().await? {
            return Ok(identity);
        }
        // `OR IGNORE` rather than a check-then-insert: two callers racing for
        // the first identity must end up with the same one, not two.
        sqlx::query(
            "INSERT OR IGNORE INTO sync_device (id, device_id, name, counter, created_at) \
             VALUES (1, ?, ?, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(crate::os::host_name())
        .execute(&self.pool)
        .await?;
        self.stored_identity().await?.ok_or(RepositoryError::NotFound)
    }

    /// Renames this device. The name is only ever a label for the user, so the
    /// only rule is that it is not blank.
    pub async fn rename_device(&self, name: &str) -> RepositoryResult<DeviceIdentity> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(RepositoryError::Validation("a device name is required"));
        }
        if trimmed.chars().count() > 64 {
            return Err(RepositoryError::Validation(
                "a device name must be 64 characters or fewer",
            ));
        }
        self.device_identity().await?;
        sqlx::query("UPDATE sync_device SET name = ? WHERE id = 1")
            .bind(trimmed)
            .execute(&self.pool)
            .await?;
        self.stored_identity().await?.ok_or(RepositoryError::NotFound)
    }

    /// Takes the next counter value for a record this device is about to
    /// write. Monotonic: every call returns a value strictly greater than the
    /// one before it, so no two records from this device ever share a stamp.
    pub async fn next_counter(&self) -> RepositoryResult<i64> {
        self.device_identity().await?;
        let (counter,): (i64,) =
            sqlx::query_as("UPDATE sync_device SET counter = counter + 1 WHERE id = 1 RETURNING counter")
                .fetch_one(&self.pool)
                .await?;
        Ok(counter)
    }

    /// Advances the clock past a counter seen in a pulled record, which is
    /// what makes the ordering a Lamport clock rather than a private
    /// sequence: after this, anything this device writes sorts after
    /// everything it has already seen. Lower values are ignored, so the
    /// counter never goes backwards.
    pub async fn observe_counter(&self, seen: i64) -> RepositoryResult<i64> {
        self.device_identity().await?;
        let (counter,): (i64,) = sqlx::query_as(
            "UPDATE sync_device SET counter = MAX(counter, ?) WHERE id = 1 RETURNING counter",
        )
        .bind(seen.max(0))
        .fetch_one(&self.pool)
        .await?;
        Ok(counter)
    }

    /// Every peer this device has pulled from, and how far it read.
    pub async fn sync_peers(&self) -> RepositoryResult<Vec<SyncPeer>> {
        let peers = sqlx::query_as::<_, SyncPeer>(
            "SELECT device_id, name, watermark, last_seen_at FROM sync_peers ORDER BY device_id",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(peers)
    }

    /// How far this device has read `device_id`'s log. Zero for a peer it has
    /// never seen, which reads the peer's whole prefix on the first pull.
    pub async fn peer_watermark(&self, device_id: &str) -> RepositoryResult<i64> {
        let row: Option<(i64,)> =
            sqlx::query_as("SELECT watermark FROM sync_peers WHERE device_id = ?")
                .bind(device_id)
                .fetch_optional(&self.pool)
                .await?;
        Ok(row.map(|(watermark,)| watermark).unwrap_or(0))
    }

    /// Records that this device has read `device_id`'s log up to `watermark`.
    /// Never moves a mark backwards: a cycle that read less than a previous
    /// one has not un-read anything.
    pub async fn set_peer_watermark(
        &self,
        device_id: &str,
        watermark: i64,
    ) -> RepositoryResult<()> {
        sqlx::query(
            "INSERT INTO sync_peers (device_id, name, watermark, last_seen_at) \
             VALUES (?, NULL, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) \
             ON CONFLICT(device_id) DO UPDATE SET \
               watermark = MAX(sync_peers.watermark, excluded.watermark), \
               last_seen_at = excluded.last_seen_at",
        )
        .bind(device_id)
        .bind(watermark.max(0))
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Forgets every peer and every watermark, so the next pull reads each
    /// log from the beginning. Used when leaving a sync group.
    pub async fn clear_sync_peers(&self) -> RepositoryResult<()> {
        sqlx::query("DELETE FROM sync_peers").execute(&self.pool).await?;
        Ok(())
    }

    async fn stored_identity(&self) -> RepositoryResult<Option<DeviceIdentity>> {
        let identity = sqlx::query_as::<_, DeviceIdentity>(
            "SELECT device_id, name, counter, created_at FROM sync_device WHERE id = 1",
        )
        .fetch_optional(&self.pool)
        .await?;
        Ok(identity)
    }
}
