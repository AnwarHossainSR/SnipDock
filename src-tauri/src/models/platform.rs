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

/// Which operating system the running binary was built for.
///
/// The matrix carried `platform: Desktop` and nothing else, so the frontend
/// had no way to tell Windows from macOS - which is why Settings said "Start
/// with Windows" and "Follow the Windows setting" on all three.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum OperatingSystem {
    Windows,
    Macos,
    Linux,
}

impl OperatingSystem {
    /// Resolved from the build target, like the rest of the matrix.
    pub const fn current() -> Self {
        if cfg!(target_os = "windows") {
            Self::Windows
        } else if cfg!(target_os = "macos") {
            Self::Macos
        } else {
            Self::Linux
        }
    }
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
    /// Which OS this build targets. Read by the view layer for the handful of
    /// labels that have to name it.
    pub os: OperatingSystem,
    /// Recording every copy in the background.
    pub clipboard_capture: bool,
    /// Pasting into whichever application had focus, rather than copying and
    /// leaving the user to paste. Windows only: the other platforms have no
    /// keystroke-injection path wired up, and Quick Paste falls back to copy
    /// there. The matrix claimed this everywhere while the README said
    /// otherwise.
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
            os: OperatingSystem::current(),
            clipboard_capture: true,
            direct_paste: cfg!(target_os = "windows"),
            global_shortcuts: true,
            quick_paste: true,
            tray: true,
            autostart: true,
            cli: true,
            updater: true,
            resource_usage: true,
            source_app_detection: cfg!(target_os = "windows"),
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
            ("global_shortcuts", desktop.global_shortcuts),
            ("quick_paste", desktop.quick_paste),
            ("tray", desktop.tray),
            ("autostart", desktop.autostart),
            ("cli", desktop.cli),
            ("updater", desktop.updater),
            ("resource_usage", desktop.resource_usage),
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

    /// The README has always said direct paste is Windows-only and the matrix
    /// said it was everywhere. The matrix is the half the UI reads.
    #[test]
    fn direct_paste_is_claimed_only_where_the_injection_path_exists() {
        assert_eq!(
            PlatformCapabilities::desktop().direct_paste,
            cfg!(target_os = "windows")
        );
    }

    #[test]
    fn the_matrix_serializes_with_the_field_names_the_frontend_reads() {
        let json = serde_json::to_value(PlatformCapabilities::desktop()).unwrap();
        assert_eq!(json["platform"], "desktop");
        assert_eq!(json["clipboard_capture"], true);
    }

    /// The names the frontend switches its labels on. Lowercase and
    /// unpunctuated, so "macos" rather than serde's default "mac_os".
    #[test]
    fn the_operating_system_serializes_as_the_frontend_spells_it() {
        for (value, expected) in [
            (OperatingSystem::Windows, "windows"),
            (OperatingSystem::Macos, "macos"),
            (OperatingSystem::Linux, "linux"),
        ] {
            assert_eq!(serde_json::to_value(value).unwrap(), expected);
        }
    }

    #[test]
    fn the_operating_system_follows_the_build_target() {
        let expected = if cfg!(target_os = "windows") {
            OperatingSystem::Windows
        } else if cfg!(target_os = "macos") {
            OperatingSystem::Macos
        } else {
            OperatingSystem::Linux
        };
        assert_eq!(PlatformCapabilities::desktop().os, expected);
    }
}
