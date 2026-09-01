# SnipDock Progress

## Active change

`openspec/changes/2026-09-01-power-features-and-quick-paste-transforms/`

| Task | Title | Status | Commit | Notes |
| ---- | ----- | ------ | ------ | ----- |
| 1 | Source-app capture data + capture path | completed | 6c0b6e6e29c523b1f385d396f7f449f19c751193 | `tasks.md` §1, committed 2026-09-01 |
| 2 | Source-app frontend types and store | completed | 472f843 | `tasks.md` §2, committed 2026-09-01 |
| 3 | Source-app UI surfacing | pending | — | `tasks.md` §3 |
| 4 | Quick Paste transforms — Rust pipeline | pending | — | `tasks.md` §4 |
| 5 | Quick Paste transforms — frontend UI | pending | — | `tasks.md` §5 |
| 6 | Regex search — Rust path | pending | — | `tasks.md` §6 |
| 7 | Regex search — frontend UI | pending | — | `tasks.md` §7 |
| 8 | Per-app ignore — Settings editor | pending | — | `tasks.md` §8 |
| 9 | Custom shortcuts — Settings panel | pending | — | `tasks.md` §9 |
| 10 | Custom shortcuts — handler rebind | pending | — | `tasks.md` §10 |
| 11 | CLI expansion — desktop HTTP endpoint | pending | — | `tasks.md` §11 |
| 12 | CLI expansion — CLI subcommands | pending | — | `tasks.md` §12 |
| 13 | Verification gate | pending | — | `tasks.md` §13 |

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