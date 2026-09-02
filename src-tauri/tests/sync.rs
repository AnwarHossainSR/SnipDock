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
        source_app: None,
    }
}

/// Builds a record as if a second device had sealed `item` at `revision`.
/// `counter` defaults to the revision, which is what a peer that has only ever
/// written this one record would have stamped it with.
fn remote_record(record_id: &str, id: &str, revision: i64, item: &LibraryItem) -> SyncRecord {
    let ciphertext = crypto::encrypt(PASSPHRASE, &serde_json::to_vec(item).unwrap()).unwrap();
    SyncRecord {
        id: id.into(),
        device_id: "device-b".into(),
        record_id: record_id.into(),
        revision,
        counter: revision,
        tombstone: false,
        ciphertext,
        object_key: None,
        updated_at: String::new(),
    }
}

#[tokio::test]
async fn stage_and_open_round_trips_a_record() {
    let path = database_path("round-trip");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let saved = repository.save_item(item("shared note", false)).await.unwrap();

    let record = repository.stage_record(PASSPHRASE, &saved).await.unwrap();

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

    let error = repository.stage_record(PASSPHRASE, &secret).await.unwrap_err();

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

    let first = repository.stage_record(PASSPHRASE, &saved).await.unwrap();
    let second = repository.stage_record(PASSPHRASE, &saved).await.unwrap();

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
    repository.stage_record(PASSPHRASE, &saved).await.unwrap();

    let tombstone = repository.stage_tombstone(PASSPHRASE, &saved.id).await.unwrap();

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
    let local = repository.stage_record(PASSPHRASE, &saved).await.unwrap();

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
    let record = repository.stage_record(PASSPHRASE, &saved).await.unwrap();

    let error = repository.open_record("wrong passphrase", &record).unwrap_err();

    assert!(matches!(error, RepositoryError::CorruptData(_)));

    remove_database(database, path).await;
}

// --- Device registry: identity, the Lamport clock, and peer watermarks ---

#[tokio::test]
async fn a_device_names_itself_on_first_launch_and_keeps_that_identity() {
    let path = database_path("identity");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let first = repository.device_identity().await.unwrap();
    let again = repository.device_identity().await.unwrap();

    assert!(!first.device_id.is_empty());
    assert!(!first.name.is_empty(), "a device starts with a name from the host");
    assert_eq!(first.counter, 0);
    assert_eq!(first, again, "the identity is generated once, not per call");

    remove_database(database, path).await;
}

#[tokio::test]
async fn the_device_name_is_editable_and_survives_a_reopen() {
    let path = database_path("rename");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let original = repository.device_identity().await.unwrap();

    let renamed = repository.rename_device("  Work laptop  ").await.unwrap();
    assert_eq!(renamed.name, "Work laptop", "the name is trimmed, not stored raw");
    assert_eq!(renamed.device_id, original.device_id, "renaming is not re-identifying");

    assert!(repository.rename_device("   ").await.is_err());
    assert!(repository.rename_device(&"x".repeat(65)).await.is_err());
    assert_eq!(repository.device_identity().await.unwrap().name, "Work laptop");

    database.close().await;
    let reopened = Database::open(&path).await.unwrap();
    let after = Repository::new(reopened.pool().clone()).device_identity().await.unwrap();
    assert_eq!(after.device_id, original.device_id);
    assert_eq!(after.name, "Work laptop");

    remove_database(reopened, path).await;
}

#[tokio::test]
async fn the_counter_is_monotonic_and_advances_past_anything_it_has_seen() {
    let path = database_path("counter");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    assert_eq!(repository.next_counter().await.unwrap(), 1);
    assert_eq!(repository.next_counter().await.unwrap(), 2);

    // A record pulled from a peer that has written far more than this device.
    assert_eq!(repository.observe_counter(50).await.unwrap(), 50);
    assert_eq!(
        repository.next_counter().await.unwrap(),
        51,
        "the next local write must sort after everything already seen",
    );

    // A lower value seen later never rewinds the clock.
    assert_eq!(repository.observe_counter(7).await.unwrap(), 51);
    assert_eq!(repository.next_counter().await.unwrap(), 52);

    remove_database(database, path).await;
}

#[tokio::test]
async fn a_staged_record_carries_this_device_and_its_counter() {
    let path = database_path("stamp");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let identity = repository.device_identity().await.unwrap();
    let first = repository.save_item(item("one", false)).await.unwrap();
    let second = repository.save_item(item("two", false)).await.unwrap();

    let one = repository.stage_record(PASSPHRASE, &first).await.unwrap();
    let two = repository.stage_record(PASSPHRASE, &second).await.unwrap();

    assert_eq!(one.device_id, identity.device_id);
    assert_eq!(two.device_id, identity.device_id);
    assert!(two.counter > one.counter, "each staging takes a fresh counter");
    assert_eq!(one.object_key, None, "a staged record has not been pushed yet");
    assert!(two.supersedes(&one));

    // The outbox is read in counter order so a partial push leaves a prefix.
    let staged = repository.staged_records().await.unwrap();
    assert_eq!(
        staged.iter().map(|record| record.counter).collect::<Vec<_>>(),
        vec![one.counter, two.counter],
    );

    remove_database(database, path).await;
}

#[tokio::test]
async fn a_tombstone_is_stamped_and_sealed_like_any_other_record() {
    let path = database_path("tombstone-stamp");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let identity = repository.device_identity().await.unwrap();
    let saved = repository.save_item(item("doomed", false)).await.unwrap();
    let staged = repository.stage_record(PASSPHRASE, &saved).await.unwrap();

    let tombstone = repository.stage_tombstone(PASSPHRASE, &saved.id).await.unwrap();

    assert!(tombstone.tombstone);
    assert_eq!(tombstone.device_id, identity.device_id);
    assert!(tombstone.counter > staged.counter);
    assert!(tombstone.supersedes(&staged));
    assert_ne!(tombstone.ciphertext, "", "a tombstone is sealed, not empty");

    remove_database(database, path).await;
}

#[tokio::test]
async fn peer_watermarks_only_move_forwards_and_can_be_cleared() {
    let path = database_path("watermarks");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    assert_eq!(repository.peer_watermark("device-b").await.unwrap(), 0);

    repository.set_peer_watermark("device-b", 12).await.unwrap();
    assert_eq!(repository.peer_watermark("device-b").await.unwrap(), 12);

    // A cycle that read less than a previous one has not un-read anything.
    repository.set_peer_watermark("device-b", 5).await.unwrap();
    assert_eq!(repository.peer_watermark("device-b").await.unwrap(), 12);

    repository.set_peer_watermark("device-c", 3).await.unwrap();
    let peers = repository.sync_peers().await.unwrap();
    assert_eq!(
        peers.iter().map(|peer| peer.device_id.as_str()).collect::<Vec<_>>(),
        vec!["device-b", "device-c"],
    );

    repository.clear_sync_peers().await.unwrap();
    assert!(repository.sync_peers().await.unwrap().is_empty());
    assert_eq!(repository.peer_watermark("device-b").await.unwrap(), 0);

    remove_database(database, path).await;
}

#[tokio::test]
async fn the_merge_key_orders_by_counter_and_breaks_ties_on_device_id() {
    let item = LibraryItem {
        id: "item".into(),
        ..serde_json::from_value(serde_json::json!({
            "id": "item",
            "kind": "note",
            "title": null,
            "description": null,
            "content": "x",
            "notes": null,
            "content_type": "plain_text",
            "language": null,
            "project_id": null,
            "category_id": null,
            "pinned": false,
            "favorite": false,
            "private": false,
            "tag_ids": [],
            "archived_at": null,
            "expires_at": null,
            "usage_count": 0,
            "last_used_at": null,
            "source_app": null,
            "created_at": "2026-09-02T00:00:00.000Z",
            "updated_at": "2026-09-02T00:00:00.000Z"
        }))
        .unwrap()
    };
    let mut lower = remote_record("item", "a", 0, &item);
    lower.counter = 4;
    let mut higher = remote_record("item", "b", 0, &item);
    higher.counter = 5;
    assert!(higher.supersedes(&lower));
    assert!(!lower.supersedes(&higher));

    // Same counter: the device id decides, so every device reaches the same
    // answer without asking any other.
    let mut tie_a = remote_record("item", "c", 0, &item);
    tie_a.counter = 5;
    tie_a.device_id = "device-a".into();
    let mut tie_z = remote_record("item", "d", 0, &item);
    tie_z.counter = 5;
    tie_z.device_id = "device-z".into();
    assert!(tie_z.supersedes(&tie_a));
    assert!(!tie_a.supersedes(&tie_z));
}
