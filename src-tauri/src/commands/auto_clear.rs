use crate::{
    error::AppError,
    state::AppState,
};
use tauri::State;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct ClearSensitiveResult {
    pub cleared_count: i64,
    pub cleared_ids: Vec<String>,
    pub receipt_id: Option<String>,
    pub expires_at: Option<String>,
}

pub mod actions {
    use super::super::repository_error;
    use super::ClearSensitiveResult;
    use crate::{
        error::AppError,
        storage::auto_clear::AutoClearRepository,
    };
    use std::time::Duration;

    pub async fn clear_sensitive_data(
        repository: &AutoClearRepository,
        max_age_minutes: u32,
    ) -> Result<ClearSensitiveResult, AppError> {
        let max_age = Duration::from_secs(max_age_minutes as u64 * 60);
        let result = repository.clear_sensitive_items(max_age).await.map_err(repository_error)?;
        
        Ok(ClearSensitiveResult {
            cleared_count: result.cleared_count,
            cleared_ids: result.cleared_ids,
            receipt_id: result.receipt_id,
            expires_at: result.expires_at,
        })
    }
}

#[tauri::command]
pub(super) async fn clear_sensitive_data(
    state: State<'_, AppState>,
    max_age_minutes: u32,
) -> Result<ClearSensitiveResult, AppError> {
    actions::clear_sensitive_data(state.auto_clear_repository(), max_age_minutes).await
}
