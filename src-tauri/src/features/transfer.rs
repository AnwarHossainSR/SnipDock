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
use std::{
    fs::{self, File},
    io::Write,
    path::Path,
};

const SCHEMA_VERSION: u32 = 1;
const BACKUP_SCHEMA_VERSION: u32 = 2;
const MIB: u64 = 1024 * 1024;
const MAX_DATABASE_BYTES: u64 = 128 * MIB;
const MAX_BACKUP_FILE_BYTES: u64 = 172 * MIB;

#[derive(Deserialize, Serialize)]
struct ExportFile {
    schema: String,
    schema_version: u32,
    items: Vec<LibraryItem>,
}

#[derive(Deserialize, Serialize)]
struct BackupEnvelope {
    schema: String,
    schema_version: u32,
    database_schema_version: i64,
    ciphertext: String,
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
        "csv" => to_csv(&items),
        "html" => to_html(&items),
        _ => {
            return Err(AppError::new(
                ErrorCode::Validation,
                "format must be json, markdown, text, csv, html, or project",
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
    if request.passphrase.is_empty() {
        return Err(AppError::new(
            ErrorCode::Validation,
            "backup password is required",
        ));
    }
    let destination = Path::new(&request.path).to_path_buf();
    if destination.exists() {
        return Err(AppError::new(
            ErrorCode::Validation,
            "backup destination already exists",
        ));
    }
    let parent = destination.parent().filter(|path| !path.as_os_str().is_empty()).unwrap_or(Path::new("."));
    let suffix = uuid::Uuid::new_v4();
    let snapshot_path = parent.join(format!(".snipdock-{suffix}.sqlite"));
    let envelope_path = parent.join(format!(".snipdock-{suffix}.backup.tmp"));

    let result = async {
        repository.snapshot_to(&snapshot_path).await.map_err(repo)?;
        let data = seal_snapshot(&request.passphrase, &snapshot_path).await?;
        let checksum = sha256_hex(&data);
        write_synced(&envelope_path, &data)?;
        fs::rename(&envelope_path, &destination).map_err(storage)?;
        Ok(BackupReceipt {
            path: request.path.clone(),
            checksum,
            created_at: now(),
        })
    }
    .await;
    let _ = fs::remove_file(snapshot_path);
    let _ = fs::remove_file(envelope_path);
    result
}

/// Validates a database snapshot and seals it into the encrypted envelope that
/// `restore_backup` reads back.
///
/// Shared with scheduled and uploaded backups so every backup SnipDock produces
/// is the same format, restorable through the same path -- an upload that only
/// a bespoke tool could read would not be a backup.
pub async fn seal_snapshot(passphrase: &str, snapshot_path: &Path) -> Result<Vec<u8>, AppError> {
    if passphrase.is_empty() {
        return Err(AppError::new(
            ErrorCode::Validation,
            "backup password is required",
        ));
    }
    let database_schema_version = crate::db::validate_snapshot(snapshot_path)
        .await
        .map_err(internal)?;
    ensure_backup_size(
        fs::metadata(snapshot_path).map_err(storage)?.len(),
        MAX_DATABASE_BYTES,
    )?;
    let plaintext = fs::read(snapshot_path).map_err(storage)?;
    let envelope = BackupEnvelope {
        schema: "snipdock-backup-v2".into(),
        schema_version: BACKUP_SCHEMA_VERSION,
        database_schema_version,
        ciphertext: crate::crypto::encrypt(passphrase, &plaintext)?,
    };
    serde_json::to_vec(&envelope).map_err(internal)
}

pub async fn restore_backup(
    request: RestoreRequest,
    pending_path: &Path,
) -> Result<RestoreReport, AppError> {
    let passphrase = request
        .passphrase
        .as_deref()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::new(ErrorCode::Validation, "backup password is required"))?;
    if pending_path.exists() {
        return Err(AppError::new(
            ErrorCode::Validation,
            "a restore is already pending",
        ));
    }
    ensure_backup_size(
        fs::metadata(&request.path).map_err(storage)?.len(),
        MAX_BACKUP_FILE_BYTES,
    )?;
    let data = fs::read(&request.path).map_err(storage)?;
    let envelope: BackupEnvelope = serde_json::from_slice(&data).map_err(|_| {
        AppError::new(ErrorCode::Validation, "backup envelope is invalid")
    })?;
    if envelope.schema != "snipdock-backup-v2"
        || envelope.schema_version > BACKUP_SCHEMA_VERSION
    {
        return Err(AppError::new(
            ErrorCode::Validation,
            "backup format is unsupported",
        ));
    }
    let plaintext = crate::crypto::decrypt(passphrase, &envelope.ciphertext).map_err(|_| {
        AppError::new(
            ErrorCode::Validation,
            "wrong backup password or corrupt backup",
        )
    })?;
    ensure_backup_size(plaintext.len() as u64, MAX_DATABASE_BYTES)?;
    let parent = pending_path.parent().unwrap_or(Path::new("."));
    let temporary = parent.join(format!(".snipdock-restore-{}.sqlite", uuid::Uuid::new_v4()));
    let result = async {
        write_synced(&temporary, &plaintext)?;
        crate::db::validate_snapshot(&temporary)
            .await
            .map_err(|error| AppError::new(ErrorCode::Validation, error.to_string()))?;
        let item_count = crate::db::snapshot_item_count(&temporary)
            .await
            .map_err(internal)?;
        if !request.dry_run {
            fs::rename(&temporary, pending_path).map_err(storage)?;
        }
        Ok(RestoreReport {
            schema_version: envelope.schema_version,
            item_count,
            warnings: Vec::new(),
            restart_required: !request.dry_run,
        })
    }
    .await;
    let _ = fs::remove_file(temporary);
    result
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
        source_apps: Vec::new(),
        regex: None,
        regex_case_insensitive: None,
        group_by: None,
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
        source_app: None,
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
        source_app: item.source_app,
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

fn to_csv(items: &[LibraryItem]) -> String {
    let mut output = String::from("id,kind,title,content_type,content,created_at,updated_at\n");
    for item in items {
        let title = csv_cell(item.title.as_deref().unwrap_or("Untitled"));
        let content = csv_cell(&item.content);
        output.push_str(&format!(
            "{},{},{},{},{},{},{}\n",
            csv_cell(&item.id),
            csv_cell(&format!("{:?}", item.kind).to_lowercase()),
            title,
            csv_cell(&format!("{:?}", item.content_type).to_lowercase()),
            content,
            csv_cell(&item.created_at),
            csv_cell(&item.updated_at),
        ));
    }
    output
}

/// Wrap a value for CSV output. Prefix with a single quote if the value starts
/// with a character that spreadsheet apps treat as a formula (`=`, `+`, `-`,
/// `@`) to prevent CSV injection.
fn csv_cell(value: &str) -> String {
    let escaped = value.replace('"', "\"\"").replace('\n', " ");
    if matches!(escaped.as_bytes().first(), Some(b'=' | b'+' | b'-' | b'@')) {
        format!("\"'{escaped}\"")
    } else {
        format!("\"{escaped}\"")
    }
}

fn to_html(items: &[LibraryItem]) -> String {
    let mut html = String::from(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SnipDock Export</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
        .item { background: white; border-radius: 8px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .item-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
        .item-title { font-weight: 600; color: #333; }
        .item-meta { font-size: 12px; color: #666; }
        .item-content { background: #f8f9fa; padding: 12px; border-radius: 4px; white-space: pre-wrap; font-family: monospace; font-size: 13px; overflow-x: auto; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; }
        .badge-clipboard { background: #e3f2fd; color: #1976d2; }
        .badge-snippet { background: #f3e5f5; color: #7b1fa2; }
        .badge-code { background: #e8f5e9; color: #388e3c; }
    </style>
</head>
<body>
    <h1>SnipDock Export</h1>
    <p>#.items# items exported on #.date#</p>
"#,
    );
    
    let date = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string();
    html = html.replace("#.date#", &date).replace("#.items#", &items.len().to_string());
    
    for item in items {
        let title = html_escape(item.title.as_deref().unwrap_or("Untitled"));
        let kind_badge = match item.kind {
            ItemKind::Clipboard => "badge-clipboard",
            ItemKind::Snippet => "badge-snippet",
            ItemKind::Command => "badge-code",
            _ => "",
        };
        let kind_label = format!("{:?}", item.kind);
        let content = html_escape(&item.content);
        
        html.push_str(&format!(
            r#"    <div class="item">
        <div class="item-header">
            <span class="item-title">{}</span>
            <span class="badge {}">{}</span>
        </div>
        <div class="item-meta">Created: {}</div>
        <div class="item-content">{}</div>
    </div>
"#,
            title, kind_badge, kind_label, item.created_at, content
        ));
    }
    
    html.push_str(
        r#"</body>
</html>"#,
    );
    
    html
}

fn html_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
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
    let suffix = uuid::Uuid::new_v4();
    let temp = format!("{path}.{suffix}.tmp");
    fs::write(&temp, data).map_err(storage)?;
    fs::rename(&temp, path).map_err(storage)
}

fn write_synced(path: &Path, data: &[u8]) -> Result<(), AppError> {
    let mut file = File::create(path).map_err(storage)?;
    file.write_all(data).map_err(storage)?;
    file.sync_all().map_err(storage)
}

fn ensure_backup_size(size: u64, maximum: u64) -> Result<(), AppError> {
    if size > maximum {
        return Err(AppError::new(
            ErrorCode::Validation,
            format!("backup exceeds the {} MiB limit", maximum / MIB),
        ));
    }
    Ok(())
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

    #[test]
    fn backup_size_guard_rejects_oversized_files() {
        let error = ensure_backup_size(MAX_DATABASE_BYTES + 1, MAX_DATABASE_BYTES).unwrap_err();
        assert_eq!(error.code, ErrorCode::Validation);
        assert!(error.message.contains("128 MiB"));
        assert!(ensure_backup_size(MAX_DATABASE_BYTES, MAX_DATABASE_BYTES).is_ok());
    }

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
        crate::db::retry_locked_file_operation(|| fs::remove_dir_all(&root))
            .await
            .unwrap();
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
            source_app: None,
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

    #[tokio::test]
    async fn encrypted_backup_contains_complete_database() {
        let (root, database, repository) = fixture().await;
        insert_items(&database, 501, false).await;
        sqlx::query("UPDATE items SET content = 'private payload', private = 1 WHERE id = 'item-0501'")
            .execute(database.pool())
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('project-1', 'Project', '1', '1'); \
             INSERT INTO categories (id, name, built_in, created_at) VALUES ('category-1', 'Custom', 0, '1'); \
             INSERT INTO tags (id, name, color, created_at) VALUES ('tag-1', 'Tag', '#123456', '1'); \
             INSERT INTO item_tags (item_id, tag_id) VALUES ('item-0001', 'tag-1'); \
             INSERT INTO project_tags (project_id, tag_id) VALUES ('project-1', 'tag-1'); \
             CREATE TABLE IF NOT EXISTS app_settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL); \
             INSERT INTO app_settings (id, data) VALUES (1, '{}'); \
             INSERT INTO sync_records (id, device_id, record_id, ciphertext, updated_at) VALUES ('sync-1', 'device', 'item-0001', 'sealed', '1'); \
             INSERT INTO sync_conflicts (id, record_id, local_revision, remote_revision, created_at) VALUES ('conflict-1', 'item-0001', 1, 2, '1')",
        )
        .execute(database.pool())
        .await
        .unwrap();
        let path = root.join("complete.backup");

        let receipt = create_backup(
            &repository,
            BackupRequest {
                path: path.to_string_lossy().into_owned(),
                passphrase: "backup password".into(),
            },
        )
        .await
        .unwrap();
        let envelope: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        let plaintext = crate::crypto::decrypt(
            "backup password",
            envelope["ciphertext"].as_str().unwrap(),
        )
        .unwrap();
        assert!(!String::from_utf8_lossy(&fs::read(&path).unwrap()).contains("private payload"));
        let restored_path = root.join("restored.sqlite");
        fs::write(&restored_path, plaintext).unwrap();
        let restored = Database::open(&restored_path).await.unwrap();

        for table in [
            "items",
            "projects",
            "categories",
            "tags",
            "item_tags",
            "project_tags",
            "app_settings",
            "sync_records",
            "sync_conflicts",
        ] {
            let source: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
                .fetch_one(database.pool())
                .await
                .unwrap();
            let restored_count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
                .fetch_one(restored.pool())
                .await
                .unwrap();
            assert_eq!(restored_count, source, "{table}");
        }
        let private: String = sqlx::query_scalar(
            "SELECT CAST(content AS TEXT) FROM items WHERE id = 'item-0501'",
        )
        .fetch_one(restored.pool())
        .await
        .unwrap();
        assert_eq!(private, "private payload");
        assert_eq!(receipt.path, path.to_string_lossy());

        restored.close().await;
        cleanup(root, database, repository).await;
    }

    #[tokio::test]
    async fn wrong_password_never_stages_restore() {
        let (root, database, repository) = fixture().await;
        insert_items(&database, 1, true).await;
        let backup_path = root.join("source.backup");
        create_backup(
            &repository,
            BackupRequest {
                path: backup_path.to_string_lossy().into_owned(),
                passphrase: "right password".into(),
            },
        )
        .await
        .unwrap();
        let pending = root.join("snipdock.restore-pending.sqlite");

        let error = restore_backup(
            RestoreRequest {
                path: backup_path.to_string_lossy().into_owned(),
                passphrase: Some("wrong password".into()),
                dry_run: false,
            },
            &pending,
        )
        .await
        .unwrap_err();

        assert_eq!(error.code, ErrorCode::Validation);
        assert!(!pending.exists());
        cleanup(root, database, repository).await;
    }

    #[tokio::test]
    async fn restore_dry_run_validates_without_staging() {
        let (root, database, repository) = fixture().await;
        insert_items(&database, 3, false).await;
        let backup_path = root.join("source.backup");
        create_backup(
            &repository,
            BackupRequest {
                path: backup_path.to_string_lossy().into_owned(),
                passphrase: "password".into(),
            },
        )
        .await
        .unwrap();
        let pending = root.join("snipdock.restore-pending.sqlite");

        let report = restore_backup(
            RestoreRequest {
                path: backup_path.to_string_lossy().into_owned(),
                passphrase: Some("password".into()),
                dry_run: true,
            },
            &pending,
        )
        .await
        .unwrap();

        assert_eq!(report.item_count, 3);
        assert!(!report.restart_required);
        assert!(!pending.exists());
        cleanup(root, database, repository).await;
    }

    #[tokio::test]
    async fn valid_restore_stages_complete_database() {
        let (root, database, repository) = fixture().await;
        insert_items(&database, 3, false).await;
        let backup_path = root.join("source.backup");
        create_backup(
            &repository,
            BackupRequest {
                path: backup_path.to_string_lossy().into_owned(),
                passphrase: "password".into(),
            },
        )
        .await
        .unwrap();
        let pending = root.join("snipdock.restore-pending.sqlite");

        let report = restore_backup(
            RestoreRequest {
                path: backup_path.to_string_lossy().into_owned(),
                passphrase: Some("password".into()),
                dry_run: false,
            },
            &pending,
        )
        .await
        .unwrap();

        assert_eq!(report.item_count, 3);
        assert!(report.restart_required);
        assert!(pending.exists());
        cleanup(root, database, repository).await;
    }
}
