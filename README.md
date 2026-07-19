# SnipDock

SnipDock is a Windows-first, offline clipboard and snippet manager built with Tauri 2, React, TypeScript, and Rust. It keeps core data local and combines clipboard history, reusable snippets, templates, search, organization, and developer utilities in one desktop app.

> SnipDock is under active development. Review the [release checklist](docs/release-checklist.md) before treating a build as production-ready.

## Features

- Clipboard history with capture policies, retention, clear, and undo
- Five focused destinations: Clipboard, Library, Templates, Tools, and Settings
- Reusable snippets, commands, notes, and templates organized by projects, categories, and tags
- Global full-text search plus Clipboard and Library filters
- Templates with fillable variables
- Grouped offline encoding, generator, text, data, regex, cron, Markdown, and diff tools
- Import, export, backup, and restore
- Sensitive-content detection and private-item safeguards
- System tray, window-state persistence, global shortcuts, and direct paste

## Privacy

SnipDock has no network plugin or network capability. Core data stays on the local device. Private items remain restricted from export. See the [privacy model](docs/privacy.md).

## Requirements

- Windows 10 or later
- [Bun 1.3.14](https://bun.sh/) or later
- Stable Rust with the MSVC toolchain
- [Tauri prerequisites for Windows](https://v2.tauri.app/start/prerequisites/), including Microsoft Edge WebView2

## Development

```powershell
git clone https://github.com/AnwarHossainSR/SnipDock.git
cd SnipDock
bun install --frozen-lockfile
bun run tauri dev
```

Frontend-only development:

```powershell
bun run dev
```

## Verification

```powershell
bun test
bun run lint
bun run build
cargo test --manifest-path src-tauri/Cargo.toml
```

## Build

Create the desktop application and Windows setup installer:

```powershell
bun run build:app
```

The application executable is written under `src-tauri/target/release/`. The unsigned NSIS `*-setup.exe` installer is written under `src-tauri/target/release/bundle/nsis/`.

## Release

Alpha releases use the manual **Release** workflow in GitHub Actions:

1. Set the same version in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json` using the `X.Y.Z-alpha.N` format.
2. Commit and push the version change.
3. Open **Actions → Release → Run workflow** on GitHub.
4. Download and test the installer attached to the generated draft prerelease.
5. Publish the draft manually after verification.

Release installers remain unsigned until Windows code signing is configured.

## Documentation

- [Keyboard shortcuts](docs/keyboard-shortcuts.md)
- [Backup and restore](docs/backup-restore.md)
- [Privacy model](docs/privacy.md)
- [Release checklist](docs/release-checklist.md)

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), follow the [Code of Conduct](CODE_OF_CONDUCT.md), and use the repository issue forms before opening a pull request.

Security vulnerabilities must follow [SECURITY.md](SECURITY.md), not public issues.

## License

Licensed under the [MIT License](LICENSE).
