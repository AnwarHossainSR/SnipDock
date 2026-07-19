# NSIS Build Script Design

## Goal

Make `bun run build:app` produce both the raw SnipDock executable and a normal Windows setup executable.

## Chosen Approach

Change `build:app` to run `bun run tauri build --bundles nsis`. Tauri will keep the compiled application under `src-tauri/target/release/` and create the installer under `src-tauri/target/release/bundle/nsis/`.

NSIS-only bundling is preferred over the default all-target build because SnipDock is Windows-first and one installer format keeps builds faster and simpler. MSI can be added later if distribution requirements demand it.

## Documentation

Update the README build section to describe both outputs and clarify that generated installers are unsigned.

## Verification

Run `bun run build:app`, confirm it exits successfully, and verify that `src-tauri/target/release/bundle/nsis/` contains a `*-setup.exe` file.

## Deferred Scope

Code signing, GitHub Releases, automatic updates, and MSI packaging remain separate release tasks.
