## Context

See `proposal.md` Why for motivation. The constraints that shape the approach:

- `AGENTS.md` requires reusing existing code, native APIs, and installed dependencies. The change adds zero new crates and zero new npm packages; `regex` is already in `src-tauri/Cargo.toml` (used by `ignored_patterns`), and the eight transforms operate on `String`/`&[u8]` with only the standard library.
- `src-tauri/src/features/clipboard/capture.rs` already calls `self.foreground_app.executable_name()` twice (lines 223 and 263). The first call site resolves the value used by `ignored_apps`; the second resolves a value that is currently discarded. `source_app` storage is set in the same call site, before the insert.
- The existing `apply_paste_format` helper in `src-tauri/src/features/formatting.rs` and `commands/clipboard.rs:42-62` is the funnel for paste-time transformations; the new transforms extend it rather than adding a parallel pipeline.
- `Settings.custom_shortcuts: BTreeMap<String, String>` is declared in `src-tauri/src/models/settings.rs:19` and defaulted to empty; no read site exists. The new panel and shortcut registration fill that hole.
- `Settings.ignored_apps: Vec<String>` is read in `capture.rs:35` and used for filter decisions at lines 95 and 131. There is no UI to edit it.
- `packages/snipdock-cli/src/index.ts` is a single-file CLI that shells out to GitHub releases for the installer. The new subcommands shell out to a localhost endpoint; the endpoint is owned by the desktop app.
- `clipboard://captured` already emits the full `LibraryItem` (`src-tauri/src/app/mod.rs:135`). The capture path is the place that populates `source_app` so listeners see it in the same payload.

## Goals / Non-Goals

**Goals:**

- Six independently testable increments that can land in any sequence.
- Persisted data is additive: a new column on `items`, new optional fields on `LibraryItem`/`SearchQuery`, and one new panel per capability. Existing rows remain valid; existing commands retain their signatures; the existing UI keeps working.
- No new dependencies. Every Rust crate and npm package is already installed.
- Each increment has an identity round-trip test (apply a transform, then unapply, expect equality) where the operation has a known inverse, so a regression cannot silently corrupt content.

**Non-Goals:**

- Title capture, window-context capture, or anything beyond the foreground executable name.
- A user-defined transform pipeline or a plugin surface.
- Cross-device sync of `ignored_apps` or `custom_shortcuts`.
- CLI scripting of the install/run flow that already exists. New subcommands only.
- A regex mode on every search backend (saved searches, search history).
- Migrating the CLI from installer-only to first-class product; the new subcommands extend what is there.

## Decisions

### Source-app capture is set in the existing capture path, not derived at read time

`foreground_executable_name()` is a Windows `GetForegroundWindow()` + `GetWindowThreadProcessId()` + `QueryFullProcessImageNameW` round-trip (see `src-tauri/src/platform/native.rs:52-97`). Calling it on every read would multiply that cost by the page size for every page render. The value is captured once at the existing call site (after the ignored-app filter, before the insert) and stored.

Alternative considered: derive the friendly name (e.g. "Visual Studio Code" from "Code.exe") at the platform layer. Rejected — name lookup is OS-specific and varies by language; storing the raw executable name keeps the platform module small. The Settings panel and Details tab both render the raw value.

### Quick Paste transforms run at paste time, never at capture time

The user's stored history is the canonical record of what they copied. Applying transforms at paste time means a transformation mistake cannot retroactively mutate history. The transforms are deterministic and pure — the same input always yields the same output — so a transform applied twice produces the same result (verified by round-trip tests).

Alternative considered: store the transformed version as a separate item. Rejected — duplicates history and conflates what was copied with what was pasted.

### Regex search branches on a new optional field, not on parsing the query string

A user typing `/v\d+/users/` in the search box does not intend "find a literal string containing `v`, digit, digit, digit, `/users/`" — but if the parser silently interprets slashes as delimiters, that is exactly what they get. The mode is a first-class setting on the search box, not a syntax the parser guesses.

Alternative considered: detect `/.../flags` and call it regex. Rejected for ambiguity (paths starting with `/` in copied URLs) and silent surprises.

### `ignored_apps` is edited, not invented

The list already exists and is honored at capture time. The change adds the editor only — no schema work, no migration. The "add currently focused app" button calls `foreground_executable_name()` once and appends, using the same platform code the capture path already uses; no new platform surface.

### Custom shortcuts use the existing doc as schema

`docs/keyboard-shortcuts.md` is the source of truth the layout spec already cites for the hint strip. The Settings panel reads it on render, so the panel cannot drift from the docs. The frontend parses the file (or a typed equivalent) into a `{ action: key }` map; `custom_shortcuts` overrides individual entries; the panel surfaces a conflict message when the chosen binding collides with a known OS / browser shortcut the user is unlikely to want to lose.

Alternative considered: hard-code the actions in the frontend and read the doc only for hint-strip labels. Rejected — duplicates the list and invites drift the moment a doc entry changes.

### The CLI hits a localhost HTTP endpoint, not a new IPC channel

Tauri commands are scoped to the running webview's JS bridge; the CLI runs in a separate process. Reusing `tauri-plugin-localhost` (or a small `tiny_http` server on a free 127.0.0.1 port with a token in `<data_dir>/cli-token`) is the established pattern in the Tauri ecosystem and avoids inventing a new IPC bridge. The token is regenerated on each app start; the CLI reads it once on first run and caches it.

Alternative considered: add a Unix socket / named pipe with the same shape. Rejected — port range, token, and 127.0.0.1 binding are simpler and equivalent on the supported platforms.

## Risks / Trade-offs

- **[Risk] `source_app` column on a large `items` table.** A migration adds `source_app TEXT NULL`; backfill is `NULL` for existing rows. SQLite `ALTER TABLE ADD COLUMN` is O(1) regardless of row count, and the column is not indexed. Filter on `source_app` only when the filter is active, via a partial index if profiling shows it is hot. → Mitigation: ship without a new index, profile after release, add a partial index in a follow-up if needed.
- **[Risk] Regex search on a large result set is slow without an index.** `regex::Regex::is_match` against the indexed text is linear. Mitigated by scoping to the existing FTS5 rowset (the literal query first narrows by FTS5, then the regex is applied to the candidate text) — the user who opts in accepts the cost.
- **[Risk] Localhost HTTP endpoint exposed by the desktop app.** The endpoint must not be reachable off-device. Bind to `127.0.0.1`, gate with a random 16-byte token, and rotate the token on each launch. The CLI never embeds a long-lived secret. → Mitigation: short-lived token + 127.0.0.1 binding + same-user permission check (POSIX file mode on `<data_dir>/cli-token`); reject any request that lacks the token.
- **[Risk] Custom shortcut conflicts with the OS or with another registered global shortcut.** Tauri shortcut registration fails when the binding is taken; surface the failure in the inline error pattern the Settings screen already uses (per `settings-editing` spec), so the user sees a "binding already in use" message rather than a silent no-op.
- **[Risk] `apply_paste_format` is currently a single `Option<PasteFormat>` enum; threading eight more transforms doubles the function signature.** → Mitigation: introduce a small `Transform` enum (one variant per transform) alongside the existing `PasteFormat`; `apply_transform(content, transform)` is a thin wrapper. macOS/Linux copy path and Windows paste path each call the same helper.
- **[Risk] The CLI depends on SnipDock being running, which is not true on a headless install.** The `snipdock search` / `snipdock pin` subcommands fail fast with "SnipDock is not running. Run `snipdock run` first." The installer and `snipdock run` / `snipdock update` paths are unchanged.
- **[Risk] Source-app filter on the sidebar grows unbounded.** A user with dozens of distinct source apps will get a long list. Mirror the existing tag sidebar pattern (top N by count + an "All sources" entry); cap the visible list and surface the rest behind a small disclosure.