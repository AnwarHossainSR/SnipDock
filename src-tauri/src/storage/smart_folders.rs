use crate::models::{Id, SaveSmartFolderInput, SearchQuery, SmartFolder};
use crate::storage::{RepositoryError, RepositoryResult};
use sqlx::SqlitePool;

pub struct SmartFolderRepository {
    pool: SqlitePool,
}

impl SmartFolderRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> RepositoryResult<Vec<SmartFolder>> {
        let rows: Vec<SmartFolderRow> = sqlx::query_as(
            "SELECT id, name, description, query, icon, color, position, created_at, updated_at
             FROM smart_folders
             ORDER BY position ASC, name ASC"
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|row| row.into()).collect())
    }

    pub async fn get(&self, id: &str) -> RepositoryResult<SmartFolder> {
        let row: SmartFolderRow = sqlx::query_as(
            "SELECT id, name, description, query, icon, color, position, created_at, updated_at
             FROM smart_folders
             WHERE id = ?"
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(|error| match error {
            sqlx::error::Error::RowNotFound => RepositoryError::NotFound,
            other => RepositoryError::Storage(other),
        })?;

        Ok(row.into())
    }

    pub async fn save(&self, input: SaveSmartFolderInput) -> RepositoryResult<SmartFolder> {
        let id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%fZ").to_string();
        let query_json = serde_json::to_string(&input.query)
            .map_err(|_| RepositoryError::Validation("invalid query"))?;
        let icon = input.icon.unwrap_or_else(|| "folder".to_string());
        let color = input.color.unwrap_or_else(|| "#6366f1".to_string());
        let position = input.position.unwrap_or(0);

        sqlx::query(
            "INSERT INTO smart_folders (id, name, description, query, icon, color, position, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                query = excluded.query,
                icon = excluded.icon,
                color = excluded.color,
                position = excluded.position,
                updated_at = excluded.updated_at"
        )
        .bind(&id)
        .bind(&input.name)
        .bind(&input.description)
        .bind(&query_json)
        .bind(&icon)
        .bind(&color)
        .bind(position)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        self.get(&id).await
    }

    pub async fn delete(&self, id: &str) -> RepositoryResult<()> {
        let result = sqlx::query("DELETE FROM smart_folders WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(RepositoryError::NotFound);
        }

        Ok(())
    }

    pub async fn reorder(&self, ids: &[Id]) -> RepositoryResult<()> {
        let mut tx = self.pool.begin().await?;

        for (position, id) in ids.iter().enumerate() {
            sqlx::query(
                "UPDATE smart_folders SET position = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?"
            )
            .bind(position as i32)
            .bind(id)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }
}

#[derive(Debug, sqlx::FromRow)]
struct SmartFolderRow {
    id: String,
    name: String,
    description: Option<String>,
    query: String,
    icon: String,
    color: String,
    position: i32,
    created_at: String,
    updated_at: String,
}

impl From<SmartFolderRow> for SmartFolder {
    fn from(row: SmartFolderRow) -> Self {
        let query: SearchQuery = serde_json::from_str(&row.query)
            .unwrap_or_else(|_| SearchQuery {
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
                sort: crate::models::SortOrder::Newest,
                limit: 50,
                offset: 0,
                source_apps: Vec::new(),
                group_by: None,
            });

        SmartFolder {
            id: row.id,
            name: row.name,
            description: row.description,
            query,
            icon: row.icon,
            color: row.color,
            position: row.position,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}
