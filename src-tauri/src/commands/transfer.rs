use crate::{
    error::AppError,
    models::{
        BackupReceipt, BackupRequest, ExportReceipt, ExportRequest, ImportReport, ImportRequest,
        RestoreReport, RestoreRequest,
    },
    state::AppState,
};
use tauri::{AppHandle, Manager, Runtime, State};

#[tauri::command]
pub(super) async fn export_data(
    state: State<'_, AppState>,
    input: ExportRequest,
) -> Result<ExportReceipt, AppError> {
    crate::transfer::export_data(state.repository(), input).await
}

#[tauri::command]
pub(super) async fn import_data(
    state: State<'_, AppState>,
    input: ImportRequest,
) -> Result<ImportReport, AppError> {
    crate::transfer::import_data(state.repository(), input).await
}

#[tauri::command]
pub(super) async fn create_backup(
    state: State<'_, AppState>,
    input: BackupRequest,
) -> Result<BackupReceipt, AppError> {
    crate::transfer::create_backup(state.repository(), input).await
}

#[tauri::command]
pub(super) async fn restore_backup<R: Runtime>(
    app: AppHandle<R>,
    input: RestoreRequest,
) -> Result<RestoreReport, AppError> {
    let pending = app
        .path()
        .app_data_dir()
        .map_err(|error| crate::error::AppError::new(crate::error::ErrorCode::Storage, error.to_string()))?
        .join("snipdock.restore-pending.sqlite");
    crate::transfer::restore_backup(input, &pending).await
}

#[tauri::command]
pub(super) fn restart_app<R: Runtime>(app: AppHandle<R>) {
    app.request_restart();
}
