# SnipDock Frontend Redesign Design

**Date:** 2026-07-19

**Status:** Approved design; implementation not started

## Goal

Rebuild SnipDock's frontend around the supplied design-system document and HTML mockup while preserving real workflows, supporting light and dark themes, adding working global search and filters, and removing misleading or unused product surface.

## Product scope

The redesigned primary navigation contains five destinations:

1. Clipboard
2. Library
3. Templates
4. Tools
5. Settings

Library replaces the separate Snippets and Projects destinations. It owns snippets, commands, notes, saved templates, projects, categories, tags, sorting, and duplicate cleanup. Templates remains a focused editor and renderer because that workflow is materially different from finding and organizing saved records.

The Activity destination is removed. Its most-used view becomes a Library sort option, and exact-duplicate cleanup becomes a Library filter/action. Its reminder control is removed because it only writes an expiry timestamp and does not schedule a notification.

## Removal scope

Remove these incomplete or redundant surfaces end to end where safe:

- Activity page, reminder editor, recommendations, related navigation, styles, and tests.
- Fake AI actions and provider-boundary settings, including frontend controls, command wrappers, Rust command registration, fake provider module, tests, and documentation claims.
- Disabled sync status UI and its frontend/backend command surface, tests, and documentation claims.
- PIN lock controls and commands because current lock state does not gate application access. Keep sensitive-content detection, private-item restrictions, and export boundaries.
- Settings controls that only persist values but have no application behavior.
- Redundant unused Library/search/filter implementations after their useful query logic is folded into the active Library experience.

Do not remove database columns or create destructive migrations during this redesign. Existing databases must continue to open. Dormant stored values may remain for schema compatibility even when their UI is removed.

## Architecture

Keep the current React 19, TypeScript, Tauri 2, hash-navigation, command-wrapper, and CSS-file architecture. Do not add a router, state library, UI framework, CSS framework, icon dependency, or runtime font request.

`App` remains the navigation owner. It also owns the global search text and the page that was active before search. A non-empty global query renders a combined search-results view for Clipboard and Library records. Clearing the query restores the prior destination. Search uses the existing `search_items` command and `SearchQuery` contract rather than client-side filtering.

Existing feature pages keep their backend calls and domain behavior unless this specification explicitly removes or relocates them. Shared visual rules live in the existing token, base, and shell styles. Feature-specific layout remains in feature styles.

Prefer existing query code from `useLibraryQuery` and existing keyboard/list behavior over new equivalents. Consolidate only after callers are mapped; avoid generic component abstractions that have one consumer.

## Visual system

### Typography

Bundle WOFF2 assets locally under the frontend source tree and declare them with `@font-face`:

- Plus Jakarta Sans, weights 600 and 700: display headings and brand.
- Inter, weights 400, 500, and 600: interface text.
- JetBrains Mono, weights 400 and 500: content, code, timestamps, badges, and keyboard hints.

Each family must include system fallbacks. No Google Fonts stylesheet, remote preconnect, or other network request is allowed.

Use the supplied scale as the baseline: 26px page title, 17px panel title, 14.5px card title, 12.5px body, 11–12px metadata, and 10–10.5px badges. No visible text is smaller than 10px.

### Dark theme

Use the approved mockup palette:

- Canvas `#0A0D13`
- Sidebar/panel `#0F131B`
- Input/hover `#161B26`
- Raised hover `#1E2531`
- Chip track `#262E3D`
- Border `#232A37`
- Strong border `#333C4E`
- Primary text `#EEF0F6`
- Secondary text `#9AA2B3`
- Muted text `#606880`, restricted to nonessential metadata after contrast verification
- Brand `#7C8CFF`
- Brand tint `#1B1F42`
- Success/code `#43C7A6`
- Pinned/favorite `#F0B84C`
- Private/destructive `#F0705A`

### Light theme

Use the same hierarchy with light-specific contrast:

- Canvas `#F5F7FB`
- Sidebar/panel `#FFFFFF`
- Input/hover `#EEF1F7`
- Raised hover `#E5E9F2`
- Chip track `#D9DEEA`
- Border `#D9DFEA`
- Strong border `#BBC4D4`
- Primary text `#171B26`
- Secondary text `#596174`
- Muted text `#737C90`, restricted to nonessential metadata after contrast verification
- Brand `#5263E6`
- Brand tint `#E9ECFF`
- Success/code `#167A65`
- Pinned/favorite `#8A5A00`
- Private/destructive `#B83F31`

Brand indigo means selected state, primary action, focus, or SnipDock identity. Informational badges use semantic colors instead.

### Signature treatment

The visual signature is a compact “docked capture” stack: bordered content cards with a type badge at the leading edge, monospace preview, stable metadata, and an action area that appears without shifting layout. Selection uses a restrained indigo rail/tint. The treatment should make mixed clipboard and code content scannable without turning the whole application into a dashboard of decorative cards.

## Shared interaction rules

- Each panel has at most one filled primary action.
- Secondary actions use outlined or ghost treatment.
- Destructive actions use coral/red and retain confirmation where data can be lost.
- All controls use native semantic elements. Custom-looking toggles remain real checkbox inputs with accessible names.
- Every input, button, link, menu item, chip, switch, and selectable row has a visible focus state.
- Minimum interactive height is 32px; standard buttons are 34px.
- Hover-revealed actions also remain reachable by keyboard and visible when their container has focus within.
- Loading, empty, filtered-empty, error, success, and disabled states use plain-language copy.
- Motion is limited to short color/opacity transitions and disabled under `prefers-reduced-motion`.

## Shell and navigation

Use a 230px expanded sidebar with the approved brand treatment, five navigation items, and the “Stored locally” trust indicator. Preserve the current compact-sidebar behavior for narrow windows, including accessible labels when text is visually hidden.

The top bar contains the combined search field, keyboard hint, and Offline status. Search is controlled state, supports keyboard focus, and does not silently do nothing on non-Library pages.

Content remains fluid. The 1280×820 mockup is a visual reference, not a fixed application size. Layouts must work at the repository's existing 22rem minimum width and common desktop widths.

## Global search

Typing a non-empty query in the top bar opens a combined results view. The backend query includes kinds `clipboard`, `snippet`, `command`, `template`, and `note`, sorts newest first by default, and pages results using the existing limit/offset mechanism.

Each result shows source kind, detected content type or language, title/fallback label, short preview, flags, and timestamp or usage metadata. Selecting a result exposes the same safe actions available in its source workflow. Private content remains masked according to existing rules.

The results view provides loading, error, no-results, and paging states. Clearing search returns to the page active before search began. Escape clears the query when the search field owns focus. Search updates must not allow a slower stale request to replace newer results.

## Clipboard

Preserve capture updates, tracking pause/resume, clear confirmation, undo, keyboard list navigation, item actions, and accurate totals.

Add backend-driven chips for:

- All
- Code, covering every non-plain detected content type
- Pinned
- Favorites

Do not add the mockup's Secrets chip. Current capture policy rejects high-risk secrets, and the search contract has no meaningful stored-secret category. Private status is still shown with a lock label when present; color alone is insufficient.

Clipboard items use the docked-card treatment. The badge label comes from `content_type`, with `language` preferred for code when available. Filter state combines with the top-bar query when Clipboard is the restored page.

## Library

Library combines the active Snippet detail/editor behavior with the existing backend search and taxonomy capabilities. It provides:

- New item primary action.
- Item kinds: snippet, command, template, and note.
- Filters for kind, content type, project, category, tag, pinned, favorite, creation date, and sort order.
- Sort orders newest, oldest, and most used.
- List/detail keyboard behavior, paging, copy, edit, duplicate, archive/delete, undo, formatting, and sensitive preview.
- Project, category, and tag management inside the Library destination rather than separate primary navigation.
- Exact-duplicate review as a Library maintenance filter/action, not an Activity page.

Use quick chips for frequent filters and a compact advanced-filter surface for taxonomy and dates. Active filters must be removable individually and clearable together. Filter state always maps to the existing backend query fields.

Projects retain create, edit, archive, item assignment, and recent-item behavior. They appear as an organization view within Library. Categories and tags remain available to editors and filters; management uses the existing backend commands.

## Templates

Keep the dedicated template editor, placeholder extraction, live render, built-in values, copy-rendered action, save-as-snippet action, errors, and diagnostics.

Restyle it as a responsive editor-and-preview workspace. “Save template” is the editor panel's primary action. “Copy rendered” is the completed-preview panel's primary action. Disabled actions remain actual disabled buttons rather than opacity-only mock controls.

## Tools

Keep every currently implemented offline tool. Group the list under Encoding, Generators, and Text and data where the mapping is unambiguous; keep search within the tool list.

The workspace has one Run primary action. Copy and Create snippet are secondary. Output starts with an intentional empty state, then shows result, warnings, or a plain-language error. Existing tool input shapes and Rust implementations remain authoritative.

## Settings

Settings uses task-based panels and a compact internal index when needed. Retain only controls with real behavior in the current application:

- Clipboard tracking, history retention, maximum items, and implemented capture exclusions.
- Theme: system, light, and dark.
- Transfer: import/export format, paths, duplicate policy, and dry-run preview.
- Manual backup and restore, including dry-run restore.
- Privacy explanations for local storage, private-item export restrictions, and sensitive capture policy.

Remove fake AI, fake sync, and fake lock panels. Remove controls that only persist inert values. If implementation inspection finds a setting wired into application behavior, retain it and document the caller in the implementation plan rather than deleting it.

Transfer and Backup are separate panels. Each action keeps existing validation, busy state, result reporting, destructive confirmation, and error handling. Dry-run controls use accessible switches with consequence descriptions.

## Accessibility and responsive behavior

- Preserve semantic landmarks, unique heading ownership, accessible dialogs, focus trapping, focus restoration, live regions, and roving selection behavior already covered by tests.
- Verify WCAG AA contrast for normal text in both themes. Muted metadata may use the lower large-text/nonessential threshold only when it is not required to complete a task.
- Never use color as the only indicator for type, private status, error, selection, or success.
- At narrow widths, collapse the sidebar labels, stack multi-column editors, keep actions reachable, and avoid horizontal page scrolling. Code/output regions may scroll internally.
- At compact desktop widths, Library and Tools switch from two columns to stacked list/detail regions without losing selection context.

## Error handling and state integrity

Retain current friendly error boundaries at the page and action levels. Do not expose raw Rust exceptions. Search and filters must preserve the last valid UI while a new request loads where practical, and must ignore stale responses. Destructive operations retain undo or confirmation according to current behavior.

Deleting removed features must also remove unreachable navigation, imports, styles, tests, command wrappers, and documentation statements. Rust/database compatibility takes priority over maximum deletion; schema cleanup is outside this redesign.

## Verification

Implementation tasks use the repository's existing Bun and Rust tooling.

Automated checks must cover:

- Five-item navigation and removal of retired destinations.
- Theme token application and system/light/dark selection.
- Combined global search, clearing behavior, stale-result protection, empty/error states, and paging.
- Clipboard chips and combined query behavior.
- Library quick and advanced filters, sorting, organization views, keyboard selection, and CRUD actions.
- Accessible switches, dialogs, focus restoration, disabled controls, and live messages.
- Existing Templates, Tools, transfer, backup, sensitive preview, and undo behavior.
- Removal of fake AI, sync, lock, reminder, and Activity surfaces.

Required commands at final integration:

```powershell
bun test
bun run lint
bun run build
cargo test --manifest-path src-tauri/Cargo.toml
```

Manual verification captures light and dark screenshots at wide, compact, and narrow window widths. Check focus visibility, keyboard-only use, 32px target minimums, reduced motion, overflow, and both empty and populated states.

## Implementation sequence

The implementation plan will divide work into independently reviewable numbered tasks in this order:

1. Product-surface removals and navigation cleanup.
2. Local fonts, dual-theme tokens, and shared control styling.
3. Responsive shell and controlled global search field.
4. Combined global search results.
5. Clipboard cards and filters.
6. Library consolidation, search, filters, and organization.
7. Templates redesign.
8. Tools redesign.
9. Settings pruning and redesign.
10. Cross-page accessibility, responsive, documentation, and final integration verification.

Each numbered task must leave the application buildable and testable, update `PROGRESS.md`, stage only task-owned files, and create one local commit. No implementation begins until the numbered plan and tracker are reviewed and approved.
