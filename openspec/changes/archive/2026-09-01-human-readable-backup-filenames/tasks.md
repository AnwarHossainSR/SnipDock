# Tasks

Single-task change. Implements one new task in the SnipDock enhancement
plan, tracked separately so the existing
`2026-09-01-power-features-and-quick-paste-transforms` change is not
polluted with a rename of an existing file format.

## 14. Human-readable backup filenames

- [x] 14.1 In `src-tauri/src/features/backup.rs`, replace `LOCAL_PREFIX` and
      `LOCAL_EXTENSION` with the new human-readable shape
      (`<YYYY-MM-DD_HH-MM-SS>_snipdock_local.sql`) and update `prune_local`'s
      filter to match
- [x] 14.2 In `src-tauri/src/features/backup.rs`, replace `CLOUD_EXTENSION`
      and `object_key`'s naming so the cloud upload lands at
      `<YYYY-MM-DD_HH-MM-SS>_snipdock_r2.sql` under the configured prefix
- [x] 14.3 Add a `local_timestamp(now: chrono::DateTime<chrono::Local>) -> String`
      helper that formats `<YYYY-MM-DD_HH-MM-SS>`; call it once in `run_backup`
      and reuse the same stamp for the cloud upload so both destinations
      agree
- [x] 14.4 Update the existing `object_keys_sit_under_the_prefix_when_there_is_one`
      and `retention_keeps_the_newest_and_never_touches_upgrade_snapshots`
      tests to assert the new pattern; add a small unit test for
      `local_timestamp` covering midnight, single-digit hour, and minute
      padding
- [x] 14.5 Add an entry to `enhancement-plan.md` (Task 14 row) and
      `PROGRESS.md` (task 14 row + a Checks block) once the implementation
      is committed

### Checks

- `cargo test --manifest-path src-tauri/Cargo.toml` — green
- `cargo build --manifest-path src-tauri/Cargo.toml` — clean
- `git diff --check` — clean
