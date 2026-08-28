# SnipDock

SnipDock is a cross-platform, offline clipboard manager built with Tauri 2, React, TypeScript, and Rust. It captures searchable clipboard history and keeps it on your device. Windows supports direct paste into the previously focused app; macOS and Linux copy the selected item and ask you to paste it manually.

> SnipDock is under active development. Review the [release checklist](docs/release-checklist.md) before treating a build as production-ready.

## Features

- Clipboard history with capture policies, retention, clear, and undo
- Clipboard and Settings destinations
- Full-text clipboard search plus code, pinned, and favorite filters
- System-wide Quick Paste: direct paste on Windows, copy/manual paste on macOS and Linux
- Import, export, backup, and restore, with scheduled backups to a local folder, Amazon S3, or Cloudflare R2
- Automatic backups before an update installs and before a database schema upgrade
- Sensitive-content detection and private-item safeguards
- System tray, window-state persistence, startup launch, and signed updates

## Privacy

SnipDock keeps core data local. Normal production launches contact GitHub Releases only to check for and download signed application updates; clipboard and library content is never sent. Cloud backup is off unless a bucket is configured, and uploads are encrypted on the device before they leave it. Private items remain restricted from export. See the [privacy model](docs/privacy.md).

## Requirements

- One of: Windows 10 or later, macOS 12 or later, or a Linux distribution with GTK 3 and WebKit2GTK 4.1
- [Bun 1.3.14](https://bun.sh/) or later
- Stable Rust (MSVC toolchain on Windows)
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform — Microsoft Edge WebView2 on Windows, or `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`, and `patchelf` on Linux

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

Frontend styling uses Tailwind CSS v4 utilities and shadcn/ui primitives.
`src/styles/tokens.css` remains the palette and theme source; the CSS-first
bridge in `src/styles/theme.css` exposes those values to Tailwind.

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

Version history is recorded in [CHANGELOG.md](CHANGELOG.md). GitHub generates published release notes, and both the update prompt and the in-app **Settings → Updates** panel show those notes before an update is installed. The release body is what users read, so write it there rather than in the app.

Stable releases use the manual **Release** workflow in GitHub Actions:

1. Run `bun run version X.Y.Z` to synchronize `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, and `CHANGELOG.md`.
2. Commit and push the version change.
3. Open **Actions → Release → Run workflow** on GitHub.
4. Download and test the installers attached to the published release.
5. Confirm the rolling `updater-alpha` manifest matches the stable release for legacy clients.

Updater artifacts carry Tauri update signatures. Windows Authenticode signing remains unconfigured, so Explorer and SmartScreen may still identify installers as unsigned.

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
