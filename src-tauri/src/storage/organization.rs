use super::{Repository, RepositoryError, RepositoryResult};
use crate::models::{
    Category, LibraryItem, Project, SaveCategoryInput, SaveProjectInput, SaveTagInput, Tag,
};
use sqlx::FromRow;
use std::collections::HashSet;
use uuid::Uuid;

const TAG_COLUMNS: &str = "id, name, color, \
    (SELECT COUNT(*) FROM item_tags WHERE tag_id = tags.id) \
    + (SELECT COUNT(*) FROM project_tags WHERE tag_id = tags.id) AS usage_count";

impl Repository {
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

    /// Replaces the tags on one capture. `save_item` can do this, but only by
    /// rewriting the whole row, which a list that only wants to attach a label
    /// has no business doing.
    pub async fn set_item_tags(&self, id: &str, tag_ids: &[String]) -> RepositoryResult<LibraryItem> {
        let mut transaction = self.pool.begin().await?;
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM items WHERE id = ? AND deleted_at IS NULL)",
        )
        .bind(id)
        .fetch_one(&mut *transaction)
        .await?;
        if !exists {
            return Err(RepositoryError::NotFound);
        }

        for tag_id in tag_ids {
            let known: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM tags WHERE id = ?)")
                .bind(tag_id)
                .fetch_one(&mut *transaction)
                .await?;
            if !known {
                return Err(RepositoryError::Validation("tag is unavailable"));
            }
        }

        sqlx::query("DELETE FROM item_tags WHERE item_id = ?")
            .bind(id)
            .execute(&mut *transaction)
            .await?;
        for tag_id in tag_ids {
            sqlx::query("INSERT INTO item_tags (item_id, tag_id) VALUES (?, ?)")
                .bind(id)
                .bind(tag_id)
                .execute(&mut *transaction)
                .await?;
        }
        sqlx::query(
            "UPDATE items SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
        )
        .bind(id)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;

        self.get_item(id).await
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
