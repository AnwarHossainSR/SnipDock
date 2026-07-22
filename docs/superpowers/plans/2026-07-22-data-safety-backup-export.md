# Data Safety Backup and Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace lossy item-only backups with encrypted full-database snapshots, make restore atomic, block private regular exports, and make import replacement/content types correct.

**Architecture:** Regular export remains logical JSON/text and reads bounded 200-row pages until repository total is reached. Full backup uses SQLite `VACUUM INTO`, validates the snapshot, encrypts it with existing Argon2id/XChaCha20-Poly1305 code, and writes atomically. Restore validates into a pending database and swaps it before database startup, retaining a rollback file until the restored database opens.

**Tech Stack:** Rust 2021, SQLx 0.8/SQLite, Tauri 2, existing `argon2` and `chacha20poly1305`, React 19/TypeScript, Bun tests.

## Global Constraints

- Keep interactive repository search capped at 200 rows.
- Regular export must fail if any selected item is private.
- Full backup must include every committed SQLite table, including private items, settings, relationships, sync records, and conflicts.
- Backup password and cloud credentials never enter the SQLite database.
- Restore is full replacement; dry run never changes application state.
- Any backup, import, or restore failure must preserve the previous valid state.
- Use existing dependencies; add no package or crate.
- Use Bun for frontend commands and Cargo for Rust commands.

---

## File Structure

- `src-tauri/src/features/transfer.rs`: logical export/import orchestration and encrypted snapshot envelope.
- `src-tauri/src/storage/items.rs`: content-type-aware item writes and one-transaction import.
- `src-tauri/src/storage/database.rs`: SQLite snapshot, validation, pending-restore swap, rollback startup.
- `src-tauri/src/models/library.rs`: `SaveItemInput.content_type`.
- `src-tauri/src/models/operations.rs`: password-bearing backup request and restore report.
- `src-tauri/src/commands/transfer.rs`: app-data path lookup and restart request after staging restore.
- `src/api/types.ts`, `src/api/commands.ts`: matching frontend command contracts.
- `src/features/settings/BackupPanel.tsx`: password fields and restart-safe status copy.
- `src/features/settings/BackupPanel.test.tsx`: command payload and error-state coverage.
- `docs/backup-restore.md`: exact encrypted snapshot and replacement semantics.

### Task 1: Complete and Private-Safe Regular Export

**Files:**
- Modify: `src-tauri/src/features/transfer.rs`

**Interfaces:**
- Consumes: `Repository::search(SearchQuery) -> RepositoryResult<Page<LibraryItem>>`.
- Produces: `all_items(&Repository) -> Result<Vec<LibraryItem>, AppError>` that follows all pages; `export_data` rejects private selections before file creation.

- [ ] **Step 1: Write failing export tests**

Add a `#[cfg(test)] mod tests` in `transfer.rs` with a unique temporary directory helper. Seed 501 non-private items directly through `Database::pool()`, then assert JSON export contains 501 items. Seed one private item, request its export, and assert validation failure plus `!output.exists()`.

```rust
#[tokio::test]
async fn export_reads_every_bounded_page() {
    let fixture = Fixture::new().await;
    fixture.insert_items(501, false).await;
    let receipt = export_data(&fixture.repository, fixture.export_request("json"))
        .await
        .unwrap();
    assert_eq!(receipt.item_count, 501);
    let export: ExportFile = serde_json::from_slice(&fs::read(receipt.path).unwrap()).unwrap();
    assert_eq!(export.items.len(), 501);
}

#[tokio::test]
async fn private_export_fails_before_writing() {
    let fixture = Fixture::new().await;
    let private_id = fixture.insert_one(true, ContentType::PlainText).await;
    let request = fixture.export_selected(private_id);
    let error = export_data(&fixture.repository, request.clone()).await.unwrap_err();
    assert_eq!(error.code, ErrorCode::Validation);
    assert!(!Path::new(&request.path).exists());
}
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `cargo test features::transfer::tests::export_ --manifest-path src-tauri/Cargo.toml`

Expected: 501-item assertion reports `200`; private export unexpectedly succeeds.

- [ ] **Step 3: Implement bounded paging and private guard**

Keep the repository clamp. Change only transfer collection:

```rust
async fn all_items(repository: &Repository) -> Result<Vec<LibraryItem>, AppError> {
    let mut query = all_items_query();
    let mut items = Vec::new();
    loop {
        let page = repository.search(query.clone()).await.map_err(repo)?;
        let total = usize::try_from(page.total).map_err(internal)?;
        let read = page.items.len();
        items.extend(page.items);
        if items.len() == total { return Ok(items); }
        if read == 0 || items.len() > total {
            return Err(AppError::new(ErrorCode::Storage, "export item count changed while reading"));
        }
        query.offset = u32::try_from(items.len()).map_err(internal)?;
    }
}

fn reject_private_export(items: &[LibraryItem]) -> Result<(), AppError> {
    if items.iter().any(|item| item.private) {
        return Err(AppError::new(ErrorCode::Validation, "private items require an encrypted backup"));
    }
    Ok(())
}
```

Call `reject_private_export(&items)?` before serializing or opening the destination.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `cargo test features::transfer::tests::export_ --manifest-path src-tauri/Cargo.toml`

Expected: both tests pass.

- [ ] **Step 5: Commit**

```powershell
git add -- src-tauri/src/features/transfer.rs
git commit -m "Fix complete and private-safe exports"
```

### Task 2: Transactional Import Replacement and Content Types

**Files:**
- Modify: `src-tauri/src/models/library.rs`
- Modify: `src-tauri/src/storage/items.rs`
- Modify: `src-tauri/src/features/transfer.rs`

**Interfaces:**
- Produces: `SaveItemInput { content_type: ContentType, ... }`.
- Produces: `Repository::import_items(Vec<SaveItemInput>, &str, bool) -> RepositoryResult<ImportReport>`; all non-dry-run rows share one SQL transaction.
- Consumes: duplicate policies `skip`, `keep_both`, and `replace` already validated by `import_data`.

- [ ] **Step 1: Write failing content-type and replacement tests**

Add tests proving JSON import replaces the same ID, file import replaces a content match, dry-run writes nothing, and a later invalid row rolls back an earlier valid row.

```rust
#[tokio::test]
async fn json_replace_preserves_id_and_content_type() {
    let fixture = Fixture::new().await;
    fixture.insert_named("same-id", "old", ContentType::PlainText).await;
    let path = fixture.write_export(item("same-id", "{\"new\":true}", ContentType::Json));
    let report = import_data(&fixture.repository, import_request(path, "replace", false)).await.unwrap();
    let item = fixture.repository.get_item("same-id").await.unwrap();
    assert_eq!((report.updated, item.content_type), (1, ContentType::Json));
    assert_eq!(item.content, "{\"new\":true}");
}

#[tokio::test]
async fn failed_import_rolls_back_every_row() {
    let fixture = Fixture::new().await;
    let path = fixture.write_export_many(vec![valid_item(), item_with_missing_tag()]);
    assert!(import_data(&fixture.repository, import_request(path, "keep_both", false)).await.is_err());
    assert_eq!(fixture.active_item_count().await, 0);
}
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `cargo test features::transfer::tests::import_ --manifest-path src-tauri/Cargo.toml`

Expected: content type is `PlainText`, replace reports skipped, and rollback test leaves one row.

- [ ] **Step 3: Add content type to the write contract**

```rust
pub struct SaveItemInput {
    pub id: Option<Id>,
    pub kind: ItemKind,
    pub title: Option<String>,
    pub description: Option<String>,
    pub content: String,
    pub content_type: ContentType,
    pub notes: Option<String>,
    pub project_id: Option<Id>,
    pub category_id: Option<Id>,
    pub tag_ids: Vec<Id>,
    pub private: bool,
    pub expires_at: Option<String>,
}
```

Remove `WithType`. Set detected file type and `LibraryItem.content_type` directly in `parse_import` and `to_input`. Update clipboard construction to set its supplied type. Remove `content_type_override` from `save_item_as` and bind `input.content_type` for insert and update.

- [ ] **Step 4: Move import writes into one repository transaction**

Refactor item validation into a pure `validate_item_input(&SaveItemInput)` helper. Refactor SQL mutation into `save_item_in(&mut Transaction<'_, Sqlite>, SaveItemInput) -> RepositoryResult<Id>`. `save_item` opens/commits one transaction around one call; `import_items` opens one transaction around the full loop:

```rust
pub async fn import_items(
    &self,
    mut inputs: Vec<SaveItemInput>,
    duplicate_policy: &str,
    dry_run: bool,
) -> RepositoryResult<ImportReport> {
    let mut tx = self.pool.begin().await?;
    let mut report = ImportReport { created: 0, updated: 0, skipped: 0, warnings: Vec::new() };
    for mut input in inputs.drain(..) {
        let existing_id: Option<String> = sqlx::query_scalar(
            "SELECT id FROM items WHERE deleted_at IS NULL AND (id = ? OR content_hash = ?) ORDER BY id = ? DESC LIMIT 1"
        )
        .bind(input.id.as_deref())
        .bind(crate::security::sha256_hex(input.content.as_bytes()))
        .bind(input.id.as_deref())
        .fetch_optional(&mut *tx).await?;
        match (existing_id, duplicate_policy) {
            (Some(_), "skip") => report.skipped += 1,
            (Some(id), "replace") => { input.id = Some(id); report.updated += 1; if !dry_run { save_item_in(&mut tx, input).await?; } }
            (Some(_), "keep_both") => { input.id = None; report.created += 1; if !dry_run { save_item_in(&mut tx, input).await?; } }
            (None, _) => { report.created += 1; if !dry_run { save_item_in(&mut tx, input).await?; } }
            _ => return Err(RepositoryError::Validation("unknown duplicate policy")),
        }
    }
    if dry_run { tx.rollback().await?; } else { tx.commit().await?; }
    Ok(report)
}
```

Parse every requested file first, then call `repository.import_items(inputs, &request.duplicate_policy, request.dry_run)` once.

- [ ] **Step 5: Run import and storage tests**

Run: `cargo test features::transfer::tests::import_ storage::items::tests --manifest-path src-tauri/Cargo.toml`

Expected: all pass.

- [ ] **Step 6: Commit**

```powershell
git add -- src-tauri/src/models/library.rs src-tauri/src/storage/items.rs src-tauri/src/features/transfer.rs
git commit -m "Make imports transactional and type-safe"
```

### Task 3: Encrypted Full-Database Backup

**Files:**
- Modify: `src-tauri/src/models/operations.rs`
- Modify: `src-tauri/src/storage/database.rs`
- Modify: `src-tauri/src/storage/mod.rs`
- Modify: `src-tauri/src/features/transfer.rs`

**Interfaces:**
- Produces: `BackupRequest { path: String, passphrase: String }`.
- Produces: `Repository::snapshot_to(&Path) -> RepositoryResult<()>`.
- Produces: envelope schema `snipdock-backup-v2` with `schema_version`, `database_schema_version`, and authenticated `ciphertext`.

- [ ] **Step 1: Write failing full-snapshot tests**

Seed more than 500 items plus one row in each persisted table: `projects`, `categories`, `tags`, `item_tags`, `project_tags`, `app_settings`, `sync_records`, and `sync_conflicts`. Create backup, decrypt its envelope into a test database, then compare table counts and representative values against source. Also assert private item content exists only after decryption.

```rust
#[tokio::test]
async fn encrypted_backup_contains_complete_database() {
    let fixture = Fixture::with_every_table_and_501_items().await;
    let receipt = create_backup(&fixture.repository, BackupRequest {
        path: fixture.backup_path(), passphrase: "backup password".into(),
    }).await.unwrap();
    let restored = fixture.decrypt_backup(&receipt.path, "backup password").await;
    for table in ["items", "projects", "categories", "tags", "item_tags", "project_tags", "app_settings", "sync_records", "sync_conflicts"] {
        assert_eq!(restored.count(table).await, fixture.count(table).await, "{table}");
    }
    assert_eq!(restored.private_content().await, "private payload");
}
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `cargo test features::transfer::tests::encrypted_backup_contains_complete_database --manifest-path src-tauri/Cargo.toml`

Expected: current `encrypted backups arrive with security tasks` validation error.

- [ ] **Step 3: Implement snapshot and validation primitives**

Expose current migration version as `pub const CURRENT_SCHEMA_VERSION: i64 = 3`. Add:

```rust
impl Repository {
    pub async fn snapshot_to(&self, path: &Path) -> RepositoryResult<()> {
        sqlx::query("VACUUM INTO ?")
            .bind(path.to_string_lossy().as_ref())
            .execute(&self.pool).await?;
        Ok(())
    }
}

pub async fn validate_snapshot(path: &Path) -> DatabaseResult<i64> {
    let options = SqliteConnectOptions::new().filename(path).read_only(true).foreign_keys(true);
    let pool = SqlitePoolOptions::new().max_connections(1).connect_with(options).await?;
    let check: String = sqlx::query_scalar("PRAGMA quick_check").fetch_one(&pool).await?;
    if check != "ok" { return Err(std::io::Error::other(format!("database integrity check failed: {check}")).into()); }
    let version: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations").fetch_one(&pool).await?;
    pool.close().await;
    if version > CURRENT_SCHEMA_VERSION { return Err(std::io::Error::other("backup schema is newer").into()); }
    Ok(version)
}
```

- [ ] **Step 4: Build and atomically write the encrypted envelope**

Reuse `crate::crypto::encrypt`; do not add another crypto implementation.

```rust
#[derive(Deserialize, Serialize)]
struct BackupEnvelope {
    schema: String,
    schema_version: u32,
    database_schema_version: i64,
    ciphertext: String,
}
```

Create unique snapshot/envelope temp paths using `Uuid`, validate the snapshot, encrypt its bytes, write with `File::create`, `write_all`, `sync_all`, then rename to the final path. Always attempt cleanup of task-owned temp files on error. Compute `BackupReceipt.checksum` over final envelope bytes.

- [ ] **Step 5: Run backup tests and verify GREEN**

Run: `cargo test features::transfer::tests::encrypted_backup_ --manifest-path src-tauri/Cargo.toml`

Expected: complete snapshot and private-content tests pass.

- [ ] **Step 6: Commit**

```powershell
git add -- src-tauri/src/models/operations.rs src-tauri/src/storage/database.rs src-tauri/src/storage/mod.rs src-tauri/src/features/transfer.rs
git commit -m "Add encrypted full database backups"
```

### Task 4: Validated Restore, Startup Swap, and Rollback

**Files:**
- Modify: `src-tauri/src/models/operations.rs`
- Modify: `src-tauri/src/storage/database.rs`
- Modify: `src-tauri/src/features/transfer.rs`
- Modify: `src-tauri/src/commands/transfer.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/app/mod.rs`

**Interfaces:**
- Produces: `stage_restore(RestoreRequest source, &Path pending) -> Result<RestoreReport, AppError>` through `restore_backup`.
- Produces: `Database::open_with_pending_restore(data_dir: &Path) -> DatabaseResult<Database>`.
- Produces: `RestoreReport { schema_version, item_count, warnings, restart_required }`.
- Produces: `restart_app(AppHandle)` command, invoked only after the frontend receives the successful restore report.

- [ ] **Step 1: Write failing restore rejection tests**

Test wrong password, one-byte envelope tamper, non-SQLite decrypted content, and a snapshot with `_sqlx_migrations.version = CURRENT_SCHEMA_VERSION + 1`. Assert no pending file is created.

```rust
#[tokio::test]
async fn invalid_restore_never_stages_database() {
    for invalid in [InvalidBackup::WrongPassword, InvalidBackup::Tampered, InvalidBackup::NotSqlite, InvalidBackup::NewerSchema] {
        let fixture = RestoreFixture::new(invalid).await;
        assert!(restore_backup(&fixture.request, &fixture.pending_path).await.is_err());
        assert!(!fixture.pending_path.exists());
    }
}
```

- [ ] **Step 2: Write failing startup swap tests**

Test: pending valid database replaces live database; invalid pending database restores original; simulated state with rollback present and live missing recovers rollback. Compare a marker row after `Database::open_with_pending_restore`.

```rust
#[tokio::test]
async fn failed_pending_database_rolls_back_live_database() {
    let fixture = SwapFixture::new("original").await;
    fixture.write_invalid_pending();
    let database = Database::open_with_pending_restore(fixture.dir()).await.unwrap();
    assert_eq!(fixture.marker(database.pool()).await, "original");
    assert!(!fixture.rollback_path().exists());
}
```

- [ ] **Step 3: Run restore tests and verify RED**

Run: `cargo test restore --manifest-path src-tauri/Cargo.toml`

Expected: staging and startup APIs do not exist.

- [ ] **Step 4: Implement validated restore staging**

Require non-empty `RestoreRequest.passphrase`. Parse `BackupEnvelope`, decrypt with existing crypto, write a unique temporary file inside app data directory, `sync_all`, call `validate_snapshot`, count active items for `RestoreReport`, and rename to `snipdock.restore-pending.sqlite` only after all checks pass. Dry run removes its temporary file and never creates pending state.

- [ ] **Step 5: Implement startup recovery state machine**

Use fixed same-directory paths:

```rust
const LIVE_DB: &str = "snipdock.sqlite";
const PENDING_DB: &str = "snipdock.restore-pending.sqlite";
const ROLLBACK_DB: &str = "snipdock.restore-rollback.sqlite";
const FAILED_DB: &str = "snipdock.restore-failed.sqlite";
```

`open_with_pending_restore` must follow these exact states:

1. rollback exists, live missing: rename rollback to live, then open live;
2. rollback and live both exist after an interrupted prior swap: open live; delete rollback only on success, otherwise move live to failed and restore rollback;
3. pending absent: open live normally;
4. pending present: remove only stale `FAILED_DB`, rename live to rollback, rename pending to live, then open live;
5. restored live opens: remove rollback and return database;
6. restored live fails: rename it to failed, rename rollback to live, open and return original database.

Replace the current `Database::open(data_dir.join("snipdock.sqlite"))` startup call with `Database::open_with_pending_restore(&data_dir)`.

- [ ] **Step 6: Add explicit restart command**

Resolve app data path in `commands/transfer.rs` and stage restore. Add a separate command so restart begins only after the successful restore IPC response reaches React:

```rust
#[tauri::command]
pub(super) fn restart_app(app: AppHandle) {
    app.request_restart();
}
```

Register `transfer::restart_app` in `commands/mod.rs`.

- [ ] **Step 7: Run restore tests and verify GREEN**

Run: `cargo test restore --manifest-path src-tauri/Cargo.toml`

Expected: validation, dry-run, swap, recovery, and rollback tests pass.

- [ ] **Step 8: Commit**

```powershell
git add -- src-tauri/src/models/operations.rs src-tauri/src/storage/database.rs src-tauri/src/features/transfer.rs src-tauri/src/commands/transfer.rs src-tauri/src/commands/mod.rs src-tauri/src/app/mod.rs
git commit -m "Restore backups atomically with rollback"
```

### Task 5: Frontend Contract, Backup Panel, Documentation, and Full Verification

**Files:**
- Modify: `src/api/types.ts`
- Modify: `src/api/commands.ts`
- Modify: `src/api/commands.test.ts`
- Modify: `src/features/settings/BackupPanel.tsx`
- Create: `src/features/settings/BackupPanel.test.tsx`
- Modify: `docs/backup-restore.md`

**Interfaces:**
- Consumes: `BackupRequest { path, passphrase }`; `RestoreRequest { path, passphrase, dry_run }`; `restart_app` after a successful non-dry restore response.
- Produces: accessible password inputs and command payloads matching Rust.

- [ ] **Step 1: Write failing frontend tests**

```tsx
test("creates encrypted backup with entered password", async () => {
  const calls: Array<[string, unknown]> = [];
  mockTauri((command, args) => {
    calls.push([command, args]);
    if (command === "create_backup") return { path: "D:/safe.backup", checksum: "abc", created_at: "1" };
  });
  render(<BackupPanel />);
  fireEvent.change(screen.getByLabelText("Backup path"), { target: { value: "D:/safe.backup" } });
  fireEvent.change(screen.getByLabelText("Backup password"), { target: { value: "correct horse battery staple" } });
  fireEvent.click(screen.getByRole("button", { name: "Create backup" }));
  await waitFor(() => expect(calls).toContainEqual(["create_backup", { input: {
    path: "D:/safe.backup", passphrase: "correct horse battery staple",
  } }]));
});
```

Add matching restore test for password, dry run, and button disabled while path/password is empty.
For non-dry restore, assert call order is `restore_backup`, then `restart_app`. Dry run must never call `restart_app`.

- [ ] **Step 2: Run frontend tests and verify RED**

Run: `bun test src/features/settings/BackupPanel.test.tsx src/api/commands.test.ts`

Expected: backup password field missing and old `{ encrypted: false }` payload observed.

- [ ] **Step 3: Update TypeScript and panel**

```ts
export interface BackupRequest { path: string; passphrase: string }
export interface RestoreReport {
  schema_version: number;
  item_count: number;
  warnings: string[];
  restart_required: boolean;
}
```

Add `restart_app` to `commandNames` and `commands.restartApp = () => run<void>("restart_app")`. Add `Backup password` and `Restore password` fields using `type="password"`, `autoComplete="new-password"` for creation and `autoComplete="current-password"` for restore. Never place either password in result/error copy or logs. Disable actions until required path and password are non-empty. After a successful non-dry restore response, call `commands.restartApp()`. Keep the existing path text field until the approved native destination-picker/cloud UI phase.

- [ ] **Step 4: Update backup documentation**

State that `.backup` is an authenticated encrypted full SQLite snapshot; list included data; state credentials/passwords are excluded; explain dry-run and full replacement/restart/rollback; distinguish lossy regular exports.

- [ ] **Step 5: Run focused frontend tests**

Run: `bun test src/features/settings/BackupPanel.test.tsx src/api/commands.test.ts`

Expected: pass without warnings.

- [ ] **Step 6: Run full verification**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: all Rust tests pass.

Run: `bun test`

Expected: all Bun tests pass.

Run: `bun run lint`

Expected: TypeScript exits 0.

Run: `bun run build`

Expected: production build exits 0.

- [ ] **Step 7: Commit**

```powershell
git add -- src/api/types.ts src/api/commands.ts src/api/commands.test.ts src/features/settings/BackupPanel.tsx src/features/settings/BackupPanel.test.tsx docs/backup-restore.md
git commit -m "Connect encrypted backup and restore UI"
```
