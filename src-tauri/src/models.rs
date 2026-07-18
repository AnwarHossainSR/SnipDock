use serde::{Deserialize, Serialize};

pub type Id = String;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ItemKind {
    Clipboard,
    Snippet,
    Command,
    Template,
    Note,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ContentType {
    PlainText,
    Code,
    Json,
    Sql,
    Html,
    Css,
    Xml,
    Shell,
    Markdown,
    Config,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SortOrder {
    Newest,
    Oldest,
    MostUsed,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct LibraryItem {
    pub id: Id,
    pub kind: ItemKind,
    pub title: Option<String>,
    pub description: Option<String>,
    pub content: String,
    pub notes: Option<String>,
    pub content_type: ContentType,
    pub language: Option<String>,
    pub project_id: Option<Id>,
    pub category_id: Option<Id>,
    pub pinned: bool,
    pub favorite: bool,
    pub private: bool,
    pub tag_ids: Vec<Id>,
    pub archived_at: Option<String>,
    pub expires_at: Option<String>,
    pub usage_count: i64,
    pub last_used_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Page<T> {
    pub items: Vec<T>,
    pub total: i64,
    pub limit: u32,
    pub offset: u32,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SearchQuery {
    pub text: Option<String>,
    pub kinds: Vec<ItemKind>,
    pub content_types: Vec<ContentType>,
    pub languages: Vec<String>,
    pub project_ids: Vec<Id>,
    pub category_ids: Vec<Id>,
    pub tag_ids: Vec<Id>,
    pub pinned: Option<bool>,
    pub favorite: Option<bool>,
    pub created_from: Option<String>,
    pub created_to: Option<String>,
    pub sort: SortOrder,
    pub limit: u32,
    pub offset: u32,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Project {
    pub id: Id,
    pub name: String,
    pub description: Option<String>,
    pub archived_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Tag {
    pub id: Id,
    pub name: String,
    pub color: String,
    pub usage_count: i64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Category {
    pub id: Id,
    pub name: String,
    pub built_in: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SaveItemInput {
    pub id: Option<Id>,
    pub kind: ItemKind,
    pub title: Option<String>,
    pub description: Option<String>,
    pub content: String,
    pub notes: Option<String>,
    pub project_id: Option<Id>,
    pub category_id: Option<Id>,
    pub tag_ids: Vec<Id>,
    pub private: bool,
    pub expires_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SaveProjectInput {
    pub id: Option<Id>,
    pub name: String,
    pub description: Option<String>,
    pub tag_ids: Vec<Id>,
    #[serde(default)]
    pub archived: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SaveTagInput {
    pub id: Option<Id>,
    pub name: String,
    pub color: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SaveCategoryInput {
    pub id: Option<Id>,
    pub name: String,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct ItemFlags {
    pub pinned: Option<bool>,
    pub favorite: Option<bool>,
    pub archived: Option<bool>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CopyMode {
    Raw,
    Formatted,
    RenderedTemplate,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct CopyReceipt {
    pub item_id: Id,
    pub copied_at: String,
    pub auto_clear_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct DeleteReceipt {
    pub id: Id,
    pub item_count: i64,
    pub expires_at: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Settings {
    pub clipboard_tracking: bool,
    pub history_days: u32,
    pub max_items: u32,
    pub ignored_apps: Vec<String>,
    pub ignored_patterns: Vec<String>,
    pub ignored_content_types: Vec<ContentType>,
    pub auto_delete_days: Option<u32>,
    pub open_shortcut: String,
    pub new_snippet_shortcut: String,
    pub theme: String,
    pub start_with_os: bool,
    pub minimize_to_tray: bool,
    pub always_on_top: bool,
    pub compact_mode: bool,
    pub notifications: bool,
    pub formatter_indent: u32,
    pub backup_interval_hours: u32,
    pub backup_retention: u32,
    pub auto_clear_secret_seconds: Option<u32>,
    pub lock_after_minutes: Option<u32>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            clipboard_tracking: true,
            history_days: 30,
            max_items: 500,
            ignored_apps: Vec::new(),
            ignored_patterns: Vec::new(),
            ignored_content_types: Vec::new(),
            auto_delete_days: None,
            open_shortcut: "CmdOrCtrl+Shift+V".into(),
            new_snippet_shortcut: "CmdOrCtrl+Shift+N".into(),
            theme: "system".into(),
            start_with_os: false,
            minimize_to_tray: true,
            always_on_top: false,
            compact_mode: false,
            notifications: true,
            formatter_indent: 2,
            backup_interval_hours: 24,
            backup_retention: 7,
            auto_clear_secret_seconds: None,
            lock_after_minutes: None,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FormatOperation {
    Pretty,
    Minify,
    Validate,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct FormatRequest {
    pub content: String,
    pub content_type: ContentType,
    pub operation: FormatOperation,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Diagnostic {
    pub message: String,
    pub line: Option<u32>,
    pub column: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct FormatResult {
    pub output: String,
    pub valid: bool,
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct RenderTemplateRequest {
    pub template: String,
    pub values: std::collections::BTreeMap<String, String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct RenderTemplateResult {
    pub output: Option<String>,
    pub missing: Vec<String>,
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SettingsPatch {
    pub values: std::collections::BTreeMap<String, serde_json::Value>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ToolRequest {
    pub tool: String,
    pub input: serde_json::Value,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ToolResult {
    pub output: serde_json::Value,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ExportRequest {
    pub format: String,
    pub item_ids: Vec<Id>,
    pub project_ids: Vec<Id>,
    pub path: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ExportReceipt {
    pub path: String,
    pub item_count: i64,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ImportRequest {
    pub paths: Vec<String>,
    pub duplicate_policy: String,
    pub dry_run: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ImportReport {
    pub created: i64,
    pub updated: i64,
    pub skipped: i64,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct BackupRequest {
    pub path: String,
    pub encrypted: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct BackupReceipt {
    pub path: String,
    pub checksum: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct RestoreRequest {
    pub path: String,
    pub passphrase: Option<String>,
    pub dry_run: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct RestoreReport {
    pub schema_version: u32,
    pub item_count: i64,
    pub warnings: Vec<String>,
}
