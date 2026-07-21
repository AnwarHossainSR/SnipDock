use crate::error::{AppError, ErrorCode};
use tauri::{AppHandle, Runtime};
use tauri_plugin_updater::UpdaterExt;

fn update_error(error: impl std::fmt::Display) -> AppError {
    AppError::new(ErrorCode::Internal, error.to_string())
}

#[tauri::command]
pub(super) async fn check_for_update<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<String>, AppError> {
    Ok(app
        .updater()
        .map_err(update_error)?
        .check()
        .await
        .map_err(update_error)?
        .map(|update| update.version))
}

#[tauri::command]
pub(super) async fn install_update<R: Runtime>(app: AppHandle<R>) -> Result<bool, AppError> {
    let Some(update) = app
        .updater()
        .map_err(update_error)?
        .check()
        .await
        .map_err(update_error)?
    else {
        return Ok(false);
    };

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(update_error)?;
    app.restart();
}
