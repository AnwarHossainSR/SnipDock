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
    os::{SystemForegroundApp, WindowPreferences},
    repository::Repository,
};
use std::{sync::Arc, time::Duration};
use tauri::{Emitter, Manager, WindowEvent};
#[cfg(desktop)]
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

/// Emitted whenever the main window becomes visible again, whether from a
/// fresh launch, the tray icon, or a second launch attempt being redirected
/// here by the single-instance plugin.
pub(super) const APP_SHOWN_EVENT: &str = "app://shown";
pub(super) const MAIN_WINDOW: &str = "main";
pub(crate) const QUICK_PASTE_WINDOW: &str = "quick-paste";

fn is_background_launch<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter().any(|arg| arg.as_ref() == "--hidden")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let background_launch = is_background_launch(std::env::args());
    let mut builder = commands::register(tauri::Builder::default());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if !is_background_launch(args) {
                show_main_window(app);
            }
        }));
        builder = builder.plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ));
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&[QUICK_PASTE_WINDOW])
                .build(),
        )
        .setup(move |app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let database = tauri::async_runtime::block_on(
                crate::db::Database::open_with_pending_restore(&data_dir),
            )
            .map_err(|error| std::io::Error::other(error.to_string()))?;
            let repository = Repository::new(database.pool().clone());
            let settings = tauri::async_runtime::block_on(repository.get_settings())
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            #[cfg(desktop)]
            {
                let autostart = app.autolaunch();
                let result = match autostart.is_enabled() {
                    Ok(enabled) if settings.start_with_system != enabled => {
                        if settings.start_with_system { autostart.enable() } else { autostart.disable() }
                    }
                    Ok(_) => Ok(()),
                    Err(error) => Err(error),
                };
                if let Err(error) = result {
                    eprintln!("Could not apply startup launch setting: {error}");
                }
            }
            let capture_policy = CapturePolicy::new(CaptureSettings::from(&settings))?;
            let retention = capture_policy.settings();
            tauri::async_runtime::block_on(repository.cleanup_retention(
                retention.max_items,
                retention.history_days,
            ))
            .map_err(|error| std::io::Error::other(error.to_string()))?;
            // Retention just deleted rows, and the app may have been killed
            // mid-write last run, so reconcile the image directory against what
            // the database still references before anything else touches it.
            tauri::async_runtime::block_on(sweep_orphan_images(&repository, &data_dir));
            let cleanup_repository = repository.clone();
            let cleanup_policy = capture_policy.clone();
            let cleanup_data_dir = data_dir.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_secs(24 * 60 * 60)).await;
                    let settings = cleanup_policy.settings();
                    if let Err(error) = cleanup_repository
                        .cleanup_retention(settings.max_items, settings.history_days)
                        .await
                    {
                        eprintln!("Clipboard retention cleanup failed: {error}");
                    }
                    sweep_orphan_images(&cleanup_repository, &cleanup_data_dir).await;
                }
            });
            let capture = Arc::new(ClipboardCapture::new(
                repository.clone(),
                SystemForegroundApp,
                capture_policy.clone(),
                data_dir.clone(),
            ));
            let app_handle = app.handle().clone();
            let clipboard = Arc::new(SystemClipboard::new(app_handle.clone()));
            let monitor = ClipboardMonitor::start(
                clipboard,
                Duration::from_millis(500),
                move |snapshot| {
                    let capture = capture.clone();
                    let app_handle = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        match capture.capture_snapshot(snapshot).await {
                            Ok(CaptureOutcome::Stored(item)) => {
                                let _ = app_handle.emit("clipboard://captured", item);
                            }
                            Ok(CaptureOutcome::Ignored(_)) => {}
                            Err(error) => eprintln!("Clipboard capture failed: {error}"),
                        }
                    });
                },
            );
            if !settings.clipboard_tracking {
                monitor.pause();
            }
            app.manage(AppState::new(repository, monitor, data_dir));
            app.manage(capture_policy);
            app.manage(WindowPreferences::new(true, settings.minimize_to_tray));

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

            if let Some(window) = app.get_webview_window(QUICK_PASTE_WINDOW) {
                let event_window = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = event_window.hide();
                    }
                });
            }

            if !background_launch {
                show_main_window(app.handle());
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| report_startup_failure(error));
}

/// Deletes image files nothing points at any more. Every deletion path -- trash
/// expiry, retention pruning, clear history, single delete -- removes rows only,
/// so this single reconciliation covers all of them. Failure is non-fatal: the
/// worst outcome is disk left in use until the next sweep.
async fn sweep_orphan_images(repository: &Repository, data_dir: &std::path::Path) {
    let referenced = match repository.referenced_image_paths().await {
        Ok(referenced) => referenced,
        Err(error) => {
            eprintln!("Could not list referenced images: {error}");
            return;
        }
    };
    if let Err(error) = crate::images::sweep_orphans(data_dir, &referenced) {
        eprintln!("Image cleanup failed: {error}");
    }
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

#[cfg(test)]
mod tests {
    use super::is_background_launch;

    #[test]
    fn hidden_argument_selects_background_launch() {
        assert!(is_background_launch(["SnipDock.exe", "--hidden"]));
        assert!(!is_background_launch(["SnipDock.exe"]));
        assert!(!is_background_launch(["SnipDock.exe", "--hidden-window"]));
    }

}
