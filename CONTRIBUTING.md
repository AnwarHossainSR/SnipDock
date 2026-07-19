# Contributing to SnipDock

Thanks for helping improve SnipDock.

## Before You Start

- Search existing issues before opening another.
- Use the bug or feature issue form.
- Keep each pull request focused on one problem.
- Discuss large behavior or architecture changes in an issue first.

## Local Setup

Follow the requirements and clone instructions in [README.md](README.md). Use Bun for every frontend install and script.

```powershell
bun install --frozen-lockfile
bun run tauri dev
```

## Checks

Run checks relevant to the change before opening a pull request:

```powershell
bun test
bun run lint
bun run build
cargo test --manifest-path src-tauri/Cargo.toml
```

UI changes should include before/after screenshots. Rust changes should include focused tests when behavior changes.

## Pull Requests

- Explain what changed and why.
- Link the related issue.
- Record exact verification commands and results.
- Update user-facing documentation when behavior changes.
- Do not mix formatting, refactoring, or dependency updates with unrelated work.
- Confirm no secrets, personal clipboard data, generated output, or build artifacts are committed.

## Commit Messages

Use short imperative messages with a conventional prefix when practical, such as `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, or `build:`.

## Recommended Branch Protection

Repository maintainers should configure the default branch in GitHub settings to:

- Require pull requests before merging.
- Require the `Frontend` and `Rust` status checks.
- Dismiss stale pull-request approvals after new commits.
- Block force pushes.
- Prevent branch deletion.

These settings are maintained on GitHub and are not enforced by files in this repository.
