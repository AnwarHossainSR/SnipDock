# Release Checklist

- Run `bun test`.
- Run `cargo test --manifest-path src-tauri/Cargo.toml`.
- Run `bun run build`.
- Verify Clipboard, Library, Templates, Tools, and Settings in system, light, and dark themes.
- Check global search from every destination and confirm clearing restores the active destination.
- Check wide, compact, and 22rem layouts with keyboard-only navigation and visible focus.
- Run package build on Windows with Tauri prerequisites installed.
- Launch the installed app once, sign out, and sign back in; confirm exactly one SnipDock process starts with no visible window flash.
- Open SnipDock from its tray icon, then launch it again from Start; confirm the existing window is shown and focused.
- Minimize with **Minimize to tray** enabled and disabled; confirm each behavior applies immediately and survives restart.
- Use tray **Quit** and confirm the process exits completely.
- Verify clipboard capture, snippets, templates, tools, backup/restore, and private-item safeguards.
- Scan seeded private/canary content in database and backup fixtures before production release.
- Verify fresh install, upgrade, and uninstall data-retention behavior on a clean Windows VM.
