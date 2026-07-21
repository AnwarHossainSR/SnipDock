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
