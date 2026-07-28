# snipdock

CLI installer for [SnipDock](https://github.com/AnwarHossainSR/SnipDock) - A modern clipboard manager built with Tauri.

## Installation

### Using npm

```bash
npm install -g snipdock
snipdock install
```

### Using npx (no install required)

```bash
npx snipdock install
```

### Using bun

```bash
bun add -g snipdock
snipdock install
```

### Using bunx (no install required)

```bash
bunx snipdock install
```

## Commands

| Command | Description |
|---------|-------------|
| `snipdock install` | Download and install SnipDock |
| `snipdock run` | Launch SnipDock |
| `snipdock update` | Update to latest version |
| `snipdock uninstall` | Remove SnipDock |
| `snipdock version` | Show current version |
| `snipdock help` | Show help message |

## How It Works

1. Detects your OS (Windows/macOS/Linux) and architecture (x64/arm64)
2. Downloads the pre-built Tauri binary from GitHub Releases
3. Verifies the download against a published SHA-256 checksum
4. Extracts to `~/.snipdock/`
5. Makes binary executable (Unix systems)

> Checksum verification requires a `.sha256` file alongside the release
> asset. Releases published before this check was added do not have one;
> install the latest CLI and update to the latest SnipDock release.

## Requirements

- Node.js >= 18
- Internet connection for downloading binaries

## Platform Support

| Platform | Architecture | Status |
|----------|--------------|--------|
| Windows | x64 | ✅ Supported |
| macOS | arm64 (Apple Silicon) | ✅ Supported |
| macOS | x64 | ⚠️ Coming soon |
| Linux | x64 | ✅ Supported |
| Linux | arm64 | ⚠️ Coming soon |

## License

MIT
