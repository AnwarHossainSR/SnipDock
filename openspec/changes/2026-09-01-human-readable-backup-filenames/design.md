# Design — Human-readable backup filenames

## Filename shape

Local: `<YYYY-MM-DD_HH-MM>_snipdock_local.sql`
Cloud: `<YYYY-MM-DD_HH-MM>_snipdock_r2.sql`

`<YYYY-MM-DD_HH-MM>` is the local-time stamp at the moment the run started.
For a run that started at 3:30pm local on 1 September 2026:

- Local file: `2026-09-01_15-30_snipdock_local.sql`
- R2 object: `2026-09-01_15-30_snipdock_r2.sql`

Lexical order is still chronological because the date component is fixed-width
and zero-padded. The hour and minute use a 24-hour clock with two-digit
zero-pad so filenames sort in the same order as they were written.

## Why local time, not UTC

- The current pattern (`20260828T101500Z`) sorts in any timezone and survives
  the device moving, but it is not what the user sees on the wall clock or in
  the Settings panel's "Last backup" line.
- The Settings panel already formats the run's `last_run_at` in local time
  via the same `formatDateTime` helper the rest of the app uses. Matching
  that in the filename makes the two views agree.
- A backup scheduled for "2am local" still produces a filename with the
  user's local date, which matches what they would expect to see in the
  R2 dashboard.

## Where the timestamp is computed

- `src-tauri/src/features/backup.rs` exposes a `local_timestamp` helper that
  takes `chrono::DateTime<chrono::Local>` and returns
  `format!("{date}_{time}", date = "%Y-%m-%d", time = "%H-%M")`.
- `run_backup` calls `let stamp = local_timestamp(chrono::Local::now());`
  once at the top, then uses the same `stamp` for the local target, the
  cloud object key, and the staging file. A single stamp per run means
  the two destinations never disagree about when the backup happened.
- The `staging-` file in `auto_backup_dir` is still random-UUID-named; only
  the user-visible names follow the new pattern.

## Why keep the existing format and just rename

- Encryption: the cloud envelope is `BackupEnvelope` JSON sealed with
  `crypto_secretstream`. Renaming only is one line in `object_key`; doing a
  real `.sql` text dump would mean a second snapshot path and a different
  restore path.
- Retention: `prune_local` already filters by `LOCAL_PREFIX` and
  `LOCAL_EXTENSION`. Updating both keeps the filter correct in one place.
- Tests: the existing retention and naming tests assert on the file
  pattern; updating them in the same change is the smallest correct
  follow-on.

## Open questions for the implementer

- The user's chosen pattern uses `.sql` for both files even though neither
  is a SQL text dump. If the user later wants a real text dump, that is a
  separate task and should add a `dump_as_sql` helper, not change this one.
- The local-time stamp loses sortability across timezones if a user moves
  their laptop across timezones mid-day. That is acceptable; the previous
  UTC pattern was correct across timezones but unreadable, and the user
  asked for human-readable.
