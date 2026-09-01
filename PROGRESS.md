# SnipDock Progress

## Active change

`openspec/changes/2026-09-01-power-features-and-quick-paste-transforms/`

| Task | Title | Status | Commit | Notes |
| ---- | ----- | ------ | ------ | ----- |
| 1 | Source-app capture data + capture path | completed | 6c0b6e6e29c523b1f385d396f7f449f19c751193 | `tasks.md` §1, committed 2026-09-01 |
| 2 | Source-app frontend types and store | completed | 472f843 | `tasks.md` §2, committed 2026-09-01 |
| 3 | Source-app UI surfacing | pending | — | `tasks.md` §3 |
| 4 | Quick Paste transforms — Rust pipeline | completed | cf69f72 | `tasks.md` §4, committed 2026-09-01 |
| 5 | Quick Paste transforms — frontend UI | completed | b36c976 | `tasks.md` §5, committed 2026-09-01 |
| 6 | Regex search — Rust path | completed | 05c4504 | `tasks.md` §6, committed 2026-09-01 |
| 7 | Regex search — frontend UI | completed | ff2c7cb | `tasks.md` §7, committed 2026-09-01 |
| 8 | Per-app ignore — Settings editor | pending | — | `tasks.md` §8 |
| 9 | Custom shortcuts — Settings panel | pending | — | `tasks.md` §9 |
| 10 | Custom shortcuts — handler rebind | pending | — | `tasks.md` §10 |
| 11 | CLI expansion — desktop HTTP endpoint | pending | — | `tasks.md` §11 |
| 12 | CLI expansion — CLI subcommands | pending | — | `tasks.md` §12 |
| 13 | Verification gate | pending | — | `tasks.md` §13 |
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

### Task 14 — Human-readable backup filenames (2026-09-01)

- `cargo test --manifest-path src-tauri/Cargo.toml` — 21 test binaries, 0 failures (lib + 20 integration suites).
- `cargo build --manifest-path src-tauri/Cargo.toml` — clean.
- `git diff --check` — no whitespace errors.
- Manual desktop checks deferred per `AGENTS.md` (covered by task 13.5).
- Files changed: `src-tauri/src/features/backup.rs` (`local_timestamp` + `local_backup_name` + `cloud_backup_name` helpers, `LOCAL_PREFIX`/`LOCAL_EXTENSION`/`CLOUD_EXTENSION` reshaped, `prune_local` filter by `_snipdock_local.sql` suffix, `run_backup` uses local time, `object_key` builds `<stamp>_snipdock_r2.sql`), `enhancement-plan.md` (capability row 7 + task 14 entry), `openspec/changes/2026-09-01-human-readable-backup-filenames/.openspec.yaml` (new), `openspec/changes/2026-09-01-human-readable-backup-filenames/proposal.md` (new), `openspec/changes/2026-09-01-human-readable-backup-filenames/design.md` (new), `openspec/changes/2026-09-01-human-readable-backup-filenames/tasks.md` (new), `openspec/changes/2026-09-01-human-readable-backup-filenames/specs/backup-filenames/spec.md` (new).
- Notes: encryption is unchanged (per "Keep encryption, rename only") — the local file is still a plain SQLite binary from `Repository::snapshot_to`, the cloud file is still the sealed `BackupEnvelope` JSON. The `.sql` extension is for human readability only; neither file is a SQL text dump. `prune_local` was tightened to filter by the new suffix so the legacy `backup-<stamp>.sqlite` files (left over from the previous run) survive an upgrade until the user cleans them up manually. The `prune_local` test now also seeds a legacy `backup-...sqlite` file to assert the new filter does not touch it.