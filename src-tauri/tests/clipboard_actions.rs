mod support;

use support::remove_database;
use snipdock_lib::{
    clipboard::{ClipboardMonitor, TextClipboard},
    commands::actions,
    db::Database,
    models::{
        CopyMode, ItemFlags, ItemKind, SaveItemInput, SearchQuery, SortOrder,
    },
    repository::Repository,
};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    time::Duration,
};

static NEXT_DATABASE: AtomicU64 = AtomicU64::new(0);

#[derive(Default)]
struct FakeClipboard {
    text: Mutex<Option<String>>,
}

impl FakeClipboard {
    fn write(&self, text: &str) {
        *self.text.lock().unwrap() = Some(text.to_owned());
    }
}

impl TextClipboard for FakeClipboard {
    fn read_text(&self) -> Option<String> {
        self.text.lock().unwrap().clone()
    }
}

fn database_path() -> PathBuf {
    std::env::temp_dir().join(format!(
        "snipdock-clipboard-actions-{}-{}.sqlite",
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
        notes: None,
        project_id: None,
        category_id: None,
        tag_ids: Vec::new(),
        private: false,
        expires_at: None,
    }
}

fn clipboard_query() -> SearchQuery {
    SearchQuery {
        text: None,
        kinds: vec![ItemKind::Clipboard],
        content_types: Vec::new(),
        languages: Vec::new(),
        project_ids: Vec::new(),
        category_ids: Vec::new(),
        tag_ids: Vec::new(),
        pinned: None,
        favorite: None,
        created_from: None,
        created_to: None,
        sort: SortOrder::Newest,
        limit: 100,
        offset: 0,
    }
}

#[tokio::test]
async fn search_returns_clipboard_items_newest_first() {
    let path = database_path();
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let first = repository.save_item(item("first")).await.unwrap();
    let second = repository.save_item(item("second")).await.unwrap();

    let page = actions::search_items(&repository, clipboard_query())
        .await
        .unwrap();

    assert_eq!(page.total, 2);
    assert_eq!(page.items[0].id, second.id);
    assert_eq!(page.items[1].id, first.id);

    remove_database(database, path).await;
}

#[tokio::test]
async fn copy_increments_usage_and_suppresses_recapture() {
    let path = database_path();
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let saved = repository.save_item(item("copy me")).await.unwrap();
    let clipboard = Arc::new(FakeClipboard::default());
    let (sender, receiver) = mpsc::channel();
    let monitor = ClipboardMonitor::start(clipboard.clone(), Duration::from_millis(5), move |text| {
        sender.send(text).unwrap();
    });

    let receipt = actions::copy_item(
        &repository,
        &monitor,
        &saved.id,
        CopyMode::Raw,
        |text| {
            clipboard.write(text);
            Ok(())
        },
    )
    .await
    .unwrap();

    assert_eq!(receipt.item_id, saved.id);
    assert_eq!(repository.get_item(&saved.id).await.unwrap().usage_count, 1);
    assert!(receiver.recv_timeout(Duration::from_millis(30)).is_err());

    monitor.stop();
    remove_database(database, path).await;
}

#[tokio::test]
async fn flags_and_delete_route_through_repository() {
    let path = database_path();
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let saved = repository.save_item(item("manage me")).await.unwrap();

    let updated = actions::set_item_flags(
        &repository,
        &saved.id,
        ItemFlags {
            pinned: Some(true),
            favorite: Some(true),
            archived: None,
        },
    )
    .await
    .unwrap();
    assert!(updated.pinned && updated.favorite);

    let receipt = actions::delete_item(&repository, &saved.id).await.unwrap();
    assert_eq!(receipt.item_count, 1);
    assert!(repository.get_item(&saved.id).await.is_err());

    remove_database(database, path).await;
}

#[tokio::test]
async fn tracking_toggle_pauses_resumes_and_persists() {
    let path = database_path();
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let clipboard = Arc::new(FakeClipboard::default());
    let monitor = ClipboardMonitor::start(clipboard, Duration::from_secs(60), |_| {});

    assert!(!actions::set_clipboard_tracking(&repository, &monitor, false).await.unwrap());
    assert!(monitor.is_paused());
    assert!(!repository.get_settings().await.unwrap().clipboard_tracking);
    assert!(actions::set_clipboard_tracking(&repository, &monitor, true).await.unwrap());
    assert!(!monitor.is_paused());
    assert!(repository.get_settings().await.unwrap().clipboard_tracking);

    monitor.stop();
    remove_database(database, path).await;
}
