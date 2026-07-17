# SnipDock Agent Rules

- `/task N` means use the project-local `snipdock-task` skill.
- Implement exactly one numbered task from `enhancement-plan.md`.
- Read and maintain `PROGRESS.md` for task state.
- Never run `git add`, `git commit`, `git push`, destructive Git commands, or create a worktree. User reviews and commits.
- Use Bun for frontend installs, scripts, and tooling; never use npm, yarn, pnpm, or direct Node.js commands.
- Keep changes small. Reuse existing code, native APIs, and installed dependencies before adding code or packages.
- Fix root cause. Inspect callers before changing shared behavior.
- UI must stay clean, compact, professional, keyboard accessible, and consistent with `src/styles/tokens.css`.
- Preserve unrelated user changes. Stop if previous task still awaits review.
