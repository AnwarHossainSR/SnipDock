# SnipDock

SnipDock is a Windows-first, offline clipboard and snippet manager built with Tauri 2, React, TypeScript, and Rust. It keeps core data local and combines clipboard history, reusable snippets, templates, search, organization, and developer utilities in one desktop app.

> SnipDock is under active development. Review the [release checklist](docs/release-checklist.md) before treating a build as production-ready.

## Features

- Clipboard history with capture policies, retention, clear, and undo
- Reusable snippets organized by projects, categories, and tags
- Full-text search and filters
- Templates with fillable variables
- JSON, code-formatting, codec, regex, cron, Markdown, and diff tools
- Import, export, backup, and restore
- Activity, reminders, sensitive-content detection, private flags, and lock UI
- System tray, window-state persistence, global shortcuts, and direct paste

AI and sync boundaries are present but disabled by default. The current AI action uses a fake local provider, and sync makes no network requests.

## Privacy

SnipDock has no network plugin or network capability. Core data stays on the local device. Private-storage encryption exists as a security-release scaffold and still requires production hardening and verification. See the [privacy model](docs/privacy.md).

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

Create an unpackaged desktop application build:

```powershell
bun run build:app
```

Output is written under `src-tauri/target/release/`. Signed installers are not published yet.

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
