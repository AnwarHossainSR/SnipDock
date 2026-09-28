use super::{Repository, RepositoryResult};
use crate::images;
use std::{collections::HashSet, path::Path};

/// What counts against the storage limit. Both halves measure what the history
/// still holds rather than what the files occupy: SQLite keeps freed pages in
/// the file until a VACUUM, and a deleted image's file waits for the orphan
/// sweep, so file sizes never came down after a delete and a full store could
/// not be emptied from inside the app.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct StorageUsage {
    pub db_bytes: u64,
    pub images_bytes: u64,
}

impl StorageUsage {
    pub fn total_bytes(&self) -> u64 {
        self.db_bytes + self.images_bytes
    }
}

impl Repository {
    pub async fn storage_usage(&self, data_dir: &Path) -> RepositoryResult<StorageUsage> {
        let db_bytes: i64 = sqlx::query_scalar(
            "SELECT (page_count - freelist_count) * page_size \
             FROM pragma_page_count(), pragma_freelist_count(), pragma_page_size()",
        )
        .fetch_one(&self.pool)
        .await?;
        // A set: the same image captured twice is two rows and one file.
        let paths: HashSet<String> = self
            .image_paths()
            .await?
            .into_iter()
            .map(|(_, relative, _)| relative)
            .collect();
        let images_bytes = paths
            .iter()
            .map(|relative| images::stored_bytes(data_dir, relative))
            .sum();
        Ok(StorageUsage {
            db_bytes: u64::try_from(db_bytes).unwrap_or(0),
            images_bytes,
        })
    }
}
