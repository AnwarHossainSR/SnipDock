---
name: snipdock-task
description: Use when the user writes `/task N`, asks to run or continue a numbered SnipDock task, or asks for the next small implementation chunk.
---

# SnipDock Task

Implement one task, or an explicit task range when the user asks for one, update `PROGRESS.md`, and create one local commit.

## Project Files

- Plan: `enhancement-plan.md`
- Tracker: `PROGRESS.md`
- Rules: `AGENTS.md`

Resolve paths from repository root. If any file is missing, stop and name it.

## Workflow

1. Read `AGENTS.md`, `PROGRESS.md`, and the plan overview fully.
2. Parse the requested integer from `/task N`, or the explicit requested range. Never infer another task when `N` is present.
3. Reconcile task state before editing:
   - Target `[x]`: stop; task already completed.
   - Target `[~]`: treat it as legacy unfinished work; resume only when its changes are present.
   - Any other `[~]`: stop and name that unfinished task.
   - Dirty worktree with no target `[~]`: stop and list changed paths unless the user explicitly authorizes working over them.
4. Read the complete `### Task N:` section in `enhancement-plan.md`: goal, dependencies, files, work, and checks.
5. Confirm every dependency is `[x]`. If not, stop and list only missing task numbers.
6. Inspect existing files and callers before choosing the smallest correct change. Preserve unrelated user changes.
7. Record current `git status --short` as baseline. Do not reset, restore, delete, or stage unrelated user work.
8. For feature or bug logic, write the smallest failing test first unless the user explicitly asks to defer tests. For trivial config/text-only tasks, use the task's stated validation instead.
9. Implement only requested task or explicit task range. Do not begin neighboring tasks or speculative scaffolding.
10. For tasks marked `UI: yes`:
    - Use the available `frontend-design` skill before UI edits.
    - Reuse `src/styles/tokens.css` and existing components.
    - Keep SnipDock visual language: quiet neutral surfaces, one blue accent, compact desktop density, strong hierarchy, restrained borders/shadows, monospace only for code.
    - Preserve keyboard access, visible focus, semantic controls, responsive resizing, and WCAG AA contrast.
    - If app runs, inspect changed view in browser and test primary interaction.
11. Run every command under the task's `Checks` unless the user explicitly asks to skip tests/checks. Fix failures caused by this task. Report unrelated pre-existing failures without expanding scope.
12. Update target line(s) in `PROGRESS.md` to `[x]`; add date, checks, and concise changed-file list. Recalculate counts.
13. Run `git diff --check` unless the user explicitly asks to skip all checks, and inspect `git status --short`. Stage only task-owned files plus `PROGRESS.md`, then create one concise local commit.
14. Report only task number/title or range, changed files, check results, progress count, and commit hash. State that it is ready for GitHub PR review. Then stop.

## Progress States

```text
[ ] pending
[~] legacy unfinished task; never create this state
[x] completed and committed locally
```

Finish and commit one task or explicit task range before starting another.

## Boundaries

- No pushes, PR creation, branches, worktrees, or destructive Git commands unless explicitly requested.
- No dependency additions unless task explicitly authorizes them.
- No broad refactors or file moves unless task explicitly requires them.
- No bypassing failed prerequisites.
- No staging unrelated changes or committing failed task checks.
- No claiming UI verification when view was not actually inspected.
