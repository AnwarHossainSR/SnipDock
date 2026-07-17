use snipdock_lib::clipboard::{ClipboardMonitor, TextClipboard};
use std::{
    sync::{mpsc, Arc, Mutex},
    time::{Duration, Instant},
};

#[derive(Default)]
struct FakeClipboard {
    text: Mutex<Option<String>>,
}

impl FakeClipboard {
    fn set(&self, text: &str) {
        *self.text.lock().unwrap() = Some(text.to_owned());
    }
}

impl TextClipboard for FakeClipboard {
    fn read_text(&self) -> Option<String> {
        self.text.lock().unwrap().clone()
    }
}

fn monitor(clipboard: Arc<FakeClipboard>) -> (ClipboardMonitor, mpsc::Receiver<String>) {
    let (sender, receiver) = mpsc::channel();
    let monitor = ClipboardMonitor::start(clipboard, Duration::from_millis(5), move |text| {
        sender.send(text).unwrap();
    });
    (monitor, receiver)
}

#[test]
fn emits_only_changed_text_without_trimming_whitespace() {
    let clipboard = Arc::new(FakeClipboard::default());
    clipboard.set("  exact text\r\n");
    let (monitor, receiver) = monitor(clipboard.clone());

    assert_eq!(
        receiver.recv_timeout(Duration::from_millis(100)).unwrap(),
        "  exact text\r\n"
    );
    clipboard.set("  exact text\r\n");
    assert!(receiver.recv_timeout(Duration::from_millis(25)).is_err());

    monitor.stop();
}

#[test]
fn suppresses_self_written_value_but_emits_next_external_change() {
    let clipboard = Arc::new(FakeClipboard::default());
    let (monitor, receiver) = monitor(clipboard.clone());

    monitor.mark_self_written("written by SnipDock");
    clipboard.set("written by SnipDock");
    std::thread::sleep(Duration::from_millis(20));
    clipboard.set("written elsewhere");

    assert_eq!(
        receiver.recv_timeout(Duration::from_millis(100)).unwrap(),
        "written elsewhere"
    );
    assert!(receiver.recv_timeout(Duration::from_millis(20)).is_err());

    monitor.stop();
}

#[test]
fn pause_and_resume_control_polling() {
    let clipboard = Arc::new(FakeClipboard::default());
    let (monitor, receiver) = monitor(clipboard.clone());

    monitor.pause();
    clipboard.set("while paused");
    assert!(receiver.recv_timeout(Duration::from_millis(25)).is_err());

    monitor.resume();
    assert_eq!(
        receiver.recv_timeout(Duration::from_millis(100)).unwrap(),
        "while paused"
    );

    monitor.stop();
}

#[test]
fn stop_wakes_a_monitor_waiting_on_a_long_interval() {
    let clipboard = Arc::new(FakeClipboard::default());
    let monitor = ClipboardMonitor::start(clipboard, Duration::from_secs(60), |_| {});
    let started = Instant::now();

    monitor.stop();

    assert!(started.elapsed() < Duration::from_millis(250));
}
