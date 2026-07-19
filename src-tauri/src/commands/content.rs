use crate::{
    error::AppError,
    models::{
        AiRequest, AiResult, FormatRequest, FormatResult, RenderTemplateRequest,
        RenderTemplateResult, ToolRequest, ToolResult,
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
pub(super) async fn render_template(
    input: RenderTemplateRequest,
) -> Result<RenderTemplateResult, AppError> {
    Ok(crate::templates::render(&input))
}

#[tauri::command]
pub(super) async fn run_tool(input: ToolRequest) -> Result<ToolResult, AppError> {
    crate::tools::run(input)
}

#[tauri::command]
pub(super) fn run_ai_action(input: AiRequest) -> Result<AiResult, AppError> {
    crate::ai::run(input)
}
