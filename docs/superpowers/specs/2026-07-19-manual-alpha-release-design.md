# Manual Alpha Release Workflow Design

## Goal

Add a manually triggered GitHub Actions workflow that builds SnipDock's Windows NSIS installer and creates a draft prerelease for the committed application version.

## Version Contract

Set the initial alpha version to `0.1.0-alpha.1`. Keep the version synchronized in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`.

The workflow reads the committed version and fails before building when the package, Cargo, and Tauri configuration versions differ. The workflow does not edit or commit repository files.

## Trigger And Safety

Use `workflow_dispatch` with no version input. A maintainer updates and commits the version before triggering the workflow. This keeps the source commit, application metadata, installer filename, Git tag, and GitHub Release version reproducible.

Grant `contents: write` only to the release job because creating a tag and GitHub Release requires it. Do not run on pull requests or untrusted code. Use release concurrency to prevent two manual release runs from publishing the same version simultaneously.

## Build And Release

Run on `windows-latest` with Bun 1.3.14 and stable Rust. Install locked dependencies, run frontend tests, type checking, production build, and locked Rust tests, then use `tauri-apps/tauri-action@v1` to build the NSIS bundle.

Create tag `v__VERSION__` and release name `SnipDock v__VERSION__`. Generate release notes and set both `releaseDraft: true` and `prerelease: true`. The maintainer downloads and tests the installer before manually publishing the draft.

## Documentation

Add concise README instructions for bumping every version field, committing the bump, manually running the Release workflow, testing the draft asset, and publishing it.

## Verification

- Validate the synchronized version locally.
- Run frontend and Rust checks.
- Confirm workflow permissions, trigger, draft flag, prerelease flag, tag, and NSIS arguments.
- Confirm YAML and diff formatting.

## Deferred Scope

Windows code signing, automatic updates, MSI packaging, automatic public publishing, and automatic version commits remain deferred.
