use crate::{
    error::AppError,
    models::{
        Category, CopyMode, CopyReceipt, DeleteReceipt, ItemFlags, LibraryItem, Page, Project,
        SaveCategoryInput, SaveItemInput, SaveProjectInput, SaveTagInput, SearchQuery, Tag,
    },
    state::AppState,
};
use tauri::{AppHandle, State};
use tauri_plugin_clipboard_manager::ClipboardExt;

pub mod actions {
    use crate::{
        clipboard::ClipboardMonitor,
        error::{AppError, ErrorCode},
        models::{
            Category, CopyMode, CopyReceipt, DeleteReceipt, ItemFlags, LibraryItem, Page, Project,
            SaveCategoryInput, SaveItemInput, SaveProjectInput, SaveTagInput, SearchQuery, Tag,
        },
        repository::{Repository, RepositoryError},
    };

    fn repository_error(error: RepositoryError) -> AppError {
        match error {
            RepositoryError::Validation(message) => {
                AppError::new(ErrorCode::Validation, message)
            }
            RepositoryError::NotFound => {
                AppError::new(ErrorCode::NotFound, "item not found")
            }
            RepositoryError::CorruptData(_) => {
                AppError::new(ErrorCode::Storage, "stored item is invalid")
            }
            RepositoryError::Storage(_) => {
                AppError::new(ErrorCode::Storage, "item database unavailable")
            }
        }
    }

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

    pub async fn restore_item(
        repository: &Repository,
        receipt_id: &str,
    ) -> Result<LibraryItem, AppError> {
        repository
            .restore_item(receipt_id)
            .await
            .map_err(repository_error)
    }

    pub async fn clear_clipboard_history(
        repository: &Repository,
    ) -> Result<DeleteReceipt, AppError> {
        repository
            .clear_clipboard_history()
            .await
            .map_err(repository_error)
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

    pub async fn move_item(
        repository: &Repository,
        id: &str,
        project_id: Option<&str>,
    ) -> Result<LibraryItem, AppError> {
        repository
            .move_item(id, project_id)
            .await
            .map_err(repository_error)
    }

    pub async fn list_projects(
        repository: &Repository,
        include_archived: bool,
    ) -> Result<Vec<Project>, AppError> {
        repository
            .list_projects(include_archived)
            .await
            .map_err(repository_error)
    }

    pub async fn save_project(
        repository: &Repository,
        input: SaveProjectInput,
    ) -> Result<Project, AppError> {
        repository
            .save_project(input)
            .await
            .map_err(repository_error)
    }

    pub async fn list_categories(
        repository: &Repository,
    ) -> Result<Vec<Category>, AppError> {
        repository
            .list_categories()
            .await
            .map_err(repository_error)
    }

    pub async fn save_category(
        repository: &Repository,
        input: SaveCategoryInput,
    ) -> Result<Category, AppError> {
        repository
            .save_category(input)
            .await
            .map_err(repository_error)
    }

    pub async fn list_tags(repository: &Repository) -> Result<Vec<Tag>, AppError> {
        repository.list_tags().await.map_err(repository_error)
    }

    pub async fn save_tag(
        repository: &Repository,
        input: SaveTagInput,
    ) -> Result<Tag, AppError> {
        repository.save_tag(input).await.map_err(repository_error)
    }

    pub async fn merge_tags(
        repository: &Repository,
        source_id: &str,
        target_id: &str,
    ) -> Result<Tag, AppError> {
        repository
            .merge_tags(source_id, target_id)
            .await
            .map_err(repository_error)
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
async fn get_item(
    state: State<'_, AppState>,
    id: String,
) -> Result<LibraryItem, AppError> {
    actions::get_item(state.repository(), &id).await
}

#[tauri::command]
async fn save_item(
    state: State<'_, AppState>,
    input: SaveItemInput,
) -> Result<LibraryItem, AppError> {
    actions::save_item(state.repository(), input).await
}

#[tauri::command]
async fn duplicate_item(
    state: State<'_, AppState>,
    id: String,
) -> Result<LibraryItem, AppError> {
    actions::duplicate_item(state.repository(), &id).await
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
async fn restore_item(
    state: State<'_, AppState>,
    receipt_id: String,
) -> Result<LibraryItem, AppError> {
    actions::restore_item(state.repository(), &receipt_id).await
}

#[tauri::command]
async fn clear_clipboard_history(
    state: State<'_, AppState>,
) -> Result<DeleteReceipt, AppError> {
    actions::clear_clipboard_history(state.repository()).await
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
async fn move_item(
    state: State<'_, AppState>,
    id: String,
    project_id: Option<String>,
) -> Result<LibraryItem, AppError> {
    actions::move_item(state.repository(), &id, project_id.as_deref()).await
}

#[tauri::command]
async fn list_projects(
    state: State<'_, AppState>,
    include_archived: bool,
) -> Result<Vec<Project>, AppError> {
    actions::list_projects(state.repository(), include_archived).await
}

#[tauri::command]
async fn save_project(
    state: State<'_, AppState>,
    input: SaveProjectInput,
) -> Result<Project, AppError> {
    actions::save_project(state.repository(), input).await
}

#[tauri::command]
async fn list_categories(state: State<'_, AppState>) -> Result<Vec<Category>, AppError> {
    actions::list_categories(state.repository()).await
}

#[tauri::command]
async fn save_category(
    state: State<'_, AppState>,
    input: SaveCategoryInput,
) -> Result<Category, AppError> {
    actions::save_category(state.repository(), input).await
}

#[tauri::command]
async fn list_tags(state: State<'_, AppState>) -> Result<Vec<Tag>, AppError> {
    actions::list_tags(state.repository()).await
}

#[tauri::command]
async fn save_tag(state: State<'_, AppState>, input: SaveTagInput) -> Result<Tag, AppError> {
    actions::save_tag(state.repository(), input).await
}

#[tauri::command]
async fn merge_tags(
    state: State<'_, AppState>,
    source_id: String,
    target_id: String,
) -> Result<Tag, AppError> {
    actions::merge_tags(state.repository(), &source_id, &target_id).await
}

#[tauri::command]
fn set_clipboard_tracking(state: State<'_, AppState>, enabled: bool) -> bool {
    actions::set_clipboard_tracking(state.clipboard_monitor(), enabled)
}

pub fn register<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.invoke_handler(tauri::generate_handler![
        search_items,
        get_item,
        save_item,
        duplicate_item,
        set_item_flags,
        move_item,
        delete_item,
        restore_item,
        clear_clipboard_history,
        copy_item,
        list_projects,
        save_project,
        list_categories,
        save_category,
        list_tags,
        save_tag,
        merge_tags,
        set_clipboard_tracking,
    ])
}
