# Frontend Project Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the React frontend into explicit app-shell, API, feature, component, style, and test ownership without changing behavior.

**Architecture:** Preserve the existing feature-first layout. Rename the Tauri bridge from generic `lib` to `api`, move shell-only components under `app`, keep the one cross-feature action component under `components`, and partition global CSS in unchanged cascade order.

**Tech Stack:** React 19, TypeScript 5, Vite 7, Bun 1.3, Tauri JavaScript API.

## Global Constraints

- Keep all runtime behavior, command names, event names, DTO shapes, and selectors unchanged.
- Add no dependencies, abstractions, or new test files.
- Keep feature tests beside their current feature.
- Use Bun only for frontend commands.
- Do not edit generated `dist` content.

---

## File Map

- `src/app/`: application composition and shell-only UI.
- `src/api/`: Tauri commands, events, DTO types, and their existing contract test.
- `src/components/`: UI shared by more than one feature.
- `src/features/`: unchanged feature ownership.
- `src/styles/`: tokens, base rules, shell rules, and feature style files.
- `src/test/`: shared Bun test setup.

### Task 1: Rename The Tauri Bridge

**Files:**
- Move: `src/lib/commands.ts` -> `src/api/commands.ts`
- Move: `src/lib/commands.test.ts` -> `src/api/commands.test.ts`
- Move: `src/lib/events.ts` -> `src/api/events.ts`
- Move: `src/lib/types.ts` -> `src/api/types.ts`
- Modify: all `src/**/*.ts` and `src/**/*.tsx` imports containing `/lib/`

**Interfaces:**
- Consumes: Existing `commands`, `commandNames`, `CommandError`, `listenEvent`, and DTO exports.
- Produces: Identical exports under `src/api/*`.

- [ ] **Step 1: Record baseline checks**

```powershell
bun test
bun run build
```

Expected: tests pass and Vite build exits `0`.

- [ ] **Step 2: Move API files**

```powershell
New-Item -ItemType Directory -Force src\api | Out-Null
git mv src/lib/commands.ts src/api/commands.ts
git mv src/lib/commands.test.ts src/api/commands.test.ts
git mv src/lib/events.ts src/api/events.ts
git mv src/lib/types.ts src/api/types.ts
```

- [ ] **Step 3: Update import prefixes**

Apply these exact mechanical replacements in tracked frontend source files:

```text
../lib/       -> ../api/
../../lib/    -> ../../api/
```

Keep relative imports inside `src/api` unchanged: `./commands`, `./events`, and `./types`. `src/api/commands.test.ts` continues importing `../test/setup`.

- [ ] **Step 4: Verify no old imports remain**

```powershell
rg -n '/lib/' src
bun test
bun run build
```

Expected: `rg` finds nothing; tests and build pass.

- [ ] **Step 5: Commit**

```powershell
git add src/api src/app src/components src/features
git commit -m "refactor: name frontend Tauri API boundary"
```

### Task 2: Move Shell Components Into App

**Files:**
- Move: `src/components/AppSidebar.tsx` -> `src/app/components/AppSidebar.tsx`
- Move: `src/components/TopBar.tsx` -> `src/app/components/TopBar.tsx`
- Modify: `src/app/App.tsx`
- Keep: `src/components/ItemActions.tsx`

**Interfaces:**
- Consumes: Existing default exports from `AppSidebar` and `TopBar`.
- Produces: Same components owned by the app shell.

- [ ] **Step 1: Move shell-only components**

```powershell
New-Item -ItemType Directory -Force src\app\components | Out-Null
git mv src/components/AppSidebar.tsx src/app/components/AppSidebar.tsx
git mv src/components/TopBar.tsx src/app/components/TopBar.tsx
```

- [ ] **Step 2: Update app imports**

```tsx
import AppSidebar from "./components/AppSidebar";
import TopBar from "./components/TopBar";
```

Do not move `ItemActions.tsx`; clipboard and snippet features both consume it.

- [ ] **Step 3: Verify component ownership**

```powershell
rg -n 'components/(AppSidebar|TopBar)' src
bun test
bun run build
```

Expected: only `src/app/App.tsx` imports shell components; tests and build pass.

- [ ] **Step 4: Commit**

```powershell
git add src/app src/components
git commit -m "refactor: colocate application shell components"
```

### Task 3: Split Global Styles By Ownership

**Files:**
- Move: `src/styles.css` -> `src/styles/index.css`
- Keep: `src/styles/tokens.css`
- Create: `src/styles/base.css`
- Create: `src/styles/shell.css`
- Create: `src/styles/features/clipboard.css`
- Create: `src/styles/features/snippets.css`
- Create: `src/styles/features/templates.css`
- Create: `src/styles/features/settings.css`
- Create: `src/styles/features/tools.css`
- Create: `src/styles/features/activity.css`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: Existing global class names and custom properties.
- Produces: One ordered stylesheet entry point at `src/styles/index.css`.

- [ ] **Step 1: Create the ordered style entry point**

Use this complete content in `src/styles/index.css` after moving rules to their owner files:

```css
@import "./tokens.css";
@import "./base.css";
@import "./shell.css";
@import "./features/clipboard.css";
@import "./features/snippets.css";
@import "./features/templates.css";
@import "./features/settings.css";
@import "./features/tools.css";
@import "./features/activity.css";
```

- [ ] **Step 2: Partition existing rules without editing declarations**

Move each complete rule and its relevant media-query branch exactly once:

```text
base.css       = element defaults, focus styles, .sr-only, @keyframes spin,
                 prefers-reduced-motion
shell.css      = .app-shell, sidebar, brand, navigation, workspace, top bar,
                 generic content heading/panel/state/dialog/button layout
clipboard.css  = history summary, tracking controls, clipboard list/item,
                 item action menu, empty dock, loading state, undo toast
snippets.css   = snippet editor/page/list/detail and .code-view* rules
templates.css  = .template-* rules
settings.css   = .settings-grid and .checkbox-line rules
tools.css      = .tool-* rules
activity.css   = .activity-* rules
```

When one existing media query contains selectors for several owners, split that media query into owner files while preserving its condition and declaration bodies. Do not rename selectors or reorder declarations within a rule.

- [ ] **Step 3: Update the application entry import**

```tsx
import "./styles/index.css";
```

- [ ] **Step 4: Verify stylesheet coverage and build**

```powershell
rg -n 'styles\.css' src
rg -n '@import' src/styles/index.css
bun test
bun run build
```

Expected: no old `styles.css` import; nine ordered imports; tests and build pass.

- [ ] **Step 5: Commit**

```powershell
git add src/styles src/main.tsx
git commit -m "refactor: split frontend styles by ownership"
```

### Task 4: Frontend Final Audit

**Files:**
- Modify only stale imports or paths found by audit.

**Interfaces:**
- Consumes: Completed frontend structure.
- Produces: Clean frontend build with no legacy paths.

- [ ] **Step 1: Scan structure and stale paths**

```powershell
rg --files src | Sort-Object
rg -n '/lib/|src/lib|styles\.css|components/(AppSidebar|TopBar)' src bunfig.toml tsconfig.json vite.config.ts
git diff --check
```

Expected: no stale path matches and no whitespace errors.

- [ ] **Step 2: Run full frontend verification**

```powershell
bun test
bun run build
```

Expected: all existing tests pass and production build exits `0`.

- [ ] **Step 3: Commit audit corrections when present**

```powershell
git add src bunfig.toml tsconfig.json vite.config.ts
git diff --cached --quiet; if ($LASTEXITCODE -ne 0) { git commit -m "refactor: finish frontend structure migration" }
```

