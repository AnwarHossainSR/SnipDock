use serde::{Deserialize, Serialize};

use super::Id;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct UsageAnalytics {
    pub total_items: i64,
    pub total_copies: i64,
    pub items_by_type: Vec<TypeCount>,
    pub items_by_content_type: Vec<ContentTypeCount>,
    pub most_used_items: Vec<MostUsedItem>,
    pub recent_activity: Vec<ActivityEntry>,
    pub storage_used_bytes: i64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct TypeCount {
    pub kind: String,
    pub count: i64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ContentTypeCount {
    pub content_type: String,
    pub count: i64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct MostUsedItem {
    pub id: Id,
    pub title: Option<String>,
    pub content_type: String,
    pub usage_count: i64,
    pub last_used_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ActivityEntry {
    pub item_id: Id,
    pub action: String,
    pub timestamp: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct CleanupSuggestion {
    pub reason: String,
    pub item_count: i64,
    pub potential_savings_bytes: i64,
    pub items: Vec<CleanupCandidate>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct CleanupCandidate {
    pub id: Id,
    pub title: Option<String>,
    pub content_type: String,
    pub created_at: String,
    pub usage_count: i64,
}
