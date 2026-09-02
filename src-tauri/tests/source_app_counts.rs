mod support;

use support::remove_database;
use snipdock_lib::{
    commands::actions,
    db::Database,
    models::{ContentType, ItemKind, SaveItemInput, SourceAppCount},
    repository::Repository,
};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT_DATABASE: AtomicU64 = AtomicU64::new(0);

fn database_path(test_name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "snipdock-source-app-counts-{test_name}-{}-{}.sqlite",
        std::process::id(),
        NEXT_DATABASE.fetch_add(1, Ordering::Relaxed)
    ))
}

async fn cleanup(database: Database, path: PathBuf) {
    remove_database(database, path).await;
}

fn clipboard(content: &str, source_app: Option<&str>) -> SaveItemInput {
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
        source_app: source_app.map(str::to_owned),
    }
}

#[tokio::test]
async fn counts_group_by_source_in_descending_order() {
    let path = database_path("grouping");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    repository
        .save_item(clipboard("a", Some("Code.exe")))
        .await
        .unwrap();
    repository
        .save_item(clipboard("b", Some("Code.exe")))
        .await
        .unwrap();
    repository
        .save_item(clipboard("c", Some("firefox")))
        .await
        .unwrap();
    repository
        .save_item(clipboard("d", None))
        .await
        .unwrap();

    let counts: Vec<SourceAppCount> = actions::source_app_counts(&repository).await.unwrap();
    let by_label: HashMap<Option<String>, i64> = counts
        .iter()
        .map(|entry| (entry.source_app.clone(), entry.count))
        .collect();
    assert_eq!(by_label.get(&Some("Code.exe".to_string())).copied(), Some(2));
    assert_eq!(by_label.get(&Some("firefox".to_string())).copied(), Some(1));
    assert_eq!(by_label.get(&None).copied(), Some(1));

    // Descending by count, so the most-copied-from app comes first.
    let first = counts.first().expect("at least one source");
    assert_eq!(first.source_app.as_deref(), Some("Code.exe"));
    assert_eq!(first.count, 2);

    cleanup(database, path).await;
}

#[tokio::test]
async fn counts_returns_an_empty_list_when_no_items_exist() {
    let path = database_path("empty");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let counts: Vec<SourceAppCount> = actions::source_app_counts(&repository).await.unwrap();
    assert!(counts.is_empty());

    cleanup(database, path).await;
}
