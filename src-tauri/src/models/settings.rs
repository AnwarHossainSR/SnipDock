use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use super::ContentType;

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

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SettingsPatch {
    pub values: BTreeMap<String, serde_json::Value>,
}
