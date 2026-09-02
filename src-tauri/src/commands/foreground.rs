use crate::platform::native::ForegroundApp;
use crate::platform::native::SystemForegroundApp;

/// Resolves the foreground executable one time. Used by the Settings panel
/// to fill the ignored-apps list from whatever the user was last focused on;
/// the result is a single snapshot, not a long-lived listener.
///
/// SnipDock's own executable is filtered out. The panel asks for the
/// foreground app from inside the Settings window, so on Windows the raw
/// answer is often SnipDock itself - adding that to the ignore list would
/// mean nothing to the user and would look like a bug. `None` sends the
/// panel to its "type the name instead" path.
#[tauri::command]
pub(super) async fn get_foreground_executable() -> Option<String> {
    let detected = SystemForegroundApp.executable_name()?;
    if is_own_executable(&detected) {
        return None;
    }
    Some(detected)
}

fn is_own_executable(name: &str) -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.file_name().map(|own| own.to_string_lossy().into_owned()))
        .is_some_and(|own| own.eq_ignore_ascii_case(name))
}
