# Quick Paste and Clipboard Reliability

Date: 2026-07-22
Status: Approved

## Scope

This phase adds a dedicated Quick Paste popup, connects existing global shortcut events, removes the dead new-snippet shortcut, and synchronizes the Clipboard page's tracking indicator with persisted settings at startup.

Date filters, bulk history selection, Tools removal, settings cleanup, and local/R2/S3 scheduled backup remain in the next UI/cloud phase.

## Quick Paste Window

`Ctrl+Shift+V` records the currently focused external window, then opens a dedicated hidden Tauri window named `quick-paste`. The window is compact, centered, always on top, excluded from the taskbar, and uses existing SnipDock tokens and typography.

The popup contains one focused search field and a newest-first clipboard-history list. It supports mouse selection, Arrow Up/Down, Home/End, and Enter. Clicking an item or pressing Enter calls the existing direct-paste command. Escape hides the popup without changing the clipboard.

After successful paste, the popup hides, focus returns to the previously focused application, and Windows injects Ctrl+V at the active cursor. If no external target exists or Windows rejects focus restoration/input injection, the command fails and the popup remains open with a concise error.

No new dependency or separate frontend bundle is needed. `App.tsx` detects the current Tauri window label and renders `QuickPastePage` for `quick-paste`; the main window keeps the existing application shell.

## Shortcut Events

Rust remains responsible for global shortcut registration and target-window capture. React handles actions requiring current UI selection.

- `Ctrl+Shift+V`: open and focus Quick Paste popup.
- `Ctrl+Shift+F`: show the main window and focus search.
- `Ctrl+Shift+C`: copy the selected Clipboard-page item.
- `Ctrl+Shift+P`: toggle selected item pin.
- `Ctrl+Shift+D`: toggle selected item favorite.
- `Ctrl+Shift+Backspace`: delete selected item using existing Undo behavior.
- `Ctrl+Shift+Right` / `Ctrl+Shift+Left`: move Clipboard-page selection.

The unimplemented new-snippet shortcut is removed so SnipDock does not reserve a global key combination that performs no action.

Listeners use current selection through refs and unregister on component teardown. Repeated events while an item action is busy are ignored.

## Tracking State

On Clipboard-page mount, reuse `getSettings()` and set the tracking indicator from `settings.clipboard_tracking`. The backend already starts the monitor from the same persisted setting, so this removes the frontend's incorrect always-active initial state without adding another command.

Changing tracking through the Clipboard page continues to persist the setting and pause/resume the running monitor through the existing `set_clipboard_tracking` command.

## Error Handling

Direct paste returns an error when the target window is missing, focus restoration fails, or the paste keystroke is not injected. It never reports success after only copying to the clipboard. The popup stays visible on failure so the user can retry or copy manually.

Search/load failures show a compact retry direction. Shortcut-listener failures do not crash the page; affected actions remain available through mouse and keyboard controls.

## Verification

Per user instruction, no new test files will be created and no test or build command will run without explicit permission. Implementation-time checks are limited to code inspection and `git diff --check`. Automated tests, TypeScript checking, Rust tests, and production build remain deferred until permission is granted.

