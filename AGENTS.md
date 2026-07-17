# SnipDock Agent Rules

- `/task N` means use the project-local `snipdock-task` skill.
- Implement exactly one numbered task from `enhancement-plan.md`.
- Read and maintain `PROGRESS.md` for task state.
- After verification, update `PROGRESS.md`, stage only task-owned changes, and create one local commit.
- Never push, open a PR, use destructive Git commands, or create a worktree unless the user explicitly asks. User reviews through GitHub PRs.
- Use Bun for frontend installs, scripts, and tooling; never use npm, yarn, pnpm, or direct Node.js commands.
- Keep changes small. Reuse existing code, native APIs, and installed dependencies before adding code or packages.
- Fix root cause. Inspect callers before changing shared behavior.
- UI must stay clean, compact, professional, keyboard accessible, and consistent with `src/styles/tokens.css`.
- Preserve unrelated user changes. Finish and commit the current task before starting another.
