---
name: snipdock-task
description: Implement exactly one numbered SnipDock task from enhancement-plan.md. Use when the user writes `/task N`, asks to run or continue a numbered SnipDock task, or asks for the next small implementation chunk. Track review state in PROGRESS.md, verify the change, and never stage or commit files.
---

# SnipDock Task

Implement one reviewable task. Stop after verification and user handoff.

## Project Files

- Plan: `enhancement-plan.md`
- Tracker: `PROGRESS.md`
- Rules: `AGENTS.md`

Resolve paths from repository root. If any file is missing, stop and name it.

## Workflow

1. Read `AGENTS.md`, `PROGRESS.md`, and the plan overview fully.
2. Parse the requested integer from `/task N`. Never infer another task when `N` is present.
3. Reconcile review state before editing:
   - Target `[x]`: stop; task already accepted.
   - Target `[~]`: stop; task already awaits user review.
   - Any other `[~]` with dirty worktree: stop; user must review and commit or discard it first.
   - Any other `[~]` with clean worktree: change it to `[x]` because user resolved it, then continue.
   - Dirty worktree with no `[~]`: stop and list changed paths; require a clean baseline unless user explicitly authorizes working over those changes.
4. Read the complete `### Task N:` section in `enhancement-plan.md`: goal, dependencies, files, work, and checks.
5. Confirm every dependency is `[x]`. If not, stop and list only missing task numbers.
6. Inspect existing files and callers before choosing the smallest correct change. Preserve unrelated user changes.
7. Record current `git status --short` as baseline. Do not stage, commit, reset, restore, or delete user work.
8. For feature or bug logic, write the smallest failing test first. For trivial config/text-only tasks, use the task's stated validation instead.
9. Implement only requested task. Do not begin neighboring tasks or speculative scaffolding.
10. For tasks marked `UI: yes`:
    - Use the available `frontend-design` skill before UI edits.
    - Reuse `src/styles/tokens.css` and existing components.
    - Keep SnipDock visual language: quiet neutral surfaces, one blue accent, compact desktop density, strong hierarchy, restrained borders/shadows, monospace only for code.
    - Preserve keyboard access, visible focus, semantic controls, responsive resizing, and WCAG AA contrast.
    - If app runs, inspect changed view in browser and test primary interaction.
11. Run every command under the task's `Checks`. Fix failures caused by this task. Report unrelated pre-existing failures without expanding scope.
12. Update only target line in `PROGRESS.md` from `[ ]` to `[~]`; add date, checks, and concise changed-file list. Recalculate counts.
13. Show `git diff --check` and `git status --short`. Never run `git add` or `git commit`.
14. Report only task number/title, changed files, check results, progress count, and `awaiting your review/commit`. Then stop.

## Progress States

```text
[ ] pending
[~] implemented; awaiting user review/commit
[x] accepted; worktree was clean on a later invocation
```

One `[~]` task maximum. User owns acceptance and commits.

## Boundaries

- No commits, staging, pushes, branches, worktrees, or destructive Git commands.
- No dependency additions unless task explicitly authorizes them.
- No broad refactors or file moves unless task explicitly requires them.
- No bypassing failed prerequisites.
- No marking `[x]` while task changes remain uncommitted.
- No claiming UI verification when view was not actually inspected.
