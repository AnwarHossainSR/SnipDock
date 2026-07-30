use crate::{clipboard::ClipboardMonitor, repository::Repository};
use std::path::{Path, PathBuf};

pub struct AppState {
    repository: Repository,
    clipboard_monitor: ClipboardMonitor,
    data_dir: PathBuf,
}

impl AppState {
    pub fn new(
        repository: Repository,
        clipboard_monitor: ClipboardMonitor,
        data_dir: PathBuf,
    ) -> Self {
        Self {
            repository,
            clipboard_monitor,
            data_dir,
        }
    }

    pub fn repository(&self) -> &Repository {
        &self.repository
    }

    pub fn clipboard_monitor(&self) -> &ClipboardMonitor {
        &self.clipboard_monitor
    }

    /// App data directory, needed to resolve the image files that clipboard
    /// image items point at.
    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }
}
