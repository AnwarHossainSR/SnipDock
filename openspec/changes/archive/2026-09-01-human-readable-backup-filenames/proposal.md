# Human-readable backup filenames

## Why

SnipDock already runs scheduled and on-demand backups to a local folder and to
a Cloudflare R2 bucket. The current filename pattern was chosen to be
machine-sortable (`%Y%m%dT%H%M%SZ` UTC) and is prefixed by the module that
produced the file (`backup-` for local, `snipdock-` for the cloud envelope).
That is fine for retention, but it is opaque in `ls`, in the R2 dashboard, and
in the row the Settings panel prints after a run. Users asked for a
human-readable date in the filename so the date is obvious at a glance on both
the local file and the uploaded object.

## What changes

- Local copies use `<YYYY-MM-DD_HH-MM-SS>_snipdock_local.sql` instead of
  `backup-<stamp>.sqlite`.
- Cloud/R2 uploads use `<YYYY-MM-DD_HH-MM-SS>_snipdock_r2.sql` instead of
  `snipdock-<stamp>.snipdock`.
- The local time used for the filename is the user's local time at the moment
  the run started, not UTC, so the date in the filename matches the clock on
  the wall and the timestamp the Settings panel shows.
- Encryption, retention, and the underlying snapshot pipeline are **unchanged**
  (per the user's "keep encryption, rename only" answer).

## Non-goals

- No change to what gets backed up, the encryption format, the retention
  count, the schedule, the trigger, or the upload mechanics.
- No change to the pre-upgrade snapshots in `auto_backup_dir`; those are
  written by a different code path and are not user-facing filenames.
- No change to the `.snipdock-connection-test` probe key used by the
  "Test connection" button in Settings.

## A note on the `.sql` extension

The user's chosen pattern is `<...>_snipdock_local.sql` / `<...>_snipdock_r2.sql`,
but:

- The **local** file is a plain SQLite binary (from
  `Repository::snapshot_to`, which uses SQLite's online backup API). It is a
  `.sqlite` file in disguise; opening it as a SQL text dump will not work.
- The **cloud** file is the existing `BackupEnvelope` JSON wrapped in a
  `crypto_secretstream` ciphertext. It is not SQL text either.

The user explicitly answered "Keep encryption, rename only" when offered
"replace the encrypted envelope with a plain `.sql` text dump", so this change
keeps both formats intact and only renames the files. The `.sql` extension
will be technically misleading; if the user later wants a real text dump, it
will be a separate task that adds a new Tauri command (likely a
`dump_to_sql_text` helper that uses `sqlite3_db_dump_v2` via the existing
rusqlite connection).

## Affected files (implementation)

- `src-tauri/src/features/backup.rs`
  - `LOCAL_PREFIX` and `LOCAL_EXTENSION` change to drive the new name and the
    `prune_local` filter.
  - `CLOUD_EXTENSION` changes accordingly; `object_key` builds the new name.
  - New `local_timestamp(now: chrono::DateTime<chrono::Local>) -> String`
    helper that formats the new name suffix.
  - `run_backup` calls the local-time helper and uses the new prefix/ext.
  - `object_key` uses the same helper for the cloud path.
  - Tests for the new naming + the prune filter updated to match.
- `enhancement-plan.md` — add task 14.
- `PROGRESS.md` — task 14 row.

## Capability spec

See `specs/backup-filenames/spec.md`.
