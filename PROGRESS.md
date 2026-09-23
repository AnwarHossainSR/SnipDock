# SnipDock Progress

Task state for `enhancement-plan.md`. One task per `/task N`, per `AGENTS.md`.

States: `[ ]` pending · `[~]` legacy unfinished · `[x]` completed and committed locally

**12 of 31 complete.**

## Active plan

`enhancement-plan.md` — audit of `dev` at `0db656b` (v0.1.21): 26 bugs, 10
feature proposals, and a UI polish / demo imagery programme.

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
| 21 | Snippet library | [ ] | | F1; closes B26 |
| 22 | First-run onboarding | [x] | _pending_ | F7; 2026-09-22. Checks: `bun test` 366 pass, `bun run lint`, `bun run build`, clippy `-D warnings`. Not seen on a display — layout unverified visually. Files: `src/app/components/Onboarding.tsx`, `src/app/App.tsx`, `src-tauri/src/models/settings.rs`, `src/api/types.ts` + test |
| 23 | Command palette | [ ] | | F6 |
| 24 | Clipboard stack / multi-paste | [ ] | | F5 |
| 25 | Quick-slot paste | [ ] | | F10 |
| 26 | macOS and Linux parity — source app and direct paste | [ ] | | F4 |
| 27 | File-path and rich-text capture | [ ] | | F9 |
| 28 | Encryption at rest with auto-lock | [ ] | | F3 |
| 29 | Finish sync, or remove it | [ ] | | F8 |

## Notes

- Each task finishes with code, `PROGRESS.md` updated, and one local commit.
  Pushes and PRs happen only when the user asks, per `AGENTS.md`.
- Full verification gate: `bun test`, `bun run lint`, `bun run build`,
  `cargo test --manifest-path src-tauri/Cargo.toml`. Each task's own `Checks`
  section says which of these it must run.
- Tasks 23–29 carry a summary spec only; each is written out in full when its
  phase is reached, so it reflects the codebase as it will be by then.

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

## Environment note

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
  blocking.
