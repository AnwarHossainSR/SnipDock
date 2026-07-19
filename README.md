# SnipDock

Windows-first, offline clipboard and snippet manager built with Tauri 2,
React, TypeScript, and Rust.

## Prerequisites

- Bun 1.3.14+
- Stable Rust with the MSVC toolchain
- Tauri's Windows prerequisites, including WebView2

## Development

```powershell
bun install
bun run dev
bun test
bun run build
bun run lint
bun run tauri dev
```

Rust checks run separately:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

SnipDock has no network plugin or network capability. Core data stays local.

## Current Scope

- Text clipboard history, snippets, templates, developer tools, transfer, backup, activity, reminders, private flags, lock UI, and opt-in AI/sync boundaries are present.
- AI and sync stay disabled by default. Current AI action uses a fake local provider boundary; current sync status makes no network requests.
- Encrypted private storage is scaffolded for the security release path; production hardening still needs full verification.

## Documentation

- Privacy model: `docs/privacy.md`
- Backup and restore: `docs/backup-restore.md`
- Keyboard shortcuts: `docs/keyboard-shortcuts.md`
- Release checklist: `docs/release-checklist.md`
