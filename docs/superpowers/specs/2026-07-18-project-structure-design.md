# SnipDock Project Structure Design

## Goal

Reorganize SnipDock around clear ownership without changing behavior, public command names, database formats, or runtime dependencies. Keep Tauri's conventional `src-tauri` boundary and the frontend's existing feature-first organization.

## Chosen Approach

Use a hybrid feature-first structure. User-facing capabilities remain grouped as features. Shared application lifecycle, IPC, storage, models, and Windows integration receive explicit technical boundaries where feature ownership would be artificial.

Pure feature folders were rejected because the SQLite repository and shared models serve several features. Pure technical layers were rejected because they would continue scattering each capability across unrelated folders.

## Frontend Structure

```text
src/
  app/
    App.tsx
    App.test.tsx
    components/
      AppSidebar.tsx
      TopBar.tsx
  api/
    commands.ts
    commands.test.ts
    events.ts
    types.ts
  components/
    ItemActions.tsx
  features/
    activity/
    clipboard/
    library/
    settings/
    snippets/
    templates/
    tools/
  styles/
    base.css
    shell.css
    features/
  test/
    setup.ts
  main.tsx
  vite-env.d.ts
```

`app` owns composition and shell-only components. `api` owns the Tauri IPC contract and shared DTO types. `components` remains the small home for UI used by multiple features. Feature-local components and tests stay beside their feature. The monolithic stylesheet is split by responsibility while preserving selectors and cascade order.

## Backend Structure

```text
src-tauri/src/
  app/
    mod.rs
    state.rs
    tray.rs
  commands/
    mod.rs
    clipboard.rs
    library.rs
    organization.rs
    settings.rs
    content.rs
    transfer.rs
  storage/
    mod.rs
    database.rs
    items.rs
    organization.rs
    settings.rs
  features/
    mod.rs
    ai.rs
    clipboard/
      mod.rs
      capture.rs
      monitor.rs
    detection.rs
    formatting.rs
    security.rs
    sync.rs
    templates.rs
    tools.rs
    transfer.rs
  models/
    mod.rs
    library.rs
    settings.rs
    operations.rs
  platform/
    mod.rs
    windows.rs
  error.rs
  lib.rs
  main.rs
```

`app` owns startup, managed state, window lifecycle, and tray behavior. `commands` contains thin Tauri adapters grouped by command surface: item/search commands in `library`, project/tag/category commands in `organization`, formatting/template/tool/AI commands in `content`, and import/export/backup commands in `transfer`. `storage` owns SQLite access split from the current repository into item/search, organization, and settings implementations. `features` owns domain operations that do not belong in command adapters or storage. `models` groups serialized request, response, and domain data. `platform` isolates Windows-specific behavior.

## Compatibility And Data Flow

Frontend flow remains `feature UI -> api/commands -> Tauri command`. Backend flow remains `command adapter -> feature/storage -> result or AppError`. Command names, payload shapes, emitted event names, migration files, and database schema remain unchanged.

`src-tauri/src/lib.rs` remains the crate entry point and will re-export moved modules under existing public names while callers migrate. Re-exports with remaining integration-test or application callers stay in place at the end of this refactor.

## Error Handling

Keep `AppError` and existing error codes as the single command-boundary error format. Moving code must not replace typed errors with strings or change user-visible messages. Storage modules continue mapping SQL failures to repository/storage errors before command adapters convert them to `AppError`.

## Migration Sequence

1. Move frontend shell, API, shared UI, and test setup; update imports and Bun preload path.
2. Split frontend CSS while preserving import order and selectors.
3. Move backend application lifecycle and platform code.
4. Split models and storage behind compatibility re-exports.
5. Split command adapters and move standalone feature modules.
6. Remove obsolete compatibility paths after all callers use canonical modules.

Use Git-aware moves where practical. Each phase must compile before proceeding so failures stay attributable to a small move set.

## Verification

No new behavior or test scenarios are required for this refactor. Existing checks provide regression coverage:

```powershell
bun test
bun run build
cargo test --manifest-path src-tauri\Cargo.toml
```

Also scan for stale imports and old paths after moves. Generated `dist`, `src-tauri/gen`, and `src-tauri/target` content is not part of the restructure.

## Non-Goals

- Renaming `src-tauri`
- Changing features or UI behavior
- Changing command names, event names, DTO serialization, migrations, or database schema
- Adding dependencies or abstractions
- Reorganizing generated output
