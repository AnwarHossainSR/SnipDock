## Context

See `proposal.md` — Why. The constraints that shape the approach:

- **Android's clipboard rules are the product definition.** `ClipboardManager.getPrimaryClip()` returns `null` for an app without input focus since API 29. The two escapes — an `InputMethodService` or an `AccessibilityService` — are respectively a separate native application and a Play policy violation for this category. Everything below assumes capture on the phone is explicit.
- **The sync engine is half-written and its shape is already decided.** `src-tauri/src/storage/sync.rs` seals payloads with `crate::crypto::encrypt`, refuses private items at the boundary, and writes to `sync_records` / `sync_conflicts` (`migrations/0003_sync.sql`). This change adds a transport and a loop around it; it does not redesign it.
- **The cloud transport already exists.** `src-tauri/src/features/cloud.rs` performs signed S3/R2 uploads in Rust because the webview CSP blocks outbound calls and the secret key must not reach the frontend. Sync inherits both the code and that constraint.
- **The crate is nearly mobile-ready by accident.** `windows-sys`, `tauri-plugin-autostart`, and `tauri-plugin-updater` are already target-gated, and eight `#[cfg(desktop)]` sites exist. The gap is six unconditional dependencies and the setup code in `app/mod.rs`.
- **The frontend is desktop-shaped.** An 820px content column, a permanent right rail, hover affordances, and a keyboard hint strip. The API and store layers (`src/api/`, `src/stores/`) are platform-neutral; the view layer is not.

## Goals / Non-Goals

**Goals:**

- One database schema and one Rust core serving both platforms, with the difference expressed as target gates rather than forks.
- A sync design that keeps SnipDock out of the trust path: no server, no account, no key held by anyone but the user.
- An Android app that is useful the first time it opens, and honest about what it cannot do.
- A shipping path — signed AAB, Play data-safety declaration — treated as part of the work rather than discovered at the end.

**Non-Goals:**

- A custom keyboard (IME). It is the only route to real capture on Android and it is a native Kotlin application in its own right; it gets its own change if the companion earns it.
- Real-time sync. The loop is periodic and foreground-only; sub-second convergence would need a persistent connection and a service.
- iOS. The clipboard restrictions differ and the distribution constraints differ; nothing here should assume it comes for free.
- Reworking the desktop UI. The mobile views are additive.

## Decisions

### Tauri 2 mobile, not a separate native client

The Android app is a Tauri target of this crate, sharing `snipdock_lib` and the React codebase's non-view layers.

The alternative is a Kotlin/Compose client over the same core via UniFFI or JNI. It produces a better mobile app and it is where an IME would have to live. It was rejected *for this change* because it doubles the surface before the premise is proven: two build systems, two view layers, and an FFI boundary to maintain, in exchange for polish on an app whose value proposition (sync) is not yet demonstrated. If the companion succeeds and the IME becomes the next step, that is the moment to revisit — and the Rust core is the part that survives either way, which is why it goes first.

### Gate by capability, not by operating system

Desktop-only wiring moves behind `#[cfg(desktop)]` and target-scoped dependency tables, and the frontend asks the backend what the platform supports rather than sniffing a user agent.

A single `get_platform_capabilities` command returns the matrix the `android-app-shell` spec defines, and the mobile view tree renders from it. The alternative — `if (isAndroid)` scattered through components — puts the same knowledge in two places and drifts the first time a capability lands on one platform only. The command also gives the ignored-apps and source-app features a truthful answer on the platforms where foreground detection returns `None`.

### The sync transport is the user's bucket, addressed as an append-only log

Each device writes objects under `<prefix>/records/<device-id>/<lamport>-<uuid>.bin`; a pull lists the prefix, fetches what it has not seen, and records a per-device high-water mark. Objects are never mutated — a change to an item is a new object with a higher revision, and a deletion is a tombstone object.

Rejected: a single mutable `state.json` per device (lost updates under concurrent writes, and a full rewrite per change); a SnipDock-hosted relay (an account system, a server to run, and the trust story the product is built to avoid); WebDAV or a filesystem folder as the first transport (S3/R2 is already implemented, signed, and configured by existing users — other backends can be added behind the same trait).

The immediate consequence is that listing is the pull's cost centre. The high-water mark per device keeps a steady-state pull to one `LIST` with a start-after key, and compaction (below) keeps the object count bounded.

### Ordering is a Lamport counter per device, not wall-clock time

Devices disagree about the time, and a phone that was off for a week must not lose to a laptop's clock skew. Each device keeps a monotonic counter, stamps records with it, and advances it past the highest value it has seen. `updated_at` remains what the user sees; the counter is what the merge compares.

### Conflicts resolve last-writer-wins, with the loser kept

The active revision is the one with the higher (counter, device-id) pair; the losing revision is written to `sync_conflicts` and surfaced as a count in Settings, restorable by the user.

CRDT-per-field merging was considered and rejected: a clipboard item is a small immutable blob plus flags, so field-level merge buys little, and the failure mode of LWW — losing a title edit made in the same minute on two devices — is recoverable precisely because the loser is retained. Silent LWW with no log would not be acceptable; the log is what makes the simple rule honest.

### The phone gets its own view tree over the same stores

`src/mobile/` holds the Android views; `src/api/` and `src/stores/` are shared unchanged. The entry point chooses a tree from the platform capabilities at startup.

Responsive CSS over the desktop components was rejected: the desktop layout's core devices (a permanent right rail, hover-revealed actions, a keyboard hint strip) have no phone equivalent, so the "responsive" version would be a rewrite hidden inside media queries, where every future desktop change risks a phone regression.

### The share target and the tile are a small Kotlin plugin

Receiving `ACTION_SEND` and providing a `TileService` are Android-native surfaces with no Tauri equivalent. A local Tauri plugin holds the Kotlin, converts the intent payload, and calls the existing manual-save command — the plugin carries no product logic, so detection, privacy, and storage rules stay in Rust where the desktop already enforces them.

### Compaction keeps a bucket from growing without bound

A device that has seen every record from every peer up to a watermark may rewrite its own history as a single snapshot object and delete the records it supersedes. Compaction runs on the writing device only, never deletes another device's objects, and is skipped when any peer's watermark lags — a device offline for months is a reason to keep the log, not to prune it.

## Risks / Trade-offs

- **Play Store review rejects a clipboard manager on category grounds** → The app requests no sensitive permission, declares no accessibility use, and reads the clipboard only on explicit user action; the data-safety form states that content leaves the device only when the user configures sync, and then sealed. Prepare the listing early and treat rejection feedback as a gate on the release task, not on the build tasks.
- **Cross-compiling `sqlx`/SQLite for Android fails or drags** → This is the single largest unknown and it is cheap to test, so it is task 1. If the bundled SQLite path proves hostile under the NDK, the fallback is Android's own SQLite through a JNI shim, which changes the storage layer's initialisation but not its queries.
- **A user loses the sync passphrase** → Nothing can recover the records; the design has no key escrow by intent. Setup states this once, plainly, and the local history is never encrypted by it — losing the passphrase costs the sync group, not the data.
- **Clock skew or a long-offline device produces surprising merges** → The Lamport counter removes wall-clock ordering from the merge, and the conflict log means a surprising merge is inspectable rather than silent.
- **The bucket accumulates objects and cost** → Per-device compaction with a peer-watermark guard, plus a documented note that the sync prefix is not the backup prefix and can be emptied independently.
- **Two view trees drift** → The shared layer is the API and the stores, where the behaviour lives; the trees hold layout only. Store-level tests already cover the behaviour both trees depend on.
- **Scope: this change is large** → The task order is deliberately front-loaded with the two questions that could invalidate the rest (does the core cross-compile; does a record round-trip between two devices). Both are answerable in the first fortnight, before any UI work is spent.

## Migration Plan

1. **No data migration on desktop.** Existing installations gain sync in the off state; nothing changes until a destination is configured.
2. **Schema.** `sync_records` and `sync_conflicts` already exist. One migration adds the device registry (identifier, name, counter, per-peer watermarks).
3. **Rollout order.** The Rust gating and the sync loop ship in a desktop release first, where sync can be exercised between two desktops before a phone is involved. The Android artefact ships only after that release is stable.
4. **Rollback.** Turning sync off is the rollback for the loop; it stops the cycle and touches no local item. The Android build is a separate artefact and can be withheld without affecting desktop releases.

## Open Questions

- Which Android minimum SDK to support. API 26 versus API 29 changes only the share-sheet and tile details, not the architecture, and can be settled when the shell is built.
- Whether the desktop should expose "sync now" in the tray as well as Settings. Cosmetic; decide when the panel exists.
