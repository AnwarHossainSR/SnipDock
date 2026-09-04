use crate::{
    clipboard::CapturePolicy,
    error::AppError,
    models::{Settings, SettingsPatch},
    os::WindowPreferences,
    state::AppState,
};
use tauri::{AppHandle, State};
#[cfg(desktop)]
use tauri_plugin_autostart::ManagerExt;

/// Emitted after `save_settings` and `set_autostart` land, so the frontend
/// can refresh its in-memory view of the user's bindings (the in-window
/// `Ctrl+Shift+<key>` accelerators are looked up from the same map on the
/// JS side). The global Quick Paste accelerator is re-registered from the
/// same payload on the Rust side, but the event also exists so the window's
/// own keydown handler can pick up the new mapping without a restart.
pub(crate) const SETTINGS_CHANGED_EVENT: &str = "settings://changed";

pub mod actions {
    use super::super::repository_error;
    use super::SETTINGS_CHANGED_EVENT;
    use crate::{
        clipboard::{CapturePolicy, CaptureSettings, ClipboardMonitor},
        error::{AppError, ErrorCode},
        models::{Settings, SettingsPatch},
        os::WindowPreferences,
        repository::Repository,
    };
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use tauri::{AppHandle, Emitter};

    pub async fn get_settings(repository: &Repository) -> Result<Settings, AppError> {
        repository.get_settings().await.map_err(repository_error)
    }

    pub async fn save_settings(
        repository: &Repository,
        preferences: &WindowPreferences,
        monitor: &ClipboardMonitor,
        capture_policy: &CapturePolicy,
        startup_sweep_gate: &Arc<AtomicBool>,
        input: SettingsPatch,
    ) -> Result<Settings, AppError> {
        let settings = repository
            .save_settings(input)
            .await
            .map_err(repository_error)?;
        preferences.set_minimize_to_tray(settings.minimize_to_tray);
        capture_policy
            .update(CaptureSettings::from(&settings))
            .map_err(|error| AppError::new(ErrorCode::Validation, error.to_string()))?;
        if settings.clipboard_tracking && startup_sweep_gate.load(Ordering::SeqCst) {
            monitor.resume();
        } else {
            monitor.pause();
        }
        Ok(settings)
    }

    /// Apply a saved settings blob to the parts of the running app that
    /// outlive any single command call. The frontend listens for the
    /// `settings://changed` event this emits to refresh its in-memory
    /// view of the user's bindings, and the global Quick Paste
    /// accelerator is (re)registered here so a rebind takes effect
    /// without a restart.
    pub fn apply_after_save<R: tauri::Runtime>(
        app: &AppHandle<R>,
        settings: &Settings,
    ) -> Result<(), AppError> {
        // The event below is the whole of what a saved settings blob applies
        // where there is no OS-wide accelerator to re-register.
        #[cfg(desktop)]
        crate::platform::shortcuts::apply_global_shortcut(app, settings).map_err(|error| {
            AppError::new(
                ErrorCode::Internal,
                format!("could not register the Quick Paste accelerator: {error}"),
            )
        })?;
        // The tray's capture checkbox is a second view of `clipboard_tracking`,
        // and this is the path every save takes -- including a save made from
        // the tray itself, where it is a no-op because the tray moved first.
        #[cfg(desktop)]
        crate::app::tray::sync_capture_state(app, settings.clipboard_tracking);
        let _ = app.emit(SETTINGS_CHANGED_EVENT, settings.clone());
        Ok(())
    }
}

#[tauri::command]
pub(super) async fn get_settings(
    state: State<'_, AppState>,
) -> Result<Settings, AppError> {
    actions::get_settings(state.repository()).await
}

#[tauri::command]
pub(super) async fn save_settings<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    preferences: State<'_, WindowPreferences>,
    capture_policy: State<'_, CapturePolicy>,
    input: SettingsPatch,
) -> Result<Settings, AppError> {
    // The binding in force before the save, so a registration failure can put
    // both the OS accelerator and the stored setting back where they were
    // instead of reporting success over a shortcut that no longer fires.
    let previous = actions::get_settings(state.repository()).await?;
    let saved = actions::save_settings(
        state.repository(),
        &preferences,
        state.clipboard_monitor(),
        &capture_policy,
        &state.startup_sweep_gate(),
        input,
    )
    .await?;
    if let Err(error) = actions::apply_after_save(&app, &saved) {
        if saved.custom_shortcuts != previous.custom_shortcuts {
            let mut rollback = std::collections::BTreeMap::new();
            rollback.insert(
                "custom_shortcuts".to_string(),
                serde_json::to_value(&previous.custom_shortcuts).unwrap_or_default(),
            );
            let restored = actions::save_settings(
                state.repository(),
                &preferences,
                state.clipboard_monitor(),
                &capture_policy,
                &state.startup_sweep_gate(),
                SettingsPatch { values: rollback },
            )
            .await;
            if let Ok(restored) = restored {
                let _ = actions::apply_after_save(&app, &restored);
            }
        }
        return Err(error);
    }
    Ok(saved)
}

#[cfg(desktop)]
#[tauri::command]
pub(super) fn get_autostart<R: tauri::Runtime>(app: AppHandle<R>) -> Result<bool, AppError> {
    app.autolaunch()
        .is_enabled()
        .map_err(|error| AppError::new(crate::error::ErrorCode::Internal, error.to_string()))
}

#[cfg(desktop)]
#[tauri::command]
pub(super) async fn set_autostart<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<bool, AppError> {
    let manager = app.autolaunch();
    let result = if enabled { manager.enable() } else { manager.disable() };
    result.map_err(|error| AppError::new(crate::error::ErrorCode::Internal, error.to_string()))?;
    let saved = state
        .repository()
        .save_settings(SettingsPatch {
            values: std::collections::BTreeMap::from([("start_with_system".into(), enabled.into())]),
        })
        .await
        .map_err(super::repository_error)?;
    // Autostart does not touch the accelerator, so a failure here is worth a
    // log line but must not fail the toggle the user actually asked for.
    if let Err(error) = actions::apply_after_save(&app, &saved) {
        eprintln!("Could not re-register the global Quick Paste accelerator: {error}");
    }
    Ok(enabled)
}
