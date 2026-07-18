use crate::{
    error::AppError,
    models::{Category, LibraryItem, Project, SaveCategoryInput, SaveProjectInput, SaveTagInput, Tag},
    state::AppState,
};
use tauri::State;

pub mod actions {
    use super::super::repository_error;
    use crate::{
        error::AppError,
        models::{
            Category, LibraryItem, Project, SaveCategoryInput, SaveProjectInput, SaveTagInput, Tag,
        },
        repository::Repository,
    };

    pub async fn move_item(
        repository: &Repository,
        id: &str,
        project_id: Option<&str>,
    ) -> Result<LibraryItem, AppError> {
        repository
            .move_item(id, project_id)
            .await
            .map_err(repository_error)
    }

    pub async fn list_projects(
        repository: &Repository,
        include_archived: bool,
    ) -> Result<Vec<Project>, AppError> {
        repository
            .list_projects(include_archived)
            .await
            .map_err(repository_error)
    }

    pub async fn save_project(
        repository: &Repository,
        input: SaveProjectInput,
    ) -> Result<Project, AppError> {
        repository
            .save_project(input)
            .await
            .map_err(repository_error)
    }

    pub async fn list_categories(repository: &Repository) -> Result<Vec<Category>, AppError> {
        repository
            .list_categories()
            .await
            .map_err(repository_error)
    }

    pub async fn save_category(
        repository: &Repository,
        input: SaveCategoryInput,
    ) -> Result<Category, AppError> {
        repository
            .save_category(input)
            .await
            .map_err(repository_error)
    }

    pub async fn list_tags(repository: &Repository) -> Result<Vec<Tag>, AppError> {
        repository.list_tags().await.map_err(repository_error)
    }

    pub async fn save_tag(
        repository: &Repository,
        input: SaveTagInput,
    ) -> Result<Tag, AppError> {
        repository.save_tag(input).await.map_err(repository_error)
    }

    pub async fn merge_tags(
        repository: &Repository,
        source_id: &str,
        target_id: &str,
    ) -> Result<Tag, AppError> {
        repository
            .merge_tags(source_id, target_id)
            .await
            .map_err(repository_error)
    }
}

#[tauri::command]
pub(super) async fn move_item(
    state: State<'_, AppState>,
    id: String,
    project_id: Option<String>,
) -> Result<LibraryItem, AppError> {
    actions::move_item(state.repository(), &id, project_id.as_deref()).await
}

#[tauri::command]
pub(super) async fn list_projects(
    state: State<'_, AppState>,
    include_archived: bool,
) -> Result<Vec<Project>, AppError> {
    actions::list_projects(state.repository(), include_archived).await
}

#[tauri::command]
pub(super) async fn save_project(
    state: State<'_, AppState>,
    input: SaveProjectInput,
) -> Result<Project, AppError> {
    actions::save_project(state.repository(), input).await
}

#[tauri::command]
pub(super) async fn list_categories(
    state: State<'_, AppState>,
) -> Result<Vec<Category>, AppError> {
    actions::list_categories(state.repository()).await
}

#[tauri::command]
pub(super) async fn save_category(
    state: State<'_, AppState>,
    input: SaveCategoryInput,
) -> Result<Category, AppError> {
    actions::save_category(state.repository(), input).await
}

#[tauri::command]
pub(super) async fn list_tags(state: State<'_, AppState>) -> Result<Vec<Tag>, AppError> {
    actions::list_tags(state.repository()).await
}

#[tauri::command]
pub(super) async fn save_tag(
    state: State<'_, AppState>,
    input: SaveTagInput,
) -> Result<Tag, AppError> {
    actions::save_tag(state.repository(), input).await
}

#[tauri::command]
pub(super) async fn merge_tags(
    state: State<'_, AppState>,
    source_id: String,
    target_id: String,
) -> Result<Tag, AppError> {
    actions::merge_tags(state.repository(), &source_id, &target_id).await
}
