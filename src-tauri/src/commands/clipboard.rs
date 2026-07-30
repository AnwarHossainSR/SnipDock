use crate::{
    error::AppError,
    models::{CopyMode, CopyReceipt, DeleteReceipt},
    state::AppState,
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_clipboard_manager::ClipboardExt;

pub mod actions {
    use super::super::repository_error;
    use crate::{
        clipboard::ClipboardMonitor,
        error::{AppError, ErrorCode},
        images::{self, RawImage},
        models::{ContentType, CopyMode, CopyReceipt, DeleteReceipt},
        repository::Repository,
    };
    use std::path::Path;

    /// What to hand back to the system clipboard for an item.
    pub enum ClipboardPayload<'a> {
        Text(&'a str),
        Image(RawImage),
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
        data_dir: &Path,
        id: &str,
        mode: CopyMode,
        write: F,
    ) -> Result<CopyReceipt, AppError>
    where
        F: FnOnce(ClipboardPayload<'_>) -> Result<(), String>,
    {
        if mode != CopyMode::Raw {
            return Err(AppError::new(
                ErrorCode::Validation,
                "clipboard history supports raw copy only",
            ));
        }

        let item = repository.get_item(id).await.map_err(repository_error)?;
        // For images `content` is the stored path, which is exactly the
        // signature the monitor compares against, so suppression is identical
        // for both kinds.
        let payload = if item.content_type == ContentType::Image {
            let image = images::load(data_dir, &item.content).map_err(|error| {
                AppError::new(
                    ErrorCode::Storage,
                    format!("stored image could not be read: {error}"),
                )
            })?;
            ClipboardPayload::Image(image)
        } else {
            ClipboardPayload::Text(&item.content)
        };

        monitor.mark_self_written(item.content.clone());
        if let Err(error) = write(payload) {
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
        data_dir: &Path,
        direct_paste: &dyn crate::os::DirectPaste,
        target: Option<u64>,
        id: &str,
        write: F,
    ) -> Result<CopyReceipt, AppError>
    where
        F: FnOnce(ClipboardPayload<'_>) -> Result<(), String>,
    {
        let handle = target.ok_or_else(|| {
            AppError::new(
                ErrorCode::Clipboard,
                "could not identify the window that should receive the paste",
            )
        })?;
        let receipt = copy_item(repository, monitor, data_dir, id, CopyMode::Raw, write).await?;
        if !direct_paste.restore_and_paste(handle) {
            return Err(AppError::new(
                ErrorCode::Clipboard,
                "could not restore the target window and paste the item",
            ));
        }
        Ok(receipt)
    }

    pub async fn set_clipboard_tracking(
        repository: &Repository,
        monitor: &ClipboardMonitor,
        enabled: bool,
    ) -> Result<bool, AppError> {
        repository
            .save_settings(crate::models::SettingsPatch {
                values: std::collections::BTreeMap::from([("clipboard_tracking".into(), enabled.into())]),
            })
            .await
            .map_err(repository_error)?;
        if enabled {
            monitor.resume();
        } else {
            monitor.pause();
        }
        Ok(enabled)
    }
}

#[tauri::command]
pub(super) async fn clear_clipboard_history(
    state: State<'_, AppState>,
) -> Result<DeleteReceipt, AppError> {
    actions::clear_clipboard_history(state.repository()).await
}

#[tauri::command]
pub(super) async fn clear_clipboard_history_with_options(
    state: State<'_, AppState>,
    exclude_pinned: bool,
    exclude_favorite: bool,
) -> Result<DeleteReceipt, AppError> {
    state
        .repository()
        .clear_clipboard_history_with_options(exclude_pinned, exclude_favorite)
        .await
        .map_err(super::repository_error)
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
        state.data_dir(),
        &id,
        mode,
        |payload| write_payload(&app, payload),
    )
    .await
}

/// Hands a payload to the system clipboard in its native format, so an image
/// item pastes as an image rather than as the text of its file path.
fn write_payload<R: tauri::Runtime>(
    app: &AppHandle<R>,
    payload: actions::ClipboardPayload<'_>,
) -> Result<(), String> {
    match payload {
        actions::ClipboardPayload::Text(text) => app.clipboard().write_text(text),
        actions::ClipboardPayload::Image(image) => {
            let owned = tauri::image::Image::new_owned(image.rgba, image.width, image.height);
            app.clipboard().write_image(&owned)
        }
    }
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub(super) async fn direct_paste<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    tracker: State<'_, crate::os::ForegroundWindowTracker>,
    id: String,
) -> Result<CopyReceipt, AppError> {
    let target = tracker.take();
    let result = actions::direct_paste_item(
        state.repository(),
        state.clipboard_monitor(),
        state.data_dir(),
        &crate::os::SystemDirectPaste,
        target,
        &id,
        |payload| write_payload(&app, payload),
    )
    .await;
    if result.is_err() {
        tracker.record(target);
    }
    let receipt = result?;
    if let Some(window) = app.get_webview_window(crate::app::QUICK_PASTE_WINDOW) {
        let _ = window.hide();
    }
    Ok(receipt)
}

#[tauri::command]
pub(super) fn direct_paste_supported() -> bool {
    cfg!(target_os = "windows")
}

#[tauri::command]
pub(super) async fn set_clipboard_tracking(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<bool, AppError> {
    actions::set_clipboard_tracking(state.repository(), state.clipboard_monitor(), enabled).await
}
