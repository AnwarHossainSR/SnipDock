mod support;

use support::remove_database;
use snipdock_lib::{
    db::Database,
    models::{ContentType, ItemKind, SaveItemInput},
    repository::{duplicates::DuplicateRepository, Repository},
};
use sqlx::{query, query_scalar};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT_DATABASE: AtomicU64 = AtomicU64::new(0);

fn database_path(test_name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "snipdock-duplicates-{test_name}-{}-{}.sqlite",
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
        source_app: None,
    }
}

/// The captures the app stores start at zero uses, so a merge only has anything
/// to add up once they have been copied a few times.
async fn set_usage(pool: &sqlx::SqlitePool, id: &str, uses: i64) {
    query("UPDATE items SET usage_count = ? WHERE id = ?")
        .bind(uses)
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
}

#[tokio::test]
async fn merging_adds_the_copies_use_counts_to_the_item_that_is_kept() {
    let path = database_path("merge-usage");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let duplicates = DuplicateRepository::new(database.pool().clone());

    let keep = repository.save_item(item("deploy token")).await.unwrap();
    let first = repository.save_item(item("deploy token")).await.unwrap();
    let second = repository.save_item(item("deploy token")).await.unwrap();
    set_usage(database.pool(), &keep.id, 2).await;
    set_usage(database.pool(), &first.id, 3).await;
    set_usage(database.pool(), &second.id, 5).await;

    let removed = duplicates
        .merge_duplicates(&keep.id, &[first.id.clone(), second.id.clone()])
        .await
        .unwrap();

    assert_eq!(removed, 2);
    // 2 + 3 + 5: the merged rows are soft-deleted first, so a `deleted_at IS
    // NULL` filter in the sum would have left the kept row on its own 2.
    assert_eq!(
        query_scalar::<_, i64>("SELECT usage_count FROM items WHERE id = ?")
            .bind(&keep.id)
            .fetch_one(database.pool())
            .await
            .unwrap(),
        10
    );

    remove_database(database, path).await;
}

#[tokio::test]
async fn duplicates_are_grouped_by_content_and_singletons_are_left_out() {
    let path = database_path("find");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let duplicates = DuplicateRepository::new(database.pool().clone());

    repository.save_item(item("shared")).await.unwrap();
    repository.save_item(item("shared")).await.unwrap();
    repository.save_item(item("shared")).await.unwrap();
    repository.save_item(item("alone")).await.unwrap();

    let groups = duplicates.find_duplicates().await.unwrap();

    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0].count, 3);
    assert_eq!(groups[0].items.len(), 3);
    // One group with copies in it, not one per redundant row.
    assert_eq!(duplicates.get_duplicate_count().await.unwrap(), 1);

    remove_database(database, path).await;
}

#[tokio::test]
async fn merged_copies_stop_showing_up_as_duplicates() {
    let path = database_path("after-merge");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let duplicates = DuplicateRepository::new(database.pool().clone());

    let keep = repository.save_item(item("repeated")).await.unwrap();
    let copy = repository.save_item(item("repeated")).await.unwrap();

    duplicates
        .merge_duplicates(&keep.id, std::slice::from_ref(&copy.id))
        .await
        .unwrap();

    assert!(duplicates.find_duplicates().await.unwrap().is_empty());
    assert_eq!(duplicates.get_duplicate_count().await.unwrap(), 0);
    assert_eq!(repository.list_clipboard_items(100, 0).await.unwrap().total, 1);

    remove_database(database, path).await;
}
