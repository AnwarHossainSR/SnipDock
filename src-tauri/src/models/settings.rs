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
    /// Light, dark, or follow the OS.
    pub theme: String,
    /// Which accent ramp the interface paints from. Stored beside the mode
    /// rather than in the webview, so a reinstall does not reset it.
    pub accent: String,
    pub minimize_to_tray: bool,
    pub start_with_system: bool,
    pub formatter_indent: u32,
    pub custom_shortcuts: BTreeMap<String, String>,
    pub paste_format: PasteFormat,
    pub encryption_enabled: bool,
    pub auto_clear_sensitive_minutes: Option<u32>,
    /// Rows the Clipboard page asks for per page. Persisted rather than kept in
    /// the webview's `localStorage`, which a reinstall wipes.
    pub clipboard_page_size: u32,
    pub updates: UpdateSettings,
    pub backup: BackupSettings,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PasteFormat {
    #[default]
    Preserve,
    PlainText,
    StripWhitespace,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum UpdateFrequency {
    #[default]
    OnLaunch,
    Daily,
    Weekly,
}

/// Update preferences. These lived in `localStorage` until a reinstall was
/// found to clear it, which silently reset "notify me" and re-offered versions
/// the user had already skipped -- and, because the checkbox that turns
/// notifications off had no visible counterpart, could leave the prompt off for
/// good. Persisted settings survive a reinstall and are editable in one place.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(default)]
pub struct UpdateSettings {
    pub notify: bool,
    pub frequency: UpdateFrequency,
    /// A version the user chose to skip; the prompt stays quiet until a
    /// different one is published.
    pub skipped_version: Option<String>,
    pub last_checked_at: Option<String>,
}

impl Default for UpdateSettings {
    fn default() -> Self {
        Self {
            notify: true,
            frequency: UpdateFrequency::default(),
            skipped_version: None,
            last_checked_at: None,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BackupSchedule {
    #[default]
    Manual,
    Daily,
    Weekly,
}

/// Where automatic backups are uploaded. R2 is S3's API on a different host, so
/// both take the same signed request and differ only in defaults the UI fills
/// in -- `auto` region and an account endpoint for R2.
#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CloudProvider {
    #[default]
    None,
    S3,
    R2,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(default)]
pub struct CloudBackupSettings {
    pub provider: CloudProvider,
    pub bucket: String,
    pub region: String,
    /// Empty for S3, where the host is derived from bucket and region. R2 needs
    /// `https://<account>.r2.cloudflarestorage.com`.
    pub endpoint: String,
    /// Key prefix, so backups can share a bucket with other content.
    pub prefix: String,
    pub access_key_id: String,
    pub secret_access_key: String,
    /// Uploads are encrypted before they leave the machine, so this is required
    /// whenever a provider is set. Local copies stay plain: they never leave.
    pub passphrase: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(default)]
pub struct BackupSettings {
    pub schedule: BackupSchedule,
    /// Keep a copy on this machine. Off only makes sense with a cloud provider
    /// set, and the UI says so.
    pub local: bool,
    /// Empty means the `backups` folder beside the database, which is also
    /// where pre-upgrade snapshots land.
    pub local_dir: String,
    /// Backups kept per destination before the oldest is deleted.
    pub keep: u32,
    pub cloud: CloudBackupSettings,
    pub last_run_at: Option<String>,
    pub last_result: Option<String>,
}

impl Default for BackupSettings {
    fn default() -> Self {
        Self {
            schedule: BackupSchedule::default(),
            local: true,
            local_dir: String::new(),
            keep: 10,
            cloud: CloudBackupSettings::default(),
            last_run_at: None,
            last_result: None,
        }
    }
}

/// Applications whose clipboard writes are never worth keeping, matched
/// against the foreground executable name the way any other entry in
/// `ignored_apps` is.
///
/// The ignore list shipped empty, which made "do not record my passwords" a
/// thing every user had to know to ask for, and to know the executable name
/// for. This is only the default: it is an ordinary editable list, `#[serde
/// (default)]` fills it in solely where the stored settings have no
/// `ignored_apps` key at all, and a user who clears the list keeps it cleared.
///
/// Named per platform because the match is on the executable, and the same
/// product ships under a different one on each.
fn default_ignored_apps() -> Vec<String> {
    #[cfg(target_os = "windows")]
    const SEED: &[&str] = &[
        "1Password.exe",
        "Bitwarden.exe",
        "Dashlane.exe",
        "Enpass.exe",
        "KeePass.exe",
        "KeePassXC.exe",
        "LastPass.exe",
        "NordPass.exe",
        "Proton Pass.exe",
        "RoboForm.exe",
    ];

    #[cfg(target_os = "macos")]
    const SEED: &[&str] = &[
        "1Password",
        "Bitwarden",
        "Dashlane",
        "Enpass",
        "Keychain Access",
        "KeePassXC",
        "NordPass",
        "Proton Pass",
    ];

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    const SEED: &[&str] = &[
        "1password",
        "bitwarden",
        "enpass",
        "keepassxc",
        "nordpass",
        "proton-pass",
        "seahorse",
    ];

    SEED.iter().map(|name| (*name).to_string()).collect()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            clipboard_tracking: true,
            history_days: 30,
            max_items: 500,
            ignored_apps: default_ignored_apps(),
            ignored_patterns: Vec::new(),
            ignored_content_types: Vec::new(),
            theme: "system".into(),
            accent: "teal".into(),
            minimize_to_tray: true,
            start_with_system: true,
            formatter_indent: 2,
            custom_shortcuts: BTreeMap::new(),
            paste_format: PasteFormat::default(),
            encryption_enabled: false,
            auto_clear_sensitive_minutes: None,
            clipboard_page_size: 100,
            updates: UpdateSettings::default(),
            backup: BackupSettings::default(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SettingsPatch {
    pub values: BTreeMap<String, serde_json::Value>,
}
