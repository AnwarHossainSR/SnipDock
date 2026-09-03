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
    Android,
}

/// What the running platform can actually do.
///
/// The Android build has fewer capabilities than the desktop one, and the
/// `android-app-shell` spec requires that it never present a control for one
/// it lacks. This matrix is the single statement of that difference: the view
/// layer renders from it, and `commands::register` builds its invoke surface
/// from the same set of `#[cfg(desktop)]` gates, so a control and the command
/// behind it appear and disappear together.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct PlatformCapabilities {
    pub platform: Platform,
    /// Recording every copy in the background. Android 10 removed the API and
    /// grants it back through no permission, so the phone never has this.
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
    /// The in-app updater. Android updates arrive through the store.
    pub updater: bool,
    /// The resource-usage readout, which needs process metrics.
    pub resource_usage: bool,
    /// Naming the application a capture came from, which the ignored-apps and
    /// source-app filters depend on. Windows only today; elsewhere the
    /// foreground lookup returns `None` and the filters have nothing to show.
    pub source_app_detection: bool,
    /// Receiving content through the system share sheet.
    pub share_target: bool,
    /// The Quick Settings tile that copies the latest item.
    pub quick_settings_tile: bool,
    /// Cross-device sync, which both platforms have.
    pub sync: bool,
}

impl PlatformCapabilities {
    /// What this binary supports. `const` on the target, so the matrix cannot
    /// drift from what was compiled in.
    pub const fn current() -> Self {
        #[cfg(target_os = "android")]
        {
            Self::android()
        }
        #[cfg(not(target_os = "android"))]
        {
            Self::desktop()
        }
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
            share_target: false,
            quick_settings_tile: false,
            sync: true,
        }
    }

    pub const fn android() -> Self {
        Self {
            platform: Platform::Android,
            clipboard_capture: false,
            direct_paste: false,
            global_shortcuts: false,
            quick_paste: false,
            tray: false,
            autostart: false,
            cli: false,
            updater: false,
            resource_usage: false,
            source_app_detection: false,
            share_target: true,
            quick_settings_tile: true,
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
    fn the_android_set_excludes_what_the_platform_cannot_do() {
        let android = PlatformCapabilities::android();
        assert_eq!(android.platform, Platform::Android);
        for (name, present) in [
            ("clipboard_capture", android.clipboard_capture),
            ("direct_paste", android.direct_paste),
            ("global_shortcuts", android.global_shortcuts),
            ("quick_paste", android.quick_paste),
            ("tray", android.tray),
            ("autostart", android.autostart),
            ("cli", android.cli),
            ("updater", android.updater),
        ] {
            assert!(!present, "android must not claim the {name} capability");
        }
    }

    #[test]
    fn android_gains_the_surfaces_the_desktop_has_no_equivalent_for() {
        let android = PlatformCapabilities::android();
        assert!(android.share_target);
        assert!(android.quick_settings_tile);
        let desktop = PlatformCapabilities::desktop();
        assert!(!desktop.share_target);
        assert!(!desktop.quick_settings_tile);
    }

    #[test]
    fn both_platforms_sync() {
        assert!(PlatformCapabilities::desktop().sync);
        assert!(PlatformCapabilities::android().sync);
    }

    #[test]
    fn the_current_matrix_matches_the_target_it_was_built_for() {
        let current = PlatformCapabilities::current();
        if cfg!(target_os = "android") {
            assert_eq!(current, PlatformCapabilities::android());
        } else {
            assert_eq!(current, PlatformCapabilities::desktop());
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
        assert_eq!(json["quick_settings_tile"], false);
    }
}
