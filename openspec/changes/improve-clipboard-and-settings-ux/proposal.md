## Why

The two screens a user actually lives in — Recent captures and Settings — each ship visible defects that make the app feel unfinished. The history list renders raw clipboard content, so any snippet with leading or trailing blank lines opens a large hole in the list; grouping reports counts that contradict the header ("Clipboard (30)" under "265 filtered"); and a new capture silently throws away everything the user scrolled past. Settings writes to disk on every keystroke through a Tauri IPC round trip, has no visible confirmation that anything saved, and mixes OS-default checkboxes and selects into an otherwise custom-themed UI.

None of this is new-feature work. It is correctness and finish on paths that already exist, and each item is independently small.

## What Changes

**Clipboard history (`ClipboardPage`, `ClipboardItem`, `clipboardStore`)**

- Normalize the item preview: trim leading/trailing blank lines and collapse runs of blank lines before rendering, so every row occupies predictable height. Stored content is untouched — display only.
- Stop resetting the list on live capture. `clipboard://captured` currently calls `loadHistory()`, which refetches page 1 and discards every page the user scrolled in. New items prepend to the existing list instead.
- Make counts honest. The header shows one count, not the same number twice as "265 items" and "265 filtered"; when only part of the result set is loaded, the readout says so, and group headings count what they actually contain.
- Drop `group_by` from the outgoing `SearchQuery`. The Rust repository never reads it — grouping is done client-side — so it is dead weight on every search call.
- Delete `src/hooks/useClipboardHistory.ts` and its test. It is a near-copy of `clipboardStore.ts` that `clipboardStore` superseded; nothing imports it, so every fix above would otherwise have to be made twice or would silently rot.

**Settings (`SettingsPage`)**

- Commit text, number, and textarea fields on blur (or debounce) rather than per keystroke, so typing `365` sends one save instead of three, and clearing a number field cannot send `0` or `NaN` to the backend.
- Validate numeric fields against their stated ranges before saving. A value outside its range is rejected, not clamped: nothing is written, the field returns to the last saved value, and the range is surfaced inline instead of a different value being written silently.
- Show save confirmation visibly. `message` is currently rendered only inside an `sr-only` region, so sighted users get no feedback at all.
- Style checkboxes, selects, and the `Ignored content types` fieldset with the existing token palette so they stop rendering as OS defaults. Native controls stay native — this is CSS, not new dependencies.

**Non-goals**

- Surfacing the unreachable backend. `smart_folders`, `analytics`, `duplicates`, and `auto_clear` are registered Tauri commands with zero frontend callers, and `commands/organization.rs` plus `storage/organization.rs` (~490 lines) are not even registered in `invoke_handler`. That is roughly 1,300 lines of Rust shipping in the binary with no way to reach it. Deciding whether to surface or delete it is a separate change, not UI polish.
- List virtualization. Infinite scroll already exists; a windowed list is a larger change with its own keyboard-navigation and focus-restoration risks.
- No new npm or cargo dependencies.

## Capabilities

### New Capabilities

- `clipboard-history`: How the Recent captures list renders items, reports counts, groups results, and reacts to live clipboard captures.
- `settings-editing`: How the Settings screen commits, validates, and confirms preference edits, and how its form controls present.

### Modified Capabilities

<!-- None. openspec/specs/ is currently empty; both capabilities above are new. -->

## Impact

- `src/features/clipboard/ClipboardPage.tsx` — capture listener, header counts, group headings
- `src/features/clipboard/ClipboardItem.tsx` — preview rendering
- `src/stores/clipboardStore.ts` — `prependItem` action, `group_by` removal from `baseQuery`
- `src/features/settings/SettingsPage.tsx` — commit timing, validation, visible confirmation, control styling
- `src/styles/tokens.css` or `base.css` — form-control styling if the rules are shared rather than local utilities
- Tests: `ClipboardPage.test.tsx`, `SettingsPage.test.tsx`, `useClipboardHistory.test.ts`
- No backend changes. No dependency changes. No migrations. No user-visible breaking behavior.
