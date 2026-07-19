use super::{hide_main_window, show_main_window, MAIN_WINDOW};
use tauri::{
    menu::{MenuBuilder, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Manager,
};

#[cfg(desktop)]
pub(super) fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
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
