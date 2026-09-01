mod support;

use support::remove_database;
use snipdock_lib::{
    commands::actions,
    db::Database,
    models::{ItemKind, SaveItemInput, SearchQuery, SortOrder},
    repository::Repository,
};
use std::{
    path::PathBuf,
    sync::{atomic::{AtomicU64, Ordering}, Arc},
};

static NEXT_DATABASE: AtomicU64 = AtomicU64::new(0);

fn database_path() -> PathBuf {
    std::env::temp_dir().join(format!(
        "snipdock-regex-{}-{}.sqlite",
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

fn query() -> SearchQuery {
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
        source_apps: Vec::new(),
        regex: None,
        regex_case_insensitive: None,
        group_by: None,
    }
}

#[tokio::test]
async fn valid_regex_returns_only_matching_rows() {
    let path = database_path();
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    repository.save_item(item("orders total: 12")).await.unwrap();
    repository.save_item(item("orders total: 99")).await.unwrap();
    repository.save_item(item("a quiet note")).await.unwrap();
    let _ = Arc::new(database.pool().clone());

    let mut q = query();
    q.regex = Some(r"orders\s+total:\s+\d+".into());
    let page = actions::search_items(&repository, q).await.unwrap();

    assert_eq!(page.total, 3);
    assert_eq!(page.items.len(), 2);
    for item in &page.items {
        assert!(item.content.starts_with("orders total:"));
    }

    remove_database(database, path).await;
}

#[tokio::test]
async fn invalid_regex_returns_typed_error_and_no_rows() {
    let path = database_path();
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    repository.save_item(item("hello world")).await.unwrap();

    let mut q = query();
    q.regex = Some("(".into()); // unmatched paren - never compiles
    let error = actions::search_items(&repository, q).await.unwrap_err();

    assert_eq!(error.code, snipdock_lib::error::ErrorCode::InvalidRegex);
    assert!(!error.message.is_empty());

    remove_database(database, path).await;
}

#[tokio::test]
async fn case_insensitive_flag_relaxes_the_match() {
    let path = database_path();
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    repository.save_item(item("Hello World")).await.unwrap();
    repository.save_item(item("a quiet note")).await.unwrap();

    // Case-sensitive: only the lowercase "hello" matches.
    let mut q = query();
    q.regex = Some("hello".into());
    let sensitive = actions::search_items(&repository, q).await.unwrap();
    assert_eq!(sensitive.items.len(), 0);
    assert_eq!(sensitive.total, 2);

    // Case-insensitive: both "Hello" and "hello" match.
    let mut q = query();
    q.regex = Some("hello".into());
    q.regex_case_insensitive = Some(true);
    let insensitive = actions::search_items(&repository, q).await.unwrap();
    assert_eq!(insensitive.items.len(), 1);
    assert_eq!(insensitive.total, 2);
    assert!(insensitive.items[0].content.to_lowercase().contains("hello"));

    remove_database(database, path).await;
}

#[tokio::test]
async fn regex_layers_on_top_of_the_fts5_pre_filter() {
    let path = database_path();
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    repository.save_item(item("apple pie recipe")).await.unwrap();
    repository.save_item(item("apple sauce recipe")).await.unwrap();
    repository.save_item(item("banana bread recipe")).await.unwrap();

    // `text` runs through the FTS5 pre-filter, narrowing the candidate set to
    // the two apple rows. The regex then trims those down to one match.
    let mut q = query();
    q.text = Some("apple".into());
    q.regex = Some(r"\bapple pie\b".into());
    let page = actions::search_items(&repository, q).await.unwrap();

    assert_eq!(page.total, 2);
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].content, "apple pie recipe");

    remove_database(database, path).await;
}
