## 1. Source-app capture (data + capture path)

- [ ] 1.1 Add `source_app: Option<String>` to `src-tauri/src/models/library.rs::LibraryItem`; bump nothing else (serde default is `null`)
- [ ] 1.2 Add a `source_apps: Vec<String>` field to `src-tauri/src/models/library.rs::SearchQuery` with `#[serde(default)]`
- [ ] 1.3 Add a `source_app TEXT NULL` column to the items table via a new migration in `src-tauri/src/storage/migrations/`; existing rows default to `NULL`
- [ ] 1.4 In `src-tauri/src/features/clipboard/capture.rs`, set the new `source_app` field from `self.foreground_app.executable_name()` before the insert at both text and image call sites
- [ ] 1.5 Extend `clipboard://captured` event emission in `src-tauri/src/app/mod.rs` so the payload includes the populated `source_app` (no change to listener registration; payload struct carries the new field)
- [ ] 1.6 Tests: capture from a named app stores `source_app`; ignored-app capture stores nothing; image capture stores `source_app`; manually-saved item stores `null`

## 2. Source-app frontend types and store

- [ ] 2.1 Add `source_app?: string | null` to `src/api/types.ts::LibraryItem`
- [ ] 2.2 Add `source_apps?: string[]` to `src/api/types.ts::SearchQuery`
- [ ] 2.3 Extend `matchesFilter` and `queryFor` in `src/stores/clipboardStore.ts` to include `source_apps` (empty / unset array = no filter; otherwise item must have a recorded `source_app` matching one of the entries)
- [ ] 2.4 Add `source_app` to the `baseItem` factory in `src/stores/clipboardStore.test.ts` and add tests for the new `matchesFilter` branches

## 3. Source-app UI surfacing

- [ ] 3.1 Render the source-app segment in `src/features/clipboard/ClipboardItem.tsx`'s metadata line; show the segment only when `item.source_app` is non-null (mirrors the existing line-count segment)
- [ ] 3.2 Render the source-app row in `src/features/clipboard/ItemInspector.tsx`'s Details tab; show only when non-null
- [ ] 3.3 Add a source-app filter UI on the Clipboard toolbar (mirrors the existing Pin/Code filter UI); wired through `clipboardStore`
- [ ] 3.4 Add a `get_source_app_counts` Tauri command returning `[(source_app: Option<String>, count: i64)]`, surfaced via `src/api/commands.ts`
- [ ] 3.5 Add the Sources section to `src/app/components/AppSidebar.tsx` reading the new command, listing `source_app` values with counts in descending order, with empty-state and label-truncation
- [ ] 3.6 Selecting a Sources entry navigates to the Clipboard screen with `source_apps` filter pre-applied; selecting `Unknown source` uses a sentinel value for null sources
- [ ] 3.7 Tests: row metadata renders source-app when set; Details tab renders source row when set; source-app filter narrows results; sidebar Sources renders empty state when no items

## 4. Quick Paste transforms (Rust pipeline)

- [ ] 4.1 Add a `Transform` enum in `src-tauri/src/models/library.rs` (one variant per built-in: `Trim`, `Lowercase`, `Uppercase`, `SortDedupeLines`, `JsonPretty`, `JsonMinify`, `Base64Encode`, `Base64Decode`, `UrlEncode`, `UrlDecode`)
- [ ] 4.2 Extend `src-tauri/src/features/formatting.rs` with `apply_transform(content: &str, transform: Transform) -> Result<String, TransformError>`; each variant is a pure function; errors are returned not panicked
- [ ] 4.3 Add unit tests for every variant, including identity round-trips for `Base64 encode -> decode` and `URL encode -> decode`, and a known-invalid `Base64 decode` case
- [ ] 4.4 Extend `copy_item` and `direct_paste_item` in `src-tauri/src/commands/clipboard.rs` to accept an optional `transform: Option<Transform>` and call `apply_transform` after the existing `apply_paste_format`; the same helper handles both the Windows paste path and the macOS/Linux copy path
- [ ] 4.5 Tests: transforms don't mutate the stored item; round-trip identity holds; an invalid transform rejects without pasting

## 5. Quick Paste transforms (frontend UI)

- [ ] 5.1 Add `Transform` and `TransformKind` types to `src/api/types.ts` mirroring the Rust enum
- [ ] 5.2 Extend `src/api/commands.ts::copy_item` / `direct_paste_item` to accept a `transform` argument
- [ ] 5.3 Add a transform row to `src/features/quick-paste/QuickPaste.tsx` showing each transform as a single-key chip with the documented binding; selected chip is highlighted
- [ ] 5.4 Add a preview pane to Quick Paste that renders the result of `apply_transform(selected.content, activeTransform)` reactively; resets to "None" when the selection changes
- [ ] 5.5 Wire `Tab` (cycle), the documented reset key, and the documented single-key transform bindings; document them in `docs/keyboard-shortcuts.md`
- [ ] 5.6 Disable transform chips when the highlighted item is an image; the preview pane shows an empty state ("Image items have no transforms")
- [ ] 5.7 Tests: cycling transform updates preview; reset restores un-transformed preview; switching selection resets transform; invalid transform surfaces inline error and does not paste

## 6. Regex search (Rust path)

- [ ] 6.1 Add `regex: Option<String>` and `regex_case_insensitive: Option<bool>` to `src-tauri/src/models/library.rs::SearchQuery` (both `#[serde(default)]`)
- [ ] 6.2 In the existing search function (under `src-tauri/src/features/clipboard/` or `src-tauri/src/storage/`), branch on `regex`: if `Some(pattern)`, compile a `regex::Regex` (reject invalid patterns with a typed error), then run the FTS5 pre-filter and apply the regex against the candidate text
- [ ] 6.3 Map the typed compile error to a frontend-facing error code so the search box can render an inline message
- [ ] 6.4 Tests: valid regex returns matching rows; invalid regex returns the typed error and no rows; case-insensitive flag works; regex is scoped to the FTS5 pre-filter

## 7. Regex search (frontend UI)

- [ ] 7.1 Add `regex: Option<string>` and `regex_case_insensitive: Option<boolean>` to `src/api/types.ts::SearchQuery`
- [ ] 7.2 Add a mode selector next to the search input in `src/features/clipboard/ClipboardPage.tsx` and `src/features/search/SearchResultsPage.tsx` with `Literal` / `Regex` options; default `Literal`
- [ ] 7.3 Wire the selector through `clipboardStore` so the active mode is part of the outgoing search query; show the active mode as a token-styled indicator next to the input
- [ ] 7.4 Render the inline regex compile error from the typed error above the search results, with a "Dismiss" action that resets the query to the previous value
- [ ] 7.5 Extend the saved-search schema and UI to record the mode alongside the query
- [ ] 7.6 Tests: mode selector toggles and persists within a session; valid regex returns matching rows; invalid regex shows inline error and keeps prior rows; saved search records and restores the mode

## 8. Per-app ignore (Settings editor)

- [ ] 8.1 Add the "Ignored apps" panel to `src/features/settings/SettingsPage.tsx` (or its settings-panels directory); render the list from `Settings.ignored_apps` with one row per entry and a remove action
- [ ] 8.2 Add the Add field (type-executable-name, commit on blur / `Enter`, trim whitespace, reject empty, reject duplicates)
- [ ] 8.3 Add the "Add currently focused app" button that calls a new `get_foreground_executable` Tauri command, appending the resolved value to `Settings.ignored_apps`
- [ ] 8.4 Show the empty-state message when the list is empty; do not invent entries that aren't there
- [ ] 8.5 Tests: list renders persisted entries; add by typed name persists; add focused app appends; remove updates the list; duplicate is a no-op; invalid typed value is rejected with the inline pattern from `settings-editing`

## 9. Custom shortcuts (Settings panel)

- [ ] 9.1 Read `docs/keyboard-shortcuts.md` at build time or via a small markdown-to-JSON parser in `src/lib/`; expose the parsed `{action: string, defaultBinding: string, label: string}[]` as the panel's schema
- [ ] 9.2 Add the "Keyboard shortcuts" panel to `SettingsPage` rendering one row per parsed shortcut, with the action label, current binding (default or override from `Settings.custom_shortcuts`), and an inline edit control
- [ ] 9.3 Render `CmdOrCtrl` per-platform (`Cmd` on macOS, `Ctrl` elsewhere) using the same rendering helper the in-app hint strip uses (consistency with `clipboard-layout` Requirement "Keyboard hint strip reflects real shortcuts")
- [ ] 9.4 Add validation on commit: grammar check (`CmdOrCtrl|Shift|Alt` + a single key), collision check against other rows, collision check against a small OS-reserved list (`Cmd+Q` on macOS, `Alt+F4` on Windows, etc.); reject with the same inline-error pattern the rest of Settings uses
- [ ] 9.5 On a successful commit, write the entry to `Settings.custom_shortcuts` and emit a `settings://changed` event
- [ ] 9.6 Tests: panel renders the documented set; rebind persists; invalid grammar is rejected; collision with another app shortcut is rejected; clearing a binding removes the override; rebind survives a reload

## 10. Custom shortcuts (handler rebind)

- [ ] 10.1 In `src-tauri/src/platform/shortcuts.rs` (existing), read `Settings.custom_shortcuts` on launch and on the `settings://changed` event; rebuild the shortcut registration accordingly
- [ ] 10.2 When a rebind collides with an OS binding the Tauri registration can't acquire, surface the failure through the same error path the panel uses (consistency with the panel's collision rejection)
- [ ] 10.3 Tests: rebind is active after save without restart; default binding is restored when the override is cleared; rebind survives a restart

## 11. CLI expansion (desktop endpoint)

- [ ] 11.1 Add a small `tiny_http` server in `src-tauri/src/app/`, bound to `127.0.0.1` on a random port from a 16-bit range; gated by a 16-byte random token
- [ ] 11.2 On startup, write `<data_dir>/cli-token` and `<data_dir>/cli-port` (token + port), set permissions to the current user only; rotate on each launch
- [ ] 11.3 Implement the eight routes: `POST /pin`, `POST /unpin`, `POST /favorite`, `POST /unfavorite`, `POST /tag`, `POST /search`, `POST /paste`, `POST /export`; each validates the bearer token, calls the existing Tauri command path, and returns JSON
- [ ] 11.4 The server reuses existing repository methods; no new business logic in the server itself
- [ ] 11.5 Tests: each route returns the expected status and body; missing token returns 401; SnipDock not running (no token file) is reported by the CLI as a clear error

## 12. CLI expansion (CLI subcommands)

- [ ] 12.1 Extend `packages/snipdock-cli/src/index.ts` with `pin`, `unpin`, `favorite`, `unfavorite`, `tag`, `search`, `paste`, `export` subcommands; each reads the token+port from the SnipDock data directory, sends the request, prints a single-line success or error, exits 0 or 1 accordingly
- [ ] 12.2 Update `snipdock help` to list the new subcommands alongside the existing ones
- [ ] 12.3 Document the new subcommands in `packages/snipdock-cli/README.md` and a new `docs/cli.md` (endpoint discovery, token storage, per-subcommand examples)
- [ ] 12.4 Tests: argument parsing for each new subcommand (positive and negative cases); help output lists every subcommand; missing-token path prints the documented error message

## 13. Verification

- [ ] 13.1 `bun test`
- [ ] 13.2 `bun run lint`
- [ ] 13.3 `bun run build`
- [ ] 13.4 `cargo test --manifest-path src-tauri/Cargo.toml`
- [ ] 13.5 (deferred: needs a desktop session) Manual pass in `bun run tauri dev`: copy from a known app and verify source-app in Details + sidebar Sources; rebind a shortcut and verify activation without restart; open Quick Paste and verify transform preview; switch to Regex mode and verify matching rows; run a `snipdock search` against the running instance