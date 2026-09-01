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
    /// Clipboard image. `content` holds the relative path of the stored PNG
    /// rather than the pixels themselves -- see [`crate::images`].
    Image,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SortOrder {
    Newest,
    Oldest,
    MostUsed,
    /// Kept captures first, then newest. A separate order rather than a change
    /// to `Newest`, so nothing that relies on strict chronology is surprised.
    PinnedFirst,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct LibraryItem {
    pub id: Id,
    pub kind: ItemKind,
    pub title: Option<String>,
    pub description: Option<String>,
    pub content: String,
    pub content_type: ContentType,
    pub notes: Option<String>,
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
    /// Foreground executable that produced this clipboard capture. `None` for
    /// items the user added by hand, which never had a source app.
    #[serde(default)]
    pub source_app: Option<String>,
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
    /// Restrict to captures from the named executables. Empty / unset means
    /// "no source-app filter".
    #[serde(default)]
    pub source_apps: Vec<String>,
    /// Treat `text` (and the row content) as a regex pattern when set. The
    /// backend compiles the pattern and applies it on top of the FTS5
    /// pre-filter; an invalid pattern is rejected with a typed error.
    #[serde(default)]
    pub regex: Option<String>,
    /// Applies only when `regex` is `Some`. Defaults to case-sensitive.
    #[serde(default)]
    pub regex_case_insensitive: Option<bool>,
    #[serde(default)]
    pub group_by: Option<GroupBy>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GroupBy {
    Date,
    ContentType,
    Kind,
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
    pub content_type: ContentType,
    pub notes: Option<String>,
    pub project_id: Option<Id>,
    pub category_id: Option<Id>,
    pub tag_ids: Vec<Id>,
    pub private: bool,
    pub expires_at: Option<String>,
    /// Foreground executable recorded at capture time. `None` for items added
    /// by hand; the capture path sets it before calling `save_item`.
    #[serde(default)]
    pub source_app: Option<String>,
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

/// A built-in pipeline run on a clipboard item at paste/copy time. `None`
/// (absent in the wire form) leaves the content unchanged; each variant
/// corresponds to a one-key binding in the Quick Paste UI.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Transform {
    Trim,
    Lowercase,
    Uppercase,
    SortDedupeLines,
    JsonPretty,
    JsonMinify,
    Base64Encode,
    Base64Decode,
    UrlEncode,
    UrlDecode,
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
