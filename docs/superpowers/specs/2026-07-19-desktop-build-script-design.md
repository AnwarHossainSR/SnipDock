# Desktop Build Script Design

## Goal

Add one Bun command that builds the frontend and Windows Tauri executable without copying artifacts or generating an installer.

## Design

Add this package script:

```json
"build:app": "bun run tauri build --no-bundle"
```

Tauri already runs `build.beforeBuildCommand` from `src-tauri/tauri.conf.json`, which invokes the existing `bun run build` frontend command. The new command therefore performs one frontend production build followed by the optimized Rust application build without duplicating commands or creating recursion.

The executable remains at the conventional path:

```text
src-tauri/target/release/snipdock.exe
```

## Constraints

- Keep the existing frontend-only `bun run build` command unchanged.
- Do not copy files into a root `release` directory.
- Do not generate NSIS or MSI installers.
- Add no dependencies or helper scripts.

## Verification

Run `bun run build:app` and confirm `src-tauri/target/release/snipdock.exe` exists.
