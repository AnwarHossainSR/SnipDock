# Windows Background Autostart Design

## Goal

SnipDock starts automatically when a Windows user signs in, runs clipboard capture in the background without flashing its main window, and remains available from the tray.

## Scope

- Register SnipDock for per-user Windows autostart using the official Tauri autostart plugin.
- Keep autostart permanently enabled; do not expose an on/off setting.
- Pass a private `--hidden` argument only through the autostart registration.
- Start hidden when `--hidden` is present. Start visible for normal launches.
- Preserve tray Show, Hide, and Quit behavior.
- Prevent a hidden second-instance invocation from raising an already-running window.
- Make the persisted `minimize_to_tray` value control runtime minimize behavior immediately and after restart.
- Remove the unused `start_with_os` persistence field because autostart is mandatory. Existing serialized values remain harmless unknown fields during migration.

Broader unrelated bug hunting is a separate follow-up audit. This change includes only lifecycle issues discovered while tracing startup, window, tray, and settings flows.

## Architecture

Initialize `tauri-plugin-autostart` in Rust with `--hidden` as its launch argument. During application setup, check registration state and enable it when absent. Failure to register autostart must fail startup with a clear error because mandatory background launch is a core requirement.

Window visibility is decided from process arguments before normal startup presentation. The configured main window begins hidden to prevent sign-in flash. Setup explicitly shows it only for a normal launch. The single-instance callback examines the second process arguments: normal launches raise the existing window, while `--hidden` launches leave it unchanged.

Runtime window preferences are initialized from stored settings. Saving `minimize_to_tray` also updates the managed preference, keeping persisted and live behavior synchronized.

## Data Flow

1. Normal first launch: initialize plugins and storage, ensure autostart registration, initialize runtime preferences, show and focus main window, emit `app://shown`.
2. Autostart launch: Windows invokes SnipDock with `--hidden`; initialize the same services, leave main window hidden, and keep tray plus clipboard monitor active.
3. Normal second launch: single-instance callback shows and focuses the existing main window.
4. Hidden second launch: single-instance callback performs no visibility change.
5. Settings save: repository validates and persists patch; command layer updates `WindowPreferences` when `minimize_to_tray` changed.

## Error Handling

- Propagate plugin initialization, registration-state, and enable failures through Tauri setup so existing startup failure reporting handles them.
- Keep tray and window operations best-effort because failure to focus or hide one window must not terminate clipboard capture.
- Reject invalid settings through existing repository validation.

## Testing and Verification

- Unit-test launch-mode parsing for normal and `--hidden` argument sets.
- Extend command tests to prove persisted `minimize_to_tray` updates runtime preference state.
- Run `bun test`, `bun run lint`, `bun run build`, and `cargo test --manifest-path src-tauri/Cargo.toml`.
- Build the Windows app and manually verify: autostart registration exists, sign-out/sign-in starts only one hidden process, tray Show works, manual second launch raises the window, minimize follows its setting, and tray Quit exits.

## Success Criteria

- After SnipDock has run once, every later Windows sign-in starts one SnipDock process automatically.
- Sign-in launch has no visible main-window flash.
- Clipboard capture and tray controls work while the window remains hidden.
- Manual launches remain visible and can raise an existing instance.
- Automated verification passes; Windows sign-in behavior has a documented manual check.
