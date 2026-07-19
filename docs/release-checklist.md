# Release Checklist

- Run `bun test`.
- Run `cargo test --manifest-path src-tauri/Cargo.toml`.
- Run `bun run build`.
- Verify Clipboard, Library, Templates, Tools, and Settings in system, light, and dark themes.
- Check global search from every destination and confirm clearing restores the active destination.
- Check wide, compact, and 22rem layouts with keyboard-only navigation and visible focus.
- Run package build on Windows with Tauri prerequisites installed.
- Verify clipboard capture, snippets, templates, tools, backup/restore, and private-item safeguards.
- Scan seeded private/canary content in database and backup fixtures before production release.
- Verify fresh install, upgrade, and uninstall data-retention behavior on a clean Windows VM.
