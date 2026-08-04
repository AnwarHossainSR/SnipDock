use crate::models::{
    ContentTypeCount, MostUsedItem, TypeCount, UsageAnalytics,
};
use crate::storage::RepositoryResult;
use sqlx::SqlitePool;

pub struct AnalyticsRepository {
    pool: SqlitePool,
}

impl AnalyticsRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn get_analytics(&self) -> RepositoryResult<UsageAnalytics> {
        let total_items: i64 = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM items WHERE deleted_at IS NULL")
            .fetch_one(&self.pool)
            .await?;

        let total_copies: i64 = sqlx::query_scalar::<_, i64>("SELECT COALESCE(SUM(usage_count), 0) FROM items WHERE deleted_at IS NULL")
            .fetch_one(&self.pool)
            .await?;

        let items_by_type = self.get_items_by_type().await?;
        let items_by_content_type = self.get_items_by_content_type().await?;
        let most_used_items = self.get_most_used_items(10).await?;
        let recent_activity = self.get_recent_activity(20).await?;
        let storage_used_bytes = self.get_storage_used().await?;

        Ok(UsageAnalytics {
            total_items,
            total_copies,
            items_by_type,
            items_by_content_type,
            most_used_items,
            recent_activity,
            storage_used_bytes,
        })
    }

    async fn get_items_by_type(&self) -> RepositoryResult<Vec<TypeCount>> {
        let rows: Vec<(String, i64)> = sqlx::query_as(
            "SELECT kind, COUNT(*) as count FROM items WHERE deleted_at IS NULL GROUP BY kind ORDER BY count DESC"
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|(kind, count)| TypeCount { kind, count })
            .collect())
    }

    async fn get_items_by_content_type(&self) -> RepositoryResult<Vec<ContentTypeCount>> {
        let rows: Vec<(String, i64)> = sqlx::query_as(
            "SELECT content_type, COUNT(*) as count FROM items WHERE deleted_at IS NULL GROUP BY content_type ORDER BY count DESC"
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|(content_type, count)| ContentTypeCount { content_type, count })
            .collect())
    }

    async fn get_most_used_items(&self, limit: i64) -> RepositoryResult<Vec<MostUsedItem>> {
        let rows: Vec<(String, Option<String>, String, i64, Option<String>)> = sqlx::query_as(
            "SELECT id, title, content_type, usage_count, last_used_at 
             FROM items 
             WHERE deleted_at IS NULL AND usage_count > 0
             ORDER BY usage_count DESC 
             LIMIT ?"
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|(id, title, content_type, usage_count, last_used_at)| MostUsedItem {
                id,
                title,
                content_type,
                usage_count,
                last_used_at,
            })
            .collect())
    }

    async fn get_recent_activity(&self, limit: i64) -> RepositoryResult<Vec<crate::models::ActivityEntry>> {
        let rows: Vec<(String, String, Option<String>)> = sqlx::query_as(
            "SELECT item_id, 'copied' as action, last_used_at as timestamp
             FROM items 
             WHERE deleted_at IS NULL AND last_used_at IS NOT NULL
             ORDER BY last_used_at DESC 
             LIMIT ?"
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .filter_map(|(item_id, action, timestamp)| {
                Some(crate::models::ActivityEntry {
                    item_id,
                    action,
                    timestamp: timestamp?,
                })
            })
            .collect())
    }

    async fn get_storage_used(&self) -> RepositoryResult<i64> {
        let total: Option<i64> = sqlx::query_scalar(
            "SELECT COALESCE(SUM(LENGTH(content)), 0) FROM items WHERE deleted_at IS NULL"
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(total.unwrap_or(0))
    }
}
