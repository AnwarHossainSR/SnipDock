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

#[cfg(test)]
mod tests {
    use super::WindowPreferences;

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
}
