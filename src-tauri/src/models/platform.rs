use serde::{Deserialize, Serialize};

/// Which SnipDock product the running binary is.
///
/// Resolved from the build target, not from a user agent: the frontend asks
/// the backend what it is rather than guessing, so a capability that lands on
/// one platform only is described in one place.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Platform {
    Desktop,
}

/// What the running platform can actually do.
///
/// The matrix is the single statement of what this build supports: the view
/// layer renders from it, and `commands::register` builds its invoke surface
/// from the same set of `#[cfg(desktop)]` gates, so a control and the command
/// behind it appear and disappear together.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct PlatformCapabilities {
    pub platform: Platform,
    /// Recording every copy in the background.
    pub clipboard_capture: bool,
    /// Pasting into whichever application had focus.
    pub direct_paste: bool,
    /// OS-wide accelerators that fire while another app has focus.
    pub global_shortcuts: bool,
    /// The second-window Quick Paste overlay.
    pub quick_paste: bool,
    /// The system tray icon and its menu.
    pub tray: bool,
    /// Launching with the operating system.
    pub autostart: bool,
    /// The localhost HTTP endpoint the SnipDock CLI talks to.
    pub cli: bool,
    /// The in-app updater.
    pub updater: bool,
    /// The resource-usage readout, which needs process metrics.
    pub resource_usage: bool,
    /// Naming the application a capture came from, which the ignored-apps and
    /// source-app filters depend on. Windows only today; elsewhere the
    /// foreground lookup returns `None` and the filters have nothing to show.
    pub source_app_detection: bool,
    /// Cross-device sync.
    pub sync: bool,
}

impl PlatformCapabilities {
    /// What this binary supports. `const` on the target, so the matrix cannot
    /// drift from what was compiled in.
    pub const fn current() -> Self {
        Self::desktop()
    }

    pub const fn desktop() -> Self {
        Self {
            platform: Platform::Desktop,
            clipboard_capture: true,
            direct_paste: true,
            global_shortcuts: true,
            quick_paste: true,
            tray: true,
            autostart: true,
            cli: true,
            updater: true,
            resource_usage: true,
            source_app_detection: cfg!(target_os = "windows"),
            sync: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_desktop_set_keeps_every_capability_the_product_shipped_with() {
        let desktop = PlatformCapabilities::desktop();
        assert_eq!(desktop.platform, Platform::Desktop);
        for (name, present) in [
            ("clipboard_capture", desktop.clipboard_capture),
            ("direct_paste", desktop.direct_paste),
            ("global_shortcuts", desktop.global_shortcuts),
            ("quick_paste", desktop.quick_paste),
            ("tray", desktop.tray),
            ("autostart", desktop.autostart),
            ("cli", desktop.cli),
            ("updater", desktop.updater),
            ("resource_usage", desktop.resource_usage),
            ("sync", desktop.sync),
        ] {
            assert!(present, "desktop lost the {name} capability");
        }
    }

    #[test]
    fn source_app_detection_is_claimed_only_where_the_lookup_is_implemented() {
        assert_eq!(
            PlatformCapabilities::desktop().source_app_detection,
            cfg!(target_os = "windows")
        );
    }

    #[test]
    fn the_matrix_serializes_with_the_field_names_the_frontend_reads() {
        let json = serde_json::to_value(PlatformCapabilities::desktop()).unwrap();
        assert_eq!(json["platform"], "desktop");
        assert_eq!(json["clipboard_capture"], true);
    }
}
