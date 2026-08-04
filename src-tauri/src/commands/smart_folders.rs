use crate::{
    error::AppError,
    models::{SaveSmartFolderInput, SmartFolder},
    state::AppState,
};
use tauri::State;

pub mod actions {
    use super::super::repository_error;
    use crate::{
        error::AppError,
        models::{SaveSmartFolderInput, SmartFolder},
        storage::smart_folders::SmartFolderRepository,
    };

    pub async fn list_smart_folders(repository: &SmartFolderRepository) -> Result<Vec<SmartFolder>, AppError> {
        repository.list().await.map_err(repository_error)
    }

    pub async fn get_smart_folder(
        repository: &SmartFolderRepository,
        id: &str,
    ) -> Result<SmartFolder, AppError> {
        repository.get(id).await.map_err(repository_error)
    }

    pub async fn save_smart_folder(
        repository: &SmartFolderRepository,
        input: SaveSmartFolderInput,
    ) -> Result<SmartFolder, AppError> {
        repository.save(input).await.map_err(repository_error)
    }

    pub async fn delete_smart_folder(
        repository: &SmartFolderRepository,
        id: &str,
    ) -> Result<(), AppError> {
        repository.delete(id).await.map_err(repository_error)
    }

    pub async fn reorder_smart_folders(
        repository: &SmartFolderRepository,
        ids: &[String],
    ) -> Result<(), AppError> {
        repository.reorder(ids).await.map_err(repository_error)
    }
}

#[tauri::command]
pub(super) async fn list_smart_folders(
    state: State<'_, AppState>,
) -> Result<Vec<SmartFolder>, AppError> {
    actions::list_smart_folders(state.smart_folder_repository()).await
}

#[tauri::command]
pub(super) async fn get_smart_folder(
    state: State<'_, AppState>,
    id: String,
) -> Result<SmartFolder, AppError> {
    actions::get_smart_folder(state.smart_folder_repository(), &id).await
}

#[tauri::command]
pub(super) async fn save_smart_folder(
    state: State<'_, AppState>,
    input: SaveSmartFolderInput,
) -> Result<SmartFolder, AppError> {
    actions::save_smart_folder(state.smart_folder_repository(), input).await
}

#[tauri::command]
pub(super) async fn delete_smart_folder(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    actions::delete_smart_folder(state.smart_folder_repository(), &id).await
}

#[tauri::command]
pub(super) async fn reorder_smart_folders(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Result<(), AppError> {
    actions::reorder_smart_folders(state.smart_folder_repository(), &ids).await
}
