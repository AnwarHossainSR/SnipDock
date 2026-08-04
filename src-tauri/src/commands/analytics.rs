use crate::{
    error::AppError,
    models::UsageAnalytics,
    state::AppState,
};
use tauri::State;

pub mod actions {
    use super::super::repository_error;
    use crate::{
        error::AppError,
        models::UsageAnalytics,
        storage::analytics::AnalyticsRepository,
    };

    pub async fn get_analytics(repository: &AnalyticsRepository) -> Result<UsageAnalytics, AppError> {
        repository.get_analytics().await.map_err(repository_error)
    }
}

#[tauri::command]
pub(super) async fn get_analytics(
    state: State<'_, AppState>,
) -> Result<UsageAnalytics, AppError> {
    actions::get_analytics(state.analytics_repository()).await
}
