## Why

Clipboard and Settings are the only two destinations that exist today (no Library, Templates, or Tools — the earlier redesign brief assumed all five; only two are real). Both share the same structural problem: the main content column stretches to the full window width, so labels and their controls can sit nearly a thousand pixels apart, and the right ~40% of every screen is dead space. Type tags are uniform teal despite the backend already classifying content into distinct types, image rows are roughly double the height of text rows with no compact option, and Settings gives no feedback when a value saves. This is a structural and visual pass, not new functionality — behavior, storage, and shortcuts are unchanged.

## What Changes

**Design tokens (`src/styles/tokens.css`)**
- Extend the existing token set (already Tailwind v4 + CSS custom properties, not plain CSS) rather than replacing it: add the missing surface step (panel/raised/raised-hover), a role-coloured border variant, a dimmed accent + low-alpha accent background, and one text/background pair per content type (image, shell, JSON/data, secret, config, plain text) that passes contrast on the panel surface.
- No new spacing/radius/font-size scale — `tokens.css` already defines one; reuse it.

**Layout restructure (`ClipboardPage`, `SettingsPage`, `AppSidebar`, new right-rail components)**
- Cap the main content column at 820px.
- Add a persistent 312px right rail: Preview/Details/Transform tabs with Copy/Pin/Star actions on Clipboard (empty-state when nothing is selected); a scroll-tracking section index on Settings.
- Populate the sidebar: destination list with number-key badges, pinned-items section, capture status indicator (Capturing/Paused + shortcut), storage meter, version line. (Destination list still shows only Clipboard and Settings — Library/Templates/Tools do not exist and are out of scope.)
- Colour-code type tags using the new per-type tokens instead of uniform teal.
- Cap inline image thumbnails at ~46×32px; move the full preview to the rail. Add a compact/comfortable density toggle in Settings.
- Relative timestamps by default (`2m ago`, `3h ago`, `Yesterday`, then absolute dates) with the full timestamp on hover via `title`.
- Add a row metadata line (source application, size/line count, type-specific detail). **Depends on source-app capture being persisted per item, which does not exist yet** — see Non-goals.
- Add a keyboard hint strip below the list sourced from `docs/keyboard-shortcuts.md`'s actual shortcuts, not invented ones.
- Replace native checkboxes/selects in Settings with the app's existing custom control patterns; shrink number inputs to ~132px with steppers and a range hint below the field; convert the content-type exclusion list from wrapped checkboxes to toggle pills.
- Rename the `Type`/`Kind` grouping options to reflect what each actually groups by.
- Add a visible "saved" indicator and a per-section "reset to defaults" action in Settings.

**Non-goals**
- Library, Templates, Tools destinations — none exist; inventing them is a separate change.
- Quick-paste overlay, transform pipeline wiring, duplicate collapsing, secrets-as-a-type, sequential paste, multi-select actions beyond delete — all Phase 3 features from the original brief, each scoped as its own future change.
- Source-application capture and per-item persistence — `foreground_executable_name()` exists in `src-tauri/src/platform/native.rs` but is only used for the ignored-apps capture filter; there is no `source_app` column and no per-item value to render. The row metadata line ships without the source-app segment until that lands separately.
- List virtualization and SQLite FTS migration — search is already FTS5-backed with a literal fallback; the list uses paginated infinite scroll, not virtualization. Both are Phase 4 concerns, not part of this structural pass.
- No new npm or cargo dependencies. No Tailwind removal — the prior brief assumed a plain-CSS codebase; this one is Tailwind v4 with `tokens.css` bridging custom properties in, and the redesign builds on that rather than migrating off it.
- `openspec/changes/improve-clipboard-and-settings-ux` (preview normalization, save-on-blur, save confirmation, control styling) already shipped in commit `c6c3163` — its planning artifacts are just unarchived, not active. This change does not reopen that scope; it builds on top of the shipped behavior.

## Capabilities

### New Capabilities

- `clipboard-layout`: The structural layout of the Clipboard screen — content column width, right rail (Preview/Details/Transform), row rhythm, type-tag colour, timestamps, row metadata, keyboard hint strip.
- `settings-layout`: The structural layout of the Settings screen — content column width, section-index right rail, custom form controls, save feedback, reset-to-defaults.
- `app-shell-navigation`: The sidebar's populated state — destination list with number-key badges, pinned items, capture status indicator, storage meter, version line.
- `design-tokens`: The extended token set — additional surface steps, role-coloured borders, accent variants, and per-content-type colour pairs.

### Modified Capabilities

<!-- None. openspec/specs/ is empty; all four capabilities above are new. -->

## Impact

- `src/styles/tokens.css` — new custom properties (surfaces, borders, accent variants, content-type colours)
- `src/app/components/AppSidebar.tsx` — pinned items, capture status, storage meter, version line
- `src/features/clipboard/ClipboardPage.tsx`, `ClipboardItem.tsx` — column width, row rhythm, type-tag colour, timestamps, metadata line, hint strip
- New: a right-rail component for Clipboard (Preview/Details/Transform tabs + action buttons) and for Settings (section index)
- `src/features/settings/SettingsPage.tsx` and its panels — column width, custom controls, number-field sizing, content-type pills, saved indicator, reset-to-defaults
- `docs/keyboard-shortcuts.md` — read, not modified; source of truth for the hint strip
- No backend changes, no dependency changes, no migrations, no change to capture/storage/shortcut behavior
