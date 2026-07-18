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
