pub mod app;
pub mod commands;
pub mod clipboard;
pub mod error;
pub mod features;
pub mod models;
pub mod platform;
pub mod repository;
pub mod storage;

pub use app::state;
pub use features::{ai, detection, formatting, security, sync, templates, tools, transfer};
pub use platform::windows as os;
pub use storage::database as db;

use clipboard::{
    CaptureOutcome, CapturePolicy, CaptureSettings, ClipboardCapture, ClipboardMonitor,
    SystemClipboard,
};
use error::{AppError, ErrorCode};
use models::ContentType;
use os::{SystemForegroundApp, WindowPreferences};
use repository::Repository;
use std::{sync::Arc, time::Duration};
use tauri::{
    menu::{MenuBuilder, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, WindowEvent,
};

/// Emitted whenever the main window becomes visible again, whether from a
/// fresh launch, the tray icon, or a second launch attempt being redirected
/// here by the single-instance plugin.
const APP_SHOWN_EVENT: &str = "app://shown";
const MAIN_WINDOW: &str = "main";

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
            let database = tauri::async_runtime::block_on(db::Database::open(
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
            app.manage(state::AppState::new(repository, monitor));
            app.manage(WindowPreferences::default());

            #[cfg(desktop)]
            setup_tray(app)?;

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

#[cfg(desktop)]
fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let Some(icon) = app.default_window_icon().cloned() else {
        eprintln!("SnipDock: no default window icon configured, skipping tray icon");
        return Ok(());
    };

    let show_item = MenuItem::with_id(app, "show", "Show SnipDock", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = PredefinedMenuItem::quit(app, Some("Quit"))?;
    let menu = MenuBuilder::new(app)
        .items(&[&show_item, &hide_item, &separator, &quit_item])
        .build()?;

    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "hide" => hide_main_window(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if app
                    .get_webview_window(MAIN_WINDOW)
                    .is_some_and(|window| window.is_visible().unwrap_or(false))
                {
                    hide_main_window(app);
                } else {
                    show_main_window(app);
                }
            }
        })
        .build(app)?;
    Ok(())
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = app.emit(APP_SHOWN_EVENT, ());
    }
}

fn hide_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.hide();
    }
}

fn report_startup_failure(error: tauri::Error) -> ! {
    let error = AppError::new(ErrorCode::Startup, error.to_string());
    eprintln!("SnipDock failed to start: {error}");
    std::process::exit(1);
}
