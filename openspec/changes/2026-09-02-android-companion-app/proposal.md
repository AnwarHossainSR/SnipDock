## Why

SnipDock's history is stranded on one machine. The thing people copy on a laptop is often the thing they need on a phone — a link, an address, a one-time code, a snippet — and today there is no path between them.

An Android port cannot be a port. Android 10 (API 29) removed background clipboard access: `ClipboardManager.getPrimaryClip()` returns `null` unless the app holds input focus or is the active IME, and no permission grants it back. The desktop premise — a background monitor recording every copy — is not implementable on the platform through supported APIs, and the two ways around it are a custom keyboard (a native IME, out of scope here) or an accessibility service (which Play policy reserves for accessibility tools and removes clipboard managers for using).

So the phone app is a **companion**: the desktop's history, synced, searchable, and one tap from the clipboard, plus an explicit "share to SnipDock" path for saving from the phone. That makes cross-device sync a prerequisite rather than a feature — an Android build with nothing to show is not worth shipping — and sync is already half-written: `src-tauri/src/storage/sync.rs` maintains an encrypted staging outbox, tombstones, and a conflict log against the `sync_records` / `sync_conflicts` tables from `migrations/0003_sync.sql`, and no command exposes any of it.

## What Changes

- **Cross-device sync.** Finish the staging engine into a working loop: a transport, a pairing step, push and pull, conflict resolution, and a Settings panel to turn it on. The transport is a bucket the user already owns — the same S3/R2 credentials the backup panel stores — so no SnipDock server exists and nothing is hosted on the user's behalf. Payloads stay sealed on the device; private items are refused at the boundary, as they are today.
- **An Android build of the Rust core.** The desktop-only dependencies (`tauri-plugin-global-shortcut`, `tauri-plugin-single-instance`, `tauri-plugin-window-state`, the `tray-icon` feature, `tiny_http`, `sysinfo`) move behind `cfg(desktop)` so `snipdock_lib` compiles for `aarch64-linux-android`. Storage, crypto, detection, and formatting cross-compile unchanged.
- **An Android application shell.** One activity, one webview, a mobile navigation model, and a layout built for a phone rather than a rescaled desktop screen. The two-window Quick Paste overlay has no Android equivalent and is not carried over.
- **A clipboard bridge within what Android allows.** Tap an item to put it on the clipboard; receive text and images through the system share sheet; a Quick Settings tile for the most recent item. Automatic background capture is documented as impossible and is not attempted.
- **BREAKING** for nothing shipped: no desktop behavior changes. Every desktop capability keeps its current requirements; the mobile build simply has fewer of them, and the spec says which.

## Capabilities

### New Capabilities

- `device-sync`: Encrypted cross-device synchronisation over a user-owned bucket — device identity and pairing, the push/pull loop over the existing staging tables, conflict detection and resolution, private-item exclusion, and the settings that control it.
- `android-app-shell`: The Android application itself — which platforms the product supports and which capabilities exist on each, the single-activity navigation model, the phone layout for history and search, offline and background behaviour, and where data lives on the device.
- `android-clipboard-bridge`: What the phone can do with the clipboard, and what it explicitly cannot — copy an item out, receive content through the share sheet, the Quick Settings tile, and the stated non-goal of background capture.

### Modified Capabilities

None. Desktop requirements are unchanged; `android-app-shell` states the per-platform capability matrix rather than amending each desktop spec.

## Impact

- **Rust**: `src-tauri/Cargo.toml` (target-gated dependencies), `src-tauri/src/app/mod.rs` and `commands/mod.rs` (desktop-only setup behind `cfg(desktop)`), `src-tauri/src/storage/sync.rs` (gains commands and a transport), `src-tauri/src/features/cloud.rs` (reused as the sync transport), new `src-tauri/src/features/sync/` for the loop and conflict policy.
- **Tauri**: `tauri.conf.json` gains a mobile section; `src-tauri/gen/android/` is generated; a Kotlin plugin handles the share intent and the Quick Settings tile.
- **Frontend**: a mobile route tree beside the desktop one, reusing `src/api/` and `src/stores/`; the desktop layout in `src/features/clipboard/` is untouched.
- **Schema**: no new migration for sync — `0003_sync.sql` already defines both tables. A device registry may need one.
- **CI/release**: an Android build job, NDK setup, and a signed AAB in the release workflow; Play Store listing, privacy declaration, and the data-safety form.
- **Docs**: `README.md` platform table, `docs/privacy.md` (what leaves the device when sync is on), and a new `docs/android.md`.
