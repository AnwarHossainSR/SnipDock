use crate::{
    error::AppError,
    models::{Settings, SettingsPatch},
    state::AppState,
};
use tauri::State;

pub mod actions {
    use super::super::repository_error;
    use crate::{
        error::AppError,
        models::{Settings, SettingsPatch},
        repository::Repository,
    };

    pub async fn get_settings(repository: &Repository) -> Result<Settings, AppError> {
        repository.get_settings().await.map_err(repository_error)
    }

    pub async fn save_settings(
        repository: &Repository,
        input: SettingsPatch,
    ) -> Result<Settings, AppError> {
        repository.save_settings(input).await.map_err(repository_error)
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
    input: SettingsPatch,
) -> Result<Settings, AppError> {
    actions::save_settings(state.repository(), input).await
}
