# Release Checklist

- Run `bun test`.
- Run `cargo test --manifest-path src-tauri/Cargo.toml`.
- Run `bun run build`.
- Run package build on Windows with Tauri prerequisites installed.
- Verify clipboard capture, snippets, templates, tools, backup/restore, reminders, lock, AI consent, and disabled sync.
- Confirm AI/sync disabled state creates no network traffic.
- Scan seeded private/canary content in database and backup fixtures before production release.
- Verify fresh install, upgrade, and uninstall data-retention behavior on a clean Windows VM.
