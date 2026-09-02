//! Resolves the user's shortcut overrides to the binding each handler should
//! use, and (re)registers the OS-wide Quick Paste accelerator when an override
//! changes. In-window shortcuts (the `Ctrl+Shift+<key>` accelerators the main
//! window handles) are picked up by the frontend over the `settings://changed`
//! event; this module is the OS-side half of the same workflow.
//!
//! Only Quick Paste is a system-wide shortcut. The in-window handlers never
//! block other apps' shortcuts because they only fire while the SnipDock
//! window has focus, so the rebind surface here is intentionally limited to
//! the one binding the plugin actually owns.

use crate::models::Settings;
use tauri::{Emitter, Manager};

/// The action id used in `Settings.custom_shortcuts` for the global Quick
/// Paste accelerator. The frontend derives the same id from the label
/// "Open Quick Paste" via the same slug rule (`toActionId` in
/// `src/lib/shortcuts.ts`), so the two halves of the rebind surface stay in
/// lock-step without a hand-maintained mapping.
pub const QUICK_PASTE_ACTION_ID: &str = "open_quick_paste";

/// The default accelerator the global-shortcut plugin is wired with in
/// `commands/mod.rs`. Re-registration has to produce the same string to be a
/// no-op when the user has not rebinded the shortcut.
pub const DEFAULT_QUICK_PASTE_BINDING: &str = "CmdOrCtrl+Shift+V";

/// Returns the binding the global Quick Paste accelerator should use. The
/// `None` case means "use the default" (no override stored, or the stored
/// override equals the default after the user cleared the field).
pub fn resolve_quick_paste(settings: &Settings) -> Option<String> {
    let override_value = settings.custom_shortcuts.get(QUICK_PASTE_ACTION_ID)?;
    let trimmed = override_value.trim();
    if trimmed.is_empty() || trimmed == DEFAULT_QUICK_PASTE_BINDING {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// A small typed error so the caller (and the panel's `settings://changed`
/// pipeline) can surface registration failures with the same shape every
/// other shortcut error uses.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShortcutError(pub String);

impl std::fmt::Display for ShortcutError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for ShortcutError {}

/// Build the `tauri_plugin_global_shortcut::Shortcut` for the resolved
/// binding. The plugin's `Shortcut::from_str` is the only public
/// constructor and it can fail on a string that does not parse; the only
/// paths that reach this function have already been validated by the panel,
/// but the re-registration step still has to handle a malformed string
/// because the user can store anything in the database column and a future
/// schema drift would otherwise be a silent failure.
pub fn parse_binding(binding: &str) -> Result<tauri_plugin_global_shortcut::Shortcut, ShortcutError> {
    binding
        .parse::<tauri_plugin_global_shortcut::Shortcut>()
        .map_err(|error| ShortcutError(format!("{binding} is not a valid accelerator: {error}")))
}

/// Apply the resolved Quick Paste binding to the running app. The
/// `tauri_plugin_global_shortcut` plugin exposes its registration surface
/// at runtime, so a rebind is a matter of unregistering the previous
/// accelerator and registering the new one. The closure passed to
/// `on_shortcut` is `'static`, so the handler captures a clone of the
/// `AppHandle` and dispatches to the same `show_quick_paste` path the
/// startup registration uses.
pub fn apply_global_shortcut<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    settings: &Settings,
) -> Result<(), ShortcutError> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    let previous = app
        .global_shortcut()
        .is_registered(DEFAULT_QUICK_PASTE_BINDING);
    let target = resolve_quick_paste(settings);

    if previous && target.is_none() {
        app.global_shortcut()
            .unregister(DEFAULT_QUICK_PASTE_BINDING)
            .map_err(|error| ShortcutError(format!("could not unregister the default accelerator: {error}")))?;
    }
    if let Some(binding) = target {
        let shortcut = parse_binding(&binding)?;
        if previous && binding != DEFAULT_QUICK_PASTE_BINDING {
            app.global_shortcut()
                .unregister(DEFAULT_QUICK_PASTE_BINDING)
                .map_err(|error| ShortcutError(format!("could not unregister the default accelerator: {error}")))?;
        }
        let app_handle = app.clone();
        app.global_shortcut()
            .on_shortcut(shortcut, move |registered_app, _shortcut, event| {
                if event.state() != tauri_plugin_global_shortcut::ShortcutState::Pressed {
                    return;
                }
                if let Some(window) = registered_app.get_webview_window(crate::app::QUICK_PASTE_WINDOW) {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                let tracker = app_handle.state::<crate::os::ForegroundWindowTracker>();
                tracker.record(crate::os::current_foreground_window());
                let _ = app_handle.emit("shortcut://open", ());
            })
            .map_err(|error| ShortcutError(format!("could not register {binding}: {error}")))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Settings;
    use std::collections::BTreeMap;

    fn settings_with(overrides: &[(&str, &str)]) -> Settings {
        let mut custom = BTreeMap::new();
        for (key, value) in overrides {
            custom.insert((*key).to_string(), (*value).to_string());
        }
        Settings {
            custom_shortcuts: custom,
            ..Settings::default()
        }
    }

    #[test]
    fn returns_none_when_no_override_is_stored() {
        let settings = settings_with(&[]);
        assert_eq!(resolve_quick_paste(&settings), None);
    }

    #[test]
    fn returns_none_when_override_equals_the_default() {
        let settings = settings_with(&[(QUICK_PASTE_ACTION_ID, DEFAULT_QUICK_PASTE_BINDING)]);
        assert_eq!(resolve_quick_paste(&settings), None);
    }

    #[test]
    fn returns_none_when_override_is_blank() {
        let settings = settings_with(&[(QUICK_PASTE_ACTION_ID, "   ")]);
        assert_eq!(resolve_quick_paste(&settings), None);
    }

    #[test]
    fn returns_the_overridden_binding_when_one_is_stored() {
        let settings = settings_with(&[(QUICK_PASTE_ACTION_ID, "CmdOrCtrl+Alt+V")]);
        assert_eq!(
            resolve_quick_paste(&settings),
            Some("CmdOrCtrl+Alt+V".to_string())
        );
    }

    #[test]
    fn trims_whitespace_around_the_overridden_binding() {
        let settings = settings_with(&[(QUICK_PASTE_ACTION_ID, "  CmdOrCtrl+Alt+V  ")]);
        assert_eq!(
            resolve_quick_paste(&settings),
            Some("CmdOrCtrl+Alt+V".to_string())
        );
    }

    #[test]
    fn parse_binding_accepts_the_documented_grammar() {
        assert!(parse_binding(DEFAULT_QUICK_PASTE_BINDING).is_ok());
        assert!(parse_binding("CmdOrCtrl+Alt+V").is_ok());
    }

    #[test]
    fn parse_binding_rejects_an_unparseable_string() {
        let error = parse_binding("not-a-binding").unwrap_err();
        assert!(error.0.contains("not-a-binding"));
    }
}
