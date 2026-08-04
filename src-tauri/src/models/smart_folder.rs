use serde::{Deserialize, Serialize};

use super::{Id, SearchQuery};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SmartFolder {
    pub id: Id,
    pub name: String,
    pub description: Option<String>,
    pub query: SearchQuery,
    pub icon: String,
    pub color: String,
    pub position: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SaveSmartFolderInput {
    pub id: Option<Id>,
    pub name: String,
    pub description: Option<String>,
    pub query: SearchQuery,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub position: Option<i32>,
}
