# SnipDock Enhancement Plan

Numbered tasks are implemented one at a time via `/task N`. Each task corresponds to a chunk in `openspec/changes/2026-09-01-power-features-and-quick-paste-transforms/tasks.md` and updates `PROGRESS.md` when finished.

## Active change

`openspec/changes/2026-09-01-power-features-and-quick-paste-transforms/` — high-value core power features and Quick Paste transforms.

### Capability index

| # | Capability | Tasks |
| - | ---------- | ----- |
| 1 | `source-app` — capture-time recording of the foreground executable per item + UI surfacing | 1, 2, 3 |
| 2 | `quick-paste-transforms` — built-in transform pipeline run at paste time | 4, 5 |
| 3 | `regex-search` — literal/regex mode toggle in the clipboard search box | 6, 7 |
| 4 | `per-app-ignore` — Settings editor for the existing `ignored_apps` list | 8 |
| 5 | `custom-shortcuts` — rebind every shortcut documented in `docs/keyboard-shortcuts.md` | 9, 10 |
| 6 | `cli-expansion` — new CLI subcommands hitting a localhost endpoint exposed by the desktop app | 11, 12 |
| 7 | `backup-filenames` — human-readable `<YYYY-MM-DD_HH-MM>_snipdock_local.sql` / `..._r2.sql` filenames while keeping encryption | 14 |

Modified existing capabilities: `clipboard-layout` (row metadata gains source-app segment), `clipboard-history` (live-capture scenario for source-app filter), `app-shell-navigation` (Sources section).

### Task list

Run via `/task N`. Each task is a single PR.

1. Source-app capture data + capture path (`tasks.md` §1)
2. Source-app frontend types and store (`tasks.md` §2)
3. Source-app UI surfacing (Details, row metadata, sidebar Sources, filter) (`tasks.md` §3)
4. Quick Paste transforms — Rust pipeline (`tasks.md` §4)
5. Quick Paste transforms — frontend UI (`tasks.md` §5)
6. Regex search — Rust path (`tasks.md` §6)
7. Regex search — frontend UI (`tasks.md` §7)
8. Per-app ignore — Settings editor (`tasks.md` §8)
9. Custom shortcuts — Settings panel (`tasks.md` §9)
10. Custom shortcuts — handler rebind at runtime (`tasks.md` §10)
11. CLI expansion — desktop HTTP endpoint (`tasks.md` §11)
12. CLI expansion — CLI subcommands (`tasks.md` §12)
13. Verification gate (`tasks.md` §13)
14. Human-readable backup filenames — `<YYYY-MM-DD_HH-MM>_snipdock_local.sql` / `..._r2.sql`, local-time stamp, encryption and retention unchanged (`openspec/changes/2026-09-01-human-readable-backup-filenames/tasks.md` §14)

## Archived changes

- `openspec/changes/archive/2026-08-07-improve-clipboard-and-settings-ux/` — preview normalization, live-capture stability, honest counts, deferred-commit Settings, visible save feedback, form-control styling. Shipped.
- `openspec/changes/archive/2026-08-07-redesign-clipboard-settings-ui/` — 820px column cap, right rails, populated sidebar, colour-coded type tags, Settings section rail, custom form controls. Shipped.

## Conventions

- One task per `/task N` invocation. `/task 1-3` is a single batch PR; `/task 1,3,5` is not supported — use a contiguous range.
- Each task finishes with: code, `PROGRESS.md` updated, one local commit.
- Use Bun for frontend installs, scripts, and tooling; never use npm, yarn, pnpm, or direct Node.js commands.
- UI must stay clean, compact, professional, keyboard accessible, and consistent with `src/styles/tokens.css`.