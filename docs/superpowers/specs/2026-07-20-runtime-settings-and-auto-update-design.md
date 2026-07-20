# Runtime Settings and Automatic Updates Design

## Goal

Make clipboard settings control the running application and survive restart, then make every normal production launch securely install the newest SnipDock alpha release and restart automatically. Hidden Windows sign-in launches must remain fast and must not check for updates.

## Scope

### Runtime clipboard settings

- Initialize clipboard tracking, history days, maximum items, ignored applications, ignored patterns, and ignored content types from stored settings.
- Apply those settings to new clipboard captures immediately after a successful settings save.
- Pause the monitor during startup when `clipboard_tracking` is false.
- Keep the Clipboard page's Pause control as a temporary runtime control; changing the persistent Settings toggle routes through `save_settings` so runtime state changes only after persistence succeeds.
- Use current retention limits for every capture and for the daily cleanup task. A stricter limit prunes on the next capture or cleanup cycle, avoiding destructive cleanup while a number field is mid-edit.

### Automatic updater

- Check for updates only on normal, non-debug launches.
- Skip update checks for `--hidden` Windows sign-in launches.
- Use the official Tauri updater plugin and HTTPS GitHub Release assets.
- If a newer signed release exists, download it, install it, and restart SnipDock without prompting.
- Treat check, download, and installation failures as non-fatal: log the error and leave the current version running.
- Preserve GitHub prerelease status for alpha versions.

### Release pipeline

- Generate a passwordless Tauri updater signing keypair once. Keep the private key outside the repository, back it up offline, and add it to GitHub as `TAURI_SIGNING_PRIVATE_KEY`. Commit only the public key in Tauri configuration.
- Build signed updater artifacts only in the Release workflow. Normal local `bun run build:app` remains usable without secrets.
- Keep versioned installers and signatures on each `vX.Y.Z-alpha.N` prerelease.
- Maintain a permanent prerelease tagged `updater-alpha` whose replaceable `latest.json` points to the newest versioned release assets. The application reads `https://github.com/AnwarHossainSR/SnipDock/releases/download/updater-alpha/latest.json`.
- Make the Release workflow fail when signing is unavailable; never publish an updater manifest for unsigned artifacts.

## Architecture

### Shared capture policy

`CapturePolicy` becomes cloneable and owns compiled capture settings behind a poison-tolerant `RwLock`. `ClipboardCapture`, the settings command, and the daily cleanup task share the same policy instance. Reads take a short shared lock; settings updates compile regular expressions before replacing policy state under a write lock.

`CaptureSettings` gains conversion from the persisted `Settings` model. This removes the divergent hardcoded `max_items` value and gives startup, captures, and cleanup one source of truth.

The settings command receives `ClipboardMonitor` through existing `AppState` plus the managed `CapturePolicy`. After repository validation and persistence succeed, it updates `WindowPreferences`, replaces capture policy settings, and pauses or resumes the monitor. If persistence fails, no runtime state changes.

### Update lifecycle

The desktop Tauri builder initializes `tauri-plugin-updater`. At the end of successful setup, normal production launches spawn an asynchronous update task after showing the main window. The task checks the configured manifest, verifies its signature against the embedded public key, calls `download_and_install`, and restarts the application. Debug builds and background launches do not create this task.

The update task is deliberately Rust-only. No updater commands or network permissions are exposed to the webview, and the existing frontend CSP remains unchanged.

### Release manifest

Base `tauri.conf.json` contains the updater public key, rolling manifest endpoint, and passive Windows install mode. A separate release-only Tauri configuration enables `bundle.createUpdaterArtifacts`. The GitHub Release workflow supplies the private key secret to `tauri-action`, prefers NSIS in generated updater JSON, then uploads the generated `latest.json` to the permanent `updater-alpha` prerelease with replacement enabled.

## Data Flow

### Startup

1. Read persisted settings.
2. Build shared `CapturePolicy` from persisted capture values.
3. Start clipboard monitor and pause it when tracking is disabled.
4. Start daily cleanup with shared policy limits.
5. Show normal launch or remain hidden for `--hidden` launch.
6. On normal production launch only, check rolling signed update manifest.
7. When update exists, verify, download, install, and restart.

### Settings save

1. Frontend sends one settings patch.
2. Repository merges, validates, and persists the complete settings document.
3. Command updates window preference, shared capture policy, and monitor pause state from returned settings.
4. Frontend receives the authoritative saved settings.

### Release

1. Workflow validates synchronized alpha version and runs all tests.
2. Release build uses the private GitHub secret and release-only updater configuration.
3. Tauri creates NSIS installer, signature, and `latest.json`; `tauri-action` uploads versioned assets.
4. Workflow replaces `latest.json` on the permanent `updater-alpha` prerelease.
5. Existing clients retrieve that rolling manifest on their next manual launch.

## Error Handling and Security

- Tauri updater signature verification remains mandatory; unsigned or tampered downloads are rejected.
- Private signing key is never written inside the repository or logs. Losing it prevents future updates to installed clients, so an offline backup is required before the feature is considered release-ready.
- Updater network or installation failure logs a concise error and does not terminate startup.
- Invalid ignored-pattern regular expressions continue to fail repository validation before runtime policy changes.
- Poisoned policy locks recover their inner state instead of panicking the clipboard worker.
- Runtime settings update only after durable persistence succeeds.

## Privacy

SnipDock remains local-first, but it no longer makes zero network requests. Normal production launches contact only GitHub's HTTPS release infrastructure to retrieve update metadata and signed installer content. Clipboard and snippet content is never included in updater requests.

Update `README.md` and `docs/privacy.md` to state this exception precisely.

## Testing and Verification

- Unit-test conversion from persisted `Settings` to `CaptureSettings`.
- Unit-test policy replacement changes ignore decisions and retention snapshots.
- Extend settings integration tests to prove a successful save updates capture policy and monitor state, while invalid persistence leaves runtime state unchanged.
- Unit-test update-launch gating for manual, hidden, and debug modes without network access.
- Validate Tauri updater and release-only configuration schemas.
- Run `bun test`, `bun run lint`, `bun run build`, and full Rust tests.
- Run ordinary unsigned local NSIS build to prove developer builds remain usable.
- Validate Release workflow syntax and document required GitHub secret plus rolling-manifest acceptance checks.
- End-to-end updater verification requires two signed releases: install version N, publish N+1, manually launch N, and confirm automatic install plus restart into N+1.

## Success Criteria

- Disabled clipboard tracking stays disabled after restart.
- Saved retention and ignore rules affect subsequent captures without restarting.
- Normal production launch installs and restarts into a newer valid signed alpha release.
- Hidden sign-in launch performs no update request.
- Missing network, absent update, invalid signature, or installer failure leaves the current app usable.
- Alpha releases retain GitHub prerelease status and publish a rolling signed manifest.
- Local unsigned package builds still succeed.
