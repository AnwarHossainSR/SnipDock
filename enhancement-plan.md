# SnipDock Audit and Enhancement Plan

Audit of `dev` at `0db656b`, version 0.1.21. Three parts: bugs found, features
worth building, and a UI/demo-imagery programme. The numbered task list at the
end is the execution order and is what `/task N` runs against.

## How the audit was run

| Check | Result |
| ----- | ------ |
| `bun install --frozen-lockfile` | clean |
| `bun test` | 344 pass, 0 fail, 988 assertions |
| `bun run lint` (`tsc --noEmit`) | clean |
| `cargo test --manifest-path src-tauri/Cargo.toml --no-run` | compiles clean |
| Manual read | `src/` (~9.5k lines), `src-tauri/src/` (~17k lines), workflows, `site/`, `docs/` |

Every finding below is a read of the source, not a test failure. The suite is
green and the types check; the bugs live in paths the suite does not cover.

---

## Part 1 — Bugs

Severity is user impact, not effort. `file:line` references are against
`0db656b`.

### Summary

| # | Severity | Area | Finding |
| - | -------- | ---- | ------- |
| B1 | High | Navigation | Settings is unreachable while the search box has text |
| B2 | High | Search | A regex search loads the entire history into memory |
| B3 | High | Security | Cloud keys and the backup passphrase are stored in plaintext, handed to the webview, and copied into every backup |
| B4 | High | Scale | No cap on captured content; every page ships full content over IPC |
| B5 | High | Process | CI never runs on `push` or `pull_request` |
| B6 | Medium | State | The tray's Pause capture does not reach the Clipboard page |
| B7 | Medium | UX | Filtered, folder, and source-narrowed views show the first-run empty state |
| B8 | Medium | UX | "Open source" in search results does nothing |
| B9 | Medium | Battery | The clipboard is fully read twice a second on macOS and Linux |
| B10 | Medium | CLI | `snipdock paste` uses the paste format that was set at launch, forever |
| B11 | Medium | Memory | No thumbnails — full-resolution PNGs are decoded for 112px rows |
| B12 | Medium | Shortcuts | A failed rebind leaves Quick Paste with no accelerator at all |
| B13 | Medium | Layout | The default window is 960px; the inspector rail needs 1024px |
| B14 | Medium | Packaging | macOS and Linux bundles ship without icons or an updater manifest |
| B15 | Low | Dead code | Two settings are persisted, typed, and never read |
| B16 | Low | Honesty | The capability matrix advertises features that do not exist |
| B17 | Low | Copy | "Windows" is hardcoded in a cross-platform UI |
| B18 | Low | Copy | Quick Paste advertises the default binding, not the user's |
| B19 | Low | State | Pin/favorite from search results does not reach the history |
| B20 | Low | UX | Search shows "Searching…" and the previous results at the same time |
| B21 | Low | UX | Filter-pill counts ignore the open smart folder |
| B22 | Low | Search | Literal search is a full-table scan and is ASCII-only case-insensitive |
| B23 | Low | Docs | The shortcuts doc still says the accelerators are fixed |
| B24 | Low | Dead code | The whole sync module is unreachable |
| B25 | Low | A11y | No `forced-colors` or `prefers-contrast` support |
| B26 | Low | Dead UI | Group → Kind can only ever produce one group |

### High

**B1 — Settings is unreachable while the search box has text.**
`src/app/App.tsx:259-263` renders `SearchResultsPage` whenever `query.trim()`
is non-empty, ignoring `page` entirely. The sidebar's Settings link
(`src/app/components/AppSidebar.tsx:23`) sets `#settings`, `page` flips to
`"settings"`, and the search results stay on screen. The user has to notice
that clearing an unrelated search box is the prerequisite for opening Settings.
The pinned-item path already knows this and clears the query
(`src/app/App.tsx:125-133`); navigation does not.
*Fix:* route on `page` first. A query narrows the Clipboard destination; it is
not a destination of its own. Either clear the query on a destination change,
or scope the results view to the Clipboard page.

**B2 — A regex search loads the entire history into memory.**
`src-tauri/src/storage/items.rs:901-923`. When a pattern is present the `LIMIT`
and `OFFSET` are deliberately skipped so the pattern can be applied before the
page is cut — correct in intent, unbounded in practice. `SearchResultsPage`
sends `text: null` in regex mode (`src/features/search/SearchResultsPage.tsx:122`),
so there is no FTS pre-filter either: the candidate set is *every* undeleted
row, each with its full content, deserialized into `Vec<LibraryItem>` and
scanned. At the app's own `max_items` ceiling of 10,000 captures this is the
whole database in RAM per keystroke-debounced search.
*Fix:* stream the candidate set (`fetch` rather than `fetch_all`), stop at
`offset + limit` matches, and cap the scan with an explicit ceiling that the
UI reports when hit ("first 5,000 captures searched"). Add an
`Instant`-based deadline so a pattern over a large history cannot hang the
command.

**B3 — Cloud keys and the backup passphrase are plaintext, exported to the
webview, and copied into every backup.**
Three compounding problems around `CloudBackupSettings`
(`src-tauri/src/models/settings.rs:102-116`):

1. `access_key_id`, `secret_access_key`, and `passphrase` are fields on
   `Settings`, which `save_settings` serializes to a single JSON string in the
   `app_settings` table (`src-tauri/src/storage/settings.rs:17-41`). No
   keychain, no encryption, no OS credential store.
2. `get_settings` returns the whole `Settings` struct to the frontend, so the
   S3/R2 secret key and the backup passphrase are readable from the webview
   and from devtools. `src/api/types.ts:295` mirrors them into the TS type.
3. A backup is a whole-database snapshot (`src-tauri/src/features/backup.rs:179-185`),
   so `app_settings` — and therefore the bucket credentials — rides along. The
   local copy is written **unencrypted** by design (`features/backup.rs:7-10`),
   and the cloud copy is sealed with the very passphrase it contains
   (`features/backup.rs:300`). Anyone who learns the passphrase gets the bucket
   keys; anyone who reads a local backup file gets both, plus the entire
   clipboard history.

*Fix:* move the three secrets out of `Settings` into the OS credential store
(`keyring` crate: Credential Manager / Keychain / Secret Service), keep only a
`has_credentials: bool` in the settings blob, and have `get_settings` never
return a secret. Exclude `app_settings` from the snapshot, or redact the cloud
block before sealing. Say plainly in `docs/backup-restore.md` that a local
backup is an unencrypted copy of everything.

**B4 — No cap on captured content; every page ships full content over IPC.**
`ClipboardCapture::capture` (`src-tauri/src/features/clipboard/capture.rs:249-290`)
stores whatever the clipboard held, at any size. `ITEM_COLUMNS`
(`src-tauri/src/storage/items.rs:10-13`) selects the full `content` for every
row, and the default page is 100 rows
(`src/stores/clipboardStore.ts:31-33`). Copy a 40MB SQL dump and every
subsequent history load serializes it to JSON, pushes it across the Tauri IPC
bridge, and parks it in the webview — to render a two-line preview
(`src/features/clipboard/normalizePreview.ts`). The regex path in B2 multiplies
the same problem.
*Fix:* add a `preview` column populated at capture (first ~2KB, normalized),
select `preview` in list queries and full `content` only in `get_item`, and add
a `max_capture_bytes` setting that stores a truncated body with a "truncated"
flag above the ceiling.

**B5 — CI never runs on `push` or `pull_request`.**
`.github/workflows/ci.yml:3-4` triggers on `issue_comment` alone, gated on a
comment starting with `/test`. Nothing runs unless a maintainer comments. The
recent history is mostly Dependabot merges — `react`, `vite`, `tailwind-merge`,
`uuid`, `reqwest` — every one of them merged without the suite, the typecheck,
the build, or `cargo clippy` having run. The checks also cannot be made
required in branch protection, because they do not exist on a PR until someone
comments.
*Fix:* add `pull_request` and `push` triggers, keep the `/test` comment path as
a manual re-run, and use `pull_request_target`-free, `persist-credentials:
false` checkouts as the workflow already does. Mark frontend and rust as
required checks.

### Medium

**B6 — The tray's Pause capture does not reach the Clipboard page.**
`src/features/clipboard/ClipboardPage.tsx:341` seeds local state with
`useState(trackingPaused)` and never syncs it when the prop changes.
`AppSidebar` does exactly that sync (`src/app/components/AppSidebar.tsx:129-131`),
so after toggling capture from the tray the sidebar reads "paused" while the
page's status dot and Pause/Resume button still read "active" until a refresh.
*Fix:* the same `useEffect` sync the sidebar already has, or lift `paused` to
the one owner in `App`.

**B7 — Filtered, folder, and source-narrowed views show the first-run empty
state.** `src/features/clipboard/ClipboardPage.tsx:1140-1143` keys the empty
state on `filter === "all"` alone. Open a smart folder that matches nothing, or
narrow to a source app with no captures, and the panel says "Your clipboard is
quiet — Copy text and it will appear here", which is false and offers no way
back. Both cases leave `filter` at `"all"`.
*Fix:* branch on whether *any* narrowing is active (`filter !== "all" ||
savedSearch || sourceApps`), and give the empty state a control that clears the
specific narrowing that produced it.

**B8 — "Open source" in search results does nothing.**
`src/features/search/SearchResultsPage.tsx:276-283` renders an anchor to
`#clipboard`. Because B1 keeps the results mounted while the query is set,
changing the hash changes nothing visible. The control looks live, is
keyboard-reachable, and is inert.
*Fix:* make it call `requestFocusItem(item.id)` — the store already has the
mechanism, and `App` already clears the query on a focus request
(`src/app/App.tsx:125-133`). That turns it into the reveal-in-history action it
claims to be.

**B9 — The clipboard is fully read twice a second on macOS and Linux.**
`src-tauri/src/app/mod.rs:141` polls at 500ms. The cheap path that avoids the
read is `change_token`, and
`src-tauri/src/platform/native.rs:132-135` returns `None` on everything that is
not Windows. So on macOS and Linux every tick calls `read_image()`, which copies
the full RGBA buffer, then memcmps it against the previous one
(`src-tauri/src/features/clipboard/monitor.rs:160-172`). A 4K screenshot sitting
on the clipboard is ~33MB copied and compared, twice a second, forever.
*Fix:* implement the token on the other two platforms — macOS has
`NSPasteboard.general.changeCount`, X11 has `XFixesSelectionNotify`, Wayland
has `wlr-data-control`. Until then, hash-compare a cheap prefix before copying,
and back the interval off when the window is hidden.

**B10 — `snipdock paste` uses the launch-time paste format forever.**
`src-tauri/src/app/mod.rs:177-183` reads `settings.paste_format` once at startup
and moves the value into `ServiceContext`
(`src-tauri/src/cli/server.rs:80-85`), which nothing ever updates. Change the
paste format in Settings and the desktop app honours it while the CLI keeps
using the old one until the app is restarted.
*Fix:* hold the `Repository` (it is already there) and read the format per
request, or share an `Arc<RwLock<PasteFormat>>` that `apply_after_save` updates.

**B11 — No thumbnails.** `src-tauri/src/features/images.rs` stores one
full-resolution PNG per capture and nothing else. `ItemThumbnail`
(`src/components/ItemThumbnail.tsx:31-41`) points an `<img>` at it with
`max-h-28`, so the webview decodes the full image to draw a 112px row. A page of
100 screenshots decodes hundreds of megabytes.
*Fix:* write a downscaled `<hash>.thumb.png` (long edge 256px) beside the
original at capture time, point the list at it, and keep the full file for the
inspector and for copy. Backfill lazily; fall back to the original when the
derivative is missing.

**B12 — A failed rebind leaves Quick Paste with no accelerator at all.**
`src-tauri/src/platform/shortcuts.rs:88-105` calls `unregister_all()` and *then*
registers the new binding. If registration fails — another app holds the
combination, which is the single most likely reason to be here — the previous,
working accelerator is already gone. The user gets an error and a Quick Paste
that no longer opens, until they save settings again with something that works.
*Fix:* register the new accelerator first, unregister the old one only on
success, and roll back to the previous binding on failure.

**B13 — The default window is narrower than the two-column layout needs.**
`src-tauri/tauri.conf.json:23` opens the main window at 960px.
`src/features/clipboard/ClipboardPage.tsx:1123` engages the inspector rail at
`min-[64rem]` — 1024px. Every fresh install therefore opens with the inspector
stacked under the list, and nobody sees the intended layout until they resize.
*Fix:* open at 1180×760 (still above the 720 minimum), and lower the rail
breakpoint to 60rem so the two agree with room to spare.

**B14 — macOS and Linux bundles ship without icons or updates.**
`src-tauri/icons/` contains only `icon.ico`, `icon.png`, and `icon-master.png`,
and `bundle.icon` (`src-tauri/tauri.conf.json:12-16`) lists the first two. There
is no `.icns`, and none of the sized PNGs the Linux desktop entry wants — but
the release workflow builds `app,dmg` and `deb,appimage`
(`.github/workflows/release.yml:54-56`). Those builds carry a default icon.
The same matrix sets `uploadUpdaterJson: False` for both, so the updater
manifest covers Windows only while the README promises "signed updates".
*Fix:* run `bun run tauri icon src-tauri/icons/icon-master.png` and commit the
generated set; either publish per-platform updater manifests or say in the
README that auto-update is Windows-only today.

### Low

**B15 — Two settings are persisted, typed, and never read.**
`encryption_enabled` (`src-tauri/src/models/settings.rs:25`) and
`auto_clear_sensitive_minutes` (`:26`) are in the struct, in the TS types
(`src/api/types.ts:295-296`), and in the stored blob. Nothing reads either.
There is no scheduler behind the second one — `clear_sensitive_data` is a
manual command that `SensitiveSweep.tsx:31` calls with its own local value — so
"auto clear sensitive" is a name for a button.
*Fix:* delete `encryption_enabled` until F6 lands, and either wire
`auto_clear_sensitive_minutes` to a background sweep or drop it.

**B16 — The capability matrix advertises features that do not exist.**
`src-tauri/src/models/platform.rs:59-70` reports `sync: true` — there are no
sync commands registered at all (`src-tauri/src/commands/mod.rs:96-152`) — and
`direct_paste: true` on every platform, when the README says direct paste is
Windows-only. The frontend never reads `direct_paste` from the matrix anyway; it
calls the separate `direct_paste_supported` command. The matrix is documented as
"the single statement of what this build supports" and is neither single nor
accurate.
*Fix:* drop `sync` until F-sync exists, gate `direct_paste` on
`cfg!(target_os = "windows")`, and add an `os` field so the frontend can stop
guessing (see B17).

**B17 — "Windows" is hardcoded in a cross-platform UI.**
`src/features/settings/SettingsPage.tsx:90` ("Follow the Windows setting"),
`:574` ("follow Windows"), `:659` and `:662` ("Start with Windows"). The app
ships for macOS and Linux. The frontend cannot currently do better, because
`PlatformCapabilities` exposes `platform: "desktop"` and no OS.
*Fix:* add `os: "windows" | "macos" | "linux"` to the matrix and select the
noun from it.

**B18 — Quick Paste advertises the default binding, not the user's.**
`src/features/clipboard/QuickPastePage.tsx:83-89` reads `entry.defaultBinding`
from the parsed doc. After a rebind the empty state still tells the user to
press the combination that no longer works — the exact failure the function's
own comment says it exists to prevent.
*Fix:* read the effective binding from `settings.custom_shortcuts`, falling
back to the default.

**B19 — Pin/favorite from search results does not reach the history.**
`src/features/search/SearchResultsPage.tsx:160-172` writes through the command
and then patches its own local list. The clipboard store is untouched, so
clearing the search shows the old flag until the next fetch.
*Fix:* call `useClipboardStore.getState().replaceItem(updated)` with the item
the command returns.

**B20 — "Searching…" and the previous results render together.**
`src/features/search/SearchResultsPage.tsx:237` shows the spinner block on
`status === "loading"`, and `:240` shows the list on `items.length > 0`. A
refetch keeps the items, so both are on screen at once.
*Fix:* dim the list while loading, as the Clipboard pager already does
(`ClipboardPage.tsx` `paging` opacity), and drop the separate spinner block
when there are rows to keep.

**B21 — Filter-pill counts ignore the open smart folder.**
`filterCountQuery` (`src/stores/clipboardStore.ts:113-118`) passes `undefined`
for the saved search, so while a folder is open the pills report counts for the
unfiltered history next to a list that is showing the folder.
*Fix:* hide the pills while a folder is open, or count through the folder's
predicate.

**B22 — Literal search is a full-table scan, and ASCII-only.**
`src-tauri/src/storage/items.rs:1081-1091` falls back to
`instr(lower(...)) > 0` over four columns whenever the query contains any
punctuation — no index, every row, including the full `content` blob. SQLite's
`lower()` only folds ASCII, so a query in any language with non-ASCII case is
silently case-sensitive.
*Fix:* keep FTS5 as the pre-filter and apply the literal test only to the
candidates; register a Unicode-aware collation or normalize a `content_folded`
column at write time.

**B23 — The shortcuts doc contradicts the shipped feature.**
`docs/keyboard-shortcuts.md` ends with "These accelerators are fixed in the
current release." The rebind panel shipped in 0.1.x. The file is also the parsed
source of truth for `SHORTCUT_SCHEMA` (`src/lib/shortcuts.ts:106`), so it is read
by code as well as by people.

**B24 — The sync module is unreachable.** `src-tauri/src/storage/sync.rs`,
`src-tauri/src/models/sync.rs`, and the `sync_records` table have no callers
outside their own tests and the transfer snapshot list. `crypto.rs` documents
itself as the sealing layer for a feature that is not wired up.
*Fix:* keep it and finish it (F8), or move it out of the build until it is
scheduled. Dead code that looks live is what produced B16.

**B25 — No `forced-colors` or `prefers-contrast` support.**
`src/styles/tokens.css` is careful work — six ramps, two modes, measured
contrast — and `prefers-reduced-motion` is handled in `base.css:212,277`. High
contrast mode and Windows forced-colors are not, so the accent-tinted selection
bands and the `color-mix` highlights disappear there.

**B26 — Group → Kind can only ever produce one group.**
`src/features/clipboard/ClipboardPage.tsx:1094-1099` offers Kind as a grouping,
and `groupItems` groups on `item.kind`
(`src/stores/clipboardStore.ts:320-324`). `ItemKind` has five variants, but
nothing in the UI can create anything but `clipboard` — `SaveItemDialog` has no
kind picker. The control always yields exactly one group, labelled "Clipboard".
This is the visible edge of F3.

---

## Part 2 — Features

Ordered by value to the product, not by effort.

**F1 — Snippet library (finish what the model already has).**
`ItemKind::{Snippet, Command, Template, Note}` exist in the schema, are parsed
and stored, are filterable through `SearchQuery.kinds`, and are groupable in the
UI. Nothing can create one (B26). A clipboard manager that also holds curated,
named, reusable snippets is a materially different product from one that only
holds history, and SnipDock is most of the way there: it already has titles,
notes, tags, projects, categories, smart folders, and a Save item dialog.
*Scope:* a kind picker in `SaveItemDialog`, a "Promote to snippet" action on a
history row, a Snippets destination in the sidebar backed by a `kinds` query,
and `{{placeholder}}` expansion at paste time (the transform pipeline in
`src-tauri/src/features/formatting.rs` is the natural home).

**F2 — Credentials in the OS keychain.** The fix for B3, but also a feature:
it is what lets SnipDock claim a privacy posture that survives someone reading
the data directory. `keyring` covers all three platforms.

**F3 — Encryption at rest.** `encryption_enabled` is already a settings field
(B15) and `crypto.rs` already has a reviewed XChaCha20-Poly1305 + Argon2id
implementation. Sealing item content at rest behind an optional passphrase —
with the key held in memory for the session and released on lock — is the
single biggest privacy differentiator available for the effort. Pair with an
auto-lock timeout.

**F4 — macOS and Linux parity.** Three gaps, all visible to users:
`change_token` (B9), `source_app_detection` — `cfg!(target_os = "windows")` at
`models/platform.rs:66`, which makes the Sources sidebar and the per-app ignore
list dead weight on two of three platforms — and direct paste. macOS has
`NSWorkspace.frontmostApplication` and can synthesize a paste through
`CGEvent`; Linux can read `_NET_ACTIVE_WINDOW` on X11 and `xdotool`-equivalent
injection. This is what turns "cross-platform" from a build target into a
product claim.

**F5 — Clipboard stack / multi-paste.** Pick N items, paste them in order with
repeated presses. It is the highest-leverage power feature a clipboard manager
can add and it composes with what is already there (selection, Quick Paste,
transforms).

**F6 — Command palette.** `Ctrl+Shift+P` over items *and* actions — pin, clear,
open settings section, run a transform, jump to a smart folder. The app already
has a parsed shortcut schema, a transform registry, and a smart-folder list to
populate it from.

**F7 — First-run onboarding.** There is none. A new install opens on "Your
clipboard is quiet" with no hint that Quick Paste exists, that copy is being
recorded, or where the privacy controls are. Three dismissible steps —
what gets captured, the Quick Paste shortcut, where to exclude apps — would
carry the privacy story that the README tells and the app does not.

**F8 — Sync, or its removal.** The encrypted outbox is built (B24). Either
finish it — a self-hosted/S3-backed encrypted record exchange on top of the
existing `sync_records` table and `crypto.rs` — or take it out. Leaving it half
present is what made the capability matrix lie.

**F9 — Richer capture types.** Today: text and images. Adding file paths and
HTML/rich text (keeping both the markup and the plain fallback, with
`PasteFormat` already modelling the choice) covers most of what people actually
copy and is a frequent ask for this category of app.

**F10 — Quick-slot paste.** Pin up to nine items to numbered slots and paste
any of them system-wide with `Ctrl+Shift+1..9`. The global-shortcut plumbing,
the pin model, and the direct-paste path all exist.

---

## Part 3 — UI polish and demo imagery

### The gap

There is not a single product screenshot in the repository. `README.md` has no
images at all. `docs/` has none. The GitHub Pages site
(`site/index.html:57-90`) shows a hand-built CSS mock of three stacked cards
instead of the real interface. The only images in the tree are
`public/favicon.png`, `site/icon.png`, and the three files in `src-tauri/icons/`.

For a desktop app whose entire value is visual and whose distribution channel is
a GitHub release page, this is the highest-return work available. The interface
is genuinely good — measured-contrast token system, six accents, two modes,
skeleton loading states, a keyboard-first list — and none of it is visible to
anyone deciding whether to download.

### 3.1 A reproducible demo fixture

Screenshots of a real clipboard history cannot be published — that is the
product's whole premise. Build the fixture instead:

- `scripts/demo-seed.ts`: writes a `snipdock-demo.sqlite` with ~40 curated
  captures — a JSON payload, a SQL query, a shell one-liner, a git SHA, a
  changelog paragraph, two screenshots, a pinned deploy command, a couple of
  favorites, a masked API key that trips the sensitive detector — spread over
  a believable set of timestamps and source apps.
- `SNIPDOCK_DATA_DIR` override so a dev build can be pointed at it.
- Fixed clock and fixed window size, so a reshoot after a UI change produces a
  diffable image rather than a new one.

This makes every image below regenerable, keeps real user data out of the
repository forever, and gives the demo the density that makes a clipboard
manager look worth installing.

### 3.2 The image set

Shot at 1280×800 (B13 opens the window at 1180 first), light and dark, on the
default teal accent, into `docs/images/`:

| File | Shows |
| ---- | ----- |
| `hero-clipboard-{light,dark}.png` | The history with the inspector rail open, grouped by date, a pinned row selected |
| `quick-paste-{light,dark}.png` | The overlay over a blurred editor, numbered rows, transform chips visible |
| `search-operators.png` | `type:code app:code.exe` in the box with matches highlighted |
| `regex-search.png` | Regex mode with the mode token and a live pattern |
| `settings-appearance.png` | The six accent swatches and the theme preview tiles |
| `settings-privacy.png` | Ignored apps, sensitive sweep, private-item handling |
| `backup-restore.png` | The scheduled backup panel with a destination configured |
| `smart-folders.png` | The sidebar with folders, tags, and sources populated |
| `duplicates.png` | The duplicate merge panel mid-review |
| `quick-paste.gif` | 6–8s: shortcut → filter → transform → paste (this is the one that sells it) |

Rules: no real content, no real bucket names, no real paths; accent-default
only, so an accent change does not invalidate the set; `<picture>` pairs so
light and dark each render in the reader's own mode; every image gets real alt
text, not "screenshot".

### 3.3 Where they go

- **README** — a hero image directly under the title, before the prose; one
  image per feature cluster in Features instead of the current flat bullets; the
  GIF under Quick Paste. Keep the file under ~2MB total by shipping PNGs run
  through `oxipng` and the GIF as an optimized loop.
- **`site/index.html`** — replace the CSS `clip-stack` mock (`:57-90`) with the
  real hero, add a three-up feature section, and a light/dark toggle that
  swaps the `<picture>` source. The site already has the fonts and the tokens to
  frame them properly.
- **`docs/`** — `backup-restore.md`, `keyboard-shortcuts.md`, and `privacy.md`
  each carry one image of the panel they describe. `docs/theming.md` gets the
  accent grid.
- **Release notes** — the checklist in `docs/release-checklist.md` gains a step:
  reshoot the set when the UI changed.

### 3.4 Polish the screenshots will otherwise expose

These are worth doing *before* the shoot, because a screenshot makes each one
permanent:

1. **B13** — open the window wide enough to show the layout the app was designed
   around.
2. **B7** — the empty states are the first thing a new user sees and the easiest
   thing to photograph badly.
3. **Empty-state craft** — "Your clipboard is quiet" is good writing; give it
   the Quick Paste shortcut and a "copy something to begin" affordance so the
   first screenshot teaches something.
4. **Selection affordance** — multi-select is currently discoverable only by
   `Ctrl+Space` or a hover checkbox; a persistent, quiet select-mode toggle in
   the toolbar reads better in a still image and is easier to find.
5. **Inspector hierarchy** — the rail is a flat stack of labelled values; group
   it into Content / Metadata / Actions with the existing `SettingSection`
   primitive so it photographs as a panel rather than a list.
6. **Toolbar density** — five filter pills, a source button, a pinned-first
   toggle, and a four-way grouping control sit on one row and wrap awkwardly
   under 56rem. Collapse grouping into a single menu button.
7. **B25** — forced-colors support, so the Windows high-contrast screenshot is
   not embarrassing.
8. **Focus-visible sweep** — the token system defines a ring; confirm every
   interactive element in the shot list actually shows it, since a
   keyboard-first app should be able to photograph its own focus state.
9. **B17** — no "Start with Windows" label in a macOS screenshot.

---

## Part 4 — Task list

One task per `/task N`. Each ends with code, `PROGRESS.md` updated, and one
local commit. Order is dependency-first: the security and scale fixes land
before the features that build on them, and the UI polish lands before the
screenshots that would otherwise have to be reshot.

### Phase 1 — Correctness and safety

1. B5 — add `pull_request` and `push` triggers to CI; keep `/test` as a manual
   re-run; make frontend and rust required checks.
2. B1 — route on destination, not on query; Settings reachable with text in the
   search box. Covers B8's prerequisite.
3. B3 — move cloud credentials and the backup passphrase to the OS keychain;
   stop returning secrets from `get_settings`; redact `app_settings` from the
   backup snapshot; document what a local backup contains.
4. B2 — bound the regex search: streamed candidates, an explicit scan ceiling
   surfaced in the UI, and a deadline.
5. B4 — add a `preview` column, select it in list queries, add
   `max_capture_bytes`, and fetch full content only in the inspector.
6. B12 — register-then-unregister with rollback for the global accelerator.
7. B10 — read the paste format per CLI request instead of caching it at launch.

### Phase 2 — Behaviour and platform

8. B6, B19, B21 — single-owner tracking state; pin/favorite from search reaches
   the store; pills stand down while a folder is open.
9. B7, B20 — narrowing-aware empty states with a clear-this-narrowing control;
   dim-don't-replace while searching.
10. B8, B18 — "Open source" reveals the item in the history; Quick Paste
    advertises the user's binding.
11. B9 — `change_token` on macOS and Linux; back the interval off when hidden.
12. B11 — thumbnail derivatives at capture, with lazy backfill and fallback.
13. B15, B16, B24 — delete `encryption_enabled`, resolve
    `auto_clear_sensitive_minutes`, correct the capability matrix, and move the
    unreachable sync module behind a feature flag.
14. B17, B22, B23 — `os` on the capability matrix and OS-correct copy; literal
    search applied to FTS candidates with Unicode folding; shortcuts doc
    corrected.

### Phase 3 — UI polish, then imagery

15. B13, B25 — window and breakpoint agree; forced-colors and
    `prefers-contrast` support.
16. Polish items 3–8 from §3.4 — empty-state craft, select-mode affordance,
    inspector grouping, toolbar density, focus-visible sweep.
17. B14 — generate and commit the full icon set; resolve the macOS/Linux
    updater manifest question.
18. §3.1 — `scripts/demo-seed.ts`, the data-dir override, and the fixed-clock
    capture harness.
19. §3.2 — shoot the image set, light and dark, and optimize.
20. §3.3 — wire the images into README, `site/index.html`, and `docs/`; add the
    reshoot step to the release checklist.

### Phase 4 — Features

21. F1 — snippet library: kind picker, promote-to-snippet, Snippets
    destination, placeholder expansion. Closes B26.
22. F7 — first-run onboarding.
23. F6 — command palette.
24. F5 — clipboard stack / multi-paste.
25. F10 — quick-slot paste.
26. F4 — macOS and Linux parity: source-app detection and direct paste.
27. F9 — file-path and rich-text capture.
28. F3 — encryption at rest with auto-lock.
29. F8 — finish sync, or remove it.

---

## Appendix — what is already healthy

Recording this so the plan is not mistaken for a verdict on the codebase.

- **The token system.** `src/styles/tokens.css` is three explicit layers, six
  accent ramps across two modes, with contrast ratios measured rather than
  eyeballed and the exceptions documented inline. `docs/theming.md` is real
  documentation.
- **Race handling in the store.** `clipboardStore` retires in-flight request ids
  on every view change, keeps the outgoing page rendered while paging, and
  recomputes grouping wherever items change — the class of bug that usually
  riddles a list like this is absent.
- **The CLI server's threat model.** Token checked before a single body byte is
  buffered, constant-time comparison, `0o600` discovery files written with the
  mode as part of the open, a 1MB body cap, and a token regenerated every
  launch.
- **Crypto.** Versioned self-describing token, XChaCha20-Poly1305 over
  Argon2id, fresh salt and nonce per seal, and tests for tampering, wrong
  passphrase, and malformed input.
- **Comment discipline.** The comments explain *why*, and several of them
  document a specific bug that was fixed and must not return — the monitor's
  token ordering, the asset-protocol scope, the `groupedItems` refresh on
  replace. That is unusually good practice and it made this audit much faster.
- **Test coverage where it counts.** 344 tests, including a test that asserts
  the Tauri asset scope matches the directory images are written to — a bug
  class most projects only discover in the wild.
