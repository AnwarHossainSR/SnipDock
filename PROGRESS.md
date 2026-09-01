# SnipDock Progress

## Active change

`openspec/changes/2026-09-01-power-features-and-quick-paste-transforms/`

| Task | Title | Status | Commit | Notes |
| ---- | ----- | ------ | ------ | ----- |
| 1 | Source-app capture data + capture path | completed | 6c0b6e6e29c523b1f385d396f7f449f19c751193 | `tasks.md` §1, committed 2026-09-01 |
| 2 | Source-app frontend types and store | pending | — | `tasks.md` §2 |
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