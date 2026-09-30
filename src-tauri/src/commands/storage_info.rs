use crate::{error::AppError, images, state::AppState};
use serde::Serialize;
use tauri::State;

#[derive(Serialize)]
pub struct StorageSize {
    /// Live database pages, so a delete brings it down without a VACUUM.
    pub db_bytes: u64,
    /// Images the history still references, thumbnails included.
    pub images_bytes: u64,
    pub total_bytes: u64,
    /// `max_storage_mb` in bytes.
    pub limit_bytes: u64,
    /// Capture is refused from here on; the same test the capture path makes.
    pub full: bool,
}

#[tauri::command]
pub(super) async fn get_storage_size(state: State<'_, AppState>) -> Result<StorageSize, AppError> {
    let repository = state.repository();
    let usage = repository
        .storage_usage(state.data_dir())
        .await
        .map_err(super::repository_error)?;
    let limit_bytes = repository
        .get_settings()
        .await
        .map_err(super::repository_error)?
        .storage_limit_bytes();
    let total_bytes = usage.total_bytes();
    Ok(StorageSize {
        db_bytes: usage.db_bytes,
        images_bytes: usage.images_bytes,
        total_bytes,
        limit_bytes,
        full: total_bytes >= limit_bytes,
    })
}

#[derive(Serialize)]
pub struct StoredImage {
    pub id: String,
    pub bytes: u64,
    pub created_at: String,
}

/// The stored images that take the most room, largest first, so a user who
/// wants space back can see exactly which captures to drop. Sizes come from the
/// files themselves - the database records only the path.
#[tauri::command]
pub(super) async fn largest_images(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> Result<Vec<StoredImage>, AppError> {
    let data_dir = state.data_dir().to_path_buf();
    let rows = state
        .repository()
        .image_paths()
        .await
        .map_err(super::repository_error)?;

    let mut sized: Vec<StoredImage> = rows
        .into_iter()
        .map(|(id, relative, created_at)| {
            let bytes = images::resolve(&data_dir, &relative)
                .and_then(std::fs::metadata)
                .map(|meta| meta.len())
                // A row whose file is missing is still worth listing at zero:
                // deleting it is exactly what clears the dangling record.
                .unwrap_or(0);
            StoredImage { id, bytes, created_at }
        })
        .collect();

    sized.sort_by_key(|image| std::cmp::Reverse(image.bytes));
    sized.truncate(limit.unwrap_or(20) as usize);
    Ok(sized)
}
