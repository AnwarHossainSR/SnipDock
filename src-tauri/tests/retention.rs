//! Retention deletes clipboard rows outright, so anything it takes is
//! unrecoverable -- it never passes through the trash. These tests pin down the
//! one guarantee that makes that acceptable: a pinned or favourited capture is
//! exempt from both the age cutoff and the item cap.

mod support;

use support::remove_database;

use snipdock_lib::{
    db::Database,
    models::{ContentType, ItemFlags},
    repository::Repository,
};
use sqlx::{query, query_scalar, SqlitePool};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT_DATABASE: AtomicU64 = AtomicU64::new(0);

fn database_path(test_name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "snipdock-retention-{test_name}-{}-{}.sqlite",
        std::process::id(),
        NEXT_DATABASE.fetch_add(1, Ordering::Relaxed)
    ))
}

/// Inserts a clipboard row dated `days_old` days ago. `save_clipboard_item`
/// always stamps "now", and the age cutoff is the behaviour under test.
async fn aged_item(pool: &SqlitePool, id: &str, days_old: i64, pinned: bool, favorite: bool) {
    query(
        "INSERT INTO items (id, kind, content, content_hash, pinned, favorite, created_at, updated_at) \
         VALUES (?, 'clipboard', ?, ?, ?, ?, datetime('now', ?), datetime('now', ?))",
    )
    .bind(id)
    .bind(id)
    .bind(id)
    .bind(i64::from(pinned))
    .bind(i64::from(favorite))
    .bind(format!("-{days_old} days"))
    .bind(format!("-{days_old} days"))
    .execute(pool)
    .await
    .unwrap();
}

async fn live_ids(pool: &SqlitePool) -> Vec<String> {
    query_scalar("SELECT id FROM items WHERE deleted_at IS NULL ORDER BY id")
        .fetch_all(pool)
        .await
        .unwrap()
}

#[tokio::test]
async fn age_cutoff_spares_pinned_and_favorite_captures() {
    let path = database_path("age");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    aged_item(database.pool(), "fresh", 1, false, false).await;
    aged_item(database.pool(), "stale", 90, false, false).await;
    aged_item(database.pool(), "stale-favorite", 90, false, true).await;
    aged_item(database.pool(), "stale-pinned", 90, true, false).await;

    repository.prune_clipboard_history(1_000, 30).await.unwrap();

    assert_eq!(
        live_ids(database.pool()).await,
        vec!["fresh", "stale-favorite", "stale-pinned"],
    );

    remove_database(database, path).await;
}

#[tokio::test]
async fn item_cap_spares_pinned_and_favorite_captures() {
    let path = database_path("cap");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let mut kept = Vec::new();
    for index in 0..6 {
        let item = repository
            .save_clipboard_item(format!("capture {index}"), ContentType::PlainText)
            .await
            .unwrap();
        if index < 2 {
            repository
                .set_item_flags(
                    &item.id,
                    ItemFlags {
                        pinned: Some(index == 0),
                        favorite: Some(index == 1),
                        archived: None,
                    },
                )
                .await
                .unwrap();
            kept.push(item.id);
        }
    }

    // A cap of two over six captures: without the exemption the two oldest
    // rows -- the flagged ones -- are exactly what the cap would take first.
    repository.prune_clipboard_history(2, 365).await.unwrap();

    let live = live_ids(database.pool()).await;
    for id in kept {
        assert!(live.contains(&id), "flagged capture {id} was pruned");
    }
    // Two flagged rows outside the budget, plus the two newest inside it.
    assert_eq!(live.len(), 4);

    remove_database(database, path).await;
}

/// Stamps a self-destruct time on an existing row, in the format the column
/// stores. A negative offset is already past, so the next sweep takes it.
async fn expire_in(pool: &SqlitePool, id: &str, offset: &str) {
    query("UPDATE items SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?) WHERE id = ?")
        .bind(offset)
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
}

#[tokio::test]
async fn an_expiry_that_has_passed_takes_the_capture_with_it() {
    let path = database_path("expired");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    aged_item(database.pool(), "expired", 0, false, false).await;
    aged_item(database.pool(), "later", 0, false, false).await;
    aged_item(database.pool(), "no-timer", 0, false, false).await;
    expire_in(database.pool(), "expired", "-1 minute").await;
    expire_in(database.pool(), "later", "+1 hour").await;

    assert_eq!(repository.purge_expired_items().await.unwrap(), 1);
    assert_eq!(live_ids(database.pool()).await, vec!["later", "no-timer"]);

    remove_database(database, path).await;
}

#[tokio::test]
async fn an_expiry_set_by_hand_outranks_a_pin() {
    let path = database_path("expired-pinned");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    aged_item(database.pool(), "pinned", 0, true, false).await;
    aged_item(database.pool(), "favorite", 0, false, true).await;
    expire_in(database.pool(), "pinned", "-1 minute").await;
    expire_in(database.pool(), "favorite", "-1 minute").await;

    // The age cutoff and the item cap both spare these; a timer the user set on
    // this one capture is the later, more specific instruction.
    assert_eq!(repository.purge_expired_items().await.unwrap(), 2);
    assert!(live_ids(database.pool()).await.is_empty());

    remove_database(database, path).await;
}

#[tokio::test]
async fn the_retention_sweep_runs_the_expiries_too() {
    let path = database_path("expired-sweep");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    aged_item(database.pool(), "expired", 0, false, false).await;
    expire_in(database.pool(), "expired", "-1 second").await;

    repository.cleanup_retention(1_000, 30).await.unwrap();

    assert!(live_ids(database.pool()).await.is_empty());

    remove_database(database, path).await;
}

#[tokio::test]
async fn a_timer_can_be_set_and_taken_off_again() {
    let path = database_path("set-expiry");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    aged_item(database.pool(), "item", 0, false, false).await;

    let timed = repository
        .set_item_expiry("item", Some("2099-01-01T00:00:00.000Z"))
        .await
        .unwrap();
    assert_eq!(timed.expires_at.as_deref(), Some("2099-01-01T00:00:00.000Z"));

    let cleared = repository.set_item_expiry("item", None).await.unwrap();
    assert!(cleared.expires_at.is_none());

    remove_database(database, path).await;
}

#[tokio::test]
async fn a_timestamp_that_is_not_utc_rfc_3339_is_refused() {
    let path = database_path("bad-expiry");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    aged_item(database.pool(), "item", 0, false, false).await;

    let failure = repository.set_item_expiry("item", Some("tomorrow")).await;

    assert!(failure.is_err());
    let stored: Option<String> = query_scalar("SELECT expires_at FROM items WHERE id = 'item'")
        .fetch_one(database.pool())
        .await
        .unwrap();
    assert!(stored.is_none());

    remove_database(database, path).await;
}
