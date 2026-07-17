# SnipDock Enhancement Implementation Plan

> **For task workers:** REQUIRED SKILL: Use project-local `$snipdock-task` through `/task N`. Implement one task, update `PROGRESS.md`, verify, and stop for user review. Never stage or commit.

**Goal:** Build a Windows-first, offline desktop clipboard and snippet manager that safely captures text, organizes reusable content, provides developer utilities, and can later add opt-in AI and encrypted synchronization.

**Architecture:** Use a Tauri 2 desktop shell with a React/TypeScript single-page UI and a Rust application core. Rust owns clipboard monitoring, SQLite access, secret handling, backups, file import/export, and OS integration; the UI reaches it only through typed Tauri commands and events. Deliver the product in independently testable releases so the core clipboard/snippet workflow ships before advanced tools, security hardening, AI, or cloud sync.

**Tech Stack:** Tauri 2, stable Rust/MSVC, React, TypeScript, Vite, npm, SQLite with FTS5, `serde`, `sqlx`, Vitest, Testing Library, Cargo tests, and Playwright.

## Global Constraints

- Windows 10/11 is the first supported production target; preserve Tauri-compatible seams for macOS and Linux.
- Store primary data in SQLite and keep all data offline by default.
- Never send clipboard, snippet, project, tag, secret, or usage data over a network unless the user explicitly enables a later network feature.
- Encrypt sensitive snippet values and use the operating-system credential manager for encryption keys.
- Treat clipboard text as untrusted input: never execute it, interpolate it into a shell, or render it as unsanitized HTML.
- Poll and persist text clipboard content only in Release 1; non-text capture remains ignored until explicitly implemented.
- Keep optional AI and encrypted cloud synchronization out of the core runtime and disabled by default.
- Every database migration is forward-only, transactional, and covered by a migration test.
- Every non-trivial behavior begins with one failing automated test; each task finishes with all relevant checks green.
- Use existing platform/plugin capability before custom native code. Add no state framework, ORM, component kit, or formatter dependency until native APIs and current dependencies demonstrably fall short.
- Never run `git add` or `git commit`; user owns review and commits. Commit snippets in detailed epic reference are superseded and must not be executed.

---

## 1. Scope and Delivery Decisions

The supplied feature list contains several independent products. One giant release would make clipboard reliability, secret safety, and UI quality hard to verify. This plan keeps one roadmap file while dividing implementation into four releasable increments.

### Release 1 — Core local product

Clipboard text capture/history, snippets, projects, categories, tags, search/filter/sort, quick actions, undo delete, settings, keyboard navigation, global shortcut, system tray, themes, startup, local JSON backup/restore, duplicate detection, usage counters, and basic deterministic secret exclusion/masking.

### Release 2 — Developer productivity

Language/content detection, syntax display, format/minify/validate actions, reusable templates, import/export formats, developer tools, reminders/expiry, notifications, and richer project activity.

### Release 3 — Security hardening

Encrypted sensitive snippets, private mode, application lock/PIN, credential-manager integration, clipboard auto-clear, backup encryption, and platform-gated biometric authentication.

### Release 4 — Optional extensions

Provider-neutral opt-in AI actions and optional end-to-end encrypted cloud synchronization. These remain separate because they introduce network access, credentials, cost, privacy consent, and conflict resolution.

## 2. Repository Map

Create or modify only these responsibility-oriented areas. Do not add one file per CRUD action.

```text
.
├── README.md                              # setup, commands, privacy model, release scope
├── package.json                           # frontend scripts and dependencies
├── vite.config.ts                         # Vite/Vitest configuration
├── playwright.config.ts                   # desktop-webview smoke tests
├── src/
│   ├── app/App.tsx                        # route-free application shell
│   ├── app/App.test.tsx                   # shell integration tests
│   ├── components/                        # reusable view-only controls
│   ├── features/
│   │   ├── clipboard/                     # clipboard list, actions, undo UI
│   │   ├── snippets/                      # snippet editor/list/detail
│   │   ├── library/                       # search, filters, projects, tags, categories
│   │   ├── templates/                     # placeholder editor and fill flow
│   │   ├── tools/                         # deterministic developer tools
│   │   ├── settings/                      # settings, shortcuts, security, backup
│   │   └── activity/                      # recent/most-used/reminder views
│   ├── lib/commands.ts                    # typed wrappers around Tauri invoke calls
│   ├── lib/events.ts                      # typed event subscriptions
│   ├── lib/types.ts                       # frontend DTOs mirroring Rust contracts
│   ├── lib/formatters.ts                  # UI-only date/count formatting
│   ├── styles/tokens.css                  # theme/accessibility variables
│   └── test/setup.ts                      # DOM and Tauri mocks
├── e2e/core-flow.spec.ts                  # release-level user flow
└── src-tauri/
    ├── Cargo.toml                         # Rust/plugin dependencies
    ├── tauri.conf.json                    # bundle/window/tray configuration
    ├── capabilities/default.json          # least-privilege plugin permissions
    ├── migrations/                        # numbered SQLite migrations
    ├── src/
    │   ├── main.rs                        # generated desktop entry; delegates to lib::run
    │   ├── lib.rs                         # app startup and plugin registration
    │   ├── error.rs                       # serializable application errors
    │   ├── state.rs                       # shared database/settings state
    │   ├── commands.rs                    # thin Tauri command boundary
    │   ├── db.rs                          # connection and migration setup
    │   ├── models.rs                      # domain records and command DTOs
    │   ├── repository.rs                  # SQLite queries and transactions
    │   ├── clipboard.rs                   # monitor, dedupe, ignore, auto-clear
    │   ├── detection.rs                   # content/language/secret detection
    │   ├── formatting.rs                  # deterministic format/validate operations
    │   ├── templates.rs                   # placeholder parser and renderer
    │   ├── tools.rs                       # deterministic developer tool operations
    │   ├── transfer.rs                    # import/export/backup/restore
    │   ├── security.rs                    # encryption, lock, credential store
    │   ├── os.rs                          # tray, shortcuts, startup, notifications
    │   ├── ai.rs                          # Release 4 provider boundary only
    │   └── sync.rs                        # Release 4 encrypted sync boundary only
    └── tests/                             # Rust integration tests by responsibility
```

## 3. Stable Domain and Command Contracts

Define these contracts once in `src-tauri/src/models.rs`, mirror them in `src/lib/types.ts`, and keep command names unchanged across tasks.

```rust
pub type Id = String;

pub enum ItemKind { Clipboard, Snippet, Command, Template, Note }
pub enum ContentType { PlainText, Code, Json, Sql, Html, Css, Xml, Shell, Markdown, Config }
pub enum SortOrder { Newest, Oldest, MostUsed }

pub struct LibraryItem {
    pub id: Id,
    pub kind: ItemKind,
    pub title: Option<String>,
    pub description: Option<String>,
    pub content: String,
    pub notes: Option<String>,
    pub content_type: ContentType,
    pub language: Option<String>,
    pub project_id: Option<Id>,
    pub category_id: Option<Id>,
    pub pinned: bool,
    pub favorite: bool,
    pub archived_at: Option<String>,
    pub expires_at: Option<String>,
    pub usage_count: i64,
    pub last_used_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub struct SearchQuery {
    pub text: Option<String>,
    pub kinds: Vec<ItemKind>,
    pub content_types: Vec<ContentType>,
    pub languages: Vec<String>,
    pub project_ids: Vec<Id>,
    pub category_ids: Vec<Id>,
    pub tag_ids: Vec<Id>,
    pub pinned: Option<bool>,
    pub favorite: Option<bool>,
    pub created_from: Option<String>,
    pub created_to: Option<String>,
    pub sort: SortOrder,
    pub limit: u32,
    pub offset: u32,
}

pub struct Page<T> { pub items: Vec<T>, pub total: i64, pub limit: u32, pub offset: u32 }
pub struct Project { pub id: Id, pub name: String, pub description: Option<String>, pub archived_at: Option<String>, pub created_at: String, pub updated_at: String }
pub struct Tag { pub id: Id, pub name: String, pub color: String, pub usage_count: i64 }
pub struct Category { pub id: Id, pub name: String, pub built_in: bool }

pub struct SaveItemInput {
    pub id: Option<Id>, pub kind: ItemKind, pub title: Option<String>,
    pub description: Option<String>, pub content: String, pub notes: Option<String>,
    pub project_id: Option<Id>, pub category_id: Option<Id>, pub tag_ids: Vec<Id>,
    pub private: bool, pub expires_at: Option<String>,
}
pub struct ItemFlags { pub pinned: Option<bool>, pub favorite: Option<bool>, pub archived: Option<bool> }
pub enum CopyMode { Raw, Formatted, RenderedTemplate }
pub struct CopyReceipt { pub item_id: Id, pub copied_at: String, pub auto_clear_at: Option<String> }
pub struct DeleteReceipt { pub id: Id, pub item_count: i64, pub expires_at: String }
pub struct SaveProjectInput { pub id: Option<Id>, pub name: String, pub description: Option<String>, pub tag_ids: Vec<Id> }
pub struct SaveTagInput { pub id: Option<Id>, pub name: String, pub color: String }
pub struct SaveCategoryInput { pub id: Option<Id>, pub name: String }

pub struct Settings {
    pub clipboard_tracking: bool, pub history_days: u32, pub max_items: u32,
    pub ignored_apps: Vec<String>, pub ignored_patterns: Vec<String>,
    pub ignored_content_types: Vec<ContentType>, pub auto_delete_days: Option<u32>,
    pub open_shortcut: String, pub new_snippet_shortcut: String,
    pub theme: String, pub start_with_os: bool, pub minimize_to_tray: bool,
    pub always_on_top: bool, pub compact_mode: bool, pub notifications: bool,
    pub formatter_indent: u8, pub backup_interval_hours: u32,
    pub backup_retention: u32, pub auto_clear_secret_seconds: Option<u32>,
    pub lock_after_minutes: Option<u32>,
}
pub struct SettingsPatch { pub values: std::collections::HashMap<String, serde_json::Value> }

pub enum FormatOperation { Pretty, Minify, Validate }
pub struct FormatRequest { pub content: String, pub content_type: ContentType, pub operation: FormatOperation }
pub struct Diagnostic { pub message: String, pub line: Option<u32>, pub column: Option<u32> }
pub struct FormatResult { pub output: String, pub valid: bool, pub diagnostics: Vec<Diagnostic> }
pub struct RenderTemplateRequest { pub template: String, pub values: std::collections::HashMap<String, String> }
pub struct RenderTemplateResult { pub output: Option<String>, pub missing: Vec<String>, pub diagnostics: Vec<Diagnostic> }
pub struct ToolRequest { pub tool: String, pub input: serde_json::Value }
pub struct ToolResult { pub output: serde_json::Value, pub warnings: Vec<String> }

pub struct ExportRequest { pub format: String, pub item_ids: Vec<Id>, pub project_ids: Vec<Id>, pub path: String }
pub struct ExportReceipt { pub path: String, pub item_count: i64, pub warnings: Vec<String> }
pub struct ImportRequest { pub paths: Vec<String>, pub duplicate_policy: String, pub dry_run: bool }
pub struct ImportReport { pub created: i64, pub updated: i64, pub skipped: i64, pub warnings: Vec<String> }
pub struct BackupRequest { pub path: String, pub encrypted: bool }
pub struct BackupReceipt { pub path: String, pub checksum: String, pub created_at: String }
pub struct RestoreRequest { pub path: String, pub passphrase: Option<String>, pub dry_run: bool }
pub struct RestoreReport { pub schema_version: u32, pub item_count: i64, pub warnings: Vec<String> }
pub struct UnlockRequest { pub pin: Option<String>, pub use_biometric: bool }
pub struct UnlockResult { pub unlocked: bool, pub retry_after_seconds: Option<u32> }
```

Required command surface:

```text
search_items(query: SearchQuery) -> Page<LibraryItem>
get_item(id: Id) -> LibraryItem
save_item(input: SaveItemInput) -> LibraryItem
duplicate_item(id: Id) -> LibraryItem
set_item_flags(id: Id, flags: ItemFlags) -> LibraryItem
move_item(id: Id, project_id: Option<Id>) -> LibraryItem
delete_item(id: Id) -> DeleteReceipt
restore_item(receipt_id: Id) -> LibraryItem
clear_clipboard_history() -> DeleteReceipt
copy_item(id: Id, mode: CopyMode) -> CopyReceipt
list_projects(include_archived: bool) -> Vec<Project>
save_project(input: SaveProjectInput) -> Project
list_tags() -> Vec<Tag>
save_tag(input: SaveTagInput) -> Tag
merge_tags(source_id: Id, target_id: Id) -> Tag
list_categories() -> Vec<Category>
save_category(input: SaveCategoryInput) -> Category
get_settings() -> Settings
save_settings(input: SettingsPatch) -> Settings
format_content(input: FormatRequest) -> FormatResult
render_template(input: RenderTemplateRequest) -> RenderTemplateResult
run_tool(input: ToolRequest) -> ToolResult
export_data(input: ExportRequest) -> ExportReceipt
import_data(input: ImportRequest) -> ImportReport
create_backup(input: BackupRequest) -> BackupReceipt
restore_backup(input: RestoreRequest) -> RestoreReport
lock_app() -> ()
unlock_app(input: UnlockRequest) -> UnlockResult
```

## 4. Executable Small-Task Plan

Run one section with `/task N`. Detailed epics below remain design reference; they are not executable task numbers. Never commit from task workflow.

### Task 1: Scaffold desktop application

**Depends:** None  
**UI:** no  
**Files:** `package.json`, `package-lock.json`, `vite.config.ts`, `src/`, `src-tauri/`, `README.md`  
**Work:** Scaffold Tauri 2 with React, TypeScript, Vite, npm, Vitest, and Testing Library. Add `dev`, `build`, `test`, `lint`, and `tauri` scripts. Keep app offline and grant no network permission.  
**Checks:** `npm test -- --run`; `npm run build`; `cargo test --manifest-path src-tauri/Cargo.toml`

### Task 2: Establish visual system and application shell

**Depends:** 1  
**UI:** yes  
**Files:** `src/styles/tokens.css`, `src/app/App.tsx`, `src/app/App.test.tsx`, `src/components/AppSidebar.tsx`, `src/components/TopBar.tsx`  
**Work:** Build accessible desktop shell with compact sidebar, top search area, content panel, responsive resizing, system/light/dark tokens, visible focus, loading/empty/error primitives. No feature logic.  
**Checks:** `npm test -- --run src/app/App.test.tsx`; `npm run build`

### Task 3: Add Rust application state and error boundary

**Depends:** 1  
**UI:** no  
**Files:** `src-tauri/src/lib.rs`, `src-tauri/src/state.rs`, `src-tauri/src/error.rs`, `src-tauri/src/commands.rs`  
**Work:** Add shared application state, serializable error codes/messages, thin command registration, and startup failure reporting. Do not add database behavior.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml`

### Task 4: Create core SQLite migration

**Depends:** 3  
**UI:** no  
**Files:** `src-tauri/migrations/0001_core.sql`, `src-tauri/src/db.rs`, `src-tauri/src/models.rs`, `src-tauri/tests/migrations.rs`  
**Work:** Add core tables, foreign keys, indexes, FTS5 table/triggers, settings/activity/trash tables, and all built-in category seeds. Migration must be transactional and safe on second startup.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test migrations`

### Task 5: Implement item repository CRUD

**Depends:** 4  
**UI:** no  
**Files:** `src-tauri/src/repository.rs`, `src-tauri/src/models.rs`, `src-tauri/tests/repository.rs`  
**Work:** Implement create/read/update, validation, soft delete, restore receipt, archive flags, timestamps, content hashes, and paginated newest-first listing for library items.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test repository`

### Task 6: Add typed frontend IPC contracts

**Depends:** 3, 5  
**UI:** no  
**Files:** `src/lib/types.ts`, `src/lib/commands.ts`, `src/lib/events.ts`, `src/test/setup.ts`, `src/lib/commands.test.ts`  
**Work:** Mirror Rust DTOs, wrap every existing Tauri command, normalize errors, and mock invoke/events in tests. No feature components.  
**Checks:** `npm test -- --run src/lib/commands.test.ts`; `npm run build`

### Task 7: Build clipboard polling engine

**Depends:** 3, 5  
**UI:** no  
**Files:** `src-tauri/src/clipboard.rs`, `src-tauri/src/lib.rs`, `src-tauri/tests/clipboard_monitor.rs`  
**Work:** Poll text clipboard on a cancellable background task, emit changed text, suppress self-written values, support pause/resume, preserve whitespace, and avoid holding database locks during OS calls.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test clipboard_monitor`

### Task 8: Apply clipboard capture policies

**Depends:** 7  
**UI:** no  
**Files:** `src-tauri/src/clipboard.rs`, `src-tauri/src/repository.rs`, `src-tauri/src/os.rs`, `src-tauri/tests/clipboard_policy.rs`  
**Work:** Persist eligible text; ignore empty, consecutive duplicates, configured apps/patterns/types; enforce maximum count/history duration; detect foreground executable where supported. Secret policy comes later.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test clipboard_policy`

### Task 9: Build clipboard history interface

**Depends:** 2, 6, 8  
**UI:** yes  
**Files:** `src/features/clipboard/ClipboardPage.tsx`, `src/features/clipboard/ClipboardItem.tsx`, `src/features/clipboard/ClipboardPage.test.tsx`, `src/app/App.tsx`  
**Work:** Show newest-first history, preview content safely, empty/loading/error states, selected row, pause status, and keyboard navigation. No destructive actions.  
**Checks:** `npm test -- --run src/features/clipboard/ClipboardPage.test.tsx`; `npm run build`

### Task 10: Add clipboard item actions

**Depends:** 9  
**UI:** yes  
**Files:** `src/features/clipboard/ClipboardItem.tsx`, `src/components/ItemActions.tsx`, `src-tauri/src/commands.rs`, `src-tauri/tests/clipboard_actions.rs`  
**Work:** Add one-click copy, pin, favorite, delete, pause/resume, and accessible keyboard/action-menu behavior. Copy increments usage and does not recapture itself.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test clipboard_actions`; `npm test -- --run src/features/clipboard`

### Task 11: Add undo, clear, and retention cleanup

**Depends:** 10  
**UI:** yes  
**Files:** `src/features/clipboard/UndoToast.tsx`, `src/features/clipboard/ClipboardPage.tsx`, `src-tauri/src/repository.rs`, `src-tauri/tests/trash.rs`  
**Work:** Add 30-second undo receipts, clear-history confirmation, bulk restore, startup/daily retention cleanup, and accurate item counts.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test trash`; `npm test -- --run src/features/clipboard`

### Task 12: Implement snippet repository operations

**Depends:** 5  
**UI:** no  
**Files:** `src-tauri/src/repository.rs`, `src-tauri/src/commands.rs`, `src-tauri/tests/snippets.rs`  
**Work:** Add snippet/command/note create, edit, duplicate, pin, favorite, archive, usage tracking, notes, titles, descriptions, expiry, and validation at Rust boundary.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test snippets`

### Task 13: Build snippet editor

**Depends:** 2, 6, 12  
**UI:** yes  
**Files:** `src/features/snippets/SnippetEditor.tsx`, `src/features/snippets/SnippetEditor.test.tsx`  
**Work:** Build create/edit form with kind, title, description, content, notes, validation, unsaved-change guard, Save/Cancel, and full keyboard access. Use plain text/code textarea, not rich text.  
**Checks:** `npm test -- --run src/features/snippets/SnippetEditor.test.tsx`; `npm run build`

### Task 14: Build snippet library and quick actions

**Depends:** 10, 13  
**UI:** yes  
**Files:** `src/features/snippets/SnippetPage.tsx`, `src/features/snippets/SnippetDetail.tsx`, `src/components/ItemActions.tsx`, `src/features/snippets/SnippetPage.test.tsx`, `src/app/App.tsx`  
**Work:** Add snippet list/detail, create/edit/duplicate/pin/favorite/archive/delete/copy actions, recent-use display, and internal editor opening.  
**Checks:** `npm test -- --run src/features/snippets`; `npm run build`

### Task 15: Implement project repository operations

**Depends:** 5, 12  
**UI:** no  
**Files:** `src-tauri/src/repository.rs`, `src-tauri/src/commands.rs`, `src-tauri/tests/projects.rs`  
**Work:** Add project create/edit/archive/list, descriptions, item assignment/move, project activity, and project-scoped commands/configuration items.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test projects`

### Task 16: Build project organization interface

**Depends:** 2, 6, 15  
**UI:** yes  
**Files:** `src/features/library/ProjectsPanel.tsx`, `src/features/library/ProjectEditor.tsx`, `src/features/library/ProjectsPanel.test.tsx`, `src/app/App.tsx`  
**Work:** Add project navigation, create/edit/archive forms, descriptions, recent activity, move-item flow, and compact empty states.  
**Checks:** `npm test -- --run src/features/library/ProjectsPanel.test.tsx`; `npm run build`

### Task 17: Implement categories and tags repository

**Depends:** 4, 5  
**UI:** no  
**Files:** `src-tauri/src/repository.rs`, `src-tauri/src/commands.rs`, `src-tauri/tests/organization.rs`  
**Work:** Add built-in/custom categories, tag create/rename/color, item/project assignment, most-used tags, and transaction-safe duplicate-tag merge. Treat labels as tags.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test organization`

### Task 18: Build categories and tags interface

**Depends:** 6, 14, 16, 17  
**UI:** yes  
**Files:** `src/features/library/CategorySelect.tsx`, `src/features/library/TagsPanel.tsx`, `src/features/library/TagsPanel.test.tsx`  
**Work:** Add category selector, multi-tag picker, tag creation/rename/merge, native color input, usage display, and assignment from item/project screens.  
**Checks:** `npm test -- --run src/features/library/TagsPanel.test.tsx`; `npm run build`

### Task 19: Implement FTS search and filters

**Depends:** 5, 15, 17  
**UI:** no  
**Files:** `src-tauri/src/repository.rs`, `src-tauri/src/commands.rs`, `src-tauri/tests/search.rs`  
**Work:** Add parameterized title/content/tag/category search; language/project/category/tag/flag/date/type filters; newest/oldest/most-used sorting; paging and archived/deleted exclusion.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test search`

### Task 20: Build search and filter interface

**Depends:** 2, 6, 18, 19  
**UI:** yes  
**Files:** `src/features/library/SearchBar.tsx`, `src/features/library/FilterPanel.tsx`, `src/features/library/LibraryList.tsx`, `src/features/library/useLibraryQuery.ts`, `src/features/library/LibraryList.test.tsx`  
**Work:** Add 100 ms debounced search, stale-result suppression, filters/sort, active-filter chips, paging, `/` focus, keyboard selection, and responsive compact layout.  
**Checks:** `npm test -- --run src/features/library/LibraryList.test.tsx`; `npm run build`

### Task 21: Add tray and window-state behavior

**Depends:** 2, 3  
**UI:** yes  
**Files:** `src-tauri/src/os.rs`, `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src/app/App.tsx`  
**Work:** Add system tray show/hide/quit, minimize-to-tray, close-to-tray setting hook, single-instance focus, saved size/position, monitor-safe restore, compact mode, always-on-top, and startup hooks.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml`; `npm run build`; manual `npm run tauri dev` tray/window check

### Task 22: Add global shortcuts and direct paste

**Depends:** 10, 20, 21  
**UI:** no  
**Files:** `src-tauri/src/os.rs`, `src-tauri/src/commands.rs`, `src/lib/events.ts`, `src-tauri/tests/shortcuts.rs`  
**Work:** Add open, search, copy, pin, delete, new snippet, favorites, navigation, and direct-paste shortcuts. Direct paste must restore prior app and never bypass protected-content confirmation.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test shortcuts`; manual global shortcut smoke test

### Task 23: Implement settings storage and validation

**Depends:** 4, 8, 21, 22  
**UI:** no  
**Files:** `src-tauri/src/models.rs`, `src-tauri/src/repository.rs`, `src-tauri/src/commands.rs`, `src-tauri/tests/settings.rs`  
**Work:** Add typed defaults/patches for clipboard duration/limit, ignored apps/content, auto-delete, shortcuts, theme, startup, security, backup, formatters, and notifications. Validate ranges, regex, and shortcut conflicts.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test settings`

### Task 24: Build settings interface

**Depends:** 2, 6, 23  
**UI:** yes  
**Files:** `src/features/settings/SettingsPage.tsx`, `src/features/settings/SettingsPage.test.tsx`, `src/app/App.tsx`  
**Work:** Build grouped settings with native controls, inline validation/status, reset-to-default per group, theme preview, shortcut capture, and no-save-loss navigation.  
**Checks:** `npm test -- --run src/features/settings/SettingsPage.test.tsx`; `npm run build`

### Task 25: Detect content types and languages

**Depends:** 5, 8  
**UI:** no  
**Files:** `src-tauri/src/detection.rs`, `src-tauri/src/clipboard.rs`, `src-tauri/tests/content_detection.rs`  
**Work:** Deterministically detect JSON, JS/TS, SQL, HTML, CSS, XML, shell, Markdown, config, and plain text. Store detected type/language while preserving raw content.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test content_detection`

### Task 26: Detect and classify sensitive content

**Depends:** 25  
**UI:** no  
**Files:** `src-tauri/src/detection.rs`, `src-tauri/src/clipboard.rs`, `src-tauri/tests/secret_detection.rs`  
**Work:** Detect API keys, tokens, password assignments, private keys, emails, and database URLs. Exclude high-risk content by default, return masked spans, and never log secret values.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test secret_detection`; scan test output for canary secrets

### Task 27: Add sensitive preview and copy guard

**Depends:** 14, 26  
**UI:** yes  
**Files:** `src/features/snippets/SensitivePreview.tsx`, `src/features/snippets/SensitivePreview.test.tsx`, `src/features/snippets/SnippetDetail.tsx`  
**Work:** Mask findings in previews, name finding types, require explicit raw-copy confirmation, disable unsafe formatted copy, and ensure masked values never replace stored raw content.  
**Checks:** `npm test -- --run src/features/snippets/SensitivePreview.test.tsx`; `npm run build`

### Task 28: Build safe code viewer

**Depends:** 14, 25  
**UI:** yes  
**Files:** `src/features/snippets/CodeView.tsx`, `src/features/snippets/CodeView.test.tsx`, `src/styles/tokens.css`  
**Work:** Add syntax-highlighted text-node rendering, language badge, optional line numbers, indentation preservation, selection/copy, wrapping toggle, and accessible light/dark code colors. Never use unsanitized HTML.  
**Checks:** `npm test -- --run src/features/snippets/CodeView.test.tsx`; `npm run build`

### Task 29: Add JSON formatting and validation

**Depends:** 25  
**UI:** yes  
**Files:** `src-tauri/src/formatting.rs`, `src-tauri/src/commands.rs`, `src-tauri/tests/json_formatting.rs`, `src/features/snippets/FormatActions.tsx`  
**Work:** Add JSON validate, pretty, and minify via `serde_json`; return line/column diagnostics; preview raw versus formatted; save only on explicit user action.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test json_formatting`; `npm test -- --run src/features/snippets`

### Task 30: Add remaining code formatters

**Depends:** 29  
**UI:** yes  
**Files:** `src-tauri/src/formatting.rs`, `src-tauri/tests/code_formatting.rs`, `src/features/snippets/FormatActions.tsx`  
**Work:** Add JS/TS, SQL, HTML/CSS, and XML formatting using smallest audited dependencies that pass fixtures. Preserve input on error and support raw/formatted copy.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test code_formatting`; `npm test -- --run src/features/snippets`

### Task 31: Implement template parser and renderer

**Depends:** 12  
**UI:** no  
**Files:** `src-tauri/src/templates.rs`, `src-tauri/src/commands.rs`, `src-tauri/tests/templates.rs`  
**Work:** Parse `{{name}}`, escaped delimiters, repeated placeholders, and built-ins `date`, `time`, `uuid`; return missing/invalid diagnostics; never evaluate expressions or code.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test templates`

### Task 32: Build template editing and fill flow

**Depends:** 13, 27, 31  
**UI:** yes  
**Files:** `src/features/templates/TemplateEditor.tsx`, `src/features/templates/TemplateFillDialog.tsx`, `src/features/templates/TemplatePreview.tsx`, `src/features/templates/TemplateFillDialog.test.tsx`, `src/app/App.tsx`  
**Work:** Add create-from-clipboard, placeholder editing, value form, live preview, missing-value state, confirmed copy, and optional save-as-snippet. Never persist entered secret values automatically.  
**Checks:** `npm test -- --run src/features/templates`; `npm run build`

### Task 33: Implement import and export formats

**Depends:** 12, 15, 17  
**UI:** no  
**Files:** `src-tauri/src/transfer.rs`, `src-tauri/src/commands.rs`, `src-tauri/tests/transfer_formats.rs`  
**Work:** Add lossless versioned JSON, Markdown front matter, plain text, project collection export, and JSON/Markdown/code/shell imports with dry-run and skip/keep/replace duplicate policies.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test transfer_formats`

### Task 34: Build import and export interface

**Depends:** 6, 24, 33  
**UI:** yes  
**Files:** `src/features/settings/TransferPanel.tsx`, `src/features/settings/TransferPanel.test.tsx`, `src-tauri/capabilities/default.json`  
**Work:** Add scoped file dialogs, format/destination selection, dry-run preview, conflicts/warnings/counts, progress, and explicit replace confirmation.  
**Checks:** `npm test -- --run src/features/settings/TransferPanel.test.tsx`; `npm run build`

### Task 35: Implement atomic backup and restore

**Depends:** 4, 33  
**UI:** no  
**Files:** `src-tauri/src/transfer.rs`, `src-tauri/src/commands.rs`, `src-tauri/tests/backup_restore.rs`  
**Work:** Add consistent SQLite snapshot, manifest/checksum, temporary write/fsync/rename, rolling retention, restore validation, DB swap, migration, and rollback on failure.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test backup_restore`

### Task 36: Build backup and restore interface

**Depends:** 24, 35  
**UI:** yes  
**Files:** `src/features/settings/BackupPanel.tsx`, `src/features/settings/BackupPanel.test.tsx`  
**Work:** Add manual backup, schedule/retention settings, backup list/status, restore dry-run, manifest warnings, destructive confirmation, and result summary.  
**Checks:** `npm test -- --run src/features/settings/BackupPanel.test.tsx`; `npm run build`

### Task 37: Add codec and conversion developer tools

**Depends:** 6, 29  
**UI:** no  
**Files:** `src-tauri/src/tools.rs`, `src-tauri/src/commands.rs`, `src-tauri/tests/tools_codec.rs`  
**Work:** Add Base64, URL, JWT decode-without-verification, UUID, named hashes, Unix time, text case, environment formatting, and reuse JSON/SQL formatters. Return structured results/warnings.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test tools_codec`

### Task 38: Add regex, cron, Markdown, and diff tools

**Depends:** 37  
**UI:** no  
**Files:** `src-tauri/src/tools.rs`, `src-tauri/tests/tools_advanced.rs`  
**Work:** Add bounded regex tester, cron explanation/helper, sanitized Markdown preview output, and size-limited text diff. Never execute replacement code or raw HTML.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test tools_advanced`

### Task 39: Build developer tools interface

**Depends:** 2, 6, 37, 38  
**UI:** yes  
**Files:** `src/features/tools/ToolsPage.tsx`, `src/features/tools/ToolForm.tsx`, `src/features/tools/ToolsPage.test.tsx`, `src/app/App.tsx`  
**Work:** Build searchable tool list and one shared input/output form with Copy and Create Snippet actions, clear warnings, responsive split view, and keyboard navigation.  
**Checks:** `npm test -- --run src/features/tools`; `npm run build`

### Task 40: Add activity and usage recommendations

**Depends:** 12, 15, 19  
**UI:** yes  
**Files:** `src-tauri/src/repository.rs`, `src-tauri/tests/activity.rs`, `src/features/activity/ActivityPage.tsx`, `src/features/activity/Recommendations.tsx`, `src/features/activity/ActivityPage.test.tsx`  
**Work:** Track copies/uses/project events, expose recent/most-used lists, rank five deterministic 30-day suggestions, and add confirmed exact-duplicate snippet merge.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test activity`; `npm test -- --run src/features/activity`

### Task 41: Add reminders and expiration handling

**Depends:** 21, 23, 40  
**UI:** yes  
**Files:** `src-tauri/src/os.rs`, `src-tauri/src/repository.rs`, `src-tauri/tests/reminders.rs`, `src/features/activity/ReminderEditor.tsx`, `src/features/activity/ReminderEditor.test.tsx`  
**Work:** Add reminder/expiry fields, fake-clock scheduler, native/in-app notification, fire-once behavior, startup/minute sweep, and default archive-on-expiry.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test reminders`; `npm test -- --run src/features/activity/ReminderEditor.test.tsx`

### Task 42: Encrypt private and sensitive records

**Depends:** 26, 35  
**UI:** no  
**Files:** `src-tauri/migrations/0002_security.sql`, `src-tauri/src/security.rs`, `src-tauri/src/repository.rs`, `src-tauri/tests/encryption.rs`  
**Work:** Generate master key, store via OS credential manager, use audited AEAD with per-record nonce/version, encrypt private/sensitive fields and protected backups, reject tampering, and keep plaintext out of logs/database.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test encryption`; canary plaintext scan of test database/backup

### Task 43: Add application lock, private mode, and auto-clear

**Depends:** 24, 27, 42  
**UI:** yes  
**Files:** `src-tauri/src/security.rs`, `src-tauri/src/clipboard.rs`, `src-tauri/tests/security.rs`, `src/features/settings/SecurityPanel.tsx`, `src/features/snippets/PrivateSnippetDialog.tsx`, `src/features/settings/SecurityPanel.test.tsx`  
**Work:** Add PIN/KDF, retry backoff, idle/manual lock, cache redaction, private-mode exclusions, safe hash-checked clipboard auto-clear, and platform-gated biometric option.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test security`; `npm test -- --run src/features/settings/SecurityPanel.test.tsx`

### Task 44: Add opt-in AI provider boundary

**Depends:** 27, 42  
**UI:** no  
**Files:** `src-tauri/src/ai.rs`, `src-tauri/src/commands.rs`, `src-tauri/tests/ai.rs`  
**Work:** Add disabled-by-default provider interface, credential-store API key, previewable/redacted requests, timeout/cancel, fake provider, no body logging, and actions from requirements. Private items are refused.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test ai` with zero live network calls

### Task 45: Build AI action review interface

**Depends:** 24, 28, 44  
**UI:** yes  
**Files:** `src/features/settings/AiSettings.tsx`, `src/features/snippets/AiActions.tsx`, `src/features/snippets/AiActions.test.tsx`  
**Work:** Add provider consent/settings, outbound-content preview, action menu, cancel/error state, result diff, Copy/Save controls, and command safety warning. Never execute or auto-save responses.  
**Checks:** `npm test -- --run src/features/snippets/AiActions.test.tsx`; `npm run build`

### Task 46: Implement encrypted sync engine

**Depends:** 42  
**UI:** no  
**Files:** `src-tauri/migrations/0003_sync.sql`, `src-tauri/src/sync.rs`, `src-tauri/src/commands.rs`, `src-tauri/tests/sync.rs`  
**Work:** Add separate sync key, ciphertext envelopes, device/revision/tombstone model, manual sync, offline queue, retry/backoff, revoke, corrupt-remote rejection, and explicit conflict records.  
**Checks:** `cargo test --manifest-path src-tauri/Cargo.toml --test sync`; disabled-state network check

### Task 47: Build sync settings and conflict interface

**Depends:** 24, 46  
**UI:** yes  
**Files:** `src/features/settings/SyncSettings.tsx`, `src/features/settings/SyncSettings.test.tsx`  
**Work:** Add opt-in setup, manual sync/status, device list/revoke, offline/error states, and conflict resolution: local, remote, or keep both. Never silently overwrite divergent content.  
**Checks:** `npm test -- --run src/features/settings/SyncSettings.test.tsx`; `npm run build`

### Task 48: Complete release verification and documentation

**Depends:** 11, 14, 18, 20, 24, 27, 30, 32, 36, 39, 41, 43; optional 45 and 47 only when shipping Release 4  
**UI:** yes  
**Files:** `e2e/core-flow.spec.ts`, `playwright.config.ts`, `README.md`, `docs/privacy.md`, `docs/backup-restore.md`, `docs/keyboard-shortcuts.md`, `docs/release-checklist.md`  
**Work:** Add full core-flow E2E, keyboard/accessibility pass, privacy canaries, recovery tests, packaging checklist, exact supported-platform claims, user documentation, and final visual consistency pass.  
**Checks:** `npm test -- --run`; `cargo test --manifest-path src-tauri/Cargo.toml`; `npm run build`; `npm run test:e2e`; `npm run tauri build`

## 5. Detailed Epic Reference

Reference only. Executable scope comes from Tasks 1–48 above. Ignore every historical commit step in this section.

### Epic 1: Scaffold and quality gates

**Files:**
- Create: `package.json`, `vite.config.ts`, `playwright.config.ts`, `src/main.tsx`, `src/app/App.tsx`, `src/test/setup.ts`
- Create: `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/src/lib.rs`
- Modify: `README.md`
- Test: `src/app/App.test.tsx`, `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: one Tauri window named `main`; npm scripts `dev`, `build`, `test`, `test:e2e`, `lint`, `tauri`; Rust `run()` entry point.

- [ ] **Step 1: Scaffold Tauri React/TypeScript into the repository root**

Run: `npm create tauri-app@latest . -- --template react-ts --manager npm --tauri-version 2 --force`

Expected: frontend files and `src-tauri/` exist; existing `.git` remains intact.

- [ ] **Step 2: Add only test and lint dependencies needed by this plan**

Run: `npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @playwright/test eslint typescript-eslint`

Expected: `package-lock.json` updated; no state-management or UI-kit package added.

- [ ] **Step 3: Write failing shell tests**

```tsx
it("renders the SnipDock shell without network-dependent content", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "SnipDock" })).toBeVisible();
  expect(screen.getByRole("navigation", { name: "Primary" })).toBeVisible();
});
```

Run: `npm test -- --run src/app/App.test.tsx`

Expected: FAIL before shell markup exists.

- [ ] **Step 4: Implement the smallest accessible shell and scripts**

Use semantic `header`, `nav`, `main`, and visible focus styles. Register no network plugin or HTTP permission.

- [ ] **Step 5: Verify foundation**

Run: `npm test -- --run && npm run build && cargo test --manifest-path src-tauri/Cargo.toml`

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add README.md package.json package-lock.json vite.config.ts playwright.config.ts src src-tauri
git commit -m "chore: scaffold SnipDock desktop app"
```

### Epic 2: SQLite schema, migrations, and repository core

**Files:**
- Create: `src-tauri/migrations/0001_core.sql`
- Create: `src-tauri/src/error.rs`, `src-tauri/src/db.rs`, `src-tauri/src/models.rs`, `src-tauri/src/repository.rs`, `src-tauri/src/state.rs`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`
- Test: `src-tauri/tests/migrations.rs`, `src-tauri/tests/repository.rs`

**Interfaces:**
- Produces: domain records from Section 3; `Database::open(path)`, `Repository::save_item`, `Repository::search_items`, soft-delete/restore transactions.

- [ ] **Step 1: Write migration tests**

Test fresh migration, second idempotent startup, foreign keys, seeded categories, FTS triggers, and unique normalized tag names.

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test migrations`

Expected: FAIL because migration and `Database` do not exist.

- [ ] **Step 2: Create normalized schema**

```sql
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('clipboard','snippet','command','template','note')),
  title TEXT, description TEXT, content BLOB NOT NULL, notes TEXT,
  content_type TEXT NOT NULL DEFAULT 'plain_text', language TEXT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  content_hash TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0,
  favorite INTEGER NOT NULL DEFAULT 0, private INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT, deleted_at TEXT, expires_at TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0, last_used_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, built_in INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, color TEXT NOT NULL, usage_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE item_tags (item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(item_id, tag_id));
CREATE TABLE project_tags (project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(project_id, tag_id));
CREATE TABLE trash_receipts (id TEXT PRIMARY KEY, operation TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE trash_items (receipt_id TEXT NOT NULL REFERENCES trash_receipts(id) ON DELETE CASCADE, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE, PRIMARY KEY(receipt_id, item_id));
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE activity (id TEXT PRIMARY KEY, item_id TEXT REFERENCES items(id) ON DELETE SET NULL, project_id TEXT REFERENCES projects(id) ON DELETE SET NULL, action TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE VIRTUAL TABLE items_fts USING fts5(item_id UNINDEXED, title, description, content, notes, tokenize='unicode61');
```

Also seed the 21 supplied built-in categories exactly as named; custom categories use `built_in = 0`.

- [ ] **Step 3: Implement transaction-safe repository methods**

Keep SQL in `repository.rs`. Store timestamps as UTC RFC 3339 strings, UUIDs as lowercase hyphenated strings, and hashes as SHA-256 hex. Enforce default page size 50 and maximum 200.

- [ ] **Step 4: Verify schema and CRUD**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test migrations --test repository`

Expected: PASS; temporary databases removed by test teardown.

- [ ] **Step 5: Commit**

```bash
git add src-tauri
git commit -m "feat: add local SQLite domain store"
```

### Epic 3: Clipboard capture, ignore rules, limits, and undo

**Files:**
- Create: `src-tauri/src/clipboard.rs`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/src/commands.rs`, `src-tauri/src/repository.rs`, `src-tauri/src/models.rs`
- Create: `src/features/clipboard/ClipboardPage.tsx`, `src/features/clipboard/ClipboardItem.tsx`, `src/features/clipboard/UndoToast.tsx`
- Modify: `src/lib/commands.ts`, `src/lib/events.ts`, `src/lib/types.ts`, `src/app/App.tsx`
- Test: `src-tauri/tests/clipboard.rs`, `src/features/clipboard/ClipboardPage.test.tsx`

**Interfaces:**
- Consumes: `Repository`, `Settings`, `LibraryItem`.
- Produces: `ClipboardMonitor::start`, `pause`, `resume`; event `clipboard://captured`; delete receipt valid for 30 seconds.

- [ ] **Step 1: Write failing Rust cases**

Cover capture of changed text, suppression of consecutive duplicates, tracking pause, empty text, ignored regex, secret exclusion, history limit pruning, and self-copy suppression.

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test clipboard`

Expected: FAIL because monitor policy does not exist.

- [ ] **Step 2: Implement monitor policy**

Poll every 500 ms on a background task. Normalize only line endings for hashing; preserve original whitespace and indentation for storage. Never hold database locks while reading clipboard APIs. Ignore non-text content in Release 1. Keep a configurable poll interval internally for deterministic tests, not as a user setting.

- [ ] **Step 3: Implement source-app ignore boundary**

Resolve foreground executable name in `os.rs`; compare case-insensitively with configured names. If the platform cannot identify the source app, capture using all other policies and record no source name.

- [ ] **Step 4: Write and implement clipboard UI tests**

Test newest-first list, one-click copy, delete, clear confirmation, 30-second undo, pause/resume status, empty state, and keyboard selection.

Run: `npm test -- --run src/features/clipboard/ClipboardPage.test.tsx`

Expected: PASS after UI uses only typed command wrappers.

- [ ] **Step 5: Verify capture loop manually**

Run: `npm run tauri dev`

Expected: copying two distinct text values creates two rows; copying from SnipDock does not create a new row; pause blocks capture; undo restores deleted content.

- [ ] **Step 6: Commit**

```bash
git add src src-tauri
git commit -m "feat: capture and manage clipboard history"
```

### Epic 4: Snippets, commands, notes, flags, and quick actions

**Files:**
- Create: `src/features/snippets/SnippetPage.tsx`, `SnippetEditor.tsx`, `SnippetDetail.tsx`, `src/components/ItemActions.tsx`
- Modify: `src-tauri/src/commands.rs`, `src-tauri/src/repository.rs`, `src/lib/commands.ts`, `src/lib/types.ts`, `src/app/App.tsx`
- Test: `src-tauri/tests/items.rs`, `src/features/snippets/SnippetPage.test.tsx`

**Interfaces:**
- Produces: save/edit/duplicate/pin/favorite/archive/move/tag/copy actions from Section 3; required title for snippets/templates, optional description and notes.

- [ ] **Step 1: Write failing item lifecycle tests**

Test create, edit without resetting `created_at`, duplicate with new ID and `Copy of ` title prefix, independent flags, archive exclusion, recent-use update, and usage counter increment on copy.

- [ ] **Step 2: Implement minimal repository and commands**

Use one `save_item` upsert command and one `set_item_flags` command. Validate title length 1–200, description 0–1,000, content 1–1,000,000 bytes, and notes 0–10,000 at the Rust boundary.

- [ ] **Step 3: Write failing editor and quick-action tests**

Test accessible labels, validation messages, unsaved-change confirmation, edit, duplicate, pin, favorite, archive, delete, move, add tags, raw copy, and editor-open event.

- [ ] **Step 4: Implement snippet screens**

Use native form controls and one shared `ItemActions` menu. Do not add rich-text editing; content remains plain text/code.

- [ ] **Step 5: Verify**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test items && npm test -- --run src/features/snippets`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src src-tauri
git commit -m "feat: add reusable snippet workflows"
```

### Epic 5: Projects, categories, tags, and labels

**Files:**
- Create: `src/features/library/ProjectsPanel.tsx`, `ProjectEditor.tsx`, `TagsPanel.tsx`, `CategorySelect.tsx`
- Modify: `src-tauri/src/models.rs`, `repository.rs`, `commands.rs`, `src/lib/commands.ts`, `src/lib/types.ts`
- Test: `src-tauri/tests/organization.rs`, `src/features/library/ProjectsPanel.test.tsx`, `TagsPanel.test.tsx`

**Interfaces:**
- Produces: project CRUD/archive/activity, project tags, move item, custom category CRUD, tag CRUD/rename/merge/color, most-used tags.

- [ ] **Step 1: Write failing organization tests**

Cover multiple projects, descriptions, environment URLs/deployment/database/configuration content stored as normal project-assigned items, move behavior, archive visibility, category seeds, custom categories, case-insensitive duplicate tags, merge reassignment, colors, labels represented as tags, and usage counts.

- [ ] **Step 2: Implement repository transactions**

Merge tags in one transaction: reassign non-conflicting `item_tags`/`project_tags`, discard duplicate joins, delete source tag, recalculate target usage count.

- [ ] **Step 3: Write and implement panel tests**

Test create/edit/archive projects, assign/move items, create/rename/merge tags, native color input, category select, and recent project activity.

- [ ] **Step 4: Verify**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test organization && npm test -- --run src/features/library`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src src-tauri
git commit -m "feat: organize content with projects and tags"
```

### Epic 6: Instant search, filters, sorting, and navigation

**Files:**
- Create: `src/features/library/SearchBar.tsx`, `FilterPanel.tsx`, `LibraryList.tsx`, `useLibraryQuery.ts`
- Modify: `src-tauri/src/repository.rs`, `src-tauri/src/commands.rs`, `src/app/App.tsx`, `src/lib/commands.ts`
- Test: `src-tauri/tests/search.rs`, `src/features/library/LibraryList.test.tsx`

**Interfaces:**
- Consumes: `SearchQuery` and FTS5 index.
- Produces: debounced 100 ms query UI, paginated results, stable keyboard selection.

- [ ] **Step 1: Write failing search tests**

Cover title/content/tag/category matching, phrase escaping, language/project/category/tag filters, pinned/favorite/date/content-type filters, newest/oldest/most-used sort, deleted/archive exclusion, empty query, Unicode, and 200-row cap.

- [ ] **Step 2: Implement parameterized FTS and filters**

Never concatenate user search text into SQL. Escape FTS operators or bind a quoted token query. Add compound indexes proven by `EXPLAIN QUERY PLAN` for project/date/flags.

- [ ] **Step 3: Implement searchable library UI**

Use `AbortController`-style sequence IDs to discard stale results. Support ArrowUp/ArrowDown, Enter to copy, Delete with confirmation/undo, and `/` to focus search when not editing.

- [ ] **Step 4: Verify latency and correctness**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test search && npm test -- --run src/features/library/LibraryList.test.tsx`

Expected: PASS; a seeded 10,000-item search completes under 100 ms on the development machine, recorded as informational test output rather than a flaky hard CI assertion.

- [ ] **Step 5: Commit**

```bash
git add src src-tauri
git commit -m "feat: add instant library search and filters"
```

### Epic 7: Settings, desktop shell, shortcuts, tray, and themes

**Files:**
- Create: `src-tauri/src/os.rs`, `src/features/settings/SettingsPage.tsx`, `src/styles/tokens.css`
- Modify: `src-tauri/src/lib.rs`, `commands.rs`, `models.rs`, `tauri.conf.json`, `capabilities/default.json`, `src/app/App.tsx`
- Test: `src-tauri/tests/settings.rs`, `src/features/settings/SettingsPage.test.tsx`, `e2e/core-flow.spec.ts`

**Interfaces:**
- Produces: settings for history duration/limit, ignored apps/content patterns/types, auto-delete, shortcuts, theme, startup, security, backup, formatter, notifications; events `shortcut://open`, `shortcut://search`, `shortcut://new-snippet`, `shortcut://paste-selected`.

- [ ] **Step 1: Write failing setting validation tests**

Test defaults, patch semantics, max items 10–100,000, duration 1–3,650 days, valid regex rejection, shortcut conflict rejection, theme enum, and startup toggle failure reporting.

- [ ] **Step 2: Register official desktop plugins**

Use Tauri global-shortcut, autostart, notification, window-state, single-instance, and tray APIs. Grant only required capabilities. Default open shortcut: `CmdOrCtrl+Shift+Space`; default new snippet: `CmdOrCtrl+Shift+N`.

- [ ] **Step 3: Implement window behavior**

Close hides to tray when enabled; explicit Quit exits. Support minimize-to-tray, compact size, always-on-top, resizable panels, saved size/position, system/light/dark themes, multiple-monitor-safe position restoration, and offline notifications.

- [ ] **Step 4: Implement direct-paste shortcut safely**

The shortcut copies the selected item, hides SnipDock, restores the previously focused application, then emits the platform paste chord. Disable it for masked/private content until copy confirmation succeeds. Keep ordinary Enter behavior as copy-only so selection never pastes unexpectedly.

- [ ] **Step 5: Implement settings UI and keyboard coverage**

Use native checkboxes/selects/range inputs where adequate. All shortcuts must be reachable through visible controls; no keyboard trap; minimum 4.5:1 normal-text contrast.

- [ ] **Step 6: Verify desktop flow**

Run: `npm test -- --run src/features/settings && npm run tauri dev`

Expected: settings persist across restart; global shortcut reveals/focuses app; tray show/hide/quit work; invalid shortcut produces actionable error.

- [ ] **Step 7: Commit**

```bash
git add src src-tauri e2e
git commit -m "feat: integrate SnipDock with desktop workflows"
```

### Epic 8: Deterministic detection and sensitive-data guardrails

**Files:**
- Create: `src-tauri/src/detection.rs`, `src/features/snippets/SensitivePreview.tsx`
- Modify: `src-tauri/src/clipboard.rs`, `models.rs`, `commands.rs`, `src/features/snippets/SnippetDetail.tsx`
- Test: `src-tauri/tests/detection.rs`, `src/features/snippets/SensitivePreview.test.tsx`

**Interfaces:**
- Produces: `DetectionResult { content_type, language, secret_findings }`; masked preview; copy confirmation requirement.

- [ ] **Step 1: Write table-driven detection tests**

Include positive and negative fixtures for JSON, JS/TS, SQL, HTML, CSS, XML, shell commands, `.env`/YAML/TOML/INI config, AWS-style keys, bearer tokens, JWTs, password assignments, PEM private keys, emails, and database URLs. Assert finding spans never expose secret values in logs/errors.

- [ ] **Step 2: Implement deterministic heuristics**

Detection order: secret scan, strict JSON parse, markup signatures, SQL keywords, shell command prefixes, config structure, language heuristics, plain text fallback. Return confidence only internally; UI uses explicit type names, not misleading percentages.

- [ ] **Step 3: Apply clipboard security policy before persistence**

Default: exclude private keys, access tokens, password assignments, and connection strings; mask API keys, JWTs, and emails in previews; user can alter patterns/settings with a warning. Hashing for duplicate checks occurs in memory before discarded secret content is dropped.

- [ ] **Step 4: Add confirmed secret copy**

Raw copy of a secret requires a modal naming finding types. Formatted copy stays disabled for masked content. Never place masked text into stored `content`.

- [ ] **Step 5: Verify**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test detection && npm test -- --run src/features/snippets/SensitivePreview.test.tsx`

Expected: PASS; test logs contain no fixture secrets.

- [ ] **Step 6: Commit**

```bash
git add src src-tauri
git commit -m "feat: detect content and protect sensitive clipboard data"
```

### Epic 9: Code display, formatting, and raw/formatted copy

**Files:**
- Create: `src-tauri/src/formatting.rs`, `src/features/snippets/CodeView.tsx`, `FormatActions.tsx`
- Modify: `src-tauri/src/commands.rs`, `models.rs`, `src/features/snippets/SnippetDetail.tsx`
- Test: `src-tauri/tests/formatting.rs`, `src/features/snippets/CodeView.test.tsx`

**Interfaces:**
- Produces: `format_content(FormatRequest) -> FormatResult { output, valid, diagnostics }`; raw content remains immutable unless user saves formatted result.

- [ ] **Step 1: Write formatter contract tests**

Cover JSON pretty/minify/invalid diagnostics; JS/TS, SQL, HTML/CSS, XML preservation; line numbers; tabs/spaces setting; and no mutation on error.

- [ ] **Step 2: Implement JSON using Rust serialization first**

Use `serde_json` for JSON validation, pretty-print, and compact output. Add formatter libraries only for languages whose correctness cannot be achieved with existing dependencies; pin and audit each addition during this task.

- [ ] **Step 3: Implement safe code display**

Render highlighted tokens as text nodes, never `innerHTML`. Show optional line numbers with CSS counters. Preserve indentation and allow raw/formatted copy separately.

- [ ] **Step 4: Verify**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test formatting && npm test -- --run src/features/snippets/CodeView.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src src-tauri
git commit -m "feat: format and display developer content"
```

### Epic 10: Reusable templates

**Files:**
- Create: `src-tauri/src/templates.rs`, `src/features/templates/TemplateEditor.tsx`, `TemplateFillDialog.tsx`, `TemplatePreview.tsx`
- Modify: `src-tauri/src/commands.rs`, `models.rs`, `repository.rs`, `src/app/App.tsx`
- Test: `src-tauri/tests/templates.rs`, `src/features/templates/TemplateFillDialog.test.tsx`

**Interfaces:**
- Produces: placeholder syntax `{{name}}`; escaped literal `\{{`; built-in variables `date`, `time`, `uuid`; preview and copy only after all required values exist.

- [ ] **Step 1: Write parser/render tests**

Test named placeholders, repeated values, whitespace-trimmed names, escaped delimiters, invalid/unclosed placeholders, built-in variables, missing-value diagnostics, and preservation of indentation.

- [ ] **Step 2: Implement one-pass parser and renderer**

No expression language and no code execution. Dynamic variables are only named placeholders plus the three built-ins. Email/API/deployment/Git/command templates are categories of the same record, not separate models.

- [ ] **Step 3: Implement create-from-clipboard and fill UI**

Let users convert an item to template, select literal ranges to replace with placeholders, enter values, preview output, and copy. Never save entered secret values unless user explicitly saves a new snippet.

- [ ] **Step 4: Verify**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test templates && npm test -- --run src/features/templates`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src src-tauri
git commit -m "feat: add safe reusable templates"
```

### Epic 11: Import, export, backup, and restore

**Files:**
- Create: `src-tauri/src/transfer.rs`, `src/features/settings/TransferPanel.tsx`
- Modify: `src-tauri/src/commands.rs`, `models.rs`, `repository.rs`, `capabilities/default.json`
- Test: `src-tauri/tests/transfer.rs`, `src/features/settings/TransferPanel.test.tsx`

**Interfaces:**
- Produces: versioned `snipdock-export-v1` JSON; Markdown/plain text/project export; JSON/Markdown/code/shell import; atomic backup/restore with dry-run report.

- [ ] **Step 1: Write fixture-based round-trip tests**

Cover complete JSON round trip, Markdown front matter, plain text loss warning, code language detection, shell collection splitting, duplicate policy (`skip`, `keep_both`, `replace`), corrupt files, future schema version rejection, backup atomicity, and restore rollback.

- [ ] **Step 2: Implement transfer formats**

JSON is canonical and lossless. Markdown uses YAML front matter for metadata and fenced content. Plain text exports content only. Project export includes project, items, categories, and tags. Use Tauri dialogs and scoped file-system access; reject paths outside user selection.

- [ ] **Step 3: Implement backups**

Create a consistent SQLite snapshot plus manifest, write to a temporary file, fsync, then rename. Keep configurable rolling backups; default daily, retain seven. Restore first validates manifest/checksum, closes DB, swaps atomically, reruns migrations, and restores old DB on failure.

- [ ] **Step 4: Implement preview UI**

Show counts, conflicts, warnings, and destination before mutation. Require explicit confirmation for restore and replace mode.

- [ ] **Step 5: Verify**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test transfer && npm test -- --run src/features/settings/TransferPanel.test.tsx`

Expected: PASS; byte-for-byte source files remain unchanged.

- [ ] **Step 6: Commit**

```bash
git add src src-tauri
git commit -m "feat: import export and back up local data"
```

### Epic 12: Developer tools

**Files:**
- Create: `src/features/tools/ToolsPage.tsx`, `src/features/tools/ToolForm.tsx`
- Create: `src-tauri/src/tools.rs`
- Modify: `src-tauri/src/commands.rs`, `models.rs`, `lib.rs`, `src/app/App.tsx`
- Test: `src-tauri/tests/tools.rs`, `src/features/tools/ToolsPage.test.tsx`

**Interfaces:**
- Produces: tagged `ToolRequest`/`ToolResult` for JSON, Base64, URL, JWT decode, UUID, hash, regex, cron, timestamp, case, SQL, env, Markdown, and diff tools.

- [ ] **Step 1: Write one positive and one failure case per tool**

Assert JWT decode never claims signature verification; regex has input-size/time protection; hash algorithms are explicitly named; timestamp shows UTC and local; Markdown sanitizes HTML; diff has a 1 MB input ceiling.

- [ ] **Step 2: Implement with standard/existing libraries first**

Use Rust/JS standard capabilities for Base64/URL/UUID/hash/time/case. Reuse Task 9 JSON/SQL functions. Add one small, audited parser only where cron correctness requires it. Regex tester returns matches and capture groups but never evaluates replacement code.

- [ ] **Step 3: Implement one shared tool form**

Each tool declares input fields and output rendering; avoid separate page components. Offer “Create snippet” and “Copy” on successful outputs.

- [ ] **Step 4: Verify**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test tools && npm test -- --run src/features/tools`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src src-tauri
git commit -m "feat: add offline developer tools"
```

### Epic 13: Productivity, expiry, reminders, and activity

**Files:**
- Create: `src/features/activity/ActivityPage.tsx`, `Recommendations.tsx`
- Modify: `src-tauri/src/repository.rs`, `commands.rs`, `os.rs`, `models.rs`
- Test: `src-tauri/tests/activity.rs`, `src/features/activity/ActivityPage.test.tsx`

**Interfaces:**
- Produces: most copied/used lists, recent activity, deterministic frequent suggestions, duplicate merge, reminders, expiry sweep, notification events.

- [ ] **Step 1: Write activity and scheduling tests with a fake clock**

Cover usage counts, timestamps, 30-day frequency ranking, exact-hash duplicates, snippet merge metadata policy, reminder firing once, expiry archive/delete setting, and notification-disabled behavior.

- [ ] **Step 2: Implement deterministic suggestions**

Rank non-archived items by copies in the last 30 days, then all-time usage, then recency. Show at most five. No machine-learning dependency.

- [ ] **Step 3: Implement duplicate merge**

Clipboard duplicates consolidate automatically by exact normalized hash. Snippet merge requires confirmation: keep target content/title, union tags, keep non-empty target metadata, add usage counts, and soft-delete source.

- [ ] **Step 4: Implement reminder/expiry UI and scheduler**

Check on startup and every minute while running. Use native notifications if enabled; otherwise show in-app activity. Expired items archive by default.

- [ ] **Step 5: Verify**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test activity && npm test -- --run src/features/activity`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src src-tauri
git commit -m "feat: add activity and productivity insights"
```

### Epic 14: Encryption, private mode, lock, and clipboard clearing

**Files:**
- Create: `src-tauri/migrations/0002_security.sql`, `src-tauri/src/security.rs`, `src/features/settings/SecurityPanel.tsx`, `src/features/snippets/PrivateSnippetDialog.tsx`
- Modify: `src-tauri/src/repository.rs`, `clipboard.rs`, `commands.rs`, `lib.rs`, `capabilities/default.json`
- Test: `src-tauri/tests/security.rs`, `src/features/settings/SecurityPanel.test.tsx`

**Interfaces:**
- Produces: encrypted content envelope version 1; credential key ID `snipdock.database.v1`; lock/unlock; PIN derivation; optional biometric adapter; copy auto-clear token.

- [ ] **Step 1: Write security tests before choosing concrete crypto crates**

Test authenticated-encryption round trip, random nonce, tamper rejection, no plaintext at rest, credential-store failure, PIN retry/backoff, lock redaction, idle lock, backup encryption, and auto-clear not deleting clipboard content written by another app.

- [ ] **Step 2: Implement key hierarchy**

Generate a 256-bit random master key. Store it in the OS credential manager. Encrypt private/sensitive item fields with an audited AEAD implementation and per-record nonce; store algorithm/version/nonce/ciphertext. PIN protects access to the master key through a memory-hard password KDF; never use PIN directly as encryption key.

- [ ] **Step 3: Implement lock and private UI**

Locked state exposes only the unlock screen and clears decrypted caches. Private snippets never appear in notifications, activity previews, search snippets, exports, or unencrypted backups unless the user explicitly includes them in an encrypted export.

- [ ] **Step 4: Implement safe auto-clear**

After copying a protected value, remember a hash and schedule configured timeout. Clear only if current clipboard hash still matches; otherwise leave user clipboard untouched.

- [ ] **Step 5: Gate biometric authentication**

Expose biometric unlock only where the installed official/platform API supports desktop authentication and threat-model tests pass. Otherwise hide the setting; never simulate biometrics with a checkbox.

- [ ] **Step 6: Verify security release**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test security && npm test -- --run src/features/settings/SecurityPanel.test.tsx`

Expected: PASS; database/backup fixture scan finds no private plaintext.

- [ ] **Step 7: Commit**

```bash
git add src src-tauri
git commit -m "feat: protect private and sensitive snippets"
```

### Epic 15: Optional AI actions

**Files:**
- Create: `src-tauri/src/ai.rs`, `src/features/settings/AiSettings.tsx`, `src/features/snippets/AiActions.tsx`
- Modify: `src-tauri/src/commands.rs`, `models.rs`, `lib.rs`, `capabilities/default.json`
- Test: `src-tauri/tests/ai.rs`, `src/features/snippets/AiActions.test.tsx`

**Interfaces:**
- Produces: `AiProvider` trait; explicit `AiRequest` actions for explain, improve command, describe, title, categorize, tag, summarize error, suggest fix, convert OS, document, secret review, and semantic search.

- [ ] **Step 1: Write provider-boundary privacy tests**

Assert disabled-by-default behavior, per-request preview/consent, secret redaction, private-item refusal, timeout/cancel, provider error redaction, no response auto-execution, and no AI result auto-save.

- [ ] **Step 2: Implement provider-neutral boundary**

One configured provider is enough for first delivery; keep interface because provider/network code is a true trust boundary. Store API key in OS credential manager. Send only previewed content and action prompt. Record no prompt/response bodies in logs.

- [ ] **Step 3: Implement explicit UI actions**

Every action opens a diff/preview. User chooses copy or save. Command improvements and suggested fixes display a warning and never execute. Natural-language search is a separate opt-in request and falls back to local FTS when disabled/offline.

- [ ] **Step 4: Verify with fake provider only in CI**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test ai && npm test -- --run src/features/snippets/AiActions.test.tsx`

Expected: PASS with zero network calls.

- [ ] **Step 5: Commit**

```bash
git add src src-tauri
git commit -m "feat: add opt-in AI snippet actions"
```

### Epic 16: Optional encrypted cloud synchronization

**Files:**
- Create: `src-tauri/migrations/0003_sync.sql`, `src-tauri/src/sync.rs`, `src/features/settings/SyncSettings.tsx`
- Modify: `src-tauri/src/repository.rs`, `commands.rs`, `models.rs`, `lib.rs`, `capabilities/default.json`
- Test: `src-tauri/tests/sync.rs`, `src/features/settings/SyncSettings.test.tsx`

**Interfaces:**
- Produces: encrypted sync envelope, device ID, per-record revision, tombstone, manual sync command, conflict records.

- [ ] **Step 1: Write protocol tests before adding network access**

Cover ciphertext-only server payloads, authentication, retry/backoff, offline queue, same-record conflicts, tombstones, clock skew, revoked device, wrong key, corrupt remote data, and local rollback on failed apply.

- [ ] **Step 2: Implement sync as optional adapter**

Encrypt locally with a separate sync key. Server identifiers and ciphertext reveal no titles/content/tags. Start with manual sync plus status; background sync comes only after reliability evidence. Never reuse AI credentials or database master key.

- [ ] **Step 3: Implement conflict UI**

Allow choose local, remote, or keep both. Never silently overwrite divergent content. Project/tag association conflicts merge as sets when both referenced records exist.

- [ ] **Step 4: Verify offline default**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test sync && npm test -- --run src/features/settings/SyncSettings.test.tsx`

Expected: PASS; clean install creates no sockets and requests no network capability until sync is enabled.

- [ ] **Step 5: Commit**

```bash
git add src src-tauri
git commit -m "feat: add optional encrypted synchronization"
```

### Epic 17: Release verification and documentation

**Files:**
- Modify: `README.md`, `e2e/core-flow.spec.ts`, `src-tauri/tauri.conf.json`
- Create: `docs/privacy.md`, `docs/backup-restore.md`, `docs/keyboard-shortcuts.md`, `docs/release-checklist.md`
- Test: all frontend, Rust, E2E, build, and package checks.

**Interfaces:**
- Consumes: all earlier release contracts.
- Produces: reproducible signed release checklist and user-facing privacy/backup guidance.

- [ ] **Step 1: Complete end-to-end core flow**

Test launch, clipboard capture, pause/resume, search, copy, undo delete, create/edit/pin/favorite snippet, project/tag assignment, export, backup, theme, shortcut, tray, lock/private flow when enabled, and restart persistence.

- [ ] **Step 2: Run complete automated suite**

Run: `npm test -- --run && cargo test --manifest-path src-tauri/Cargo.toml && npm run build && npm run test:e2e`

Expected: all commands exit 0 with no ignored failures.

- [ ] **Step 3: Run privacy and recovery checks**

Use seeded canary secrets. Confirm excluded clipboard secrets never reach SQLite/logs; private data is encrypted; AI/sync disabled produces no network traffic; corrupt import changes nothing; restore rollback preserves current DB; auto-clear respects changed clipboard.

- [ ] **Step 4: Package on each claimed platform**

Run: `npm run tauri build`

Expected: signed installer when signing is configured; fresh VM install/upgrade/uninstall checklist passes; application data is retained on ordinary uninstall unless user explicitly requests removal.

- [ ] **Step 5: Update documentation with exact observed behavior**

Document default shortcuts, settings, supported content types, privacy boundaries, backup locations, restore warnings, OS limitations, AI data flow, and sync threat model. Do not claim biometric or platform support that was not packaged and manually tested.

- [ ] **Step 6: Commit**

```bash
git add README.md docs e2e src-tauri/tauri.conf.json
git commit -m "docs: prepare SnipDock release verification"
```

## 6. Requirement Coverage Matrix

| Requirement group | Primary tasks | Release |
|---|---:|---:|
| Clipboard Management | 2, 3, 7, 8 | 1 |
| Snippet Management | 4, 5, 13 | 1–2 |
| Search and Filtering | 5, 6, 8 | 1 |
| Code Detection and Formatting | 8, 9 | 1–2 |
| Categories | 2, 5 | 1 |
| Project Organization | 4, 5, 13 | 1–2 |
| Tags and Labels | 5, 6 | 1 |
| Sensitive Data Protection | 8, 14 | 1–3 |
| Reusable Templates | 10 | 2 |
| Keyboard Shortcuts | 6, 7 | 1 |
| Quick Actions | 3, 4, 5, 9, 11 | 1–2 |
| Import and Export | 11 | 2 |
| Developer Tools | 9, 12 | 2 |
| Desktop Experience | 7, 17 | 1 |
| Productivity Features | 3, 4, 13 | 1–2 |
| Optional AI Features | 15 | 4 |
| Storage and Security | 2, 11, 14, 16 | 1–4 |
| Settings | 3, 7, 8, 9, 11, 14 | 1–3 |

## 7. Release Gates

### Release 1 gate

- Clipboard capture survives 8-hour manual soak without duplicates, runaway memory, or database lock errors.
- Core workflow is fully keyboard accessible.
- 10,000-item search remains interactive.
- Secret exclusion/masking fixtures pass and logs contain no captured content.
- Backup/restore round trip succeeds before calling the build production-ready.

### Release 2 gate

- Every formatter/tool returns diagnostics instead of destroying input.
- JSON export/import round trip is lossless.
- Templates never evaluate code.
- Reminder and expiry behavior is deterministic under fake-clock tests.

### Release 3 gate

- Independent security review covers key storage, encryption envelopes, lock bypass, backup contents, clipboard auto-clear, and log redaction.
- Database and backup scans show no private plaintext.
- Credential-store loss/recovery behavior is documented and tested.

### Release 4 gate

- AI request preview accurately shows all outbound content.
- Clean install and disabled extensions make no network requests.
- Sync server can never decrypt user content.
- Conflict, retry, revoke, and corrupt-remote recovery tests pass before background sync is considered.

## 8. Explicit Non-Goals and Deferred Decisions

- No image/file/RTF clipboard history in Release 1; text-only meets current core need with much smaller privacy/storage risk.
- No browser extension, mobile app, team sharing, account system, or web dashboard in this roadmap.
- No automatic execution of snippets, shell commands, SQL, AI suggestions, or imported content.
- No custom rich-text editor, home-grown crypto, custom database abstraction, or plugin framework.
- No biometric promise on desktop until platform capability and packaging are proven.
- No cloud vendor selection until Release 4 protocol tests define required storage semantics.

## 9. Planning Assumptions Requiring Owner Review

1. Windows-first is acceptable; macOS/Linux become supported only after packaging tests.
2. Clipboard v1 stores text only.
3. Tauri 2 + React/TypeScript + Rust is acceptable for this greenfield repository.
4. Secret-like clipboard content is excluded by default; users may weaken this policy in settings.
5. AI and cloud sync are optional Release 4 work, not MVP blockers.
6. Undo retention is 30 seconds; ordinary soft-deleted rows may be purged by configured cleanup after backup.
7. Built-in categories are fixed seeds but remain filterable alongside user-created categories.

Approve or amend these assumptions before Task 1 implementation.
