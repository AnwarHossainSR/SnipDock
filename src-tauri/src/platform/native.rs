use std::sync::atomic::{AtomicBool, Ordering};

pub trait ForegroundApp: Send + Sync {
    fn executable_name(&self) -> Option<String>;
}

/// Runtime-toggleable window behavior preferences, defaulting to a
/// clipboard-manager-style "keep running in the tray" experience.
/// A later settings feature can flip these via `AppHandle::state`.
#[derive(Debug)]
pub struct WindowPreferences {
    close_to_tray: AtomicBool,
    minimize_to_tray: AtomicBool,
}

impl WindowPreferences {
    pub fn new(close_to_tray: bool, minimize_to_tray: bool) -> Self {
        Self {
            close_to_tray: AtomicBool::new(close_to_tray),
            minimize_to_tray: AtomicBool::new(minimize_to_tray),
        }
    }

    pub fn close_to_tray(&self) -> bool {
        self.close_to_tray.load(Ordering::Relaxed)
    }

    pub fn minimize_to_tray(&self) -> bool {
        self.minimize_to_tray.load(Ordering::Relaxed)
    }

    pub fn set_close_to_tray(&self, enabled: bool) {
        self.close_to_tray.store(enabled, Ordering::Relaxed);
    }

    pub fn set_minimize_to_tray(&self, enabled: bool) {
        self.minimize_to_tray.store(enabled, Ordering::Relaxed);
    }
}

impl Default for WindowPreferences {
    fn default() -> Self {
        Self::new(true, true)
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct SystemForegroundApp;

impl ForegroundApp for SystemForegroundApp {
    fn executable_name(&self) -> Option<String> {
        foreground_executable_name()
    }
}

#[cfg(target_os = "windows")]
fn foreground_executable_name() -> Option<String> {
    use std::{ffi::OsString, os::windows::ffi::OsStringExt, path::PathBuf};
    use windows_sys::Win32::{
        Foundation::CloseHandle,
        System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
        },
        UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId},
    };

    unsafe {
        let window = GetForegroundWindow();
        if window.is_null() {
            return None;
        }
        let mut process_id = 0;
        GetWindowThreadProcessId(window, &mut process_id);
        if process_id == 0 {
            return None;
        }

        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id);
        if process.is_null() {
            return None;
        }
        let mut buffer = vec![0_u16; 32_768];
        let mut length = buffer.len() as u32;
        let found = QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut length) != 0;
        let _ = CloseHandle(process);
        if !found {
            return None;
        }

        let path = PathBuf::from(OsString::from_wide(&buffer[..length as usize]));
        path.file_name()
            .map(|name| name.to_string_lossy().into_owned())
    }
}

#[cfg(not(target_os = "windows"))]
fn foreground_executable_name() -> Option<String> {
    None
}

/// A number that changes whenever anything writes to the system clipboard,
/// read without transferring the clipboard's contents.
///
/// This is what keeps an idle SnipDock idle. The poll loop otherwise has to
/// drain the clipboard to find out whether it changed, and draining it means
/// copying the payload out of the OS every tick -- for a screenshot resting on
/// the clipboard that is tens of megabytes of allocation and comparison twice
/// a second, forever, for a clipboard nobody touched.
///
/// `None` means "this platform cannot tell you", and callers must fall back to
/// reading. Only Windows is wired up today; macOS would read
/// `NSPasteboard.changeCount` and Wayland the data-offer serial, but neither
/// binding is a dependency here yet, so both keep the old read-every-tick
/// behavior rather than a broken guess.
pub fn clipboard_change_token() -> Option<u64> {
    clipboard_sequence_number()
}

#[cfg(target_os = "windows")]
fn clipboard_sequence_number() -> Option<u64> {
    use windows_sys::Win32::System::DataExchange::GetClipboardSequenceNumber;

    // Safe to call from any thread: it takes no arguments, opens nothing, and
    // does not contend for the clipboard lock the way `OpenClipboard` does.
    // Zero is the documented failure value -- the calling station has no
    // access to the clipboard -- and is reported as "cannot tell" so the
    // caller reads instead of treating an unreadable clipboard as unchanged.
    let sequence = unsafe { GetClipboardSequenceNumber() };
    (sequence != 0).then_some(u64::from(sequence))
}

#[cfg(not(target_os = "windows"))]
fn clipboard_sequence_number() -> Option<u64> {
    None
}

/// Remembers the OS window that was focused just before a SnipDock global
/// shortcut brought its own window forward, so a later direct-paste can
/// restore focus there before injecting the paste keystroke.
#[derive(Default)]
pub struct ForegroundWindowTracker {
    last_external: std::sync::Mutex<Option<u64>>,
}

impl ForegroundWindowTracker {
    pub fn record(&self, handle: Option<u64>) {
        if let Some(handle) = handle {
            let mut guard = self
                .last_external
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            *guard = Some(handle);
        }
    }

    pub fn take(&self) -> Option<u64> {
        self.last_external
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .take()
    }
}

pub trait DirectPaste: Send + Sync {
    /// Restores focus to `handle` and sends a paste (Ctrl+V) keystroke.
    /// Returns `true` if the keystroke was sent.
    fn restore_and_paste(&self, handle: u64) -> bool;
}

#[derive(Clone, Copy, Debug, Default)]
pub struct SystemDirectPaste;

impl DirectPaste for SystemDirectPaste {
    fn restore_and_paste(&self, handle: u64) -> bool {
        restore_and_send_paste(handle)
    }
}

pub fn current_foreground_window() -> Option<u64> {
    foreground_window_handle()
}

#[cfg(target_os = "windows")]
fn foreground_window_handle() -> Option<u64> {
    use windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    unsafe {
        let window = GetForegroundWindow();
        if window.is_null() {
            None
        } else {
            Some(window as u64)
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn foreground_window_handle() -> Option<u64> {
    None
}

#[cfg(target_os = "windows")]
fn restore_and_send_paste(handle: u64) -> bool {
    use windows_sys::Win32::{
        Foundation::HWND,
        UI::{
            Input::KeyboardAndMouse::{
                SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_CONTROL,
                VK_V,
            },
            WindowsAndMessaging::SetForegroundWindow,
        },
    };

    unsafe {
        if SetForegroundWindow(handle as HWND) == 0 {
            return false;
        }

        fn key_input(key: u16, key_up: bool) -> INPUT {
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: key,
                        wScan: 0,
                        dwFlags: if key_up { KEYEVENTF_KEYUP } else { 0 },
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            }
        }

        let inputs = [
            key_input(VK_CONTROL, false),
            key_input(VK_V, false),
            key_input(VK_V, true),
            key_input(VK_CONTROL, true),
        ];
        let sent = SendInput(
            inputs.len() as u32,
            inputs.as_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        );
        sent as usize == inputs.len()
    }
}

#[cfg(not(target_os = "windows"))]
fn restore_and_send_paste(_handle: u64) -> bool {
    false
}

/// A name for this machine, used as the default device name in a sync group.
///
/// Read from the environment rather than through a system call: the value is
/// only ever a starting suggestion the user can edit in Settings, and every
/// platform SnipDock targets sets one of these two variables.
pub fn host_name() -> String {
    for variable in ["COMPUTERNAME", "HOSTNAME"] {
        if let Ok(value) = std::env::var(variable) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }
    "SnipDock device".to_string()
}

#[cfg(test)]
mod tests {
    use super::{host_name, ForegroundWindowTracker, WindowPreferences};

    #[test]
    fn defaults_to_tray_friendly_behavior_and_can_be_toggled() {
        let preferences = WindowPreferences::default();
        assert!(preferences.close_to_tray());
        assert!(preferences.minimize_to_tray());

        preferences.set_close_to_tray(false);
        preferences.set_minimize_to_tray(false);
        assert!(!preferences.close_to_tray());
        assert!(!preferences.minimize_to_tray());
    }

    #[test]
    fn foreground_window_tracker_records_and_takes_once() {
        let tracker = ForegroundWindowTracker::default();
        assert_eq!(tracker.take(), None);

        tracker.record(None);
        assert_eq!(tracker.take(), None);

        tracker.record(Some(42));
        assert_eq!(tracker.take(), Some(42));
        assert_eq!(tracker.take(), None);
    }

    #[test]
    fn a_host_name_is_always_produced() {
        assert!(!host_name().is_empty());
        assert_eq!(host_name().trim(), host_name());
    }
}
