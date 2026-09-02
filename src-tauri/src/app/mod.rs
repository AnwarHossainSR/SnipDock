mod alert;
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
    storage::{analytics::AnalyticsRepository, auto_clear::AutoClearRepository, duplicates::DuplicateRepository, smart_folders::SmartFolderRepository},
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
            // Tauri turns a setup error into a panic, which under
            // `windows_subsystem = "windows"` reaches nobody: the app looks
            // like it opens and stops. Report the reason before exiting.
            if let Err(error) = setup_app(app, background_launch) {
                report_startup_failure(&error.to_string());
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| report_startup_failure(&error.to_string()));
}

/// The work `run`'s setup hook does, lifted out so its failure can be
/// reported rather than panicking inside Tauri.
fn setup_app(
    app: &mut tauri::App,
    background_launch: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    let database = tauri::async_runtime::block_on(
        crate::db::Database::open_with_pending_restore(&data_dir),
    )
    .map_err(|error| error.to_string())?;
    let repository = Repository::new(database.pool().clone());
    let smart_folder_repository = SmartFolderRepository::new(database.pool().clone());
    let analytics_repository = AnalyticsRepository::new(database.pool().clone());
    let duplicate_repository = DuplicateRepository::new(database.pool().clone());
    let auto_clear_repository = AutoClearRepository::new(database.pool().clone());
    let settings = tauri::async_runtime::block_on(repository.get_settings())
        .map_err(|error| error.to_string())?;
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
    spawn_scheduled_backups(repository.clone(), data_dir.join("snipdock.sqlite"));
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
    // Paused for now whatever the setting says: the startup sweep below deletes
    // image files the database no longer references, and a capture landing
    // while it runs could have its file swept between the reference list being
    // read and the deletions happening.
    monitor.pause();
    app.manage(AppState::new(repository.clone(), smart_folder_repository, analytics_repository, duplicate_repository, auto_clear_repository, monitor.clone(), data_dir.clone()));
    app.manage(capture_policy.clone());
    app.manage(WindowPreferences::new(true, settings.minimize_to_tray));

    let cli_monitor = Arc::new(monitor.clone());
    let cli_repository = repository.clone();
    let cli_data_dir = data_dir.clone();
    let cli_app = app.handle().clone();
    let cli_paste_format = settings.paste_format;
    match crate::cli::server::start(
        &cli_data_dir,
        cli_repository,
        cli_monitor,
        Arc::new(move |payload| crate::commands::clipboard::write_payload(&cli_app, payload)),
        cli_paste_format,
    ) {
        Ok(handle) => {
            app.manage(handle);
        }
        Err(error) => {
            eprintln!("Could not start the CLI HTTP server: {error}");
        }
    }

    if let Err(error) = crate::platform::shortcuts::apply_global_shortcut(app.handle(), &settings) {
        eprintln!("Could not apply the saved Quick Paste rebind: {error}");
    }

    #[cfg(desktop)]
    tray::setup_tray(app)?;
    // Retention and the orphan sweep used to run inline, before the state was
    // registered. The webview loads in parallel, so on a slow start the first
    // `get_settings` and `search_items` arrived while `AppState` was still
    // unmanaged and failed - the app opened saying its history was
    // unavailable. Nothing here is a precondition for reading the database, so
    // it runs after the commands are answerable.
    let startup_handle = app.handle().clone();
    let startup_repository = repository;
    let startup_data_dir = data_dir;
    let _startup_gate = app.state::<AppState>().startup_sweep_gate();
    tauri::async_runtime::spawn(async move {
        let retention = capture_policy.settings();
        if let Err(error) = startup_repository
            .cleanup_retention(retention.max_items, retention.history_days)
            .await
        {
            eprintln!("Clipboard retention cleanup failed: {error}");
        }
        // Retention just deleted rows, and the app may have been killed
        // mid-write last run, so reconcile the image directory against what
        // the database still references.
        sweep_orphan_images(&startup_repository, &startup_data_dir).await;
        let current_tracking = startup_handle
            .state::<AppState>()
            .repository()
            .get_settings()
            .await
            .ok()
            .map(|s| s.clipboard_tracking)
            .unwrap_or(false);
        if current_tracking {
            startup_handle
                .state::<AppState>()
                .clipboard_monitor()
                .resume();
        }
        startup_handle.state::<AppState>().mark_startup_sweep_done();
    });

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
}

/// Runs the user's scheduled backups.
///
/// Wakes hourly rather than sleeping for the whole interval because a desktop
/// app is rarely running at any particular hour: a daily backup on a machine
/// that is only open during the working day has to catch up whenever it next
/// opens, which is what `backup_is_due` decides from the recorded last run.
/// Settings are re-read each time so a schedule change takes effect without a
/// restart.
fn spawn_scheduled_backups(repository: Repository, database_path: std::path::PathBuf) {
    tauri::async_runtime::spawn(async move {
        loop {
            let settings = match repository.get_settings().await {
                Ok(settings) => settings.backup,
                Err(error) => {
                    eprintln!("Could not read backup settings: {error}");
                    tokio::time::sleep(Duration::from_secs(60 * 60)).await;
                    continue;
                }
            };
            if crate::backup::backup_is_due(&settings, chrono::Utc::now()) {
                match crate::backup::run_and_record(&repository, &database_path, &settings).await {
                    Ok(report) => {
                        for warning in &report.warnings {
                            eprintln!("Scheduled backup warning: {warning}");
                        }
                    }
                    Err(error) => eprintln!("Scheduled backup failed: {}", error.message),
                }
            }
            tokio::time::sleep(Duration::from_secs(60 * 60)).await;
        }
    });
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

fn report_startup_failure(reason: &str) -> ! {
    let error = AppError::new(ErrorCode::Startup, reason);
    eprintln!("SnipDock failed to start: {error}");
    alert::show(
        "SnipDock could not start",
        &format!(
            "SnipDock could not start.\n\n{reason}\n\nIf this followed an update or a downgrade, installing the latest version usually fixes it. This error does not delete your clipboard history."
        ),
    );
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
