use crate::{
    error::AppError,
    state::AppState,
};
use tauri::State;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct DuplicateGroup {
    pub content_hash: String,
    pub count: i64,
    pub items: Vec<DuplicateItem>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct DuplicateItem {
    pub id: String,
    pub title: Option<String>,
    pub content_type: String,
    pub created_at: String,
    pub usage_count: i64,
}

pub mod actions {
    use super::super::repository_error;
    use super::{DuplicateGroup, DuplicateItem};
    use crate::{
        error::AppError,
        storage::duplicates::DuplicateRepository,
    };

    pub async fn find_duplicates(repository: &DuplicateRepository) -> Result<Vec<DuplicateGroup>, AppError> {
        let groups = repository.find_duplicates().await.map_err(repository_error)?;
        
        Ok(groups
            .into_iter()
            .map(|g| DuplicateGroup {
                content_hash: g.content_hash,
                count: g.count,
                items: g.items
                    .into_iter()
                    .map(|i| DuplicateItem {
                        id: i.id,
                        title: i.title,
                        content_type: i.content_type,
                        created_at: i.created_at,
                        usage_count: i.usage_count,
                    })
                    .collect(),
            })
            .collect())
    }

    pub async fn merge_duplicates(
        repository: &DuplicateRepository,
        keep_id: &str,
        duplicate_ids: &[String],
    ) -> Result<i64, AppError> {
        repository.merge_duplicates(keep_id, duplicate_ids).await.map_err(repository_error)
    }

    pub async fn get_duplicate_count(repository: &DuplicateRepository) -> Result<i64, AppError> {
        repository.get_duplicate_count().await.map_err(repository_error)
    }
}

#[tauri::command]
pub(super) async fn find_duplicates(
    state: State<'_, AppState>,
) -> Result<Vec<DuplicateGroup>, AppError> {
    actions::find_duplicates(state.duplicate_repository()).await
}

#[tauri::command]
pub(super) async fn merge_duplicates(
    state: State<'_, AppState>,
    keep_id: String,
    duplicate_ids: Vec<String>,
) -> Result<i64, AppError> {
    actions::merge_duplicates(state.duplicate_repository(), &keep_id, &duplicate_ids).await
}

#[tauri::command]
pub(super) async fn get_duplicate_count(
    state: State<'_, AppState>,
) -> Result<i64, AppError> {
    actions::get_duplicate_count(state.duplicate_repository()).await
}
