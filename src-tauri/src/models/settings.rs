use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use super::ContentType;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(default)]
pub struct Settings {
    pub clipboard_tracking: bool,
    pub history_days: u32,
    pub max_items: u32,
    pub ignored_apps: Vec<String>,
    pub ignored_patterns: Vec<String>,
    pub ignored_content_types: Vec<ContentType>,
    pub theme: String,
    pub minimize_to_tray: bool,
    pub start_with_system: bool,
    pub formatter_indent: u32,
    pub custom_shortcuts: BTreeMap<String, String>,
    pub paste_format: PasteFormat,
    pub encryption_enabled: bool,
    pub auto_clear_sensitive_minutes: Option<u32>,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PasteFormat {
    #[default]
    Preserve,
    PlainText,
    StripWhitespace,
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
            theme: "system".into(),
            minimize_to_tray: true,
            start_with_system: true,
            formatter_indent: 2,
            custom_shortcuts: BTreeMap::new(),
            paste_format: PasteFormat::default(),
            encryption_enabled: false,
            auto_clear_sensitive_minutes: None,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SettingsPatch {
    pub values: BTreeMap<String, serde_json::Value>,
}
