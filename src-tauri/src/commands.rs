use crate::{
    error::AppError,
    models::{CopyMode, CopyReceipt, DeleteReceipt, ItemFlags, LibraryItem, Page, SearchQuery},
    state::AppState,
};
use tauri::{AppHandle, State};
use tauri_plugin_clipboard_manager::ClipboardExt;

pub mod actions {
    use crate::{
        clipboard::ClipboardMonitor,
        error::{AppError, ErrorCode},
        models::{
            CopyMode, CopyReceipt, DeleteReceipt, ItemFlags, ItemKind, LibraryItem, Page,
            SearchQuery, SortOrder,
        },
        repository::{Repository, RepositoryError},
    };

    fn repository_error(error: RepositoryError) -> AppError {
        match error {
            RepositoryError::Validation(message) => {
                AppError::new(ErrorCode::Validation, message)
            }
            RepositoryError::NotFound => {
                AppError::new(ErrorCode::NotFound, "clipboard item not found")
            }
            RepositoryError::CorruptData(_) => {
                AppError::new(ErrorCode::Storage, "stored clipboard item is invalid")
            }
            RepositoryError::Storage(_) => {
                AppError::new(ErrorCode::Storage, "clipboard database unavailable")
            }
        }
    }

    pub async fn search_items(
        repository: &Repository,
        query: SearchQuery,
    ) -> Result<Page<LibraryItem>, AppError> {
        let clipboard_only = query.kinds == vec![ItemKind::Clipboard]
            && query.text.is_none()
            && query.content_types.is_empty()
            && query.languages.is_empty()
            && query.project_ids.is_empty()
            && query.category_ids.is_empty()
            && query.tag_ids.is_empty()
            && query.pinned.is_none()
            && query.favorite.is_none()
            && query.created_from.is_none()
            && query.created_to.is_none()
            && query.sort == SortOrder::Newest;
        if !clipboard_only {
            return Err(AppError::new(
                ErrorCode::Validation,
                "clipboard history only supports newest-first browsing",
            ));
        }

        repository
            .list_clipboard_items(query.limit, query.offset)
            .await
            .map_err(repository_error)
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

    pub async fn copy_item<F>(
        repository: &Repository,
        monitor: &ClipboardMonitor,
        id: &str,
        mode: CopyMode,
        write: F,
    ) -> Result<CopyReceipt, AppError>
    where
        F: FnOnce(&str) -> Result<(), String>,
    {
        if mode != CopyMode::Raw {
            return Err(AppError::new(
                ErrorCode::Validation,
                "clipboard history supports raw copy only",
            ));
        }

        let item = repository.get_item(id).await.map_err(repository_error)?;
        monitor.mark_self_written(item.content.clone());
        if let Err(error) = write(&item.content) {
            monitor.clear_self_written();
            return Err(AppError::new(ErrorCode::Clipboard, error));
        }
        let updated = repository.record_copy(id).await.map_err(repository_error)?;

        Ok(CopyReceipt {
            item_id: updated.id,
            copied_at: updated.last_used_at.unwrap_or(updated.updated_at),
            auto_clear_at: None,
        })
    }

    pub fn set_clipboard_tracking(monitor: &ClipboardMonitor, enabled: bool) -> bool {
        if enabled {
            monitor.resume();
        } else {
            monitor.pause();
        }
        enabled
    }
}

#[tauri::command]
async fn search_items(
    state: State<'_, AppState>,
    query: SearchQuery,
) -> Result<Page<LibraryItem>, AppError> {
    actions::search_items(state.repository(), query).await
}

#[tauri::command]
async fn set_item_flags(
    state: State<'_, AppState>,
    id: String,
    flags: ItemFlags,
) -> Result<LibraryItem, AppError> {
    actions::set_item_flags(state.repository(), &id, flags).await
}

#[tauri::command]
async fn delete_item(
    state: State<'_, AppState>,
    id: String,
) -> Result<DeleteReceipt, AppError> {
    actions::delete_item(state.repository(), &id).await
}

#[tauri::command]
async fn copy_item<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    id: String,
    mode: CopyMode,
) -> Result<CopyReceipt, AppError> {
    actions::copy_item(
        state.repository(),
        state.clipboard_monitor(),
        &id,
        mode,
        |text| app.clipboard().write_text(text).map_err(|error| error.to_string()),
    )
    .await
}

#[tauri::command]
fn set_clipboard_tracking(state: State<'_, AppState>, enabled: bool) -> bool {
    actions::set_clipboard_tracking(state.clipboard_monitor(), enabled)
}

pub fn register<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.invoke_handler(tauri::generate_handler![
        search_items,
        set_item_flags,
        delete_item,
        copy_item,
        set_clipboard_tracking,
    ])
}
