mod support;

use support::remove_database;
use snipdock_lib::{
    commands::actions,
    db::Database,
    error::ErrorCode,
    models::{ContentType, ItemKind, SaveCategoryInput, SaveItemInput, SaveProjectInput, SaveTagInput},
    repository::{Repository, RepositoryError},
};
use sqlx::query_scalar;
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT_DATABASE: AtomicU64 = AtomicU64::new(0);

fn database_path(test_name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "snipdock-organization-{test_name}-{}-{}.sqlite",
        std::process::id(),
        NEXT_DATABASE.fetch_add(1, Ordering::Relaxed)
    ))
}

fn tag(name: &str, color: &str) -> SaveTagInput {
    SaveTagInput {
        id: None,
        name: name.into(),
        color: color.into(),
    }
}

fn snippet(title: &str, tag_ids: Vec<String>) -> SaveItemInput {
    SaveItemInput {
        id: None,
        kind: ItemKind::Snippet,
        title: Some(title.into()),
        description: None,
        content: "content".into(),
        content_type: snipdock_lib::models::ContentType::PlainText,
        notes: None,
        project_id: None,
        category_id: None,
        tag_ids,
        private: false,
        expires_at: None,
        source_app: None,
    }
}

async fn cleanup(database: Database, path: PathBuf) {
    remove_database(database, path).await;
}

#[tokio::test]
async fn categories_list_built_ins_and_manage_custom_entries() {
    let path = database_path("categories");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let built_ins = actions::list_categories(&repository).await.unwrap();
    assert_eq!(built_ins.len(), 21);
    assert!(built_ins.iter().all(|category| category.built_in));

    let created = actions::save_category(
        &repository,
        SaveCategoryInput { id: None, name: "  Frontend  ".into() },
    )
    .await
    .unwrap();
    assert_eq!(created.name, "Frontend");
    assert!(!created.built_in);

    let renamed = actions::save_category(
        &repository,
        SaveCategoryInput { id: Some(created.id.clone()), name: "Frontend UI".into() },
    )
    .await
    .unwrap();
    assert_eq!(renamed.name, "Frontend UI");

    // Built-in categories cannot be renamed.
    let built_in_id = built_ins[0].id.clone();
    assert_eq!(
        actions::save_category(
            &repository,
            SaveCategoryInput { id: Some(built_in_id), name: "Renamed".into() },
        )
        .await
        .unwrap_err()
        .code,
        ErrorCode::Validation
    );

    // Duplicate names are rejected (case-insensitive).
    assert_eq!(
        actions::save_category(
            &repository,
            SaveCategoryInput { id: None, name: "frontend ui".into() },
        )
        .await
        .unwrap_err()
        .code,
        ErrorCode::Validation
    );

    cleanup(database, path).await;
}

#[tokio::test]
async fn tags_create_recolor_and_reject_invalid_input() {
    let path = database_path("tags");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let created = actions::save_tag(&repository, tag("  Rust  ", "#1d4ed8")).await.unwrap();
    assert_eq!(created.name, "Rust");
    assert_eq!(created.color, "#1d4ed8");
    assert_eq!(created.usage_count, 0);

    let recolored = actions::save_tag(
        &repository,
        SaveTagInput { id: Some(created.id.clone()), name: "Rustlang".into(), color: "#abcdef".into() },
    )
    .await
    .unwrap();
    assert_eq!(recolored.name, "Rustlang");
    assert_eq!(recolored.color, "#abcdef");

    assert!(matches!(
        repository.save_tag(tag("", "#000000")).await,
        Err(RepositoryError::Validation(_))
    ));
    assert!(matches!(
        repository.save_tag(tag("Bad", "1d4ed8")).await,
        Err(RepositoryError::Validation(_))
    ));
    assert!(matches!(
        repository.save_tag(tag("Bad", "#12345g")).await,
        Err(RepositoryError::Validation(_))
    ));

    // Duplicate tag name rejected case-insensitively.
    assert_eq!(
        actions::save_tag(&repository, tag("rustlang", "#000000"))
            .await
            .unwrap_err()
            .code,
        ErrorCode::Validation
    );

    cleanup(database, path).await;
}

#[tokio::test]
async fn list_tags_orders_by_usage_across_items_and_projects() {
    let path = database_path("usage");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let popular = repository.save_tag(tag("Popular", "#111111")).await.unwrap();
    let rare = repository.save_tag(tag("Rare", "#222222")).await.unwrap();

    repository.save_item(snippet("One", vec![popular.id.clone()])).await.unwrap();
    repository.save_item(snippet("Two", vec![popular.id.clone(), rare.id.clone()])).await.unwrap();
    repository
        .save_project(SaveProjectInput {
            id: None,
            name: "Tagged".into(),
            description: None,
            tag_ids: vec![popular.id.clone()],
            archived: None,
        })
        .await
        .unwrap();

    let tags = actions::list_tags(&repository).await.unwrap();
    assert_eq!(tags[0].id, popular.id);
    assert_eq!(tags[0].usage_count, 3);
    assert_eq!(tags[1].id, rare.id);
    assert_eq!(tags[1].usage_count, 1);

    cleanup(database, path).await;
}

#[tokio::test]
async fn merge_tags_reassigns_assignments_deduplicates_and_removes_source() {
    let path = database_path("merge");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let source = repository.save_tag(tag("JS", "#333333")).await.unwrap();
    let target = repository.save_tag(tag("JavaScript", "#444444")).await.unwrap();

    // Item with both tags exercises the dedup path; item with only source moves over.
    repository
        .save_item(snippet("Both", vec![source.id.clone(), target.id.clone()]))
        .await
        .unwrap();
    repository.save_item(snippet("SourceOnly", vec![source.id.clone()])).await.unwrap();
    repository
        .save_project(SaveProjectInput {
            id: None,
            name: "Uses source".into(),
            description: None,
            tag_ids: vec![source.id.clone()],
            archived: None,
        })
        .await
        .unwrap();

    let merged = actions::merge_tags(&repository, &source.id, &target.id).await.unwrap();
    assert_eq!(merged.id, target.id);
    assert_eq!(merged.usage_count, 3);

    assert_eq!(
        query_scalar::<_, i64>("SELECT COUNT(*) FROM tags WHERE id = ?")
            .bind(&source.id)
            .fetch_one(database.pool())
            .await
            .unwrap(),
        0
    );
    assert_eq!(
        query_scalar::<_, i64>("SELECT COUNT(*) FROM item_tags WHERE tag_id = ?")
            .bind(&source.id)
            .fetch_one(database.pool())
            .await
            .unwrap(),
        0
    );

    cleanup(database, path).await;
}

#[tokio::test]
async fn merge_tags_rejects_self_merge_and_missing_tags() {
    let path = database_path("merge-invalid");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let only = repository.save_tag(tag("Only", "#555555")).await.unwrap();
    assert_eq!(
        actions::merge_tags(&repository, &only.id, &only.id).await.unwrap_err().code,
        ErrorCode::Validation
    );
    assert_eq!(
        actions::merge_tags(&repository, &only.id, "ghost").await.unwrap_err().code,
        ErrorCode::NotFound
    );

    cleanup(database, path).await;
}

#[tokio::test]
async fn tags_can_be_replaced_on_a_capture_without_rewriting_it() {
    let path = database_path("set-tags");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let item = repository
        .save_item(SaveItemInput {
            id: None,
            kind: ItemKind::Clipboard,
            title: None,
            description: None,
            content: "deploy notes".into(),
            content_type: ContentType::PlainText,
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
    let work = repository
        .save_tag(SaveTagInput { id: None, name: "work".into(), color: "#3b82f6".into() })
        .await
        .unwrap();
    let urgent = repository
        .save_tag(SaveTagInput { id: None, name: "urgent".into(), color: "#ef4444".into() })
        .await
        .unwrap();

    let tagged = repository
        .set_item_tags(&item.id, &[work.id.clone(), urgent.id.clone()])
        .await
        .unwrap();
    assert_eq!(tagged.tag_ids.len(), 2);
    assert_eq!(tagged.content, "deploy notes");

    // Replacing, not appending.
    let retagged = repository.set_item_tags(&item.id, std::slice::from_ref(&work.id)).await.unwrap();
    assert_eq!(retagged.tag_ids, vec![work.id.clone()]);

    let cleared = repository.set_item_tags(&item.id, &[]).await.unwrap();
    assert!(cleared.tag_ids.is_empty());

    remove_database(database, path).await;
}

#[tokio::test]
async fn a_tag_that_does_not_exist_is_refused_rather_than_silently_dropped() {
    let path = database_path("unknown-tag");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let item = repository
        .save_item(SaveItemInput {
            id: None,
            kind: ItemKind::Clipboard,
            title: None,
            description: None,
            content: "deploy notes".into(),
            content_type: ContentType::PlainText,
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

    let failure = repository.set_item_tags(&item.id, &["no-such-tag".to_string()]).await;

    assert!(matches!(failure, Err(RepositoryError::Validation(_))));
    assert!(repository.get_item(&item.id).await.unwrap().tag_ids.is_empty());

    remove_database(database, path).await;
}
