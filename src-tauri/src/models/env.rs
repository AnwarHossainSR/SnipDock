use serde::{Deserialize, Serialize};

use super::Id;

/// A named set of environment variables - one project's `.env`, one deploy
/// target's configuration.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct EnvGroup {
    pub id: Id,
    pub name: String,
    pub description: Option<String>,
    pub position: i64,
    pub var_count: i64,
    pub secret_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct EnvVar {
    pub id: Id,
    pub group_id: Id,
    pub key: String,
    /// Any text: a single value, several lines, a JSON document.
    pub value: String,
    /// Masked in the UI until revealed. Not encryption.
    pub secret: bool,
    pub note: Option<String>,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// Creates a set when `id` is absent and renames one when it is present.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SaveEnvGroupInput {
    pub id: Option<Id>,
    pub name: String,
    pub description: Option<String>,
}

/// Creates a variable when `id` is absent and edits one when it is present.
/// A variable never moves between sets, so `group_id` is read on create only.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SaveEnvVarInput {
    pub id: Option<Id>,
    pub group_id: Id,
    pub key: String,
    pub value: String,
    pub secret: bool,
    pub note: Option<String>,
}

/// One variable of a bulk import, already parsed from `.env` or JSON text by
/// the frontend.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct EnvVarEntry {
    pub key: String,
    pub value: String,
    pub secret: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ImportEnvVarsInput {
    pub group_id: Id,
    pub entries: Vec<EnvVarEntry>,
    /// Replace the value of a key the set already has. Off, such a key is
    /// left alone and counted as skipped.
    pub overwrite: bool,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct ImportEnvReport {
    pub added: u32,
    pub updated: u32,
    pub skipped: u32,
}
