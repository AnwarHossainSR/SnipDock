use super::{hide_main_window, show_main_window, AppState, MAIN_WINDOW};
use tauri::{
    menu::{CheckMenuItem, MenuBuilder, MenuItem, PredefinedMenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle, Emitter, Manager, Wry,
};

const PAUSE_CAPTURE_ITEM: &str = "pause_capture";
const IDLE_TOOLTIP: &str = "SnipDock";
const PAUSED_TOOLTIP: &str = "SnipDock - capture paused";

/// The tray's pause checkbox and the icon that owns it.
///
/// Both surfaces that can pause capture -- this checkbox and the switch in
/// Settings -- write the same `clipboard_tracking` setting, so whichever one
/// the user did not touch has to be told. Holding the handles in app state is
/// what lets [`sync_capture_state`] do that from the settings command without
/// the two drifting apart and disagreeing about whether capture is running.
struct TrayCapture {
    item: CheckMenuItem<Wry>,
    icon: TrayIcon<Wry>,
}

/// Moves the tray's pause checkbox and tooltip to match the saved setting.
///
/// A no-op where there is no tray: a desktop that could not build one logs at
/// startup and carries on without it.
pub fn sync_capture_state<R: tauri::Runtime>(app: &AppHandle<R>, tracking: bool) {
    let Some(tray) = app.try_state::<TrayCapture>() else {
        return;
    };
    let _ = tray.item.set_checked(!tracking);
    let _ = tray.icon.set_tooltip(Some(if tracking {
        IDLE_TOOLTIP
    } else {
        PAUSED_TOOLTIP
    }));
}

#[cfg(desktop)]
pub(super) fn setup_tray(app: &tauri::App, tracking: bool) -> tauri::Result<()> {
    let Some(icon) = app.default_window_icon().cloned() else {
        eprintln!("SnipDock: no default window icon configured, skipping tray icon");
        return Ok(());
    };

    let show_item = MenuItem::with_id(app, "show", "Show SnipDock", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
    // Ticked means paused. Phrasing it as the thing the click does, rather than
    // as "Capture clipboard" ticked when nothing is wrong, keeps the dangerous
    // state the visible one -- a tray whose box is ticked is a tray that is
    // recording nothing.
    let pause_item = CheckMenuItem::with_id(
        app,
        PAUSE_CAPTURE_ITEM,
        "Pause capture",
        true,
        !tracking,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let footer_separator = PredefinedMenuItem::separator(app)?;
    let quit_item = PredefinedMenuItem::quit(app, Some("Quit"))?;
    let menu = MenuBuilder::new(app)
        .items(&[
            &show_item,
            &hide_item,
            &separator,
            &pause_item,
            &footer_separator,
            &quit_item,
        ])
        .build()?;

    let tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip(if tracking { IDLE_TOOLTIP } else { PAUSED_TOOLTIP })
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "hide" => hide_main_window(app),
            PAUSE_CAPTURE_ITEM => toggle_capture(app),
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

    app.manage(TrayCapture {
        item: pause_item,
        icon: tray,
    });
    Ok(())
}

/// Flips capture on or off from the tray, reading the current setting rather
/// than trusting the checkbox: the box is a view of the setting, and the two
/// can disagree if Settings moved it while the menu was open.
fn toggle_capture(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        let tracking = match state.repository().get_settings().await {
            Ok(settings) => settings.clipboard_tracking,
            Err(error) => {
                eprintln!("Could not read the capture setting for the tray: {error}");
                return;
            }
        };

        match crate::commands::clipboard::actions::set_clipboard_tracking(
            state.repository(),
            state.clipboard_monitor(),
            !tracking,
        )
        .await
        {
            Ok(enabled) => {
                sync_capture_state(&app, enabled);
                // The Settings page listens for this, so its switch moves with
                // the tray rather than showing a stale value until reopened.
                // The event alone, not the full `apply_after_save`: nothing
                // here touches the global accelerator, and re-registering it
                // on a capture toggle would drop the binding for an instant
                // for no reason.
                if let Ok(settings) = state.repository().get_settings().await {
                    let _ = app.emit(crate::commands::settings::SETTINGS_CHANGED_EVENT, settings);
                }
            }
            Err(error) => eprintln!("Could not change capture from the tray: {error:?}"),
        }
    });
}
