# Quick Paste and Clipboard Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated keyboard-driven Quick Paste popup, connect existing clipboard shortcuts, and show persisted tracking state correctly.

**Architecture:** Rust owns global shortcuts, external-window capture, popup visibility, and Windows paste injection. React renders either the main shell or a focused Quick Paste page according to the current Tauri window label. Existing commands, event helpers, search query types, and design tokens are reused.

**Tech Stack:** Tauri 2, Rust 2021, React 19, TypeScript, Tailwind v4, existing Windows APIs.

## Global Constraints

- Add no dependency and no separate frontend bundle.
- `Ctrl+Shift+V` opens Quick Paste without raising the main window.
- Clicking an item or pressing Enter pastes into the previously focused application and hides the popup only on success.
- Escape hides without changing clipboard content.
- Direct paste must fail when target restoration or input injection fails.
- Remove the dead new-snippet global shortcut.
- Reuse `getSettings()` for initial tracking state.
- Per user instruction, create no new test files and run no test or build command without explicit permission.
- Implementation checks are limited to code inspection and `git diff --check` until permission is granted.

---

### Task 1: Native Quick Paste Window and Honest Direct Paste

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/commands/clipboard.rs`
- Modify: `src-tauri/src/app/mod.rs`

**Interfaces:**
- Produces hidden Tauri window label `quick-paste`.
- Keeps command `direct_paste(id: String) -> Result<CopyReceipt, AppError>`.
- Emits `shortcut://open` after showing and focusing Quick Paste.

- [ ] **Step 1: Add the configured popup window**

Add a second `app.windows` entry:

```json
{
  "label": "quick-paste",
  "title": "Quick Paste",
  "width": 520,
  "height": 480,
  "center": true,
  "resizable": false,
  "decorations": false,
  "alwaysOnTop": true,
  "skipTaskbar": true,
  "visible": false
}
```

- [ ] **Step 2: Route the open shortcut to Quick Paste**

Set constants and helpers in `commands/mod.rs`:

```rust
const QUICK_PASTE_WINDOW: &str = "quick-paste";

fn show_quick_paste<R: tauri::Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(QUICK_PASTE_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
```

Remove `CmdOrCtrl+Shift+N`. Keep only `shortcut://search` in `WINDOW_RAISING_EVENTS`. In the handler, record `current_foreground_window()` only for `shortcut://open`, show Quick Paste, then emit the event. Other shortcuts must not overwrite the saved external target.

- [ ] **Step 3: Make direct paste report native failure**

Change `direct_paste_item` to require a target and check `restore_and_paste`:

```rust
let handle = target.ok_or_else(|| {
    AppError::new(ErrorCode::Clipboard, "no previous application is available for paste")
})?;
let receipt = copy_item(repository, monitor, id, CopyMode::Raw, write).await?;
if !direct_paste.restore_and_paste(handle) {
    return Err(AppError::new(
        ErrorCode::Clipboard,
        "could not restore the previous application and paste",
    ));
}
Ok(receipt)
```

After `actions::direct_paste_item` succeeds, hide `quick-paste` in the Tauri command. Do not hide on error.

- [ ] **Step 4: Keep popup closable without destroying it**

During app setup, attach a window event listener to `quick-paste`. On `CloseRequested`, call `api.prevent_close()` and hide the window. Leave focus-loss behavior unchanged so error messages remain visible.

- [ ] **Step 5: Inspect and commit**

Run only: `git diff --check`

Inspect the four changed files, then commit:

```powershell
git add -- src-tauri/tauri.conf.json src-tauri/src/commands/mod.rs src-tauri/src/commands/clipboard.rs src-tauri/src/app/mod.rs
git commit -m "Add native quick paste window"
```

### Task 2: Quick Paste React Page

**Files:**
- Create: `src/features/clipboard/QuickPastePage.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/api/commands.ts`
- Modify: `src/api/events.ts`

**Interfaces:**
- Produces `commands.directPaste(id: Id) -> Promise<CopyReceipt>`.
- Consumes window label `quick-paste` and event `ShortcutEvents.open`.
- Uses `SearchQuery` with `kinds: ["clipboard"]`, newest sort, limit 50.

- [ ] **Step 1: Add the typed direct-paste command**

Add `direct_paste` to `commandNames` and:

```ts
directPaste: (id: Id) => run<CopyReceipt>("direct_paste", { id }),
```

Remove `newSnippet` from `ShortcutEvents` and update its comment.

- [ ] **Step 2: Render popup page by Tauri window label**

Keep main hooks isolated:

```tsx
import { getCurrentWindow } from "@tauri-apps/api/window";
import QuickPastePage from "../features/clipboard/QuickPastePage";

export default function App() {
  return getCurrentWindow().label === "quick-paste" ? <QuickPastePage /> : <MainApp />;
}

function MainApp() {
  // existing App body and hooks
}
```

- [ ] **Step 3: Build the compact popup**

`QuickPastePage` owns `query`, `items`, `selectedId`, `loading`, `error`, and `busy`. On mount and on `query` change, call `commands.searchItems` with clipboard-only filters. Ignore stale responses using an incrementing request ref.

Render:

```tsx
<main className="flex h-screen flex-col overflow-hidden border border-border bg-card p-3">
  <header className="mb-2 flex items-center gap-2">
    <input autoFocus type="search" aria-label="Search clipboard history" />
    <kbd>Esc</kbd>
  </header>
  <div role="listbox" aria-label="Quick paste history" className="min-h-0 flex-1 overflow-auto">
    {items.map((item) => (
      <button
        key={item.id}
        type="button"
        role="option"
        aria-selected={item.id === selectedId}
        onMouseEnter={() => setSelectedId(item.id)}
        onClick={() => void paste(item.id)}
      >
        <span>{item.content_type.replace("_", " ")}</span>
        <code>{item.content}</code>
      </button>
    ))}
  </div>
</main>
```

Window key handling: Escape calls `getCurrentWindow().hide()`. Arrow Up/Down and Home/End change selection and scroll the selected row into view. Enter calls `commands.directPaste(selectedId)`. On failure, retain the popup and show `Could not paste into the previous application.` in `role="alert"`. Listen for `ShortcutEvents.open` to clear query, reload history, and refocus search when the persistent popup is shown again.

- [ ] **Step 4: Inspect and commit**

Run only: `git diff --check`

Inspect keyboard focus, roles, disabled state, empty/error copy, and token usage. Commit:

```powershell
git add -- src/features/clipboard/QuickPastePage.tsx src/app/App.tsx src/api/commands.ts src/api/events.ts
git commit -m "Add searchable quick paste popup"
```

### Task 3: Main-Window Shortcut Wiring and Tracking State

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/features/clipboard/ClipboardPage.tsx`

**Interfaces:**
- Consumes `ShortcutEvents.search`, `copySelected`, `togglePin`, `toggleFavorite`, `deleteSelected`, `navigateNext`, and `navigatePrevious`.
- Consumes `commands.getSettings()` for initial `clipboard_tracking`.

- [ ] **Step 1: Focus main search from global shortcut**

In `MainApp`, register `ShortcutEvents.search` with the existing `listenEvent` helper. Its callback focuses `searchInput`. Unregister during cleanup using the same active/unlisten pattern as `APP_SHOWN_EVENT`.

- [ ] **Step 2: Synchronize persisted tracking state**

On Clipboard-page mount:

```tsx
useEffect(() => {
  let active = true;
  void commands.getSettings().then(
    (settings) => { if (active) setPaused(!settings.clipboard_tracking); },
    () => { if (active) setActionError("Could not read clipboard tracking state."); },
  );
  return () => { active = false; };
}, []);
```

- [ ] **Step 3: Connect selected-item shortcut events**

Register the seven Clipboard-page action events in one effect. Each listener resolves the current selected item from `selectedId` and `history.items`, then calls the existing `copyItem`, `togglePin`, `toggleFavorite`, or `deleteItem`. Navigation events select and focus the adjacent row, clamped at the first/last item. Ignore action events while `busyId` or `clearBusy` is set. Resolve all listener promises, retain their unlisten functions, and release every listener on effect cleanup.

The effect dependencies are:

```tsx
[selectedId, history.items, busyId, clearBusy]
```

- [ ] **Step 4: Inspect and commit**

Run only: `git diff --check`

Inspect listener cleanup and current-selection behavior. Commit:

```powershell
git add -- src/app/App.tsx src/features/clipboard/ClipboardPage.tsx
git commit -m "Connect clipboard shortcuts and tracking state"
```

### Task 4: Deferred Verification Record

**Files:**
- Modify: `docs/keyboard-shortcuts.md`

- [ ] **Step 1: Update shortcut documentation**

Document Quick Paste flow, Enter/click behavior, Escape behavior, connected Clipboard-page actions, and removal of the unimplemented new-snippet shortcut.

- [ ] **Step 2: Record deferred checks**

Do not run tests or builds. Report these commands as awaiting explicit permission:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
bun test
bun run lint
bun run build
```

- [ ] **Step 3: Inspect and commit**

Run only: `git diff --check`

```powershell
git add -- docs/keyboard-shortcuts.md
git commit -m "Document quick paste shortcuts"
```

