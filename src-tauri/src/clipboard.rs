use crate::{
    models::{ContentType, LibraryItem},
    os::ForegroundApp,
    repository::{Repository, RepositoryResult},
};
use regex::Regex;
use std::{
    borrow::Cow,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Condvar, Mutex,
    },
    thread::{self, JoinHandle},
    time::Duration,
};
use tauri::{AppHandle, Runtime};
use tauri_plugin_clipboard_manager::ClipboardExt;

#[derive(Clone, Debug)]
pub struct CaptureSettings {
    pub history_days: u32,
    pub max_items: u32,
    pub ignored_apps: Vec<String>,
    pub ignored_patterns: Vec<String>,
    pub ignored_content_types: Vec<ContentType>,
}

impl Default for CaptureSettings {
    fn default() -> Self {
        Self {
            history_days: 30,
            max_items: 1_000,
            ignored_apps: Vec::new(),
            ignored_patterns: Vec::new(),
            ignored_content_types: Vec::new(),
        }
    }
}

pub struct CapturePolicy {
    settings: CaptureSettings,
    ignored_patterns: Vec<Regex>,
}

impl CapturePolicy {
    pub fn new(mut settings: CaptureSettings) -> Result<Self, regex::Error> {
        settings.history_days = settings.history_days.max(1);
        settings.max_items = settings.max_items.max(1);
        let ignored_patterns = settings
            .ignored_patterns
            .iter()
            .map(|pattern| Regex::new(pattern))
            .collect::<Result<_, _>>()?;
        Ok(Self {
            settings,
            ignored_patterns,
        })
    }

    fn ignore_reason(
        &self,
        text: &str,
        source_app: Option<&str>,
        content_type: &ContentType,
    ) -> Option<CaptureIgnoreReason> {
        if text.trim().is_empty() {
            return Some(CaptureIgnoreReason::Empty);
        }
        if source_app.is_some_and(|source| {
            self.settings
                .ignored_apps
                .iter()
                .any(|ignored| ignored.eq_ignore_ascii_case(source))
        }) {
            return Some(CaptureIgnoreReason::Application);
        }
        if self
            .ignored_patterns
            .iter()
            .any(|pattern| pattern.is_match(text))
        {
            return Some(CaptureIgnoreReason::Pattern);
        }
        if self.settings.ignored_content_types.contains(content_type) {
            return Some(CaptureIgnoreReason::ContentType);
        }
        None
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CaptureIgnoreReason {
    Empty,
    Duplicate,
    Application,
    Pattern,
    ContentType,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CaptureOutcome {
    Stored(LibraryItem),
    Ignored(CaptureIgnoreReason),
}

pub struct ClipboardCapture<A> {
    repository: Repository,
    foreground_app: A,
    policy: CapturePolicy,
}

impl<A: ForegroundApp> ClipboardCapture<A> {
    pub fn new(repository: Repository, foreground_app: A, policy: CapturePolicy) -> Self {
        Self {
            repository,
            foreground_app,
            policy,
        }
    }

    pub async fn capture(
        &self,
        text: String,
        content_type: ContentType,
    ) -> RepositoryResult<CaptureOutcome> {
        // Callers pass PlainText for raw clipboard text; upgrade it to the
        // detected type (and language, for code) while keeping the raw
        // content untouched. An explicit non-plain type is respected as-is.
        let (content_type, language) = if content_type == ContentType::PlainText {
            crate::detection::detect(&text)
        } else {
            (content_type, None)
        };

        let source_app = self.foreground_app.executable_name();
        if let Some(reason) =
            self.policy
                .ignore_reason(&text, source_app.as_deref(), &content_type)
        {
            return Ok(CaptureOutcome::Ignored(reason));
        }

        if let Some(previous) = self.repository.latest_clipboard_content().await? {
            if normalize_line_endings(&previous) == normalize_line_endings(&text) {
                return Ok(CaptureOutcome::Ignored(CaptureIgnoreReason::Duplicate));
            }
        }

        let item = self
            .repository
            .save_clipboard_item(text, content_type)
            .await?;
        let item = if let Some(language) = language {
            self.repository.set_item_language(&item.id, &language).await?
        } else {
            item
        };
        self.repository
            .prune_clipboard_history(
                self.policy.settings.max_items,
                self.policy.settings.history_days,
            )
            .await?;
        Ok(CaptureOutcome::Stored(item))
    }
}

fn normalize_line_endings(text: &str) -> Cow<'_, str> {
    if text.contains('\r') {
        Cow::Owned(text.replace("\r\n", "\n").replace('\r', "\n"))
    } else {
        Cow::Borrowed(text)
    }
}

pub trait TextClipboard: Send + Sync + 'static {
    fn read_text(&self) -> Option<String>;
}

pub struct SystemClipboard<R: Runtime>(AppHandle<R>);

impl<R: Runtime> SystemClipboard<R> {
    pub fn new(app: AppHandle<R>) -> Self {
        Self(app)
    }
}

impl<R: Runtime> TextClipboard for SystemClipboard<R> {
    fn read_text(&self) -> Option<String> {
        self.0.clipboard().read_text().ok()
    }
}

struct Control {
    stopped: AtomicBool,
    paused: AtomicBool,
    suppressed: Mutex<Option<String>>,
    wake_lock: Mutex<()>,
    wake: Condvar,
}

impl Control {
    fn set_paused(&self, paused: bool) {
        let _guard = self.wake_lock.lock().unwrap_or_else(|error| error.into_inner());
        self.paused.store(paused, Ordering::Release);
        self.wake.notify_all();
    }

    fn stop(&self) {
        let _guard = self.wake_lock.lock().unwrap_or_else(|error| error.into_inner());
        self.stopped.store(true, Ordering::Release);
        self.wake.notify_all();
    }
}

pub struct ClipboardMonitor {
    control: Arc<Control>,
    worker: Option<JoinHandle<()>>,
}

impl ClipboardMonitor {
    pub fn start<C, F>(clipboard: Arc<C>, interval: Duration, mut emit: F) -> Self
    where
        C: TextClipboard,
        F: FnMut(String) + Send + 'static,
    {
        let interval = interval.max(Duration::from_millis(1));
        let control = Arc::new(Control {
            stopped: AtomicBool::new(false),
            paused: AtomicBool::new(false),
            suppressed: Mutex::new(None),
            wake_lock: Mutex::new(()),
            wake: Condvar::new(),
        });
        let worker_control = control.clone();
        let worker = thread::spawn(move || {
            let mut last_seen = None;

            loop {
                if worker_control.stopped.load(Ordering::Acquire) {
                    break;
                }

                let was_paused = worker_control.paused.load(Ordering::Acquire);
                if !was_paused {
                    if let Some(text) = clipboard.read_text() {
                        if worker_control.stopped.load(Ordering::Acquire)
                            || worker_control.paused.load(Ordering::Acquire)
                        {
                            continue;
                        }
                        if last_seen.as_deref() != Some(text.as_str()) {
                            last_seen = Some(text.clone());
                            let suppressed = worker_control
                                .suppressed
                                .lock()
                                .unwrap_or_else(|error| error.into_inner())
                                .take();
                            if suppressed.as_deref() != Some(text.as_str()) {
                                emit(text);
                            }
                        }
                    }
                }

                let guard = worker_control
                    .wake_lock
                    .lock()
                    .unwrap_or_else(|error| error.into_inner());
                if worker_control.stopped.load(Ordering::Acquire) {
                    break;
                }
                if was_paused && !worker_control.paused.load(Ordering::Acquire) {
                    continue;
                }
                drop(worker_control.wake.wait_timeout(guard, interval));
            }
        });

        Self {
            control,
            worker: Some(worker),
        }
    }

    pub fn pause(&self) {
        self.control.set_paused(true);
    }

    pub fn resume(&self) {
        self.control.set_paused(false);
    }

    pub fn is_paused(&self) -> bool {
        self.control.paused.load(Ordering::Acquire)
    }

    pub fn mark_self_written(&self, text: impl Into<String>) {
        *self
            .control
            .suppressed
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = Some(text.into());
    }

    pub fn clear_self_written(&self) {
        self.control
            .suppressed
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .take();
    }

    pub fn stop(mut self) {
        self.shutdown();
    }

    fn shutdown(&mut self) {
        let Some(worker) = self.worker.take() else {
            return;
        };
        self.control.stop();
        let _ = worker.join();
    }
}

impl Drop for ClipboardMonitor {
    fn drop(&mut self) {
        self.shutdown();
    }
}
