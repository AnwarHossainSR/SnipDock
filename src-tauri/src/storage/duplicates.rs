use crate::storage::RepositoryResult;
use sqlx::SqlitePool;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct DuplicateGroup {
    pub content_hash: String,
    pub count: i64,
    pub items: Vec<DuplicateItem>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct DuplicateItem {
    pub id: String,
    pub title: Option<String>,
    pub content_type: String,
    pub created_at: String,
    pub usage_count: i64,
}

pub struct DuplicateRepository {
    pool: SqlitePool,
}

impl DuplicateRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn find_duplicates(&self) -> RepositoryResult<Vec<DuplicateGroup>> {
        let rows: Vec<(String, i64)> = sqlx::query_as(
            "SELECT content_hash, COUNT(*) as count
             FROM items
             WHERE deleted_at IS NULL AND content_hash != ''
             GROUP BY content_hash
             HAVING COUNT(*) > 1
             ORDER BY count DESC
             LIMIT 100"
        )
        .fetch_all(&self.pool)
        .await?;

        let mut groups = Vec::new();
        for (content_hash, count) in rows {
            let items = self.get_items_by_hash(&content_hash).await?;
            groups.push(DuplicateGroup {
                content_hash,
                count,
                items,
            });
        }

        Ok(groups)
    }

    async fn get_items_by_hash(&self, hash: &str) -> RepositoryResult<Vec<DuplicateItem>> {
        let rows: Vec<(String, Option<String>, String, String, i64)> = sqlx::query_as(
            "SELECT id, title, content_type, created_at, usage_count
             FROM items
             WHERE content_hash = ? AND deleted_at IS NULL
             ORDER BY created_at DESC"
        )
        .bind(hash)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|(id, title, content_type, created_at, usage_count)| DuplicateItem {
                id,
                title,
                content_type,
                created_at,
                usage_count,
            })
            .collect())
    }

    pub async fn merge_duplicates(
        &self,
        keep_id: &str,
        duplicate_ids: &[String],
    ) -> RepositoryResult<i64> {
        let mut tx = self.pool.begin().await?;

        // Soft-delete the duplicate items
        let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%fZ").to_string();
        let mut deleted_count = 0;

        for id in duplicate_ids {
            let result = sqlx::query(
                "UPDATE items SET deleted_at = ?, updated_at = ?
                 WHERE id = ? AND deleted_at IS NULL"
            )
            .bind(&now)
            .bind(&now)
            .bind(id)
            .execute(&mut *tx)
            .await?;
            deleted_count += result.rows_affected() as i64;
        }

        // Update the kept item's usage count to be the sum of all duplicates.
        // Build an IN clause with one `?` per id so SQLite receives individual
        // values instead of a single comma-joined string. The subquery must not
        // filter on `deleted_at`: the duplicates were soft-deleted a few lines
        // above, so that filter would sum the kept row alone and every use the
        // merged copies had recorded would be lost.
        let all_ids: Vec<String> = std::iter::once(keep_id.to_string())
            .chain(duplicate_ids.iter().cloned())
            .collect();
        let placeholders = all_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");

        let query = format!(
            "UPDATE items SET
                usage_count = (SELECT COALESCE(SUM(usage_count), 0) FROM items WHERE id IN ({placeholders})),
                updated_at = ?
             WHERE id = ? AND deleted_at IS NULL"
        );

        let mut stmt = sqlx::query(&query);
        for id in &all_ids {
            stmt = stmt.bind(id);
        }
        stmt = stmt.bind(&now).bind(keep_id);
        stmt.execute(&mut *tx).await?;

        tx.commit().await?;
        Ok(deleted_count)
    }

    pub async fn get_duplicate_count(&self) -> RepositoryResult<i64> {
        let result: Option<i64> = sqlx::query_scalar(
            "SELECT COUNT(*) FROM (
                SELECT content_hash
                FROM items
                WHERE deleted_at IS NULL AND content_hash != ''
                GROUP BY content_hash
                HAVING COUNT(*) > 1
            )"
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(result.unwrap_or(0))
    }
}
