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
| `cargo test --manifest-path src-tauri/Cargo.toml` | **not run** — see B27, and the note below |
| Manual read | `src/` (~9.5k lines), `src-tauri/src/` (~17k lines), workflows, `site/`, `docs/` |

Every finding below is a read of the source, not a test failure. The frontend
suite is green and the types check; the bugs live in paths the suite does not
cover.

The Rust half was **not** executed. Two things block it in the audit
environment, and only the first is a repository problem: the pinned `sysinfo`
needs rustc 1.95 while the box had 1.94.1 (B27, fixable with `rustup toolchain
install 1.95.0`), and past that, `gdk-sys` cannot build without
`libwebkit2gtk-4.1-dev` and `libgtk-3-dev`, which this sandbox cannot install.
The second is a documented prerequisite, not a defect — the README lists it and
CI installs it. So every Rust finding below is a read of the source that has
not been compiled or executed here, and the Rust-side tasks in Part 4 must be
verified on CI or a developer machine. Task 1 exists partly to make that
possible for every pull request.

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
| B27 | Low | Toolchain | No pinned Rust toolchain, and the lockfile needs a newer rustc than the README implies |

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

**B27 — No pinned Rust toolchain, and the lockfile needs a newer rustc than the
README implies.** `Cargo.lock` pins `sysinfo@0.39.6`, whose `rust-version` is
`1.95`. There is no `rust-toolchain.toml`, and the README asks only for "Stable
Rust". A contributor on a stable older than 1.95 gets a dependency-resolution
error that names `sysinfo` rather than the toolchain, which reads as a broken
lockfile rather than an out-of-date compiler. CI happens to pass because
`dtolnay/rust-toolchain@stable` tracks the latest release, so the gap is
invisible to the project until someone builds locally — and it makes the Rust
half of the suite unrunnable for them until they work out why.
*Fix:* add a `rust-toolchain.toml` pinning the channel the lockfile actually
requires, and state the minimum in the README's Requirements list. CI should
then use that file rather than bare `stable`, so the version contributors build
against and the version CI verifies are the same one.

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

One task per `/task N`, per `AGENTS.md`. Each task below states its goal, the
tasks it depends on, the files it owns, the work, and the commands that
verify it. Each ends with `PROGRESS.md` updated and one local commit.

Order is dependency-first: the safety and scale fixes land before the features
that build on them, and the UI polish lands before the screenshots that would
otherwise have to be reshot.

Full verification gate, referenced below as **the gate**:

```
bun test
bun run lint
bun run build
cargo test --manifest-path src-tauri/Cargo.toml
```

### Phase 1 — Correctness and safety

### Task 1: CI runs on push and pull request

- **Fixes:** B5
- **Depends:** none
- **UI:** no
- **Files:** `.github/workflows/ci.yml`
- **Work:** Add `push` (branches `main`, `dev`) and `pull_request` triggers.
  Keep the `/test` comment path as a manual re-run: gate the `gate` job on
  `github.event_name != 'issue_comment' || (…startsWith '/test')`, guard its
  comment-only steps on `github.event_name == 'issue_comment'`, and have it
  output an empty `sha` on the automatic path so `actions/checkout` uses the
  event ref. Restrict the result comment in `report` to the comment path. Add a
  `concurrency` group so a superseded run is cancelled.
- **Checks:** workflow parses as YAML; `gate`/`frontend`/`rust`/`report` job
  graph unchanged; the gate (this task touches no source, so it must not move
  any result).
- **Out of scope:** marking `frontend` and `rust` as required checks — that is
  a branch-protection setting in repository settings, not a file in the tree.
  Record it in `PROGRESS.md` notes for the maintainer.

### Task 2: Route on destination, not on query

- **Fixes:** B1, and unblocks B8
- **Depends:** 1
- **UI:** yes
- **Files:** `src/app/App.tsx`, `src/app/App.test.tsx`
- **Work:** `MainApp` currently renders `SearchResultsPage` whenever
  `query.trim()` is non-empty, ignoring `page`. Make the query narrow the
  Clipboard destination only: when `page === "settings"`, render `SettingsPage`
  regardless of the query. Clear the query on a destination change so returning
  to Clipboard does not silently re-open stale results, matching what the
  pinned-item subscription already does.
- **Checks:** new test — with a query set, navigating to `#settings` renders
  Settings; `bun test`, `bun run lint`, `bun run build`.

### Task 3: Cloud credentials out of the settings blob

- **Fixes:** B3
- **Depends:** 1
- **UI:** yes
- **Files:** `src-tauri/src/models/settings.rs`, `src-tauri/src/storage/settings.rs`,
  `src-tauri/src/commands/settings.rs`, `src-tauri/src/features/backup.rs`,
  `src-tauri/src/features/cloud.rs`, `src/api/types.ts`,
  `src/features/settings/BackupPanel.tsx`, `docs/backup-restore.md`,
  `docs/privacy.md`, `src-tauri/Cargo.toml`
- **Work:** Move `access_key_id`, `secret_access_key`, and `passphrase` out of
  `CloudBackupSettings` into the OS credential store via the `keyring` crate
  (Credential Manager / Keychain / Secret Service). Leave a
  `has_credentials: bool` in the settings blob so the panel can render state.
  `get_settings` must never return a secret. Redact the cloud block from the
  snapshot before sealing, so a backup can no longer carry the keys that reach
  the bucket it is uploaded to. Update `BackupPanel` to write-only credential
  fields ("saved — replace" rather than a populated value). State in
  `docs/backup-restore.md` that a local backup is an unencrypted copy of the
  whole database.
- **Checks:** Rust tests for redaction and for a settings round-trip that
  carries no secret; the gate.
- **Note:** adds one dependency (`keyring`); this task authorizes it.

### Task 4: Bound the regex search

- **Fixes:** B2
- **Depends:** 1
- **UI:** yes
- **Files:** `src-tauri/src/storage/items.rs`,
  `src/features/search/SearchResultsPage.tsx`, `src/api/types.ts`
- **Work:** Replace the unbounded `fetch_all` on the regex path with a streamed
  `fetch`, stopping once `offset + limit` matches are collected. Cap the number
  of rows scanned with an explicit ceiling and a wall-clock deadline; return
  both the match count and a `truncated` flag. Surface the ceiling in the
  results header ("first N captures searched") rather than reporting a total
  the search did not actually establish.
- **Checks:** Rust test that a pattern over more rows than the ceiling returns
  a page plus `truncated`; frontend test for the truncation notice; the gate.

### Task 5: Preview column and a capture size cap

- **Fixes:** B4
- **Depends:** 1, 4
- **UI:** no
- **Files:** `src-tauri/src/storage/database.rs`, `src-tauri/src/storage/items.rs`,
  `src-tauri/src/features/clipboard/capture.rs`,
  `src-tauri/src/models/library.rs`, `src-tauri/src/models/settings.rs`,
  `src/api/types.ts`, `src/features/clipboard/ItemInspector.tsx`
- **Work:** Add a `preview` column populated at capture time (first ~2KB,
  normalized). List queries select `preview`; full `content` is read only by
  the single-item path the inspector uses. Add a `max_capture_bytes` setting
  that stores a truncated body with a `truncated` flag above the ceiling.
  Migrate existing rows by backfilling `preview` from `content` on schema
  upgrade — the app already takes a pre-upgrade snapshot.
- **Checks:** migration test on a populated database; capture test at and above
  the ceiling; the gate.

### Task 6: Register before unregister for the global accelerator

- **Fixes:** B12
- **Depends:** 1
- **UI:** no
- **Files:** `src-tauri/src/platform/shortcuts.rs`
- **Work:** `apply_global_shortcut` calls `unregister_all()` before registering,
  so a rebind to a combination another app owns leaves Quick Paste with no
  accelerator at all. Register the new binding first, unregister the previous
  one only on success, and roll back on failure so the working binding survives
  a rejected rebind.
- **Checks:** Rust test that a failed registration leaves the previous binding
  in force; `cargo test`.

### Task 7: CLI reads the paste format per request

- **Fixes:** B10
- **Depends:** 1
- **UI:** no
- **Files:** `src-tauri/src/cli/server.rs`, `src-tauri/src/app/mod.rs`
- **Work:** `ServiceContext.paste_format` is captured once at launch and never
  updated, so the CLI keeps using the launch-time format after the user changes
  it. Read it from the `Repository` the context already holds, per request.
- **Checks:** route test that a settings change is observed by the next
  `/paste`; `cargo test`.

### Phase 2 — Behaviour and platform

### Task 8: Single-owner tracking state and cross-surface flag writes

- **Fixes:** B6, B19, B21
- **Depends:** 2
- **UI:** yes
- **Files:** `src/features/clipboard/ClipboardPage.tsx`,
  `src/features/search/SearchResultsPage.tsx`, `src/stores/clipboardStore.ts`
- **Work:** `ClipboardPage` seeds `paused` with `useState(trackingPaused)` and
  never syncs it, so a tray toggle leaves the page stale while the sidebar
  updates. Give the prop a single owner. Have `SearchResultsPage.flag` call
  `replaceItem` so a pin or favorite set from search reaches the history. Stand
  the filter pills down while a smart folder is open, since their counts
  describe the unfiltered history.
- **Checks:** tests for each of the three; `bun test`, `bun run lint`,
  `bun run build`.

### Task 9: Narrowing-aware empty states

- **Fixes:** B7, B20
- **Depends:** 8
- **UI:** yes
- **Files:** `src/features/clipboard/ClipboardPage.tsx`,
  `src/features/search/SearchResultsPage.tsx`
- **Work:** The empty state keys on `filter === "all"` alone, so an empty smart
  folder or an empty source-app narrowing shows the first-run "Your clipboard is
  quiet". Branch on whether any narrowing is active and offer a control that
  clears the specific one responsible. In search, dim the retained list while
  loading instead of rendering a spinner block beside it.
- **Checks:** tests for the folder-empty and source-empty states; `bun test`,
  `bun run lint`, `bun run build`.

### Task 10: Reveal-in-history, and honest shortcut hints

- **Fixes:** B8, B18
- **Depends:** 2, 9
- **UI:** yes
- **Files:** `src/features/search/SearchResultsPage.tsx`,
  `src/features/clipboard/QuickPastePage.tsx`
- **Work:** Replace the inert `href="#clipboard"` anchor with a button calling
  `requestFocusItem(item.id)` — the store mechanism and the query-clearing
  subscription already exist. In Quick Paste, read the effective binding from
  `settings.custom_shortcuts` instead of the parsed default, so the empty state
  cannot advertise a combination a rebind has retired.
- **Checks:** tests for both; `bun test`, `bun run lint`, `bun run build`.

### Task 11: Clipboard change token on macOS and Linux

- **Fixes:** B9
- **Depends:** 1
- **UI:** no
- **Files:** `src-tauri/src/platform/native.rs`,
  `src-tauri/src/features/clipboard/monitor.rs`, `src-tauri/src/app/mod.rs`,
  `src-tauri/Cargo.toml`
- **Work:** `change_token` returns `None` off Windows, so both other platforms
  fully read the clipboard — copying the whole RGBA buffer for an image — twice
  a second. Implement it with `NSPasteboard.general.changeCount` on macOS and
  the X11 selection-owner serial on Linux, falling back to `None` under Wayland
  until `wlr-data-control` is wired. Back the poll interval off while the main
  window is hidden.
- **Checks:** Rust tests for the token contract; manual confirmation that an
  image resting on the clipboard no longer re-reads each tick; the gate.

### Task 12: Image thumbnails

- **Fixes:** B11
- **Depends:** 5
- **UI:** yes
- **Files:** `src-tauri/src/features/images.rs`,
  `src-tauri/src/features/clipboard/capture.rs`,
  `src-tauri/tauri.conf.json`, `src/lib/itemImage.ts`,
  `src/components/ItemThumbnail.tsx`, `src/test/asset-scope.test.ts`
- **Work:** Write a downscaled `<hash>.thumb.png` (long edge 256px) beside the
  original at capture. List rows point at the derivative; the inspector and
  copy keep the full file. Backfill lazily and fall back to the original when
  the derivative is missing. Extend the asset-protocol scope and its test to
  cover the new filename.
- **Checks:** image tests for generation, fallback, and orphan sweep; the
  asset-scope test; the gate.

### Task 13: Retire the dead settings, matrix claims, and sync module

- **Fixes:** B15, B16, B24
- **Depends:** 1
- **UI:** no
- **Files:** `src-tauri/src/models/settings.rs`,
  `src-tauri/src/models/platform.rs`, `src-tauri/src/storage/sync.rs`,
  `src-tauri/src/models/sync.rs`, `src-tauri/src/models/mod.rs`,
  `src-tauri/src/storage/mod.rs`, `src/api/types.ts`,
  `src/stores/platformStore.ts`
- **Work:** Remove `encryption_enabled` (nothing reads it; Task 28 reintroduces
  it with meaning). Either wire `auto_clear_sensitive_minutes` to a background
  sweep or remove it — do not leave a setting whose name promises automation
  that does not exist. Correct the capability matrix: drop `sync` until Task 29,
  and gate `direct_paste` on `cfg!(target_os = "windows")` to match the README.
  Put the unreachable sync module behind a `sync` cargo feature, off by default.
- **Checks:** matrix tests updated; settings round-trip test; the gate.

### Task 14: OS-aware copy and doc correction

- **Fixes:** B17, B23
- **Depends:** 13
- **UI:** yes
- **Files:** `src-tauri/src/models/platform.rs`,
  `src-tauri/src/storage/items.rs`, `src/api/types.ts`,
  `src/features/settings/SettingsPage.tsx`, `docs/keyboard-shortcuts.md`
- **Work:** Add `os: "windows" | "macos" | "linux"` to the capability matrix and
  select the noun from it, so a macOS build stops saying "Start with Windows".
  Phrase the label neutrally until the matrix lands, rather than guessing.
  Delete the "these accelerators are fixed in the current release" line, which
  the rebind panel contradicts — the file is also parsed into
  `SHORTCUT_SCHEMA`, so keep the bullet grammar intact.
- **Checks:** a Settings test for the named and the not-yet-known case; the
  shortcut schema parse test still passes; clippy `-D warnings`; the frontend
  gate.

### Task 31: Unicode-safe, candidate-scoped literal search

- **Fixes:** B22
- **Depends:** 4
- **UI:** no — **requires runtime Rust tests**
- **Files:** `src-tauri/src/storage/items.rs`, `src-tauri/tests/search.rs`
- **Work:** A literal search (any query containing punctuation) runs
  `instr(lower(...)) > 0` against four columns of every row, including the full
  content blob — no index, no pre-filter. SQLite's `lower()` also folds ASCII
  only, so a query in any language with non-ASCII case is silently
  case-sensitive. Narrow to the FTS candidate set first, and fold case in Rust
  where the fold is Unicode-aware.
- **Checks:** a test that a non-ASCII query matches case-insensitively; a test
  that a punctuation-only query (`->`) still matches, since it tokenizes to
  nothing and has no FTS candidates to narrow to; pagination totals unchanged
  for an ASCII query. **Split out of Task 14 deliberately:** this rewrites the
  search hot path and its pagination, and correctness rests on behaviour a
  type-check cannot see. `cargo test` does not execute in the audit
  environment (see `PROGRESS.md`), so it must be done where it can be run.

### Phase 3 — UI polish, then imagery

### Task 15: Window, breakpoint, and high-contrast support

- **Fixes:** B13, B25
- **Depends:** 9
- **UI:** yes
- **Files:** `src-tauri/tauri.conf.json`,
  `src/features/clipboard/ClipboardPage.tsx`, `src/styles/tokens.css`,
  `src/styles/base.css`
- **Work:** The window opens at 960px and the inspector rail engages at 1024px,
  so a fresh install never sees the intended layout. Open at 1180×760 and lower
  the rail to `min-[60rem]` so the two agree with room to spare. Add
  `forced-colors` and `prefers-contrast: more` blocks so the accent-tinted
  selection bands and `color-mix` highlights survive high-contrast mode.
- **Checks:** `src/styles/tokens.test.ts` extended; manual check in forced
  colors; `bun test`, `bun run lint`, `bun run build`.

### Task 16: Honest shortcut hints, and an empty state that teaches

- **Fixes:** §3.4 items 3 and 8
- **Depends:** 15
- **UI:** yes
- **Files:** `src/lib/shortcutHints.ts`, `src/lib/shortcutHints.test.ts`,
  `src/features/clipboard/ClipboardPage.tsx`,
  `src/app/components/WorkspaceSearch.tsx`, `src/app/App.tsx`
- **Work:** `shortcutHints.ts` held the combinations as literals, "kept in sync
  with `docs/keyboard-shortcuts.md` by hand" — so the hint row under the
  history and the cap beside the search box ignored every rebind and went on
  naming combinations the app had stopped listening for. This is B18 again, in
  two more places. Derive them from `SHORTCUT_SCHEMA` and the stored
  overrides. Then give the empty state the Quick Paste binding: it is the first
  screen a new install shows, it taught nothing, and Quick Paste works while
  another application has focus, so it cannot be discovered from inside the
  window at all.
- **Checks:** unit tests for default, override, blank-override, and
  unknown-action; a page test for the empty state; `bun test`, `bun run lint`,
  `bun run build`.

### Task 30: Toolbar, selection, and inspector restructure

- **Fixes:** §3.4 items 4, 5, 6
- **Depends:** 16
- **UI:** yes — **requires a running app on a display**
- **Files:** `src/features/clipboard/ClipboardPage.tsx`,
  `src/features/clipboard/ItemInspector.tsx`,
  `src/components/ui/setting-section.tsx`
- **Work:** ~~Add a quiet, persistent select-mode toggle to the toolbar~~ —
  **done in the Task 30 partial commit.** Remaining: group the inspector into
  Content / Metadata / Actions with the existing `SettingSection` primitive, so
  it reads as a panel rather than a flat stack of labelled values; and collapse
  the four-way grouping control so the toolbar stops wrapping under 56rem.
- **Known constraint on the grouping control:** a native `<select>` is the
  compact option and it does not work here. A select owns `role="option"`
  children, and the history below is a listbox whose rows are options, so the
  page ends up with two unrelated sets of "options" and no way for a
  screen-reader user to tell which list they are in. It has to be a custom
  popup — which is a positioned, visual component, so it belongs with the rest
  of this task on a machine where it can be seen.
- **Checks:** page tests updated; a keyboard walk of the toolbar and the
  inspector; the frontend gate. **Split out of Task 16 deliberately:** these
  are visual judgements about proportion and density that cannot be made from
  a test assertion, and `AGENTS.md` forbids claiming UI verification for a view
  that was never actually looked at. They must be done where the app can be
  run and seen, and they precede the screenshots in Task 19.

### Task 17: Platform icon set and the updater question

- **Fixes:** B14
- **Depends:** 1
- **UI:** no
- **Files:** `src-tauri/icons/*`, `src-tauri/tauri.conf.json`,
  `.github/workflows/release.yml`, `README.md`
- **Work:** `src-tauri/icons/` holds only `icon.ico`, `icon.png`, and
  `icon-master.png`, while the release matrix builds `app,dmg` and
  `deb,appimage`. Run `bun run tauri icon src-tauri/icons/icon-master.png`,
  commit the generated set including `icon.icns`, and reference it from
  `bundle.icon`. Then either publish per-platform updater manifests or state in
  the README that auto-update is Windows-only — the matrix sets
  `uploadUpdaterJson: False` off Windows while the README promises signed
  updates.
- **Checks:** `bun run tauri build --no-bundle` succeeds; release workflow
  parses; the gate.

### Task 18: Reproducible demo fixture

- **Depends:** 16
- **UI:** no
- **Files:** `scripts/demo-seed.ts`, `scripts/demo-seed.test.ts`,
  `src-tauri/src/app/mod.rs`, `docs/release-checklist.md`
- **Work:** Screenshots of a real clipboard history cannot be published, so
  build the fixture. `scripts/demo-seed.ts` writes a `snipdock-demo.sqlite`
  with ~40 curated captures — a JSON payload, a SQL query, a shell one-liner, a
  git SHA, a changelog paragraph, two screenshots, a pinned deploy command, two
  favorites, and a masked API key that trips the sensitive detector — over a
  believable spread of timestamps and source apps. Honour a
  `SNIPDOCK_DATA_DIR` override so a dev build can be pointed at it. Fix the
  clock and the window size so a reshoot after a UI change produces a diffable
  image.
- **Checks:** seeding into a temp dir produces a database the app opens; no
  real paths, bucket names, or content in the fixture; `bun test`.

### Task 19: Shoot the image set

- **Depends:** 18
- **UI:** yes
- **Files:** `docs/images/*`
- **Work:** Shoot at 1280×800, light and dark, default teal accent, per §3.2:
  `hero-clipboard`, `quick-paste`, `search-operators`, `regex-search`,
  `settings-appearance`, `settings-privacy`, `backup-restore`,
  `smart-folders`, `duplicates`, and the 6–8s `quick-paste.gif`. Optimize the
  PNGs through `oxipng` and the GIF as an optimized loop; keep the set under
  ~2MB total.
- **Checks:** no real content in any frame; both modes present for every paired
  shot; total size recorded in `PROGRESS.md`.

### Task 20: Wire the images in

- **Depends:** 19
- **UI:** yes
- **Files:** `README.md`, `site/index.html`, `site/styles.css`,
  `docs/backup-restore.md`, `docs/keyboard-shortcuts.md`, `docs/privacy.md`,
  `docs/theming.md`, `docs/release-checklist.md`,
  `src/test/github-pages.test.ts`
- **Work:** README gets a hero under the title and one image per feature
  cluster, with the GIF under Quick Paste. `site/index.html` replaces the CSS
  `clip-stack` mock with the real hero plus a three-up feature section, using
  `<picture>` so light and dark each render in the reader's own mode. Each doc
  carries one image of the panel it describes. Add a reshoot step to the
  release checklist. Every image gets real alt text, not "screenshot".
- **Checks:** `src/test/github-pages.test.ts` extended for the new assets and
  its no-absolute-path rule; `bun test`.

### Phase 4 — Features

### Task 21: Snippet library

- **Implements:** F1, closes B26
- **Depends:** 5, 16
- **UI:** yes
- **Files:** `src/features/clipboard/SaveItemDialog.tsx`,
  `src/features/clipboard/ItemActions.tsx`,
  `src/app/components/AppSidebar.tsx`, `src/stores/clipboardStore.ts`,
  `src-tauri/src/features/formatting.rs`, `src-tauri/src/commands/clipboard.rs`
- **Work:** `ItemKind::{Snippet, Command, Template, Note}` are already stored,
  filterable, and groupable, but nothing in the UI can create one — which is
  why Group → Kind always yields a single "Clipboard" group. Add a kind picker
  to `SaveItemDialog`, a "Promote to snippet" action on a history row, and a
  Snippets destination in the sidebar backed by a `kinds` query. Add
  `{{placeholder}}` expansion at paste time in the existing transform pipeline.
- **Checks:** tests for creation, filtering, and placeholder expansion; the
  gate.

### Task 22: First-run onboarding

- **Implements:** F7
- **Depends:** 16
- **UI:** yes
- **Files:** `src/app/App.tsx`, `src/app/components/Onboarding.tsx`,
  `src-tauri/src/models/settings.rs`
- **Work:** Three dismissible steps on first launch — what is captured, the
  Quick Paste shortcut, and where to exclude apps — carrying the privacy story
  the README tells and the app currently does not. Record completion in
  settings so it never reappears.
- **Checks:** shown once, dismissible by keyboard, never shown again; the gate.

### Task 23: Command palette

- **Implements:** F6
- **Depends:** 21
- **UI:** yes

### Task 24: Clipboard stack / multi-paste

- **Implements:** F5
- **Depends:** 21

### Task 25: Quick-slot paste

- **Implements:** F10
- **Depends:** 24

### Task 26: macOS and Linux parity — source app and direct paste

- **Implements:** F4
- **Depends:** 11, 13

### Task 27: File-path and rich-text capture

- **Implements:** F9
- **Depends:** 5

### Task 28: Encryption at rest with auto-lock

- **Implements:** F3
- **Depends:** 3, 13

### Task 29: Finish sync, or remove it

- **Implements:** F8
- **Depends:** 13, 28

Tasks 23–29 are specified at the level above; each gets its full Goal /
Depends / Files / Work / Checks section written when its phase is reached, so
the spec reflects the codebase as it will actually be by then rather than as it
is today.

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
