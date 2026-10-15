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
| `--accent` | marks: active tab underline, the selected card's ring and halo, the brand dot, a meter's fill, the command palette's slot badge | `--accent-on` |
| `--accent-hover` | hover state for an accent fill | `--accent-on` |
| `--accent-subtle` | tints: a pinned badge, a pressed pin, the active list row | `--accent-ink` |
| `--accent-ink` | text and icons sitting **on** `--accent-subtle` | — |
| `--accent-on` | text and icons sitting **on** `--accent` | — |

The pairing is the part that matters. `--accent-on` is not "white" — on Clay,
and on Amber in dark mode, it is a near-black.

What you **press** is not the accent. Save item, Copy, the chosen filter, a
checked box or switch are `--press` (Layer 2, below): near-black in light,
ivory in dark. The accent stays a mark, so a page has one or two touches of
clay rather than a button in every corner. A call site that writes `text-white`
over an accent fill instead of using the paired token is a bug, because it will
be unreadable on some of the six.

## The three layers

Layers exist so that changing the accent changes as little as possible.

**Layer 1 — accent ramps.** The five tokens above, twelve blocks (six accents ×
two modes). This is the only layer a new theme touches.

**Layer 2 — neutrals.** `--page`, `--surface-1`, `--surface-2`, `--border`,
`--text-primary`, `--text-secondary`, `--text-muted`. These change with **mode
only**, never with the accent. They are the Ivory & Clay palette: in light, a
warm ivory page (`--page` `#faf9f5`) under white cards (`--surface-1`
`#ffffff`), with oat (`--surface-2` `#f0eee6`) for filled chips; in dark, warm
charcoal (`--page` `#1f1e1d`) with cards a step lighter (`#262624`). Cards are
drawn by a shadow (`--shadow-card`, a hairline ring and the faintest drop)
rather than a border. Plus two derived values, mixed rather than given their
own hex: `--border-strong`, from `--border` and `--text-muted`, and
`--surface-hover`, a filled chip under the pointer, from `--surface-2` and
`--border`.

Layer 2 also holds `--press`, `--press-hover` and `--press-on` — what you press,
and the text on it — and `--strip`, the status bar's shade. Tailwind's
`primary` maps to `--press`, so `bg-primary` is near-black in light and ivory
in dark whatever the accent.

Clay is the default accent. Headings are set in Source Serif 4, text in
Instrument Sans, and anything code-shaped in JetBrains Mono. All three are
bundled as local woff2 files under `src/assets/fonts/`, each beside its OFL
licence: SnipDock works offline and never fetches a font.

**Layer 3 — semantic roles.** `--success`, `--danger`, `--warning`, the
`--code-*` syntax colours, and the `--type-*` content-type colours. Fixed across
all six accents. None of these is ever mapped to the accent: "this succeeded"
and "this will delete things" must not change meaning because someone picked
Plum. A test asserts that no Layer 2 or Layer 3 token reads `var(--accent*)`.

Components never read a Layer 1 hex. They read a Tailwind semantic class
(`bg-primary`, `text-accent-foreground`, `border-ring`, `text-destructive`), which
[`theme.css`](../src/styles/theme.css) maps onto the layers via `@theme inline`.

## How switching works

Two attributes on `<html>`:

```html
<html data-mode="dark" data-accent="clay">
```

Ramps are selected by pure CSS:

```css
[data-accent="clay"]                       { --accent: #d6714f; /* … */ }
:root[data-mode="dark"][data-accent="clay"],
:root[data-mode="dark"] [data-accent="clay"] { --accent: #d97757; /* … */ }
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
(`clay`, `system`).

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

All 24 accent pairs, plus the hover fills. Every text pair clears 4.5:1.
`accent/page` is measured on the Ivory & Clay page, `#faf9f5` light and
`#1f1e1d` dark. It is a mark, not text - the accent never carries words, its
ink does - so its floor is the 3:1 a non-text mark needs.

### Light

| Accent | on/accent | ink/subtle | on/hover | accent/page |
|---|---|---|---|---|
| teal | 6.57 | 10.72 | 4.65 | 6.24 |
| indigo | 5.37 | 7.73 | 4.86 | 5.10 |
| clay | 5.56 | 4.72 | 6.99 | 3.15 |
| amber | 5.61 | 8.72 | 4.62 | 5.33 |
| plum | 8.76 | 11.68 | 6.49 | 8.31 |
| slate | 8.82 | 11.83 | 6.35 | 8.38 |

### Dark

| Accent | on/accent | ink/subtle | on/hover | accent/page |
|---|---|---|---|---|
| teal | 9.10 | 10.02 | 10.22 | 8.94 |
| indigo | 6.05 | 9.98 | 7.61 | 5.71 |
| clay | 5.90 | 5.64 | 6.99 | 5.33 |
| amber | 9.74 | 11.48 | 10.87 | 10.69 |
| plum | 7.62 | 10.45 | 9.31 | 7.56 |
| slate | 8.29 | 10.36 | 9.94 | 7.84 |

### Values changed from the design spec

Ivory & Clay redraws Clay and the neutrals; two of its values measured short
and were moved by the least that clears the floor.

| Token | Spec | Measured | Shipped | Now |
|---|---|---|---|---|
| clay `--accent` (light) | `#D97757` | 2.96 on the page | `#D6714F` | 3.15 |
| `--text-muted` (light) | `#73726C` | 4.15 on oat | `#6B6A64` | 4.67 |

Clay's `--accent-on` is `#141413` in both modes: white on the mid clay
measured 3.1:1.

Earlier specs, still in force for the other accents:

| Token | Spec | Measured | Shipped | Now |
|---|---|---|---|---|
| teal `--accent-hover` | `#178A76` | 4.26 | `#168370` | 4.65 |
| amber `--accent` | `#B57516` | 3.80 | `#8F5D11` | 5.61 |
| amber `--accent-hover` | `#D18C1E` | 2.81 | `#9F6A17` | 4.62 |

Amber needed both rungs moved: the spec `--accent` failed outright, and the
lightest amber that clears 4.5:1 on white is roughly `#9F6A17`, so `--accent`
had to go darker still for `--accent-hover` to stay lighter than it, as it is in
every other light ramp.

`--success`, `--warning` and `--danger` are Layer 3 rather than accent pairs,
but all carry body text — `--success` labels "Capturing" and "Saved",
`--warning` labels "Private" on a card — so the same 4.5:1 floor applies, and
it is measured on `--surface-2` as well as the page, since a chip sits there.
In light, page / oat: `--success` olive `#3F5A2E` 7.35 / 6.66, `--warning`
`#7A5410` 6.42 / 5.83, `--danger` `#B3261E` 6.20 / 5.63, `--text-muted`
`#6B6A64` 5.15 / 4.67, and `--press-on` on `--press` 17.5. In dark every text
value clears 4.5:1 on the page, a card and `--surface-2`; the lowest is
`--text-muted` `#9C9A92` at 4.69 on `--surface-2`.
