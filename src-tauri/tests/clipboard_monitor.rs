use snipdock_lib::{
    clipboard::{ClipboardMonitor, ClipboardSnapshot, ClipboardSource},
    images::RawImage,
};
use std::{
    sync::{mpsc, Arc, Mutex},
    time::{Duration, Instant},
};

#[derive(Default)]
struct FakeClipboard {
    text: Mutex<Option<String>>,
    image: Mutex<Option<RawImage>>,
}

impl FakeClipboard {
    fn set(&self, text: &str) {
        *self.text.lock().unwrap() = Some(text.to_owned());
    }

    fn set_image(&self, image: RawImage) {
        *self.image.lock().unwrap() = Some(image);
    }
}

impl ClipboardSource for FakeClipboard {
    fn read_text(&self) -> Option<String> {
        self.text.lock().unwrap().clone()
    }

    fn read_image(&self) -> Option<RawImage> {
        self.image.lock().unwrap().clone()
    }
}

fn sample_image() -> RawImage {
    RawImage::new(vec![255, 0, 0, 255, 0, 255, 0, 255], 2, 1)
}

fn monitor(clipboard: Arc<FakeClipboard>) -> (ClipboardMonitor, mpsc::Receiver<ClipboardSnapshot>) {
    let (sender, receiver) = mpsc::channel();
    let monitor = ClipboardMonitor::start(clipboard, Duration::from_millis(5), move |snapshot| {
        sender.send(snapshot).unwrap();
    });
    (monitor, receiver)
}

fn text_of(snapshot: ClipboardSnapshot) -> String {
    match snapshot {
        ClipboardSnapshot::Text(text) => text,
        ClipboardSnapshot::Image(_) => panic!("expected text, got an image"),
    }
}

#[test]
fn emits_only_changed_text_without_trimming_whitespace() {
    let clipboard = Arc::new(FakeClipboard::default());
    clipboard.set("  exact text\r\n");
    let (monitor, receiver) = monitor(clipboard.clone());

    assert_eq!(
        text_of(receiver.recv_timeout(Duration::from_millis(100)).unwrap()),
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
        text_of(receiver.recv_timeout(Duration::from_millis(100)).unwrap()),
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
        text_of(receiver.recv_timeout(Duration::from_millis(100)).unwrap()),
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

#[test]
fn an_image_on_the_clipboard_is_emitted_once() {
    let clipboard = Arc::new(FakeClipboard::default());
    clipboard.set_image(sample_image());
    let (monitor, receiver) = monitor(clipboard.clone());

    assert_eq!(
        receiver.recv_timeout(Duration::from_millis(100)).unwrap(),
        ClipboardSnapshot::Image(sample_image())
    );
    assert!(receiver.recv_timeout(Duration::from_millis(25)).is_err());

    monitor.stop();
}

#[test]
fn an_image_wins_over_the_text_fallback_left_beside_it() {
    let clipboard = Arc::new(FakeClipboard::default());
    // Copying a picture commonly leaves a path or markup on the clipboard too;
    // capturing that instead of the picture is the bug this guards.
    clipboard.set("C:/screenshots/capture.png");
    clipboard.set_image(sample_image());
    let (monitor, receiver) = monitor(clipboard.clone());

    assert_eq!(
        receiver.recv_timeout(Duration::from_millis(100)).unwrap(),
        ClipboardSnapshot::Image(sample_image())
    );

    monitor.stop();
}

#[test]
fn an_empty_image_falls_through_to_text() {
    let clipboard = Arc::new(FakeClipboard::default());
    clipboard.set_image(RawImage::new(Vec::new(), 0, 0));
    clipboard.set("still text");
    let (monitor, receiver) = monitor(clipboard.clone());

    assert_eq!(
        text_of(receiver.recv_timeout(Duration::from_millis(100)).unwrap()),
        "still text"
    );

    monitor.stop();
}

#[test]
fn a_self_written_image_is_suppressed_by_its_stored_path() {
    let clipboard = Arc::new(FakeClipboard::default());
    let (monitor, receiver) = monitor(clipboard.clone());

    // Copying an image item back marks the item's `content`, which is the
    // stored path -- the same signature the monitor derives from the pixels.
    monitor.mark_self_written(snipdock_lib::images::relative_path(&sample_image().hash()));
    clipboard.set_image(sample_image());

    assert!(receiver.recv_timeout(Duration::from_millis(50)).is_err());

    monitor.stop();
}
