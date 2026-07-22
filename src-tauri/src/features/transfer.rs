use crate::{
    error::{AppError, ErrorCode},
    models::{
        BackupReceipt, BackupRequest, ContentType, ExportReceipt, ExportRequest, ImportReport,
        ImportRequest, ItemKind, LibraryItem, RestoreReport, RestoreRequest, SaveItemInput,
        SearchQuery, SortOrder,
    },
    repository::Repository,
    security::sha256_hex,
};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

const SCHEMA_VERSION: u32 = 1;

#[derive(Deserialize, Serialize)]
struct ExportFile {
    schema: String,
    schema_version: u32,
    items: Vec<LibraryItem>,
}

#[derive(Deserialize, Serialize)]
struct BackupFile {
    schema: String,
    schema_version: u32,
    checksum: String,
    export: ExportFile,
}

pub async fn export_data(
    repository: &Repository,
    request: ExportRequest,
) -> Result<ExportReceipt, AppError> {
    let items = selected_items(repository, &request).await?;
    if items.iter().any(|item| item.private) {
        return Err(AppError::new(
            ErrorCode::Validation,
            "private items require an encrypted backup",
        ));
    }
    let output = match request.format.as_str() {
        "json" | "project" => serde_json::to_string_pretty(&ExportFile {
            schema: "snipdock-export-v1".into(),
            schema_version: SCHEMA_VERSION,
            items: items.clone(),
        })
        .map_err(internal)?,
        "markdown" => to_markdown(&items),
        "text" | "plain_text" => items
            .iter()
            .map(|item| item.content.as_str())
            .collect::<Vec<_>>()
            .join("\n\n---\n\n"),
        _ => {
            return Err(AppError::new(
                ErrorCode::Validation,
                "format must be json, markdown, text, or project",
            ));
        }
    };
    write_atomic(&request.path, output.as_bytes())?;
    Ok(ExportReceipt {
        path: request.path,
        item_count: items.len() as i64,
        warnings: if matches!(request.format.as_str(), "text" | "plain_text") {
            vec!["plain text export stores content only".into()]
        } else {
            Vec::new()
        },
    })
}

pub async fn import_data(
    repository: &Repository,
    request: ImportRequest,
) -> Result<ImportReport, AppError> {
    if !matches!(request.duplicate_policy.as_str(), "skip" | "keep_both" | "replace") {
        return Err(AppError::new(
            ErrorCode::Validation,
            "duplicate_policy must be skip, keep_both, or replace",
        ));
    }

    let mut warnings = Vec::new();
    let mut inputs = Vec::new();
    for path in request.paths {
        let text = fs::read_to_string(&path).map_err(storage)?;
        inputs.extend(parse_import(&path, &text, &mut warnings)?);
    }
    let mut report = repository
        .import_items(inputs, &request.duplicate_policy, request.dry_run)
        .await
        .map_err(repo)?;
    report.warnings.splice(0..0, warnings);
    Ok(report)
}

pub async fn create_backup(
    repository: &Repository,
    request: BackupRequest,
) -> Result<BackupReceipt, AppError> {
    if request.encrypted {
        return Err(AppError::new(
            ErrorCode::Validation,
            "encrypted backups arrive with security tasks",
        ));
    }
    let export = ExportFile {
        schema: "snipdock-export-v1".into(),
        schema_version: SCHEMA_VERSION,
        items: all_items(repository).await?,
    };
    let payload = serde_json::to_vec(&export).map_err(internal)?;
    let checksum = sha256_hex(&payload);
    let backup = BackupFile {
        schema: "snipdock-backup-v1".into(),
        schema_version: SCHEMA_VERSION,
        checksum: checksum.clone(),
        export,
    };
    let data = serde_json::to_vec_pretty(&backup).map_err(internal)?;
    write_atomic(&request.path, &data)?;
    Ok(BackupReceipt {
        path: request.path,
        checksum,
        created_at: now(),
    })
}

pub async fn restore_backup(
    repository: &Repository,
    request: RestoreRequest,
) -> Result<RestoreReport, AppError> {
    let text = fs::read_to_string(&request.path).map_err(storage)?;
    let backup: BackupFile = serde_json::from_str(&text).map_err(internal)?;
    if backup.schema_version > SCHEMA_VERSION {
        return Err(AppError::new(ErrorCode::Validation, "backup schema is newer"));
    }
    let payload = serde_json::to_vec(&backup.export).map_err(internal)?;
    if sha256_hex(&payload) != backup.checksum {
        return Err(AppError::new(ErrorCode::Validation, "backup checksum mismatch"));
    }
    let count = backup.export.items.len() as i64;
    if !request.dry_run {
        for item in backup.export.items {
            repository
                .save_item(to_input(item, false))
                .await
                .map_err(repo)?;
        }
    }
    Ok(RestoreReport {
        schema_version: backup.schema_version,
        item_count: count,
        warnings: vec!["restore imports records; it does not replace the database yet".into()],
    })
}

async fn selected_items(
    repository: &Repository,
    request: &ExportRequest,
) -> Result<Vec<LibraryItem>, AppError> {
    let items = all_items(repository).await?;
    Ok(items
        .into_iter()
        .filter(|item| {
            (request.item_ids.is_empty() || request.item_ids.contains(&item.id))
                && (request.project_ids.is_empty()
                    || item
                        .project_id
                        .as_ref()
                        .is_some_and(|id| request.project_ids.contains(id)))
        })
        .collect())
}

async fn all_items(repository: &Repository) -> Result<Vec<LibraryItem>, AppError> {
    let mut query = SearchQuery {
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
        limit: 200,
        offset: 0,
    };
    let mut items = Vec::new();
    loop {
        let page = repository.search(query.clone()).await.map_err(repo)?;
        let total = usize::try_from(page.total).map_err(internal)?;
        let read = page.items.len();
        items.extend(page.items);
        if items.len() == total {
            return Ok(items);
        }
        if read == 0 || items.len() > total {
            return Err(AppError::new(
                ErrorCode::Storage,
                "export item count changed while reading",
            ));
        }
        query.offset = u32::try_from(items.len()).map_err(internal)?;
    }
}

fn parse_import(
    path: &str,
    text: &str,
    warnings: &mut Vec<String>,
) -> Result<Vec<SaveItemInput>, AppError> {
    if let Ok(export) = serde_json::from_str::<ExportFile>(text) {
        if export.schema_version > SCHEMA_VERSION {
            return Err(AppError::new(ErrorCode::Validation, "export schema is newer"));
        }
        return Ok(export.items.into_iter().map(|item| to_input(item, true)).collect());
    }
    let extension = Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let kind = if extension == "sh" || extension == "ps1" || extension == "bat" {
        ItemKind::Command
    } else {
        ItemKind::Snippet
    };
    let content_type = match extension.as_str() {
        "md" | "markdown" => ContentType::Markdown,
        "json" => ContentType::Json,
        "sql" => ContentType::Sql,
        "html" => ContentType::Html,
        "css" => ContentType::Css,
        "xml" => ContentType::Xml,
        "sh" | "ps1" | "bat" => ContentType::Shell,
        _ => ContentType::PlainText,
    };
    if content_type == ContentType::PlainText {
        warnings.push(format!("{path}: imported as plain text"));
    }
    Ok(vec![SaveItemInput {
        id: None,
        kind,
        title: Some(
            Path::new(path)
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("Imported item")
                .to_string(),
        ),
        description: None,
        content: strip_front_matter(text).to_string(),
        content_type,
        notes: None,
        project_id: None,
        category_id: None,
        tag_ids: Vec::new(),
        private: false,
        expires_at: None,
    }])
}

fn to_input(item: LibraryItem, preserve_id: bool) -> SaveItemInput {
    SaveItemInput {
        id: preserve_id.then_some(item.id),
        kind: if item.kind == ItemKind::Clipboard {
            ItemKind::Snippet
        } else {
            item.kind
        },
        title: item.title.or(Some("Imported item".into())),
        description: item.description,
        content: item.content,
        content_type: item.content_type,
        notes: item.notes,
        project_id: item.project_id,
        category_id: item.category_id,
        tag_ids: item.tag_ids,
        private: item.private,
        expires_at: item.expires_at,
    }
}

fn to_markdown(items: &[LibraryItem]) -> String {
    items
        .iter()
        .map(|item| {
            format!(
                "---\ntitle: {}\nkind: {:?}\n---\n\n{}\n",
                item.title.as_deref().unwrap_or("Untitled"),
                item.kind,
                item.content
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn strip_front_matter(text: &str) -> &str {
    if let Some(rest) = text.strip_prefix("---\n") {
        if let Some((_, body)) = rest.split_once("\n---\n") {
            return body;
        }
    }
    text
}

fn write_atomic(path: &str, data: &[u8]) -> Result<(), AppError> {
    let temp = format!("{path}.tmp");
    fs::write(&temp, data).map_err(storage)?;
    fs::rename(&temp, path).map_err(storage)
}

fn now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or_default();
    format!("{seconds}")
}

fn repo(error: crate::repository::RepositoryError) -> AppError {
    AppError::new(ErrorCode::Storage, error.to_string())
}

fn storage(error: std::io::Error) -> AppError {
    AppError::new(ErrorCode::Storage, error.to_string())
}

fn internal(error: impl ToString) -> AppError {
    AppError::new(ErrorCode::Internal, error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{db::Database, repository::Repository};
    use std::path::PathBuf;
    use uuid::Uuid;

    async fn fixture() -> (PathBuf, Database, Repository) {
        let root = std::env::temp_dir().join(format!("snipdock-transfer-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let database = Database::open(root.join("source.sqlite")).await.unwrap();
        let repository = Repository::new(database.pool().clone());
        (root, database, repository)
    }

    async fn insert_items(database: &Database, count: i64, private: bool) {
        sqlx::query(
            "WITH RECURSIVE seq(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM seq WHERE value < ?) \
             INSERT INTO items (id, kind, content, content_hash, private, created_at, updated_at) \
             SELECT printf('item-%04d', value), 'clipboard', printf('content-%04d', value), \
                    printf('hash-%04d', value), ?, \
                    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
             FROM seq",
        )
        .bind(count)
        .bind(private)
        .execute(database.pool())
        .await
        .unwrap();
    }

    async fn cleanup(root: PathBuf, database: Database, repository: Repository) {
        drop(repository);
        database.close().await;
        fs::remove_dir_all(root).unwrap();
    }

    fn library_item(id: &str, content: &str, content_type: ContentType) -> LibraryItem {
        LibraryItem {
            id: id.into(),
            kind: ItemKind::Note,
            title: Some(id.into()),
            description: None,
            content: content.into(),
            notes: None,
            content_type,
            language: None,
            project_id: None,
            category_id: None,
            pinned: false,
            favorite: false,
            private: false,
            tag_ids: Vec::new(),
            archived_at: None,
            expires_at: None,
            usage_count: 0,
            last_used_at: None,
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: "2026-01-01T00:00:00Z".into(),
        }
    }

    fn write_export(path: &Path, items: Vec<LibraryItem>) {
        fs::write(
            path,
            serde_json::to_vec(&ExportFile {
                schema: "snipdock-export-v1".into(),
                schema_version: SCHEMA_VERSION,
                items,
            })
            .unwrap(),
        )
        .unwrap();
    }

    #[tokio::test]
    async fn export_reads_every_bounded_page() {
        let (root, database, repository) = fixture().await;
        insert_items(&database, 501, false).await;
        let path = root.join("all.json");
        let receipt = export_data(
            &repository,
            ExportRequest {
                format: "json".into(),
                item_ids: Vec::new(),
                project_ids: Vec::new(),
                path: path.to_string_lossy().into_owned(),
            },
        )
        .await
        .unwrap();

        let export: ExportFile = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
        assert_eq!(receipt.item_count, 501);
        assert_eq!(export.items.len(), 501);
        cleanup(root, database, repository).await;
    }

    #[tokio::test]
    async fn private_export_fails_before_writing() {
        let (root, database, repository) = fixture().await;
        insert_items(&database, 1, true).await;
        let path = root.join("private.json");
        let error = export_data(
            &repository,
            ExportRequest {
                format: "json".into(),
                item_ids: vec!["item-0001".into()],
                project_ids: Vec::new(),
                path: path.to_string_lossy().into_owned(),
            },
        )
        .await
        .unwrap_err();

        assert_eq!(error.code, ErrorCode::Validation);
        assert!(!path.exists());
        cleanup(root, database, repository).await;
    }

    #[tokio::test]
    async fn import_replace_preserves_id_and_content_type() {
        let (root, database, repository) = fixture().await;
        sqlx::query(
            "INSERT INTO items (id, kind, title, content, content_type, content_hash, created_at, updated_at) \
             VALUES ('same-id', 'note', 'old', 'old', 'plain_text', 'old-hash', \
                     strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        )
        .execute(database.pool())
        .await
        .unwrap();
        let path = root.join("replace.json");
        write_export(
            &path,
            vec![library_item("same-id", "{\"new\":true}", ContentType::Json)],
        );

        let report = import_data(
            &repository,
            ImportRequest {
                paths: vec![path.to_string_lossy().into_owned()],
                duplicate_policy: "replace".into(),
                dry_run: false,
            },
        )
        .await
        .unwrap();
        let item = repository.get_item("same-id").await.unwrap();

        assert_eq!(report.updated, 1);
        assert_eq!(item.content, "{\"new\":true}");
        assert_eq!(item.content_type, ContentType::Json);
        cleanup(root, database, repository).await;
    }

    #[tokio::test]
    async fn failed_import_rolls_back_every_row() {
        let (root, database, repository) = fixture().await;
        let path = root.join("rollback.json");
        let valid = library_item("valid", "first", ContentType::PlainText);
        let mut invalid = library_item("invalid", "second", ContentType::PlainText);
        invalid.tag_ids.push("missing-tag".into());
        write_export(&path, vec![valid, invalid]);

        let result = import_data(
            &repository,
            ImportRequest {
                paths: vec![path.to_string_lossy().into_owned()],
                duplicate_policy: "keep_both".into(),
                dry_run: false,
            },
        )
        .await;
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM items")
            .fetch_one(database.pool())
            .await
            .unwrap();

        assert!(result.is_err());
        assert_eq!(count, 0);
        cleanup(root, database, repository).await;
    }
}
