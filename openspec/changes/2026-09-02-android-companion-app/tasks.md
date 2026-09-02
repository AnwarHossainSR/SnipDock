## 1. Prove the core cross-compiles

- [ ] 1.1 Install the Android NDK and add the `aarch64-linux-android` and `armv7-linux-androideabi` targets; record the exact NDK version in `docs/android.md`
- [x] 1.2 Move `tauri-plugin-global-shortcut`, `tauri-plugin-single-instance`, `tauri-plugin-window-state`, `tiny_http`, and `sysinfo` into a desktop-only dependency table in `src-tauri/Cargo.toml`, and drop `tray-icon` from the default `tauri` features
- [x] 1.3 Gate the setup they feed — tray, global shortcut registration, window state, the CLI server in `app/mod.rs`, and the `resource_usage` / CLI commands in `commands/mod.rs` — behind `#[cfg(desktop)]`
- [ ] 1.4 Build `snipdock_lib` for both Android targets; fix whatever `sqlx`/SQLite, `reqwest`/rustls, or `getrandom` raise under the NDK
- [ ] 1.5 Run the existing Rust test suite on the desktop targets and confirm nothing regressed from the gating; note in `docs/android.md` which suites cannot run on a device yet
- [ ] 1.6 **Gate:** if 1.4 cannot be made to pass in a week, stop and reassess the Kotlin-core alternative from `design.md` before continuing

## 2. Platform capability matrix

- [x] 2.1 Add a `PlatformCapabilities` model listing each capability from the `android-app-shell` spec, resolved by target at compile time
- [x] 2.2 Expose `get_platform_capabilities` and cover it with a test asserting the desktop set is complete and the Android set excludes capture, direct paste, global shortcuts, Quick Paste, tray, autostart, CLI, and the updater
- [x] 2.3 Read the matrix once at frontend startup into a store, and use it — not user-agent sniffing — wherever a control must be hidden

## 3. Sync foundations

- [x] 3.1 Add a migration for the device registry: device id, user-visible name, Lamport counter, and per-peer watermarks
- [x] 3.2 Generate the device id and a default name on first launch; make the name editable and persist it
- [x] 3.3 Implement the Lamport counter: monotonic per device, advanced past the highest value seen in any pulled record
- [x] 3.4 Extend `storage/sync.rs` staging to stamp records with the counter and device id, and add repository tests for staging, tombstones, and the private-item refusal

## 4. Sync transport

- [ ] 4.1 Define a `SyncTransport` trait — put, get, list-since, delete — so the object store is replaceable
- [ ] 4.2 Implement it over the signed S3/R2 client in `features/cloud.rs`, addressing objects as `<prefix>/records/<device-id>/<lamport>-<uuid>.bin`
- [ ] 4.3 Implement the probe: write and read back a test object during setup, and surface a typed error for credentials, network, and permission failures
- [ ] 4.4 Add a fake in-memory transport for tests, and cover list-since paging and the per-device watermark

## 5. Sync loop

- [ ] 5.1 Implement push: upload every staged record, advance this device's watermark, and leave staging intact on failure
- [ ] 5.2 Implement pull: list since the stored watermark per peer, fetch and open each record, skip this device's own, and apply into the local database in one transaction
- [ ] 5.3 Apply the merge rule: higher `(counter, device-id)` becomes active, the loser is written to `sync_conflicts`, and a tombstone beats a concurrent edit
- [ ] 5.4 Make a failed cycle atomic — no partial local state — and retry on the next cycle without user action
- [ ] 5.5 Schedule cycles: once at launch, on a fixed interval while running, and on demand; never in the background
- [ ] 5.6 Implement compaction: rewrite this device's own records as one snapshot when every peer's watermark has passed them, and skip it when any peer lags
- [ ] 5.7 Expose the commands the UI needs: `sync_status`, `sync_now`, `configure_sync`, `disable_sync`, `leave_sync_group`, `list_conflicts`, `restore_conflict_revision`
- [ ] 5.8 Write the two-device integration test against the fake transport: capture, push, pull, converge; concurrent edit produces one active revision and one logged conflict; delete-versus-edit removes the item on both

## 6. Sync settings (desktop)

- [ ] 6.1 Add a Sync panel to Settings: destination fields, passphrase, device name, and an on/off control that validates before enabling
- [ ] 6.2 Show status — last successful cycle, records waiting, current error — and a "Sync now" action
- [ ] 6.3 Surface the conflict count, list the retained revisions, and let the user restore one
- [ ] 6.4 Implement "leave sync group": remove this device's objects, clear staging, keep local items
- [ ] 6.5 Frontend tests for the panel: validation failure keeps sync off, status renders each state, restoring a conflict calls through

## 7. Ship sync on desktop

- [ ] 7.1 Update `docs/privacy.md` with exactly what leaves the device when sync is on, and `README.md` with the feature and its trust model
- [ ] 7.2 Exercise sync between two real desktop installations against a live bucket, including a device offline for a day
- [ ] 7.3 Release sync as a desktop version before any Android artefact exists

## 8. Android shell

- [ ] 8.1 Run `tauri android init`; commit `src-tauri/gen/android` and add the mobile section to `tauri.conf.json`
- [ ] 8.2 Decide the minimum SDK (open question in `design.md`) and record it with its consequences for the share sheet and the tile
- [ ] 8.3 Confirm the app launches on a device and opens the same database the desktop schema produces, with migrations applied
- [ ] 8.4 Point the app's storage at private app storage, exclude it from Android cloud backup, and verify both on device
- [ ] 8.5 Build the single-activity shell: bottom navigation for History, Search, Settings, with back handling that never leaves a blank view
- [ ] 8.6 Restore screen, query, and scroll position across rotation and process death

## 9. Android views

- [ ] 9.1 Create `src/mobile/` and choose the tree at startup from the platform capabilities
- [ ] 9.2 Build the history list: one row per item with content, type, source, and relative time; 48dp touch targets; no hover-dependent affordance
- [ ] 9.3 Implement infinite scroll paging over the existing search command, preserving position when a page appends
- [ ] 9.4 Build the item detail view with copy, pin, favourite, tag, and delete
- [ ] 9.5 Build search with the existing query parser, and the filters that make sense on a phone
- [ ] 9.6 Build the Android Settings screen from the capability matrix — sync, retention, appearance, device name — and nothing the platform cannot do
- [ ] 9.7 Write the empty state that explains history arrives from a paired desktop, and links to sync setup
- [ ] 9.8 Show the sync status and a "Sync now" action, and run one cycle when the app returns to the foreground

## 10. Android clipboard bridge

- [ ] 10.1 Create the local Tauri plugin with its Kotlin side; keep product logic in Rust
- [ ] 10.2 Implement tap-to-copy for text, and image items that copy as images rather than paths
- [ ] 10.3 Require confirmation before copying an item marked private
- [ ] 10.4 Flag sensitive copies so the platform excludes them from clipboard previews, and honour the auto-clear-sensitive interval while the app is in the foreground
- [ ] 10.5 Register the `ACTION_SEND` share target for text and images, saving through the existing manual-save path so detection and privacy rules are unchanged
- [ ] 10.6 Confirm a share without opening the full interface, and store shared images in the private image directory
- [ ] 10.7 Implement the Quick Settings tile: copy the most recent non-private item, say what was copied, and do nothing surprising on an empty history
- [ ] 10.8 Write the statement of what Android forbids into the Android Settings screen and the empty history, and add `docs/android.md`
- [ ] 10.9 Instrumented tests for the share intent, the tile, and copy-out on a device or emulator

## 11. Build, CI, release

- [ ] 11.1 Add a CI job that builds both Android targets, with the NDK cached
- [ ] 11.2 Keep the desktop jobs unchanged and confirm the gating did not alter what they build
- [ ] 11.3 Add signed AAB production to the release workflow, with the keystore in repository secrets
- [ ] 11.4 Prepare the Play listing, the data-safety declaration, and the privacy policy; state that content leaves the device only when the user configures sync, and then sealed
- [ ] 11.5 Publish a closed test track and fix what review or testers raise

## 12. Verification gates

- [ ] 12.1 `bun run lint`, `bun test`, `cargo clippy --all-targets -- -D warnings`, and `cargo test` all pass
- [ ] 12.2 Both Android targets build, and the app runs on a physical device
- [ ] 12.3 A capture on the desktop appears on the phone, and an item shared on the phone appears on the desktop
- [ ] 12.4 With sync off, no request leaves either device; with sync on, no plaintext appears in any request or object name
- [ ] 12.5 Every desktop capability listed in the specs still works, and no Android control refers to a capability the platform cannot provide
- [ ] 12.6 Record the results of 12.1–12.5 in `PROGRESS.md`
