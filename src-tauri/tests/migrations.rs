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
    let first = Database::open(&path).await.unwrap();
    // Counting what the first open applied, rather than writing the number
    // down, keeps this test from failing every time a migration is added.
    let first_migrations: i64 = query_scalar("SELECT COUNT(*) FROM _sqlx_migrations")
        .fetch_one(first.pool())
        .await
        .unwrap();
    first.close().await;

    let database = Database::open(&path).await.unwrap();
    let migration_count: i64 = query_scalar("SELECT COUNT(*) FROM _sqlx_migrations")
        .fetch_one(database.pool())
        .await
        .unwrap();
    let category_count: i64 = query_scalar("SELECT COUNT(*) FROM categories WHERE built_in = 1")
        .fetch_one(database.pool())
        .await
        .unwrap();

    assert_eq!(first_migrations, snipdock_lib::db::current_schema_version());
    assert_eq!(migration_count, first_migrations);
    assert_eq!(category_count, BUILT_IN_CATEGORIES.len() as i64);
    remove_database(database, path).await;
}

/// Stamps `_sqlx_migrations` with a version this build does not ship, which is
/// what a newer SnipDock leaves behind after it has opened the same database.
async fn record_future_migration(pool: &sqlx::SqlitePool, checksum: &[u8]) -> i64 {
    let future = snipdock_lib::db::current_schema_version() + 1;
    query(
        "INSERT INTO _sqlx_migrations
         (version, description, installed_on, success, checksum, execution_time)
         VALUES (?, 'from a newer build', CURRENT_TIMESTAMP, 1, ?, 0)",
    )
    .bind(future)
    .bind(checksum)
    .execute(pool)
    .await
    .unwrap();
    future
}

#[tokio::test]
async fn database_from_a_newer_build_still_opens() {
    let path = database_path("newer-schema");
    let database = Database::open(&path).await.unwrap();
    let future = record_future_migration(database.pool(), &[0xAB]).await;
    database.close().await;

    // Before this was handled, the migrator rejected the unknown version and
    // the app exited during setup -- with no window, so it looked like it
    // opened and stopped. A newer schema is a superset of what this build's
    // queries need, so opening is safe and being stuck is not.
    let reopened = Database::open(&path)
        .await
        .expect("a database ahead of this build should still open");

    let highest: i64 = query_scalar("SELECT MAX(version) FROM _sqlx_migrations")
        .fetch_one(reopened.pool())
        .await
        .unwrap();
    assert_eq!(highest, future);

    // The extra version must not be treated as ours to re-run or roll back.
    let count: i64 = query_scalar("SELECT COUNT(*) FROM _sqlx_migrations WHERE version = ?")
        .bind(future)
        .fetch_one(reopened.pool())
        .await
        .unwrap();
    assert_eq!(count, 1);

    remove_database(reopened, path).await;
}

#[tokio::test]
async fn a_newer_schema_does_not_excuse_a_modified_migration() {
    let path = database_path("newer-but-modified");
    let database = Database::open(&path).await.unwrap();
    record_future_migration(database.pool(), &[0xAB]).await;
    query("UPDATE _sqlx_migrations SET checksum = ? WHERE version = 1")
        .bind(vec![0u8, 1, 2])
        .execute(database.pool())
        .await
        .unwrap();
    database.close().await;

    // Tolerating extra newer versions must not tolerate a rewritten one: that
    // means the schema is not what these queries were written against.
    let error = Database::open(&path)
        .await
        .err()
        .expect("a modified migration must still fail");
    assert!(
        error.to_string().contains("does not match"),
        "unexpected error: {error}"
    );

    let _ = std::fs::remove_file(&path);
}

#[tokio::test]
async fn a_newer_schema_does_not_excuse_a_half_applied_migration() {
    let path = database_path("newer-but-dirty");
    let database = Database::open(&path).await.unwrap();
    record_future_migration(database.pool(), &[0xAB]).await;
    query("UPDATE _sqlx_migrations SET success = 0 WHERE version = 1")
        .execute(database.pool())
        .await
        .unwrap();
    database.close().await;

    // Accepting a newer schema skips the migrator, and with it the dirty check
    // it performs, so the half-applied migration has to be caught directly.
    let error = Database::open(&path)
        .await
        .err()
        .expect("a half-applied migration must fail");
    assert!(
        error.to_string().contains("half-applied"),
        "unexpected error: {error}"
    );

    let _ = std::fs::remove_file(&path);
}

#[tokio::test]
async fn a_modified_migration_fails_even_when_the_schema_is_level() {
    let path = database_path("modified-level");
    let database = Database::open(&path).await.unwrap();
    query("UPDATE _sqlx_migrations SET checksum = ? WHERE version = 1")
        .bind(vec![0u8, 1, 2])
        .execute(database.pool())
        .await
        .unwrap();
    database.close().await;

    let error = Database::open(&path)
        .await
        .err()
        .expect("an edited migration must fail when nothing is ahead");
    assert!(
        error.to_string().contains("modified"),
        "unexpected error: {error}"
    );

    let _ = std::fs::remove_file(&path);
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

/// A schema upgrade rebuilds or drops tables and cannot be undone, so the
/// database is copied before the migrator runs. Verified by rewinding a fully
/// migrated database one version and reopening it, which is exactly the shape
/// of an update that ships a new migration.
#[tokio::test]
async fn a_schema_upgrade_snapshots_the_database_first() {
    let dir = std::env::temp_dir().join(format!(
        "snipdock-upgrade-{}-{}",
        std::process::id(),
        NEXT_DATABASE.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("snipdock.sqlite");
    let backups = dir.join("backups");

    let database = Database::open(&path).await.unwrap();
    // A first open has nothing to preserve: the file was empty a moment ago.
    assert!(!backups.exists(), "a fresh database was snapshotted");
    query(
        "INSERT INTO items (id, kind, content, content_hash, pinned, created_at, updated_at) \
         VALUES ('keepsake', 'clipboard', X'6B656570', 'hash', 1, 'now', 'now')",
    )
    .execute(database.pool())
    .await
    .unwrap();
    query("DELETE FROM _sqlx_migrations WHERE version = (SELECT MAX(version) FROM _sqlx_migrations)")
        .execute(database.pool())
        .await
        .unwrap();
    database.close().await;

    let upgraded = Database::open(&path).await.unwrap();
    let applied: i64 = query_scalar("SELECT MAX(version) FROM _sqlx_migrations")
        .fetch_one(upgraded.pool())
        .await
        .unwrap();
    assert_eq!(applied, snipdock_lib::db::current_schema_version());

    let snapshots: Vec<PathBuf> = std::fs::read_dir(&backups)
        .expect("an upgrade must leave a backups directory")
        .flatten()
        .map(|entry| entry.path())
        .collect();
    assert_eq!(snapshots.len(), 1, "expected one snapshot, got {snapshots:?}");

    // The snapshot has to be a usable database holding the pre-upgrade rows,
    // not just a file of the right size.
    let restored = Database::open(&snapshots[0]).await.unwrap();
    let kept: i64 = query_scalar("SELECT COUNT(*) FROM items WHERE id = 'keepsake'")
        .fetch_one(restored.pool())
        .await
        .unwrap();
    assert_eq!(kept, 1);

    restored.close().await;
    upgraded.close().await;
    let _ = std::fs::remove_dir_all(&dir);
}
