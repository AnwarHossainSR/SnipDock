mod support;

use support::remove_database;
use snipdock_lib::db::Database;
use sqlx::{query, query_scalar};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT_DATABASE: AtomicU64 = AtomicU64::new(0);

const BUILT_IN_CATEGORIES: [&str; 21] = [
    "API",
    "Authentication",
    "Code",
    "Commands",
    "Configuration",
    "Database",
    "Deployment",
    "Docker",
    "Documentation",
    "Environment",
    "Git",
    "JSON",
    "Kubernetes",
    "Networking",
    "Notes",
    "Regex",
    "Shell",
    "SQL",
    "Templates",
    "Testing",
    "Troubleshooting",
];

fn database_path(test_name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "snipdock-{test_name}-{}-{}.sqlite",
        std::process::id(),
        NEXT_DATABASE.fetch_add(1, Ordering::Relaxed)
    ))
}

#[tokio::test]
async fn fresh_database_has_core_schema_and_default_categories() {
    let path = database_path("fresh");
    let database = Database::open(&path).await.unwrap();

    let tables: Vec<String> = query_scalar(
        "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name",
    )
    .fetch_all(database.pool())
    .await
    .unwrap();

    for table in [
        "activity",
        "categories",
        "item_tags",
        "items",
        "items_fts",
        "project_tags",
        "projects",
        "settings",
        "tags",
        "trash_items",
        "trash_receipts",
    ] {
        assert!(tables.iter().any(|name| name == table), "missing {table}");
    }

    let indexes: Vec<String> =
        query_scalar("SELECT name FROM sqlite_master WHERE type = 'index'")
            .fetch_all(database.pool())
            .await
            .unwrap();
    for index in [
        "item_tags_tag_idx",
        "project_tags_tag_idx",
        "trash_items_item_idx",
    ] {
        assert!(indexes.iter().any(|name| name == index), "missing {index}");
    }

    let categories: Vec<String> =
        query_scalar("SELECT name FROM categories WHERE built_in = 1 ORDER BY name")
            .fetch_all(database.pool())
            .await
            .unwrap();
    assert_eq!(categories, BUILT_IN_CATEGORIES);

    remove_database(database, path).await;
}

#[tokio::test]
async fn migration_is_safe_on_second_startup() {
    let path = database_path("repeat");
    Database::open(&path).await.unwrap().close().await;

    let database = Database::open(&path).await.unwrap();
    let migration_count: i64 = query_scalar("SELECT COUNT(*) FROM _sqlx_migrations")
        .fetch_one(database.pool())
        .await
        .unwrap();
    let category_count: i64 = query_scalar("SELECT COUNT(*) FROM categories WHERE built_in = 1")
        .fetch_one(database.pool())
        .await
        .unwrap();

    assert_eq!(migration_count, 3);
    assert_eq!(category_count, 21);
    remove_database(database, path).await;
}

#[tokio::test]
async fn foreign_keys_are_enforced() {
    let path = database_path("foreign-keys");
    let database = Database::open(&path).await.unwrap();

    let enabled: i64 = query_scalar("PRAGMA foreign_keys")
        .fetch_one(database.pool())
        .await
        .unwrap();
    let result = query(
        "INSERT INTO items (id, kind, content, category_id, content_hash, created_at, updated_at) \
         VALUES ('item-1', 'clipboard', X'74657874', 'missing', 'hash', 'now', 'now')",
    )
    .execute(database.pool())
    .await;

    assert_eq!(enabled, 1);
    assert!(result.is_err());
    remove_database(database, path).await;
}

#[tokio::test]
async fn fts_tracks_item_changes_and_soft_deletes() {
    let path = database_path("fts");
    let database = Database::open(&path).await.unwrap();

    query(
        "INSERT INTO items (id, kind, title, content, content_hash, created_at, updated_at) \
         VALUES ('item-1', 'clipboard', 'Needle', X'696E697469616C', 'hash', 'now', 'now')",
    )
    .execute(database.pool())
    .await
    .unwrap();

    let initial: i64 =
        query_scalar("SELECT COUNT(*) FROM items_fts WHERE items_fts MATCH 'needle'")
            .fetch_one(database.pool())
            .await
            .unwrap();
    assert_eq!(initial, 1);

    query("UPDATE items SET title = 'Replacement', deleted_at = 'now' WHERE id = 'item-1'")
        .execute(database.pool())
        .await
        .unwrap();
    let deleted: i64 =
        query_scalar("SELECT COUNT(*) FROM items_fts WHERE items_fts MATCH 'replacement'")
            .fetch_one(database.pool())
            .await
            .unwrap();
    let stale: i64 =
        query_scalar("SELECT COUNT(*) FROM items_fts WHERE items_fts MATCH 'needle'")
            .fetch_one(database.pool())
            .await
            .unwrap();
    assert_eq!(deleted, 0);
    assert_eq!(stale, 0);

    query("UPDATE items SET deleted_at = NULL WHERE id = 'item-1'")
        .execute(database.pool())
        .await
        .unwrap();
    let restored: i64 =
        query_scalar("SELECT COUNT(*) FROM items_fts WHERE items_fts MATCH 'replacement'")
            .fetch_one(database.pool())
            .await
            .unwrap();
    assert_eq!(restored, 1);

    query("DELETE FROM items WHERE id = 'item-1'")
        .execute(database.pool())
        .await
        .unwrap();
    let removed: i64 =
        query_scalar("SELECT COUNT(*) FROM items_fts WHERE items_fts MATCH 'replacement'")
            .fetch_one(database.pool())
            .await
            .unwrap();
    assert_eq!(removed, 0);

    remove_database(database, path).await;
}

#[tokio::test]
async fn tag_names_are_unique_ignoring_case() {
    let path = database_path("tags");
    let database = Database::open(&path).await.unwrap();

    query(
        "INSERT INTO tags (id, name, color, created_at) VALUES ('tag-1', 'Rust', '#000000', 'now')",
    )
    .execute(database.pool())
    .await
    .unwrap();
    let duplicate = query(
        "INSERT INTO tags (id, name, color, created_at) VALUES ('tag-2', 'rust', '#ffffff', 'now')",
    )
    .execute(database.pool())
    .await;

    assert!(duplicate.is_err());
    remove_database(database, path).await;
}
