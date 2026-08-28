use crate::storage::RepositoryResult;
use sqlx::SqlitePool;
use std::sync::OnceLock;
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

static DETECTOR: OnceLock<SensitiveContentDetector> = OnceLock::new();

impl SensitiveContentDetector {
    pub fn new() -> Result<Self, regex::Error> {
        let patterns = SENSITIVE_PATTERNS
            .iter()
            .map(|pattern| regex::Regex::new(pattern))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self { patterns })
    }

    /// Return a lazily-compiled, process-wide singleton.
    pub fn instance() -> Result<&'static Self, regex::Error> {
        Ok(DETECTOR.get_or_init(|| Self::new().expect("sensitive patterns are valid")))
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
        let detector = SensitiveContentDetector::instance()
            .map_err(|_| crate::storage::RepositoryError::Validation("invalid regex pattern"))?;

        let items = self.get_old_items(&cutoff_str).await?;
        let cleared_ids: Vec<String> = items
            .into_iter()
            .filter(|item| detector.is_sensitive(&item.content))
            .map(|item| item.id)
            .collect();

        if cleared_ids.is_empty() {
            return Ok(ClearSensitiveResult {
                cleared_count: 0,
                cleared_ids,
                receipt_id: None,
                expires_at: None,
            });
        }

        // Under one receipt, like every other delete in the app: a sweep that
        // catches more than the user expected can be taken back.
        let mut transaction = self.pool.begin().await?;
        let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%fZ").to_string();
        for id in &cleared_ids {
            sqlx::query("UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?")
                .bind(&now)
                .bind(&now)
                .bind(id)
                .execute(&mut *transaction)
                .await?;
        }

        let receipt_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO trash_receipts (id, operation, created_at, expires_at)              VALUES (?, 'clear_sensitive_data', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),              strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 seconds'))",
        )
        .bind(&receipt_id)
        .execute(&mut *transaction)
        .await?;
        for id in &cleared_ids {
            sqlx::query("INSERT INTO trash_items (receipt_id, item_id) VALUES (?, ?)")
                .bind(&receipt_id)
                .bind(id)
                .execute(&mut *transaction)
                .await?;
        }
        let expires_at: String =
            sqlx::query_scalar("SELECT expires_at FROM trash_receipts WHERE id = ?")
                .bind(&receipt_id)
                .fetch_one(&mut *transaction)
                .await?;
        transaction.commit().await?;

        Ok(ClearSensitiveResult {
            cleared_count: cleared_ids.len() as i64,
            cleared_ids,
            receipt_id: Some(receipt_id),
            expires_at: Some(expires_at),
        })
    }

    async fn get_old_items(&self, cutoff: &str) -> RepositoryResult<Vec<OldItem>> {
        let rows: Vec<(String, String, Option<String>, String, i64, String)> = sqlx::query_as(
            // `content` is declared BLOB, so it has to be cast the way
            // `ITEM_COLUMNS` does or the row fails to decode as a String.
            "SELECT id, kind, title, CAST(content AS TEXT) AS content, usage_count, created_at
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

}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct ClearSensitiveResult {
    pub cleared_count: i64,
    pub cleared_ids: Vec<String>,
    /// Present only when something was swept, so the caller can offer an undo.
    pub receipt_id: Option<String>,
    pub expires_at: Option<String>,
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
