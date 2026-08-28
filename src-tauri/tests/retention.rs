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
