# Runtime Settings Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make persisted clipboard tracking, retention, and ignore settings control startup and subsequent captures without restarting.

**Architecture:** Convert persisted `Settings` into one cloneable, lock-backed `CapturePolicy` shared by capture, cleanup, and settings commands. Apply runtime state only after repository persistence succeeds; keep the Clipboard page Pause command temporary and independent.

**Tech Stack:** Rust 2021, Tauri 2 managed state, `std::sync::RwLock`, Tokio integration tests, React 19, Bun 1.3.14.

## Global Constraints

- Persisted settings are the single source of truth for capture policy after startup.
- Invalid persistence must not change runtime policy or monitor state.
- Stricter retention prunes on the next capture or daily cleanup, not while a number input is mid-edit.
- Lock poisoning must not panic the clipboard worker.
- Use existing dependencies and existing repository validation.
- Use Bun for frontend scripts; never npm, yarn, pnpm, or direct Node.js commands.

---

### Task 1: Shared mutable capture policy

**Files:**
- Modify: `src-tauri/src/features/clipboard/capture.rs`
- Modify: `src-tauri/tests/clipboard_policy.rs`

**Interfaces:**
- Produces: `impl From<&Settings> for CaptureSettings`.
- Produces: cloneable `CapturePolicy` with `update(&self, CaptureSettings) -> Result<(), regex::Error>` and `settings(&self) -> CaptureSettings`.
- Preserves: `CapturePolicy::new(CaptureSettings) -> Result<CapturePolicy, regex::Error>` and `ClipboardCapture::new(...)`.

- [ ] **Step 1: Write failing conversion and update tests**

Add to `src-tauri/tests/clipboard_policy.rs`:

```rust
use snipdock_lib::models::Settings;

#[test]
fn persisted_settings_are_the_capture_defaults() {
    let settings = Settings::default();
    let capture = CaptureSettings::from(&settings);

    assert_eq!(capture.history_days, settings.history_days);
    assert_eq!(capture.max_items, settings.max_items);
    assert_eq!(capture.ignored_apps, settings.ignored_apps);
    assert_eq!(capture.ignored_patterns, settings.ignored_patterns);
    assert_eq!(capture.ignored_content_types, settings.ignored_content_types);
}

#[tokio::test]
async fn policy_update_changes_subsequent_capture_rules() {
    let path = database_path("runtime-update");
    let database = Database::open(&path).await.unwrap();
    let policy = CapturePolicy::new(settings()).unwrap();
    let capture = ClipboardCapture::new(
        Repository::new(database.pool().clone()),
        FakeForegroundApp(None),
        policy.clone(),
    );
    let mut updated = settings();
    updated.max_items = 42;
    updated.ignored_patterns = vec!["blocked".into()];

    policy.update(updated).unwrap();

    assert_eq!(policy.settings().max_items, 42);
    assert_eq!(
        capture
            .capture("blocked".into(), ContentType::PlainText)
            .await
            .unwrap(),
        CaptureOutcome::Ignored(CaptureIgnoreReason::Pattern)
    );
    cleanup(database, path).await;
}
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --test clipboard_policy persisted_settings_are_the_capture_defaults
cargo test --manifest-path src-tauri/Cargo.toml --test clipboard_policy policy_update_changes_subsequent_capture_rules
```

Expected: compilation fails because the conversion, `Clone`, `update`, and `settings` do not exist.

- [ ] **Step 3: Implement shared policy state**

In `capture.rs`, import `Settings`, `Arc`, and `RwLock`. Replace policy storage with:

```rust
impl From<&Settings> for CaptureSettings {
    fn from(settings: &Settings) -> Self {
        Self {
            history_days: settings.history_days,
            max_items: settings.max_items,
            ignored_apps: settings.ignored_apps.clone(),
            ignored_patterns: settings.ignored_patterns.clone(),
            ignored_content_types: settings.ignored_content_types.clone(),
        }
    }
}

impl Default for CaptureSettings {
    fn default() -> Self {
        Self::from(&Settings::default())
    }
}

struct CapturePolicyState {
    settings: CaptureSettings,
    ignored_patterns: Vec<Regex>,
}

#[derive(Clone)]
pub struct CapturePolicy {
    state: Arc<RwLock<CapturePolicyState>>,
}
```

Compile before replacing state:

```rust
fn compile(settings: CaptureSettings) -> Result<CapturePolicyState, regex::Error> {
    let ignored_patterns = settings
        .ignored_patterns
        .iter()
        .map(|pattern| Regex::new(pattern))
        .collect::<Result<_, _>>()?;
    Ok(CapturePolicyState { settings, ignored_patterns })
}

pub fn new(mut settings: CaptureSettings) -> Result<Self, regex::Error> {
    settings.history_days = settings.history_days.max(1);
    settings.max_items = settings.max_items.max(1);
    Ok(Self {
        state: Arc::new(RwLock::new(compile(settings)?)),
    })
}

pub fn update(&self, mut settings: CaptureSettings) -> Result<(), regex::Error> {
    settings.history_days = settings.history_days.max(1);
    settings.max_items = settings.max_items.max(1);
    let state = compile(settings)?;
    *self.state.write().unwrap_or_else(|error| error.into_inner()) = state;
    Ok(())
}

pub fn settings(&self) -> CaptureSettings {
    self.state
        .read()
        .unwrap_or_else(|error| error.into_inner())
        .settings
        .clone()
}
```

Change `ignore_reason` to read `self.state` once and use `state.settings` plus `state.ignored_patterns`. In `capture`, snapshot `let settings = self.policy.settings();` immediately before pruning and pass its two retention values.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --test clipboard_policy
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: all clipboard policy tests and Cargo check pass.

- [ ] **Step 5: Commit policy synchronization primitive**

```powershell
git add -- src-tauri/src/features/clipboard/capture.rs src-tauri/tests/clipboard_policy.rs
git commit -m "fix: share runtime capture policy"
```

---

### Task 2: Apply stored settings at startup

**Files:**
- Modify: `src-tauri/src/app/mod.rs`

**Interfaces:**
- Consumes: Task 1's `CaptureSettings::from`, cloneable `CapturePolicy`, and `settings()` snapshot.
- Produces: startup monitor state and cleanup behavior derived from persisted `Settings`.

- [ ] **Step 1: Replace startup defaults with stored policy**

After loading `settings`, construct:

```rust
let capture_policy = CapturePolicy::new(CaptureSettings::from(&settings))?;
let retention = capture_policy.settings();
```

Use `retention.max_items` and `retention.history_days` for initial cleanup. Clone `capture_policy` into the daily task and read a fresh `settings()` snapshot after each sleep before calling `cleanup_retention`.

Pass `capture_policy.clone()` into `ClipboardCapture::new`. After `ClipboardMonitor::start`, call:

```rust
if !settings.clipboard_tracking {
    monitor.pause();
}
```

Manage the shared policy with `app.manage(capture_policy);` before registering commands.

- [ ] **Step 2: Verify startup wiring**

Run:

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --test clipboard_policy
cargo test --manifest-path src-tauri/Cargo.toml --test clipboard_monitor
```

Expected: commands exit 0; no hardcoded `CaptureSettings::default()` remains in `src-tauri/src/app/mod.rs`.

- [ ] **Step 3: Commit startup synchronization**

```powershell
git add -- src-tauri/src/app/mod.rs
git commit -m "fix: restore capture settings on startup"
```

---

### Task 3: Apply successful saves to runtime state

**Files:**
- Modify: `src-tauri/src/commands/settings.rs`
- Modify: `src-tauri/tests/settings.rs`
- Modify: `src/features/settings/SettingsPage.tsx`

**Interfaces:**
- Changes: `actions::save_settings(repository, preferences, monitor, capture_policy, input)`.
- Consumes: `AppState::clipboard_monitor()` and managed `State<CapturePolicy>`.
- Preserves: Clipboard page's direct `set_clipboard_tracking` command for temporary pause.

- [ ] **Step 1: Expand failing settings integration test**

In `src-tauri/tests/settings.rs`, define a clipboard stub and build a monitor:

```rust
use snipdock_lib::clipboard::{CapturePolicy, CaptureSettings, ClipboardMonitor, TextClipboard};
use std::{sync::Arc, time::Duration};

struct EmptyClipboard;

impl TextClipboard for EmptyClipboard {
    fn read_text(&self) -> Option<String> {
        None
    }
}
```

In the existing test, create:

```rust
let monitor = ClipboardMonitor::start(
    Arc::new(EmptyClipboard),
    Duration::from_secs(60),
    |_| {},
);
let policy = CapturePolicy::new(CaptureSettings::default()).unwrap();
let patch = SettingsPatch {
    values: BTreeMap::from([
        ("minimize_to_tray".into(), false.into()),
        ("clipboard_tracking".into(), false.into()),
        ("max_items".into(), 42.into()),
        ("ignored_patterns".into(), vec!["blocked"].into()),
    ]),
};
```

Call the expanded action:

```rust
let saved = actions::save_settings(
    &repository,
    &preferences,
    &monitor,
    &policy,
    patch,
)
.await
.unwrap();
```

Then assert:

```rust
assert!(monitor.is_paused());
assert_eq!(policy.settings().max_items, 42);
assert_eq!(policy.settings().ignored_patterns, vec!["blocked"]);
```

- [ ] **Step 2: Verify RED**

Run `cargo test --manifest-path src-tauri/Cargo.toml --test settings`.

Expected: compilation fails because `save_settings` does not accept monitor or policy.

- [ ] **Step 3: Apply runtime state after persistence**

Expand `actions::save_settings` parameters with `monitor: &ClipboardMonitor` and `capture_policy: &CapturePolicy`. Keep repository save first, then:

```rust
preferences.set_minimize_to_tray(settings.minimize_to_tray);
capture_policy
    .update(CaptureSettings::from(&settings))
    .map_err(|error| AppError::new(ErrorCode::Validation, error.to_string()))?;
if settings.clipboard_tracking {
    monitor.resume();
} else {
    monitor.pause();
}
```

Add `capture_policy: State<'_, CapturePolicy>` to the Tauri command and pass `state.clipboard_monitor()` plus `&capture_policy` to the action.

In `SettingsPage.tsx`, replace the tracking change handler with:

```tsx
onChange={(event) => update("clipboard_tracking", event.target.checked)}
```

- [ ] **Step 4: Verify GREEN and regression coverage**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --test settings
cargo test --manifest-path src-tauri/Cargo.toml --test clipboard_policy
bun test src/features/settings/SettingsPage.test.tsx src/features/clipboard/ClipboardPage.test.tsx
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: all commands pass.

- [ ] **Step 5: Commit runtime settings application**

```powershell
git add -- src-tauri/src/commands/settings.rs src-tauri/tests/settings.rs src/features/settings/SettingsPage.tsx
git commit -m "fix: apply saved capture settings immediately"
```
