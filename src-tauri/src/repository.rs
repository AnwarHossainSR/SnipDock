use crate::models::{
    ContentType, DeleteReceipt, ItemFlags, ItemKind, LibraryItem, Page, SaveItemInput,
};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqlitePool};
use std::{collections::HashSet, error::Error, fmt};
use uuid::Uuid;

const ITEM_COLUMNS: &str = "id, kind, title, description, CAST(content AS TEXT) AS content, \
    notes, content_type, language, project_id, category_id, pinned, favorite, archived_at, \
    expires_at, usage_count, last_used_at, created_at, updated_at";

pub type RepositoryResult<T> = Result<T, RepositoryError>;

#[derive(Debug)]
pub enum RepositoryError {
    Validation(&'static str),
    NotFound,
    CorruptData(&'static str),
    Storage(sqlx::Error),
}

impl fmt::Display for RepositoryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Validation(message) => write!(formatter, "validation: {message}"),
            Self::NotFound => formatter.write_str("item not found"),
            Self::CorruptData(message) => write!(formatter, "corrupt item: {message}"),
            Self::Storage(error) => write!(formatter, "database: {error}"),
        }
    }
}

impl Error for RepositoryError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Storage(error) => Some(error),
            _ => None,
        }
    }
}

impl From<sqlx::Error> for RepositoryError {
    fn from(error: sqlx::Error) -> Self {
        Self::Storage(error)
    }
}

#[derive(Clone)]
pub struct Repository {
    pool: SqlitePool,
}

impl Repository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn save_item(&self, input: SaveItemInput) -> RepositoryResult<LibraryItem> {
        self.save_item_as(input, None).await
    }

    pub async fn save_clipboard_item(
        &self,
        content: String,
        content_type: ContentType,
    ) -> RepositoryResult<LibraryItem> {
        self.save_item_as(
            SaveItemInput {
                id: None,
                kind: ItemKind::Clipboard,
                title: None,
                description: None,
                content,
                notes: None,
                project_id: None,
                category_id: None,
                tag_ids: Vec::new(),
                private: false,
                expires_at: None,
            },
            Some(content_type),
        )
        .await
    }

    async fn save_item_as(
        &self,
        input: SaveItemInput,
        content_type_override: Option<ContentType>,
    ) -> RepositoryResult<LibraryItem> {
        if input.content.trim().is_empty() {
            return Err(RepositoryError::Validation("content must not be blank"));
        }

        let mut transaction = self.pool.begin().await?;
        let id = input
            .id
            .clone()
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let content_hash = format!("{:x}", Sha256::digest(input.content.as_bytes()));

        if input.id.is_some() {
            let result = sqlx::query(
                "UPDATE items SET kind = ?, content_type = COALESCE(?, content_type), title = ?, \
                 description = ?, content = ?, notes = ?, \
                 project_id = ?, category_id = ?, content_hash = ?, private = ?, expires_at = ?, \
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
                 WHERE id = ? AND deleted_at IS NULL"
            )
            .bind(item_kind(&input.kind))
            .bind(content_type_override.as_ref().map(content_type_name))
            .bind(input.title.as_deref())
            .bind(input.description.as_deref())
            .bind(input.content.as_bytes())
            .bind(input.notes.as_deref())
            .bind(input.project_id.as_deref())
            .bind(input.category_id.as_deref())
            .bind(&content_hash)
            .bind(input.private)
            .bind(input.expires_at.as_deref())
            .bind(&id)
            .execute(&mut *transaction)
            .await?;
            if result.rows_affected() == 0 {
                return Err(RepositoryError::NotFound);
            }
            sqlx::query("DELETE FROM item_tags WHERE item_id = ?")
                .bind(&id)
                .execute(&mut *transaction)
                .await?;
        } else {
            sqlx::query(
                "INSERT INTO items (id, kind, title, description, content, content_type, notes, \
                 project_id, category_id, content_hash, private, expires_at, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), \
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            )
            .bind(&id)
            .bind(item_kind(&input.kind))
            .bind(input.title.as_deref())
            .bind(input.description.as_deref())
            .bind(input.content.as_bytes())
            .bind(content_type_name(
                content_type_override.as_ref().unwrap_or(&ContentType::PlainText),
            ))
            .bind(input.notes.as_deref())
            .bind(input.project_id.as_deref())
            .bind(input.category_id.as_deref())
            .bind(&content_hash)
            .bind(input.private)
            .bind(input.expires_at.as_deref())
            .execute(&mut *transaction)
            .await?;
        }

        let mut seen_tags = HashSet::new();
        for tag_id in &input.tag_ids {
            if seen_tags.insert(tag_id) {
                sqlx::query("INSERT INTO item_tags (item_id, tag_id) VALUES (?, ?)")
                    .bind(&id)
                    .bind(tag_id)
                    .execute(&mut *transaction)
                    .await?;
            }
        }

        transaction.commit().await?;
        self.get_item(&id).await
    }

    pub async fn latest_clipboard_content(&self) -> RepositoryResult<Option<String>> {
        Ok(sqlx::query_scalar(
            "SELECT CAST(content AS TEXT) FROM items \
             WHERE kind = 'clipboard' AND deleted_at IS NULL \
             ORDER BY created_at DESC, rowid DESC LIMIT 1",
        )
        .fetch_optional(&self.pool)
        .await?)
    }

    pub async fn prune_clipboard_history(
        &self,
        max_items: u32,
        history_days: u32,
    ) -> RepositoryResult<()> {
        let mut transaction = self.pool.begin().await?;
        let age = format!("-{} days", history_days.max(1));
        sqlx::query(
            "DELETE FROM items WHERE kind = 'clipboard' AND deleted_at IS NULL \
             AND julianday(created_at) < julianday('now', ?)",
        )
        .bind(age)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "DELETE FROM items WHERE id IN ( \
                SELECT id FROM items WHERE kind = 'clipboard' AND deleted_at IS NULL \
                ORDER BY created_at DESC, rowid DESC LIMIT -1 OFFSET ? \
             )",
        )
        .bind(i64::from(max_items.max(1)))
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(())
    }

    pub async fn get_item(&self, id: &str) -> RepositoryResult<LibraryItem> {
        let sql = format!("SELECT {ITEM_COLUMNS} FROM items WHERE id = ? AND deleted_at IS NULL");
        let row = sqlx::query_as::<_, ItemRow>(&sql)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?
            .ok_or(RepositoryError::NotFound)?;
        row.try_into()
    }

    pub async fn set_item_flags(
        &self,
        id: &str,
        flags: ItemFlags,
    ) -> RepositoryResult<LibraryItem> {
        let archived = flags.archived.map(|value| if value { 1_i64 } else { 0 });
        let result = sqlx::query(
            "UPDATE items SET pinned = COALESCE(?, pinned), favorite = COALESCE(?, favorite), \
             archived_at = CASE ? \
                 WHEN 1 THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
                 WHEN 0 THEN NULL ELSE archived_at END, \
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
             WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(flags.pinned)
        .bind(flags.favorite)
        .bind(archived)
        .bind(id)
        .execute(&self.pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(RepositoryError::NotFound);
        }
        self.get_item(id).await
    }

    pub async fn record_copy(&self, id: &str) -> RepositoryResult<LibraryItem> {
        let result = sqlx::query(
            "UPDATE items SET usage_count = usage_count + 1, \
             last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), \
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
             WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(&self.pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(RepositoryError::NotFound);
        }
        self.get_item(id).await
    }

    pub async fn delete_item(&self, id: &str) -> RepositoryResult<DeleteReceipt> {
        let mut transaction = self.pool.begin().await?;
        let result = sqlx::query(
            "UPDATE items SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), \
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
             WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(&mut *transaction)
        .await?;
        if result.rows_affected() == 0 {
            return Err(RepositoryError::NotFound);
        }

        let receipt_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO trash_receipts (id, operation, created_at, expires_at) \
             VALUES (?, 'delete_item', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), \
             strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 seconds'))",
        )
        .bind(&receipt_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query("INSERT INTO trash_items (receipt_id, item_id) VALUES (?, ?)")
            .bind(&receipt_id)
            .bind(id)
            .execute(&mut *transaction)
            .await?;
        let expires_at: String =
            sqlx::query_scalar("SELECT expires_at FROM trash_receipts WHERE id = ?")
                .bind(&receipt_id)
                .fetch_one(&mut *transaction)
                .await?;
        transaction.commit().await?;

        Ok(DeleteReceipt {
            id: receipt_id,
            item_count: 1,
            expires_at,
        })
    }

    pub async fn restore_item(&self, receipt_id: &str) -> RepositoryResult<LibraryItem> {
        let mut transaction = self.pool.begin().await?;
        let item_id: String = sqlx::query_scalar(
            "SELECT ti.item_id FROM trash_items ti \
             JOIN trash_receipts tr ON tr.id = ti.receipt_id \
             WHERE tr.id = ? AND tr.operation = 'delete_item' \
             AND tr.expires_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        )
        .bind(receipt_id)
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or(RepositoryError::NotFound)?;

        sqlx::query(
            "UPDATE items SET deleted_at = NULL, \
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
        )
        .bind(&item_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query("DELETE FROM trash_receipts WHERE id = ?")
            .bind(receipt_id)
            .execute(&mut *transaction)
            .await?;
        transaction.commit().await?;

        self.get_item(&item_id).await
    }

    pub async fn list_items(
        &self,
        limit: Option<u32>,
        offset: u32,
    ) -> RepositoryResult<Page<LibraryItem>> {
        let limit = limit.unwrap_or(50).clamp(1, 200);
        let total = sqlx::query_scalar("SELECT COUNT(*) FROM items WHERE deleted_at IS NULL")
            .fetch_one(&self.pool)
            .await?;
        let sql = format!(
            "SELECT {ITEM_COLUMNS} FROM items WHERE deleted_at IS NULL \
             ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?"
        );
        let rows = sqlx::query_as::<_, ItemRow>(&sql)
            .bind(i64::from(limit))
            .bind(i64::from(offset))
            .fetch_all(&self.pool)
            .await?;
        let items = rows
            .into_iter()
            .map(TryInto::try_into)
            .collect::<RepositoryResult<Vec<_>>>()?;

        Ok(Page {
            items,
            total,
            limit,
            offset,
        })
    }

    pub async fn list_clipboard_items(
        &self,
        limit: u32,
        offset: u32,
    ) -> RepositoryResult<Page<LibraryItem>> {
        let limit = limit.clamp(1, 200);
        let total = sqlx::query_scalar(
            "SELECT COUNT(*) FROM items WHERE kind = 'clipboard' AND deleted_at IS NULL",
        )
        .fetch_one(&self.pool)
        .await?;
        let sql = format!(
            "SELECT {ITEM_COLUMNS} FROM items \
             WHERE kind = 'clipboard' AND deleted_at IS NULL \
             ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?"
        );
        let rows = sqlx::query_as::<_, ItemRow>(&sql)
            .bind(i64::from(limit))
            .bind(i64::from(offset))
            .fetch_all(&self.pool)
            .await?;
        let items = rows
            .into_iter()
            .map(TryInto::try_into)
            .collect::<RepositoryResult<Vec<_>>>()?;

        Ok(Page {
            items,
            total,
            limit,
            offset,
        })
    }
}

#[derive(FromRow)]
struct ItemRow {
    id: String,
    kind: String,
    title: Option<String>,
    description: Option<String>,
    content: String,
    notes: Option<String>,
    content_type: String,
    language: Option<String>,
    project_id: Option<String>,
    category_id: Option<String>,
    pinned: bool,
    favorite: bool,
    archived_at: Option<String>,
    expires_at: Option<String>,
    usage_count: i64,
    last_used_at: Option<String>,
    created_at: String,
    updated_at: String,
}

impl TryFrom<ItemRow> for LibraryItem {
    type Error = RepositoryError;

    fn try_from(row: ItemRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.id,
            kind: parse_item_kind(&row.kind)?,
            title: row.title,
            description: row.description,
            content: row.content,
            notes: row.notes,
            content_type: parse_content_type(&row.content_type)?,
            language: row.language,
            project_id: row.project_id,
            category_id: row.category_id,
            pinned: row.pinned,
            favorite: row.favorite,
            archived_at: row.archived_at,
            expires_at: row.expires_at,
            usage_count: row.usage_count,
            last_used_at: row.last_used_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }
}

fn item_kind(kind: &ItemKind) -> &'static str {
    match kind {
        ItemKind::Clipboard => "clipboard",
        ItemKind::Snippet => "snippet",
        ItemKind::Command => "command",
        ItemKind::Template => "template",
        ItemKind::Note => "note",
    }
}

fn content_type_name(content_type: &ContentType) -> &'static str {
    match content_type {
        ContentType::PlainText => "plain_text",
        ContentType::Code => "code",
        ContentType::Json => "json",
        ContentType::Sql => "sql",
        ContentType::Html => "html",
        ContentType::Css => "css",
        ContentType::Xml => "xml",
        ContentType::Shell => "shell",
        ContentType::Markdown => "markdown",
        ContentType::Config => "config",
    }
}

fn parse_item_kind(value: &str) -> RepositoryResult<ItemKind> {
    match value {
        "clipboard" => Ok(ItemKind::Clipboard),
        "snippet" => Ok(ItemKind::Snippet),
        "command" => Ok(ItemKind::Command),
        "template" => Ok(ItemKind::Template),
        "note" => Ok(ItemKind::Note),
        _ => Err(RepositoryError::CorruptData("unknown kind")),
    }
}

fn parse_content_type(value: &str) -> RepositoryResult<ContentType> {
    match value {
        "plain_text" => Ok(ContentType::PlainText),
        "code" => Ok(ContentType::Code),
        "json" => Ok(ContentType::Json),
        "sql" => Ok(ContentType::Sql),
        "html" => Ok(ContentType::Html),
        "css" => Ok(ContentType::Css),
        "xml" => Ok(ContentType::Xml),
        "shell" => Ok(ContentType::Shell),
        "markdown" => Ok(ContentType::Markdown),
        "config" => Ok(ContentType::Config),
        _ => Err(RepositoryError::CorruptData("unknown content type")),
    }
}
