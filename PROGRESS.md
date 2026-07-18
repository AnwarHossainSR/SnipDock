# SnipDock Task Progress

States: `[ ]` pending, `[x]` completed and committed locally.

**Completed:** 27 / 48

- [x] Task 01 — Scaffold desktop application — 2026-07-17; checks: Bun test/build/lint pass, Cargo blocked (Rust/MSVC unavailable); files: Bun/root config, `src/`, `src-tauri/`, project docs
- [x] Task 02 — Establish visual system and application shell — 2026-07-17; checks: Bun shell test/build pass; files: `src/app/`, `src/components/`, `src/styles.css`, `src/styles/`
- [x] Task 03 — Add Rust application state and error boundary — 2026-07-17; checks: Cargo blocked (toolchain unavailable), static review/diff check pass; files: `src-tauri/Cargo.toml`, `src-tauri/src/{commands,error,lib,state}.rs`, `src-tauri/tests/application_boundary.rs`
- [x] Task 04 — Create core SQLite migration — 2026-07-17; checks: Cargo blocked (toolchain unavailable), Bun SQLite smoke/static review/diff/workflow checks pass; files: `.gitattributes`, `AGENTS.md`, `.agents/skills/snipdock-task/`, `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/migrations/`, `src-tauri/src/{db,lib,models}.rs`, `src-tauri/tests/migrations.rs`
- [x] Task 05 — Implement item repository CRUD — 2026-07-17; checks: Cargo blocked (toolchain unavailable), Bun SQLite smoke/static review/diff check pass; files: `src-tauri/Cargo.toml`, `src-tauri/src/{lib,models,repository}.rs`, `src-tauri/tests/repository.rs`
- [x] Task 06 — Add typed frontend IPC contracts — 2026-07-17; checks: Bun command/full tests and build pass; files: `src/lib/{commands,events,types}.ts`, `src/lib/commands.test.ts`, `src/test/setup.ts`
- [x] Task 07 — Build clipboard polling engine — 2026-07-17; checks: Cargo blocked (toolchain unavailable), official plugin API/static review/diff check pass; files: `src-tauri/Cargo.toml`, `src-tauri/src/{clipboard,lib}.rs`, `src-tauri/tests/clipboard_monitor.rs`
- [x] Task 08 — Apply clipboard capture policies — 2026-07-17; checks: Cargo blocked (toolchain unavailable), Bun SQLite smoke/native API/static review/diff check pass; files: `src-tauri/Cargo.toml`, `src-tauri/src/{clipboard,lib,os,repository}.rs`, `src-tauri/tests/clipboard_policy.rs`
- [x] Task 09 — Build clipboard history interface — 2026-07-17; checks: Bun clipboard/full tests and build pass; files: `src/features/clipboard/`, `src/app/{App,App.test}.tsx`, `src/styles.css`, `src/test/setup.ts`
- [x] Task 10 — Add clipboard item actions — 2026-07-17; checks: Bun clipboard/full tests, build, and SQLite smoke pass; Cargo blocked (toolchain unavailable); files: `src/features/clipboard/`, `src/components/ItemActions.tsx`, `src/lib/commands*`, `src/styles.css`, `src-tauri/src/{clipboard,commands,error,lib,models,repository,state}.rs`, `src-tauri/tests/clipboard_actions.rs`
- [x] Task 11 — Add undo, clear, and retention cleanup — 2026-07-17; checks: Bun clipboard/full tests, build, lint, SQLite smoke, and diff check pass; Cargo blocked (Rust toolchain unavailable), browser blocked (in-app browser unavailable); files: `src/features/clipboard/`, `src/components/ItemActions.tsx`, `src/styles.css`, `src-tauri/Cargo.toml`, `src-tauri/src/{commands,lib,repository}.rs`, `src-tauri/tests/trash.rs`
- [x] Task 12 — Implement snippet repository operations — 2026-07-17; checks: Bun full tests/build/lint, SQLite snippet lifecycle smoke, static review, and diff check pass; Cargo blocked (Rust toolchain unavailable); files: `src-tauri/src/{commands,repository}.rs`, `src-tauri/tests/{repository,snippets,trash}.rs`
- [x] Task 13 — Build snippet editor — 2026-07-17; checks: Bun focused/full tests (30 pass), build, lint, static review, and diff check pass; Cargo blocked (Rust toolchain unavailable), visual browser deferred until Task 14 mounts editor; files: `src/features/snippets/`, `src/lib/types.ts`, `src/styles.css`, `src/features/clipboard/ClipboardPage.test.tsx`, `src/lib/commands.test.ts`, `src-tauri/src/{models,repository}.rs`, `src-tauri/tests/repository.rs`
- [x] Task 14 — Build snippet library and quick actions — 2026-07-17; checks: Bun snippet tests (17 pass) and full suite (40 pass), `bun run build` pass; Cargo blocked (Rust toolchain unavailable), Tauri window deferred (toolchain unavailable) — editor focus verified by test; files: `src/features/snippets/{SnippetPage,SnippetDetail,SnippetEditor}.tsx`, `src/features/snippets/SnippetPage.test.tsx`, `src/components/{ItemActions,AppSidebar}.tsx`, `src/app/App.tsx`, `src/styles.css`, `src-tauri/src/{commands,repository}.rs`, `src-tauri/tests/snippets.rs`
- [x] Task 15 — Implement project repository operations — 2026-07-17; checks: `cargo test --test projects` (5 pass) and full `cargo test` (17 pass); enabled cargo by moving `serde_json` to `[dependencies]` (used by lib) and adding the default `icons/icon.png`; files: `src-tauri/Cargo.toml`, `src-tauri/icons/icon.png`, `src-tauri/src/{models,repository,commands}.rs`, `src-tauri/tests/projects.rs`
- [x] Task 16 — Build project organization interface — 2026-07-17; checks: `bun test src/features/library/ProjectsPanel.test.tsx` (6 pass), full `bun test` (46 pass), `bun run build`, `bun run lint` pass; Cargo not required, visual browser deferred (Tauri runtime/display unavailable) — interactions verified by tests; files: `src/features/library/{ProjectsPanel,ProjectEditor,ProjectsPanel.test}.tsx`, `src/app/App.tsx`, `src/lib/types.ts`
- [x] Task 17 — Implement categories and tags repository — 2026-07-17; checks: `cargo test --test organization` (5 pass) and full `cargo test` (22 pass); files: `src-tauri/src/{models,repository,commands}.rs`, `src-tauri/tests/organization.rs`
- [x] Task 18 — Build categories and tags interface — 2026-07-18; checks: `bun test src/features/library/TagsPanel.test.tsx` (7 pass), full `bun test` (53 pass), `bun run build`/lint pass; components ready for editor/nav integration in a later task; visual browser deferred (Tauri runtime/display unavailable); files: `src/features/library/{CategorySelect,TagsPanel,TagsPanel.test}.tsx`
- [x] Task 19 — Implement FTS search and filters — 2026-07-18; checks: `cargo test --manifest-path src-tauri/Cargo.toml --test search` (8 pass) and full `cargo test` (43 pass); files: `src-tauri/src/{repository,commands}.rs`, `src-tauri/tests/search.rs`
- [x] Task 20 — Build search and filter interface — 2026-07-18; checks: `bun test src/features/library/LibraryList.test.tsx` (6 pass), full `bun test` (59 pass), `bun run build`/lint pass; component ready for nav integration in a later task; visual browser deferred (Tauri runtime/display unavailable); files: `src/features/library/{SearchBar,FilterPanel,LibraryList,LibraryList.test}.tsx`, `src/features/library/useLibraryQuery.ts`
- [x] Task 21 — Add tray and window-state behavior — 2026-07-18; checks: `cargo test --manifest-path src-tauri/Cargo.toml` (46 pass), `bun run build`/full `bun test` (60 pass) pass; manual `bun run tauri dev` tray/window check deferred (no display in this environment); files: `src-tauri/Cargo.toml`, `src-tauri/src/{os,lib}.rs`, `src-tauri/tauri.conf.json`, `src/app/App.tsx`, `src/app/App.test.tsx`
- [x] Task 22 — Add global shortcuts and direct paste — 2026-07-18; checks: `cargo build` passes; `cargo test --manifest-path src-tauri/Cargo.toml --test shortcuts` not added (implementation only, per instruction to skip tests this pass); manual global shortcut smoke test deferred (no display in this environment); files: `src-tauri/Cargo.toml`, `src-tauri/src/{os,commands}.rs`, `src/lib/events.ts`
- [x] Task 23 — Implement settings storage and validation — 2026-07-18; checks: implementation only (tests deferred per instruction); files: `src-tauri/src/{models,repository,commands}.rs`
- [x] Task 24 — Build settings interface — 2026-07-18; checks: implementation only (tests deferred per instruction); files: `src/features/settings/SettingsPage.tsx`, `src/app/App.tsx`
- [x] Task 25 — Detect content types and languages — 2026-07-18; checks: implementation only (tests deferred per instruction); files: `src-tauri/src/{detection,clipboard,repository,lib}.rs`
- [x] Task 26 — Detect and classify sensitive content — 2026-07-18; checks: implementation only (tests deferred per instruction); files: `src-tauri/src/{detection,clipboard}.rs`
- [x] Task 27 — Add sensitive preview and copy guard — 2026-07-18; checks: implementation only (tests deferred per instruction); files: `src/features/snippets/{SensitivePreview,SnippetDetail}.tsx`
- [ ] Task 28 — Build safe code viewer
- [ ] Task 29 — Add JSON formatting and validation
- [ ] Task 30 — Add remaining code formatters
- [ ] Task 31 — Implement template parser and renderer
- [ ] Task 32 — Build template editing and fill flow
- [ ] Task 33 — Implement import and export formats
- [ ] Task 34 — Build import and export interface
- [ ] Task 35 — Implement atomic backup and restore
- [ ] Task 36 — Build backup and restore interface
- [ ] Task 37 — Add codec and conversion developer tools
- [ ] Task 38 — Add regex, cron, Markdown, and diff tools
- [ ] Task 39 — Build developer tools interface
- [ ] Task 40 — Add activity and usage recommendations
- [ ] Task 41 — Add reminders and expiration handling
- [ ] Task 42 — Encrypt private and sensitive records
- [ ] Task 43 — Add application lock, private mode, and auto-clear
- [ ] Task 44 — Add opt-in AI provider boundary
- [ ] Task 45 — Build AI action review interface
- [ ] Task 46 — Implement encrypted sync engine
- [ ] Task 47 — Build sync settings and conflict interface
- [ ] Task 48 — Complete release verification and documentation
