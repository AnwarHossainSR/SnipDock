## 1. Clipboard preview rendering

- [ ] 1.1 Add a pure `normalizePreview(content: string): string` helper (trim outer blank lines, collapse `\n{3,}` to `\n\n`) beside `ClipboardItem`, with unit tests covering leading/trailing blank lines, internal blank runs, whitespace-only content, and single-line content
- [ ] 1.2 Render the preview `<pre>` in `src/features/clipboard/ClipboardItem.tsx` through the helper, leaving `item.content` untouched everywhere else
- [ ] 1.3 Add a test asserting copy still sends the original unnormalized content (guards the copy path against the display transform)

## 2. Live capture without resetting the list

- [ ] 2.1 Add `matchesFilter(item, filter)` to `src/stores/clipboardStore.ts`, next to `queryFor`, reusing `codeTypes` so query and predicate cannot drift
- [ ] 2.2 Add a `prependItem(item)` store action: ignore when `matchesFilter` fails, ignore when the id already exists, otherwise insert at head, increment `total`, and re-derive `groupedItems` when `groupBy` is set
- [ ] 2.3 Change the `clipboard://captured` listener in `src/features/clipboard/ClipboardPage.tsx` to pass the event payload to `prependItem` instead of calling `loadHistory()`
- [ ] 2.4 Store tests: capture prepends and bumps total; duplicate id is a no-op; unpinned capture is dropped under the `pinned` filter; non-code capture is dropped under the `code` filter; grouped mode re-derives groups
- [ ] 2.5 `ClipboardPage` test: with items loaded past page one, a captured item leaves the previously loaded items in place and keeps focus on the focused row

## 3. Honest counts

- [ ] 3.1 Replace the header `{historyTotal} items` and the filter-row `{historyTotal} filtered` in `ClipboardPage.tsx` with one readout — `{items.length} of {total} items` while more remain, `{total} items` once loaded equals total, singular/plural handled
- [ ] 3.2 Confirm group headings continue to render `group.items.length` and stay consistent with the new readout after `loadMore`
- [ ] 3.3 Tests: partial load renders the `of` form; fully loaded renders the plain total; group heading count rises after loading another page

## 4. Settings commit path

- [ ] 4.1 Add local `draft` state in `src/features/settings/SettingsPage.tsx` seeded from loaded settings and re-seeded whenever `patch` returns updated settings
- [ ] 4.2 Add the `commit(key, rawValue)` funnel that validates then calls the existing `patch`, and route every control through it
- [ ] 4.3 Add the numeric range table (`history_days` 1-365, `max_items` 10-10,000, `formatter_indent` 1-8); reject empty, non-numeric, and out-of-range values without calling `patch`, restore the draft to the last saved value, and set a per-field inline message naming the range
- [ ] 4.4 Bind number and text inputs to commit on `blur` and on `Enter`; bind textareas to commit on `blur`; leave checkboxes and selects committing from `onChange`
- [ ] 4.5 Tests: typing `365` performs exactly one save; clearing `Maximum items` performs no save and reverts the field; `50000` is rejected with a visible range message; `2000` saves and clears the message; toggling a checkbox saves immediately

## 5. Visible save feedback

- [ ] 5.1 Move the `aria-live="polite"` region out of `sr-only` into a visible inline status near the Settings heading, keeping the announcement
- [ ] 5.2 Clear success messages on a timer, clearing the timer on unmount and when a newer save starts; keep errors until the next `commit`
- [ ] 5.3 Drive a visible pending indicator from the existing `busy` state
- [ ] 5.4 Tests: success message is visible then clears; failure message is visible and persists until the next edit; pending state renders while a save is in flight

## 6. Form control styling

- [ ] 6.1 Add token-based `appearance: none` styling for `input[type="checkbox"]` and `select` in `src/styles/base.css`, scoped to settings form controls, including check mark, chevron, and `--color-focus` focus ring matching the existing `fieldClass` outline
- [ ] 6.2 Style the `Ignored content types` `<legend>` and its option labels to match `labelClass`
- [ ] 6.3 Verify light and dark themes render correctly and that `TransferPanel` and `BackupPanel` controls pick up the same treatment without regressions
- [ ] 6.4 Tab through the whole settings form in both themes and confirm every control shows a visible focus indicator and keeps native keyboard behavior

## 7. Dead code removal

- [ ] 7.1 Remove `group_by` from `baseQuery`/`queryFor` in `clipboardStore.ts`, leaving the field in `api/types.ts` and the Rust model untouched
- [ ] 7.2 Delete `src/hooks/useClipboardHistory.ts` and `src/hooks/useClipboardHistory.test.ts` after re-confirming no importers

## 8. Verification

- [ ] 8.1 `bun test`
- [ ] 8.2 `bun run lint`
- [ ] 8.3 `bun run build`
- [ ] 8.4 Manual pass in `bun run tauri dev`: copy a snippet padded with blank lines and confirm even row height; scroll past page one and copy something new, confirming loaded rows and scroll position survive; switch grouping to `Kind` and confirm no two counts on screen contradict; edit each settings field and confirm one save per edit with visible confirmation
