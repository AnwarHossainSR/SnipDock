use snipdock_lib::{
    commands::actions,
    db::Database,
    models::{
        ContentType, ItemFlags, ItemKind, SaveItemInput, SearchQuery, SortOrder,
    },
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
        "snipdock-snippets-{test_name}-{}-{}.sqlite",
        std::process::id(),
        NEXT_DATABASE.fetch_add(1, Ordering::Relaxed)
    ))
}

fn item(kind: ItemKind, title: Option<&str>, content: &str) -> SaveItemInput {
    SaveItemInput {
        id: None,
        kind,
        title: title.map(str::to_owned),
        description: Some("Reusable description".into()),
        content: content.into(),
        notes: Some("Remember this".into()),
        project_id: None,
        category_id: None,
        tag_ids: Vec::new(),
        private: false,
        expires_at: Some("2030-01-02T03:04:05Z".into()),
    }
}

async fn cleanup(database: Database, path: PathBuf) {
    database.close().await;
    std::fs::remove_file(path).unwrap();
}

#[tokio::test]
async fn commands_create_read_and_edit_snippet_metadata_without_resetting_creation() {
    let path = database_path("lifecycle");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let created = actions::save_item(
        &repository,
        item(ItemKind::Snippet, Some("Deploy"), "bun run build"),
    )
    .await
    .unwrap();
    assert_eq!(actions::get_item(&repository, &created.id).await.unwrap(), created);
    assert_eq!(created.title.as_deref(), Some("Deploy"));
    assert_eq!(created.description.as_deref(), Some("Reusable description"));
    assert_eq!(created.notes.as_deref(), Some("Remember this"));
    assert_eq!(created.expires_at.as_deref(), Some("2030-01-02T03:04:05Z"));

    let mut edit = item(ItemKind::Snippet, Some("Deploy safely"), "bun test");
    edit.id = Some(created.id.clone());
    edit.description = Some("Changed".into());
    edit.notes = Some("Changed notes".into());
    let updated = actions::save_item(&repository, edit).await.unwrap();

    assert_eq!(updated.id, created.id);
    assert_eq!(updated.created_at, created.created_at);
    assert_eq!(updated.title.as_deref(), Some("Deploy safely"));
    assert_eq!(updated.description.as_deref(), Some("Changed"));
    assert_eq!(updated.notes.as_deref(), Some("Changed notes"));
    assert_eq!(updated.content, "bun test");

    cleanup(database, path).await;
}

#[tokio::test]
async fn duplicate_copies_metadata_and_tags_but_resets_identity_flags_and_usage() {
    let path = database_path("duplicate");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    query(
        "INSERT INTO tags (id, name, color, created_at) \
         VALUES ('tag-rust', 'Rust', '#000000', '1970-01-01T00:00:00Z')",
    )
    .execute(database.pool())
    .await
    .unwrap();
    let mut input = item(ItemKind::Command, Some("Run checks"), "cargo test");
    input.tag_ids = vec!["tag-rust".into()];
    let source = repository.save_item(input).await.unwrap();
    repository.record_copy(&source.id).await.unwrap();
    repository
        .set_item_flags(
            &source.id,
            ItemFlags {
                pinned: Some(true),
                favorite: Some(true),
                archived: Some(true),
            },
        )
        .await
        .unwrap();

    let duplicate = actions::duplicate_item(&repository, &source.id)
        .await
        .unwrap();

    assert_ne!(duplicate.id, source.id);
    assert_eq!(duplicate.title.as_deref(), Some("Copy of Run checks"));
    assert_eq!(duplicate.description, source.description);
    assert_eq!(duplicate.content, source.content);
    assert_eq!(duplicate.notes, source.notes);
    assert_eq!(duplicate.expires_at, source.expires_at);
    assert!(!duplicate.pinned);
    assert!(!duplicate.favorite);
    assert!(duplicate.archived_at.is_none());
    assert_eq!(duplicate.usage_count, 0);
    assert!(duplicate.last_used_at.is_none());
    assert_eq!(
        query_scalar::<_, i64>("SELECT COUNT(*) FROM item_tags WHERE item_id = ?")
            .bind(&duplicate.id)
            .fetch_one(database.pool())
            .await
            .unwrap(),
        1
    );

    cleanup(database, path).await;
}

#[tokio::test]
async fn archive_hides_items_from_active_lists_and_usage_tracks_recent_copy() {
    let path = database_path("flags-usage");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let archived = repository
        .save_item(item(ItemKind::Snippet, Some("Old"), "old"))
        .await
        .unwrap();
    let active = repository
        .save_item(item(ItemKind::Note, None, "active"))
        .await
        .unwrap();
    repository
        .set_item_flags(
            &archived.id,
            ItemFlags {
                pinned: None,
                favorite: None,
                archived: Some(true),
            },
        )
        .await
        .unwrap();

    let copied = repository.record_copy(&active.id).await.unwrap();
    let copied = repository.record_copy(&copied.id).await.unwrap();
    let page = repository.list_items(None, 0).await.unwrap();

    assert_eq!(copied.usage_count, 2);
    assert!(copied.last_used_at.is_some());
    assert_eq!(page.total, 1);
    assert_eq!(page.items[0].id, active.id);

    cleanup(database, path).await;
}

#[tokio::test]
async fn snippet_library_query_returns_reusable_items_without_clipboard_history() {
    let path = database_path("library-query");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    repository
        .save_clipboard_item("captured".into(), ContentType::PlainText)
        .await
        .unwrap();
    let saved = repository
        .save_item(item(ItemKind::Snippet, Some("Reusable"), "snippet"))
        .await
        .unwrap();

    let page = actions::search_items(
        &repository,
        SearchQuery {
            text: None,
            kinds: vec![
                ItemKind::Snippet,
                ItemKind::Command,
                ItemKind::Template,
                ItemKind::Note,
            ],
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
        },
    )
    .await
    .unwrap();

    assert_eq!(page.total, 1);
    assert_eq!(page.items[0].id, saved.id);
    cleanup(database, path).await;
}

#[tokio::test]
async fn save_rejects_invalid_snippet_fields_and_expiry_at_repository_boundary() {
    let path = database_path("validation");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let mut cases = Vec::new();
    cases.push(item(ItemKind::Snippet, None, "content"));
    cases.push(item(ItemKind::Snippet, Some("   "), "content"));
    cases.push(item(ItemKind::Snippet, Some(&"x".repeat(201)), "content"));
    let mut description = item(ItemKind::Snippet, Some("Title"), "content");
    description.description = Some("x".repeat(1_001));
    cases.push(description);
    cases.push(item(ItemKind::Snippet, Some("Title"), ""));
    cases.push(item(
        ItemKind::Snippet,
        Some("Title"),
        &"x".repeat(1_000_001),
    ));
    let mut notes = item(ItemKind::Snippet, Some("Title"), "content");
    notes.notes = Some("x".repeat(10_001));
    cases.push(notes);
    for invalid_expiry in [
        "not-a-date",
        "2030-01-02",
        "2030-01-02T03:04:05+02:00",
        "2023-02-30T03:04:05Z",
    ] {
        let mut expiry = item(ItemKind::Snippet, Some("Title"), "content");
        expiry.expires_at = Some(invalid_expiry.into());
        cases.push(expiry);
    }

    for invalid in cases {
        assert!(matches!(
            repository.save_item(invalid).await,
            Err(RepositoryError::Validation(_))
        ));
    }

    let unicode_title = "\u{1F980}".repeat(200);
    let valid = repository
        .save_item(item(ItemKind::Snippet, Some(&unicode_title), "content"))
        .await
        .unwrap();
    assert_eq!(valid.title.as_deref(), Some(unicode_title.as_str()));
    let whitespace = repository
        .save_item(item(ItemKind::Snippet, Some("Whitespace"), "   "))
        .await
        .unwrap();
    assert_eq!(whitespace.content, "   ");
    repository
        .save_item(item(ItemKind::Command, None, "command"))
        .await
        .unwrap();
    repository
        .save_item(item(ItemKind::Note, None, "note"))
        .await
        .unwrap();

    cleanup(database, path).await;
}
