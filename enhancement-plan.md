# SnipDock Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the project-local `snipdock-task` skill and implement exactly one numbered task per run. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved five-destination SnipDock redesign with local fonts, dual themes, global search, working filters, consolidated organization, and removal of misleading scaffold features.

**Architecture:** Keep React 19, Tauri 2, hash navigation, typed command wrappers, and the existing CSS structure. Reuse `SearchQuery`, `useLibraryQuery`, item actions, and keyboard behavior; add no router, state library, UI framework, or runtime network request. Preserve database compatibility while deleting retired frontend and command surface.

**Tech Stack:** React 19, TypeScript 7, CSS, Bun 1.3.14, Tauri 2, Rust, SQLite.

**Design specification:** `docs/superpowers/specs/2026-07-19-frontend-redesign-design.md`

## Global Constraints

- Use Bun for frontend commands; never use npm, yarn, pnpm, or direct Node.js commands.
- Add no JavaScript or Rust dependency unless a task explicitly changes this rule. None currently does.
- Bundle Plus Jakarta Sans, Inter, and JetBrains Mono as local WOFF2 assets with their license texts; make no runtime font request.
- Support system, light, and dark themes. Both explicit themes must meet WCAG AA for task-critical text.
- Preserve semantic controls, keyboard access, visible focus, reduced-motion behavior, and 32px minimum interactive targets.
- Preserve current database columns and migrations. No destructive schema cleanup belongs to this plan.
- Each task begins with its smallest failing check for changed logic, runs every listed check, updates `PROGRESS.md`, stages only task-owned files, and creates one local commit.
- UI tasks require the `frontend-design` skill, browser inspection when the app can run, and screenshots or concise inspection notes in `PROGRESS.md`.
- Keep existing user changes. Stop on an unrelated dirty worktree or unfinished `[~]` task.

---

## File map

- `src/styles/fonts.css`: local font-face declarations only.
- `src/styles/tokens.css`: theme colors, typography, spacing, radii, shadows, and semantic tokens.
- `src/styles/base.css`: element resets, shared focus, reduced motion, and screen-reader helpers.
- `src/styles/shell.css`: app shell, navigation, top bar, global headings, panels, dialogs, shared buttons, badges, chips, and responsive shell rules.
- `src/styles/features/*.css`: feature layouts only; shared control styling must not be copied into these files.
- `src/app/App.tsx`: hash destination, global query, prior-page restoration, and page composition.
- `src/app/components/TopBar.tsx`: controlled global search and offline status.
- `src/features/search/`: combined search query, results, actions, states, and tests.
- `src/features/clipboard/`: clipboard query/filter behavior and capture-card presentation.
- `src/features/snippets/`: active Library item list, detail, editor, filters, and maintenance behavior.
- `src/features/library/`: reusable query state and organization views for projects, categories, and tags.
- `src/features/settings/`: working settings panels only.
- `src/api/`: typed wrappers for command surface that remains reachable.
- `src-tauri/src/`: retired fake command removal; retained search, security boundary, storage, and tool behavior.

---

### Task 1: Remove Activity and fake reminder surface

**Goal:** Remove the Activity destination and misleading reminder/recommendation UI while keeping expiry data compatible.

**Dependencies:** None.

**UI:** yes.

**Files:**
- Delete: `src/features/activity/ActivityPage.tsx`
- Delete: `src/features/activity/ActivityPage.test.tsx`
- Delete: `src/features/activity/ReminderEditor.tsx`
- Delete: `src/features/activity/Recommendations.tsx`
- Delete: `src/styles/features/activity.css`
- Modify: `src/app/App.tsx`
- Modify: `src/app/components/AppSidebar.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/styles/index.css`
- Modify: `README.md`
- Modify: `docs/release-checklist.md`

**Interfaces:**
- Removes hash destination `#activity` and the Activity navigation link.
- Keeps `LibraryItem.expires_at` and storage behavior unchanged for database compatibility.

**Work:**

- [ ] Change `App.test.tsx` to expect no Activity link and five eventual product destinations only after later removals; for this task assert Activity is absent while current remaining links still work.
- [ ] Run `bun test src/app/App.test.tsx` and confirm failure because Activity is still rendered.
- [ ] Remove Activity imports, routing, navigation, CSS import, feature files, and README/release-checklist claims.
- [ ] Run targeted test and TypeScript check.
- [ ] Update `PROGRESS.md` and commit.

**Checks:**

```powershell
bun test src/app/App.test.tsx
bun run lint
git diff --check
```

**Commit:** `refactor: remove activity scaffold`

---

### Task 2: Remove fake AI surface end to end

**Goal:** Delete the fake local AI provider and all controls that imply usable AI integration.

**Dependencies:** Task 1.

**UI:** yes.

**Files:**
- Delete: `src/features/snippets/AiActions.tsx`
- Delete: `src/features/snippets/AiActions.test.tsx`
- Delete: `src/features/settings/AiSettings.tsx`
- Delete: `src-tauri/src/features/ai.rs`
- Modify: `src/features/snippets/SnippetDetail.tsx`
- Modify: `src/features/settings/SettingsPage.tsx`
- Modify: `src/api/types.ts`
- Modify: `src/api/commands.ts`
- Modify: `src/api/commands.test.ts`
- Modify: `src-tauri/src/features/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/commands/content.rs`
- Modify: `src-tauri/src/models/operations.rs`
- Modify: `README.md`
- Modify: `docs/privacy.md`
- Modify: `docs/release-checklist.md`

**Interfaces:**
- Removes `AiRequest`, `AiResult`, `commands.runAiAction`, and Tauri command `run_ai_action`.
- `SnippetDetail` retains copy, formatting, private preview, and other non-AI actions.

**Work:**

- [ ] Update API command tests so the expected command registry excludes `run_ai_action`.
- [ ] Run `bun test src/api/commands.test.ts` and confirm it fails while AI remains registered.
- [ ] Remove frontend UI/types/wrapper and Rust model/command/module registration without changing private-item export protection.
- [ ] Remove documentation claims about AI consent or provider boundaries.
- [ ] Run targeted frontend and Rust checks.
- [ ] Update `PROGRESS.md` and commit.

**Checks:**

```powershell
bun test src/api/commands.test.ts src/features/snippets/SnippetPage.test.tsx
bun run lint
cargo test --manifest-path src-tauri/Cargo.toml security
git diff --check
```

**Commit:** `refactor: remove fake ai surface`

---

### Task 3: Remove fake sync and unenforced lock controls

**Goal:** Remove sync status and PIN lock UI/commands while retaining real private-item boundary helpers.

**Dependencies:** Task 2.

**UI:** yes.

**Files:**
- Delete: `src/features/settings/SyncSettings.tsx`
- Delete: `src/features/settings/SecurityPanel.tsx`
- Delete: `src/features/settings/SecurityPanel.test.tsx`
- Delete: `src-tauri/src/features/sync.rs`
- Modify: `src/features/settings/SettingsPage.tsx`
- Modify: `src/api/types.ts`
- Modify: `src/api/commands.ts`
- Modify: `src/api/commands.test.ts`
- Modify: `src-tauri/src/features/security.rs`
- Modify: `src-tauri/src/features/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/commands/settings.rs`
- Modify: `src-tauri/src/models/operations.rs`
- Modify: `README.md`
- Modify: `docs/privacy.md`
- Modify: `docs/release-checklist.md`

**Interfaces:**
- Removes `UnlockRequest`, `UnlockResult`, `SyncStatus`, `commands.lockApp`, `commands.unlockApp`, and `commands.getSyncStatus`.
- Keeps `security::protect_text` and `security::reject_private` signatures unchanged.

**Work:**

- [ ] Update API tests to exclude `lock_app`, `unlock_app`, and `get_sync_status`; keep private boundary assertions.
- [ ] Run targeted frontend tests and confirm failure while retired commands remain.
- [ ] Delete sync and lock callers, types, command registrations, and unenforced atomic lock state.
- [ ] Keep hash protection/private export helpers and database fields intact.
- [ ] Correct privacy and release documentation.
- [ ] Run targeted frontend and Rust checks.
- [ ] Update `PROGRESS.md` and commit.

**Checks:**

```powershell
bun test src/api/commands.test.ts
bun run lint
cargo test --manifest-path src-tauri/Cargo.toml security
git diff --check
```

**Commit:** `refactor: remove fake sync and lock controls`

---

### Task 4: Prune inert settings controls

**Goal:** Show only settings with verified callers while retaining stored schema fields for compatibility.

**Dependencies:** Task 3.

**UI:** yes.

**Files:**
- Modify: `src/features/settings/SettingsPage.tsx`
- Create: `src/features/settings/SettingsPage.test.tsx`
- Modify: `src/styles/features/settings.css`

**Interfaces:**
- Retains panels/components `TransferPanel` and `BackupPanel`.
- Retains working theme, clipboard tracking, history retention, maximum items, and runtime-backed behavior found by caller inspection.
- Does not change the serialized `Settings` interface or SQLite settings payload in this task.

**Work:**

- [ ] Add settings tests that assert retained labels and absence of controls with no runtime caller.
- [ ] Run the settings test and confirm inert controls are still present.
- [ ] Trace every candidate setting with `rg`; remove only JSX and reset-group entries lacking behavior outside persistence/validation.
- [ ] Keep runtime-backed settings even when omitted from the supplied mockup, and record their callers in `PROGRESS.md`.
- [ ] Run targeted tests and lint.
- [ ] Update `PROGRESS.md` and commit.

**Checks:**

```powershell
bun test src/features/settings
bun run lint
git diff --check
```

**Commit:** `refactor: prune inert settings controls`

---

### Task 5: Add local fonts and dual-theme tokens

**Goal:** Establish the approved visual foundation without runtime network access.

**Dependencies:** Task 4.

**UI:** yes.

**Files:**
- Create: `src/assets/fonts/PlusJakartaSans-Variable.woff2`
- Create: `src/assets/fonts/Inter-Variable.woff2`
- Create: `src/assets/fonts/JetBrainsMono-Variable.woff2`
- Create: `src/assets/fonts/PlusJakartaSans-OFL.txt`
- Create: `src/assets/fonts/Inter-OFL.txt`
- Create: `src/assets/fonts/JetBrainsMono-OFL.txt`
- Create: `src/styles/fonts.css`
- Modify: `src/styles/index.css`
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/base.css`
- Create: `src/styles/tokens.test.ts`

**Interfaces:**
- Defines `--font-display`, `--font-body`, and `--font-mono`.
- Keeps existing semantic token names usable during migration, then maps them to approved light/dark values.
- `data-theme="light"` and `data-theme="dark"` override system preference; no attribute follows `prefers-color-scheme`.

**Work:**

- [ ] Add `tokens.test.ts` using `Bun.file` to prove both explicit theme selectors and local font URLs exist, with no `http`, `fonts.googleapis.com`, or `fonts.gstatic.com` reference.
- [ ] Run the test and confirm the new tokens/assets are absent.
- [ ] Vendor official variable WOFF2 files and matching SIL Open Font License texts under the exact paths above.
- [ ] Add font-face declarations using `font-display: swap` and system fallbacks.
- [ ] Replace theme values with the approved specification palette; retain code syntax tokens with AA contrast.
- [ ] Verify font requests resolve locally in the running Vite app and inspect both explicit themes.
- [ ] Run targeted tests, lint, and build.
- [ ] Update `PROGRESS.md` and commit.

**Checks:**

```powershell
bun test src/styles/tokens.test.ts
bun run lint
bun run build
git diff --check
```

**Commit:** `style: add local fonts and dual themes`

---

### Task 6: Redesign shell and five-item navigation

**Goal:** Deliver the responsive shell, shared control hierarchy, and final primary navigation.

**Dependencies:** Task 5.

**UI:** yes.

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/components/AppSidebar.tsx`
- Modify: `src/app/components/TopBar.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/styles/base.css`
- Modify: `src/styles/shell.css`

**Interfaces:**
- Final destinations: `clipboard`, `library`, `templates`, `tools`, `settings`.
- `#snippets` and `#projects` temporarily redirect/render Library until their feature consolidation tasks remove compatibility branches.
- Shared classes: `.button-primary`, `.button-secondary`, `.button-ghost`, `.filter-chip`, `.type-badge`, `.section-panel`, and `.toggle-row`.

**Work:**

- [ ] Update App tests for exactly five navigation links, correct `aria-current`, hash compatibility, and accessible collapsed labels.
- [ ] Run App tests and confirm current shell fails the final navigation assertions.
- [ ] Redesign sidebar, icons, brand, local status, top bar, headings, buttons, panels, chips, fields, dialogs, and focus-within action visibility.
- [ ] Keep real links/buttons and current hash behavior; avoid decorative wrapper controls.
- [ ] Inspect wide and narrow shells in browser with keyboard navigation.
- [ ] Run targeted tests, lint, and build.
- [ ] Update `PROGRESS.md` and commit.

**Checks:**

```powershell
bun test src/app/App.test.tsx
bun run lint
bun run build
git diff --check
```

**Commit:** `style: redesign application shell`

---

### Task 7: Add controlled global search and combined results

**Goal:** Make top-bar search query Clipboard and Library records from every destination and restore the prior page when cleared.

**Dependencies:** Task 6.

**UI:** yes.

**Files:**
- Create: `src/features/search/SearchResultsPage.tsx`
- Create: `src/features/search/SearchResultsPage.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/components/TopBar.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/components/ItemActions.tsx`
- Modify: `src/features/library/useLibraryQuery.ts`
- Modify: `src/styles/shell.css`
- Modify: `src/styles/features/snippets.css`

**Interfaces:**

```ts
interface TopBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  onClear: () => void;
}

interface SearchResultsPageProps {
  query: string;
}
```

Extend `useLibraryQuery` with optional `{ controlledText, initialKinds }`. Existing no-argument callers keep their behavior. The hook returns `{ status, items, total, offset, nextPage, previousPage, refresh }` and continues to ignore stale responses by request sequence.

**Work:**

- [ ] Add tests for combined kinds, non-empty query rendering, stale response rejection, paging, Escape clearing, safe copy/pin/favorite actions, and prior-page restoration.
- [ ] Run search/App tests and confirm no controlled search view exists.
- [ ] Extend and reuse `useLibraryQuery`; do not add a second search-fetch hook.
- [ ] Lift query state into `App`, render results while trimmed query is non-empty, and restore the prior hash destination on clear.
- [ ] Query `search_items` with all five stored kinds and show kind/type badges, preview, flags, metadata, loading/error/empty states, paging, and safe item actions.
- [ ] Keep delete/edit in source workflows; results expose Copy, Pin/Favorite, and Open source.
- [ ] Inspect search from Clipboard, Tools, and Settings; verify keyboard focus and clearing.
- [ ] Run targeted tests, lint, and build.
- [ ] Update `PROGRESS.md` and commit.

**Checks:**

```powershell
bun test src/app/App.test.tsx src/features/search/SearchResultsPage.test.tsx
bun run lint
bun run build
git diff --check
```

**Commit:** `feat: add global library search`

---

### Task 8: Add Clipboard filter behavior

**Goal:** Add backend-driven All, Code, Pinned, and Favorites filters without breaking capture refresh or keyboard selection.

**Dependencies:** Task 7.

**UI:** yes.

**Files:**
- Modify: `src/features/clipboard/ClipboardPage.tsx`
- Modify: `src/features/clipboard/ClipboardPage.test.tsx`
- Modify: `src/styles/features/clipboard.css`

**Interfaces:**

```ts
type ClipboardFilter = "all" | "code" | "pinned" | "favorite";
```

- `code` maps to every `ContentType` except `plain_text`.
- `pinned` maps to `SearchQuery.pinned = true`.
- `favorite` maps to `SearchQuery.favorite = true`.

**Work:**

- [ ] Add tests that inspect `search_items` arguments for each filter, filtered-empty copy, clear-filter behavior, capture refresh using the active filter, and selected-row repair.
- [ ] Run Clipboard tests and confirm filter controls/query mapping are absent.
- [ ] Store the active filter, derive `SearchQuery`, centralize refresh so initial load and capture events use the same query, and ignore stale loads.
- [ ] Render semantic pressed-state chips and a filtered count; do not add a Secrets chip.
- [ ] Inspect all filters with populated and empty results using keyboard only.
- [ ] Run targeted tests and lint.
- [ ] Update `PROGRESS.md` and commit.

**Checks:**

```powershell
bun test src/features/clipboard/ClipboardPage.test.tsx
bun run lint
git diff --check
```

**Commit:** `feat: add clipboard filters`

---

### Task 9: Redesign Clipboard capture cards

**Goal:** Apply the docked-card signature, content-type badges, private labeling, and stable action rail.

**Dependencies:** Task 8.

**UI:** yes.

**Files:**
- Modify: `src/features/clipboard/ClipboardItem.tsx`
- Modify: `src/features/clipboard/ClipboardPage.tsx`
- Modify: `src/features/clipboard/ClipboardPage.test.tsx`
- Modify: `src/components/ItemActions.tsx`
- Modify: `src/styles/features/clipboard.css`

**Interfaces:**
- Badge label prefers `item.language` for `content_type === "code"`; otherwise uses the existing content-type label.
- Private items always show text `Private` plus a lock-shaped SVG; color is supplementary.

**Work:**

- [ ] Add rendering tests for plain/code/language/private badges, flags, timestamps, text-safe previews, and keyboard-visible actions.
- [ ] Run Clipboard tests and confirm current row markup lacks required badges.
- [ ] Refactor row markup into semantic docked cards without changing roving selection, action callbacks, or safe text rendering.
- [ ] Clamp previews, reserve action width to prevent hover shift, and keep actions visible under `:focus-within` and touch/coarse-pointer conditions.
- [ ] Inspect dark/light populated, private, long-content, selected, hover, and focus states.
- [ ] Run targeted tests, lint, and build.
- [ ] Update `PROGRESS.md` and commit.

**Checks:**

```powershell
bun test src/features/clipboard/ClipboardPage.test.tsx
bun run lint
bun run build
git diff --check
```

**Commit:** `style: redesign clipboard cards`

---

### Task 10: Consolidate active Library query, filters, and item workflow

**Goal:** Replace the split Snippet/unused Library implementations with one searchable Library destination that retains full item CRUD.

**Dependencies:** Task 9.

**UI:** yes.

**Files:**
- Modify: `src/features/snippets/SnippetPage.tsx`
- Modify: `src/features/snippets/SnippetPage.test.tsx`
- Modify: `src/features/library/useLibraryQuery.ts`
- Modify: `src/features/library/FilterPanel.tsx`
- Delete: `src/features/library/LibraryList.tsx`
- Delete: `src/features/library/LibraryList.test.tsx`
- Delete: `src/features/library/SearchBar.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/styles/features/snippets.css`

**Interfaces:**
- `useLibraryQuery` owns text-free Library filters, sort, paging, loading/error state, and `refresh`.
- Quick filters: All, Snippets, Commands, Templates, Notes, Pinned, Favorites.
- Advanced filters: content type, project, category, tag, created-from, created-to, and sort.
- Library kinds exclude Clipboard.

**Work:**

- [ ] Expand SnippetPage tests for Library heading/hash, quick and advanced query mapping, paging, filtered empty state, CRUD refresh, roving selection, undo, and existing detail/editor actions.
- [ ] Run Snippet/App tests and confirm the active page lacks query filters and Library routing.
- [ ] Fold useful `LibraryList` query behavior into `SnippetPage`/`useLibraryQuery`; keep one list/detail/editor implementation.
- [ ] Redesign `FilterPanel` as quick chips plus a compact advanced filter disclosure using native controls and removable active chips.
- [ ] Delete redundant Library page/search component only after all callers move.
- [ ] Inspect filters, pagination, create/edit/delete/undo, detail actions, and empty/error states in both themes.
- [ ] Run targeted tests, lint, and build.
- [ ] Update `PROGRESS.md` and commit.

**Checks:**

```powershell
bun test src/app/App.test.tsx src/features/snippets/SnippetPage.test.tsx src/features/snippets/SnippetEditor.test.tsx
bun run lint
bun run build
git diff --check
```

**Commit:** `feat: consolidate searchable library`

---

### Task 11: Merge projects, categories, and tags into Library

**Goal:** Remove Projects as a primary page while retaining complete organization management inside Library.

**Dependencies:** Task 10.

**UI:** yes.

**Files:**
- Create: `src/features/library/LibraryOrganization.tsx`
- Create: `src/features/library/LibraryOrganization.test.tsx`
- Modify: `src/features/library/ProjectsPanel.tsx`
- Modify: `src/features/library/ProjectsPanel.test.tsx`
- Modify: `src/features/library/TagsPanel.tsx`
- Modify: `src/features/library/TagsPanel.test.tsx`
- Modify: `src/features/snippets/SnippetPage.tsx`
- Modify: `src/features/snippets/SnippetPage.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/styles/features/snippets.css`

**Interfaces:**

```ts
type LibraryView = "items" | "organization";
type OrganizationView = "projects" | "categories-tags";
```

- `ProjectsPanel` and `TagsPanel` become embeddable sections without their own `<main>` or `workspace-title`.
- Remove the temporary `#projects` and `#snippets` compatibility branches after Library consolidation; unknown hashes use the normal Clipboard fallback.

**Work:**

- [ ] Add integration tests for switching Library views, project CRUD/archive/item assignment, category/tag CRUD/merge, returning to items, and absence of Projects navigation.
- [ ] Run tests and confirm organization remains a separate page/unreachable component.
- [ ] Extract embeddable project and taxonomy content with unique local heading IDs.
- [ ] Add Library Items/Organize view switch and preserve existing command behavior and focus restoration.
- [ ] Remove final Projects render branch/import from `App` while keeping hash compatibility redirect.
- [ ] Inspect organization at wide/narrow widths and keyboard through every switch/control.
- [ ] Run targeted tests, lint, and build.
- [ ] Update `PROGRESS.md` and commit.

**Checks:**

```powershell
bun test src/app/App.test.tsx src/features/snippets/SnippetPage.test.tsx src/features/library/ProjectsPanel.test.tsx src/features/library/TagsPanel.test.tsx src/features/library/LibraryOrganization.test.tsx
bun run lint
bun run build
git diff --check
```

**Commit:** `feat: merge organization into library`

---

### Task 12: Redesign Templates workspace

**Goal:** Apply the approved editor/fill/preview hierarchy without changing rendering behavior.

**Dependencies:** Task 11.

**UI:** yes.

**Files:**
- Modify: `src/features/templates/TemplateEditor.tsx`
- Modify: `src/features/templates/TemplateFillDialog.tsx`
- Modify: `src/features/templates/TemplatePreview.tsx`
- Create: `src/features/templates/TemplateEditor.test.tsx`
- Modify: `src/styles/features/templates.css`

**Interfaces:**
- Keep existing placeholder extraction, `commands.renderTemplate`, save-template, copy-rendered, and save-snippet flows.
- Save template is primary in editor; Copy rendered is primary in ready preview; all unavailable actions use native `disabled`.

**Work:**

- [ ] Add tests for placeholder changes, render loading/error/diagnostics, disabled preview actions, save, copy, save-as-snippet, and clipboard import.
- [ ] Run the new test and confirm current layout/state semantics miss assertions.
- [ ] Restructure markup into responsive panels with panel labels/descriptions and one primary action per panel.
- [ ] Add ready/needs-values status badges and intentional incomplete preview copy.
- [ ] Inspect light/dark, zero/multiple placeholders, diagnostics, long output, and narrow stacking.
- [ ] Run targeted tests, lint, and build.
- [ ] Update `PROGRESS.md` and commit.

**Checks:**

```powershell
bun test src/features/templates/TemplateEditor.test.tsx
bun run lint
bun run build
git diff --check
```

**Commit:** `style: redesign templates workspace`

---

### Task 13: Redesign and group offline Tools

**Goal:** Deliver the grouped searchable tool list, clear action hierarchy, and useful output states.

**Dependencies:** Task 12.

**UI:** yes.

**Files:**
- Modify: `src/features/tools/ToolsPage.tsx`
- Modify: `src/features/tools/ToolsPage.test.tsx`
- Modify: `src/features/tools/ToolForm.tsx`
- Modify: `src/styles/features/tools.css`

**Interfaces:**
- Groups: Encoding (`base64_*`, `url_*`, `jwt_decode`), Generators (`uuid`, `sha256`), Text and data (remaining tools).
- Tool IDs and `commands.runTool` request shapes remain unchanged.

**Work:**

- [ ] Expand tests for group labels, search preserving/repairing selection, Run as sole primary action, disabled output actions, warnings, errors, and empty output.
- [ ] Run Tools tests and confirm grouping/state hierarchy is absent.
- [ ] Render semantic grouped options and restyle the workspace; do not rewrite Rust tool logic.
- [ ] Give output distinct empty, running, result, warning, and error states with live announcements where state changes.
- [ ] Inspect regex/diff multi-input forms, long output, no matches, narrow layout, and keyboard selection.
- [ ] Run targeted tests, lint, and build.
- [ ] Update `PROGRESS.md` and commit.

**Checks:**

```powershell
bun test src/features/tools/ToolsPage.test.tsx
bun run lint
bun run build
git diff --check
```

**Commit:** `style: redesign offline tools`

---

### Task 14: Redesign working Settings panels

**Goal:** Organize retained settings by task and make dry-run/options accessible and explanatory.

**Dependencies:** Task 13.

**UI:** yes.

**Files:**
- Modify: `src/features/settings/SettingsPage.tsx`
- Modify: `src/features/settings/SettingsPage.test.tsx`
- Modify: `src/features/settings/TransferPanel.tsx`
- Modify: `src/features/settings/TransferPanel.test.tsx`
- Modify: `src/features/settings/BackupPanel.tsx`
- Modify: `src/styles/features/settings.css`
- Modify: `src/styles/features/snippets.css`

**Interfaces:**
- Panels: Clipboard, Appearance, Transfer, Backup, Privacy.
- Theme values remain `system | light | dark`.
- Dry-run controls remain checkbox inputs styled as switches, with visible label and consequence description.

**Work:**

- [ ] Add/expand tests for panel headings, one primary action per panel, theme application, clipboard validation, transfer dry-run/import states, backup dry-run/restore confirmation, privacy copy, and removed controls.
- [ ] Run settings tests and confirm hierarchy/switch assertions fail.
- [ ] Split or compose focused panel markup only where it shortens `SettingsPage`; do not create generic form-schema infrastructure.
- [ ] Add compact internal panel index if the retained page still exceeds one typical desktop viewport.
- [ ] Preserve existing busy, result, error, confirmation, and validation behavior.
- [ ] Inspect both themes, all panels, keyboard switches, invalid inputs, narrow stacking, and long result messages.
- [ ] Run targeted tests, lint, and build.
- [ ] Update `PROGRESS.md` and commit.

**Checks:**

```powershell
bun test src/features/settings
bun run lint
bun run build
git diff --check
```

**Commit:** `style: redesign settings panels`

---

### Task 15: Complete cross-page responsive and accessibility pass

**Goal:** Verify and fix shared focus, contrast, target size, reduced motion, overflow, and compact-window behavior across the redesigned app.

**Dependencies:** Task 14.

**UI:** yes.

**Files:**
- Modify: `src/styles/base.css`
- Modify: `src/styles/shell.css`
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/features/clipboard.css`
- Modify: `src/styles/features/snippets.css`
- Modify: `src/styles/features/templates.css`
- Modify: `src/styles/features/tools.css`
- Modify: `src/styles/features/settings.css`
- Modify: affected `src/**/*.test.tsx` files only when an accessibility regression needs coverage

**Interfaces:**
- Breakpoints continue to use the existing compact ranges near 58rem, 50rem, 47rem, 38rem, and 31rem; consolidate duplicate rules when safe.
- No page-level horizontal scrollbar at the 22rem application minimum.

**Work:**

- [ ] Add the smallest regression assertions for any discovered semantic/focus failure before fixing it.
- [ ] Inspect Clipboard, Search, Library Items, Library Organize, Templates, Tools, and Settings in light/dark at wide, compact, and 22rem widths.
- [ ] Keyboard-test navigation, search, chips, advanced filters, roving lists, menus, dialogs, switches, editors, and disabled actions.
- [ ] Verify task-critical text contrast, 32px targets, focus visibility, no color-only states, reduced motion, and internal code/output scrolling.
- [ ] Fix only discovered cross-page issues; delete duplicate/dead CSS found during inspection.
- [ ] Run full frontend tests, lint, and build.
- [ ] Update `PROGRESS.md` with inspection matrix and commit.

**Checks:**

```powershell
bun test
bun run lint
bun run build
git diff --check
```

**Commit:** `fix: complete redesign accessibility pass`

---

### Task 16: Final cleanup, documentation, and integration verification

**Goal:** Remove leftover retired references, align documentation, and prove the complete redesign passes frontend and Rust checks.

**Dependencies:** Task 15.

**UI:** yes.

**Files:**
- Modify: `README.md`
- Modify: `docs/privacy.md`
- Modify: `docs/keyboard-shortcuts.md`
- Modify: `docs/release-checklist.md`
- Modify: `PROGRESS.md`
- Modify/Delete: only files proven unreachable by `rg` and build output

**Interfaces:**
- Documentation names the five destinations and only shipped behavior.
- No source or docs claim working AI, sync, reminders, PIN lock, or Activity.
- No runtime HTTP font reference or unused navigation hash remains.

**Work:**

- [ ] Search source/docs for `Activity`, `Reminder`, fake AI/provider copy, sync UI, lock UI, retired hashes, remote font URLs, and orphan imports; classify each surviving match before editing.
- [ ] Remove only unreachable leftovers and update README/privacy/shortcuts/release instructions to current behavior.
- [ ] Run all required frontend and Rust checks; fix failures caused by this plan without broadening product scope.
- [ ] Run the production frontend and Tauri development build when available; inspect one final light/dark workflow from capture through search, Library save, template render, tool run, and backup preview.
- [ ] Mark Task 16 complete, verify `16/16` progress, and commit.

**Checks:**

```powershell
bun test
bun run lint
bun run build
cargo test --manifest-path src-tauri/Cargo.toml
git diff --check
git status --short
```

**Commit:** `docs: finish frontend redesign`
