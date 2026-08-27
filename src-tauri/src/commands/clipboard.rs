use crate::{
    error::{AppError, ErrorCode},
    models::{CopyMode, CopyReceipt, DeleteReceipt, LibraryItem},
    state::AppState,
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use super::repository_error;

pub mod actions {
    use super::super::repository_error;
    use crate::{
        clipboard::ClipboardMonitor,
        error::{AppError, ErrorCode},
        images::{self, RawImage},
        models::{ContentType, CopyMode, CopyReceipt, DeleteReceipt, ItemKind, LibraryItem, SaveItemInput},
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
        paste_format: crate::models::PasteFormat,
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
        
        // Apply paste format to content
        let formatted_content = if item.content_type == ContentType::Image {
            // Don't format images
            item.content.clone()
        } else {
            crate::formatting::apply_paste_format(&item.content, paste_format)
        };
        
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
            ClipboardPayload::Text(&formatted_content)
        };

        monitor.mark_self_written(formatted_content.clone());
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
    #[allow(clippy::too_many_arguments)]
    pub async fn direct_paste_item<F>(
        repository: &Repository,
        monitor: &ClipboardMonitor,
        data_dir: &Path,
        direct_paste: &dyn crate::os::DirectPaste,
        target: Option<u64>,
        id: &str,
        paste_format: crate::models::PasteFormat,
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
        let receipt = copy_item(repository, monitor, data_dir, id, CopyMode::Raw, paste_format, write).await?;
        if !direct_paste.restore_and_paste(handle) {
            return Err(AppError::new(
                ErrorCode::Clipboard,
                "could not restore the target window and paste the item",
            ));
        }
        Ok(receipt)
    }

    /// Stores something the user typed or pasted into SnipDock by hand. The
    /// result is an ordinary clipboard item: same list, same filters, same copy
    /// behaviour, so the only thing that distinguishes it is how it arrived.
    ///
    /// Capture policy is deliberately not consulted. Ignored applications,
    /// ignored patterns, and duplicate suppression exist to keep *automatic*
    /// capture quiet; none of them is a reason to silently discard something
    /// the user explicitly asked to keep. Content that looks like a secret is
    /// still marked private, so it is stored masked rather than dropped.
    pub async fn save_manual_item(
        repository: &Repository,
        content: String,
        title: Option<String>,
    ) -> Result<LibraryItem, AppError> {
        if content.trim().is_empty() {
            return Err(AppError::new(
                ErrorCode::Validation,
                "content must not be empty",
            ));
        }
        let title = title
            .map(|title| title.trim().to_owned())
            .filter(|title| !title.is_empty());
        let (content_type, language) = crate::detection::detect(&content);
        let private = crate::detection::contains_high_risk_secret(&content);
        let item = repository
            .save_item(SaveItemInput {
                id: None,
                kind: ItemKind::Clipboard,
                title,
                description: None,
                content,
                content_type,
                notes: None,
                project_id: None,
                category_id: None,
                tag_ids: Vec::new(),
                private,
                expires_at: None,
            })
            .await
            .map_err(repository_error)?;
        match language {
            Some(language) => repository
                .set_item_language(&item.id, &language)
                .await
                .map_err(repository_error),
            None => Ok(item),
        }
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
    let settings = state.repository().get_settings().await.map_err(repository_error)?;
    actions::copy_item(
        state.repository(),
        state.clipboard_monitor(),
        state.data_dir(),
        &id,
        mode,
        settings.paste_format,
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
    let settings = state.repository().get_settings().await.map_err(repository_error)?;
    let target = tracker.take();
    let result = actions::direct_paste_item(
        state.repository(),
        state.clipboard_monitor(),
        state.data_dir(),
        &crate::os::SystemDirectPaste,
        target,
        &id,
        settings.paste_format,
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

/// Hands the system clipboard's current text to the frontend so the manual
/// save form can offer a one-click paste. Reading through the backend keeps
/// this working regardless of what the webview permits `navigator.clipboard`
/// to do, and matches how every other clipboard access in the app is routed.
#[tauri::command]
pub(super) fn read_clipboard_text<R: tauri::Runtime>(app: AppHandle<R>) -> Result<String, AppError> {
    app.clipboard()
        .read_text()
        .map_err(|error| AppError::new(ErrorCode::Clipboard, error.to_string()))
}

#[tauri::command]
pub(super) async fn save_manual_item<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    policy: State<'_, crate::clipboard::CapturePolicy>,
    content: String,
    title: Option<String>,
) -> Result<LibraryItem, AppError> {
    let item = actions::save_manual_item(state.repository(), content, title).await?;
    // Retention applies to a hand-written item exactly as it does to a captured
    // one; skipping it here would let manual saves grow the history past the
    // ceiling the user set.
    let settings = policy.settings();
    state
        .repository()
        .prune_clipboard_history(settings.max_items, settings.history_days)
        .await
        .map_err(repository_error)?;
    // Same event a capture raises, so every open window updates through the one
    // path instead of the saving window alone.
    let _ = app.emit("clipboard://captured", item.clone());
    Ok(item)
}
