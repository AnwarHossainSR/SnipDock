use crate::{
    error::AppError,
    models::{Settings, SettingsPatch},
    os::WindowPreferences,
    state::AppState,
};
use tauri::State;

pub mod actions {
    use super::super::repository_error;
    use crate::{
        error::AppError,
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
        input: SettingsPatch,
    ) -> Result<Settings, AppError> {
        let settings = repository
            .save_settings(input)
            .await
            .map_err(repository_error)?;
        preferences.set_minimize_to_tray(settings.minimize_to_tray);
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
    input: SettingsPatch,
) -> Result<Settings, AppError> {
    actions::save_settings(state.repository(), &preferences, input).await
}
