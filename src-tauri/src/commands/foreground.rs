use crate::platform::native::SystemForegroundApp;
use crate::platform::native::ForegroundApp;

/// Resolves the foreground executable one time. Used by the Settings panel
/// to fill the ignored-apps list from whatever the user was last focused on;
/// the result is a single snapshot, not a long-lived listener.
#[tauri::command]
pub(super) async fn get_foreground_executable() -> Option<String> {
    SystemForegroundApp.executable_name()
}
