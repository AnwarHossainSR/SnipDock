use crate::{clipboard::ClipboardMonitor, repository::Repository, storage::{analytics::AnalyticsRepository, auto_clear::AutoClearRepository, duplicates::DuplicateRepository, smart_folders::SmartFolderRepository}};
use std::path::{Path, PathBuf};

pub struct AppState {
    repository: Repository,
    smart_folder_repository: SmartFolderRepository,
    analytics_repository: AnalyticsRepository,
    duplicate_repository: DuplicateRepository,
    auto_clear_repository: AutoClearRepository,
    clipboard_monitor: ClipboardMonitor,
    data_dir: PathBuf,
}

impl AppState {
    pub fn new(
        repository: Repository,
        smart_folder_repository: SmartFolderRepository,
        analytics_repository: AnalyticsRepository,
        duplicate_repository: DuplicateRepository,
        auto_clear_repository: AutoClearRepository,
        clipboard_monitor: ClipboardMonitor,
        data_dir: PathBuf,
    ) -> Self {
        Self {
            repository,
            smart_folder_repository,
            analytics_repository,
            duplicate_repository,
            auto_clear_repository,
            clipboard_monitor,
            data_dir,
        }
    }

    pub fn repository(&self) -> &Repository {
        &self.repository
    }

    pub fn smart_folder_repository(&self) -> &SmartFolderRepository {
        &self.smart_folder_repository
    }

    pub fn analytics_repository(&self) -> &AnalyticsRepository {
        &self.analytics_repository
    }

    pub fn duplicate_repository(&self) -> &DuplicateRepository {
        &self.duplicate_repository
    }

    pub fn auto_clear_repository(&self) -> &AutoClearRepository {
        &self.auto_clear_repository
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
