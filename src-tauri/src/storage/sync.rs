use super::{Repository, RepositoryError, RepositoryResult};
use crate::features::security;
use crate::models::{IngestOutcome, LibraryItem, SyncConflict, SyncRecord};
use uuid::Uuid;

/// Transport-agnostic staging engine for cross-device sync.
///
/// These methods maintain the encrypted `sync_records` outbox and the
/// `sync_conflicts` log without any knowledge of how records reach another
/// device. Every payload is sealed with [`crate::crypto::encrypt`] before it
/// touches the database, and private items are refused at the boundary so they
/// can never be staged for sync.
impl Repository {
    /// Seals `item` under `passphrase` and stages it as the current revision
    /// for its record. Returns an error for private items, which must never
    /// leave the local security boundary.
    pub async fn stage_record(
        &self,
        device_id: &str,
        passphrase: &str,
        item: &LibraryItem,
    ) -> RepositoryResult<SyncRecord> {
        security::reject_private(item.private).map_err(|_| {
            RepositoryError::Validation("private records cannot leave the local security boundary")
        })?;
        let payload = serde_json::to_vec(item)
            .map_err(|_| RepositoryError::CorruptData("could not serialize sync payload"))?;
        let ciphertext = crate::crypto::encrypt(passphrase, &payload)
            .map_err(|_| RepositoryError::CorruptData("could not seal sync record"))?;
        self.write_staged(device_id, &item.id, false, &ciphertext).await
    }

    /// Stages a tombstone marking `record_id` as deleted. The ciphertext seals
    /// an empty payload so the row stays indistinguishable in size from a real
    /// record while carrying no plaintext.
    pub async fn stage_tombstone(
        &self,
        device_id: &str,
        passphrase: &str,
        record_id: &str,
    ) -> RepositoryResult<SyncRecord> {
        let ciphertext = crate::crypto::encrypt(passphrase, &[])
            .map_err(|_| RepositoryError::CorruptData("could not seal sync tombstone"))?;
        self.write_staged(device_id, record_id, true, &ciphertext).await
    }

    /// Returns every staged record, newest first — the outbox a transport would
    /// push to peers.
    pub async fn staged_records(&self) -> RepositoryResult<Vec<SyncRecord>> {
        let records = sqlx::query_as::<_, SyncRecord>(
            "SELECT id, device_id, record_id, revision, tombstone, ciphertext, updated_at \
             FROM sync_records ORDER BY updated_at DESC, record_id ASC",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(records)
    }

    /// Opens a staged or remote record, returning its plaintext item. Returns
    /// `None` for a tombstone. Fails if `passphrase` is wrong or the ciphertext
    /// has been tampered with.
    pub fn open_record(
        &self,
        passphrase: &str,
        record: &SyncRecord,
    ) -> RepositoryResult<Option<LibraryItem>> {
        if record.tombstone {
            return Ok(None);
        }
        let plaintext = crate::crypto::decrypt(passphrase, &record.ciphertext)
            .map_err(|_| RepositoryError::CorruptData("could not open sync record"))?;
        let item = serde_json::from_slice(&plaintext)
            .map_err(|_| RepositoryError::CorruptData("sync payload is not a library item"))?;
        Ok(Some(item))
    }

    /// Reconciles one incoming remote record against local state, using
    /// revisions to decide the outcome:
    ///
    /// - unknown record → stored ([`IngestOutcome::New`]);
    /// - strictly newer remote revision → replaces local ([`IngestOutcome::Updated`]);
    /// - same revision but a different write → logged in `sync_conflicts`
    ///   ([`IngestOutcome::Conflict`]), local kept;
    /// - older or identical write → ignored ([`IngestOutcome::Stale`]).
    pub async fn ingest_remote(&self, remote: &SyncRecord) -> RepositoryResult<IngestOutcome> {
        let local = self.staged_record(&remote.record_id).await?;
        match local {
            None => {
                self.replace_record(remote).await?;
                Ok(IngestOutcome::New)
            }
            Some(local) if remote.revision > local.revision => {
                self.replace_record(remote).await?;
                Ok(IngestOutcome::Updated)
            }
            Some(local) if remote.revision == local.revision && remote.id != local.id => {
                self.record_conflict(&remote.record_id, local.revision, remote.revision).await?;
                Ok(IngestOutcome::Conflict)
            }
            Some(_) => Ok(IngestOutcome::Stale),
        }
    }

    /// Returns the current staged record for `record_id`, if any.
    pub async fn staged_record(&self, record_id: &str) -> RepositoryResult<Option<SyncRecord>> {
        let record = sqlx::query_as::<_, SyncRecord>(
            "SELECT id, device_id, record_id, revision, tombstone, ciphertext, updated_at \
             FROM sync_records WHERE record_id = ?",
        )
        .bind(record_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(record)
    }

    /// Returns unresolved conflicts, newest first.
    pub async fn sync_conflicts(&self) -> RepositoryResult<Vec<SyncConflict>> {
        let conflicts = sqlx::query_as::<_, SyncConflict>(
            "SELECT id, record_id, local_revision, remote_revision, created_at \
             FROM sync_conflicts ORDER BY created_at DESC, record_id ASC",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(conflicts)
    }

    async fn write_staged(
        &self,
        device_id: &str,
        record_id: &str,
        tombstone: bool,
        ciphertext: &str,
    ) -> RepositoryResult<SyncRecord> {
        let next_revision = self
            .staged_record(record_id)
            .await?
            .map(|record| record.revision + 1)
            .unwrap_or(0);
        let record = SyncRecord {
            id: Uuid::new_v4().to_string(),
            device_id: device_id.to_string(),
            record_id: record_id.to_string(),
            revision: next_revision,
            tombstone,
            ciphertext: ciphertext.to_string(),
            updated_at: String::new(),
        };
        self.replace_record(&record).await?;
        self.staged_record(record_id)
            .await?
            .ok_or(RepositoryError::NotFound)
    }

    /// Upserts the single current row for a record: one `sync_records` row per
    /// `record_id` holds the latest known revision.
    async fn replace_record(&self, record: &SyncRecord) -> RepositoryResult<()> {
        let mut transaction = self.pool.begin().await?;
        sqlx::query("DELETE FROM sync_records WHERE record_id = ?")
            .bind(&record.record_id)
            .execute(&mut *transaction)
            .await?;
        sqlx::query(
            "INSERT INTO sync_records \
             (id, device_id, record_id, revision, tombstone, ciphertext, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        )
        .bind(&record.id)
        .bind(&record.device_id)
        .bind(&record.record_id)
        .bind(record.revision)
        .bind(record.tombstone)
        .bind(&record.ciphertext)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(())
    }

    async fn record_conflict(
        &self,
        record_id: &str,
        local_revision: i64,
        remote_revision: i64,
    ) -> RepositoryResult<()> {
        sqlx::query(
            "INSERT INTO sync_conflicts \
             (id, record_id, local_revision, remote_revision, created_at) \
             VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(record_id)
        .bind(local_revision)
        .bind(remote_revision)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}
