## 1. Design tokens

- [x] 1.1 Add `--color-surface-raised-hover` (fourth surface step) to `src/styles/tokens.css`'s `:root`, `:root[data-theme="dark"]`, and the `prefers-color-scheme: dark` block
- [x] 1.2 Add an accent-sourced role-coloured border token (e.g. `--color-border-accent`) distinct from `--color-border-strong`, in all three theme blocks
- [x] 1.3 Add `--color-accent-dim` (dimmed accent variant) in all three theme blocks; confirm `--color-accent-soft` already covers the low-alpha accent background need without a new token
- [x] 1.4 Add six `--color-type-<name>` / `--color-type-<name>-bg` pairs (image, shell, json, secret, config, text) in all three theme blocks
- [x] 1.5 Verify each of the six text-colour tokens against `--color-surface` in both light and dark themes meets 4.5:1 contrast; adjust values that fail
- [x] 1.6 Render one component using the new tokens (a type tag) as the Phase 1 gate artifact

## 2. Sidebar

- [x] 2.1 Add a documented-shortcut-badge lookup (Clipboard/Settings only) to `AppSidebar.tsx`'s `navigation` array rendering; omit badges for destinations with no documented number-key shortcut
- [x] 2.2 Add a "Pinned" section to `AppSidebar.tsx` reading pinned items from `clipboardStore` (or a dedicated fetch if pinned items aren't already in store state), with an empty-state message when there are none
- [x] 2.3 Add a capture status indicator ("Capturing"/"Paused") wired to the existing clipboard-tracking state and toggle shortcut, updating live via the existing event/store mechanism
- [x] 2.4 Confirm the existing storage meter and version line (already implemented in `AppSidebar.tsx`) satisfy the `app-shell-navigation` spec's storage-meter and version-line requirements as-is; adjust only if a scenario doesn't already pass

## 3. Clipboard layout — structure

- [x] 3.1 Cap `ClipboardPage.tsx`'s content column at 820px; add the right-rail column to the page's grid
- [x] 3.2 Build the right rail: Preview/Details/Transform tabs, restructuring `ItemInspector.tsx` in place rather than duplicating it; Copy/Pin/Star actions anchored to the rail's bottom
- [x] 3.3 Add the rail's empty-state (no item selected) and confirm selection persists across scroll/pagination
- [x] 3.4 Give the Transform tab an explicit "no transforms available yet" state (no transform pipeline exists yet - this is a placeholder, not a stub bug)

## 4. Clipboard layout — row rhythm and content

- [x] 4.1 Apply `--color-type-*` tokens to each item's type tag based on its detected type
- [x] 4.2 Cap inline image thumbnails at 46×32px; move full-size preview rendering to the rail's Preview tab
- [x] 4.3 Add a compact/comfortable density toggle to Settings and wire its value to `ClipboardPage.tsx`'s row padding
- [x] 4.4 Add relative-timestamp formatting (falling back to absolute dates) with the full timestamp in a `title` attribute
- [x] 4.5 Add the row metadata line (size/line count + type-specific detail; no source-app segment)
- [x] 4.6 Add the keyboard hint strip below the list, sourced only from `docs/keyboard-shortcuts.md`'s documented shortcuts

## 5. Settings layout — structure

- [x] 5.1 Cap `SettingsPage.tsx`'s content column at 820px; add the section-index rail column
- [x] 5.2 Build the section-index rail using `IntersectionObserver` on each settings card, highlighting the topmost intersecting section and scrolling to a section on click

## 6. Settings layout — controls

- [x] 6.1 Build/reuse a custom toggle component for boolean settings, replacing native checkboxes
- [x] 6.2 Build a ~132px number-input component with steppers and a below-field range hint, replacing current number inputs
- [x] 6.3 Convert the ignored-content-types control from wrapped checkboxes to toggle pills
- [x] 6.4 Rename the "Type" and "Kind" grouping options to labels that describe what each actually groups by
- [x] 6.5 Add a visible (non-`sr-only`) saved indicator on settings commit
- [x] 6.6 Add a per-section "reset to defaults" action scoped to its own card only

## 7. Verification

- [x] 7.1 Run `bun test`, `bun run lint`, `bun run build`, and `cargo test --manifest-path src-tauri/Cargo.toml`; all four must pass
- [x] 7.2 Manually verify the Clipboard and Settings screens against every scenario in the four spec deltas (`design-tokens`, `clipboard-layout`, `settings-layout`, `app-shell-navigation`)
- [x] 7.3 Capture before/after screenshots for the gate review
