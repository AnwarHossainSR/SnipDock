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

    /// A value that changes whenever the clipboard changes, obtained without
    /// reading the clipboard itself. When two consecutive polls return the
    /// same `Some`, the monitor skips the reads entirely.
    ///
    /// Defaults to `None` -- "cannot tell, read to find out" -- which is both
    /// the behavior every fake in the test suite wants and the honest answer
    /// on the platforms whose counter is not wired up yet.
    fn change_token(&self) -> Option<u64> {
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

    fn change_token(&self) -> Option<u64> {
        crate::os::clipboard_change_token()
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

impl Clone for ClipboardMonitor {
    fn clone(&self) -> Self {
        // A cloned monitor shares the same `control` channel, so pausing and
        // resuming either copy affects both. The worker handle stays with the
        // instance returned by `start`, and dropping that instance while a
        // clone is still alive leaves the worker running - see `Drop`. Only
        // `stop`, or dropping the last handle, ends it.
        Self { control: Arc::clone(&self.control), worker: None }
    }
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
            // Pixels of the image seen on the previous poll. Comparing against
            // this is what keeps an image resting on the clipboard cheap: a
            // memcmp per tick instead of hashing megabytes of RGBA every time.
            let mut last_image: Option<RawImage> = None;
            // The OS change counter as of the last poll that actually read.
            // Cheaper still than the memcmp above, because a tick that matches
            // it never touches the clipboard at all.
            let mut last_token: Option<u64> = None;

            loop {
                if worker_control.stopped.load(Ordering::Acquire) {
                    break;
                }

                let was_paused = worker_control.paused.load(Ordering::Acquire);
                // Two `Some`s that agree are the only proof that nothing
                // changed. A `None` from either side means the platform cannot
                // say, and the loop reads as it always has.
                let token = clipboard.change_token();
                let unchanged = matches!((token, last_token), (Some(now), Some(before)) if now == before);

                if !was_paused && !unchanged {
                    // Images are checked first: copying a picture often leaves a
                    // text fallback (a file path, a URL, marked-up HTML) on the
                    // clipboard too, and the picture is what the user meant.
                    let snapshot = match clipboard.read_image().filter(|image| !image.is_empty()) {
                        Some(image) if last_image.as_ref() == Some(&image) => None,
                        Some(image) => {
                            last_image = Some(image.clone());
                            Some(ClipboardSnapshot::Image(image))
                        }
                        None => {
                            last_image = None;
                            clipboard.read_text().map(ClipboardSnapshot::Text)
                        }
                    };

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

                    // Last, and deliberately not before the read: the `continue`
                    // above abandons a poll that was paused midway through, and
                    // recording the token there would make the next tick treat
                    // the value it never delivered as already handled.
                    last_token = token;
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
