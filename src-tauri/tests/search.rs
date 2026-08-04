mod support;

use support::remove_database;
use snipdock_lib::{
    commands::actions,
    db::Database,
    models::{
        ContentType, ItemFlags, ItemKind, SaveCategoryInput, SaveItemInput, SaveProjectInput,
        SaveTagInput, SearchQuery, SortOrder,
    },
    repository::Repository,
};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT_DATABASE: AtomicU64 = AtomicU64::new(0);

fn database_path(test_name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "snipdock-search-{test_name}-{}-{}.sqlite",
        std::process::id(),
        NEXT_DATABASE.fetch_add(1, Ordering::Relaxed)
    ))
}

async fn cleanup(database: Database, path: PathBuf) {
    remove_database(database, path).await;
}

fn query() -> SearchQuery {
    SearchQuery {
        text: None,
        kinds: Vec::new(),
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
        group_by: None,
    }
}

fn snippet(title: &str, content: &str) -> SaveItemInput {
    SaveItemInput {
        id: None,
        kind: ItemKind::Snippet,
        title: Some(title.into()),
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

#[tokio::test]
async fn text_search_matches_title_and_content_with_prefix_terms() {
    let path = database_path("text");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let matching = repository
        .save_item(snippet("Database migration", "run the migrator"))
        .await
        .unwrap();
    repository
        .save_item(snippet("Unrelated", "nothing here"))
        .await
        .unwrap();

    let page = actions::search_items(
        &repository,
        SearchQuery {
            text: Some("data migr".into()),
            ..query()
        },
    )
    .await
    .unwrap();

    assert_eq!(page.total, 1);
    assert_eq!(page.items[0].id, matching.id);

    cleanup(database, path).await;
}

#[tokio::test]
async fn developer_punctuation_stays_searchable() {
    let path = database_path("developer-punctuation");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let values = ["user_id", "C++", ".env", "/api/v1", "npm@latest", "foo.bar"];
    let mut ids = Vec::new();
    for (index, value) in values.iter().enumerate() {
        ids.push(
            repository
                .save_item(SaveItemInput {
                    title: Some(format!("Developer sample {index}")),
                    content: (*value).into(),
                    ..snippet("", "")
                })
                .await
                .unwrap()
                .id,
        );
    }

    for (value, id) in values.into_iter().zip(ids) {
        let page = actions::search_items(
            &repository,
            SearchQuery {
                text: Some(value.into()),
                ..query()
            },
        )
        .await
        .unwrap();
        assert!(
            page.items.iter().any(|item| item.id == id),
            "{value} should match its exact developer text"
        );
    }

    cleanup(database, path).await;
}

#[tokio::test]
async fn punctuation_and_quoted_phrases_match_literal_text() {
    let path = database_path("literal-search");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let exact = repository
        .save_item(snippet("Exact", "use foo.bar then deploy api"))
        .await
        .unwrap();
    let loose = repository
        .save_item(snippet("Loose", "foo can appear before bar and deploy the api"))
        .await
        .unwrap();

    for text in ["foo.bar", "\"deploy api\""] {
        let page = actions::search_items(
            &repository,
            SearchQuery {
                text: Some(text.into()),
                ..query()
            },
        )
        .await
        .unwrap();
        assert_eq!(page.items.iter().map(|item| &item.id).collect::<Vec<_>>(), vec![&exact.id]);
        assert!(!page.items.iter().any(|item| item.id == loose.id));
    }

    cleanup(database, path).await;
}

#[tokio::test]
async fn kind_and_content_type_filters_narrow_results() {
    let path = database_path("kind-content-type");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let clipboard = repository
        .save_clipboard_item("captured text".into(), ContentType::PlainText)
        .await
        .unwrap();
    let json_snippet = repository
        .save_item(snippet("Config", "{\"key\":1}"))
        .await
        .unwrap();

    actions::set_item_flags(
        &repository,
        &json_snippet.id,
        ItemFlags {
            pinned: None,
            favorite: None,
            archived: None,
        },
    )
    .await
    .unwrap();
    sqlx::query("UPDATE items SET content_type = 'json' WHERE id = ?")
        .bind(&json_snippet.id)
        .execute(database.pool())
        .await
        .unwrap();

    let kind_page = actions::search_items(
        &repository,
        SearchQuery {
            kinds: vec![ItemKind::Clipboard],
            ..query()
        },
    )
    .await
    .unwrap();
    assert_eq!(kind_page.total, 1);
    assert_eq!(kind_page.items[0].id, clipboard.id);

    let content_type_page = actions::search_items(
        &repository,
        SearchQuery {
            content_types: vec![ContentType::Json],
            ..query()
        },
    )
    .await
    .unwrap();
    assert_eq!(content_type_page.total, 1);
    assert_eq!(content_type_page.items[0].id, json_snippet.id);

    cleanup(database, path).await;
}

#[tokio::test]
async fn language_project_category_and_tag_filters_match_exact_assignment() {
    let path = database_path("language-project-category-tag");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let project = actions::save_project(
        &repository,
        SaveProjectInput {
            id: None,
            name: "Website".into(),
            description: None,
            tag_ids: Vec::new(),
            archived: None,
        },
    )
    .await
    .unwrap();
    let category = actions::save_category(
        &repository,
        SaveCategoryInput { id: None, name: "Frontend".into() },
    )
    .await
    .unwrap();
    let tag = actions::save_tag(
        &repository,
        SaveTagInput { id: None, name: "Rust".into(), color: "#1d4ed8".into() },
    )
    .await
    .unwrap();

    let matching = repository
        .save_item(SaveItemInput {
            project_id: Some(project.id.clone()),
            category_id: Some(category.id.clone()),
            tag_ids: vec![tag.id.clone()],
            ..snippet("Server", "fn main() {}")
        })
        .await
        .unwrap();
    repository
        .save_item(snippet("Other", "no assignment"))
        .await
        .unwrap();

    sqlx::query("UPDATE items SET language = 'rust' WHERE id = ?")
        .bind(&matching.id)
        .execute(database.pool())
        .await
        .unwrap();

    let language_page = actions::search_items(
        &repository,
        SearchQuery { languages: vec!["rust".into()], ..query() },
    )
    .await
    .unwrap();
    assert_eq!(language_page.total, 1);
    assert_eq!(language_page.items[0].id, matching.id);

    let project_page = actions::search_items(
        &repository,
        SearchQuery { project_ids: vec![project.id.clone()], ..query() },
    )
    .await
    .unwrap();
    assert_eq!(project_page.total, 1);
    assert_eq!(project_page.items[0].id, matching.id);

    let category_page = actions::search_items(
        &repository,
        SearchQuery { category_ids: vec![category.id.clone()], ..query() },
    )
    .await
    .unwrap();
    assert_eq!(category_page.total, 1);
    assert_eq!(category_page.items[0].id, matching.id);

    let tag_page = actions::search_items(
        &repository,
        SearchQuery { tag_ids: vec![tag.id.clone()], ..query() },
    )
    .await
    .unwrap();
    assert_eq!(tag_page.total, 1);
    assert_eq!(tag_page.items[0].id, matching.id);

    cleanup(database, path).await;
}

#[tokio::test]
async fn pinned_and_favorite_filters_match_flags() {
    let path = database_path("pinned-favorite");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let pinned = repository
        .save_item(snippet("Pinned", "content one"))
        .await
        .unwrap();
    let favorite = repository
        .save_item(snippet("Favorite", "content two"))
        .await
        .unwrap();

    actions::set_item_flags(
        &repository,
        &pinned.id,
        ItemFlags { pinned: Some(true), favorite: None, archived: None },
    )
    .await
    .unwrap();
    actions::set_item_flags(
        &repository,
        &favorite.id,
        ItemFlags { pinned: None, favorite: Some(true), archived: None },
    )
    .await
    .unwrap();

    let pinned_page = actions::search_items(
        &repository,
        SearchQuery { pinned: Some(true), ..query() },
    )
    .await
    .unwrap();
    assert_eq!(pinned_page.total, 1);
    assert_eq!(pinned_page.items[0].id, pinned.id);

    let favorite_page = actions::search_items(
        &repository,
        SearchQuery { favorite: Some(true), ..query() },
    )
    .await
    .unwrap();
    assert_eq!(favorite_page.total, 1);
    assert_eq!(favorite_page.items[0].id, favorite.id);

    cleanup(database, path).await;
}

#[tokio::test]
async fn created_date_range_excludes_items_outside_bounds() {
    let path = database_path("date-range");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let old = repository.save_item(snippet("Old", "old content")).await.unwrap();
    let recent = repository
        .save_item(snippet("Recent", "recent content"))
        .await
        .unwrap();

    sqlx::query("UPDATE items SET created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?")
        .bind(&old.id)
        .execute(database.pool())
        .await
        .unwrap();
    sqlx::query("UPDATE items SET created_at = '2026-01-01T00:00:00.000Z' WHERE id = ?")
        .bind(&recent.id)
        .execute(database.pool())
        .await
        .unwrap();

    let page = actions::search_items(
        &repository,
        SearchQuery {
            created_from: Some("2025-01-01T00:00:00Z".into()),
            created_to: Some("2026-12-31T23:59:59Z".into()),
            ..query()
        },
    )
    .await
    .unwrap();

    assert_eq!(page.total, 1);
    assert_eq!(page.items[0].id, recent.id);

    cleanup(database, path).await;
}

#[tokio::test]
async fn sort_orders_control_result_ordering() {
    let path = database_path("sort");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let first = repository.save_item(snippet("First", "alpha")).await.unwrap();
    let second = repository.save_item(snippet("Second", "beta")).await.unwrap();

    sqlx::query("UPDATE items SET usage_count = 5 WHERE id = ?")
        .bind(&first.id)
        .execute(database.pool())
        .await
        .unwrap();

    let newest = actions::search_items(&repository, SearchQuery { sort: SortOrder::Newest, ..query() })
        .await
        .unwrap();
    assert_eq!(newest.items[0].id, second.id);
    assert_eq!(newest.items[1].id, first.id);

    let oldest = actions::search_items(&repository, SearchQuery { sort: SortOrder::Oldest, ..query() })
        .await
        .unwrap();
    assert_eq!(oldest.items[0].id, first.id);
    assert_eq!(oldest.items[1].id, second.id);

    let most_used = actions::search_items(
        &repository,
        SearchQuery { sort: SortOrder::MostUsed, ..query() },
    )
    .await
    .unwrap();
    assert_eq!(most_used.items[0].id, first.id);
    assert_eq!(most_used.items[1].id, second.id);

    cleanup(database, path).await;
}

#[tokio::test]
async fn paging_limits_and_offsets_results() {
    let path = database_path("paging");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    for index in 0..5 {
        repository
            .save_item(snippet(&format!("Item {index}"), "shared content"))
            .await
            .unwrap();
    }

    let first_page = actions::search_items(
        &repository,
        SearchQuery { limit: 2, offset: 0, ..query() },
    )
    .await
    .unwrap();
    assert_eq!(first_page.total, 5);
    assert_eq!(first_page.items.len(), 2);

    let second_page = actions::search_items(
        &repository,
        SearchQuery { limit: 2, offset: 2, ..query() },
    )
    .await
    .unwrap();
    assert_eq!(second_page.items.len(), 2);
    assert_ne!(first_page.items[0].id, second_page.items[0].id);

    cleanup(database, path).await;
}

#[tokio::test]
async fn archived_and_deleted_items_are_excluded_from_results() {
    let path = database_path("archived-deleted");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let archived = repository.save_item(snippet("Archived", "content")).await.unwrap();
    let deleted = repository.save_item(snippet("Deleted", "content")).await.unwrap();
    let active = repository.save_item(snippet("Active", "content")).await.unwrap();

    actions::set_item_flags(
        &repository,
        &archived.id,
        ItemFlags { pinned: None, favorite: None, archived: Some(true) },
    )
    .await
    .unwrap();
    actions::delete_item(&repository, &deleted.id).await.unwrap();

    let page = actions::search_items(&repository, query()).await.unwrap();

    assert_eq!(page.total, 1);
    assert_eq!(page.items[0].id, active.id);

    cleanup(database, path).await;
}
