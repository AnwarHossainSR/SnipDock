use crate::{clipboard::ClipboardMonitor, repository::Repository};

pub struct AppState {
    repository: Repository,
    clipboard_monitor: ClipboardMonitor,
}

impl AppState {
    pub fn new(repository: Repository, clipboard_monitor: ClipboardMonitor) -> Self {
        Self {
            repository,
            clipboard_monitor,
        }
    }

    pub fn repository(&self) -> &Repository {
        &self.repository
    }

    pub fn clipboard_monitor(&self) -> &ClipboardMonitor {
        &self.clipboard_monitor
    }
}
