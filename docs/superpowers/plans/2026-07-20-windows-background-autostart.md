# Windows Background Autostart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start SnipDock automatically at Windows user sign-in, hidden and capturing clipboard content in the tray, while keeping normal launches visible and runtime minimize behavior synchronized with settings.

**Architecture:** Use the official Rust-side Tauri autostart plugin with a private `--hidden` argument. Keep the configured window hidden until Rust decides whether the launch is interactive, and route persisted window preferences into both initial and live runtime state.

**Tech Stack:** Tauri 2, Rust 2021, `tauri-plugin-autostart`, React 19, TypeScript 7, Bun 1.3.14.

## Global Constraints

- Target Windows 10 or later; autostart means per-user Windows sign-in, not a pre-login Windows service.
- Keep autostart permanently enabled; do not expose an on/off setting.
- Autostart launches must not flash the main window.
- Manual launches must show the main window; normal second launches must raise the existing window.
- Hidden second-instance launches must not change existing window visibility.
- Tray Show, Hide, and Quit behavior must remain intact.
- Use Bun for frontend installs, scripts, and tooling; never npm, yarn, pnpm, or direct Node.js commands.
- Preserve unrelated user changes and add no dependency beyond the official autostart plugin.

---

### Task 1: Launch-mode policy and hidden-first window lifecycle

**Files:**
- Modify: `src-tauri/src/app/mod.rs`
- Modify: `src-tauri/tauri.conf.json`

**Interfaces:**
- Produces: `fn is_background_launch<I, S>(args: I) -> bool` where `I: IntoIterator<Item = S>` and `S: AsRef<str>`.
- Produces: first and second launch visibility policy consumed by Task 2's autostart `--hidden` argument.

- [ ] **Step 1: Write failing launch-policy tests**

Append this test module to `src-tauri/src/app/mod.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::is_background_launch;

    #[test]
    fn hidden_argument_selects_background_launch() {
        assert!(is_background_launch(["SnipDock.exe", "--hidden"]));
        assert!(!is_background_launch(["SnipDock.exe"]));
        assert!(!is_background_launch(["SnipDock.exe", "--hidden-window"]));
    }
}
```

- [ ] **Step 2: Run test and verify RED**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml app::tests::hidden_argument_selects_background_launch
```

Expected: compilation fails because `is_background_launch` does not exist.

- [ ] **Step 3: Implement launch parsing and visibility routing**

Add this function near the app constants in `src-tauri/src/app/mod.rs`:

```rust
fn is_background_launch<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter().any(|arg| arg.as_ref() == "--hidden")
}
```

Capture first-launch mode before building Tauri:

```rust
let background_launch = is_background_launch(std::env::args());
```

Change the single-instance callback to inspect its supplied arguments:

```rust
builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
    if !is_background_launch(args) {
        show_main_window(app);
    }
}));
```

Replace the unconditional startup event emission at the end of setup with:

```rust
if !background_launch {
    show_main_window(app.handle());
}
```

Set the main window to hidden-first in `src-tauri/tauri.conf.json`:

```json
"visible": false
```

Place this property beside the existing window size properties.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml app::tests::hidden_argument_selects_background_launch
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: test and check pass.

- [ ] **Step 5: Commit launch lifecycle**

```powershell
git add -- src-tauri/src/app/mod.rs src-tauri/tauri.conf.json
git commit -m "feat: support hidden background launches"
```

---

### Task 2: Mandatory Windows autostart registration

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/src/app/mod.rs`

**Interfaces:**
- Consumes: Task 1's exact `--hidden` launch policy.
- Produces: per-user autostart registration through `tauri_plugin_autostart::ManagerExt`.

- [ ] **Step 1: Add official plugin dependency**

Add this target dependency to `src-tauri/Cargo.toml`:

```toml
[target.'cfg(any(target_os = "macos", windows, target_os = "linux"))'.dependencies]
tauri-plugin-autostart = "2"
```

Run `cargo check --manifest-path src-tauri/Cargo.toml`. Expected: `Cargo.lock` records the resolved autostart packages and the command exits 0.

- [ ] **Step 2: Initialize the plugin with the hidden launch argument**

Add this import to `src-tauri/src/app/mod.rs`:

```rust
#[cfg(desktop)]
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
```

Inside the desktop builder block:

```rust
builder = builder.plugin(tauri_plugin_autostart::init(
    MacosLauncher::LaunchAgent,
    Some(vec!["--hidden"]),
));
```

- [ ] **Step 3: Enforce autostart registration during setup**

At the beginning of setup, add:

```rust
#[cfg(desktop)]
{
    let autostart = app.autolaunch();
    if !autostart.is_enabled()? {
        autostart.enable()?;
    }
}
```

Plugin setup or registration errors propagate with `?` through Tauri setup so existing `report_startup_failure` handles them. Do not add frontend bindings or capability permissions because registration is Rust-only and not user-toggleable.

- [ ] **Step 4: Verify autostart integration**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml app::tests::hidden_argument_selects_background_launch
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: both commands pass with no warning introduced by autostart code.

- [ ] **Step 5: Commit autostart integration**

```powershell
git add -- src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/app/mod.rs
git commit -m "feat: enable Windows autostart"
```

---

### Task 3: Synchronize minimize-to-tray persistence and runtime

**Files:**
- Create: `src-tauri/tests/settings.rs`
- Modify: `src-tauri/src/app/mod.rs`
- Modify: `src-tauri/src/commands/settings.rs`
- Modify: `src-tauri/src/models/settings.rs`
- Modify: `src/api/types.ts`
- Modify: `src/features/settings/SettingsPage.test.tsx`

**Interfaces:**
- Changes: `actions::save_settings(repository: &Repository, preferences: &WindowPreferences, input: SettingsPatch) -> Result<Settings, AppError>`.
- Consumes: stored `Settings::minimize_to_tray` during setup.
- Removes: unused `Settings::start_with_os` and TypeScript `Settings.start_with_os`.

- [ ] **Step 1: Write failing runtime synchronization test**

Create `src-tauri/tests/settings.rs`:

```rust
mod support;

use snipdock_lib::{
    commands::actions,
    db::Database,
    models::SettingsPatch,
    os::WindowPreferences,
    repository::Repository,
};
use std::collections::BTreeMap;

#[tokio::test]
async fn saving_minimize_to_tray_updates_runtime_preference() {
    let path = std::env::temp_dir().join(format!(
        "snipdock-settings-{}.sqlite",
        uuid::Uuid::new_v4()
    ));
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let preferences = WindowPreferences::new(true, true);
    let patch = SettingsPatch {
        values: BTreeMap::from([("minimize_to_tray".into(), false.into())]),
    };

    let saved = actions::save_settings(&repository, &preferences, patch)
        .await
        .unwrap();

    assert!(!saved.minimize_to_tray);
    assert!(!preferences.minimize_to_tray());
    support::remove_database(database, path).await;
}
```

- [ ] **Step 2: Run test and verify RED**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --test settings
```

Expected: compilation fails because `actions::save_settings` does not accept `WindowPreferences`.

- [ ] **Step 3: Update settings command and startup initialization**

Change `src-tauri/src/commands/settings.rs` action signature and body:

```rust
pub async fn save_settings(
    repository: &Repository,
    preferences: &WindowPreferences,
    input: SettingsPatch,
) -> Result<Settings, AppError> {
    let settings = repository.save_settings(input).await.map_err(repository_error)?;
    preferences.set_minimize_to_tray(settings.minimize_to_tray);
    Ok(settings)
}
```

Import `crate::os::WindowPreferences`. Add `preferences: State<'_, WindowPreferences>` to the Tauri command and pass `&preferences` into the action.

In `src-tauri/src/app/mod.rs`, load settings after constructing `Repository`:

```rust
let settings = tauri::async_runtime::block_on(repository.get_settings())
    .map_err(|error| std::io::Error::other(error.to_string()))?;
```

Replace `app.manage(WindowPreferences::default());` with:

```rust
app.manage(WindowPreferences::new(true, settings.minimize_to_tray));
```

Remove `start_with_os` from the Rust settings struct/default, TypeScript interface, and frontend test fixture. Serde ignores the old stored key, preserving existing settings documents.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --test settings
bun test src/features/settings/SettingsPage.test.tsx
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: all commands pass.

- [ ] **Step 5: Commit settings synchronization**

```powershell
git add -- src-tauri/tests/settings.rs src-tauri/src/app/mod.rs src-tauri/src/commands/settings.rs src-tauri/src/models/settings.rs src/api/types.ts src/features/settings/SettingsPage.test.tsx
git commit -m "fix: apply tray preference at runtime"
```

---

### Task 4: Release checks and full verification

**Files:**
- Modify: `docs/release-checklist.md`

**Interfaces:**
- Consumes: Tasks 1-3 behavior.
- Produces: repeatable Windows sign-in and tray acceptance checks.

- [ ] **Step 1: Add lifecycle acceptance checks**

Add these bullets to `docs/release-checklist.md` under Windows package verification:

```markdown
- Launch the installed app once, sign out, and sign back in; confirm exactly one SnipDock process starts with no visible window flash.
- Open SnipDock from its tray icon, then launch it again from Start; confirm the existing window is shown and focused.
- Minimize with **Minimize to tray** enabled and disabled; confirm each behavior applies immediately and survives restart.
- Use tray **Quit** and confirm the process exits completely.
```

- [ ] **Step 2: Run complete automated verification**

Run:

```powershell
bun test
bun run lint
bun run build
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all commands exit 0 with no new warnings.

- [ ] **Step 3: Build Windows installer**

Run:

```powershell
bun run build:app
```

Expected: command exits 0 and writes the NSIS installer below `src-tauri/target/release/bundle/nsis/`.

- [ ] **Step 4: Record manual verification boundary**

If sign-out/sign-in cannot be safely automated in the current session, report the four release-checklist items as pending manual verification. Do not claim autostart was end-to-end verified without performing them.

- [ ] **Step 5: Commit release checks**

```powershell
git add -- docs/release-checklist.md
git commit -m "docs: add background startup release checks"
```
