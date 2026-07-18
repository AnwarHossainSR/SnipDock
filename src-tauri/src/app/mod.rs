pub mod state;
mod tray;

pub use state::AppState;

use crate::{
    clipboard::{
        CaptureOutcome, CapturePolicy, CaptureSettings, ClipboardCapture, ClipboardMonitor,
        SystemClipboard,
    },
    commands,
    error::{AppError, ErrorCode},
    models::ContentType,
    os::{SystemForegroundApp, WindowPreferences},
    repository::Repository,
};
use std::{sync::Arc, time::Duration};
use tauri::{Emitter, Manager, WindowEvent};

/// Emitted whenever the main window becomes visible again, whether from a
/// fresh launch, the tray icon, or a second launch attempt being redirected
/// here by the single-instance plugin.
pub(super) const APP_SHOWN_EVENT: &str = "app://shown";
pub(super) const MAIN_WINDOW: &str = "main";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = commands::register(tauri::Builder::default());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }));
    }

    builder
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let database = tauri::async_runtime::block_on(crate::db::Database::open(
                data_dir.join("snipdock.sqlite"),
            ))
            .map_err(|error| std::io::Error::other(error.to_string()))?;
            let repository = Repository::new(database.pool().clone());
            let capture_settings = CaptureSettings::default();
            tauri::async_runtime::block_on(repository.cleanup_retention(
                capture_settings.max_items,
                capture_settings.history_days,
            ))
            .map_err(|error| std::io::Error::other(error.to_string()))?;
            let cleanup_repository = repository.clone();
            let cleanup_settings = capture_settings.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_secs(24 * 60 * 60)).await;
                    if let Err(error) = cleanup_repository
                        .cleanup_retention(
                            cleanup_settings.max_items,
                            cleanup_settings.history_days,
                        )
                        .await
                    {
                        eprintln!("Clipboard retention cleanup failed: {error}");
                    }
                }
            });
            let capture = Arc::new(ClipboardCapture::new(
                repository.clone(),
                SystemForegroundApp,
                CapturePolicy::new(capture_settings)?,
            ));
            let app_handle = app.handle().clone();
            let clipboard = Arc::new(SystemClipboard::new(app_handle.clone()));
            let monitor = ClipboardMonitor::start(
                clipboard,
                Duration::from_millis(500),
                move |text| {
                    let capture = capture.clone();
                    let app_handle = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        match capture.capture(text, ContentType::PlainText).await {
                            Ok(CaptureOutcome::Stored(item)) => {
                                let _ = app_handle.emit("clipboard://captured", item);
                            }
                            Ok(CaptureOutcome::Ignored(_)) => {}
                            Err(error) => eprintln!("Clipboard capture failed: {error}"),
                        }
                    });
                },
            );
            app.manage(AppState::new(repository, monitor));
            app.manage(WindowPreferences::default());

            #[cfg(desktop)]
            tray::setup_tray(app)?;

            if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                let event_window = window.clone();
                let app_handle = app.handle().clone();
                window.on_window_event(move |event| match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        let preferences = app_handle.state::<WindowPreferences>();
                        if preferences.close_to_tray() {
                            api.prevent_close();
                            let _ = event_window.hide();
                        }
                    }
                    WindowEvent::Resized(_) => {
                        let preferences = app_handle.state::<WindowPreferences>();
                        if preferences.minimize_to_tray()
                            && event_window.is_minimized().unwrap_or(false)
                        {
                            let _ = event_window.hide();
                        }
                    }
                    _ => {}
                });
            }

            let handle = app.handle().clone();
            let _ = handle.emit(APP_SHOWN_EVENT, ());
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| report_startup_failure(error));
}

pub(super) fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = app.emit(APP_SHOWN_EVENT, ());
    }
}

pub(super) fn hide_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.hide();
    }
}

fn report_startup_failure(error: tauri::Error) -> ! {
    let error = AppError::new(ErrorCode::Startup, error.to_string());
    eprintln!("SnipDock failed to start: {error}");
    std::process::exit(1);
}
