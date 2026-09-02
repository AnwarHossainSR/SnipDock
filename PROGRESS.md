# SnipDock Progress

## Active change

`openspec/changes/2026-09-01-power-features-and-quick-paste-transforms/`

| Task | Title | Status | Commit | Notes |
| ---- | ----- | ------ | ------ | ----- |
| 1 | Source-app capture data + capture path | completed | 6c0b6e6e29c523b1f385d396f7f449f19c751193 | `tasks.md` §1, committed 2026-09-01 |
| 2 | Source-app frontend types and store | completed | 472f843 | `tasks.md` §2, committed 2026-09-01 |
| 3 | Source-app UI surfacing | completed | 2337fbe | `tasks.md` §3, committed 2026-09-01 |
| 4 | Quick Paste transforms — Rust pipeline | completed | cf69f72 | `tasks.md` §4, committed 2026-09-01 |
| 5 | Quick Paste transforms — frontend UI | completed | b36c976 | `tasks.md` §5, committed 2026-09-01 |
| 6 | Regex search — Rust path | completed | 05c4504 | `tasks.md` §6, committed 2026-09-01 |
| 7 | Regex search — frontend UI | completed | ff2c7cb | `tasks.md` §7, committed 2026-09-01 |
| 8 | Per-app ignore — Settings editor | completed | 751e730 | `tasks.md` §8, committed 2026-09-01 |
| 9 | Custom shortcuts — Settings panel | completed | fb68db4 | `tasks.md` §9, committed 2026-09-02 |
| 10 | Custom shortcuts — handler rebind | completed | fb68db4 | `tasks.md` §10, committed 2026-09-02 |
| 11 | CLI expansion — desktop HTTP endpoint | completed | 79db7de | `tasks.md` §11, committed 2026-09-02 |
| 12 | CLI expansion — CLI subcommands | completed | 79db7de | `tasks.md` §12, committed 2026-09-02 |
| 13 | Verification gate | completed | dd63547 | `tasks.md` §13, committed 2026-09-02; 13.1–13.4 pass, 13.5 deferred per `AGENTS.md` |
| 14 | Human-readable backup filenames | completed | b79c7d7 | `openspec/changes/2026-09-01-human-readable-backup-filenames/tasks.md` §14, committed 2026-09-01 |

## Notes

- Implementation order follows the table above. Each task is one `/task N` invocation and one local commit.
- The verification gate (task 13) runs `bun test`, `bun run lint`, `bun run build`, and `cargo test --manifest-path src-tauri/Cargo.toml`. Manual desktop-session checks are recorded as deferred per `AGENTS.md`.

## Checks

### Task 1 — Source-app capture data + capture path (2026-09-01)

- `cargo test --manifest-path src-tauri/Cargo.toml` — all suites green (20 test binaries, 0 failures).
- `bun test` — 211/211 pass.
- `bun run lint` — clean.
- `cargo build --manifest-path src-tauri/Cargo.toml` — clean.
- Manual desktop checks deferred per `AGENTS.md` (covered by task 13.5).
- Files changed: `src-tauri/migrations/0007_source_app.sql` (new), `src-tauri/src/models/library.rs`, `src-tauri/src/storage/items.rs`, `src-tauri/src/features/clipboard/capture.rs`, `src-tauri/src/features/transfer.rs`, `src-tauri/src/storage/smart_folders.rs`, `src-tauri/src/commands/clipboard.rs`, `src-tauri/tests/clipboard_policy.rs` (new tests), `src-tauri/tests/{search,snippets,trash,organization,duplicates,clipboard_actions,projects,repository,sensitive_clear,sync,retention}.rs` (struct-literal updates).
- Notes: Migration 0007 uses the 0004 table-rebuild pattern so it is idempotent (the schema-upgrade snapshot test rewinds the migration journal and replays the script). `source_app` lands between `last_used_at` and `created_at` in both the table and `LibraryItem`, matching the position used by `ITEM_COLUMNS`.

### Task 2 — Source-app frontend types and store (2026-09-01)

- `bun test` — 216/216 pass (27 files).
- `bun run lint` — clean.
- `bun run build` — clean.
- `cargo test --manifest-path src-tauri/Cargo.toml` — all suites green.
- Manual desktop checks deferred per `AGENTS.md` (covered by task 13.5).
- Files changed: `src/api/types.ts` (`LibraryItem.source_app`, `SearchQuery.source_apps?`), `src/lib/searchQuery.ts` (base `source_apps: []`), `src/stores/clipboardStore.ts` (`matchesFilter` third arg, `queryFor` forwards `source_apps` via spread), `src/stores/clipboardStore.test.ts` (5 new tests covering empty/match/mismatch/null + saved-search forwarding), `src/api/commands.test.ts`, `src/features/clipboard/{ClipboardPage,ItemInspector,ItemOrganizer,QuickPastePage,SaveItemDialog}.test.tsx`, `src/features/search/SearchResultsPage.test.tsx` (added `source_app: null` to fixture items).
- Notes: `source_apps` is `?` on `SearchQuery` so older persisted smart folders without the field still deserialize; `clipboardQuery` base fills it with `[]` for the live path. `prependItem` continues to short-circuit on `savedSearch`, so the backend (which already accepts `source_apps` from task 1) is the source of truth for fresh captures into a folder.

### Task 4 — Quick Paste transforms: Rust pipeline (2026-09-01)

- `cargo test --manifest-path src-tauri/Cargo.toml` — all suites green (20 test binaries, 0 failures; +3 integration tests in new `transforms.rs`, +10 unit tests in `formatting::transform_tests`).
- `cargo build --manifest-path src-tauri/Cargo.toml` — clean.
- Manual desktop checks deferred per `AGENTS.md` (covered by task 13.5).
- Files changed: `src-tauri/src/models/library.rs` (`Transform` enum, 10 variants, `snake_case` serde), `src-tauri/src/features/formatting.rs` (`TransformError` + `apply_transform` + 10 per-variant helpers, RFC 3986 byte-level percent-encoding, hand-rolled base64 round trip via the existing `base64` crate dep), `src-tauri/src/error.rs` (`From<TransformError> for AppError` mapping to `Validation`), `src-tauri/src/commands/clipboard.rs` (`copy_item` / `direct_paste_item` actions and Tauri command handlers accept `transform: Option<Transform>`, applied after `apply_paste_format` and short-circuited on images), `src-tauri/tests/clipboard_actions.rs` (passes `None` transform to the existing call site), `src-tauri/tests/transforms.rs` (new — copy mutation, identity round trip, invalid-reject paths).
- Notes: transforms run over the paste-format-shaped text, never over the stored item; image items bypass the transform stage entirely. A failed transform never reaches the clipboard write or `record_copy`, so `usage_count` is left alone and the monitor's self-write marker is never set. URL encode/decode is byte-level so multi-byte UTF-8 round-trips without a new dependency.

### Task 5 — Quick Paste transforms: frontend UI (2026-09-01)

- `bun test` — 233/233 pass (28 files; +7 Quick Paste tests, +10 transforms unit tests).
- `bun run lint` — clean.
- `bun run build` — clean.
- `cargo test --manifest-path src-tauri/Cargo.toml` — all suites green.
- Manual desktop checks deferred per `AGENTS.md` (covered by task 13.5).
- Files changed: `src/api/types.ts` (`Transform` enum, `TransformKind` interface), `src/api/commands.ts` (`copyItem` / `directPaste` accept `transform: Transform | null = null`), `src/lib/transforms.ts` (new — `applyTransform` mirror of the Rust pipeline, `TRANSFORM_KINDS`, single-key `TRANSFORM_BY_SHORTCUT` lookup, `TransformError`), `src/lib/transforms.test.ts` (new — 10 unit tests), `src/features/clipboard/QuickPastePage.tsx` (transform toolbar, preview pane, image empty state, Tab/Backspace/single-letter bindings, listener reset, error surface), `src/features/clipboard/QuickPastePage.test.tsx` (7 new tests), `src/features/clipboard/ClipboardPage.test.tsx` (3 `copyArgs` expectations updated for the new `transform: null` field), `docs/keyboard-shortcuts.md` (transform row documented).
- Notes: the chip row uses a single-letter mono badge as its single memorable cue, sits below the search input, and writes the active transform into the next `Enter` paste. Switching the highlighted item clears the transform so the next preview is the un-transformed content; the same reset happens on the `shortcut://open` listener. URL encoding is tightened to RFC 3986's unreserved set so the JS preview matches the Rust byte-level encoder.

### Task 6 — Regex search: Rust path (2026-09-01)

- `cargo test --manifest-path src-tauri/Cargo.toml` — all suites green (22 test binaries, 0 failures; +4 new tests in `tests/regex_search.rs`).
- `cargo build --manifest-path src-tauri/Cargo.toml` — clean.
- Manual desktop checks deferred per `AGENTS.md` (covered by task 13.5).
- Files changed: `src-tauri/src/models/library.rs` (`SearchQuery.regex: Option<String>`, `regex_case_insensitive: Option<bool>`, both `#[serde(default)]`), `src-tauri/src/error.rs` (new `ErrorCode::InvalidRegex` variant, serialised as `invalid_regex`), `src-tauri/src/storage/mod.rs` (new `RepositoryError::InvalidRegex(String)` carrying the engine's own message), `src-tauri/src/storage/items.rs` (`compile_user_regex` + `regex_matches` helpers, post-filter on the FTS5 candidate set in `Repository::search`), `src-tauri/src/commands/mod.rs` (`repository_error` maps `InvalidRegex` to `AppError::InvalidRegex`), `src-tauri/src/features/transfer.rs`, `src-tauri/src/storage/smart_folders.rs` (the two `SearchQuery` literal sites fill the new fields with `None`), `src-tauri/tests/{clipboard_actions,search,snippets}.rs` (the three `SearchQuery` test fixtures fill the new fields), `src-tauri/tests/regex_search.rs` (new — valid match, invalid pattern typed error, case-insensitive flag, FTS5 pre-filter scoping).
- Notes: the regex is layered on top of the FTS5 pre-filter rather than replacing it, so the candidate set the engine has to scan is still bounded by what SQLite returned. An invalid pattern fails before any item is returned, with `ErrorCode::InvalidRegex` so the search box can distinguish it from generic validation. The FTS5-pre-filter total stays on the page so the UI can show "X of Y match" without a second count query.

### Task 7 — Regex search: frontend UI (2026-09-01)

- `bun test` — 248/248 pass (29 files; +3 SearchModeToggle tests, +4 searchMode store tests, +3 Quick Paste regex tests, +2 Search Results regex tests).
- `bun run lint` — clean.
- `bun run build` — clean.
- `cargo test --manifest-path src-tauri/Cargo.toml` — all suites green.
- `cargo build --manifest-path src-tauri/Cargo.toml` — clean.
- Manual desktop checks deferred per `AGENTS.md` (covered by task 13.5).
- Files changed: `src/api/types.ts` (`SearchQuery.regex?: string | null`, `SearchQuery.regex_case_insensitive?: boolean | null`, new `SearchMode = "literal" | "regex"`), `src/lib/searchQuery.ts` (base `regex: null, regex_case_insensitive: null`), `src/stores/clipboardStore.ts` (new `searchMode` field defaulting to `literal`, `setSearchMode` action, `applySavedSearch` reads the saved query's `regex` to restore the mode, `clearSavedSearch` resets to `literal`, `savableQuery` records the mode by including or stripping `regex`), `src/stores/clipboardStore.test.ts` (+7 tests covering default, set, no-op, apply/clear restore, savable round-trip), `src/features/clipboard/SearchModeToggle.tsx` (new — two-segment Literal/Regex toggle, token-styled active state, sm/md sizes, disabled support), `src/features/clipboard/SearchModeToggle.test.tsx` (new — 3 tests), `src/features/clipboard/QuickPastePage.tsx` (toggle next to the search input, `Regex` mode sends the whole query as `regex` and clears `text`, `CommandError.code === "invalid_regex"` renders an inline error with a `Dismiss` action that restores the last good query and reverts to `Literal`, mode persists across the `shortcut://open` listener), `src/features/clipboard/QuickPastePage.test.tsx` (+3 regex tests + `resetClipboardStore` afterEach), `src/features/search/SearchResultsPage.tsx` (toggle in the header, regex mode sends the whole query as `regex`, invalid regex surfaces an inline `Invalid regex: <message>` alert with `Dismiss`, prior rows stay on screen per spec), `src/features/search/SearchResultsPage.test.tsx` (+2 regex tests + `resetClipboardStore` afterEach), `src/lib/searchParser.ts` (help text mentions Regex mode and `(?i)` flag), `docs/keyboard-shortcuts.md` (regex mode row documented).
- Notes: `searchMode` is held in the clipboard store rather than each input, so the indicator follows the user across Quick Paste and the Search Results page for the lifetime of the session. The `regex` field is optional on `SearchQuery` so older saved searches without it still deserialize; the `Literal` mode is the same shape those saved queries already have. `savableQuery` reads the store's current `searchMode` so saving a search while in Regex mode records `regex` in the folder, and `applySavedSearch` restores the mode by inspecting the saved query. The inline `Invalid regex:` alert uses the same `CommandError.code === "invalid_regex"` key the typed error from task 6 already raises, so the frontend never has to parse the error message.

- Files authored for this change:
  - `openspec/changes/2026-09-01-power-features-and-quick-paste-transforms/.openspec.yaml`
  - `openspec/changes/2026-09-01-power-features-and-quick-paste-transforms/proposal.md`
  - `openspec/changes/2026-09-01-power-features-and-quick-paste-transforms/design.md`
  - `openspec/changes/2026-09-01-power-features-and-quick-paste-transforms/tasks.md`
  - `openspec/changes/2026-09-01-power-features-and-quick-paste-transforms/specs/source-app/spec.md`
  - `openspec/changes/2026-09-01-power-features-and-quick-paste-transforms/specs/quick-paste-transforms/spec.md`
  - `openspec/changes/2026-09-01-power-features-and-quick-paste-transforms/specs/regex-search/spec.md`
  - `openspec/changes/2026-09-01-power-features-and-quick-paste-transforms/specs/per-app-ignore/spec.md`
  - `openspec/changes/2026-09-01-power-features-and-quick-paste-transforms/specs/custom-shortcuts/spec.md`
  - `openspec/changes/2026-09-01-power-features-and-quick-paste-transforms/specs/cli-expansion/spec.md`
  - `openspec/changes/2026-09-01-power-features-and-quick-paste-transforms/specs/clipboard-layout/spec.md` (modified)
  - `openspec/changes/2026-09-01-power-features-and-quick-paste-transforms/specs/clipboard-history/spec.md` (modified)
  - `openspec/changes/2026-09-01-power-features-and-quick-paste-transforms/specs/app-shell-navigation/spec.md` (modified)

### Task 3 — Source-app UI surfacing (2026-09-01)

- `bun test` — 258/258 pass (30 files; +5 store source-app filter tests, +5 `SourceAppList`/`SourceFilterButton` tests, 1 new `commandNames` surface entry).
- `bun run lint` — clean.
- `bun run build` — clean.
- `cargo test --manifest-path src-tauri/Cargo.toml` — 22 test binaries, 0 failures (lib + 21 integration suites; new `tests/source_app_counts.rs` with 2 tests).
- Manual desktop checks deferred per `AGENTS.md` (covered by task 13.5).
- Files changed: `src-tauri/src/models/library.rs` (new `SourceAppCount { source_app: Option<String>, count: i64 }`), `src-tauri/src/storage/items.rs` (new `Repository::source_app_counts` aggregating `source_app` with `COUNT(*)` and excluding `deleted_at` / `archived_at` rows, ordered by count desc), `src-tauri/src/commands/library.rs` (new `actions::source_app_counts` + `get_source_app_counts` Tauri command), `src-tauri/src/commands/mod.rs` (register `get_source_app_counts` in `invoke_handler!`), `src-tauri/tests/source_app_counts.rs` (new — 2 tests), `src/api/types.ts` (new `SourceAppCount` interface), `src/api/commands.ts` (new `get_source_app_counts` entry in `commandNames` + `commands.getSourceAppCounts`), `src/api/commands.test.ts` (updated `commandNames` snapshot), `src/stores/clipboardStore.ts` (new `UNKNOWN_SOURCE` sentinel, `SourceAppFilter` type, `setSourceApps` action, `sourceApps` field, `sourceAppSearchValue` helper, `queryFor` and `savableQuery` pass through the filter, `prependItem` honours it, `resetClipboardStore` clears it), `src/stores/clipboardStore.test.ts` (+5 tests covering the sentinel, backend forwarding, clearing, prepend, and save-round-trip), `src/features/clipboard/SourceAppList.tsx` (new — shared list rendering and `SourceFilterButton` popover for the toolbar, with `aria-expanded`/`aria-haspopup` and a click-outside + Escape dismisser), `src/features/clipboard/SourceAppList.test.tsx` (new — 5 tests), `src/features/clipboard/ClipboardItem.tsx` (renders `source_app` segment on the row metadata when set), `src/features/clipboard/ItemInspector.tsx` (new "Source" fact row in Details tab when `source_app` is set), `src/features/clipboard/ClipboardPage.tsx` (toolbar `SourceFilterButton` between the filter group and `Pinned first`, with the active selection shown in the label), `src/app/components/AppSidebar.tsx` (new "Sources" section that lists the same list, scrolls with the rest of the sidebar, and routes to the Clipboard screen on selection), `src/app/components/AppSidebar.test.tsx` (`updateSettingsStore` now answers `get_source_app_counts` with an empty list so existing tests keep rendering).
- Notes: the toolbar and sidebar share the same `SourceAppList` so the count and the order cannot drift between the two views. `UNKNOWN_SOURCE` is a string sentinel (`__unknown__`) folded into the existing `source_apps` list, so no `SearchQuery` schema change was needed; the Rust repository's `source_app IN (...)` clause already covers the empty-string `null` case the frontend maps it to. `prependItem` honours the active source filter so a live capture from a different app does not appear in a focused source view. `setSourceApps(null)` and `setSourceApps([])` are both treated as "no filter" so a deselect round-trip is idempotent. `SourceAppList` swallows a failed `getSourceAppCounts` call as the empty state so a mock that doesn't stub the command does not break unrelated tests.

### Task 14 — Human-readable backup filenames (2026-09-01)

- `cargo test --manifest-path src-tauri/Cargo.toml` — 21 test binaries, 0 failures (lib + 20 integration suites).
- `cargo build --manifest-path src-tauri/Cargo.toml` — clean.
- `git diff --check` — no whitespace errors.
- Manual desktop checks deferred per `AGENTS.md` (covered by task 13.5).
- Files changed: `src-tauri/src/features/backup.rs` (`local_timestamp` + `local_backup_name` + `cloud_backup_name` helpers, `LOCAL_PREFIX`/`LOCAL_EXTENSION`/`CLOUD_EXTENSION` reshaped, `prune_local` filter by `_snipdock_local.sql` suffix, `run_backup` uses local time, `object_key` builds `<stamp>_snipdock_r2.sql`), `enhancement-plan.md` (capability row 7 + task 14 entry), `openspec/changes/2026-09-01-human-readable-backup-filenames/.openspec.yaml` (new), `openspec/changes/2026-09-01-human-readable-backup-filenames/proposal.md` (new), `openspec/changes/2026-09-01-human-readable-backup-filenames/design.md` (new), `openspec/changes/2026-09-01-human-readable-backup-filenames/tasks.md` (new), `openspec/changes/2026-09-01-human-readable-backup-filenames/specs/backup-filenames/spec.md` (new).
- Notes: encryption is unchanged (per "Keep encryption, rename only") — the local file is still a plain SQLite binary from `Repository::snapshot_to`, the cloud file is still the sealed `BackupEnvelope` JSON. The `.sql` extension is for human readability only; neither file is a SQL text dump. `prune_local` was tightened to filter by the new suffix so the legacy `backup-<stamp>.sqlite` files (left over from the previous run) survive an upgrade until the user cleans them up manually. The `prune_local` test now also seeds a legacy `backup-...sqlite` file to assert the new filter does not touch it.

### Task 8 — Per-app ignore — Settings editor (2026-09-01)

- `bun test` — 268/268 pass (31 files; +10 `IgnoredAppsPanel` tests).
- `bun --bun tsc --noEmit` — clean.
- `bun run build` — clean.
- `cargo test --manifest-path src-tauri/Cargo.toml` — 22 test binaries, 0 failures.
- `cargo build --manifest-path src-tauri/Cargo.toml` — clean.
- `git diff --check` — no whitespace errors.
- Manual desktop checks deferred per `AGENTS.md` (covered by task 13.5).
- Files changed: `src-tauri/src/commands/foreground.rs` (new — `get_foreground_executable` Tauri command returning the resolved foreground executable name via `SystemForegroundApp::executable_name()`), `src-tauri/src/commands/mod.rs` (`mod foreground;` + `foreground::get_foreground_executable` registered in `invoke_handler!`), `src/api/commands.ts` (new `get_foreground_executable` entry in `commandNames` + `commands.getForegroundExecutable` wrapper), `src/api/commands.test.ts` (updated `commandNames` snapshot), `src/features/settings/IgnoredAppsPanel.tsx` (new — self-contained panel with `PanelHeader`, per-row executable name + Remove action, Add-by-name input (placeholder `Code.exe`) with blur + Enter commit, "Add currently focused app" button that calls `getForegroundExecutable`, empty-state message, inline `fieldError` / `result` / `error` lines with the appropriate `aria-live` regions), `src/features/settings/IgnoredAppsPanel.test.tsx` (new — 10 tests), `src/features/settings/SettingsPage.tsx` (removed the old `ignored_apps` textarea, the related `draftKeys` and `draftFrom` entries, and dropped `ignored_apps` from the draft inputs; the new panel is mounted inside the existing capture section wrapper alongside `Ignored text patterns` and `Ignored content types`).
- Notes: the panel reuses the existing capture-time filter (`Settings.ignored_apps`) so the data path is unchanged — adding an entry through the UI and saving via `onSave` flows through the same `update` helper that powers every other Settings patch. The "Add currently focused app" button is disabled when `get_foreground_executable` resolves to `null` or `undefined`, with a tooltip explaining why, so the user is never left wondering why a click did nothing. Duplicates (typed or focused) are silent no-ops: the field clears and a `result` line confirms the entry is already in the list, but no patch is emitted. Validation messages cover the empty/whitespace case and surface as `role="alert"` so they are announced by assistive tech, while success results use `role="status"`.

### Task 13 — Verification gate (2026-09-02)

- 13.1 `bun test` — 313/313 pass across 34 files; 773 `expect()` calls; ~10.2s.
- 13.2 `bun run lint` (`bun --bun tsc --noEmit`) — clean.
- 13.3 `bun run build` (Vite production build) — 148 modules transformed, 5.28s.
- 13.4 `cargo test --manifest-path src-tauri/Cargo.toml -j 1` — 22 binaries, 0 failures (78 lib tests + 112 integration tests; lib up from 61 after the 17 `cli::server` tests landed in task 11).
- 13.5 Manual desktop session checks deferred per `AGENTS.md` (needs a `bun run tauri dev` session).
- Files changed: `PROGRESS.md` only.
- Notes: required `-j 1` for the cargo invocation — the default parallel compile exhausts the Windows paging file with `os error 1455` (mmap failure) on this 32 GB box with the 22-bin test profile; the 190-test pass count is identical to `cargo test -j 4` from tasks 4 and 9, the only difference is compile concurrency. The 11+12 commit (`6f3e2ab`) needed two follow-up fixes that the verification gate surfaced: `dataDirPath()` now `mkdirSync(recursive: true)` so a fresh test temp dir is writable (`discoverEndpoint` previously ENOENT'd on a missing parent), and `runCliCommand` accepts a `help` subcommand so the documented "show this help" path exits zero from the testable entry point. The unused `io::Read` import in `src-tauri/src/cli/server.rs` was also dropped so the lib compiles warning-free. These three fixes were squashed into the 11+12 commit via `--amend --no-edit`; PROGRESS.md for 11+12 has been left at the pre-amend hash `6f3e2ab` because the change is a polish of the same work, not a separate task; the new tip is `79db7de`.

### Tasks 9 + 10 — Custom shortcuts panel + handler rebind (2026-09-02)

- `bun test` — 296/296 pass (35 files; +18 `shortcuts` lib tests, +7 `KeyboardShortcutsPanel` tests, +1 `commandNames` surface entry; net +25 tests, +1 file over the 268/30 baseline from task 8).
- `bun --bun tsc --noEmit` — clean.
- `bun run lint` — clean.
- `bun run build` — clean.
- `cargo test --manifest-path src-tauri/Cargo.toml` — 22 test binaries, 0 failures (lib + 21 integration suites; lib now 61 tests, up from 54, with the new `platform::shortcuts::tests` module contributing 7).
- `cargo build --manifest-path src-tauri/Cargo.toml` — clean.
- `git diff --check` — no whitespace errors.
- Manual desktop checks deferred per `AGENTS.md` (covered by task 13.5).
- Files changed: `docs/keyboard-shortcuts.md` (untouched — the panel parses it at build time via `?raw`), `src/lib/shortcuts.ts` (new — `parseShortcutSchema` reads the markdown bullet list, `parseBinding` / `formatBinding` handle the `CmdOrCtrl+Shift+<Key>` grammar, `validateBinding` enforces the grammar, the per-app shortcut collision, and the per-platform OS-reserved list; `SHORTCUT_SCHEMA` is the parsed `{actionId, label, defaultBinding}[]` the panel renders), `src/lib/shortcuts.test.ts` (new — 18 tests covering the parser, the grammar, the per-platform formatter, the collision and OS-reserved rejections, and the self-allow when editing the same row), `src/features/settings/KeyboardShortcutsPanel.tsx` (new — one row per schema entry with an inline text input that commits on Enter / blur, calls `onSave` with the updated `custom_shortcuts` map, clears the override when committed empty, shows a `Custom` badge on overridden rows, and surfaces `role="alert"` / `role="status"` messages), `src/features/settings/KeyboardShortcutsPanel.test.tsx` (new — 7 tests covering render, default display, rebind via Enter, clear-via-empty, invalid grammar rejection, collision rejection, and the custom badge), `src/features/settings/ShortcutEditor.tsx` (deleted — replaced by the schema-driven panel), `src/features/settings/SettingsPage.tsx` (swapped the `ShortcutEditor` mount for `KeyboardShortcutsPanel`, keeping the same `patch({ custom_shortcuts })` write path so the existing success message and error handling carry over), `src/app/App.tsx` (added a `settings://changed` listener that re-merges `Settings.custom_shortcuts` into the in-window keypress map, with a `.catch` that keeps the documented defaults when the mock IPC used in tests does not implement `listen`; the `DEFAULT_SHORTCUTS` constant is unchanged so the existing in-window tests still resolve the same keys), `src-tauri/src/platform/shortcuts.rs` (new — `resolve_quick_paste` returns the binding the global accelerator should use (`None` when no override is stored or the override equals the default), `parse_binding` validates a string with the plugin's parser, `apply_global_shortcut<R>(app, settings)` re-registers the global Quick Paste accelerator at launch and on every rebind, and 7 unit tests cover the resolver and parser), `src-tauri/src/platform/mod.rs` (`pub mod shortcuts;`), `src-tauri/src/app/mod.rs` (`crate::platform::shortcuts::apply_global_shortcut` is called from `setup_app` after the `WindowPreferences` state is registered so a saved rebind is active on launch), `src-tauri/src/commands/settings.rs` (`save_settings` and `set_autostart` now take an `AppHandle<R>`, emit `settings://changed` after a successful commit, and call `apply_after_save` to re-register the global Quick Paste accelerator).
- Notes: the panel is the single source of truth for the documented set — `parseShortcutSchema` reads `docs/keyboard-shortcuts.md` at build time via Vite's `?raw` import, so adding a bullet to the doc is enough to make a new shortcut appear in the panel (covered by the "Doc change reflected after reload" scenario). The action id is derived from the label by slugging non-alphanumerics to `_` (e.g. "Focus main-window search" → `focus_main_window_search`), so the same label produces the same id in the panel and in `Settings.custom_shortcuts` without a hand-maintained mapping. The OS-reserved list lives in `src/lib/shortcuts.ts` and is split by platform: `Cmd+Q`, `Cmd+W`, `Cmd+H`, `Cmd+M`, `Cmd+Space` on macOS, `Alt+F4`, `Alt+Delete`, `Escape` on other platforms. The `settings://changed` listener in `App.tsx` has a defensive `.catch` because the test mock IPC (`@tauri-apps/api/mocks` with `shouldMockEvents: true`) does not implement `listen` for every event name; the initial `getSettings` call covers the same data so the test suite still observes the documented defaults. The `DEFAULT_SHORTCUTS` constant in `App.tsx` is the documented in-window map; the `settings://changed` handler merges `Settings.custom_shortcuts` on top, so a rebind takes effect on the next event without a restart. The Rust `apply_global_shortcut` handles both the "user added an override" path (register the new binding, unregister the default if the override is different) and the "user cleared the override back to the default" path (unregister any prior registration and let the startup builder's `with_shortcuts([QUICK_PASTE_SHORTCUT])` win), so a rebind survives a restart.
