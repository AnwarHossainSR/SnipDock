use crate::{
    error::AppError,
    models::{FormatRequest, FormatResult},
    state::AppState,
};
use tauri::State;

#[tauri::command]
pub(super) async fn format_content(
    state: State<'_, AppState>,
    input: FormatRequest,
) -> Result<FormatResult, AppError> {
    let indent = state
        .repository()
        .get_settings()
        .await
        .map(|settings| settings.formatter_indent)
        .unwrap_or(2);
    Ok(crate::formatting::format(&input, indent))
}
