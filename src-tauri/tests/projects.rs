use snipdock_lib::{
    commands::actions,
    db::Database,
    error::ErrorCode,
    models::{ItemKind, SaveItemInput, SaveProjectInput},
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
        "snipdock-projects-{test_name}-{}-{}.sqlite",
        std::process::id(),
        NEXT_DATABASE.fetch_add(1, Ordering::Relaxed)
    ))
}

fn project(name: &str) -> SaveProjectInput {
    SaveProjectInput {
        id: None,
        name: name.into(),
        description: Some("Client work".into()),
        tag_ids: Vec::new(),
        archived: None,
    }
}

fn snippet(title: &str, content: &str) -> SaveItemInput {
    SaveItemInput {
        id: None,
        kind: ItemKind::Snippet,
        title: Some(title.into()),
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
    database.close().await;
    std::fs::remove_file(path).unwrap();
}

#[tokio::test]
async fn create_edit_lists_projects_and_preserves_creation_and_tags() {
    let path = database_path("lifecycle");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    sqlx::query(
        "INSERT INTO tags (id, name, color, created_at) \
         VALUES ('tag-billable', 'Billable', '#123456', '1970-01-01T00:00:00Z')",
    )
    .execute(database.pool())
    .await
    .unwrap();

    let mut input = project("  Apollo  ");
    input.tag_ids = vec!["tag-billable".into(), "tag-billable".into()];
    let created = actions::save_project(&repository, input).await.unwrap();
    assert_eq!(created.name, "Apollo");
    assert_eq!(created.description.as_deref(), Some("Client work"));
    assert!(created.archived_at.is_none());
    assert_eq!(
        query_scalar::<_, i64>("SELECT COUNT(*) FROM project_tags WHERE project_id = ?")
            .bind(&created.id)
            .fetch_one(database.pool())
            .await
            .unwrap(),
        1
    );

    let mut edit = project("Apollo Mission");
    edit.id = Some(created.id.clone());
    edit.description = None;
    edit.tag_ids = Vec::new();
    let updated = actions::save_project(&repository, edit).await.unwrap();
    assert_eq!(updated.id, created.id);
    assert_eq!(updated.name, "Apollo Mission");
    assert_eq!(updated.created_at, created.created_at);
    assert!(updated.description.is_none());
    assert_eq!(
        query_scalar::<_, i64>("SELECT COUNT(*) FROM project_tags WHERE project_id = ?")
            .bind(&created.id)
            .fetch_one(database.pool())
            .await
            .unwrap(),
        0
    );

    let listed = actions::list_projects(&repository, false).await.unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, created.id);

    cleanup(database, path).await;
}

#[tokio::test]
async fn archived_projects_are_hidden_unless_requested_and_unarchive_restores() {
    let path = database_path("archive");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let active = actions::save_project(&repository, project("Active")).await.unwrap();
    let archivable = actions::save_project(&repository, project("Legacy")).await.unwrap();

    let mut archive = project("Legacy");
    archive.id = Some(archivable.id.clone());
    archive.archived = Some(true);
    let archived = actions::save_project(&repository, archive).await.unwrap();
    assert!(archived.archived_at.is_some());

    let visible = actions::list_projects(&repository, false).await.unwrap();
    assert_eq!(visible.len(), 1);
    assert_eq!(visible[0].id, active.id);

    let all = actions::list_projects(&repository, true).await.unwrap();
    assert_eq!(all.len(), 2);
    assert_eq!(all[0].id, active.id);
    assert_eq!(all[1].id, archivable.id);

    // Editing an archived project without an archived flag keeps it archived.
    let mut rename = project("Legacy Renamed");
    rename.id = Some(archivable.id.clone());
    let renamed = actions::save_project(&repository, rename).await.unwrap();
    assert!(renamed.archived_at.is_some());

    let mut unarchive = project("Legacy Renamed");
    unarchive.id = Some(archivable.id.clone());
    unarchive.archived = Some(false);
    let restored = actions::save_project(&repository, unarchive).await.unwrap();
    assert!(restored.archived_at.is_none());
    assert_eq!(actions::list_projects(&repository, false).await.unwrap().len(), 2);

    cleanup(database, path).await;
}

#[tokio::test]
async fn move_item_assigns_clears_and_records_project_activity() {
    let path = database_path("move");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let project = actions::save_project(&repository, project("Docs")).await.unwrap();
    let item = repository.save_item(snippet("Setup", "bun install")).await.unwrap();
    assert!(item.project_id.is_none());

    let assigned = actions::move_item(&repository, &item.id, Some(&project.id))
        .await
        .unwrap();
    assert_eq!(assigned.project_id.as_deref(), Some(project.id.as_str()));
    assert!(assigned.updated_at >= item.updated_at);

    let cleared = actions::move_item(&repository, &item.id, None).await.unwrap();
    assert!(cleared.project_id.is_none());

    assert_eq!(
        query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM activity WHERE item_id = ? AND action = 'move_item'"
        )
        .bind(&item.id)
        .fetch_one(database.pool())
        .await
        .unwrap(),
        2
    );

    cleanup(database, path).await;
}

#[tokio::test]
async fn move_item_rejects_missing_item_and_unavailable_project() {
    let path = database_path("move-invalid");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let item = repository.save_item(snippet("Setup", "bun install")).await.unwrap();
    assert_eq!(
        actions::move_item(&repository, "missing", None).await.unwrap_err().code,
        ErrorCode::NotFound
    );
    assert_eq!(
        actions::move_item(&repository, &item.id, Some("ghost"))
            .await
            .unwrap_err()
            .code,
        ErrorCode::Validation
    );

    let mut archived = project("Closed");
    archived.archived = Some(true);
    let closed = actions::save_project(&repository, archived).await.unwrap();
    assert_eq!(
        actions::move_item(&repository, &item.id, Some(&closed.id))
            .await
            .unwrap_err()
            .code,
        ErrorCode::Validation
    );

    cleanup(database, path).await;
}

#[tokio::test]
async fn save_project_rejects_invalid_name_and_description() {
    let path = database_path("validation");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let mut cases = Vec::new();
    cases.push(project("   "));
    cases.push(project(&"x".repeat(201)));
    let mut long_description = project("Valid");
    long_description.description = Some("x".repeat(1_001));
    cases.push(long_description);

    for invalid in cases {
        assert!(matches!(
            repository.save_project(invalid).await,
            Err(RepositoryError::Validation(_))
        ));
    }

    let unicode = "\u{1F680}".repeat(200);
    let ok = repository.save_project(project(&unicode)).await.unwrap();
    assert_eq!(ok.name, unicode);

    cleanup(database, path).await;
}
