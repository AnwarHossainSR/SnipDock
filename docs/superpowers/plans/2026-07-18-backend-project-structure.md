# Backend Project Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the flat Tauri Rust backend into app, commands, storage, features, models, and platform ownership without changing public behavior.

**Architecture:** Keep `src-tauri` as the Rust/Tauri project boundary. Move standalone capabilities first behind compatibility re-exports, then split models, repository methods, clipboard logic, command adapters, and lifecycle code in independently compiling commits.

**Tech Stack:** Rust stable MSVC, Tauri 2, Tokio, SQLx SQLite, Serde.

## Global Constraints

- Keep command names, payload serialization, event names, migration files, database schema, and error messages unchanged.
- Add no dependencies, abstractions, or new test files.
- Preserve `snipdock_lib::models`, `snipdock_lib::repository`, `snipdock_lib::db`, `snipdock_lib::commands`, and existing feature module paths through re-exports.
- Do not reorganize `src-tauri/gen`, `src-tauri/target`, migrations, capabilities, or icons.
- Run Rust checks from repository root with `cargo test --manifest-path src-tauri\Cargo.toml`.

---

## File Map

- `src-tauri/src/app/`: runtime setup, state, tray, and window lifecycle.
- `src-tauri/src/commands/`: thin Tauri command adapters and registration.
- `src-tauri/src/storage/`: database opening and `Repository` implementations.
- `src-tauri/src/features/`: clipboard and standalone domain operations.
- `src-tauri/src/models/`: serialized domain and operation types.
- `src-tauri/src/platform/`: Windows foreground-window and direct-paste integration.
- `src-tauri/src/error.rs`: unchanged command-boundary error format.

### Task 1: Establish Backend Module Boundaries

**Files:**
- Move: `src-tauri/src/db.rs` -> `src-tauri/src/storage/database.rs`
- Move: `src-tauri/src/state.rs` -> `src-tauri/src/app/state.rs`
- Move: `src-tauri/src/os.rs` -> `src-tauri/src/platform/windows.rs`
- Move: `src-tauri/src/ai.rs` -> `src-tauri/src/features/ai.rs`
- Move: `src-tauri/src/detection.rs` -> `src-tauri/src/features/detection.rs`
- Move: `src-tauri/src/formatting.rs` -> `src-tauri/src/features/formatting.rs`
- Move: `src-tauri/src/security.rs` -> `src-tauri/src/features/security.rs`
- Move: `src-tauri/src/sync.rs` -> `src-tauri/src/features/sync.rs`
- Move: `src-tauri/src/templates.rs` -> `src-tauri/src/features/templates.rs`
- Move: `src-tauri/src/tools.rs` -> `src-tauri/src/features/tools.rs`
- Move: `src-tauri/src/transfer.rs` -> `src-tauri/src/features/transfer.rs`
- Create: `src-tauri/src/app/mod.rs`
- Create: `src-tauri/src/storage/mod.rs`
- Create: `src-tauri/src/features/mod.rs`
- Create: `src-tauri/src/platform/mod.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: Existing module APIs unchanged.
- Produces: Canonical nested modules plus legacy root aliases.

- [ ] **Step 1: Move files with Git history**

```powershell
New-Item -ItemType Directory -Force src-tauri\src\app, src-tauri\src\storage, src-tauri\src\features, src-tauri\src\platform | Out-Null
git mv src-tauri/src/db.rs src-tauri/src/storage/database.rs
git mv src-tauri/src/state.rs src-tauri/src/app/state.rs
git mv src-tauri/src/os.rs src-tauri/src/platform/windows.rs
git mv src-tauri/src/ai.rs src-tauri/src/features/ai.rs
git mv src-tauri/src/detection.rs src-tauri/src/features/detection.rs
git mv src-tauri/src/formatting.rs src-tauri/src/features/formatting.rs
git mv src-tauri/src/security.rs src-tauri/src/features/security.rs
git mv src-tauri/src/sync.rs src-tauri/src/features/sync.rs
git mv src-tauri/src/templates.rs src-tauri/src/features/templates.rs
git mv src-tauri/src/tools.rs src-tauri/src/features/tools.rs
git mv src-tauri/src/transfer.rs src-tauri/src/features/transfer.rs
```

- [ ] **Step 2: Declare canonical modules and compatibility aliases**

```rust
// app/mod.rs
pub mod state;

// storage/mod.rs
pub mod database;

// platform/mod.rs
pub mod windows;

// features/mod.rs
pub mod ai;
pub mod detection;
pub mod formatting;
pub mod security;
pub mod sync;
pub mod templates;
pub mod tools;
pub mod transfer;
```

Replace flat declarations in `lib.rs` with canonical modules and aliases while leaving unmoved modules declared normally:

```rust
pub mod app;
pub mod commands;
pub mod clipboard;
pub mod error;
pub mod features;
pub mod models;
pub mod platform;
pub mod repository;
pub mod storage;

pub use app::state;
pub use features::{ai, detection, formatting, security, sync, templates, tools, transfer};
pub use platform::windows as os;
pub use storage::database as db;
```

- [ ] **Step 3: Verify moved-module compatibility**

```powershell
cargo test --manifest-path src-tauri\Cargo.toml
```

Expected: all library, unit, and integration tests pass.

- [ ] **Step 4: Commit**

```powershell
git add src-tauri/src
git commit -m "refactor: establish backend module boundaries"
```

### Task 2: Split Serialized Models

**Files:**
- Replace: `src-tauri/src/models.rs` -> `src-tauri/src/models/mod.rs`
- Create: `src-tauri/src/models/library.rs`
- Create: `src-tauri/src/models/settings.rs`
- Create: `src-tauri/src/models/operations.rs`

**Interfaces:**
- Consumes: All existing model names and Serde representations.
- Produces: Same names re-exported from `crate::models`.

- [ ] **Step 1: Move model definitions by exact ownership**

```text
models/library.rs:
  Id, ItemKind, ContentType, SortOrder, LibraryItem, Page, SearchQuery,
  Project, Tag, Category, SaveItemInput, SaveProjectInput, SaveTagInput,
  SaveCategoryInput, ItemFlags, CopyMode, CopyReceipt, DeleteReceipt

models/settings.rs:
  Settings, impl Default for Settings, SettingsPatch

models/operations.rs:
  FormatOperation, FormatRequest, Diagnostic, FormatResult,
  RenderTemplateRequest, RenderTemplateResult, ToolRequest, ToolResult,
  ExportRequest, ExportReceipt, ImportRequest, ImportReport, BackupRequest,
  BackupReceipt, RestoreRequest, RestoreReport, UnlockRequest, UnlockResult,
  AiRequest, AiResult, SyncStatus
```

Each file imports only required Serde traits and `std::collections::BTreeMap` where used. Preserve every derive, field, enum variant, `serde` attribute, and default value exactly.

- [ ] **Step 2: Re-export the complete model API**

```rust
mod library;
mod operations;
mod settings;

pub use library::*;
pub use operations::*;
pub use settings::*;
```

- [ ] **Step 3: Verify public model paths**

```powershell
cargo test --manifest-path src-tauri\Cargo.toml
```

Expected: existing `snipdock_lib::models::*` imports compile and all tests pass.

- [ ] **Step 4: Commit**

```powershell
git add src-tauri/src/models.rs src-tauri/src/models
git commit -m "refactor: split backend models by responsibility"
```

### Task 3: Split Storage Repository Implementations

**Files:**
- Replace: `src-tauri/src/repository.rs` -> `src-tauri/src/storage/mod.rs`
- Create: `src-tauri/src/storage/items.rs`
- Create: `src-tauri/src/storage/organization.rs`
- Create: `src-tauri/src/storage/settings.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `Repository`, `RepositoryError`, and every existing method signature.
- Produces: Same API at both `crate::storage` and `crate::repository`.

- [ ] **Step 1: Create repository module shell**

Move `RepositoryError`, `RepositoryResult`, `Repository`, and `Repository::new` into `storage/mod.rs`, retaining its existing `pub mod database;`. Declare implementations:

```rust
mod items;
mod organization;
mod settings;
```

- [ ] **Step 2: Move item and search methods**

Move these methods into `items.rs` inside `impl Repository` without changing bodies or signatures:

```text
save_item, save_clipboard_item, save_item_as, duplicate_item,
latest_clipboard_content, prune_clipboard_history, get_item,
set_item_flags, record_copy, delete_item, clear_clipboard_history,
restore_item, cleanup_retention, list_items, list_clipboard_items,
list_reusable_items, search, set_item_language
```

- [ ] **Step 3: Move organization and settings methods**

```text
organization.rs:
  save_project, get_project, list_projects, move_item, list_categories,
  get_category, save_category, list_tags, get_tag, save_tag, merge_tags

settings.rs:
  get_settings, save_settings, ensure_settings_table, validate_settings,
  is_shortcut
```

Keep `CategoryRow`, `TagRow`, `ProjectRow`, `map_unique`, and `is_hex_color` with organization code. Keep `ItemRow`, item/content parsing, FTS construction, and query-condition helpers with item code. Keep settings validation helpers with settings code. Use `pub(super)` only for helpers consumed across storage child modules.

- [ ] **Step 4: Publish compatibility path**

```rust
// lib.rs
pub use storage as repository;
```

Remove the old `pub mod repository;` declaration from `lib.rs`.

- [ ] **Step 5: Verify storage behavior**

```powershell
cargo test --manifest-path src-tauri\Cargo.toml
```

Expected: migration, search, repository, clipboard, and transfer tests all pass.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/src/repository.rs src-tauri/src/storage src-tauri/src/lib.rs
git commit -m "refactor: split storage repository by responsibility"
```

### Task 4: Split Clipboard Feature

**Files:**
- Replace: `src-tauri/src/clipboard.rs` -> `src-tauri/src/features/clipboard/mod.rs`
- Create: `src-tauri/src/features/clipboard/capture.rs`
- Create: `src-tauri/src/features/clipboard/monitor.rs`
- Modify: `src-tauri/src/features/mod.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: Existing clipboard types and traits.
- Produces: Identical `crate::clipboard::*` API through re-export.

- [ ] **Step 1: Split capture and monitor ownership**

```text
capture.rs:
  CaptureSettings, impl Default, CapturePolicy, CaptureIgnoreReason,
  CaptureOutcome, ClipboardCapture and its implementations

monitor.rs:
  TextClipboard, SystemClipboard and its implementation, Control,
  ClipboardMonitor and its implementations, Drop for ClipboardMonitor
```

Preserve existing `#[cfg(test)]` modules beside the code they test.

- [ ] **Step 2: Re-export feature API**

```rust
mod capture;
mod monitor;

pub use capture::*;
pub use monitor::*;
```

Declare `pub mod clipboard;` in `features/mod.rs`, remove flat `pub mod clipboard;` from `lib.rs`, and add:

```rust
pub use features::clipboard;
```

- [ ] **Step 3: Verify clipboard behavior**

```powershell
cargo test --manifest-path src-tauri\Cargo.toml
```

Expected: clipboard unit and integration tests pass with all other tests.

- [ ] **Step 4: Commit**

```powershell
git add src-tauri/src/clipboard.rs src-tauri/src/features src-tauri/src/lib.rs
git commit -m "refactor: split clipboard feature responsibilities"
```

### Task 5: Split Tauri Commands By Capability

**Files:**
- Replace: `src-tauri/src/commands.rs` -> `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/library.rs`
- Create: `src-tauri/src/commands/clipboard.rs`
- Create: `src-tauri/src/commands/organization.rs`
- Create: `src-tauri/src/commands/content.rs`
- Create: `src-tauri/src/commands/transfer.rs`
- Create: `src-tauri/src/commands/settings.rs`

**Interfaces:**
- Consumes: `AppState`, feature APIs, storage repository, platform integration.
- Produces: Same Tauri command names and `commands::actions` compatibility API.

- [ ] **Step 1: Move command handlers by exact group**

```text
library.rs:
  search_items, get_item, save_item, duplicate_item, set_item_flags,
  delete_item, restore_item

clipboard.rs:
  clear_clipboard_history, copy_item, direct_paste, set_clipboard_tracking

organization.rs:
  move_item, list_projects, save_project, list_categories, save_category,
  list_tags, save_tag, merge_tags

content.rs:
  format_content, render_template, run_tool, run_ai_action

transfer.rs:
  export_data, import_data, create_backup, restore_backup

settings.rs:
  lock_app, unlock_app, get_sync_status, get_settings, save_settings
```

Make handlers `pub(super)` so `commands/mod.rs` can pass them to `tauri::generate_handler!`.

- [ ] **Step 2: Preserve action API**

Split the existing non-Tauri action functions into `library::actions`, `clipboard::actions`, `organization::actions`, and `settings::actions`, matching the handler groups above. Re-export every current action name from `commands/mod.rs`:

```rust
pub mod actions {
    pub use super::clipboard::actions::*;
    pub use super::library::actions::*;
    pub use super::organization::actions::*;
    pub use super::settings::actions::*;
}
```

- [ ] **Step 3: Keep registration centralized**

Keep `GLOBAL_SHORTCUTS`, `WINDOW_RAISING_EVENTS`, `raise_main_window`, and `register` in `commands/mod.rs`. Update `tauri::generate_handler!` entries to qualified paths such as `library::search_items`, preserving the existing handler list and order.

- [ ] **Step 4: Verify command contract**

```powershell
cargo test --manifest-path src-tauri\Cargo.toml
```

Expected: all command action and integration tests pass; Tauri macro compilation succeeds.

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/src/commands.rs src-tauri/src/commands
git commit -m "refactor: split Tauri commands by capability"
```

### Task 6: Move Runtime Lifecycle Into App

**Files:**
- Modify: `src-tauri/src/app/mod.rs`
- Create: `src-tauri/src/app/tray.rs`
- Modify: `src-tauri/src/lib.rs`
- Keep: `src-tauri/src/main.rs`

**Interfaces:**
- Consumes: `commands::register`, `AppState`, clipboard capture, storage, platform window APIs.
- Produces: `snipdock_lib::run()` unchanged.

- [ ] **Step 1: Move lifecycle code**

Move `run`, `APP_SHOWN_EVENT`, `MAIN_WINDOW`, `show_main_window`, `hide_main_window`, and `report_startup_failure` from `lib.rs` to `app/mod.rs`. Declare:

```rust
pub mod state;
mod tray;

pub use state::AppState;
```

- [ ] **Step 2: Move tray setup**

Move the complete existing `setup_tray` function and its Tauri menu/tray imports to `app/tray.rs`. Change only its visibility from:

```rust
fn setup_tray(app: &tauri::App) -> tauri::Result<()>
```

to:

```rust
pub(super) fn setup_tray(app: &tauri::App) -> tauri::Result<()>
```

Call `tray::setup_tray(app)?` from `app::run`.

- [ ] **Step 3: Keep crate entry point stable**

Reduce `lib.rs` to module declarations, compatibility aliases, and:

```rust
pub use app::run;
```

Keep `main.rs` unchanged:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    snipdock_lib::run();
}
```

- [ ] **Step 4: Verify runtime compilation**

```powershell
cargo test --manifest-path src-tauri\Cargo.toml
```

Expected: all tests pass and the Tauri application target compiles.

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/src/app src-tauri/src/lib.rs src-tauri/src/main.rs
git commit -m "refactor: isolate Tauri application lifecycle"
```

### Task 7: Backend Final Audit

**Files:**
- Modify only stale imports, visibility, or module paths found by audit.

**Interfaces:**
- Consumes: Completed backend structure.
- Produces: Clean nested backend with preserved public compatibility.

- [ ] **Step 1: Scan final layout and stale flat declarations**

```powershell
Get-ChildItem src-tauri\src -Recurse -File | Select-Object -ExpandProperty FullName
rg -n '^pub mod (ai|clipboard|db|detection|formatting|os|repository|security|state|sync|templates|tools|transfer);' src-tauri/src/lib.rs
rg -n 'src-tauri/src/(ai|clipboard|db|detection|formatting|models|os|repository|security|state|sync|templates|tools|transfer)\.rs' . --glob '!src-tauri/target/**' --glob '!dist/**'
git diff --check
```

Expected: compatibility exists through `pub use`, not stale flat `pub mod` declarations; no old source-file references or whitespace errors.

- [ ] **Step 2: Run full project verification**

```powershell
cargo test --manifest-path src-tauri\Cargo.toml
bun test
bun run build
```

Expected: all Rust and frontend tests pass; frontend build exits `0`.

- [ ] **Step 3: Commit audit corrections when present**

```powershell
git add src-tauri/src src-tauri/tests src
git diff --cached --quiet; if ($LASTEXITCODE -ne 0) { git commit -m "refactor: finish backend structure migration" }
```
