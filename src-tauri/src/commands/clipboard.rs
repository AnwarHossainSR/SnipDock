use crate::{
    error::AppError,
    models::{CopyMode, CopyReceipt, DeleteReceipt},
    state::AppState,
};
use tauri::{AppHandle, State};
use tauri_plugin_clipboard_manager::ClipboardExt;

pub mod actions {
    use super::super::repository_error;
    use crate::{
        clipboard::ClipboardMonitor,
        error::{AppError, ErrorCode},
        models::{CopyMode, CopyReceipt, DeleteReceipt},
        repository::Repository,
    };

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

    /// Copies `id` to the clipboard exactly like [`copy_item`], then restores
    /// focus to `target` (the OS window that was focused before SnipDock's
    /// global shortcuts brought its own window forward) and injects a paste
    /// keystroke there. Always delegates the actual clipboard write to
    /// `copy_item` so any protected-content confirmation added there in the
    /// future automatically covers direct paste too.
    pub async fn direct_paste_item<F>(
        repository: &Repository,
        monitor: &ClipboardMonitor,
        direct_paste: &dyn crate::os::DirectPaste,
        target: Option<u64>,
        id: &str,
        write: F,
    ) -> Result<CopyReceipt, AppError>
    where
        F: FnOnce(&str) -> Result<(), String>,
    {
        let receipt = copy_item(repository, monitor, id, CopyMode::Raw, write).await?;
        if let Some(handle) = target {
            direct_paste.restore_and_paste(handle);
        }
        Ok(receipt)
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
pub(super) async fn clear_clipboard_history(
    state: State<'_, AppState>,
) -> Result<DeleteReceipt, AppError> {
    actions::clear_clipboard_history(state.repository()).await
}

#[tauri::command]
pub(super) async fn copy_item<R: tauri::Runtime>(
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
pub(super) async fn direct_paste<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    tracker: State<'_, crate::os::ForegroundWindowTracker>,
    id: String,
) -> Result<CopyReceipt, AppError> {
    actions::direct_paste_item(
        state.repository(),
        state.clipboard_monitor(),
        &crate::os::SystemDirectPaste,
        tracker.take(),
        &id,
        |text| app.clipboard().write_text(text).map_err(|error| error.to_string()),
    )
    .await
}

#[tauri::command]
pub(super) fn set_clipboard_tracking(state: State<'_, AppState>, enabled: bool) -> bool {
    actions::set_clipboard_tracking(state.clipboard_monitor(), enabled)
}
