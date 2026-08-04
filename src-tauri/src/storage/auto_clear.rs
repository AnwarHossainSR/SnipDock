use crate::storage::RepositoryResult;
use sqlx::SqlitePool;
use std::time::Duration;

/// Patterns that indicate sensitive content (passwords, API keys, tokens, etc.)
const SENSITIVE_PATTERNS: &[&str] = &[
    // Passwords
    r"(?i)password\s*[:=]\s*\S+",
    r"(?i)passwd\s*[:=]\s*\S+",
    r"(?i)pwd\s*[:=]\s*\S+",
    // API Keys
    r"(?i)api[_-]?key\s*[:=]\s*\S+",
    r"(?i)apikey\s*[:=]\s*\S+",
    // Tokens
    r"(?i)token\s*[:=]\s*\S+",
    r"(?i)access[_-]?token\s*[:=]\s*\S+",
    r"(?i)auth[_-]?token\s*[:=]\s*\S+",
    // Secrets
    r"(?i)secret\s*[:=]\s*\S+",
    r"(?i)client[_-]?secret\s*[:=]\s*\S+",
    // AWS
    r"AKIA[0-9A-Z]{16}",
    r"(?i)aws[_-]?secret[_-]?access[_-]?key\s*[:=]\s*\S+",
    // GitHub
    r"ghp_[0-9a-zA-Z]{36}",
    r"gho_[0-9a-zA-Z]{36}",
    r"ghu_[0-9a-zA-Z]{36}",
    r"ghs_[0-9a-zA-Z]{36}",
    r"ghr_[0-9a-zA-Z]{36}",
    // Private Keys
    r"-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----",
    // JWT
    r"eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*",
    // Connection Strings
    r"(?i)(?:mysql|postgresql|mongodb|redis)://[^\s]+",
    // Credit Cards (basic pattern)
    r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b",
];

pub struct SensitiveContentDetector {
    patterns: Vec<regex::Regex>,
}

impl SensitiveContentDetector {
    pub fn new() -> Result<Self, regex::Error> {
        let patterns = SENSITIVE_PATTERNS
            .iter()
            .map(|pattern| regex::Regex::new(pattern))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self { patterns })
    }

    pub fn is_sensitive(&self, content: &str) -> bool {
        self.patterns.iter().any(|pattern| pattern.is_match(content))
    }
}

pub struct AutoClearRepository {
    pool: SqlitePool,
}

impl AutoClearRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn clear_sensitive_items(
        &self,
        max_age: Duration,
    ) -> RepositoryResult<ClearSensitiveResult> {
        let cutoff = chrono::Utc::now() - chrono::Duration::from_std(max_age).unwrap_or(chrono::Duration::hours(24));
        let cutoff_str = cutoff.format("%Y-%m-%dT%H:%M:%fZ").to_string();

        // Find items that match sensitive patterns
        let detector = SensitiveContentDetector::new()
            .map_err(|_| crate::storage::RepositoryError::Validation("invalid regex pattern"))?;

        let items = self.get_old_items(&cutoff_str).await?;
        let mut cleared_count = 0;
        let mut cleared_ids = Vec::new();

        for item in items {
            if detector.is_sensitive(&item.content) {
                self.soft_delete_item(&item.id).await?;
                cleared_count += 1;
                cleared_ids.push(item.id);
            }
        }

        Ok(ClearSensitiveResult {
            cleared_count,
            cleared_ids,
        })
    }

    async fn get_old_items(&self, cutoff: &str) -> RepositoryResult<Vec<OldItem>> {
        let rows: Vec<(String, String, Option<String>, String, i64, String)> = sqlx::query_as(
            "SELECT id, kind, title, content, usage_count, created_at
             FROM items
             WHERE created_at < ? AND deleted_at IS NULL AND private = 0
             ORDER BY created_at ASC
             LIMIT 1000"
        )
        .bind(cutoff)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|(id, kind, title, content, usage_count, created_at)| OldItem {
                id,
                kind,
                title,
                content,
                usage_count,
                created_at,
            })
            .collect())
    }

    async fn soft_delete_item(&self, id: &str) -> RepositoryResult<()> {
        let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%fZ").to_string();
        sqlx::query(
            "UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?"
        )
        .bind(&now)
        .bind(&now)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct ClearSensitiveResult {
    pub cleared_count: i64,
    pub cleared_ids: Vec<String>,
}

struct OldItem {
    id: String,
    #[allow(dead_code)]
    kind: String,
    #[allow(dead_code)]
    title: Option<String>,
    content: String,
    #[allow(dead_code)]
    usage_count: i64,
    #[allow(dead_code)]
    created_at: String,
}
