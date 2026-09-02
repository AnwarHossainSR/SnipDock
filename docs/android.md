# Android

SnipDock's Android build is a **companion** to the desktop app, not a port of it.
Android 10 (API 29) removed background clipboard access — `ClipboardManager.getPrimaryClip()`
returns `null` for an app without input focus, and no permission grants it back — so the
phone app shows the desktop's synced history and saves what the user explicitly shares to it.

See `openspec/changes/2026-09-02-android-companion-app/` for the full proposal and design.

## Toolchain

| Component | Version |
| --- | --- |
| Android NDK | _not yet recorded — fill in when the NDK is installed (task 1.1)_ |
| Rust targets | `aarch64-linux-android`, `armv7-linux-androideabi` |
| Minimum SDK | _undecided (task 8.2)_ |

Setup, once the NDK is installed:

```sh
rustup target add aarch64-linux-android armv7-linux-androideabi
# NDK_HOME must point at the NDK root; ANDROID_HOME at the SDK root.
bun tauri android init
bun tauri android build
```

## What is compiled out on Android

`src-tauri/Cargo.toml` keeps the desktop-only crates in a target table
(`cfg(any(target_os = "macos", windows, target_os = "linux"))`), so an Android build of
`snipdock_lib` never pulls them in:

| Crate / feature | What it feeds |
| --- | --- |
| `tauri`'s `tray-icon` feature | the system tray (`src/app/tray.rs`) |
| `tauri-plugin-global-shortcut` | the OS-wide Quick Paste accelerator (`src/platform/shortcuts.rs`) |
| `tauri-plugin-single-instance` | redirecting a second launch to the running window |
| `tauri-plugin-window-state` | saved window geometry |
| `tiny_http` | the localhost CLI endpoint (`src/cli/`) |
| `sysinfo` | the resource-usage readout (`src/commands/resource_usage.rs`) |
| `tauri-plugin-autostart`, `tauri-plugin-updater` | launch at login, the in-app updater |

The code each one feeds sits behind `#[cfg(desktop)]`, and `commands::register` builds its
invoke handler from two lists so Android registers no command it cannot answer.

## Test suites

The Rust suite runs on the desktop host and covers everything Android shares — storage,
migrations, crypto, detection, formatting, and the sync engine — because none of it is
target-specific. What the host suite **cannot** cover, and which needs a device or emulator:

- **`src/cli/server.rs`** — the CLI endpoint is not compiled for Android at all, so its tests
  are desktop-only by construction.
- **`src/platform/native.rs`** foreground-app lookup and direct paste — Windows-only today;
  Android takes the no-op fallback and has no capability to test.
- **The clipboard bridge** — copy-out, the `ACTION_SEND` share target, and the Quick Settings
  tile are Kotlin surfaces reached through a local Tauri plugin. They need instrumented
  tests on a device (task 10.9).
- **Storage privacy** — that the database and images land in private app storage and are
  excluded from Android cloud backup can only be confirmed on a device (task 8.4).
