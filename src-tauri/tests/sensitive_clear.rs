mod support;

use support::remove_database;
use snipdock_lib::{
    db::Database,
    models::{ContentType, ItemKind, SaveItemInput},
    repository::{auto_clear::AutoClearRepository, Repository},
};
use sqlx::query;
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};

static NEXT_DATABASE: AtomicU64 = AtomicU64::new(0);

fn database_path(test_name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "snipdock-sensitive-{test_name}-{}-{}.sqlite",
        std::process::id(),
        NEXT_DATABASE.fetch_add(1, Ordering::Relaxed)
    ))
}

fn item(content: &str) -> SaveItemInput {
    SaveItemInput {
        id: None,
        kind: ItemKind::Clipboard,
        title: None,
        description: None,
        content: content.into(),
        content_type: ContentType::PlainText,
        notes: None,
        project_id: None,
        category_id: None,
        tag_ids: Vec::new(),
        private: false,
        expires_at: None,
    }
}

/// Only captures older than the cutoff are considered, and everything saved by
/// a test is seconds old, so age it by hand.
async fn age(pool: &sqlx::SqlitePool, id: &str) {
    query("UPDATE items SET created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
}

#[tokio::test]
async fn only_the_sensitive_captures_are_swept_and_the_sweep_can_be_undone() {
    let path = database_path("sweep");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let auto_clear = AutoClearRepository::new(database.pool().clone());

    let secret = repository
        .save_item(item("AWS_SECRET_ACCESS_KEY = wJalrXUtnFEMIK7MDENGbPxRfiCY"))
        .await
        .unwrap();
    let ordinary = repository.save_item(item("meeting at four")).await.unwrap();
    age(database.pool(), &secret.id).await;
    age(database.pool(), &ordinary.id).await;

    let result = auto_clear
        .clear_sensitive_items(Duration::from_secs(60))
        .await
        .unwrap();

    assert_eq!(result.cleared_count, 1);
    assert_eq!(result.cleared_ids, vec![secret.id.clone()]);
    let remaining = repository.list_clipboard_items(100, 0).await.unwrap();
    assert_eq!(remaining.total, 1);
    assert_eq!(remaining.items[0].id, ordinary.id);

    let receipt_id = result.receipt_id.expect("a sweep that removed something has a receipt");
    repository.restore_item(&receipt_id).await.unwrap();
    assert_eq!(repository.list_clipboard_items(100, 0).await.unwrap().total, 2);

    remove_database(database, path).await;
}

#[tokio::test]
async fn a_sweep_that_finds_nothing_leaves_no_receipt_behind() {
    let path = database_path("empty");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let auto_clear = AutoClearRepository::new(database.pool().clone());

    let ordinary = repository.save_item(item("shopping list")).await.unwrap();
    age(database.pool(), &ordinary.id).await;

    let result = auto_clear
        .clear_sensitive_items(Duration::from_secs(60))
        .await
        .unwrap();

    assert_eq!(result.cleared_count, 0);
    assert!(result.receipt_id.is_none());
    assert_eq!(repository.list_clipboard_items(100, 0).await.unwrap().total, 1);

    remove_database(database, path).await;
}

#[tokio::test]
async fn recent_captures_are_left_alone_until_they_age_past_the_cutoff() {
    let path = database_path("recent");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let auto_clear = AutoClearRepository::new(database.pool().clone());

    repository
        .save_item(item("github token = ghp_abcdefghijklmnopqrstuvwxyz0123456789"))
        .await
        .unwrap();

    // Just saved, so an hour-old cutoff must not reach it.
    let result = auto_clear
        .clear_sensitive_items(Duration::from_secs(3_600))
        .await
        .unwrap();

    assert_eq!(result.cleared_count, 0);
    assert_eq!(repository.list_clipboard_items(100, 0).await.unwrap().total, 1);

    remove_database(database, path).await;
}
