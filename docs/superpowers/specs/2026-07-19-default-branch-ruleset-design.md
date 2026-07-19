# Default Branch Ruleset Design

## Goal

Protect SnipDock's default branch for public contributions while allowing repository owner `AnwarHossainSR` to bypass protections when necessary.

## Design

- Add an importable repository ruleset JSON at the repository root.
- Target `~DEFAULT_BRANCH` so protection follows GitHub's configured default branch.
- Give GitHub user `AnwarHossainSR` (ID `43861146`) an `always` bypass.
- Require pull requests, one approval, code-owner review, resolved review threads, and squash merging for all other users.
- Add `.github/CODEOWNERS` assigning all files to `@AnwarHossainSR`.
- Require the existing `Frontend` and `Rust` CI status checks with strict update-before-merge behavior.
- Require linear history and block branch deletion and force pushes.

## Deliberate Omissions

- No signed-commit requirement until release signing practices exist.
- No deployment or code-scanning requirement because those checks do not exist.
- No role-wide administrator bypass; bypass belongs only to the repository owner.

## Verification

- Parse the JSON with PowerShell `ConvertFrom-Json`.
- Assert expected owner, target, CI contexts, rules, and CODEOWNERS entry.
- Import through GitHub: **Settings > Rules > Rulesets > New ruleset > Import a ruleset**, review, then create.
