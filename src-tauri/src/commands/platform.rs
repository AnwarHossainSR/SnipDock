use crate::models::PlatformCapabilities;

/// What this build can do. The frontend reads it once at startup and hides
/// controls from it, rather than sniffing a user agent — see
/// `crate::models::PlatformCapabilities`.
#[tauri::command]
pub(super) fn get_platform_capabilities() -> PlatformCapabilities {
    PlatformCapabilities::desktop()
}
