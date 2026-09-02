use crate::{
    error::AppError,
    models::{DeleteReceipt, ItemFlags, LibraryItem, Page, SearchQuery, SourceAppCount},
    state::AppState,
};
use tauri::State;

pub mod actions {
    use super::super::repository_error;
    use crate::{
        error::AppError,
        models::{DeleteReceipt, ItemFlags, LibraryItem, Page, SaveItemInput, SearchQuery, SourceAppCount},
        repository::Repository,
    };

    pub async fn get_item(
        repository: &Repository,
        id: &str,
    ) -> Result<LibraryItem, AppError> {
        repository.get_item(id).await.map_err(repository_error)
    }

    pub async fn save_item(
        repository: &Repository,
        input: SaveItemInput,
    ) -> Result<LibraryItem, AppError> {
        repository.save_item(input).await.map_err(repository_error)
    }

    pub async fn duplicate_item(
        repository: &Repository,
        id: &str,
    ) -> Result<LibraryItem, AppError> {
        repository.duplicate_item(id).await.map_err(repository_error)
    }

    pub async fn search_items(
        repository: &Repository,
        query: SearchQuery,
    ) -> Result<Page<LibraryItem>, AppError> {
        repository.search(query).await.map_err(repository_error)
    }

    pub async fn source_app_counts(
        repository: &Repository,
    ) -> Result<Vec<SourceAppCount>, AppError> {
        repository.source_app_counts().await.map_err(repository_error)
    }

    pub async fn set_item_flags(
        repository: &Repository,
        id: &str,
        flags: ItemFlags,
    ) -> Result<LibraryItem, AppError> {
        repository
            .set_item_flags(id, flags)
            .await
            .map_err(repository_error)
    }

    pub async fn delete_item(
        repository: &Repository,
        id: &str,
    ) -> Result<DeleteReceipt, AppError> {
        repository.delete_item(id).await.map_err(repository_error)
    }

    pub async fn delete_items(
        repository: &Repository,
        ids: &[String],
    ) -> Result<DeleteReceipt, AppError> {
        repository.delete_items(ids).await.map_err(repository_error)
    }

    pub async fn restore_item(
        repository: &Repository,
        receipt_id: &str,
    ) -> Result<LibraryItem, AppError> {
        repository
            .restore_item(receipt_id)
            .await
            .map_err(repository_error)
    }
}

#[tauri::command]
pub(super) async fn search_items(
    state: State<'_, AppState>,
    query: SearchQuery,
) -> Result<Page<LibraryItem>, AppError> {
    actions::search_items(state.repository(), query).await
}

#[tauri::command]
pub(super) async fn get_source_app_counts(
    state: State<'_, AppState>,
) -> Result<Vec<SourceAppCount>, AppError> {
    actions::source_app_counts(state.repository()).await
}

#[tauri::command]
pub(super) async fn set_item_flags(
    state: State<'_, AppState>,
    id: String,
    flags: ItemFlags,
) -> Result<LibraryItem, AppError> {
    actions::set_item_flags(state.repository(), &id, flags).await
}

#[tauri::command]
pub(super) async fn delete_item(
    state: State<'_, AppState>,
    id: String,
) -> Result<DeleteReceipt, AppError> {
    actions::delete_item(state.repository(), &id).await
}

#[tauri::command]
pub(super) async fn delete_items(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Result<DeleteReceipt, AppError> {
    actions::delete_items(state.repository(), &ids).await
}

#[tauri::command]
pub(super) async fn restore_item(
    state: State<'_, AppState>,
    receipt_id: String,
) -> Result<LibraryItem, AppError> {
    actions::restore_item(state.repository(), &receipt_id).await
}
