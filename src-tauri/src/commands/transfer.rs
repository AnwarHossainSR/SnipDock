use crate::{
    error::AppError,
    models::{
        BackupReceipt, BackupRequest, ExportReceipt, ExportRequest, ImportReport, ImportRequest,
        RestoreReport, RestoreRequest,
    },
    state::AppState,
};
use tauri::State;

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
pub(super) async fn restore_backup(
    state: State<'_, AppState>,
    input: RestoreRequest,
) -> Result<RestoreReport, AppError> {
    crate::transfer::restore_backup(state.repository(), input).await
}
