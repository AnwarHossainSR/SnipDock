use crate::models::{
    Category, ContentType, DeleteReceipt, ItemFlags, ItemKind, LibraryItem, Page, Project,
    SaveCategoryInput, SaveItemInput, SaveProjectInput, SaveTagInput, SearchQuery, SortOrder, Tag,
};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, QueryBuilder, Sqlite, SqlitePool};
use std::{collections::HashSet, error::Error, fmt};
use uuid::Uuid;

const ITEM_COLUMNS: &str = "id, kind, title, description, CAST(content AS TEXT) AS content, \
    notes, content_type, language, project_id, category_id, pinned, favorite, private, \
    COALESCE((SELECT json_group_array(tag_id) FROM item_tags WHERE item_id = items.id), '[]') AS tag_ids_json, archived_at, \
    expires_at, usage_count, last_used_at, created_at, updated_at";

const TAG_COLUMNS: &str = "id, name, color, \
    (SELECT COUNT(*) FROM item_tags WHERE tag_id = tags.id) \
    + (SELECT COUNT(*) FROM project_tags WHERE tag_id = tags.id) AS usage_count";

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
        if input.content.is_empty() {
            return Err(RepositoryError::Validation("content must not be empty"));
        }
        if input.content.len() > 1_000_000 {
            return Err(RepositoryError::Validation(
                "content must not exceed 1,000,000 bytes",
            ));
        }
        let title_required = matches!(input.kind, ItemKind::Snippet | ItemKind::Template);
        if title_required && input.title.as_deref().is_none_or(|title| title.trim().is_empty()) {
            return Err(RepositoryError::Validation("title is required"));
        }
        if input.title.as_deref().is_some_and(|title| {
            title.trim().is_empty() || title.chars().count() > 200
        }) {
            return Err(RepositoryError::Validation(
                "title must contain 1 to 200 characters",
            ));
        }
        if input
            .description
            .as_deref()
            .is_some_and(|description| description.chars().count() > 1_000)
        {
            return Err(RepositoryError::Validation(
                "description must not exceed 1,000 characters",
            ));
        }
        if input
            .notes
            .as_deref()
            .is_some_and(|notes| notes.chars().count() > 10_000)
        {
            return Err(RepositoryError::Validation(
                "notes must not exceed 10,000 characters",
            ));
        }
        if let Some(expires_at) = input.expires_at.as_deref() {
            let valid: bool = sqlx::query_scalar(
                "SELECT ? = strftime('%Y-%m-%dT%H:%M:%SZ', ?) \
                 OR ? = strftime('%Y-%m-%dT%H:%M:%fZ', ?)",
            )
            .bind(expires_at)
            .bind(expires_at)
            .bind(expires_at)
            .bind(expires_at)
            .fetch_one(&self.pool)
            .await?;
            if !valid {
                return Err(RepositoryError::Validation(
                    "expires_at must be a UTC RFC 3339 timestamp",
                ));
            }
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

    pub async fn duplicate_item(&self, id: &str) -> RepositoryResult<LibraryItem> {
        let mut transaction = self.pool.begin().await?;
        let duplicate_id = Uuid::new_v4().to_string();
        let result = sqlx::query(
            "INSERT INTO items (id, kind, title, description, content, notes, content_type, \
             language, project_id, category_id, content_hash, pinned, favorite, private, \
             archived_at, deleted_at, expires_at, usage_count, last_used_at, created_at, updated_at) \
             SELECT ?, kind, CASE WHEN title IS NULL THEN NULL \
                 ELSE 'Copy of ' || substr(title, 1, 192) END, \
                 description, content, notes, content_type, language, project_id, category_id, \
                 content_hash, 0, 0, private, NULL, NULL, expires_at, 0, NULL, \
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), \
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
             FROM items WHERE id = ? AND deleted_at IS NULL \
             AND kind IN ('snippet', 'command', 'note')",
        )
        .bind(&duplicate_id)
        .bind(id)
        .execute(&mut *transaction)
        .await?;
        if result.rows_affected() == 0 {
            return Err(RepositoryError::NotFound);
        }
        sqlx::query(
            "INSERT INTO item_tags (item_id, tag_id) \
             SELECT ?, tag_id FROM item_tags WHERE item_id = ?",
        )
        .bind(&duplicate_id)
        .bind(id)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;

        self.get_item(&duplicate_id).await
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

    pub async fn clear_clipboard_history(&self) -> RepositoryResult<DeleteReceipt> {
        let mut transaction = self.pool.begin().await?;
        let item_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM items WHERE kind = 'clipboard' AND deleted_at IS NULL",
        )
        .fetch_one(&mut *transaction)
        .await?;
        if item_count == 0 {
            return Err(RepositoryError::NotFound);
        }

        let receipt_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO trash_receipts (id, operation, created_at, expires_at) \
             VALUES (?, 'clear_clipboard_history', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), \
             strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 seconds'))",
        )
        .bind(&receipt_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "INSERT INTO trash_items (receipt_id, item_id) \
             SELECT ?, id FROM items WHERE kind = 'clipboard' AND deleted_at IS NULL",
        )
        .bind(&receipt_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "UPDATE items SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), \
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
             WHERE kind = 'clipboard' AND deleted_at IS NULL",
        )
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
            item_count,
            expires_at,
        })
    }

    pub async fn restore_item(&self, receipt_id: &str) -> RepositoryResult<LibraryItem> {
        let mut transaction = self.pool.begin().await?;
        let item_id: String = sqlx::query_scalar(
            "SELECT ti.item_id FROM trash_items ti \
             JOIN trash_receipts tr ON tr.id = ti.receipt_id \
             JOIN items i ON i.id = ti.item_id \
             WHERE tr.id = ? AND tr.expires_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
             ORDER BY i.created_at DESC, i.rowid DESC LIMIT 1",
        )
        .bind(receipt_id)
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or(RepositoryError::NotFound)?;

        sqlx::query(
            "UPDATE items SET deleted_at = NULL, \
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
             WHERE id IN (SELECT item_id FROM trash_items WHERE receipt_id = ?)",
        )
        .bind(receipt_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query("DELETE FROM trash_receipts WHERE id = ?")
            .bind(receipt_id)
            .execute(&mut *transaction)
            .await?;
        transaction.commit().await?;

        self.get_item(&item_id).await
    }

    pub async fn cleanup_retention(
        &self,
        max_items: u32,
        history_days: u32,
    ) -> RepositoryResult<()> {
        self.prune_clipboard_history(max_items, history_days).await?;
        let mut transaction = self.pool.begin().await?;
        sqlx::query(
            "DELETE FROM items WHERE deleted_at IS NOT NULL AND id IN ( \
                SELECT ti.item_id FROM trash_items ti \
                JOIN trash_receipts tr ON tr.id = ti.receipt_id \
                WHERE tr.expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
             )",
        )
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "DELETE FROM trash_receipts \
             WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        )
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(())
    }

    pub async fn list_items(
        &self,
        limit: Option<u32>,
        offset: u32,
    ) -> RepositoryResult<Page<LibraryItem>> {
        let limit = limit.unwrap_or(50).clamp(1, 200);
        let total = sqlx::query_scalar(
            "SELECT COUNT(*) FROM items WHERE deleted_at IS NULL AND archived_at IS NULL",
        )
        .fetch_one(&self.pool)
        .await?;
        let sql = format!(
            "SELECT {ITEM_COLUMNS} FROM items \
             WHERE deleted_at IS NULL AND archived_at IS NULL \
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

    pub async fn list_reusable_items(
        &self,
        limit: u32,
        offset: u32,
    ) -> RepositoryResult<Page<LibraryItem>> {
        let limit = limit.clamp(1, 200);
        let total = sqlx::query_scalar(
            "SELECT COUNT(*) FROM items \
             WHERE kind != 'clipboard' AND deleted_at IS NULL AND archived_at IS NULL",
        )
        .fetch_one(&self.pool)
        .await?;
        let sql = format!(
            "SELECT {ITEM_COLUMNS} FROM items \
             WHERE kind != 'clipboard' AND deleted_at IS NULL AND archived_at IS NULL \
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

    pub async fn search(&self, query: SearchQuery) -> RepositoryResult<Page<LibraryItem>> {
        let limit = query.limit.clamp(1, 200);
        let fts = fts_match(query.text.as_deref());

        let mut count = QueryBuilder::<Sqlite>::new("SELECT COUNT(*) FROM items");
        push_conditions(&mut count, &query, fts.as_deref());
        let total: i64 = count.build_query_scalar().fetch_one(&self.pool).await?;

        let mut builder = QueryBuilder::<Sqlite>::new("SELECT ");
        builder.push(ITEM_COLUMNS);
        builder.push(" FROM items");
        push_conditions(&mut builder, &query, fts.as_deref());
        builder.push(" ORDER BY ");
        builder.push(match query.sort {
            SortOrder::Newest => "created_at DESC, rowid DESC",
            SortOrder::Oldest => "created_at ASC, rowid ASC",
            SortOrder::MostUsed => "usage_count DESC, created_at DESC, rowid DESC",
        });
        builder.push(" LIMIT ");
        builder.push_bind(i64::from(limit));
        builder.push(" OFFSET ");
        builder.push_bind(i64::from(query.offset));

        let rows = builder
            .build_query_as::<ItemRow>()
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
            offset: query.offset,
        })
    }

    pub async fn save_project(&self, input: SaveProjectInput) -> RepositoryResult<Project> {
        let name = input.name.trim();
        if name.is_empty() || name.chars().count() > 200 {
            return Err(RepositoryError::Validation(
                "name must contain 1 to 200 characters",
            ));
        }
        let description = input
            .description
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        if description.is_some_and(|value| value.chars().count() > 1_000) {
            return Err(RepositoryError::Validation(
                "description must not exceed 1,000 characters",
            ));
        }

        let mut transaction = self.pool.begin().await?;
        let id = input
            .id
            .clone()
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let archived = input.archived.map(|value| if value { 1_i64 } else { 0 });

        if input.id.is_some() {
            let result = sqlx::query(
                "UPDATE projects SET name = ?, description = ?, \
                 archived_at = CASE ? \
                     WHEN 1 THEN COALESCE(archived_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) \
                     WHEN 0 THEN NULL ELSE archived_at END, \
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
                 WHERE id = ?",
            )
            .bind(name)
            .bind(description)
            .bind(archived)
            .bind(&id)
            .execute(&mut *transaction)
            .await?;
            if result.rows_affected() == 0 {
                return Err(RepositoryError::NotFound);
            }
            sqlx::query("DELETE FROM project_tags WHERE project_id = ?")
                .bind(&id)
                .execute(&mut *transaction)
                .await?;
        } else {
            sqlx::query(
                "INSERT INTO projects (id, name, description, archived_at, created_at, updated_at) \
                 VALUES (?, ?, ?, \
                 CASE ? WHEN 1 THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE NULL END, \
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), \
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            )
            .bind(&id)
            .bind(name)
            .bind(description)
            .bind(archived)
            .execute(&mut *transaction)
            .await?;
        }

        let mut seen_tags = HashSet::new();
        for tag_id in &input.tag_ids {
            if seen_tags.insert(tag_id) {
                sqlx::query("INSERT INTO project_tags (project_id, tag_id) VALUES (?, ?)")
                    .bind(&id)
                    .bind(tag_id)
                    .execute(&mut *transaction)
                    .await?;
            }
        }

        transaction.commit().await?;
        self.get_project(&id).await
    }

    pub async fn get_project(&self, id: &str) -> RepositoryResult<Project> {
        let row = sqlx::query_as::<_, ProjectRow>(
            "SELECT id, name, description, archived_at, created_at, updated_at \
             FROM projects WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(RepositoryError::NotFound)?;
        Ok(row.into())
    }

    pub async fn list_projects(&self, include_archived: bool) -> RepositoryResult<Vec<Project>> {
        let sql = if include_archived {
            "SELECT id, name, description, archived_at, created_at, updated_at FROM projects \
             ORDER BY archived_at IS NOT NULL, name COLLATE NOCASE, rowid"
        } else {
            "SELECT id, name, description, archived_at, created_at, updated_at FROM projects \
             WHERE archived_at IS NULL ORDER BY name COLLATE NOCASE, rowid"
        };
        let rows = sqlx::query_as::<_, ProjectRow>(sql)
            .fetch_all(&self.pool)
            .await?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    pub async fn move_item(
        &self,
        id: &str,
        project_id: Option<&str>,
    ) -> RepositoryResult<LibraryItem> {
        let mut transaction = self.pool.begin().await?;
        if let Some(project_id) = project_id {
            let exists: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ? AND archived_at IS NULL)",
            )
            .bind(project_id)
            .fetch_one(&mut *transaction)
            .await?;
            if !exists {
                return Err(RepositoryError::Validation("project is unavailable"));
            }
        }

        let result = sqlx::query(
            "UPDATE items SET project_id = ?, \
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
             WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(project_id)
        .bind(id)
        .execute(&mut *transaction)
        .await?;
        if result.rows_affected() == 0 {
            return Err(RepositoryError::NotFound);
        }

        sqlx::query(
            "INSERT INTO activity (id, item_id, project_id, action, created_at) \
             VALUES (?, ?, ?, 'move_item', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(id)
        .bind(project_id)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;

        self.get_item(id).await
    }

    pub async fn list_categories(&self) -> RepositoryResult<Vec<Category>> {
        let rows = sqlx::query_as::<_, CategoryRow>(
            "SELECT id, name, built_in FROM categories ORDER BY name COLLATE NOCASE, rowid",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    pub async fn get_category(&self, id: &str) -> RepositoryResult<Category> {
        let row = sqlx::query_as::<_, CategoryRow>(
            "SELECT id, name, built_in FROM categories WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(RepositoryError::NotFound)?;
        Ok(row.into())
    }

    pub async fn save_category(&self, input: SaveCategoryInput) -> RepositoryResult<Category> {
        let name = input.name.trim();
        if name.is_empty() || name.chars().count() > 50 {
            return Err(RepositoryError::Validation(
                "name must contain 1 to 50 characters",
            ));
        }
        let id = input
            .id
            .clone()
            .unwrap_or_else(|| Uuid::new_v4().to_string());

        if input.id.is_some() {
            let built_in: Option<bool> =
                sqlx::query_scalar("SELECT built_in FROM categories WHERE id = ?")
                    .bind(&id)
                    .fetch_optional(&self.pool)
                    .await?;
            match built_in {
                None => return Err(RepositoryError::NotFound),
                Some(true) => {
                    return Err(RepositoryError::Validation(
                        "built-in categories cannot be renamed",
                    ));
                }
                Some(false) => {}
            }
            sqlx::query("UPDATE categories SET name = ? WHERE id = ?")
                .bind(name)
                .bind(&id)
                .execute(&self.pool)
                .await
                .map_err(|error| map_unique(error, "a category with that name already exists"))?;
        } else {
            sqlx::query(
                "INSERT INTO categories (id, name, built_in, created_at) \
                 VALUES (?, ?, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            )
            .bind(&id)
            .bind(name)
            .execute(&self.pool)
            .await
            .map_err(|error| map_unique(error, "a category with that name already exists"))?;
        }

        self.get_category(&id).await
    }

    pub async fn list_tags(&self) -> RepositoryResult<Vec<Tag>> {
        let sql = format!(
            "SELECT {TAG_COLUMNS} FROM tags ORDER BY usage_count DESC, name COLLATE NOCASE, rowid"
        );
        let rows = sqlx::query_as::<_, TagRow>(&sql)
            .fetch_all(&self.pool)
            .await?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    pub async fn get_tag(&self, id: &str) -> RepositoryResult<Tag> {
        let sql = format!("SELECT {TAG_COLUMNS} FROM tags WHERE id = ?");
        let row = sqlx::query_as::<_, TagRow>(&sql)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?
            .ok_or(RepositoryError::NotFound)?;
        Ok(row.into())
    }

    pub async fn save_tag(&self, input: SaveTagInput) -> RepositoryResult<Tag> {
        let name = input.name.trim();
        if name.is_empty() || name.chars().count() > 50 {
            return Err(RepositoryError::Validation(
                "name must contain 1 to 50 characters",
            ));
        }
        if !is_hex_color(&input.color) {
            return Err(RepositoryError::Validation(
                "color must be a #RRGGBB hex value",
            ));
        }
        let id = input
            .id
            .clone()
            .unwrap_or_else(|| Uuid::new_v4().to_string());

        if input.id.is_some() {
            let result = sqlx::query("UPDATE tags SET name = ?, color = ? WHERE id = ?")
                .bind(name)
                .bind(&input.color)
                .bind(&id)
                .execute(&self.pool)
                .await
                .map_err(|error| map_unique(error, "a tag with that name already exists"))?;
            if result.rows_affected() == 0 {
                return Err(RepositoryError::NotFound);
            }
        } else {
            sqlx::query(
                "INSERT INTO tags (id, name, color, usage_count, created_at) \
                 VALUES (?, ?, ?, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            )
            .bind(&id)
            .bind(name)
            .bind(&input.color)
            .execute(&self.pool)
            .await
            .map_err(|error| map_unique(error, "a tag with that name already exists"))?;
        }

        self.get_tag(&id).await
    }

    pub async fn merge_tags(&self, source_id: &str, target_id: &str) -> RepositoryResult<Tag> {
        if source_id == target_id {
            return Err(RepositoryError::Validation(
                "cannot merge a tag into itself",
            ));
        }
        let mut transaction = self.pool.begin().await?;
        let found: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tags WHERE id IN (?, ?)")
            .bind(source_id)
            .bind(target_id)
            .fetch_one(&mut *transaction)
            .await?;
        if found < 2 {
            return Err(RepositoryError::NotFound);
        }

        sqlx::query(
            "INSERT OR IGNORE INTO item_tags (item_id, tag_id) \
             SELECT item_id, ? FROM item_tags WHERE tag_id = ?",
        )
        .bind(target_id)
        .bind(source_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "INSERT OR IGNORE INTO project_tags (project_id, tag_id) \
             SELECT project_id, ? FROM project_tags WHERE tag_id = ?",
        )
        .bind(target_id)
        .bind(source_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query("DELETE FROM tags WHERE id = ?")
            .bind(source_id)
            .execute(&mut *transaction)
            .await?;
        transaction.commit().await?;

        self.get_tag(target_id).await
    }
}

#[derive(FromRow)]
struct CategoryRow {
    id: String,
    name: String,
    built_in: bool,
}

impl From<CategoryRow> for Category {
    fn from(row: CategoryRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            built_in: row.built_in,
        }
    }
}

#[derive(FromRow)]
struct TagRow {
    id: String,
    name: String,
    color: String,
    usage_count: i64,
}

impl From<TagRow> for Tag {
    fn from(row: TagRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            color: row.color,
            usage_count: row.usage_count,
        }
    }
}

#[derive(FromRow)]
struct ProjectRow {
    id: String,
    name: String,
    description: Option<String>,
    archived_at: Option<String>,
    created_at: String,
    updated_at: String,
}

impl From<ProjectRow> for Project {
    fn from(row: ProjectRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            description: row.description,
            archived_at: row.archived_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
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
    private: bool,
    tag_ids_json: String,
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
            private: row.private,
            tag_ids: serde_json::from_str(&row.tag_ids_json)
                .map_err(|_| RepositoryError::CorruptData("invalid item tag data"))?,
            archived_at: row.archived_at,
            expires_at: row.expires_at,
            usage_count: row.usage_count,
            last_used_at: row.last_used_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }
}

fn map_unique(error: sqlx::Error, message: &'static str) -> RepositoryError {
    if error
        .as_database_error()
        .is_some_and(|database| database.is_unique_violation())
    {
        RepositoryError::Validation(message)
    } else {
        RepositoryError::Storage(error)
    }
}

fn is_hex_color(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 7
        && bytes[0] == b'#'
        && bytes[1..].iter().all(u8::is_ascii_hexdigit)
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

fn fts_match(text: Option<&str>) -> Option<String> {
    let terms: Vec<String> = text?
        .split_whitespace()
        .map(|term| {
            let cleaned: String = term.chars().filter(|c| c.is_alphanumeric()).collect();
            cleaned
        })
        .filter(|term| !term.is_empty())
        .map(|term| format!("{term}*"))
        .collect();
    if terms.is_empty() {
        None
    } else {
        Some(terms.join(" "))
    }
}

fn push_conditions(
    builder: &mut QueryBuilder<'_, Sqlite>,
    query: &SearchQuery,
    fts: Option<&str>,
) {
    builder.push(" WHERE deleted_at IS NULL AND archived_at IS NULL");

    if let Some(fts) = fts {
        builder.push(" AND id IN (SELECT item_id FROM items_fts WHERE items_fts MATCH ");
        builder.push_bind(fts.to_string());
        builder.push(")");
    }

    if !query.kinds.is_empty() {
        builder.push(" AND kind IN (");
        let mut separated = builder.separated(", ");
        for kind in &query.kinds {
            separated.push_bind(item_kind(kind));
        }
        separated.push_unseparated(")");
    }

    if !query.content_types.is_empty() {
        builder.push(" AND content_type IN (");
        let mut separated = builder.separated(", ");
        for content_type in &query.content_types {
            separated.push_bind(content_type_name(content_type));
        }
        separated.push_unseparated(")");
    }

    if !query.languages.is_empty() {
        builder.push(" AND language IN (");
        let mut separated = builder.separated(", ");
        for language in &query.languages {
            separated.push_bind(language.clone());
        }
        separated.push_unseparated(")");
    }

    if !query.project_ids.is_empty() {
        builder.push(" AND project_id IN (");
        let mut separated = builder.separated(", ");
        for project_id in &query.project_ids {
            separated.push_bind(project_id.clone());
        }
        separated.push_unseparated(")");
    }

    if !query.category_ids.is_empty() {
        builder.push(" AND category_id IN (");
        let mut separated = builder.separated(", ");
        for category_id in &query.category_ids {
            separated.push_bind(category_id.clone());
        }
        separated.push_unseparated(")");
    }

    if !query.tag_ids.is_empty() {
        builder.push(" AND id IN (SELECT item_id FROM item_tags WHERE tag_id IN (");
        let mut separated = builder.separated(", ");
        for tag_id in &query.tag_ids {
            separated.push_bind(tag_id.clone());
        }
        separated.push_unseparated("))");
    }

    if let Some(pinned) = query.pinned {
        builder.push(" AND pinned = ");
        builder.push_bind(i64::from(pinned));
    }

    if let Some(favorite) = query.favorite {
        builder.push(" AND favorite = ");
        builder.push_bind(i64::from(favorite));
    }

    if let Some(created_from) = query.created_from.as_deref() {
        builder.push(" AND created_at >= ");
        builder.push_bind(created_from.to_string());
    }

    if let Some(created_to) = query.created_to.as_deref() {
        builder.push(" AND created_at <= ");
        builder.push_bind(created_to.to_string());
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
