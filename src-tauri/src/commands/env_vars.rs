use crate::{
    error::AppError,
    models::{
        EnvGroup, EnvVar, ImportEnvReport, ImportEnvVarsInput, SaveEnvGroupInput, SaveEnvVarInput,
    },
    state::AppState,
};
use tauri::State;

pub mod actions {
    use super::super::repository_error;
    use crate::{
        error::AppError,
        models::{
            EnvGroup, EnvVar, ImportEnvReport, ImportEnvVarsInput, SaveEnvGroupInput,
            SaveEnvVarInput,
        },
        repository::Repository,
    };

    pub async fn list_env_groups(repository: &Repository) -> Result<Vec<EnvGroup>, AppError> {
        repository.list_env_groups().await.map_err(repository_error)
    }

    pub async fn save_env_group(
        repository: &Repository,
        input: SaveEnvGroupInput,
    ) -> Result<EnvGroup, AppError> {
        repository.save_env_group(input).await.map_err(repository_error)
    }

    pub async fn delete_env_group(repository: &Repository, id: &str) -> Result<(), AppError> {
        repository.delete_env_group(id).await.map_err(repository_error)
    }

    pub async fn duplicate_env_group(
        repository: &Repository,
        id: &str,
        name: &str,
    ) -> Result<EnvGroup, AppError> {
        repository
            .duplicate_env_group(id, name)
            .await
            .map_err(repository_error)
    }

    pub async fn list_env_vars(
        repository: &Repository,
        group_id: &str,
    ) -> Result<Vec<EnvVar>, AppError> {
        repository.list_env_vars(group_id).await.map_err(repository_error)
    }

    pub async fn save_env_var(
        repository: &Repository,
        input: SaveEnvVarInput,
    ) -> Result<EnvVar, AppError> {
        repository.save_env_var(input).await.map_err(repository_error)
    }

    pub async fn delete_env_var(repository: &Repository, id: &str) -> Result<(), AppError> {
        repository.delete_env_var(id).await.map_err(repository_error)
    }

    pub async fn import_env_vars(
        repository: &Repository,
        input: ImportEnvVarsInput,
    ) -> Result<ImportEnvReport, AppError> {
        repository.import_env_vars(input).await.map_err(repository_error)
    }
}

#[tauri::command]
pub(super) async fn list_env_groups(state: State<'_, AppState>) -> Result<Vec<EnvGroup>, AppError> {
    actions::list_env_groups(state.repository()).await
}

#[tauri::command]
pub(super) async fn save_env_group(
    state: State<'_, AppState>,
    input: SaveEnvGroupInput,
) -> Result<EnvGroup, AppError> {
    actions::save_env_group(state.repository(), input).await
}

#[tauri::command]
pub(super) async fn delete_env_group(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    actions::delete_env_group(state.repository(), &id).await
}

#[tauri::command]
pub(super) async fn duplicate_env_group(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> Result<EnvGroup, AppError> {
    actions::duplicate_env_group(state.repository(), &id, &name).await
}

#[tauri::command]
pub(super) async fn list_env_vars(
    state: State<'_, AppState>,
    group_id: String,
) -> Result<Vec<EnvVar>, AppError> {
    actions::list_env_vars(state.repository(), &group_id).await
}

#[tauri::command]
pub(super) async fn save_env_var(
    state: State<'_, AppState>,
    input: SaveEnvVarInput,
) -> Result<EnvVar, AppError> {
    actions::save_env_var(state.repository(), input).await
}

#[tauri::command]
pub(super) async fn delete_env_var(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    actions::delete_env_var(state.repository(), &id).await
}

#[tauri::command]
pub(super) async fn import_env_vars(
    state: State<'_, AppState>,
    input: ImportEnvVarsInput,
) -> Result<ImportEnvReport, AppError> {
    actions::import_env_vars(state.repository(), input).await
}
