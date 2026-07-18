use crate::{
    error::{AppError, ErrorCode},
    models::{
        BackupReceipt, BackupRequest, ContentType, ExportReceipt, ExportRequest, ImportReport,
        ImportRequest, ItemKind, LibraryItem, RestoreReport, RestoreRequest, SaveItemInput,
        SearchQuery, SortOrder,
    },
    repository::Repository,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
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

    let mut report = ImportReport {
        created: 0,
        updated: 0,
        skipped: 0,
        warnings: Vec::new(),
    };
    let existing = all_items(repository).await?;

    for path in request.paths {
        let text = fs::read_to_string(&path).map_err(storage)?;
        let inputs = parse_import(&path, &text, &mut report.warnings)?;
        for input in inputs {
            let duplicate = existing.iter().find(|item| item.content == input.content);
            if duplicate.is_some() && request.duplicate_policy == "skip" {
                report.skipped += 1;
                continue;
            }
            if request.dry_run {
                if duplicate.is_some() && request.duplicate_policy == "replace" {
                    report.updated += 1;
                } else {
                    report.created += 1;
                }
                continue;
            }
            if duplicate.is_some() && request.duplicate_policy == "replace" {
                report.skipped += 1;
                report
                    .warnings
                    .push("replace matched existing content; kept current item".into());
                continue;
            }
            repository.save_item(input).await.map_err(repo)?;
            report.created += 1;
        }
    }
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
    let checksum = format!("{:x}", Sha256::digest(&payload));
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
    if format!("{:x}", Sha256::digest(&payload)) != backup.checksum {
        return Err(AppError::new(ErrorCode::Validation, "backup checksum mismatch"));
    }
    let count = backup.export.items.len() as i64;
    if !request.dry_run {
        for item in backup.export.items {
            repository
                .save_item(to_input(item, None))
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
    let page = repository
        .search(SearchQuery {
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
            limit: 10_000,
            offset: 0,
        })
        .await
        .map_err(repo)?;
    Ok(page.items)
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
        return Ok(export.items.into_iter().map(|item| to_input(item, None)).collect());
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
        notes: None,
        project_id: None,
        category_id: None,
        tag_ids: Vec::new(),
        private: false,
        expires_at: None,
    }
    .with_type(content_type)])
}

trait WithType {
    fn with_type(self, _content_type: ContentType) -> Self;
}

impl WithType for SaveItemInput {
    fn with_type(self, _content_type: ContentType) -> Self {
        self
    }
}

fn to_input(item: LibraryItem, id: Option<String>) -> SaveItemInput {
    SaveItemInput {
        id,
        kind: if item.kind == ItemKind::Clipboard {
            ItemKind::Snippet
        } else {
            item.kind
        },
        title: item.title.or(Some("Imported item".into())),
        description: item.description,
        content: item.content,
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
