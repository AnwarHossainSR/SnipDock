use crate::{
    error::AppError,
    models::{
        FormatRequest, FormatResult, ToolRequest, ToolResult,
    },
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

#[tauri::command]
pub(super) async fn run_tool(input: ToolRequest) -> Result<ToolResult, AppError> {
    crate::tools::run(input)
}
