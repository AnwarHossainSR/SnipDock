# Changelog

All notable changes to SnipDock are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Published GitHub Releases carry the authoritative, per-version notes; the
in-app **Settings → Updates** panel shows those same notes before an update is
installed.

## [Unreleased]

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

[Unreleased]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.7...HEAD
[0.1.7]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/AnwarHossainSR/SnipDock/releases/tag/v0.1.0
