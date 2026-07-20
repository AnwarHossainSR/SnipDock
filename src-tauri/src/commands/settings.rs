use crate::{
    clipboard::CapturePolicy,
    error::AppError,
    models::{Settings, SettingsPatch},
    os::WindowPreferences,
    state::AppState,
};
use tauri::State;

pub mod actions {
    use super::super::repository_error;
    use crate::{
        clipboard::{CapturePolicy, CaptureSettings, ClipboardMonitor},
        error::{AppError, ErrorCode},
        models::{Settings, SettingsPatch},
        os::WindowPreferences,
        repository::Repository,
    };

    pub async fn get_settings(repository: &Repository) -> Result<Settings, AppError> {
        repository.get_settings().await.map_err(repository_error)
    }

    pub async fn save_settings(
        repository: &Repository,
        preferences: &WindowPreferences,
        monitor: &ClipboardMonitor,
        capture_policy: &CapturePolicy,
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
        if settings.clipboard_tracking {
            monitor.resume();
        } else {
            monitor.pause();
        }
        Ok(settings)
    }
}

#[tauri::command]
pub(super) async fn get_settings(
    state: State<'_, AppState>,
) -> Result<Settings, AppError> {
    actions::get_settings(state.repository()).await
}

#[tauri::command]
pub(super) async fn save_settings(
    state: State<'_, AppState>,
    preferences: State<'_, WindowPreferences>,
    capture_policy: State<'_, CapturePolicy>,
    input: SettingsPatch,
) -> Result<Settings, AppError> {
    actions::save_settings(
        state.repository(),
        &preferences,
        state.clipboard_monitor(),
        &capture_policy,
        input,
    )
    .await
}
