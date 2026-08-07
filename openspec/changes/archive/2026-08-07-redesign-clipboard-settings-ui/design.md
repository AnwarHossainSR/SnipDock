## Context

Both screens today (`ClipboardPage.tsx`, 750 lines; `SettingsPage.tsx`, 296 lines) render a single unconstrained-width column with no persistent secondary panel. `AppSidebar.tsx` (291 lines) already reads `commands.getStorageSize()` and `getVersion()` and renders a storage bar and version line in its footer — that data-fetching and rendering exists and only needs a pinned-items section and a capture-status indicator added alongside it, not a rebuild. State lives in a Zustand store (`clipboardStore.ts`) plus local `useState`; there is no React Context to thread rail/selection state through, so the right rail's "currently selected item" needs to read from the same store the list already uses. Styling is Tailwind v4 utility classes over CSS custom properties in `src/styles/tokens.css`, bridged via `src/styles/theme.css` (per `AGENTS.md` and the current build, not the plain-CSS approach an earlier design brief assumed). See `proposal.md` for motivation and the four spec deltas for exact requirements.

## Goals / Non-Goals

**Goals:**
- Land the 820px column cap, right rail (Clipboard: Preview/Details/Transform; Settings: section index), populated sidebar, colour-coded type tags, and Settings control restyle as one coherent structural pass.
- Extend `tokens.css` additively; every new token has both a light and dark value, consistent with the file's existing `:root[data-theme]` / `prefers-color-scheme` pattern.
- Keep the right rail's selection state driven by the existing `clipboardStore` so no new state layer is introduced.

**Non-Goals:**
- Building the Transform tab's actual transform actions (base64 decode, JWT decode, etc.) — no transform pipeline exists yet (confirmed: only a JSON/SQL/CSS/XML `format_content` formatter exists, unwired to any UI). The Transform tab ships with a static/empty state in this change; wiring real transforms is a separate future change per the proposal's Non-goals.
- Persisting or displaying source application per item — `foreground_executable_name()` exists but there's no `source_app` column. The row metadata line ships without that segment.
- Any Rust/backend change. Every requirement in the four spec deltas is satisfiable from existing Tauri commands (`getStorageSize`, `set_item_flags` for pin, `set_clipboard_tracking`, `getSettings`/`saveSettings`) and existing store state.

## Decisions

**820px cap applied at the content-column wrapper, not globally.** Both `ClipboardPage` and `SettingsPage` already render into a column inside the shared app shell (sidebar + main). Add `max-w-[820px]` to each page's top-level content wrapper rather than changing the shell's grid — the shell gains a third grid column (rail) instead. Alternative considered: cap width via a shared layout component wrapping both pages. Rejected for this change because the two pages' rail content differs enough (tabs vs. section index) that a shared wrapper would need a slot/children API anyway, which is no simpler than two call sites setting the same Tailwind class plus a page-specific rail component.

**Right rail is a new sibling column in the existing grid, driven by store state.** `ClipboardPage` already tracks a "selected item" concept for multi-select and the existing `ItemInspector.tsx` component. Reuse `ItemInspector`'s data-fetching for the rail's Preview/Details tabs rather than duplicating it — the rail becomes `ItemInspector` restructured into tabs plus a bottom action bar, not a parallel implementation. `QuickPastePage` and `SearchResultsPage` are unaffected; the rail only mounts on the two-column pages.

**Settings section rail uses `IntersectionObserver`, matching the pattern already used for infinite-scroll pagination in `ClipboardPage.tsx`.** No new scroll-tracking library; each settings card gets a ref, an observer flags the topmost intersecting card, the rail highlights the matching entry. Consistent with the codebase's existing no-new-dependency constraint and its established use of `IntersectionObserver` for scroll-driven state.

**Content-type colour tokens are added as flat `--color-type-<name>` / `--color-type-<name>-bg` pairs, not a nested/JS-side map.** Keeps the type-to-colour lookup in CSS (a class or inline `style` reads the token by computed name) rather than duplicating the mapping in TypeScript. Alternative considered: a TS constant mapping type → hex value. Rejected because it would drift from `tokens.css` and bypass the existing dark/light theme-switching mechanism that all other colours already use.

**Custom number-input and toggle-pill controls are new small components in `src/components/ui/`, alongside the existing `button.tsx`/`dialog.tsx` shadcn-style primitives.** Matches the codebase's existing primitive-component pattern (`class-variance-authority` + `cn()`) rather than inlining the markup into `SettingsPage.tsx` each time it's needed across sections.

**Grouping option rename is a label-only change plus one lookup-table rename.** The store's `group_by` value strings stay whatever the backend/store already use internally; only the user-facing option label text changes, keeping this a pure UI change with no data-shape impact (the earlier `improve-clipboard-and-settings-ux` change already removed `group_by` from the outgoing search query — grouping is client-side, so renaming labels touches only display strings).

## Risks / Trade-offs

- **[Risk] `ItemInspector` restructuring into rail tabs could regress the existing single-item inspector behavior covered by `ItemInspector.test.tsx`.** → Mitigation: treat this as a refactor-in-place (same component, new layout), run the existing test file unmodified first to establish a baseline, then update tests alongside the tab restructuring rather than deleting and rewriting.
- **[Risk] Reusing `IntersectionObserver` for Settings section tracking could conflict with the identical mechanism already driving Clipboard's infinite-scroll pagination if both mount simultaneously.** → Mitigation: they never do — Clipboard and Settings are mutually exclusive routes (`currentPage()` in `App.tsx`), so no shared-observer contention exists in practice, but each page's observer must still be scoped to its own component and torn down on unmount to avoid a leaked observer when switching pages quickly.
- **[Risk] Content-type colour contrast (WCAG AA 4.5:1) must hold in both themes for six new pairs (twelve values) — easy to pass in one theme and fail in the other.** → Mitigation: verify each pair against `--color-surface` in both the light and dark blocks before merging, as stated in the `design-tokens` spec scenarios; treat contrast failure as a blocking defect, not a follow-up.
- **[Trade-off] The Transform tab ships with no working transforms behind it.** Accepted per proposal Non-goals — the rail's structure (tab exists, is selectable) is in scope; the transform actions behind it are not. This risks the tab reading as broken/empty to a reviewer expecting Phase 3 functionality; the tab should show an explicit "no transforms available yet" state rather than an empty panel, to make the boundary intentional rather than accidental.
