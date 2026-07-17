pub mod commands;
pub mod clipboard;
pub mod db;
pub mod error;
pub mod models;
pub mod os;
pub mod repository;
pub mod state;

use clipboard::{
    CaptureOutcome, CapturePolicy, CaptureSettings, ClipboardCapture, ClipboardMonitor,
    SystemClipboard,
};
use error::{AppError, ErrorCode};
use models::ContentType;
use os::SystemForegroundApp;
use repository::Repository;
use std::{sync::Arc, time::Duration};
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    commands::register(tauri::Builder::default())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let database = tauri::async_runtime::block_on(db::Database::open(
                data_dir.join("snipdock.sqlite"),
            ))
            .map_err(|error| std::io::Error::other(error.to_string()))?;
            let repository = Repository::new(database.pool().clone());
            let capture = Arc::new(ClipboardCapture::new(
                repository.clone(),
                SystemForegroundApp,
                CapturePolicy::new(CaptureSettings::default())?,
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
            app.manage(state::AppState::new(repository, monitor));
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| report_startup_failure(error));
}

fn report_startup_failure(error: tauri::Error) -> ! {
    let error = AppError::new(ErrorCode::Startup, error.to_string());
    eprintln!("SnipDock failed to start: {error}");
    std::process::exit(1);
}
