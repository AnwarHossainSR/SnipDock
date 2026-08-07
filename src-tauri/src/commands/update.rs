use crate::error::{AppError, ErrorCode};
use tauri::{AppHandle, Runtime};
use tauri_plugin_updater::UpdaterExt;

/// Details about an available update, surfaced to the UI so users can review
/// the release notes before installing.
#[derive(serde::Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
    pub date: Option<String>,
}

fn update_error(error: impl std::fmt::Display) -> AppError {
    AppError::new(ErrorCode::Internal, error.to_string())
}

#[tauri::command]
pub(super) async fn check_for_update<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<UpdateInfo>, AppError> {
    Ok(app
        .updater()
        .map_err(update_error)?
        .check()
        .await
        .map_err(update_error)?
        .map(|update| UpdateInfo {
            version: update.version,
            notes: update.body,
            date: update.date.map(|date| date.to_string()),
        }))
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
    // `restart()` diverges; unreachable satisfies the Result return type.
    #[allow(unreachable_code)]
    Ok(true)
}
