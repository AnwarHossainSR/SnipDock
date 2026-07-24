# Repository Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the nine validated review findings without reviving removed product areas or adding dependencies.

**Architecture:** Keep clipboard and search fixes at existing UI/backend boundaries. Remove unsupported settings from the serialized contract, bound the legacy JSON backup format, and keep stable releases as the single documented strategy. Reuse existing Bun and Rust test suites.

**Tech Stack:** React 19, TypeScript 7, Bun test, Tauri 2, Rust, SQLite/FTS5.

## Global Constraints

- Use Bun for frontend tooling.
- Add no dependencies.
- Keep Quick Paste direct-paste Windows-only; provide explicit copy/manual-paste fallback elsewhere.
- Preserve the stable `X.Y.Z` release workflow.
- Keep backup format `snipdock-backup-v2`; enforce a 128 MiB database limit.

---

### Task 1: Destructive confirmation and search pagination

**Files:**
- Modify: `src/features/clipboard/ClipboardPage.test.tsx`
- Modify: `src/features/clipboard/ClipboardPage.tsx`
- Modify: `src/features/search/SearchResultsPage.test.tsx`
- Modify: `src/features/search/SearchResultsPage.tsx`

**Interfaces:**
- Consumes: existing `commands.searchItems` and `commands.clearClipboardHistory`.
- Produces: accurate all-history warning and query-scoped pagination.

- [ ] Add a ClipboardPage test that activates Pinned, opens Clear History, and expects wording that says all clipboard history is removed without using the filtered count.
- [ ] Run `bun test src/features/clipboard/ClipboardPage.test.tsx`; expect the new wording assertion to fail.
- [ ] Replace the count-based dialog sentence with explicit all-history wording.
- [ ] Run the ClipboardPage test; expect PASS.
- [ ] Add a SearchResultsPage test that advances to offset 20, rerenders with a new query, and expects the first request for that query to use offset 0.
- [ ] Run `bun test src/features/search/SearchResultsPage.test.tsx`; expect offset 20 and failure.
- [ ] Track the query associated with pagination, use offset 0 immediately for a changed query, and retain effect cleanup so stale responses cannot win.
- [ ] Run the SearchResultsPage test; expect PASS.

### Task 2: Cross-platform Quick Paste fallback

**Files:**
- Create: `src/features/clipboard/QuickPastePage.test.tsx`
- Modify: `src/features/clipboard/QuickPastePage.tsx`
- Modify: `src/api/commands.test.ts`
- Modify: `src/api/commands.ts`
- Modify: `src-tauri/src/commands/clipboard.rs`
- Modify: `src-tauri/src/commands/mod.rs`

**Interfaces:**
- Produces: `direct_paste_supported() -> bool` and `commands.directPasteSupported(): Promise<boolean>`.
- Consumes: existing `copy_item`, `direct_paste`, and Quick Paste window hide API.

- [ ] Add command-surface and Quick Paste tests: unsupported platforms show manual-paste guidance, copy the selected item, and hide the window without calling `direct_paste`.
- [ ] Run those Bun tests; expect missing command/guidance failures.
- [ ] Add the capability command returning `cfg!(target_os = "windows")`, register it, expose it in TypeScript, and branch Quick Paste selection behavior.
- [ ] Run those Bun tests; expect PASS.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml clipboard_actions`; expect PASS.

### Task 3: Settings compatibility and contract cleanup

**Files:**
- Modify: `src-tauri/src/models/settings.rs`
- Modify: `src-tauri/src/storage/settings.rs`
- Modify: `src-tauri/tests/settings.rs`
- Modify: `src/api/types.ts`
- Modify: `src/features/settings/SettingsPage.test.tsx`

**Interfaces:**
- Produces: default-filled `Settings` deserialization containing only runtime-backed fields.

- [ ] Add a Rust test that loads stored settings missing current fields and expects defaults to fill them.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml --test settings`; expect deserialization failure.
- [ ] Add `#[serde(default)]` to `Settings`; remove unused fields and their validators from Rust and TypeScript.
- [ ] Run Rust settings tests and `bun test src/features/settings/SettingsPage.test.tsx`; expect PASS.

### Task 4: Bounded backups and developer search

**Files:**
- Modify: `src-tauri/src/features/transfer.rs`
- Modify: `src-tauri/tests/search.rs`
- Modify: `src-tauri/src/storage/items.rs`
- Modify: `docs/backup-restore.md`

**Interfaces:**
- Produces: 128 MiB maximum plaintext SQLite backup and punctuation-token-aware FTS prefix search.

- [ ] Add unit coverage for rejecting oversized backup/restore metadata before `fs::read`.
- [ ] Add search cases for `user_id`, `C++`, `.env`, `/api/v1`, `npm@latest`, and `foo.bar`.
- [ ] Run targeted Rust tests; expect search failures from concatenated terms.
- [ ] Split search input into alphanumeric token runs rather than deleting punctuation between runs.
- [ ] Check snapshot/input metadata against bounded constants before allocating.
- [ ] Document the limit and run targeted tests; expect PASS.

### Task 5: Product and release truth

**Files:**
- Create: `scripts/version.ts`
- Create: `scripts/version.test.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `site/index.html`
- Modify: `docs/privacy.md`
- Modify: `docs/release-checklist.md`
- Modify: `docs/keyboard-shortcuts.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: `bun run version X.Y.Z`, synchronizing package, Cargo, Tauri, Cargo.lock, and changelog versions.

- [ ] Add a Bun test using a temporary fixture and expect `updateVersionFiles` to synchronize all five files and reject prerelease input.
- [ ] Run `bun test scripts/version.test.ts`; expect missing implementation failure.
- [ ] Implement the minimal filesystem updater and package script.
- [ ] Run its test; expect PASS.
- [ ] Remove claims for Library, Templates, Tools, organization, and developer utilities; describe Quick Paste platform fallback.
- [ ] Align release docs/checklist to stable releases and fix `[Unreleased]`/`[0.1.6]` links.
- [ ] Run `bun test src/test/github-pages.test.ts scripts/version.test.ts`; expect PASS.

### Task 6: Full verification

**Files:**
- Review all changed files.

- [ ] Run `bun test`.
- [ ] Run `bun run lint`.
- [ ] Run `bun run build`.
- [ ] Run `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml --locked`.
- [ ] Run `git diff --check` and inspect `git diff --stat`.
