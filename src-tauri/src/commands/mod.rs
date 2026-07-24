mod clipboard;
mod content;
mod library;
mod organization;
mod settings;
mod transfer;
mod update;

use crate::{
    error::{AppError, ErrorCode},
    repository::RepositoryError,
};
use tauri::{AppHandle, Emitter, Manager};

pub mod actions {
    pub use super::clipboard::actions::*;
    pub use super::library::actions::*;
    pub use super::organization::actions::*;
    pub use super::settings::actions::*;
}

fn repository_error(error: RepositoryError) -> AppError {
    match error {
        RepositoryError::Validation(message) => AppError::new(ErrorCode::Validation, message),
        RepositoryError::NotFound => AppError::new(ErrorCode::NotFound, "item not found"),
        RepositoryError::CorruptData(_) => {
            AppError::new(ErrorCode::Storage, "stored item is invalid")
        }
        RepositoryError::Storage(_) => {
            AppError::new(ErrorCode::Storage, "item database unavailable")
        }
    }
}

/// The only OS-wide shortcut. It must fire while another application has
/// focus so Quick Paste can open above it. Every other accelerator is handled
/// inside the main window (see `src/app/App.tsx`) so SnipDock does not swallow
/// common shortcuts like `Ctrl+Shift+P` or `Ctrl+Shift+F` from other apps.
const QUICK_PASTE_SHORTCUT: &str = "CmdOrCtrl+Shift+V";

fn show_quick_paste<R: tauri::Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(crate::app::QUICK_PASTE_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn register<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
        .manage(crate::os::ForegroundWindowTracker::default())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts([QUICK_PASTE_SHORTCUT])
                .expect("global shortcut accelerator is valid")
                .with_handler(|app, _shortcut, event| {
                    if event.state() != tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        return;
                    }
                    let tracker = app.state::<crate::os::ForegroundWindowTracker>();
                    tracker.record(crate::os::current_foreground_window());
                    show_quick_paste(app);
                    let _ = app.emit("shortcut://open", ());
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            library::search_items,
            library::set_item_flags,
            library::delete_item,
            library::restore_item,
            clipboard::clear_clipboard_history,
            clipboard::copy_item,
            clipboard::direct_paste,
            content::format_content,
            transfer::export_data,
            transfer::import_data,
            transfer::create_backup,
            transfer::restore_backup,
            transfer::restart_app,
            settings::get_settings,
            settings::save_settings,
            settings::get_autostart,
            settings::set_autostart,
            update::check_for_update,
            update::install_update,
            clipboard::set_clipboard_tracking,
        ])
}
