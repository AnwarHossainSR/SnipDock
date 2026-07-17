mod commands;
pub mod db;
pub mod error;
pub mod models;
pub mod state;

use error::{AppError, ErrorCode};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    commands::register(tauri::Builder::default())
        .manage(state::AppState)
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| report_startup_failure(error));
}

fn report_startup_failure(error: tauri::Error) -> ! {
    let error = AppError::new(ErrorCode::Startup, error.to_string());
    eprintln!("SnipDock failed to start: {error}");
    std::process::exit(1);
}
