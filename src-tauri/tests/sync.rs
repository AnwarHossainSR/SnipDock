mod support;

use snipdock_lib::{
    crypto,
    db::Database,
    models::{IngestOutcome, ItemKind, LibraryItem, SaveItemInput, SyncRecord},
    repository::{Repository, RepositoryError},
};
use support::remove_database;
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT_DATABASE: AtomicU64 = AtomicU64::new(0);

const DEVICE: &str = "device-a";
const PASSPHRASE: &str = "correct horse battery staple";

fn database_path(test_name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "snipdock-sync-{test_name}-{}-{}.sqlite",
        std::process::id(),
        NEXT_DATABASE.fetch_add(1, Ordering::Relaxed)
    ))
}

fn item(content: &str, private: bool) -> SaveItemInput {
    SaveItemInput {
        id: None,
        kind: ItemKind::Note,
        title: None,
        description: None,
        content: content.into(),
        content_type: snipdock_lib::models::ContentType::PlainText,
        notes: None,
        project_id: None,
        category_id: None,
        tag_ids: Vec::new(),
        private,
        expires_at: None,
    }
}

/// Builds a record as if a second device had sealed `item` at `revision`.
fn remote_record(record_id: &str, id: &str, revision: i64, item: &LibraryItem) -> SyncRecord {
    let ciphertext = crypto::encrypt(PASSPHRASE, &serde_json::to_vec(item).unwrap()).unwrap();
    SyncRecord {
        id: id.into(),
        device_id: "device-b".into(),
        record_id: record_id.into(),
        revision,
        tombstone: false,
        ciphertext,
        updated_at: String::new(),
    }
}

#[tokio::test]
async fn stage_and_open_round_trips_a_record() {
    let path = database_path("round-trip");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let saved = repository.save_item(item("shared note", false)).await.unwrap();

    let record = repository.stage_record(DEVICE, PASSPHRASE, &saved).await.unwrap();

    assert_eq!(record.revision, 0);
    assert!(!record.tombstone);
    assert_ne!(record.ciphertext, "shared note", "payload must be encrypted at rest");
    assert_eq!(repository.staged_records().await.unwrap().len(), 1);
    assert_eq!(repository.open_record(PASSPHRASE, &record).unwrap(), Some(saved));

    remove_database(database, path).await;
}

#[tokio::test]
async fn private_items_are_refused_at_the_sync_boundary() {
    let path = database_path("private");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let secret = repository.save_item(item("secret", true)).await.unwrap();

    let error = repository.stage_record(DEVICE, PASSPHRASE, &secret).await.unwrap_err();

    assert!(matches!(error, RepositoryError::Validation(_)));
    assert!(repository.staged_records().await.unwrap().is_empty());

    remove_database(database, path).await;
}

#[tokio::test]
async fn restaging_bumps_the_revision_and_keeps_one_row() {
    let path = database_path("revision");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let saved = repository.save_item(item("v1", false)).await.unwrap();

    let first = repository.stage_record(DEVICE, PASSPHRASE, &saved).await.unwrap();
    let second = repository.stage_record(DEVICE, PASSPHRASE, &saved).await.unwrap();

    assert_eq!(first.revision, 0);
    assert_eq!(second.revision, 1);
    assert_eq!(repository.staged_records().await.unwrap().len(), 1);

    remove_database(database, path).await;
}

#[tokio::test]
async fn tombstone_opens_as_none() {
    let path = database_path("tombstone");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let saved = repository.save_item(item("doomed", false)).await.unwrap();
    repository.stage_record(DEVICE, PASSPHRASE, &saved).await.unwrap();

    let tombstone = repository.stage_tombstone(DEVICE, PASSPHRASE, &saved.id).await.unwrap();

    assert!(tombstone.tombstone);
    assert_eq!(tombstone.revision, 1);
    assert_eq!(repository.open_record(PASSPHRASE, &tombstone).unwrap(), None);

    remove_database(database, path).await;
}

#[tokio::test]
async fn ingest_stores_new_updates_newer_and_ignores_stale() {
    let path = database_path("ingest");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let first = repository.save_item(item("remote v1", false)).await.unwrap();

    let new = remote_record(&first.id, "remote-1", 0, &first);
    assert_eq!(repository.ingest_remote(&new).await.unwrap(), IngestOutcome::New);

    let mut updated_item = first.clone();
    updated_item.content = "remote v2".into();
    let updated = remote_record(&first.id, "remote-2", 1, &updated_item);
    assert_eq!(repository.ingest_remote(&updated).await.unwrap(), IngestOutcome::Updated);
    let current = repository.staged_record(&first.id).await.unwrap().unwrap();
    assert_eq!(repository.open_record(PASSPHRASE, &current).unwrap(), Some(updated_item));

    let stale = remote_record(&first.id, "remote-0", 0, &first);
    assert_eq!(repository.ingest_remote(&stale).await.unwrap(), IngestOutcome::Stale);
    assert_eq!(repository.staged_record(&first.id).await.unwrap().unwrap().revision, 1);

    remove_database(database, path).await;
}

#[tokio::test]
async fn divergent_edit_at_same_revision_records_a_conflict() {
    let path = database_path("conflict");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let saved = repository.save_item(item("base", false)).await.unwrap();
    let local = repository.stage_record(DEVICE, PASSPHRASE, &saved).await.unwrap();

    let mut divergent = saved.clone();
    divergent.content = "edited elsewhere".into();
    let remote = remote_record(&saved.id, "remote-divergent", local.revision, &divergent);

    assert_eq!(repository.ingest_remote(&remote).await.unwrap(), IngestOutcome::Conflict);
    let conflicts = repository.sync_conflicts().await.unwrap();
    assert_eq!(conflicts.len(), 1);
    assert_eq!(conflicts[0].record_id, saved.id);
    assert_eq!(conflicts[0].local_revision, local.revision);
    assert_eq!(conflicts[0].remote_revision, local.revision);
    // Local state is preserved on conflict.
    assert_eq!(repository.staged_record(&saved.id).await.unwrap().unwrap().id, local.id);

    remove_database(database, path).await;
}

#[tokio::test]
async fn wrong_passphrase_cannot_open_a_record() {
    let path = database_path("wrong-key");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let saved = repository.save_item(item("sealed", false)).await.unwrap();
    let record = repository.stage_record(DEVICE, PASSPHRASE, &saved).await.unwrap();

    let error = repository.open_record("wrong passphrase", &record).unwrap_err();

    assert!(matches!(error, RepositoryError::CorruptData(_)));

    remove_database(database, path).await;
}
