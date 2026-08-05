use crate::{error::AppError, state::AppState};
use serde::Serialize;
use std::path::Path;
use tauri::State;

#[derive(Serialize)]
pub struct StorageSize {
    /// Size of the SQLite database file in bytes.
    pub db_bytes: u64,
    /// Total size of all stored images in bytes.
    pub images_bytes: u64,
    /// Combined total in bytes.
    pub total_bytes: u64,
}

fn dir_size(path: &Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    total += meta.len();
                }
            }
        }
    }
    total
}

#[tauri::command]
pub(super) async fn get_storage_size(state: State<'_, AppState>) -> Result<StorageSize, AppError> {
    let data_dir = state.data_dir().to_path_buf();
    let db_path = data_dir.join("snipdock.sqlite");
    let images_dir = data_dir.join("images");

    let db_bytes = std::fs::metadata(&db_path)
        .map(|m| m.len())
        .unwrap_or(0);
    let images_bytes = dir_size(&images_dir);
    let total_bytes = db_bytes + images_bytes;

    Ok(StorageSize {
        db_bytes,
        images_bytes,
        total_bytes,
    })
}
