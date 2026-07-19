# Desktop Build Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one Bun command that builds the frontend and optimized Windows Tauri executable.

**Architecture:** Keep the current frontend-only `build` script because Tauri invokes it through `beforeBuildCommand`. Add `build:app` as the desktop entry point; Tauri runs the frontend build once, then compiles Rust without installer bundling.

**Tech Stack:** Bun 1.3.14, Vite 8, TypeScript 7, Rust, Tauri 2.

## Global Constraints

- Keep the existing frontend-only `bun run build` command unchanged.
- Do not copy files into a root `release` directory.
- Do not generate NSIS or MSI installers.
- Add no dependencies or helper scripts.

---

### Task 1: Add Desktop Build Command

**Files:**
- Modify: `package.json`
- Verify: `src-tauri/target/release/snipdock.exe`

**Interfaces:**
- Consumes: Existing `tauri` package script and `build.beforeBuildCommand` configuration.
- Produces: `bun run build:app` command and optimized Windows executable.

- [ ] **Step 1: Confirm the command does not exist**

```bash
bun run build:app
```

Expected: Bun reports that script `build:app` is not found.

- [ ] **Step 2: Add the package script**

Add this entry under `scripts`, leaving every existing script unchanged:

```json
"build:app": "bun run tauri build --no-bundle"
```

- [ ] **Step 3: Build and verify the executable**

```bash
bun run build:app
test -f src-tauri/target/release/snipdock.exe
```

Expected: frontend production build succeeds, Rust release build succeeds, and the executable check exits `0`.

- [ ] **Step 4: Check and commit**

```bash
git diff --check
git add package.json
git commit -m "build: add desktop application command"
```
