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
