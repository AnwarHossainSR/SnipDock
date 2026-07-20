# Signed Automatic Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On every normal production launch, securely install a newer signed SnipDock alpha release and restart automatically while hidden sign-in launches remain offline.

**Architecture:** Use the Rust-only Tauri updater plugin with a pure launch gate and GitHub-hosted signed update artifacts. Keep updater artifact generation release-only and copy generated `latest.json` to a permanent rolling prerelease so alpha releases retain prerelease semantics.

**Tech Stack:** Tauri 2 updater plugin, Rust async runtime, GitHub Actions, `tauri-apps/tauri-action@v1`, GitHub CLI, NSIS.

## Global Constraints

- Update checks run only for normal non-debug launches.
- Newer valid updates download, install, and restart without prompting.
- Hidden `--hidden` launches make no updater request.
- Network, manifest, signature, download, and install failures leave the current app running.
- Tauri signature verification stays mandatory; private key never enters Git history or logs.
- Alpha GitHub releases remain prereleases.
- Local unsigned `bun run build:app` remains usable.
- Never push or create a PR.

---

### Task 1: Signing key and updater configuration

**Files:**
- Create outside repository: `C:\Users\Craftsmen\.tauri\snipdock-updater.key`
- Create outside repository: `C:\Users\Craftsmen\.tauri\snipdock-updater.key.pub`
- Create: `src-tauri/tauri.updater.conf.json`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`

**Interfaces:**
- Produces: updater public key embedded in base configuration.
- Produces: `https://github.com/AnwarHossainSR/SnipDock/releases/download/updater-alpha/latest.json` endpoint.
- Produces: release-only `bundle.createUpdaterArtifacts: true` overlay.

- [x] **Step 1: Generate updater keypair outside repository**

Completed during planning with:

```powershell
New-Item -ItemType Directory -Force -Path 'C:\Users\Craftsmen\.tauri' | Out-Null
bun run tauri signer generate --ci --write-keys 'C:\Users\Craftsmen\.tauri\snipdock-updater.key'
```

Private key remains outside the repository and was not printed.

- [ ] **Step 2: Verify and preserve generated keypair**

Run:

```powershell
Test-Path -LiteralPath 'C:\Users\Craftsmen\.tauri\snipdock-updater.key'
Get-Content -Raw -LiteralPath 'C:\Users\Craftsmen\.tauri\snipdock-updater.key.pub'
```

Expected: `True` and this exact public key:

```text
dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEMxNTg5ODBBMEUyNkU0NDcKUldSSDVDWU9DcGhZd2NZMzdpdEJwYUdHZnZUSFE0MTgrVjhIZWZxTUhmajJscUVydlJsam1uNUQK
```

Never regenerate or overwrite this key after any updater-enabled build ships.

- [ ] **Step 3: Add updater dependency**

Add beside `tauri-plugin-autostart` in the existing desktop target table:

```toml
tauri-plugin-updater = "2"
```

Run `cargo check --manifest-path src-tauri/Cargo.toml` to resolve `Cargo.lock`.

- [ ] **Step 4: Configure updater verification and endpoint**

Add to base `src-tauri/tauri.conf.json`:

```json
"plugins": {
  "updater": {
    "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEMxNTg5ODBBMEUyNkU0NDcKUldSSDVDWU9DcGhZd2NZMzdpdEJwYUdHZnZUSFE0MTgrVjhIZWZxTUhmajJscUVydlJsam1uNUQK",
    "endpoints": [
      "https://github.com/AnwarHossainSR/SnipDock/releases/download/updater-alpha/latest.json"
    ],
    "windows": {
      "installMode": "passive"
    }
  }
}
```

Create `src-tauri/tauri.updater.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "bundle": {
    "createUpdaterArtifacts": true
  }
}
```

- [ ] **Step 5: Validate configuration and local build isolation**

Run:

```powershell
bun run tauri build --no-bundle
bun run build:app
```

Expected: both commands pass without `TAURI_SIGNING_PRIVATE_KEY`, proving base local builds do not request updater artifacts.

- [ ] **Step 6: Commit public configuration only**

Confirm `git status --short` does not show either key, then run:

```powershell
git add -- src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json src-tauri/tauri.updater.conf.json
git commit -m "feat: configure signed updates"
```

---

### Task 2: Manual-launch update installation

**Files:**
- Modify: `src-tauri/src/app/mod.rs`

**Interfaces:**
- Produces: `fn should_check_for_updates(background_launch: bool, debug_build: bool) -> bool`.
- Produces: desktop-only `async fn install_available_update(app: tauri::AppHandle) -> tauri_plugin_updater::Result<()>`.

- [ ] **Step 1: Write failing launch-gate test**

Add to the existing `app::tests` module:

```rust
#[test]
fn updates_run_only_for_manual_production_launches() {
    assert!(super::should_check_for_updates(false, false));
    assert!(!super::should_check_for_updates(true, false));
    assert!(!super::should_check_for_updates(false, true));
}
```

- [ ] **Step 2: Verify RED**

Run `cargo test --manifest-path src-tauri/Cargo.toml app::tests::updates_run_only_for_manual_production_launches`.

Expected: compilation fails because `should_check_for_updates` does not exist.

- [ ] **Step 3: Implement updater gate and task**

Add:

```rust
fn should_check_for_updates(background_launch: bool, debug_build: bool) -> bool {
    !background_launch && !debug_build
}
```

Under desktop cfg, import `tauri_plugin_updater::UpdaterExt`, initialize `.plugin(tauri_plugin_updater::Builder::new().build())`, and add:

```rust
#[cfg(desktop)]
async fn install_available_update(
    app: tauri::AppHandle,
) -> tauri_plugin_updater::Result<()> {
    if let Some(update) = app.updater()?.check().await? {
        update.download_and_install(|_, _| {}, || {}).await?;
        app.restart();
    }
    Ok(())
}
```

At the end of setup, after normal window visibility is established:

```rust
#[cfg(desktop)]
if should_check_for_updates(background_launch, cfg!(debug_assertions)) {
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = install_available_update(handle).await {
            eprintln!("Automatic update failed: {error}");
        }
    });
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml app::tests::updates_run_only_for_manual_production_launches
cargo test --manifest-path src-tauri/Cargo.toml app::tests::hidden_argument_selects_background_launch
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: commands pass. Tests perform no network requests.

- [ ] **Step 5: Commit runtime updater**

```powershell
git add -- src-tauri/src/app/mod.rs
git commit -m "feat: install updates on manual launch"
```

---

### Task 3: Signed release and rolling alpha manifest

**Files:**
- Modify: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: Task 1 private key via GitHub secret `TAURI_SIGNING_PRIVATE_KEY`.
- Produces: signed NSIS asset, `.sig`, versioned `latest.json`, and rolling `updater-alpha/latest.json`.

- [ ] **Step 1: Store private key in GitHub Actions**

Verify authentication without exposing credentials:

```powershell
gh auth status
```

Then set the repository secret without printing key content:

```powershell
Get-Content -Raw -LiteralPath 'C:\Users\Craftsmen\.tauri\snipdock-updater.key' | gh secret set TAURI_SIGNING_PRIVATE_KEY --repo AnwarHossainSR/SnipDock
```

Expected: GitHub CLI confirms secret creation. Back up the private key offline before publishing the next release.

- [ ] **Step 2: Configure signed release artifacts**

Add signing env to `tauri-action`:

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
```

Add these action inputs:

```yaml
updaterJsonPreferNsis: true
uploadUpdaterJson: true
args: --bundles nsis --config src-tauri/tauri.updater.conf.json
```

Keep `releaseDraft: false` and `prerelease: true`.

- [ ] **Step 3: Publish rolling manifest**

Add after `tauri-action`:

```yaml
      - name: Publish rolling alpha updater manifest
        shell: pwsh
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          $version = (Get-Content -Raw package.json | ConvertFrom-Json).version
          $manifest = Join-Path $env:RUNNER_TEMP "latest.json"
          gh release download "v$version" --pattern latest.json --output $manifest
          gh release view updater-alpha *> $null
          if ($LASTEXITCODE -ne 0) {
            gh release create updater-alpha --prerelease --latest=false --title "SnipDock Alpha Updater" --notes "Rolling signed updater manifest. Install versioned releases instead."
          }
          gh release upload updater-alpha $manifest --clobber
```

- [ ] **Step 4: Validate workflow structure**

Run:

```powershell
Get-Content -Raw .github/workflows/release.yml
git diff --check
```

Confirm updater inputs are under `with`, signing values under `env`, and rolling step is after `tauri-action`.

- [ ] **Step 5: Commit release pipeline**

```powershell
git add -- .github/workflows/release.yml
git commit -m "ci: publish signed updater manifest"
```

---

### Task 4: Privacy, release checks, and full verification

**Files:**
- Modify: `README.md`
- Modify: `docs/privacy.md`
- Modify: `docs/release-checklist.md`

**Interfaces:**
- Documents: GitHub-only updater traffic, signing-key custody, rolling manifest, and two-version acceptance test.

- [ ] **Step 1: Correct privacy claims**

Replace README's zero-network claim with:

```markdown
SnipDock keeps core data local. Normal production launches contact GitHub Releases only to check for and download signed application updates; clipboard and library content is never sent. Private items remain restricted from export. See the [privacy model](docs/privacy.md).
```

Append to `docs/privacy.md`:

```markdown
Normal production launches contact GitHub Releases over HTTPS to check for and download signed SnipDock updates. Hidden Windows sign-in launches do not check for updates. Update requests contain application version and platform metadata, never clipboard text, library content, templates, settings, or backups.
```

- [ ] **Step 2: Add release acceptance checks**

Add to `docs/release-checklist.md`:

```markdown
- Confirm `TAURI_SIGNING_PRIVATE_KEY` exists in GitHub Actions and its private key has an offline backup.
- Confirm each versioned prerelease contains the NSIS installer, matching `.sig`, and `latest.json`.
- Confirm `updater-alpha` contains the same `latest.json` as the newest versioned prerelease.
- Install release N, publish N+1, manually launch N, and confirm it installs then restarts into N+1 automatically.
- Launch with `--hidden` and confirm no updater request occurs.
```

- [ ] **Step 3: Run complete verification**

Run:

```powershell
bun test
bun run lint
bun run build
cargo test --manifest-path src-tauri/Cargo.toml
bun run build:app
```

Expected: all commands exit 0. Local NSIS build succeeds without signing environment variables.

- [ ] **Step 4: Record external verification boundary**

Do not claim end-to-end update success until two signed releases have been published. Report secret creation and local configuration separately from the pending N-to-N+1 release test.

- [ ] **Step 5: Commit documentation**

```powershell
git add -- README.md docs/privacy.md docs/release-checklist.md
git commit -m "docs: document automatic updates"
```
