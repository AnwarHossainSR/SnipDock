## Why

The two shipped capabilities (`clipboard-history`, `clipboard-layout`, `settings-layout`, `settings-editing`, `app-shell-navigation`, `design-tokens`) cover the structural and correctness work from the two archived changes. What is missing is the productivity layer the app was designed to host:

1. **Capture has no identity.** `clipboard://captured` already runs through `foreground_executable_name()` to filter by `ignored_apps` (`src-tauri/src/features/clipboard/capture.rs:223, 263`, `src-tauri/src/models/settings.rs:12`), but the resolved name is never stored on the item. The `Details` tab and row metadata line (`openspec/specs/clipboard-layout/spec.md` Requirement "Row metadata line") explicitly defer source-app rendering until a per-item value exists.
2. **Quick Paste pastes raw content.** Three `PasteFormat` variants are persisted and a `apply_paste_format()` helper exists in `src-tauri/src/features/formatting.rs` and `src-tauri/src/commands/clipboard.rs:42-62`, but the only callable transforms are whitespace-only (`Preserve`, `PlainText`, `StripWhitespace`). The Quick Paste overlay cannot trim, case-fold, sort/dedupe lines, JSON pretty-print, base64 decode, or URL-encode — the kind of one-keystroke refinements that turn a clipboard manager into a productivity tool.
3. **Search is literal.** FTS5 is wired (`src-tauri/src/storage/...`) but the search box has no regex mode. Users routinely want to find "any URL containing `/v\d+/users/`" or "any JSON key matching `auth.*token`" — impossible with literal substring search.
4. **Ignored apps are unnamed.** `Settings.ignored_apps: Vec<String>` exists and is honored at capture time, but the Settings panel offers no UI to add or remove entries — the field is set-only, not user-editable.
5. **Shortcuts are hardcoded.** `docs/keyboard-shortcuts.md` is the source of truth for the hint strip, and the keys are wired directly into the Tauri shortcut registration / frontend handlers. `Settings.custom_shortcuts: BTreeMap<String, String>` is declared but never read.
6. **The CLI is installer-only.** `packages/snipdock-cli/` (`packages/snipdock-cli/README.md`) ships `install`, `run`, `update`, `uninstall`, `version`, `help`. Users with the CLI installed on a headless machine have no way to pin, tag, search, paste, or export without opening the GUI.

None of this is a new paradigm — every item extends an existing surface that already has the data flow or schema behind it. Each is independently small.

## What Changes

**Source-app capture (`source_app` per item)**

- Persist the foreground executable name resolved at capture time on every stored `LibraryItem`. The platform module already returns `Option<String>` for this; the field becomes `Option<String>` in `LibraryItem` (Rust + TS), populated by the existing capture path before storage, never derived from `process listing` at read time.
- Surface it in the right rail's `Details` tab and in the existing row metadata line (the deferred segment the layout spec already calls out).
- Add a `source_app` facet to the search query and a sidebar entry point that filters history to one source.
- The existing capture-time `ignored_apps` filter continues to drop matches before persistence — the new field is set only when the item is stored.

**Quick Paste transforms (`quick-paste-transforms`)**

- A transform pipeline in Quick Paste: trim, lowercase, uppercase, sort/dedupe lines, JSON pretty/minify, base64 encode/decode, URL encode/decode. Each is a pure function on the candidate content, applied at the moment of paste (Windows: in the clipboard just before the keystroke is injected; macOS/Linux: in the clipboard just before Quick Paste closes) so the stored history is untouched.
- Quick Paste gains a `Tab` (or `Ctrl+T`) cycle through transforms with the result visible in the preview pane, plus a row of single-key shortcuts for the most common three.
- Each transform has an "identity" test (apply → unapply round-trips for the encode/decode pair) so a transform that loses data cannot ship silently.

**Regex search (`regex-search`)**

- A mode toggle next to the search box: `Literal` (default, current behavior) and `Regex`. When `Regex` is active, FTS5's MATCH operator still narrows the candidate rows and the query is then compiled to a Rust `regex::Regex` and matched against the indexed text of those candidates - the regex layers on the pre-filter rather than replacing it, so a pattern never turns into a full-table scan. The search bar shows the mode, and an invalid pattern surfaces an inline error rather than swallowing the search.
- The toggle is opt-in per search. A search saved in `Regex` mode records that mode (the saved query carries the `regex` field); saved searches created before this change, and any saved without a pattern, open as `Literal`.

**Per-app ignore list (`per-app-ignore`)**

- A new "Ignored apps" panel in Settings with the editable list, sourced from `Settings.ignored_apps`. Add by executable name (the same string `foreground_executable_name()` returns), remove by row. The list shows the friendly name when one can be derived and the raw executable string otherwise.
- An "Add currently focused app" button that reads the foreground executable once and appends it — useful when a user knows they do not want captures from a specific window but does not remember its exact process name.
- Capture-time behavior is unchanged; this is only the editor surface.

**Custom shortcuts (`custom-shortcuts`)**

- A "Keyboard shortcuts" panel in Settings that lists every shortcut documented in `docs/keyboard-shortcuts.md`, each editable in place with the same `CmdOrCtrl+Shift+…` grammar the rest of the app uses. The valid keys and the platform-correct rendering are checked on commit; an invalid binding shows the same range/error treatment the other settings already use.
- Shortcuts are stored in `Settings.custom_shortcuts` (already declared). The Tauri shortcut registration reads them on launch and on save; conflicts with another registered shortcut (browser, OS) are surfaced inline, not silently overridden.
- `docs/keyboard-shortcuts.md` becomes the schema: when an entry there changes, the panel re-reads it so the UI does not invent bindings. Keys not present in the doc are not exposed in the panel.

**CLI expansion (`cli-expansion`)**

- New subcommands in `packages/snipdock-cli/src/index.ts`: `pin`, `unpin`, `favorite`, `unfavorite`, `tag`, `search`, `paste <id>`, `export <path>`. Each shells out to the SnipDock HTTP capture endpoint the change introduces (see Risks/Trade-offs) and exits non-zero on backend errors with a single-line message.
- `snipdock help` lists the new subcommands. The existing installer/run subcommands are unchanged.
- The CLI depends on a SnipDock instance running with the local HTTP endpoint exposed; offline (no daemon) behavior is "SnipDock is not running" with a clear message.

**Non-goals**

- Capturing source-window title in addition to executable name — only the executable name is resolved today and the layout spec only mentions the executable. Title capture is a separate change.
- Persisting the foreground app for manually-saved items (`save_manual_item`) — those have no source app.
- A user-extensible transform registry — only the built-in transforms ship. A plugin surface is a separate change.
- Regex on every search backend (search history, and saved searches created before this change - those open as Literal).
- Syncing `ignored_apps` across devices — it is a per-device setting.
- Per-shortcut gestures (mouseless key chords beyond the documented set). The panel edits existing shortcuts only.
- A full CLI daemon / IPC bridge — the CLI hits a localhost HTTP endpoint exposed by the desktop app. The endpoint is gated by a token stored in the app data directory, rotated on app start.
- No new npm or cargo dependencies. `regex` is already in `src-tauri/Cargo.toml` (used by the existing `ignored_patterns`); no new crates needed.

## Capabilities

### New Capabilities

- `source-app`: capture-time recording of the foreground executable name per stored item, surfaced in the Details tab and row metadata, and exposed as a search facet.
- `quick-paste-transforms`: a built-in transform pipeline run at paste time inside Quick Paste, with preview and key bindings.
- `regex-search`: a literal/regex mode toggle in the clipboard search box, with a compiled-regex path in the Rust search command.
- `per-app-ignore`: a Settings editor for the existing `Settings.ignored_apps` list, including an "add currently focused app" action.
- `custom-shortcuts`: a Settings panel that lets the user rebind every shortcut documented in `docs/keyboard-shortcuts.md`, persisted to `Settings.custom_shortcuts`.
- `cli-expansion`: new `pin`, `unpin`, `favorite`, `unfavorite`, `tag`, `search`, `paste`, `export` subcommands in `packages/snipdock-cli/`, hitting a localhost endpoint exposed by the desktop app.

### Modified Capabilities

- `clipboard-layout` — extend the existing "Row metadata line" requirement to include the source-app segment now that the field exists. Add the source-app row to the existing scenario list.
- `clipboard-history` — add a scenario covering the source-app filter (analogous to the existing `Pinned`/`Code` filter scenarios).
- `app-shell-navigation` — extend the "Pinned" requirement to cover a parallel "Sources" section that lists distinct source apps with their counts (mirrors the existing tag-and-project pattern in the codebase).

## Impact

- **Rust / `src-tauri`**
  - `src-tauri/src/models/library.rs` — add `source_app: Option<String>` to `LibraryItem`; add `source_apps: Vec<String>` to `SearchQuery`.
  - `src-tauri/src/storage/*` — migration to add `source_app TEXT NULL` column on the items table; default existing rows to `NULL`. Backfill is a no-op (no historical value to derive).
  - `src-tauri/src/features/clipboard/capture.rs` — set `source_app` from `self.foreground_app.executable_name()` before insert; ignored-app logic stays.
  - `src-tauri/src/features/clipboard/search.rs` (or equivalent) — branch on a new `SearchQuery.regex` flag; if `Some(Regex)`, compile a `regex::Regex` and walk indexed rows instead of `MATCH`.
  - `src-tauri/src/features/formatting.rs` — add the eight new transforms (trim, lower, upper, sort/dedupe lines, JSON pretty/minify, base64 encode/decode, URL encode/decode).
  - `src-tauri/src/commands/clipboard.rs` — extend the existing `direct_paste_item` / `copy_item` paths to accept an optional `transform: Option<Transform>` argument and pass it to the existing `formatting::` module.
  - `src-tauri/src/commands/settings.rs` — read `custom_shortcuts` on save; emit an event so the frontend rebinds without restart.
  - `src-tauri/src/platform/shortcuts.rs` (existing) — read `custom_shortcuts` on launch and on settings change.
  - `src-tauri/src/app/mod.rs` — register a localhost HTTP listener (port from a random 16-bit range) gated by a token, with routes `/pin`, `/unpin`, `/favorite`, `/unfavorite`, `/tag`, `/search`, `/paste`, `/export`. Token is written to `<data_dir>/cli-token` on start and rotated each launch.
- **Frontend / `src`**
  - `src/api/types.ts` — add `source_app` to `LibraryItem`; add `source_apps` and `regex` to `SearchQuery`; add `Transform` and `TransformKind` types.
  - `src/api/commands.ts` — add `pin_item`, `unpin_item`, `favorite_item`, `unfavorite_item`, `set_item_tags`, `search_items` (already exists, now with `regex`), `direct_paste_item_with_transform` (or extend existing); add `get_cli_token` for the CLI to discover.
  - `src/features/clipboard/ClipboardPage.tsx`, `ClipboardItem.tsx`, `ItemInspector.tsx`, `SearchResultsPage.tsx` — render `source_app`; add source-app filter and the regex toggle.
  - `src/features/quick-paste/` — preview pane, transform row, `Tab` cycle, identity round-trip indicator.
  - `src/features/settings/SettingsPage.tsx` — new "Ignored apps", "Keyboard shortcuts", "CLI access" panels.
  - `src/app/components/AppSidebar.tsx` — add "Sources" section listing distinct `source_app` values with counts, sourced from a new Tauri command (`get_source_app_counts`).
  - `src/stores/clipboardStore.ts` — extend `matchesFilter` to include `source_apps`; extend `queryFor` to include the new fields.
- **CLI / `packages/snipdock-cli`**
  - `packages/snipdock-cli/src/index.ts` — new subcommands; reads token from `~/.snipdock/cli-token` (or platform equivalent), points at the discovered port.
  - `packages/snipdock-cli/README.md` — document the new subcommands.
- **Docs**
  - `docs/keyboard-shortcuts.md` — unchanged (source of truth). The Settings "Keyboard shortcuts" panel reads from it.
  - `docs/cli.md` (new) — endpoint discovery, token storage, per-subcommand examples.
- **Tests**
  - New unit tests for each new formatting transform (identity round-trips).
  - Tests for `capture.rs` storing `source_app`; for the search branch selecting literal vs. regex; for the regex path rejecting an invalid pattern.
  - `clipboardStore.test.ts` — extend `matchesFilter` tests for `source_apps`.
  - `ClipboardPage.test.tsx`, `SearchResultsPage.test.tsx` — render `source_app` in the row metadata line; render the source-app filter; render the regex toggle and propagate it.
  - New `quick-paste-transforms.test.tsx` for the transform pipeline.
  - `packages/snipdock-cli/` — small unit tests for argument parsing; integration coverage is deferred (no desktop session in the same CI lane).
- No breaking changes to the existing UI or to existing Tauri commands. The new fields are additive.