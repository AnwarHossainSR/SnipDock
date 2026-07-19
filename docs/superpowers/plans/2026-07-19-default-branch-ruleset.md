# Default Branch Ruleset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an importable GitHub ruleset and owner-wide CODEOWNERS policy for SnipDock's default branch.

**Architecture:** One root JSON file defines repository rules and the sole owner bypass. One GitHub-native CODEOWNERS file makes the required review specifically belong to `AnwarHossainSR`.

**Tech Stack:** GitHub repository rulesets, CODEOWNERS, JSON, PowerShell

## Global Constraints

- Target `~DEFAULT_BRANCH`.
- Owner `AnwarHossainSR` (GitHub user ID `43861146`) may always bypass.
- Other users require one code-owner approval plus passing `Frontend` and `Rust` checks.
- Allow squash merge only; block deletion and force pushes.
- Add no dependency and change no workflow.

---

### Task 1: Default branch protection

**Files:**
- Create: `branch-protection-ruleset.json`
- Create: `.github/CODEOWNERS`

**Interfaces:**
- Consumes: GitHub status contexts `Frontend` and `Rust` from `.github/workflows/ci.yml`
- Produces: GitHub-importable repository ruleset and repository-wide code ownership

- [ ] **Step 1: Add CODEOWNERS**

```text
* @AnwarHossainSR
```

- [ ] **Step 2: Add ruleset JSON**

```json
{
  "name": "Protect default branch",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [
    {
      "actor_id": 43861146,
      "actor_type": "User",
      "bypass_mode": "always"
    }
  ],
  "conditions": {
    "ref_name": {
      "include": ["~DEFAULT_BRANCH"],
      "exclude": []
    }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    {
      "type": "pull_request",
      "parameters": {
        "allowed_merge_methods": ["squash"],
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": true,
        "require_last_push_approval": true,
        "required_approving_review_count": 1,
        "required_review_thread_resolution": true
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "do_not_enforce_on_create": true,
        "required_status_checks": [
          { "context": "Frontend" },
          { "context": "Rust" }
        ],
        "strict_required_status_checks_policy": true
      }
    }
  ]
}
```

- [ ] **Step 3: Validate files**

Run:

```powershell
$ruleset = Get-Content -Raw branch-protection-ruleset.json | ConvertFrom-Json
if ($ruleset.conditions.ref_name.include -notcontains '~DEFAULT_BRANCH') { throw 'Default branch target missing' }
if ($ruleset.bypass_actors[0].actor_id -ne 43861146) { throw 'Owner bypass missing' }
if (($ruleset.rules | Where-Object type -eq 'required_status_checks').parameters.required_status_checks.context -notcontains 'Frontend') { throw 'Frontend check missing' }
if (($ruleset.rules | Where-Object type -eq 'required_status_checks').parameters.required_status_checks.context -notcontains 'Rust') { throw 'Rust check missing' }
if ((Get-Content -Raw .github/CODEOWNERS).Trim() -ne '* @AnwarHossainSR') { throw 'CODEOWNERS mismatch' }
```

Expected: exit code `0`, no output.

- [ ] **Step 4: Review diff**

Run:

```powershell
git diff --check
git diff -- branch-protection-ruleset.json .github/CODEOWNERS
```

Expected: no whitespace errors; diff contains only approved ruleset and CODEOWNERS files.

- [ ] **Step 5: Commit**

```powershell
git add branch-protection-ruleset.json .github/CODEOWNERS
git commit -m "chore: add default branch protection ruleset"
```
