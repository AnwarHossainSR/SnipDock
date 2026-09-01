mod support;

use support::remove_database;
use snipdock_lib::{
    db::Database,
    models::{ContentType, ItemKind, SaveItemInput},
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

/// Clearing scoped to images must leave every text capture where it is, and
/// still restore as one receipt.
#[tokio::test]
async fn clearing_images_leaves_text_captures_untouched() {
    let path = database_path("clear-images");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let text = repository
        .save_item(item(ItemKind::Clipboard, "a note to keep"))
        .await
        .unwrap();
    let mut screenshot = item(ItemKind::Clipboard, "images/abc123.png");
    screenshot.content_type = ContentType::Image;
    let image = repository.save_item(screenshot).await.unwrap();

    let receipt = repository
        .clear_clipboard_history_with_options(false, false, &[ContentType::Image], None)
        .await
        .unwrap();

    assert_eq!(receipt.item_count, 1);
    let remaining = repository.list_clipboard_items(100, 0).await.unwrap();
    assert_eq!(remaining.total, 1);
    assert_eq!(remaining.items[0].id, text.id);

    repository.restore_item(&receipt.id).await.unwrap();
    assert_eq!(
        repository.list_clipboard_items(100, 0).await.unwrap().total,
        2
    );
    assert!(repository.get_item(&image.id).await.is_ok());

    cleanup(database, path).await;
}

/// A scoped clear with nothing of that type must report "not found" rather than
/// opening an empty receipt, so the UI can say nothing was cleared.
#[tokio::test]
async fn clearing_images_with_no_images_reports_not_found() {
    let path = database_path("clear-images-empty");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    repository
        .save_item(item(ItemKind::Clipboard, "text only"))
        .await
        .unwrap();

    let result = repository
        .clear_clipboard_history_with_options(false, false, &[ContentType::Image], None)
        .await;

    assert!(matches!(result, Err(RepositoryError::NotFound)));
    assert_eq!(
        repository.list_clipboard_items(100, 0).await.unwrap().total,
        1
    );

    cleanup(database, path).await;
}

/// Pinned exclusion and the type scope must combine: a pinned screenshot
/// survives an image sweep that keeps pinned items.
#[tokio::test]
async fn image_clear_still_honours_the_pinned_exclusion() {
    let path = database_path("clear-images-pinned");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let mut pinned_shot = item(ItemKind::Clipboard, "images/pinned.png");
    pinned_shot.content_type = ContentType::Image;
    let pinned = repository.save_item(pinned_shot).await.unwrap();
    repository
        .set_item_flags(
            &pinned.id,
            snipdock_lib::models::ItemFlags {
                pinned: Some(true),
                favorite: None,
                archived: None,
            },
        )
        .await
        .unwrap();
    let mut loose_shot = item(ItemKind::Clipboard, "images/loose.png");
    loose_shot.content_type = ContentType::Image;
    repository.save_item(loose_shot).await.unwrap();

    let receipt = repository
        .clear_clipboard_history_with_options(true, false, &[ContentType::Image], None)
        .await
        .unwrap();

    assert_eq!(receipt.item_count, 1);
    let remaining = repository.list_clipboard_items(100, 0).await.unwrap();
    assert_eq!(remaining.total, 1);
    assert_eq!(remaining.items[0].id, pinned.id);

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

#[tokio::test]
async fn clearing_by_age_spares_anything_captured_since() {
    let path = database_path("older-than");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let old = repository
        .save_item(item(ItemKind::Clipboard, "last month"))
        .await
        .unwrap();
    let fresh = repository
        .save_item(item(ItemKind::Clipboard, "this morning"))
        .await
        .unwrap();
    query("UPDATE items SET created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?")
        .bind(&old.id)
        .execute(database.pool())
        .await
        .unwrap();

    let receipt = repository
        .clear_clipboard_history_with_options(false, false, &[], Some(7))
        .await
        .unwrap();

    assert_eq!(receipt.item_count, 1);
    let remaining = repository.list_clipboard_items(100, 0).await.unwrap();
    assert_eq!(remaining.total, 1);
    assert_eq!(remaining.items[0].id, fresh.id);

    cleanup(database, path).await;
}

#[tokio::test]
async fn an_age_and_a_type_narrow_the_same_sweep_together() {
    let path = database_path("older-images");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let old_image = repository
        .save_item(SaveItemInput {
            content_type: ContentType::Image,
            ..item(ItemKind::Clipboard, "images/old.png")
        })
        .await
        .unwrap();
    let old_text = repository
        .save_item(item(ItemKind::Clipboard, "old note"))
        .await
        .unwrap();
    let fresh_image = repository
        .save_item(SaveItemInput {
            content_type: ContentType::Image,
            ..item(ItemKind::Clipboard, "images/new.png")
        })
        .await
        .unwrap();
    for id in [&old_image.id, &old_text.id] {
        query("UPDATE items SET created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?")
            .bind(id)
            .execute(database.pool())
            .await
            .unwrap();
    }

    let receipt = repository
        .clear_clipboard_history_with_options(false, false, &[ContentType::Image], Some(7))
        .await
        .unwrap();

    // Only the capture that is both an image and old enough.
    assert_eq!(receipt.item_count, 1);
    let remaining = repository.list_clipboard_items(100, 0).await.unwrap();
    let ids: Vec<&str> = remaining.items.iter().map(|entry| entry.id.as_str()).collect();
    assert!(ids.contains(&old_text.id.as_str()));
    assert!(ids.contains(&fresh_image.id.as_str()));
    assert!(!ids.contains(&old_image.id.as_str()));

    cleanup(database, path).await;
}

#[tokio::test]
async fn an_age_that_matches_nothing_reports_not_found() {
    let path = database_path("older-empty");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    repository
        .save_item(item(ItemKind::Clipboard, "this morning"))
        .await
        .unwrap();

    let failure = repository
        .clear_clipboard_history_with_options(false, false, &[], Some(30))
        .await;

    assert!(matches!(failure, Err(RepositoryError::NotFound)));
    assert_eq!(repository.list_clipboard_items(100, 0).await.unwrap().total, 1);

    cleanup(database, path).await;
}
