## Context

See proposal.md - Why for motivation. The constraints that shape the approach:

- `AGENTS.md` requires reusing existing code, native APIs, and installed dependencies before adding any. Only `button.tsx` and `dialog.tsx` exist under `src/components/ui/`; there is no Checkbox or Select primitive, and Radix does not ship one we already depend on.
- `src/styles/tokens.css` is the single palette source. `theme.css` bridges those tokens to Tailwind v4. Any styling added here must read from tokens, not hard-coded colors.
- `clipboard://captured` already emits the full stored `LibraryItem` as its payload (`src-tauri/src/app/mod.rs:135`), and `ClipboardPage` currently discards it and refetches.
- Grouping is entirely client-side (`groupItems` in `clipboardStore.ts`); `SearchQuery.group_by` reaches the Rust `SearchQuery` model but no storage code reads it.
- `SettingsPage` calls `commands.saveSettings` directly from each control's `onChange`; there is no form state layer between the control and the IPC call.

## Goals / Non-Goals

**Goals:**

- Every fix lands in the frontend. No Rust, no schema, no dependency changes.
- Preserve the current interaction model: whole-row click-to-copy, `Ctrl+Click` multi-select, arrow-key navigation, per-setting autosave with no Save button.
- Keep the settings write path a single funnel so validation and confirmation cannot be bypassed by a control that forgets to opt in.

**Non-Goals:**

- Server-side grouping. Making group counts truthful across the full result set would mean either a new backend grouping path or loading all 265+ items eagerly. Neither is worth it here; the fix is to stop the UI from claiming coverage it does not have.
- A form library or controlled-form abstraction. Two panels of fields do not justify it.
- Reworking `useClipboardActions` / `useClearDialog`, which are already factored out and behave correctly.

## Decisions

### Preview normalization lives in the item component, not the store

Normalize in `ClipboardItem` at render time via a small pure helper (trim, then collapse `\n{3,}` to `\n\n`), keeping the store's items byte-identical to what the backend returned.

Alternative considered: normalizing on ingest in the store, so the work happens once per item instead of once per render. Rejected — the store's items feed copy, export, and detail paths, and a display transform leaking into them is exactly how "copy gave me the wrong text" bugs start. `ClipboardItem` is already `memo`ized, so re-normalization only runs when an item's props actually change.

### Live capture prepends the event payload instead of refetching

Add a `prependItem(item)` action to `clipboardStore` that inserts at the head, skips insertion when the item id is already present, increments `total`, and re-derives `groupedItems` when grouping is active. `ClipboardPage`'s listener passes the event payload straight to it.

The payload is the complete stored item, so no round trip is needed. This is also what fixes focus and scroll preservation for free: the existing rows are never unmounted.

Filter correctness: the captured item must only be prepended when it satisfies the active filter — `code` compares against the same `codeTypes` list the query uses, and `pinned`/`favorite` are always false on a fresh capture, so a capture is dropped under those filters. That predicate belongs next to `queryFor` in the store so the two cannot drift.

Alternative considered: keep refetching but restore offset by requesting `limit: items.length`. Rejected — it re-fetches everything on every copy the user makes, which is the hottest path in the app.

### Counts become one readout derived from loaded vs. total

Replace the two independent figures (`{historyTotal} items` in the header and `{historyTotal} filtered` in the filter row) with a single readout: `{items.length} of {total} items` while `items.length < total`, and `{total} items` once they are equal. Group headings already count `group.items.length`, which is correct — the contradiction came from the screen-level figure claiming the full set, so only the screen-level figure changes.

Alternative considered: labelling groups as "(30 loaded)". Rejected — it repeats the qualifier on every heading when stating it once, at the screen level, removes the ambiguity.

### Settings edits route through a single deferred-commit path

Introduce one local `draft` state for field values plus a `commit(key, rawValue)` funnel in `SettingsPage` that validates, then calls the existing `patch()`. Controls bind to `draft`, and:

- number and text inputs commit on `blur` and on `Enter`
- textareas commit on `blur`
- checkboxes and selects call `commit` directly from `onChange`

Blur-and-Enter is chosen over a pure debounce because it is deterministic and testable — a debounce turns every settings test into a timer test, and a user who types then immediately closes the window can lose the last edit. Commit on blur has a matching edge case (the window closing while a field holds focus), which is why `Enter` is also a commit trigger and why the pending-state indicator matters.

Validation is a per-key table (`history_days: [1, 365]`, `max_items: [10, 10000]`, `formatter_indent: [1, 8]`) checked in `commit`. Out-of-range or empty values set an inline message on that field, restore the draft to the last saved value, and do not call `patch`. Because every control funnels through `commit`, a field cannot skip validation by wiring `onChange` straight to `patch` — the current bug.

### Save feedback becomes a visible, self-clearing region

Keep the `aria-live="polite"` region but stop hiding it with `sr-only`; render it as a small inline status next to the page heading. Success clears itself on a timer (the timer is cleared on unmount and on the next save to avoid a stale message overwriting a newer one); errors persist until the next `commit`, matching the spec. `busy` already exists in state and disables controls — it also drives a "Saving…" label so the pending state is not silent.

### Native controls, restyled — no new primitives

Style `input[type="checkbox"]` and `select` with `appearance: none` plus token-based background, border, radius, and a CSS-drawn check mark and chevron, scoped to the settings form. Focus rings reuse the `--color-focus` token and the same `focus-visible` outline the existing `fieldClass` uses. `<legend>` gets the same label treatment as `labelClass`.

Alternative considered: adding `@radix-ui/react-checkbox` and `@radix-ui/react-select` for shadcn primitives. Rejected under the `AGENTS.md` dependency rule — two more runtime dependencies and a portal-based select for controls that need no custom behavior. Native controls also keep OS keyboard and IME behavior intact for free, which is the requirement the spec calls out.

Placement: the rules live in `src/styles/base.css` under a form-control selector rather than as repeated Tailwind utility strings, because the same treatment applies to `SettingsPage`, `TransferPanel`, and `BackupPanel`, which all use the same local `fieldClass` pattern.

### `group_by` and the dead history hook are removed in the same pass

`group_by` is dropped from `baseQuery`/`queryFor` in `clipboardStore.ts`; the field stays in `api/types.ts` and in the Rust model, so this is a client-side stop-sending, not an API break. `src/hooks/useClipboardHistory.ts` and `useClipboardHistory.test.ts` are deleted — a verified-unused near-duplicate of the store that would otherwise need every fix in this change applied twice.

## Risks / Trade-offs

- **Prepending diverges from what a fresh query would return** (an ignored-app rule or a dedupe policy could mean the backend would not have returned the item) → the backend only emits `clipboard://captured` for `CaptureOutcome::Stored`, so the item is by definition in the store; the client-side filter predicate covers the filter case.
- **The filter predicate drifts from `queryFor`** as filters are added → both live in `clipboardStore.ts` next to each other, and a store test asserts a captured item is accepted or rejected per filter.
- **Commit-on-blur can lose the last edit if the window closes mid-field** → `Enter` also commits, the pending/idle state is now visible, and the field keeps its draft value on screen so nothing silently reverts.
- **`appearance: none` removes native control rendering** → keyboard, focus, and form semantics are untouched because the elements stay native; verification includes tabbing through the settings form in both themes.
- **Group counts still describe loaded items only** → accepted and made explicit by the count readout rather than hidden; server-side grouping stays available as a later change.
