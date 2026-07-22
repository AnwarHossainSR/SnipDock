mod support;

use support::remove_database;
use snipdock_lib::{
    db::Database,
    models::{ItemKind, SaveItemInput},
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
        "snipdock-trash-{test_name}-{}-{}.sqlite",
        std::process::id(),
        NEXT_DATABASE.fetch_add(1, Ordering::Relaxed)
    ))
}

fn item(kind: ItemKind, content: &str) -> SaveItemInput {
    SaveItemInput {
        id: None,
        kind,
        title: None,
        description: None,
        content: content.into(),
        content_type: snipdock_lib::models::ContentType::PlainText,
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
async fn clear_receipt_counts_and_restores_all_active_clipboard_items() {
    let path = database_path("clear");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let first = repository
        .save_item(item(ItemKind::Clipboard, "first"))
        .await
        .unwrap();
    let second = repository
        .save_item(item(ItemKind::Clipboard, "second"))
        .await
        .unwrap();
    repository
        .save_item(item(ItemKind::Note, "keep me"))
        .await
        .unwrap();

    let receipt = repository.clear_clipboard_history().await.unwrap();

    assert_eq!(receipt.item_count, 2);
    assert_eq!(repository.list_clipboard_items(100, 0).await.unwrap().total, 0);
    assert_eq!(
        query_scalar::<_, i64>("SELECT COUNT(*) FROM trash_items WHERE receipt_id = ?")
            .bind(&receipt.id)
            .fetch_one(database.pool())
            .await
            .unwrap(),
        2
    );

    repository.restore_item(&receipt.id).await.unwrap();

    let restored = repository.list_clipboard_items(100, 0).await.unwrap();
    assert_eq!(restored.total, 2);
    assert!(restored.items.iter().any(|item| item.id == first.id));
    assert!(restored.items.iter().any(|item| item.id == second.id));

    cleanup(database, path).await;
}

#[tokio::test]
async fn receipts_expire_after_thirty_seconds_and_cleanup_purges_only_expired_trash() {
    let path = database_path("expiry");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let expired = repository
        .save_item(item(ItemKind::Clipboard, "expired"))
        .await
        .unwrap();
    let pending = repository
        .save_item(item(ItemKind::Clipboard, "pending"))
        .await
        .unwrap();
    let expired_receipt = repository.delete_item(&expired.id).await.unwrap();
    let pending_receipt = repository.delete_item(&pending.id).await.unwrap();

    let seconds: f64 = query_scalar(
        "SELECT (julianday(expires_at) - julianday(created_at)) * 86400 \
         FROM trash_receipts WHERE id = ?",
    )
    .bind(&pending_receipt.id)
    .fetch_one(database.pool())
    .await
    .unwrap();
    assert!((seconds - 30.0).abs() < 0.01);

    query("UPDATE trash_receipts SET expires_at = '1970-01-01T00:00:00Z' WHERE id = ?")
        .bind(&expired_receipt.id)
        .execute(database.pool())
        .await
        .unwrap();

    repository.cleanup_retention(1_000, 30).await.unwrap();

    assert_eq!(
        query_scalar::<_, i64>("SELECT COUNT(*) FROM items WHERE id = ?")
            .bind(&expired.id)
            .fetch_one(database.pool())
            .await
            .unwrap(),
        0
    );
    assert_eq!(
        query_scalar::<_, i64>("SELECT COUNT(*) FROM items WHERE id = ?")
            .bind(&pending.id)
            .fetch_one(database.pool())
            .await
            .unwrap(),
        1
    );
    assert!(matches!(
        repository.restore_item(&expired_receipt.id).await,
        Err(RepositoryError::NotFound)
    ));
    assert_eq!(
        repository.restore_item(&pending_receipt.id).await.unwrap().id,
        pending.id
    );

    cleanup(database, path).await;
}
