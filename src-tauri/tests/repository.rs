mod support;

use support::remove_database;
use snipdock_lib::{
    db::Database,
    models::{ItemFlags, ItemKind, SaveItemInput},
    repository::{Repository, RepositoryError},
};
use sqlx::{query, query_scalar};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT_DATABASE: AtomicU64 = AtomicU64::new(0);

fn database_path(test_name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "snipdock-repository-{test_name}-{}-{}.sqlite",
        std::process::id(),
        NEXT_DATABASE.fetch_add(1, Ordering::Relaxed)
    ))
}

fn item(content: &str) -> SaveItemInput {
    SaveItemInput {
        id: None,
        kind: ItemKind::Snippet,
        title: Some("Title".into()),
        description: None,
        content: content.into(),
        notes: None,
        project_id: None,
        category_id: None,
        tag_ids: Vec::new(),
        private: false,
        expires_at: None,
    }
}

async fn cleanup(database: Database, path: PathBuf) {
    remove_database(database, path).await;
}

#[tokio::test]
async fn save_item_creates_reads_and_updates_content_and_tags() {
    let path = database_path("save");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    query(
        "INSERT INTO tags (id, name, color, created_at) \
         VALUES ('tag-rust', 'Rust', '#000000', '1970-01-01T00:00:00Z')",
    )
    .execute(database.pool())
    .await
    .unwrap();

    let mut input = item("hello");
    input.tag_ids = vec!["tag-rust".into(), "tag-rust".into()];
    let created = repository.save_item(input).await.unwrap();

    assert_eq!(repository.get_item(&created.id).await.unwrap(), created);
    assert_eq!(created.content, "hello");
    assert_eq!(created.tag_ids, vec!["tag-rust"]);
    assert!(!created.private);
    assert!(created.created_at.ends_with('Z'));
    assert_eq!(
        query_scalar::<_, String>("SELECT content_hash FROM items WHERE id = ?")
            .bind(&created.id)
            .fetch_one(database.pool())
            .await
            .unwrap(),
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
    assert_eq!(
        query_scalar::<_, i64>("SELECT COUNT(*) FROM item_tags WHERE item_id = ?")
            .bind(&created.id)
            .fetch_one(database.pool())
            .await
            .unwrap(),
        1
    );

    query("UPDATE items SET updated_at = '1970-01-01T00:00:00Z' WHERE id = ?")
        .bind(&created.id)
        .execute(database.pool())
        .await
        .unwrap();
    let mut update = item("updated");
    update.id = Some(created.id.clone());
    update.title = Some("Changed".into());
    update.private = true;
    update.tag_ids = vec!["tag-rust".into()];
    let updated = repository.save_item(update).await.unwrap();

    assert_eq!(updated.id, created.id);
    assert_eq!(updated.title.as_deref(), Some("Changed"));
    assert_eq!(updated.content, "updated");
    assert_eq!(updated.tag_ids, vec!["tag-rust"]);
    assert!(updated.private);
    assert_ne!(updated.updated_at, "1970-01-01T00:00:00Z");
    assert!(query_scalar::<_, bool>("SELECT private FROM items WHERE id = ?")
        .bind(&updated.id)
        .fetch_one(database.pool())
        .await
        .unwrap());
    assert_eq!(
        query_scalar::<_, i64>("SELECT COUNT(*) FROM item_tags WHERE item_id = ?")
            .bind(&updated.id)
            .fetch_one(database.pool())
            .await
            .unwrap(),
        1
    );

    cleanup(database, path).await;
}

#[tokio::test]
async fn save_item_rejects_empty_content_and_missing_updates() {
    let path = database_path("validation");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    assert!(matches!(
        repository.save_item(item("")).await,
        Err(RepositoryError::Validation(_))
    ));
    let mut missing = item("valid");
    missing.id = Some("missing".into());
    assert!(matches!(
        repository.save_item(missing).await,
        Err(RepositoryError::NotFound)
    ));

    cleanup(database, path).await;
}

#[tokio::test]
async fn delete_item_soft_deletes_and_restore_receipt_recovers_it() {
    let path = database_path("restore");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let created = repository.save_item(item("restorable")).await.unwrap();

    let receipt = repository.delete_item(&created.id).await.unwrap();

    assert_eq!(receipt.item_count, 1);
    assert!(receipt.expires_at.ends_with('Z'));
    assert!(matches!(
        repository.get_item(&created.id).await,
        Err(RepositoryError::NotFound)
    ));
    let restored = repository.restore_item(&receipt.id).await.unwrap();
    assert_eq!(restored.id, created.id);
    assert_eq!(restored.content, created.content);
    assert_eq!(
        query_scalar::<_, i64>("SELECT COUNT(*) FROM trash_receipts WHERE id = ?")
            .bind(&receipt.id)
            .fetch_one(database.pool())
            .await
            .unwrap(),
        0
    );

    cleanup(database, path).await;
}

#[tokio::test]
async fn set_item_flags_archives_and_unarchives_without_changing_other_flags() {
    let path = database_path("flags");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let created = repository.save_item(item("flags")).await.unwrap();

    let archived = repository
        .set_item_flags(
            &created.id,
            ItemFlags {
                pinned: Some(true),
                favorite: None,
                archived: Some(true),
            },
        )
        .await
        .unwrap();
    assert!(archived.pinned);
    assert!(!archived.favorite);
    assert!(archived.archived_at.is_some());

    let restored = repository
        .set_item_flags(
            &created.id,
            ItemFlags {
                pinned: None,
                favorite: Some(true),
                archived: Some(false),
            },
        )
        .await
        .unwrap();
    assert!(restored.pinned);
    assert!(restored.favorite);
    assert!(restored.archived_at.is_none());

    cleanup(database, path).await;
}

#[tokio::test]
async fn list_items_is_newest_first_and_caps_page_size() {
    let path = database_path("list");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let first = repository.save_item(item("first")).await.unwrap();
    let second = repository.save_item(item("second")).await.unwrap();
    let third = repository.save_item(item("third")).await.unwrap();
    repository.delete_item(&first.id).await.unwrap();

    let page = repository.list_items(Some(500), 0).await.unwrap();
    let default_page = repository.list_items(None, 0).await.unwrap();

    assert_eq!(page.limit, 200);
    assert_eq!(page.offset, 0);
    assert_eq!(page.total, 2);
    assert_eq!(page.items, vec![third, second]);
    assert_eq!(default_page.limit, 50);

    cleanup(database, path).await;
}
