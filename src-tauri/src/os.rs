pub trait ForegroundApp: Send + Sync {
    fn executable_name(&self) -> Option<String>;
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
