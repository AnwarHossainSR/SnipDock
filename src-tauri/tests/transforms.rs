mod support;

use support::remove_database;
use snipdock_lib::{
    clipboard::{ClipboardMonitor, ClipboardSource},
    commands::actions::{self, ClipboardPayload},
    db::Database,
    models::{CopyMode, ItemKind, PasteFormat, SaveItemInput, Transform},
    repository::Repository,
};
use std::{
    path::PathBuf,
    sync::{atomic::{AtomicU64, Ordering}, Arc, Mutex},
    time::Duration,
};

static NEXT_DATABASE: AtomicU64 = AtomicU64::new(0);

#[derive(Default)]
struct FakeClipboard {
    text: Mutex<Option<String>>,
}

impl FakeClipboard {
    fn read(&self) -> Option<String> {
        self.text.lock().unwrap().clone()
    }
}

impl ClipboardSource for FakeClipboard {
    fn read_text(&self) -> Option<String> {
        self.read()
    }
}

fn database_path() -> PathBuf {
    std::env::temp_dir().join(format!(
        "snipdock-transform-{}-{}.sqlite",
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
        content_type: snipdock_lib::models::ContentType::PlainText,
        notes: None,
        project_id: None,
        category_id: None,
        tag_ids: Vec::new(),
        private: false,
        expires_at: None,
        source_app: None,
    }
}

#[tokio::test]
async fn transform_is_applied_to_the_copy_but_leaves_the_stored_item_alone() {
    let path = database_path();
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let saved = repository.save_item(item("  Hello World  ")).await.unwrap();
    let clipboard = Arc::new(FakeClipboard::default());
    let monitor = ClipboardMonitor::start(
        clipboard.clone(),
        Duration::from_millis(5),
        |_snapshot| {},
    );

    let _ = actions::copy_item(
        &repository,
        &monitor,
        &std::env::temp_dir(),
        &saved.id,
        CopyMode::Raw,
        PasteFormat::default(),
        Some(Transform::Trim),
        |payload| match payload {
            ClipboardPayload::Text(text) => {
                *clipboard.text.lock().unwrap() = Some(text.to_string());
                Ok(())
            }
            ClipboardPayload::Image(_) => panic!("text item produced an image payload"),
        },
    )
    .await
    .unwrap();

    // The clipboard holds the transformed text; the stored item is untouched.
    assert_eq!(clipboard.read().as_deref(), Some("Hello World"));
    let after = repository.get_item(&saved.id).await.unwrap();
    assert_eq!(after.content, "  Hello World  ");
    assert_eq!(after.usage_count, 1);

    monitor.stop();
    remove_database(database, path).await;
}

#[tokio::test]
async fn base64_encode_then_decode_round_trip_keeps_the_original() {
    let path = database_path();
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    // Store a string that is itself a valid base64 payload. Encoding it
    // produces a longer string; decoding the original recovers the same
    // bytes. That pair is the round-trip identity Quick Paste exposes.
    let original = "helloworld";
    let saved = repository.save_item(item(original)).await.unwrap();
    let clipboard = Arc::new(FakeClipboard::default());
    let monitor = ClipboardMonitor::start(
        clipboard.clone(),
        Duration::from_millis(5),
        |_snapshot| {},
    );

    // Encoding the original produces a fresh, well-formed base64 string.
    actions::copy_item(
        &repository,
        &monitor,
        &std::env::temp_dir(),
        &saved.id,
        CopyMode::Raw,
        PasteFormat::default(),
        Some(Transform::Base64Encode),
        |payload| match payload {
            ClipboardPayload::Text(text) => {
                *clipboard.text.lock().unwrap() = Some(text.to_string());
                Ok(())
            }
            ClipboardPayload::Image(_) => panic!("text item produced an image payload"),
        },
    )
    .await
    .unwrap();
    let encoded = clipboard.read().expect("encoded text was written");
    assert_eq!(encoded, base64_encode(original));

    // Replace the stored content with the encoded form and decode it. The
    // two-step round trip (encode, store, decode) is what Quick Paste users
    // actually perform, and it lands back on the original bytes.
    repository
        .save_item(SaveItemInput {
            id: Some(saved.id.clone()),
            kind: ItemKind::Clipboard,
            title: None,
            description: None,
            content: encoded.clone(),
            content_type: snipdock_lib::models::ContentType::PlainText,
            notes: None,
            project_id: None,
            category_id: None,
            tag_ids: Vec::new(),
            private: false,
            expires_at: None,
            source_app: None,
        })
        .await
        .unwrap();
    actions::copy_item(
        &repository,
        &monitor,
        &std::env::temp_dir(),
        &saved.id,
        CopyMode::Raw,
        PasteFormat::default(),
        Some(Transform::Base64Decode),
        |payload| match payload {
            ClipboardPayload::Text(text) => {
                *clipboard.text.lock().unwrap() = Some(text.to_string());
                Ok(())
            }
            ClipboardPayload::Image(_) => panic!("text item produced an image payload"),
        },
    )
    .await
    .unwrap();
    let decoded = clipboard.read().expect("decoded text was written");
    assert_eq!(decoded, original);

    monitor.stop();
    remove_database(database, path).await;
}

#[tokio::test]
async fn an_invalid_transform_rejects_without_writing_or_bumping_usage() {
    let path = database_path();
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let saved = repository.save_item(item("not base64 @@@")).await.unwrap();
    let clipboard = Arc::new(FakeClipboard::default());
    let monitor = ClipboardMonitor::start(
        clipboard.clone(),
        Duration::from_millis(5),
        |_snapshot| {},
    );

    let error = actions::copy_item(
        &repository,
        &monitor,
        &std::env::temp_dir(),
        &saved.id,
        CopyMode::Raw,
        PasteFormat::default(),
        Some(Transform::Base64Decode),
        |_payload| panic!("transform error must short-circuit before the clipboard write"),
    )
    .await
    .unwrap_err();

    assert_eq!(error.code, snipdock_lib::error::ErrorCode::Validation);
    // Nothing reached the clipboard, the monitor was never told to suppress a
    // re-capture, and the stored item's usage count stayed at zero.
    assert!(clipboard.read().is_none());
    let after = repository.get_item(&saved.id).await.unwrap();
    assert_eq!(after.usage_count, 0);

    monitor.stop();
    remove_database(database, path).await;
}

fn base64_encode(input: &str) -> String {
    use base64::Engine as _;
    use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
    BASE64_STANDARD.encode(input.as_bytes())
}
