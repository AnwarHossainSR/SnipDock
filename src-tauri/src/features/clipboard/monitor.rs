use crate::images::RawImage;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Condvar, Mutex,
    },
    thread::{self, JoinHandle},
    time::Duration,
};
use tauri::{AppHandle, Runtime};
use tauri_plugin_clipboard_manager::ClipboardExt;

/// What a single poll found on the clipboard.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ClipboardSnapshot {
    Text(String),
    Image(RawImage),
}

impl ClipboardSnapshot {
    /// Stable identity used for change detection and for matching writes the
    /// app made itself. For images this is the path the capture pipeline will
    /// store, so `mark_self_written(item.content)` works for both variants
    /// without the caller having to know which it is holding.
    pub fn signature(&self) -> String {
        match self {
            Self::Text(text) => text.clone(),
            Self::Image(image) => crate::images::relative_path(&image.hash()),
        }
    }
}

pub trait ClipboardSource: Send + Sync + 'static {
    fn read_text(&self) -> Option<String>;

    /// Defaults to "no image" so text-only fakes in tests stay one method.
    fn read_image(&self) -> Option<RawImage> {
        None
    }
}

pub struct SystemClipboard<R: Runtime>(AppHandle<R>);

impl<R: Runtime> SystemClipboard<R> {
    pub fn new(app: AppHandle<R>) -> Self {
        Self(app)
    }
}

impl<R: Runtime> ClipboardSource for SystemClipboard<R> {
    fn read_text(&self) -> Option<String> {
        self.0.clipboard().read_text().ok()
    }

    fn read_image(&self) -> Option<RawImage> {
        let image = self.0.clipboard().read_image().ok()?;
        Some(RawImage::new(
            image.rgba().to_vec(),
            image.width(),
            image.height(),
        ))
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
        C: ClipboardSource,
        F: FnMut(ClipboardSnapshot) + Send + 'static,
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
            let mut last_seen: Option<String> = None;

            loop {
                if worker_control.stopped.load(Ordering::Acquire) {
                    break;
                }

                let was_paused = worker_control.paused.load(Ordering::Acquire);
                if !was_paused {
                    // Images are checked first: copying a picture often leaves a
                    // text fallback (a file path, a URL, marked-up HTML) on the
                    // clipboard too, and the picture is what the user meant.
                    let snapshot = clipboard
                        .read_image()
                        .filter(|image| !image.is_empty())
                        .map(ClipboardSnapshot::Image)
                        .or_else(|| clipboard.read_text().map(ClipboardSnapshot::Text));

                    if let Some(snapshot) = snapshot {
                        if worker_control.stopped.load(Ordering::Acquire)
                            || worker_control.paused.load(Ordering::Acquire)
                        {
                            continue;
                        }
                        let signature = snapshot.signature();
                        if last_seen.as_deref() != Some(signature.as_str()) {
                            last_seen = Some(signature.clone());
                            let suppressed = worker_control
                                .suppressed
                                .lock()
                                .unwrap_or_else(|error| error.into_inner())
                                .take();
                            if suppressed.as_deref() != Some(signature.as_str()) {
                                emit(snapshot);
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

    /// Records a clipboard write the app performed itself so the next poll does
    /// not re-capture it. Takes the same value stored in `items.content`: the
    /// text for text items, the relative PNG path for images.
    pub fn mark_self_written(&self, signature: impl Into<String>) {
        *self
            .control
            .suppressed
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = Some(signature.into());
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
