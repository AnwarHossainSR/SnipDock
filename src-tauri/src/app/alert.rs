//! A message box for failures that happen before there is a window to show
//! them in.
//!
//! Startup runs under `windows_subsystem = "windows"` on Windows, so a panic or
//! an `eprintln!` reaches nobody: the process appears to open and vanish. Every
//! path here is best-effort -- the caller is already on its way out, and a
//! failure to show the message must not replace the original error.

/// Shows a blocking, informational message box titled `title`.
#[allow(unused_variables)]
pub fn show(title: &str, message: &str) {
    #[cfg(target_os = "windows")]
    windows::show(title, message);
    #[cfg(target_os = "macos")]
    macos::show(title, message);
    #[cfg(all(unix, not(target_os = "macos")))]
    unix::show(title, message);
}

#[cfg(target_os = "windows")]
mod windows {
    use std::{ffi::OsStr, iter::once, os::windows::ffi::OsStrExt};

    // MB_ICONERROR | MB_SETFOREGROUND, so the box is not lost behind whatever
    // had focus when the app tried to launch. MB_OK is zero.
    const FLAGS: u32 = 0x0000_0010 | 0x0001_0000;

    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(hwnd: isize, text: *const u16, caption: *const u16, kind: u32) -> i32;
    }

    pub(super) fn wide(value: &str) -> Vec<u16> {
        OsStr::new(value).encode_wide().chain(once(0)).collect()
    }

    pub fn show(title: &str, message: &str) {
        let caption = wide(title);
        let text = wide(message);
        // SAFETY: both pointers are null-terminated UTF-16 buffers that outlive
        // the call, and a null owner window is what user32 expects for a
        // process with no window of its own.
        unsafe {
            MessageBoxW(0, text.as_ptr(), caption.as_ptr(), FLAGS);
        }
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use std::process::Command;

    /// AppleScript string literals take backslash and double quote escapes, and
    /// cannot span lines -- a raw newline ends the literal and breaks the
    /// script, which the startup message contains several of.
    pub(super) fn escape(value: &str) -> String {
        value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
    }

    pub fn show(title: &str, message: &str) {
        let script = format!(
            "display dialog \"{}\" with title \"{}\" buttons {{\"OK\"}} with icon stop",
            escape(message),
            escape(title),
        );
        let _ = Command::new("osascript").arg("-e").arg(script).status();
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
mod unix {
    use std::process::Command;

    pub fn show(title: &str, message: &str) {
        // --no-markup: the message is plain text, and zenity would otherwise
        // read it as Pango markup.
        let zenity = Command::new("zenity")
            .arg("--error")
            .arg("--no-markup")
            .arg(format!("--title={title}"))
            .arg(format!("--text={message}"))
            .status();
        // Exiting non-zero means zenity ran but could not put a dialog on
        // screen -- no display, for one -- so kdialog still deserves a turn.
        if zenity.is_ok_and(|status| status.success()) {
            return;
        }
        let _ = Command::new("kdialog")
            .arg("--title")
            .arg(title)
            .arg("--error")
            .arg(message)
            .status();
    }
}

#[cfg(test)]
mod tests {
    #[cfg(target_os = "windows")]
    #[test]
    fn wide_strings_are_null_terminated() {
        assert_eq!(super::windows::wide("hi"), vec![0x68, 0x69, 0x00]);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn applescript_literals_escape_quotes_and_backslashes() {
        assert_eq!(super::macos::escape(r#"a"b\c"#), r#"a\"b\\c"#);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn applescript_literals_escape_newlines() {
        // A raw newline would close the literal mid-script; the startup message
        // is multi-line, so this is the common case rather than an edge one.
        assert_eq!(super::macos::escape("first\n\nsecond"), "first\\n\\nsecond");
    }
}
