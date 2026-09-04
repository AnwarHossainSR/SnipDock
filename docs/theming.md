# Theming

SnipDock ships six accents — Teal, Indigo, Clay, Amber, Plum, Slate — each
defined for light and dark. The user picks one in **Settings → Appearance**, and
it persists across launches.

Everything colour lives in [`src/styles/tokens.css`](../src/styles/tokens.css).
It is the only file in the app allowed to contain a colour literal, and a test
enforces that.

## The five-token contract

An accent is exactly five values. Nothing else in the app is allowed to vary
with the accent, and every accent must define all five.

| Token | What it paints | Paired with |
|---|---|---|
| `--accent` | solid fills: primary button, logo mark, active tab underline, selected-row left border | `--accent-on` |
| `--accent-hover` | hover state for those same fills | `--accent-on` |
| `--accent-subtle` | tints: active nav pill, selected-row band, accent badges | `--accent-ink` |
| `--accent-ink` | text and icons sitting **on** `--accent-subtle` | — |
| `--accent-on` | text and icons sitting **on** `--accent` | — |

The pairing is the part that matters. `--accent-on` is not "white" — on Amber
and Clay in dark mode it is a near-black. A call site that writes `text-white`
over an accent fill instead of using the paired token is a bug, because it will
be unreadable on some of the six.

## The three layers

Layers exist so that changing the accent changes as little as possible.

**Layer 1 — accent ramps.** The five tokens above, twelve blocks (six accents ×
two modes). This is the only layer a new theme touches.

**Layer 2 — neutrals.** `--page`, `--surface-1`, `--surface-2`, `--border`,
`--text-primary`, `--text-secondary`, `--text-muted`. These change with **mode
only** and are genuinely neutral — the dark surfaces carry no hue, so they do
not fight whichever accent is active. Plus one derived value, `--border-strong`,
mixed from `--border` and `--text-muted` rather than given its own hex.

**Layer 3 — semantic roles.** `--success`, `--danger`, `--warning`, the
`--code-*` syntax colours, and the `--type-*` content-type colours. Fixed across
all six accents. None of these is ever mapped to the accent: "this succeeded"
and "this will delete things" must not change meaning because someone picked
Plum. A test asserts that no Layer 2 or Layer 3 token reads `var(--accent*)`.

Components never read a Layer 1 hex. They read a Tailwind semantic class
(`bg-primary`, `text-accent-foreground`, `text-destructive`), which
[`theme.css`](../src/styles/theme.css) maps onto the layers via `@theme inline`.

## How switching works

Two attributes on `<html>`:

```html
<html data-mode="dark" data-accent="indigo">
```

Ramps are selected by pure CSS:

```css
[data-accent="indigo"]                       { --accent: #4338ca; /* … */ }
:root[data-mode="dark"][data-accent="indigo"],
:root[data-mode="dark"] [data-accent="indigo"] { --accent: #818cf8; /* … */ }
```

Switching an accent is one attribute write. No CSS-in-JS, no injected styles, no
colour props, no re-render — the cascade does the work.

Two details worth knowing:

- **`data-mode` is always concrete.** The stored preference may be `system`, but
  the attribute is only ever `light` or `dark`; `system` is resolved in JS and
  re-resolved live when the OS preference changes. No CSS matches
  `[data-mode="system"]`, and there is no `prefers-color-scheme` query anywhere
  in the app.
- **The ramp selectors match any element, not just `:root`.** That is what lets
  each swatch in the Settings picker carry `data-accent` and paint itself from
  the ramp it represents, instead of a second hand-copied set of hexes that
  could drift. The dark rules pair a root selector with a descendant one so a
  swatch inside a dark app still shows its dark values.

## Persistence, and why there are two copies

The authoritative copy of `accent` and `theme` (mode) lives in the settings
store in SQLite, beside every other preference, so a reinstall does not reset
them.

That store is behind an async IPC call, which cannot beat the first paint. So
the pair is also mirrored into `localStorage` and replayed by a small inline
script in [`index.html`](../index.html) before the first frame. On boot,
`main.tsx` reconciles the mirror against the stored settings; in the normal case
they agree and nothing repaints.

The mirror is a cache, never the source of truth. If it is missing, stale, or
hand-edited to something invalid, the stored settings win one tick later and the
guards in [`src/lib/theme.ts`](../src/lib/theme.ts) fall back to the defaults
(`teal`, `system`).

`localStorage` writes are wrapped in `try`/`catch`: in a context where storage
throws, the cost is one frame of the default theme on next launch, which is not
worth an error.

## Adding a seventh theme

Two edits.

1. **One CSS block per mode** in `tokens.css` — the light ramp under
   `[data-accent="<name>"]`, the dark one under the paired
   `:root[data-mode="dark"][data-accent="<name>"], :root[data-mode="dark"] [data-accent="<name>"]`.
2. **One entry** in `ACCENTS` in `src/lib/theme.ts`. The Settings picker, the
   `Accent` type, and the validation guard all derive from that array.

Then add the name to the `matches!` list in
[`src-tauri/src/storage/settings.rs`](../src-tauri/src/storage/settings.rs), so
the backend accepts it.

The test suite will tell you if you missed a step: one test asserts every accent
defines all five tokens in both modes, and another asserts the stylesheet and
the picker list exactly the same set.

### Check the contrast

Measure before you commit the hexes. Both pairs must clear **4.5:1**:

- `--accent-on` against `--accent`, and against `--accent-hover`
- `--accent-ink` against `--accent-subtle`

The hover pair is easy to forget and is not optional — a button under the
pointer still shows body text on it.

## Measured contrast

All 24 accent pairs, plus the hover fills. Every value clears 4.5:1.

### Light

| Accent | on/accent | ink/subtle | on/hover | accent/page |
|---|---|---|---|---|
| teal | 6.57 | 10.72 | 4.65 | 6.57 |
| indigo | 7.90 | 10.08 | 5.76 | 7.90 |
| clay | 5.54 | 8.20 | 4.61 | 5.54 |
| amber | 5.61 | 8.72 | 4.62 | 5.61 |
| plum | 8.76 | 11.68 | 6.49 | 8.76 |
| slate | 8.82 | 11.83 | 6.35 | 8.82 |

### Dark

| Accent | on/accent | ink/subtle | on/hover | accent/page |
|---|---|---|---|---|
| teal | 9.10 | 10.02 | 10.22 | 10.57 |
| indigo | 5.79 | 10.25 | 7.48 | 6.60 |
| clay | 7.15 | 10.10 | 8.69 | 8.95 |
| amber | 9.74 | 11.48 | 10.87 | 12.64 |
| plum | 7.62 | 10.45 | 9.31 | 8.94 |
| slate | 8.29 | 10.36 | 9.94 | 9.27 |

### Values changed from the original design spec

Six, all in light mode; every dark value is the spec unchanged.

| Token | Spec | Measured | Shipped | Now |
|---|---|---|---|---|
| teal `--accent-hover` | `#178A76` | 4.26 | `#168370` | 4.65 |
| clay `--accent-hover` | `#D25529` | 4.14 | `#C55027` | 4.61 |
| amber `--accent` | `#B57516` | 3.80 | `#8F5D11` | 5.61 |
| amber `--accent-hover` | `#D18C1E` | 2.81 | `#9F6A17` | 4.62 |
| `--success` | `#22A559` | 3.18 | `#1C8649` | 4.61 |
| `--warning` | `#B57516` | 3.80 | `#A26814` | 4.64 |

Amber needed both rungs moved: the spec `--accent` failed outright, and the
lightest amber that clears 4.5:1 on white is roughly `#9F6A17`, so `--accent`
had to go darker still for `--accent-hover` to stay lighter than it, as it is in
every other light ramp.

`--success` and `--warning` are Layer 3 rather than accent pairs, but both carry
body text — `--success` labels "Capturing" and "Saved", `--warning` labels
"Private" on a row — so the same 4.5:1 floor applies.
