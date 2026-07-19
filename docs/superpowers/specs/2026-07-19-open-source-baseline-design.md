# Open-Source Repository Baseline Design

## Goal

Prepare SnipDock for public collaboration with clear project documentation, contribution rules, issue and pull-request forms, and continuous integration. Keep release publishing manual until packaging and security checks are complete.

## Repository Documentation

- Expand `README.md` with product purpose, current capabilities, screenshots placeholder, prerequisites, development commands, desktop build instructions, project status, privacy guarantees, documentation links, contribution guidance, and license information.
- Add an MIT `LICENSE` owned by Anwar Hossain.
- Add `CONTRIBUTING.md` covering setup, Bun-only frontend commands, Rust checks, focused changes, tests, commit expectations, and pull-request workflow.
- Add `CODE_OF_CONDUCT.md` using the Contributor Covenant 2.1 text and a maintainer contact path through GitHub.
- Add `SECURITY.md` defining supported versions, private vulnerability reporting through GitHub Security Advisories, and exclusions for public issues.

## GitHub Collaboration Files

- Add YAML issue forms for reproducible bug reports and focused feature requests.
- Add a configuration file disabling blank issues and linking security reports to the security policy.
- Add a concise pull-request template with summary, verification, screenshots for UI changes, and a safety checklist.
- Add Dependabot configuration for weekly GitHub Actions, Bun, and Cargo dependency updates.

## Continuous Integration

Add one GitHub Actions workflow for pushes and pull requests. Use separate frontend and Rust jobs so failures remain clear.

Frontend job:

1. Check out source.
2. Install Bun 1.3.14 with dependency caching.
3. Install locked dependencies with `bun install --frozen-lockfile`.
4. Run `bun test`, `bun run lint`, and `bun run build`.

Rust job:

1. Run on Windows because SnipDock is Windows-first and Tauri links Windows APIs.
2. Check out source and install the stable Rust toolchain.
3. Cache Cargo artifacts.
4. Run `cargo test --manifest-path src-tauri/Cargo.toml`.

Workflow permissions remain read-only. No secrets, deployment, signing, packaging, or publishing steps are included.

## Repository Rules

Document recommended GitHub branch protection in `CONTRIBUTING.md`: require pull requests, require both CI jobs, dismiss stale approvals, block force pushes, and prevent branch deletion. These settings cannot be enforced by committed files alone and must be enabled in GitHub repository settings.

## Verification

- Validate workflow and form YAML syntax.
- Run frontend tests, type checking, and production build locally.
- Run Rust tests locally.
- Check all Markdown links and referenced paths.
- Inspect the staged diff to ensure existing cleanup changes remain separate.

## Deferred Scope

- Automated releases and generated changelogs.
- Code signing and artifact publication.
- Coverage services, status badges, and third-party bots.
- Funding, governance, and maintainer-team documents.

Add these only when the project begins publishing verified builds or gains multiple active maintainers.
