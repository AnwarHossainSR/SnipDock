# snipdock-cli

CLI installer for [SnipDock](https://github.com/anomalyco/SnipDock) - A modern clipboard manager built with Tauri.

## Installation

### Using npm

```bash
npm install -g snipdock-cli
snipdock install
```

### Using npx (no install required)

```bash
npx snipdock-cli install
```

### Using bun

```bash
bun add -g snipdock-cli
snipdock install
```

### Using bunx (no install required)

```bash
bunx snipdock-cli install
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
3. Extracts to `~/.snipdock/`
4. Makes binary executable (Unix systems)

## Requirements

- Node.js >= 18
- Internet connection for downloading binaries

## Platform Support

| Platform | Architecture | Status |
|----------|--------------|--------|
| Windows | x64 | ✅ Supported |
| macOS | x64 | ✅ Supported |
| macOS | arm64 (Apple Silicon) | ✅ Supported |
| Linux | x64 | ✅ Supported |
| Linux | arm64 | ⚠️ Coming soon |

## License

MIT
