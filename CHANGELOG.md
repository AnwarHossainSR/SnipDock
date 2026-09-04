# Changelog

All notable changes to SnipDock are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Published GitHub Releases carry the authoritative, per-version notes; the
in-app **Settings → Updates** panel shows those same notes before an update is
installed.

## [Unreleased]

## [0.1.18] - 2026-09-03

### Changed

- **SnipDock is close to free when nothing is on the clipboard.** The monitor
  now reads the operating system's clipboard change counter and skips the poll
  entirely when it has not moved. Previously every tick drained the clipboard
  to find out whether it had changed, so a screenshot resting there cost tens
  of megabytes of copying twice a second for a clipboard nobody had touched.
  Windows is wired up; platforms without a counter behave as before.
- Release builds are optimized: link-time optimization, a single codegen unit
  and stripped symbols, which is both faster and a substantially smaller
  download on every update.
- The database runs in WAL mode with `synchronous = NORMAL`, a busy timeout
  and a larger page cache. Captures no longer fsync one at a time or lock out
  the history page while they commit.
- Password managers are on the ignored-applications list out of the box, so a
  fresh install does not record what they copy. The list stays fully editable,
  and clearing it is remembered.

### Added

- **Pause capture from the tray.** The tray menu carries a checkbox that stops
  and starts clipboard capture, and its tooltip says which state you are in.
  It and the switch in Settings are the same setting, and each follows the
  other.

### Fixed

- The update dialog said "No release notes were published for this version"
  even when the release had notes. The workflow step that builds the
  standalone binary was re-uploading the updater manifest with an empty body
  moments after the real notes were published. Applies from the next release.

## [0.1.17] - 2026-09-03

### Fixed

- Restored clipboard capture in 0.1.16. The monitor owner was moved into
  `AppState` so the worker thread survives startup, and the `Drop` contract
  was simplified back to unconditional shutdown so dropping one handle no
  longer leaves capture running or kills it unexpectedly.

## [0.1.16] - 2026-09-02

### Added

- **Every capture remembers where it came from.** The foreground application
  is recorded with each clipboard capture and shown on the row and in Details.
  The sidebar's **Sources** section and a toolbar filter narrow the history to
  one application, with captures that have no recorded source grouped under
  **Unknown source**.
- **Quick Paste transforms.** A transform row under the search runs the
  selection through trim, lower/UPPER case, sort and dedupe lines, JSON pretty
  or minify, base64 encode/decode, or URL encode/decode before it is pasted.
  The preview pane shows exactly what will land on the clipboard, and an
  invalid transform - malformed JSON, garbage base64 - says so instead of
  pasting. `F8` cycles the row, and the letter bindings are held with `Alt`.
- **Regex search.** The search box has a Literal/Regex toggle. In Regex mode
  the FTS5 index still narrows the candidates and the pattern filters those,
  so a search stays fast; an invalid pattern surfaces inline instead of
  silently returning nothing. `(?i)` opts into case-insensitive matching, and
  a saved search remembers the mode it was saved in.
- **An Ignored apps panel.** `ignored_apps` was honoured at capture time with
  no way to edit it. Settings now lists the ignored applications, adds the one
  in the foreground, and takes a typed executable name.
- **A Keyboard shortcuts panel.** Every documented shortcut can be rebound,
  with the grammar, OS-reserved bindings, and collisions with other actions
  checked before the binding is saved, and one click to put a row back to its
  default.
- **The CLI reaches the running app.** `snipdock pin`, `unpin`, `favorite`,
  `unfavorite`, `tag`, `search`, `paste`, and `export` talk to a localhost
  endpoint the desktop app exposes, bound to `127.0.0.1` on a random port and
  gated by a token that is regenerated every launch. Both are written to the
  data directory as owner-only files, and the CLI reads them on every
  invocation.

### Changed

- Backups are named for the moment they were taken -
  `2026-09-01_15-30-42_snipdock_local.sql` and `..._snipdock_r2.sql` - so the
  date is readable in `ls` and in the R2 dashboard. The stamp carries seconds,
  so two runs in the same minute no longer overwrite each other, and retention
  only ever prunes files it wrote itself.

## [0.1.15] - 2026-08-28

### Changed

- **The capture leads its own row.** The history row used to open with its
  metadata - a filled colour pill, flag chips, a timestamp, then a fourth grey
  line - and put the capture second, muted and smaller than the chrome around
  it. The capture now leads at full contrast and everything else shares one
  register beneath it. The content type moved from a filled pill to a slim
  spine down the row's left edge, coloured by type, so the list is indexed by
  the first question anyone asks of it. Rows are separated by hairlines instead
  of floating as cards, and a grouped list keeps its group name pinned while
  that group is on screen.
- Settings panels share one header component, and the app shares one
  content-type label map, one set of date formats, and one clipboard search
  query, each of which had been copied into three to six files.

### Fixed

- **The app sometimes opened saying its history was unavailable.** The
  clipboard state was registered last during startup, after the database was
  opened, retention had run, and the image directory had been reconciled. The
  window loads in parallel, so on a slow start the first reads arrived before
  the state existed and failed. The state is registered as soon as the
  database is open, and those sweeps now run after it.
- The history's error state offers **Try again**, and the header carries a
  refresh beside the other actions; both reload and clear the error. It used to
  say to close and reopen the app.
- An image row named its type twice.

### Added

- **The duplicate finder, usage stats, and the credential sweep are reachable.**
  Three features were complete in Rust and registered as commands with nothing
  in the app calling them. Settings now has a **Duplicates** panel that counts
  the repeated captures and merges each group into the copy used most, a
  **Usage** panel showing captures, copies, and stored text with a breakdown by
  type, and a sweep under **Privacy** that clears stored credentials by age.
- **Saved searches.** Whatever filter is showing can be kept under a name and
  reopened from the sidebar. Smart folders were already complete in Rust.
- **Projects and tags.** Captures can be tagged and filed from the inspector's
  Details tab, and the sidebar lists tags with their counts and the projects;
  opening one filters the history. `src-tauri/src/commands/organization.rs` had
  the repository behind it and no command wrappers, so none of it was reachable.
- **Clearing by age.** The clear-history confirmation asks how far back to
  reach as well as what to clear, so "images older than 30 days" is one
  confirmation.
- **The images that take the room.** Under the Images filter, a bar reports
  what the stored images take on disk and lists the largest with their sizes.
  The history sorts by date, so the biggest captures can sit pages deep.
- **Per-capture self-destruct timers.** A capture can be set to remove itself
  after an hour, a day, or a week. `expires_at` has been in the schema since
  the first migration, could not be set on an automatic capture, and no sweep
  ever read it.
- **Pinned first.** A toolbar toggle floats the kept captures to the top of
  every page.
- **Numbered rows in Quick Paste.** The first nine rows are numbered, and
  `Ctrl+1` to `Ctrl+9` pastes one outright.

### Fixed

- `clear_sensitive_data` failed on every run: it read the `content` column as
  text, but the column is declared `BLOB`, so the row never decoded.
- Merging duplicates lost the use counts it claimed to add up. The sum ran
  after the copies were soft-deleted and filtered them out, leaving the kept
  capture with only its own count.
- Published releases carried no notes, so the updater manifest held
  `"notes": ""` and the in-app Updates panel had nothing to show. The release
  workflow now publishes the CHANGELOG section for the version.

## [0.1.14] - 2026-08-28

### Added

- **Clear only the images from clipboard history.** The clear-history
  confirmation now asks what to clear: everything, images only, or text only.
  An image sweep leaves every typed and copied capture in place, still honours
  the pinned and favourite exclusions, and is undoable as one receipt like any
  other clear. A matching **Images** filter joins All, Code, Pinned, and
  Favourites on the Clipboard screen, so the screenshots can be reviewed before
  they are cleared.

### Changed

- **Settings reads as one page again.** Every panel now shares the header rule,
  heading scale, and accent eyebrow that Import & export, Backup, and Updates
  already used; each setting sits on its own hairline-separated row with its
  explanation beside it, and the "On this page" rail is a card with a filled
  active entry. Theme moved from a dropdown to three radio cards, and rows per
  page and list density from button rows to segmented radios.
- Radio buttons and checkboxes outside the settings form are painted rather than
  left to the browser default, so the clear-history dialog matches the rest of
  the app.

## [0.1.13] - 2026-08-28

### Fixed

- **Pinned and favourited captures are no longer deleted by retention.** History
  retention deletes clipboard rows outright — it does not move them to the trash
  — and it was applying both the age cutoff and the item cap to every capture,
  flagged or not. With the defaults, that permanently removed any pinned or
  favourited item older than 30 days, or past the newest 500. Pinning or
  favouriting now exempts an item from both, and the item cap counts only
  unflagged rows, so keeping something can never push an unrelated capture over
  the edge.
- The update prompt appears again. It was gated behind three things that could
  each silence it on their own: the "What's new" dialog suppressed it while
  open, an update whose release body had no bullet list was treated as having no
  update at all — hiding the dialog *and* the sidebar button — and the
  preferences deciding whether to prompt lived in the webview's `localStorage`,
  which a reinstall clears.
- Settings → Updates offers the install for any available version. The button
  was disabled unless the release body parsed into changelog sections, so a
  release published with plain or empty notes could not be installed from there.
- Update preferences are stored in the settings database rather than
  `localStorage`, so a skipped version stays skipped and "tell me about updates"
  stays as it was set across a reinstall.

### Added

- **Backups you configure, in Settings → Backup and restore.** A schedule
  (manual, daily, or weekly), a copy kept on this computer, and an upload to
  Amazon S3 or Cloudflare R2. One snapshot feeds every destination, and a
  destination that fails does not cancel the others. Uploads are sealed with
  your backup password on this machine before any request is made, so the bucket
  only ever holds ciphertext. **Test connection** writes and removes a probe
  object so a wrong key is caught in Settings rather than at 3am.
- **SnipDock backs itself up before it can lose anything.** A snapshot is taken
  before an update installs and before a release upgrades the database schema.
  If the snapshot cannot be written, neither goes ahead: the update reports why,
  and migrations do not run, leaving the existing data untouched rather than
  migrating it unbacked.
- Local backups and pre-upgrade snapshots are listed in Settings, newest first
  and with the automatic ones labelled, and any of them can be restored in
  place. Retention never deletes a pre-upgrade snapshot — it is the safety net,
  not a scheduled copy.

### Changed

- Clipboard history shows **100 rows per page** by default, offered as 200,300,400,500.
  100, or 200, and the choice is stored in settings so it survives a restart.
  The pager gained first and last buttons, a clearer current page, and a
  `Page x of y` readout at narrow widths.
- **The "What's new" dialog is gone.** It opened on the first launch after any
  version change, and reappeared on every launch wherever the webview's storage
  did not survive — which is where the "always showing" reports came from.
  Nothing now interrupts a launch except an update that is genuinely available,
  and that dialog carries the release's own notes with Install now, Skip this
  version, and Later. The "don't notify me" checkbox is gone with it: it wrote a
  flag nothing visibly turned back on, and turning notifications off now lives
  in Settings → Updates next to the switch that turns them back on.

## [0.1.12] - 2026-08-27

### Added

- **Save an item by hand.** A *Save item* button on the Clipboard screen opens a
  form for anything you want to keep without copying it first: type it, or pull
  the current clipboard in with one button. What you save becomes an ordinary
  capture — it appears in the history, obeys the filters, and copies back
  byte for byte. The content type is detected for you, and an optional title is
  stored alongside it. Unlike automatic capture, nothing you save by hand is
  ever silently dropped: a duplicate of the last capture is kept, and content
  that scans as a secret is kept too, marked private so it renders masked.
- The sidebar reports what SnipDock costs the machine: memory, how many
  processes it is running, and CPU. A Tauri app is the Rust binary plus the
  platform webview's own helpers, so the figures cover the whole process tree
  rather than flattering themselves with the main process alone. The CPU figure
  appears only once there is an earlier reading to measure against.
- Clipboard history is paged, with controls beneath the list: previous and next,
  numbered pages including the first and last, and a choice of 15, 30, 60, or
  100 rows per page. The rows scroll inside the panel, so the controls stay
  reachable without scrolling past a full page of captures first.

### Changed

- The Clipboard toolbar reads as two controls rather than one run of text: the
  filters carry icons and sit on the left, grouping is labelled and right
  aligned, and the active segment is a raised pill with an accented glyph
  instead of coloured text alone.
- Search results use the same pagination controls as the history, replacing the
  bare Previous/Next pair, and the duplicated result count above the list.
- Confirmations such as "Copied to clipboard" are now shown as well as
  announced. They previously reached screen readers only.
- Dependency updates: `vite` 8.2.2, `@vitejs/plugin-react` 6.1.0, `zustand`
  5.0.15, `@happy-dom/global-registrator` 20.11.6, `uuid` 1.24.1, and
  `actions/checkout` v7.

### Removed

- The history no longer loads more rows as you scroll. Pages replace one
  another instead of accumulating, which keeps the row count on screen bounded
  however long the history is.

### Fixed

- Publishing a release no longer stops at its first step. CI pinned bun 1.3.14
  while `bun.lock` had been rewritten in the version 2 format, which that bun
  cannot read, so `bun install --frozen-lockfile` failed before anything was
  built. The pin now matches the bun that wrote the lockfile.

## [0.1.11] - 2026-08-07

### Added

- Pinned items in the sidebar now open their capture. Selecting one leaves any
  active search, selects the row, scrolls it into view, and shows it in the
  detail pane. When the item is older than the rows already loaded, the list
  switches to the Pinned filter so it can still be reached.

### Changed

- The shell reads more clearly: the active destination is marked in the
  sidebar, the Pinned section shows a count and an invitation when empty, and
  capture status, storage, and version are grouped into one card.
- Filters and grouping became segmented controls in a single toolbar, the
  search bar stays at the top of the window while the list scrolls and shows
  the documented search shortcut, and the detail pane stays beside the list.
- List rows have clearer hover, active, pinned, and favorite states.

### Fixed

- A long pinned label no longer spills out of the sidebar across the clipboard
  list. Labels truncate at the sidebar edge, whatever their length.
- Publishing a release no longer fails at the last step. Refreshing the
  `latest.json` that legacy alpha clients poll now creates the `updater-alpha`
  release when it is missing, instead of stopping with `release not found`.

## [0.1.10] - 2026-08-07

### Added

- A detail pane beside the history shows the selected capture in full: its
  content, character and line counts, how many times it has been copied, its
  language, and its flags. Copy, pin, and favorite act on it without leaving
  the list. It appears at window widths of 64rem and above, so narrower windows
  keep the single-column list they had.
- Captures flagged as sensitive now render blurred in the list and hidden in
  the detail pane until revealed, per row or with the `R` key. Revealing lasts
  for the session only and is never saved. Masking is display-only — copying
  still returns exactly what was stored.
- The sidebar's storage line became a split bar and legend showing how much of
  what is stored is database and how much is images.
- `Ctrl`/`Cmd`+`K` focuses and selects the search field.

### Changed

- Search now waits for a pause in typing before querying, instead of running a
  query per keystroke.
- Search results carry icon buttons with tooltips for copy, pin, favorite, and
  open.
- Settings edits all route through one commit path: typed fields save on blur
  and on `Enter`, toggles and selects save immediately. Typing `365` into a
  numeric field is one save instead of three.
- Checkboxes, selects, and the ignored-content-types legend are restyled from
  the theme tokens. The controls stay native, so keyboard and IME behavior is
  unchanged.

### Fixed

- SnipDock no longer refuses to start after updating from 0.1.9. The
  `smart_folders` timestamp trigger was corrected by editing the migration that
  0.1.9 had already applied, and the migration runner rejects any file whose
  contents changed after the fact — so the app exited during startup, with no
  window and no message. The original migration is restored byte for byte and
  the trigger fix moved into a new one, which existing databases apply on next
  launch. History and settings are untouched.
- A snippet padded with blank lines no longer opens a hole in the history list.
  Previews drop outer blank lines and collapse blank runs; the stored content
  and what copying returns are unchanged.
- A live capture no longer resets the history list. The new item is prepended,
  so rows loaded by scrolling, the scroll position, and keyboard focus all
  survive. A capture the active filter excludes is left out.
- The header and filter row no longer show two disagreeing counts. There is one
  readout: `30 of 265 items` while more remain, `265 items` once everything
  matching is loaded.
- Settings rejects out-of-range numbers instead of saving them. History days
  (1–365), max items (10–10,000), and formatter indent (1–8) are checked before
  the backend is called; an empty, non-numeric, or out-of-range entry restores
  the last saved value and shows the accepted range.
- Saving settings gives visible feedback: a confirmation that clears itself, an
  error that stays until the next edit, and a pending indicator while the save
  is in flight.
- Text typed into one settings field while a save was in flight is no longer
  discarded when that save completes.

## [0.1.9] - 2026-07-30

### Added

- Clipboard images are now captured, listed, and copied back. Copying a picture
  previously did nothing at all: the monitor only ever read text, so images
  never reached the history. Pictures now appear as thumbnails in the history,
  Quick Paste, and search results, and copying one puts the image itself back
  on the clipboard rather than a file path.
- `Image` joins the ignored content types in Settings, so image capture can be
  turned off on its own.

### Fixed

- Ctrl-click on a clipboard item now enters multi-select mode and adds the
  item to the selection in one action, instead of requiring multi-select mode
  to already be active and collapsing the selection to a single row.
- Clear History options are now sent as camelCase (`excludePinned`,
  `excludeFavorite`) to match Tauri's IPC argument conversion, fixing calls
  that silently dropped the filters.
- Clear History's "nothing to clear" message now also matches `not_found`
  errors returned as plain error strings, not just structured error codes.

## [0.1.8] - 2026-07-29

### Fixed

- CLI installer now downloads correct release assets from GitHub.
- Windows installer handling in CLI (`snipdock run` launches the installer).
- Removed gzip decompression and checksum verification (release files aren't gzipped).

## [0.1.7] - 2026-07-27

### Changed

- Clear History now preserves pinned and favorite items by default, with
  checkboxes to optionally include them in the deletion.
- Quick Paste now copies and closes with manual-paste guidance on macOS and
  Linux; Windows retains direct paste.
- Documentation and the landing page now describe only currently available
  Clipboard and Settings features.
- Stable release versions can be synchronized with `bun run version X.Y.Z`.

### Fixed

- Clear History now warns that it removes all clipboard history even when a
  filter is active.
- Search pagination resets when the query changes, and developer punctuation
  is tokenized without merging adjacent terms.
- Stored settings fill newly added fields from defaults instead of blocking
  startup.
- Backup and restore reject databases above 128 MiB before unbounded reads.

## [0.1.6] - 2026-07-24

### Added

- Clipboard history now loads incrementally with infinite scroll pagination
  instead of a single large fetch.
- Click a clipboard row (or press Enter/Space on a focused row) to copy it.

### Changed

- Replaced the header's tracking toggle and clear-history text buttons with
  icon controls, and the sidebar clipboard icon now matches the app mark.

### Removed

- Removed the Tools page and its offline developer utilities, including the
  `run_tool` backend command.
- Removed the search focus ring and the top-bar "Local-first" indicator.

## [0.1.5] - 2026-07-23

### Fixed

- Stopped registering page-action shortcuts (`Ctrl+Shift+F/C/P/D/Backspace/Left/Right`)
  as OS-wide accelerators so they no longer block those shortcuts in other
  applications such as VS Code. They now work while the SnipDock window has
  focus; only Quick Paste (`Ctrl+Shift+V`) remains system-wide.

## [0.1.4] - 2026-07-22

### Fixed

- Kept Quick Paste hidden at startup until its shortcut is pressed.
- Allowed Quick Paste to close with Escape or its close control.

## [0.1.3] - 2026-07-22

### Added

- Added a compact searchable Quick Paste window that restores the previously
  focused application and pastes the selected clipboard item.
- Added encrypted full-database backup and transactional restore support.

### Fixed

- Removed the 200-item backup ceiling and preserved all application records.
- Made imports transactional while preserving imported content types.
- Synchronized clipboard tracking state at startup and connected clipboard
  keyboard shortcuts.
- Retried transient Windows database file locks during backup recovery.

## [0.1.2] - 2026-07-22

### Changed

- Migrated the UI to **Tailwind CSS v4** (via `@tailwindcss/vite`, with a
  CSS-first `@theme` bridge over the existing design tokens) and **shadcn/ui**
  primitives. The app shell and feature screens now use utilities, Tailwind
  preflight is enabled, and legacy feature stylesheets are removed. Fonts stay
  bundled locally and the app remains CSP-safe (see #42).

### Fixed

- Installed the required Ayatana app-indicator development package in Linux
  release builds so Tauri can produce the `.deb` and `.AppImage` artifacts.

## [0.1.1] - 2026-07-21

### Added

- **Settings → Updates** panel that checks GitHub Releases for a signed update,
  shows the available version, release date, and full release notes, and
  installs then restarts on confirmation.
- Structured update details (`version`, `notes`, `date`) returned from the
  `check_for_update` command so the UI can present release notes.
- Client-side encryption foundation for sync (`features/crypto`): Argon2id key
  derivation plus XChaCha20-Poly1305 sealing that produces the self-contained
  token stored in the `sync_records.ciphertext` column.
- Transport-agnostic sync staging engine: seals library records into the
  encrypted `sync_records` outbox, honors tombstone deletes, refuses private
  items at the boundary, and reconciles incoming remote revisions — recording
  divergent same-revision edits in `sync_conflicts`.
- "What's new" modal shown once on first launch after an update installs,
  listing the release's highlights from a curated `releaseNotes` source.
- This `CHANGELOG.md`.
- Cross-platform builds: CI now compiles, tests, and lints the Rust crate on
  Windows, macOS, and Linux, and the release workflow bundles `.dmg` (macOS)
  and `.deb`/`.AppImage` (Linux) installers alongside the Windows NSIS
  installer.

### Changed

- CI now runs `cargo clippy -D warnings` on the Rust crate alongside the
  existing tests.
- Fixed the sidebar "Update to vX" button, which stopped appearing after the
  update check began returning structured release details instead of a bare
  version string.
- Renamed the `platform/windows` module to `platform/native` to reflect that
  its foreground-app lookup and direct-paste behavior are gated per-OS rather
  than Windows-only.

## [0.1.0] - 2026

### Added

- Clipboard history with capture policies, retention, clear, and undo.
- Five destinations: Clipboard, Library, Templates, Tools, and Settings.
- Reusable snippets, commands, notes, and templates organized by projects,
  categories, and tags.
- Global full-text search plus Clipboard and Library filters.
- Templates with fillable variables.
- Grouped offline encoding, generator, text, data, regex, cron, Markdown, and
  diff tools.
- Import, export, backup, and restore.
- Sensitive-content detection and private-item safeguards.
- System tray, window-state persistence, global shortcuts, and direct paste.
- Signed application updates via GitHub Releases.

[Unreleased]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.18...HEAD
[0.1.18]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.17...v0.1.18
[0.1.17]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.16...v0.1.17
[0.1.16]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.15...v0.1.16
[0.1.15]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.14...v0.1.15
[0.1.14]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.13...v0.1.14
[0.1.13]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.12...v0.1.13
[0.1.12]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.11...v0.1.12
[0.1.11]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.10...v0.1.11
[0.1.10]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.9...v0.1.10
[0.1.9]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/AnwarHossainSR/SnipDock/releases/tag/v0.1.0
