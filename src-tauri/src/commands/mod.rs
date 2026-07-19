mod clipboard;
mod content;
mod library;
mod organization;
mod settings;
mod transfer;

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

/// Global shortcut accelerator strings paired with the frontend event name
/// they emit. `open`, `search`, and `new-snippet` also bring the main window
/// forward; the rest are handled entirely by whichever page is on screen.
const GLOBAL_SHORTCUTS: &[(&str, &str)] = &[
    ("CmdOrCtrl+Shift+V", "shortcut://open"),
    ("CmdOrCtrl+Shift+F", "shortcut://search"),
    ("CmdOrCtrl+Shift+C", "shortcut://copy-selected"),
    ("CmdOrCtrl+Shift+P", "shortcut://toggle-pin"),
    ("CmdOrCtrl+Shift+Backspace", "shortcut://delete-selected"),
    ("CmdOrCtrl+Shift+N", "shortcut://new-snippet"),
    ("CmdOrCtrl+Shift+D", "shortcut://toggle-favorite"),
    ("CmdOrCtrl+Shift+Right", "shortcut://navigate-next"),
    ("CmdOrCtrl+Shift+Left", "shortcut://navigate-previous"),
];

const WINDOW_RAISING_EVENTS: &[&str] =
    &["shortcut://open", "shortcut://search", "shortcut://new-snippet"];

fn raise_main_window<R: tauri::Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
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
                .with_shortcuts(GLOBAL_SHORTCUTS.iter().map(|(shortcut, _)| *shortcut))
                .expect("global shortcut accelerators are valid")
                .with_handler(|app, shortcut, event| {
                    if event.state() != tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        return;
                    }
                    let tracker = app.state::<crate::os::ForegroundWindowTracker>();
                    tracker.record(crate::os::current_foreground_window());

                    let accelerator = shortcut.to_string();
                    let Some((_, event_name)) = GLOBAL_SHORTCUTS
                        .iter()
                        .find(|(candidate, _)| *candidate == accelerator)
                    else {
                        return;
                    };
                    if WINDOW_RAISING_EVENTS.contains(event_name) {
                        raise_main_window(app);
                    }
                    let _ = app.emit(*event_name, ());
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            library::search_items,
            library::get_item,
            library::save_item,
            library::duplicate_item,
            library::set_item_flags,
            organization::move_item,
            library::delete_item,
            library::restore_item,
            clipboard::clear_clipboard_history,
            clipboard::copy_item,
            clipboard::direct_paste,
            organization::list_projects,
            organization::save_project,
            organization::list_categories,
            organization::save_category,
            organization::list_tags,
            organization::save_tag,
            organization::merge_tags,
            content::format_content,
            content::render_template,
            content::run_tool,
            transfer::export_data,
            transfer::import_data,
            transfer::create_backup,
            transfer::restore_backup,
            settings::get_settings,
            settings::save_settings,
            clipboard::set_clipboard_tracking,
        ])
}
