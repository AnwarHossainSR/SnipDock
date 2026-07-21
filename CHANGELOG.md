# Changelog

All notable changes to SnipDock are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Published GitHub Releases carry the authoritative, per-version notes; the
in-app **Settings → Updates** panel shows those same notes before an update is
installed.

## [Unreleased]

### Added

- **Settings → Updates** panel that checks GitHub Releases for a signed update,
  shows the available version, release date, and full release notes, and
  installs then restarts on confirmation.
- Structured update details (`version`, `notes`, `date`) returned from the
  `check_for_update` command so the UI can present release notes.
- Client-side encryption foundation for sync (`features/crypto`): Argon2id key
  derivation plus XChaCha20-Poly1305 sealing that produces the self-contained
  token stored in the `sync_records.ciphertext` column.
- This `CHANGELOG.md`.
- Cross-platform builds: CI now compiles, tests, and lints the Rust crate on
  Windows, macOS, and Linux, and the release workflow bundles `.dmg` (macOS)
  and `.deb`/`.AppImage` (Linux) installers alongside the Windows NSIS
  installer.

### Changed

- CI now runs `cargo clippy -D warnings` on the Rust crate alongside the
  existing tests.
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

[Unreleased]: https://github.com/AnwarHossainSR/SnipDock/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/AnwarHossainSR/SnipDock/releases/tag/v0.1.0
