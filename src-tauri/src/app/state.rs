use crate::{clipboard::ClipboardMonitor, repository::Repository, storage::{analytics::AnalyticsRepository, auto_clear::AutoClearRepository, duplicates::DuplicateRepository, smart_folders::SmartFolderRepository}};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

pub struct AppState {
    repository: Repository,
    smart_folder_repository: SmartFolderRepository,
    analytics_repository: AnalyticsRepository,
    duplicate_repository: DuplicateRepository,
    auto_clear_repository: AutoClearRepository,
    clipboard_monitor: ClipboardMonitor,
    data_dir: PathBuf,
    startup_sweep_done: std::sync::Arc<AtomicBool>,
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
            startup_sweep_done: std::sync::Arc::new(AtomicBool::new(false)),
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

    /// Shared gate that is set once the startup retention cleanup and orphan
    /// sweep finish. `save_settings` can check this before calling
    /// `ClipboardMonitor::resume()` so a capture cannot land between the sweep
    /// reading referenced paths and the deletions happening.
    pub fn startup_sweep_gate(&self) -> std::sync::Arc<AtomicBool> {
        std::sync::Arc::clone(&self.startup_sweep_done)
    }

    /// Mark the startup sweep as complete so later settings saves are free
    /// to resume the monitor from the current tracking preference.
    pub fn mark_startup_sweep_done(&self) {
        self.startup_sweep_done.store(true, Ordering::SeqCst);
    }

    /// App data directory, needed to resolve the image files that clipboard
    /// image items point at.
    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }
}
