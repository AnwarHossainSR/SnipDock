# SnipDock Progress

Task state for the numbered plan. One task per `/task N`, per `AGENTS.md`.

`enhancement-plan.md` was retired and removed on 2026-10-16 at the user's
request. The tables below keep each task's title and state; a pending task's
full spec is in the file's git history (`git show 983d25c:enhancement-plan.md`).

States: `[ ]` pending · `[~]` legacy unfinished · `[x]` completed and committed locally

**12 of 34 complete.** Tasks 32–34 and the full specs for 21 and 23 come from
the [feature plan](#feature-plan-2026-10-22) of 2026-10-22.

## Active plan

The retired `enhancement-plan.md` - audit of `dev` at `0db656b` (v0.1.21): 26
bugs, 10 feature proposals, and a UI polish / demo imagery programme.

### Phase 1 — Correctness and safety

| Task | Title | State | Commit | Notes |
| ---- | ----- | ----- | ------ | ----- |
| 1 | CI runs on push and pull request | [x] | _pending_ | B5; 2026-09-22. Checks: workflow parses, job graph unchanged, `bun test` 344 pass, `bun run lint`, `bun run build`. `cargo test` not run — B27 plus missing GTK dev libraries; this task touches no Rust. Files: `.github/workflows/ci.yml` |
| 2 | Route on destination, not on query | [x] | _pending_ | B1; 2026-09-22. Checks: `bun test` 345 pass, `bun run lint`, `bun run build`. Files: `src/app/App.tsx`, `src/app/App.test.tsx` |
| 3 | Cloud credentials out of the settings blob | [ ] | | B3; adds `keyring` |
| 4 | Bound the regex search | [ ] | | B2 |
| 5 | Preview column and a capture size cap | [ ] | | B4; schema migration |
| 6 | Register before unregister for the global accelerator | [ ] | | B12 |
| 7 | CLI reads the paste format per request | [ ] | | B10 |

### Phase 2 — Behaviour and platform

| Task | Title | State | Commit | Notes |
| ---- | ----- | ----- | ------ | ----- |
| 8 | Single-owner tracking state and cross-surface flag writes | [x] | _pending_ | B6, B19, B21; 2026-09-22. Checks: `bun test` 348 pass, `bun run lint`, `bun run build`. Files: `src/app/App.tsx`, `src/features/clipboard/ClipboardPage.tsx`, `src/features/search/SearchResultsPage.tsx` + 3 tests |
| 9 | Narrowing-aware empty states | [x] | _pending_ | B7, B20; 2026-09-22. Checks: `bun test` 349 pass, `bun run lint`, `bun run build`. Files: `src/features/clipboard/ClipboardPage.tsx`, `src/features/search/SearchResultsPage.tsx` + test |
| 10 | Reveal-in-history, and honest shortcut hints | [x] | _pending_ | B8, B18; 2026-09-22. Checks: `bun test` 351 pass, `bun run lint`, `bun run build`. Files: `src/features/search/SearchResultsPage.tsx`, `src/features/clipboard/QuickPastePage.tsx` + 2 tests |
| 11 | Clipboard change token on macOS and Linux | [ ] | | B9 |
| 12 | Image thumbnails | [x] | _pending_ | B11; 2026-09-22. Checks: clippy `-D warnings` clean, 6 new Rust tests (executed by CI, not here), `bun test` 368 pass, `bun run lint`, `bun run build`. Files: `src-tauri/src/features/images.rs`, `src/lib/itemImage.ts`, `src/components/ItemThumbnail.tsx`, `src/features/clipboard/ItemInspector.tsx` + test |
| 13 | Retire the dead settings, matrix claims, and sync module | [x] | _pending_ | B15, B16, B24; 2026-09-22. Checks: `cargo clippy --all-targets -- -D warnings` clean with and without `--features sync`; `cargo metadata --locked` clean (Cargo.lock unchanged); `bun test` 360 pass, `bun run lint`, `bun run build`. Rust not executed — see Environment note |
| 14 | OS-aware copy and doc correction | [x] | _pending_ | B17, B23; 2026-09-22. Checks: clippy `-D warnings` clean, `bun test` 361 pass, `bun run lint`, `bun run build`. Files: `src-tauri/src/models/platform.rs`, `src/api/types.ts`, `src/stores/platformStore.ts`, `src/features/settings/SettingsPage.tsx`, `docs/keyboard-shortcuts.md` + test |
| 31 | Unicode-safe, candidate-scoped literal search | [ ] | | B22. Split out of 14 — rewrites the search hot path; needs runtime Rust tests |

### Phase 3 — UI polish, then imagery

| Task | Title | State | Commit | Notes |
| ---- | ----- | ----- | ------ | ----- |
| 15 | Window, breakpoint, and high-contrast support | [x] | _pending_ | B13, B25; 2026-09-22. Checks: `bun test` 352 pass, `bun run lint`, `bun run build`; tauri.conf.json parses. Forced-colors not visually confirmed — no display in this environment. Files: `src-tauri/tauri.conf.json`, `src/features/clipboard/ClipboardPage.tsx`, `src/styles/base.css`, `src/styles/tokens.test.ts` |
| 16 | Honest shortcut hints, and an empty state that teaches | [x] | _pending_ | §3.4 items 3, 8; 2026-09-22. Checks: `bun test` 360 pass, `bun run lint`, `bun run build`. Files: `src/lib/shortcutHints.ts`, `src/features/clipboard/ClipboardPage.tsx`, `src/app/components/WorkspaceSearch.tsx`, `src/app/App.tsx` + 2 tests |
| 30 | Toolbar, selection, and inspector restructure | [ ] | | §3.4 items 4, 5, 6. **Item 4 (select-mode toggle) landed 2026-09-22**; items 5 and 6 still need a display. A native `<select>` for item 6 was tried and reverted — it collides with the history listbox's own `role="option"`; see the plan |
| 17 | Platform icon set and the updater question | [x] | _pending_ | B14; 2026-09-22. Checks: `bun test` 354 pass, `bun run lint`, tauri.conf.json parses, new `bundle-icons.test.ts`. Not built — `tauri build` needs the Rust toolchain (see Environment note). Files: `src-tauri/icons/*`, `src-tauri/tauri.conf.json`, `README.md`, `src/test/bundle-icons.test.ts` |
| 18 | Reproducible demo fixture | [ ] | | §3.1 |
| 19 | Shoot the image set | [ ] | | §3.2 |
| 20 | Wire the images in | [ ] | | §3.3 |

### Phase 4 — Features

| Task | Title | State | Commit | Notes |
| ---- | ----- | ----- | ------ | ----- |
| 21 | Snippet library | [ ] | | F1; closes B26. Full spec in the feature plan; first in its order |
| 22 | First-run onboarding | [x] | _pending_ | F7; 2026-09-22. Checks: `bun test` 366 pass, `bun run lint`, `bun run build`, clippy `-D warnings`. Not seen on a display — layout unverified visually. Files: `src/app/components/Onboarding.tsx`, `src/app/App.tsx`, `src-tauri/src/models/settings.rs`, `src/api/types.ts` + test |
| 23 | Command palette | [ ] | | F6. **Partly shipped** in `84e9280` (Ctrl/Cmd+K, redesign round); the remaining scope is in the feature plan |
| 24 | Clipboard stack / multi-paste | [ ] | | F5 |
| 25 | Quick-slot paste | [ ] | | F10 |
| 26 | macOS and Linux parity — source app and direct paste | [ ] | | F4 |
| 27 | File-path and rich-text capture | [ ] | | F9 |
| 28 | Encryption at rest with auto-lock | [ ] | | F3 |
| 29 | Finish sync, or remove it | [ ] | | F8 |

### Phase 5 — Features planned 2026-10-22

| Task | Title | State | Commit | Notes |
| ---- | ----- | ----- | ------ | ----- |
| 32 | Snippet templates | [ ] | | The `{{placeholder}}` half of F1; depends on 21 |
| 33 | Env sets in the terminal | [ ] | | `snipdock env <set>`; new |
| 34 | Env secrets in the OS keychain | [ ] | | Depends on 3 (`keyring`); new |

## Notes

- Each task finishes with code, `PROGRESS.md` updated, and one local commit.
  Pushes and PRs happen only when the user asks, per `AGENTS.md`.
- Full verification gate: `bun test`, `bun run lint`, `bun run build`,
  `cargo test --manifest-path src-tauri/Cargo.toml`. Each task's own `Checks`
  section says which of these it must run.
- Tasks 24–29 carry a summary spec only; each is written out in full when its
  phase is reached, so it reflects the codebase as it will be by then. Tasks
  21, 23 and 32–34 are written out in the feature plan below.

## Review round (screenshot review, outside the numbered plan)

A pass over the built app in Chromium, against a stand-in Tauri runtime, found
the issues below. Each is its own commit, each with a test that fails without
the fix; none changed Rust.

| Fix | Commit |
| --- | --- |
| Display-face word space ("JSONcapture") | `ae61ee3` |
| One clear button in the search field | `24f1b50` |
| Shortcut keycaps stay on one line | `283915d` |
| Quick Paste names the transform modifier (Alt / Option) | `8dd005d` |
| Search never flashes the unfiltered history | `81165ca` |
| Sidebar library scrolls instead of clipping | `bbab1ed` |
| Base styles in a cascade layer (double focus rings, oversized text) | `3c47e2f` |
| One-line previews say something (pretty JSON was "{") | `7d65fea` |
| Quick Paste shows twice as many rows | `8c1006b` |
| Search results as history rows, matched line shown and marked | `15d43a1` |
| Sidebar and pill counts refetch on library changes only (filter click: 14 IPC → 1) | `89abf5c` |
| A press on a row's menu no longer copies the row; pills fit 560px | `e3fbdde` |
| Settings fields at the page's text size | `1589b4a` |

Verification: `bun test` (401 pass), `bun run lint`, `bun run build`, and a
34-check browser regression pass over the production build — history, filters,
grouping, sort, sources, row menu, delete and undo, pause, live capture,
search (literal, operators, regex, errors), Settings, onboarding, empty state,
Quick Paste, and 760/560px layouts — all passing with no page errors. The same
pass against the build before this round fails six checks, all fixed here or
new behaviour. The harness lives in the session scratchpad, not the repo.

## Redesign round and 0.1.22 (outside the numbered plan)

The approved UI concepts, built into the app, then released as 0.1.22. Each
step is its own commit; none changed Rust beyond the version number.

| Step | Commit |
| --- | --- |
| Shared pieces: type tiles, highlighted code view, inverted toast | `187d821` |
| Sidebar: accent pill, real Quick Paste key, accent swatches | `8221763` |
| History header and one-line toolbar (Source and Group menus) | `713b732` |
| History rows and inspector, with working transforms | `ea01fd5` |
| Quick Paste preview pane (window 520 → 880px) | `a4356aa` |
| Ctrl/Cmd+K command palette | `84e9280` |
| Header wraps in a narrow window; bulk actions only for a selection | `e1e67de` |
| Version and changelog (0.2.0 at first, then 0.1.22 as asked) | `129e298`, this commit |

The palette's commands call the same code as the controls they stand for;
the Save and Clear dialogs stay owned by the Clipboard page, which takes a
`pageRequest` from the store when it is on screen. Settings › Privacy uses
`src/lib/settingsSection.ts` rather than a hash, so the sidebar never lights
the wrong entry.

Verification: `bun test` (433 pass), `bun run lint`, `bun run build`, and a
44-check browser regression pass over the production build - the 34 checks
above updated for the new controls, plus hover actions, inspector transform
copy, the Quick Paste preview pane, and seven palette checks (open/close and
focus return, theme, recent copy, Pinned, Clear, unmatched text to search,
Settings › Privacy) - all passing with no page errors. That pass is what
found the `e1e67de` fix. `Cargo.lock` stays consistent under `--locked`.

## Storage limit (standalone feature, outside the numbered plan)

Requested from a screenshot of the sidebar's storage strip: make the reading
real, add a configurable limit, warn at 75%, stop capture when full.

- `max_storage_mb` setting (default 1024, 50–102,400), chosen from a size
  menu in Settings › Retention, which also reports usage against it.
- Usage is live database pages plus the images rows still reference. File
  sizes would never come down after a delete (no VACUUM; images wait for the
  orphan sweep), so a full store could not have been emptied from the app.
- Capture checks the limit after the cheap filters and refuses with
  `CaptureIgnoreReason::StorageFull`; manual saves are not blocked.
- `get_storage_size` gained `limit_bytes` and `full`; one `storageStore`
  feeds the sidebar meter, the header capture pill, and Settings.

Checks: `cargo test` (all suites; 2 new capture tests, settings range test),
`cargo clippy --all-targets -D warnings`, `bun test` (438 pass), `bun run
lint`, `bun run build`, and a browser pass over the built app with a stubbed
IPC: normal, 78% warning, full, "Free space" → Settings row, and raising the
limit restoring capture live.

## Paper Desk redesign and 0.1.23 (outside the numbered plan)

The "Paper Desk" concept, picked from four design demos and built into the
main window on `dev`, then versioned as 0.1.23. Rust changed only for the default accent (`clay`).

| Step | Commit |
| --- | --- |
| Paper palette, clay default accent, Fraunces and Instrument Sans | `8415c59` |
| Top bar, Library menu and status strip replace the sidebar | `4ffcb64` |
| Capture cards under serif day headings; search and results | `a9949ae` |
| Reading panel: preview, "Copy it as", facts, organizer, actions | `2ec9441` |
| Regression pass fixes (below) | `e0f086b` |
| Test isolation: reset the route between tests (CI order) | `a33f809` |
| Version 0.1.23 and changelog | this commit |

Regression pass fixes, each found in the browser pass rather than the unit
tests:

- The workspace is the scroll container now, so it has to be `relative`:
  visually hidden inputs in Settings were positioned against the window and
  made the whole document scroll 2,300px past the status strip.
- Settings › Privacy from the palette held its target by observing
  `document.body`, which no longer changes size; it observes the column of
  sections instead. New test fails on the old line.
- Search suggestions follow the field's own width (container query), not
  the window's, so the reading panel no longer cuts the placeholder off.
- The status strip drops "stored locally" and the meter bar below 40rem so it
  stays one line; onboarding copy and stale "sidebar" comments updated.

Verification: `bun test` (449 pass, and in five `--randomize` seeds),
`bun run lint`, `bun run build`, and two browser passes over the production build with a stubbed IPC - 47 checks (the
earlier 44 updated for the top bar, Library, grid keys and reading panel) and
20 more for masking (a private capture's text is not in the DOM until
revealed), Favorites/Images filters, reading-panel Pin/Star/tags/auto-delete/
Delete and Undo, shortcut events, Save item, bulk delete and Undo, Clear
history, saved searches and tags from the Library, the status strip's accent
and theme, Settings tracking/density/duplicates/credential sweep/backup, and
Quick Paste Ctrl+2 - all passing with no page errors. Screenshots in light and
dark at 1180, 760 and 560px. Rust not executed here (see below); the one Rust
change is a default string and its test.

## Porcelain restyle (outside the numbered plan)

After 0.1.23 the user found Paper Desk's colours muddy and asked for a better
look with a demo first. Three directions (Porcelain, Graphite, Linen & Cobalt)
were shot from the real build with injected stylesheets, compared against
0.1.23 on one page, and Porcelain was built. Same layout and features; `dev`
restarted from `main` after #148 merged.

- Tokens: cool neutrals, card shadows (`--shadow-card`, `--shadow-card-hover`),
  `--surface-hover` for filled chips, re-measured semantic, code and type
  colours. Indigo redrawn as iris and made the default (TS, `index.html`,
  Rust default and its test).
- Type: Fraunces removed; headings in Instrument Sans, resized and without
  italics.
- Components: shadow-drawn cards and search results, filled chips (filters,
  "Copy it as", suggestions, Quick Paste transforms), a lighter search frame,
  a card-coloured reading panel, iris Save item and brand mark.

Verification: `bun test` (449 pass), `bun run lint`, `bun run build`, the 47-
and 20-check browser passes over the production build (no page errors), and
screenshots of every screen in light and dark compared against the demo.
Contrast recomputed from `tokens.css`: every accent pair and every text colour
clears 4.5:1 (lowest: clay hover 4.61), tabulated in `docs/theming.md`. Rust
changed only for the default accent string; `cargo test` runs in CI.

Released as 0.1.24 (`bun run version 0.1.24`). CI on the Porcelain commit
`f2305a6` passed: Frontend and Rust on Ubuntu, macOS and Windows.

## Environment variables (standalone feature, outside the numbered plan)

Requested directly: store environment variables of any shape - single values
or JSON - with a page, database tables and whatever else the feature needs.

- Schema `0009_env_vars.sql`: `env_groups` (named sets, name unique ignoring
  case) and `env_vars` (key unique per set, `ON DELETE CASCADE`, `secret`
  flag, note, position). Idempotent, because the snapshot test replays the
  newest migration.
- Rust: `storage/env_vars.rs` as methods on `Repository` (no new state), the
  `commands/env_vars.rs` invoke surface (list/save/delete/duplicate sets,
  list/save/delete variables, transactional import), and `copy_text`, which
  marks the write as self-written so a copied secret never lands in history.
  `map_unique` moved from `organization.rs` to `storage/mod.rs` to be shared.
- Frontend: `src/lib/envFormat.ts` parses `.env` (quotes, multi-line,
  `export`/`set`/`$env:` prefixes) and JSON (object or name/value array),
  guesses secrets, and exports `.env`, JSON, Shell, PowerShell and YAML.
  `src/features/env/` is the **Env** page (`#env`): set list, masked values
  (not in the DOM until revealed), filter that never matches a hidden value,
  editor with JSON format/minify, import preview, delete with Undo. Top bar
  link and a command palette entry.
- Docs: `docs/env-vars.md`, privacy note, README, CHANGELOG, palette paragraph.

Checks: `bun test` (481 pass, also under `--randomize`), `bun run lint`,
`bun run build`; `cargo clippy --all-targets -- -D warnings` clean with and
without `--features sync`; `Cargo.lock` unchanged under `--locked`. Rust does
not link here (see below), so the new repository code and every migration
were executed in a scratch crate against real SQLite - the same scenarios as
`src-tauri/tests/env_vars.rs`, plus a replay of 0009 - all passing; the
integration tests themselves run in CI. A 27-check browser pass over the
production build with a stubbed IPC (empty state, create, reveal, copy as,
edit with Ctrl+Enter, import preview, duplicate, delete, palette route; no
horizontal scroll at 1180/760/560px in light and dark) passed with no page
errors.

Review rounds: CodeRabbit's three findings (apostrophes in Shell/PowerShell
exports, `KEY: value` with `=` in the value, README wording) fixed in
`028c3c7`. A second, self-run review found ten more, all reproduced first
and fixed, each with a test that failed before:

- an unclosed quote swallowed every later line; it is now one error and
  parsing carries on from the next line
- YAML quoted keys (`"ProgramFiles(x86)": …`) and JSON escapes (`\uXXXX`,
  `\b`, `\f`) read back; a CR inside a quoted value is kept
- JSON numbers keep their source text (`1.10`, 20-digit IDs) where the
  engine exposes it to the reviver
- a key may not start with `#` (TS and Rust), and the key check counts C1
  controls as Rust does
- Shell export leaves out names it cannot export, as a comment, and the copy
  notice says how many
- Undo restores the deleted row itself (`restore_env_var`: same id, place and
  creation time) instead of re-creating it at the end
- copying an empty value says there is nothing to copy instead of failing

Not changed: `byteLength` is duplicated with `SaveItemDialog` (one line).

CodeRabbit's second pass found two more, both reproduced and fixed: the
clipboard monitor spent the "SnipDock wrote this" marker on any new value,
so a change landing between the mark and the write let the app's own copy
(a secret from the Env page) into history - it is now spent only by its own
value (`monitor.rs`, reproduced on the real loop in a scratch crate); and a
restore into a freed last position tied with a variable added since, so
Undo now shifts later rows down first.
Versioned as 0.1.25 (`bun run version 0.1.25`).

Sets per project (requested after the review): `0010_env_group_projects.sql`
rebuilds `env_groups` with a nullable `project_id` (`ON DELETE SET NULL`) and
makes a name unique per project (`IFNULL(project_id, '')`, so two unfiled sets
still cannot share one), staging `env_vars` across the drop as 0007 does.
`save_env_group` takes `project_id` and refuses an unknown project;
`duplicate_env_group` keeps the source's. The page groups sets under project
headings (unfiled last), names a set `project · set` in dialogs and toasts,
and the set dialog has a Project field with **New project…**. Checks: `bun
test` 493 pass, `bun run lint`, `bun run build`, clippy `-D warnings`; the
repository code, 0010 over schema-9 data (every variable kept, no foreign-key
violations) and its replay run in the scratch crate. Two Rust tests added
(per-project uniqueness, migration keeps every variable) for CI.

## Ivory & Clay (design, outside the numbered plan)

Requested after the design canvas: implement it in the app. Tokens carry it:
warm neutrals in both modes, a new Layer 2 `--press` trio that Tailwind's
`primary` now maps to (near-black in light, ivory in dark), `--strip` for the
status bar, a redrawn Clay ramp (default accent; a saved accent is kept) with
a near-black `--accent-on`, warm semantic colours, softer radii, Source Serif
4 (local woff2 + OFL) as the display face. Call sites that used `primary` for
accent text or borders moved to `accent-foreground` / `ring`; bars and meters
to `var(--accent)`. Restyled to the canvas: top bar (serif wordmark, dot mark,
pill capture and Save), search field, filter chips (white pills, pressed
near-black), serif day headings, cards (14px, clay ring and halo on the card
the reading panel shows), reading panel, status strip, Quick Paste, page
headings in Settings and Search, and pill buttons app-wide. Two spec values
moved to clear their floor, tabulated in `docs/theming.md`.

Checks: `bun test` 493 pass, `bun run lint`, `bun run build`; clippy for the
default-accent change. Production build screenshotted with a stubbed IPC in
light and dark - desk, Env, Settings at 1280px, Env and desk at 760/560px,
Quick Paste - with no horizontal scroll, all three faces loaded, and no page
errors.

## Logo and backup status (outside the numbered plan)

Requested together on 2026-10-16: one logo in every place, made nicer and
tinted by the colour theme; Settings › Backup showing its real status with
notifications; and `enhancement-plan.md` removed.

- Logo: `src-tauri/icons/icon.svg` is the new master (replaces
  `icon-master.png`); the whole bundle set was regenerated from it with
  `bun run tauri icon src-tauri/icons/icon.svg` (Android/iOS output not
  kept), and `public/favicon.png` (64px) and `site/icon.png` (144px) were
  rendered from the same artwork. In the app, `src/components/BrandMark.tsx`
  draws the same geometry from `--logo-*` tokens: each accent sets a gradient
  pair in `tokens.css`, dark mode sets none, and the default accent's pair is
  the icon's. Used in the top bar, Quick Paste, onboarding and the update
  dialog. OS icons
  cannot follow the accent - they are fixed at build time.
- Merged with Ivory & Clay (#161), which made Clay the default accent while
  this was in progress: the icon was redrawn in Clay (it had been Indigo,
  the old default), the `:root` logo fallback moved to Clay, and the
  header's "S" with its brand dot gave way to the mark, keeping Ivory &
  Clay's wordmark type.
- Backup: the status pill was green with a date whenever a run had happened,
  failed or not, and a failed "Back up now" never re-read the recorded
  result. Picking S3/R2 sent an incomplete object that Rust's
  `validate_backup` rejects, so every field failed until all were filled and
  the form showed a provider that was never saved. `BackupPanel` now keeps a
  draft cloud destination until `missingCloudFields` (mirrors
  `validate_backup`) is empty, shows a status card from `last_run_at` and
  `last_result`, applies a run as soon as it returns and only lets a re-read
  move it forward, re-reads on window focus for scheduled runs, gives each
  action its own progress state, raises a toast per outcome, and confirms
  restores with an in-app dialog. No Rust changed.
- Known gap, not changed: a failed *scheduled* backup still records
  `last_run_at`, so `backup_is_due` waits a full interval before retrying.
  The status card says when the next run is due, so this is visible.
  **Fixed 2026-10-22** (`7ae4480`): a failed run is retried within the hour.

Checks: `bun test` (499 pass after the merge), `bun run lint`, `bun run
build`, and screenshots of the production build with a stubbed IPC: backup
status ok, failed, running, never, and a half-filled R2 destination; the
header mark in all six accents in light and dark; Quick Paste and Settings on
Ivory & Clay in both modes. The favicon and site icon were rendered once
clipped (headless Chromium's viewport is shorter than `--window-size`) and
re-rendered whole before this was committed.

Versioned as 0.1.26 (`bun run version 0.1.26`); `bun install
--frozen-lockfile` and `cargo metadata --locked` are clean on it. Released
as v0.1.26 on 2026-10-16 (the Release workflow is a manual dispatch).

## Maintenance round (2026-10-22, outside the numbered plan)

Requested as: check for new issues, fix them, and plan new features. The
check started from CI, which had been red on `main` and `dev` since
2026-10-19, and went on to an audit of the code changed since 0.1.24 and of
both dependency trees. Each fix is its own commit, each with a test that fails
without it where the fix is code.

| Fix | Commit |
| --- | --- |
| `react` 19.3.1 to match `react-dom`: every frontend test failed at import, and the built app rendered an empty window (React error #527) | `a47004c` |
| Dependabot updates `react` and `react-dom` in one pull request | `5fcdba9` |
| `source-map-js` 1.2.2 (GHSA-68fv-2mgg-jv7q; build tooling only) | `b16a72a` |
| One copy of the update preferences per launch: the status strip's stale copy turned notifications back on after they were turned off in Settings, and every Settings visit ran another "On launch" check | `e551750` |
| Backup runs record their outcome without undoing settings changed meanwhile; Settings cannot overwrite a newer run record; a failed scheduled run is retried within the hour | `7ae4480` |
| CLI README lists the desktop commands | `c7b0a20` |
| `rustls`, `rustls-webpki`, `webpki-root-certs`, `quinn-proto` and the yanked `chacha20` patched (cargo audit 15 → 6) | `5f0d550` |
| Release notes show each item whole (wrapped CHANGELOG lines were dropped), render bold and code, and their labels clear 4.5:1 | `a17fbf8` |

How #168 got in: Dependabot files `react` and `react-dom` separately and stops
at five open pull requests per ecosystem. On 2026-10-18 it opened the
`react-dom` bump as the fifth, so the `react` bump was never filed; #168's own
CI was red and it was merged the next day in a batch of ten. The grouping
stops the split. Only the required status checks under Maintainer actions
would have stopped the merge. No published release carried the break: v0.1.26
was published on 2026-10-16, before the batch. The user-visible fixes are
under Unreleased in CHANGELOG.md.

Verification: `bun test` 505 pass (499 before; also under `--randomize`),
`bun run lint`, `bun run build`, `bun audit` clean; `cargo test` 223 pass
(220 before), `cargo clippy --all-targets -D warnings`, `cargo metadata
--locked`. Rust ran here for the first time in this project's sandboxes (see
the Environment note). The production build was loaded in Chromium with a
stubbed IPC: before the React fix an empty root and error #527; after it the
desk, Settings › Backup with a failed daily run, the update flow (one check at
launch, none more on opening Settings, the launch check's update shown there)
and the update dialog with the real 0.1.26 notes, with no page errors.

Review round on #173: CodeRabbit's four findings were each reproduced by a
test that failed first, then fixed: `snipdock tag` replaced an item's tags
instead of adding one (`e7ae9a3`); a settings save and a backup's run record
running together lost one of the two, so both now take SQLite's write lock
before reading (`0ce82a7`; the new test lost the record on 3 of 3 runs
before); update-preference saves could land out of order, and a read pending
across a relaunch reached the new launch (`1f94b14`). After them: `bun test`
507 pass, `cargo test` 225 pass. Its docstring-coverage warning (60% of
touched functions, against CodeRabbit's default 80%) was not acted on: the
codebase comments what needs explaining rather than every function.

The remaining six `cargo audit` findings have nothing to update to here:
`quick-xml` 0.39 (two; build time only, inside the `wayland-scanner`
proc-macro), `rsa` (in the lockfile, compiled for no target, no fix
published) and `zip` 4.6 (three; `tauri-plugin-updater` pins it and only
extracts signature-checked update archives).

Logged, not fixed:

- 56 `act(...)` warnings in `bun test`, the same count before this round.
- `validate_backup` (`storage/settings.rs`) can never return "a backup needs
  at least one destination": that check sits after an early return for
  `CloudProvider::None`. Enforcing it would refuse turning local backups off
  before a bucket is set up, so it wants a decision, not a one-line fix.
- With checks set to Daily or Weekly, a session that stays open checks for
  updates at most once: the launch flag never resets.
- `openspec/changes/` and `openspec/changes/archive/` both hold the two
  2026-09-01 changes, with different content; the active copies still list 5
  and 67 unchecked tasks.
- The main bundle is 620 kB, past Vite's 500 kB warning; Settings and Env are
  candidates for lazy loading.

## Feature plan (2026-10-22)

Written against `dev` after the maintenance round. Each spec is a proposal:
confirm or amend it in review, including the "Decide" lines, before `/task N`
picks it up.

### Recommended order

1. **21 — Snippet library.** The top bar has said "Snippets · Soon" since the
   Paper Desk redesign, and the backend is most of the way there.
2. **32 — Snippet templates.** What makes a snippet more than saved text.
3. **23 — Command palette, remaining scope.** Small, and puts the library on
   Ctrl/Cmd+K.
4. **33 — Env sets in the terminal.** Joins the two newest surfaces, Env and
   the CLI.
5. **3, then 34 — Secrets out of plaintext.** Cloud keys, then secret
   variables, into the OS keychain. The Env page made this debt bigger. Needs
   the `keyring` dependency approved.
6. Then, as summarised above: 24 (clipboard stack) → 25 (quick slots), 11 + 26
   (macOS and Linux parity), 27 (file paths and rich text), 28 (encryption at
   rest), 29 (sync: finish or remove).

### Task 21: Snippet library

- **Implements:** F1; closes B26. **UI:** yes.
- **Depends:** 16 (done). The retired plan also listed 5 (preview column); the
  page can use the Desk's client-side previews (`normalizePreview.ts`), so
  that dependency can go. Decide in review.
- **Already there:** `ItemKind::{Snippet, Command, Template, Note}` are stored
  and filterable (`SearchQuery.kinds`); `Repository::save_item` takes a kind,
  title, notes, tags and project, and `duplicate_item` exists; retention and
  Clear history touch only `kind = 'clipboard'`, so nothing prunes a snippet;
  `tests/snippets.rs` covers the repository. Missing: no command creates
  anything but a capture (`save_manual_item` hard-codes `ItemKind::Clipboard`,
  and neither `save_item` nor `duplicate_item` is registered), and nothing
  lists the other kinds.
- **Files:** `src-tauri/src/commands/{library,clipboard,mod}.rs`,
  `src/api/{commands,types}.ts`, `src/app/App.tsx`,
  `src/app/components/AppHeader.tsx`, new `src/features/snippets/`,
  `src/features/clipboard/{SaveItemDialog,ItemInspector,QuickPastePage}.tsx`.
- **Work:**
  - `save_item` (create and edit, any kind but `clipboard`) and
    `duplicate_item` commands over the existing repository methods.
  - A `#snippets` page: list, search, edit (title, content, notes, tags,
    project), delete with Undo, from the Desk's and Env page's parts. The
    inert nav item becomes a link.
  - Save item dialog: a kind choice — Capture, Snippet, Command, Note.
  - Reading panel: **Save as snippet** copies the capture into a new snippet
    with a title. The capture stays in history under its own retention.
  - Quick Paste: a Snippets filter, so a snippet pastes system-wide.
- **Checks:** Rust tests for the commands (create, edit, a promoted capture
  still in history, retention sparing snippets); UI tests for create,
  promote, edit, delete and Undo, and the Quick Paste filter; the gate;
  screenshots in light and dark at 1180, 760 and 560px.
- **Decide:** promote by copy (above) or by changing the capture's kind in
  place; whether `template` stays a kind or becomes a property of any snippet
  (see 32).

### Task 32: Snippet templates

- **Implements:** the `{{placeholder}}` half of F1. **Depends:** 21.
  **UI:** yes.
- **Already there:** `CopyMode::RenderedTemplate` is declared in
  `models/library.rs`; `copy_item` refuses it ("clipboard history supports raw
  copy only").
- **Files:** `src-tauri/src/features/formatting.rs`,
  `src-tauri/src/commands/clipboard.rs`, `src/features/clipboard/QuickPastePage.tsx`,
  the Snippets page, a new fill-in dialog.
- **Work:** `{{name}}` placeholders in a snippet; `{{date}}`, `{{time}}` and
  `{{clipboard}}` filled in by Rust; any other name asked for once in a small
  dialog before copy or direct paste (Tab between fields, Enter pastes,
  Escape cancels); `\{{` writes a literal brace pair. Rendering lives in Rust
  beside the transforms, so the CLI's `paste` renders too.
- **Checks:** Rust unit tests for parsing, escapes, built-ins and a missing
  value; UI tests for the dialog from Quick Paste and from the Snippets page;
  the gate.
- **Decide:** the date and time format (ISO or the system locale); whether
  `{{clipboard}}` may pull in a private capture.

### Task 23: Command palette — remaining scope

Ctrl/Cmd+K shipped in `84e9280` with: pause or resume capture, Save an item,
theme, Settings, Clear history, recent captures, Pinned, the top source, Env
and Settings › Privacy. F6 also asked for:

- **Saved searches:** one entry per smart folder, applying its query.
- **Transforms on the capture the reading panel shows** ("Copy as JSON
  pretty"…), through the same `copy_item(id, raw, transform)` call the panel's
  "Copy it as" chips make.
- **Env sets:** open one, or copy it as `.env`.
- **Snippets,** once 21 lands: paste or open one.
- **Files:** `src/app/components/CommandPalette.tsx` and its test.
- **Checks:** a test per new group; the gate.

### Task 33: Env sets in the terminal

- **Depends:** nothing outstanding. **UI:** no.
- **Goal:** `eval "$(snipdock env api-staging --format shell)"` loads a set
  into a shell, and `snipdock env api-staging > .env` writes one out.
  `snipdock env` alone lists the sets.
- **Files:** `src-tauri/src/cli/server.rs`, `packages/snipdock-cli/src/index.ts`
  and its test, `packages/snipdock-cli/README.md`, `docs/env-vars.md`.
- **Work:** a `/env` route behind the same token as `/search`, finding a set
  by name (`project · set` when two projects share one) and returning its
  variables. The CLI formats them with `formatEnv` from `src/lib/envFormat.ts`
  — a pure module with a type-only import, which `bun build` bundles in — so
  the app's Copy as and the CLI cannot disagree about quoting. Formats:
  `dotenv` (default), `shell`, `powershell`, `json`, `yaml`.
- **Checks:** Rust route tests (token, unknown set, ambiguous name); CLI tests
  per format; the gate.
- **Decide:** whether secret values print by default (the point of `eval`) or
  only with `--include-secrets`.

### Task 34: Env secrets in the OS keychain

- **Depends:** 3, which adds `keyring` (approve the dependency there).
  **UI:** small.
- **Goal:** a variable marked secret is no longer plaintext in
  `snipdock.sqlite`; its value lives in the OS keychain and the row keeps a
  reference. The page is honest about today's state — values are masked, "Not
  encryption."
- **Files:** `src-tauri/src/storage/env_vars.rs`, a `0011_*` migration,
  `src-tauri/src/commands/env_vars.rs`, `src-tauri/src/features/transfer.rs`,
  `docs/env-vars.md`, `docs/privacy.md`.
- **Work:** move a value when it is marked or unmarked secret and on import;
  read through on copy, reveal and export; Undo and duplicate carry the
  secret. A sealed export or cloud backup (`transfer.rs`) includes secret
  values under its passphrase; a plain local snapshot cannot, and restoring
  one names the secrets that have to be entered again. The keychain sits
  behind a trait, so tests use an in-memory store.
- **Checks:** Rust tests on the in-memory store (round trip, unmark, cascade
  on set delete, backup with and without secrets); one manual check against
  each platform's real keychain; the gate.
- **Decide:** what a machine with no keychain service (some Linux setups) gets
  — no secret marking, or today's masking with a warning.

## Environment note

**Update, 2026-10-22: Rust runs in the cloud sandbox.** That session could
install CI's Linux packages (`sudo apt-get install -y libwebkit2gtk-4.1-dev
libgtk-3-dev librsvg2-dev patchelf`), after which `cargo test --locked` linked
and ran all 223 tests on the stable toolchain (1.97), with no stub `.pc` files.
The install is per session and not kept, so try it before falling back to the
typecheck-only approach below, which stays the record of what earlier
sandboxes could do.

**Rust typechecks and lints here; it does not execute.**

Two obstacles, one of them the repository's:

- `Cargo.lock` pins `sysinfo@0.39.6`, which needs rustc 1.95 (B27). Cleared
  with `rustup toolchain install 1.95.0`.
- `gdk-sys` and the other gtk-rs `-sys` crates need `libgtk-3-dev` and
  `libwebkit2gtk-4.1-dev`, which this sandbox cannot install. Their build
  scripts only read pkg-config metadata, though, and `cargo check`/`clippy`
  never link — so stub `.pc` files satisfy them. `cargo clippy --all-targets
  -- -D warnings`, exactly what CI runs, then passes.

So Rust changes here are **typechecked and linted, not executed**: `cargo test`
needs the real shared libraries to link against. That catches compile errors,
type errors and every clippy lint, which is most of what a review would; it
does not catch a logic error a test would have caught. Anything whose
correctness rests on runtime behaviour — a schema migration, a keyring
round-trip, a native platform lookup — still wants CI or a developer machine,
and each task's row below says which kind of verification it got.

The stub setup is in this session's scratchpad, not the repo: it is a
workaround for a sandbox, not project configuration.

**This gap has already bitten once.** Task 12 added a second file per stored
image, and two existing tests counted files in that directory. Clippy was clean
and CI's `cargo test` failed on all three platforms. Lesson recorded rather than
just noted: when a change alters what gets *written*, grep the suite for tests
that count or enumerate, because no typecheck sees an assertion. Pure logic can
also be lifted into a standalone `rustc` harness and actually run — the image
downscale and sweep arithmetic are verified that way now.

## Maintainer actions (not code)

- **Task 1 follow-up:** mark `Frontend` and `Rust (…)` as required status checks
  in the repository's branch-protection rules for `main` and `dev`. Task 1 makes
  the checks run on every pull request; only a repository setting can make them
  blocking. **Still open, and it has now cost a release-blocking break:**
  Dependabot #168 was merged with its CI red, which left `main` building an
  empty window until 2026-10-22 (see the maintenance round).
