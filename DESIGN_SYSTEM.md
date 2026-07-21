# SnipDock Design System

A compact, tool-focused design language in the spirit of Warp, Linear, and Raycast:
near-black surfaces, a single teal accent, flat elevation, and dense-but-breathable
spacing. Color is used sparingly — as a signal, not decoration.

## Principles

1. **Quiet by default.** Color appears only where it carries meaning (accent, private, danger). Everything else is neutral.
2. **Borders and surface tints carry hierarchy — not drop shadows.** Shadows are reserved for genuinely floating layers (menus, dialogs, toasts).
3. **Dense but readable.** Tight vertical rhythm; generous horizontal padding.
4. **One accent per view.** Teal marks the active/primary path. Don't spread it.
5. **Monospace for machine text** (previews, timestamps, versions, badges). Sans for chrome.

---

## Tokens

All values live in `tokens.css` as CSS custom properties and auto-adapt to light/dark.
Reference tokens — never hardcode hex.

### Color roles
| Token | Role |
|---|---|
| `--color-canvas` | App background |
| `--color-sidebar` | Sidebar background |
| `--color-surface` | Cards, panels, floating layers |
| `--color-surface-muted` | Row hover, inputs, secondary buttons |
| `--color-surface-raised` | One step above muted |
| `--color-chip` | Badge / kbd backgrounds |
| `--color-text` | Primary text |
| `--color-text-muted` | Secondary text |
| `--color-text-subtle` | Metadata, timestamps, eyebrows |
| `--color-border` | Default hairline |
| `--color-border-strong` | Emphasized divider, hover border |
| `--color-accent` | Teal — active, primary, focus |
| `--color-accent-soft` | Accent tint background |
| `--color-positive` | Tracking/online status |
| `--color-warning` | Private, caution |
| `--color-danger` | Destructive, errors |

### Accent
`#0f9488` (light) / `#2dd4bf` (dark). Deliberately **not** indigo — indigo is the
scaffolded-app default and reads as generic.

### Spacing
`--space-1`…`--space-8` on a 0.25rem base (4, 8, 12, 16, 20, 24, 32px).

### Radii
`--radius-sm` 0.3rem · `--radius-md` 0.45rem · `--radius-lg` 0.6rem.
Sharper than typical web apps — reads as "tool," not "site."

### Type
- Display: Plus Jakarta Sans — headings only.
- Body: Inter — all UI chrome.
- Mono: JetBrains Mono — previews, code, timestamps, badges, versions.
- Two weights carry the system: 500–560 (regular UI) and 620–640 (emphasis/headings). Avoid 700+ except tiny mono badges.

---

## Primitives

Class-based building blocks in `primitives.css`. Compose these instead of restyling per feature.

| Class | Use |
|---|---|
| `.sd-btn` + `--primary`/`--secondary`/`--ghost`/`--danger` | Buttons |
| `.sd-iconbtn` | Icon-only actions (copy, star, more) |
| `.sd-chip` + `.sd-chip__count` | Filter chips with counts |
| `.sd-badge` + `--accent`/`--warning`/`--danger` | Inline type/status labels |
| `.sd-pill` + `--accent` | Filled pill badge |
| `.sd-dot` / `.sd-status` | Status indicator dot + label |
| `.sd-field` | Text inputs, selects, textareas |
| `.sd-search` | Search input group |
| `.sd-kbd` | Keyboard shortcut hint (⌘K) |
| `.sd-listrow` + `__actions` | Selectable list rows with hover actions |
| `.sd-menu` + `__danger` | Dropdown menus |
| `.sd-surface` / `.sd-surface-2` / `.sd-inset` | Elevation surfaces |
| `.sd-eyebrow` / `.sd-title` | Section header pair |
| `.sd-empty` + `__mark` | Empty states |

---

## Patterns

### List row (clipboard item)
Eyebrow badge (type) + optional status badges (pinned/private) + right-aligned mono
timestamp + hover action cluster. Selected state uses a 2px accent left-rail plus a
muted background — never a full colored fill.

### Filter bar
Ghost chips with mono counts. Active chip uses `--color-accent-soft`. Item count sits
right-aligned in `--color-text-subtle`.

### Sensitive content
Items flagged `private` show a `--warning` lock badge and mask their values with
bullets in the list preview. Full value revealed only on explicit action.

### Elevation ladder
canvas → surface (bordered, flat) → floating (surface + `--shadow-panel`).
At most two floating layers at once; a third means a dialog.

---

## Import order (`src/styles/index.css`)
```css
@import "./fonts.css";
@import "./tokens.css";
@import "./base.css";
@import "./primitives.css";   /* new */
@import "./shell.css";
@import "./features/clipboard.css";
@import "./features/settings.css";
@import "./features/tools.css";
@import "./theme-pro.css";     /* refinements last */
```
