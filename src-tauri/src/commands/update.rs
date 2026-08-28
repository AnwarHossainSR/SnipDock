use crate::{
    error::{AppError, ErrorCode},
    state::AppState,
};
use tauri::{AppHandle, Runtime, State};
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
pub(super) async fn install_update<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<bool, AppError> {
    let Some(update) = app
        .updater()
        .map_err(update_error)?
        .check()
        .await
        .map_err(update_error)?
    else {
        return Ok(false);
    };

    // Back up before the installer replaces anything. A release can ship a
    // migration that rebuilds tables, and none of that is reversible, so an
    // update that could not be backed up is one that does not start.
    //
    // `run_and_record` only fails when *no* destination took a copy: an upload
    // that could not reach its bucket while the local copy succeeded is a
    // warning, not a reason to keep the user on an old build.
    let settings = super::actions::get_settings(state.repository()).await?;
    let database = state.data_dir().join("snipdock.sqlite");
    if let Err(error) =
        crate::backup::run_and_record(state.repository(), &database, &settings.backup).await
    {
        return Err(AppError::new(
            ErrorCode::Storage,
            format!(
                "The update was not installed because SnipDock could not back up your data first: {}",
                error.message,
            ),
        ));
    }

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(update_error)?;
    app.restart();
    // `restart()` diverges; unreachable satisfies the Result return type.
    #[allow(unreachable_code)]
    Ok(true)
}
