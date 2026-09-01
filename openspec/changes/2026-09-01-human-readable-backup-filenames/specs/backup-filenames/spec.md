# Backup filenames — capability spec

## Purpose

A user glancing at the local backup folder or the R2 dashboard should be able
to read the date of each backup from the filename without parsing a
machine-style timestamp.

## Requirements

### Local destination

When the `local` flag in `BackupSettings` is on, the local backup file MUST
be written into the folder returned by
`crate::features::backup::local_backup_dir(&settings, &database_path)` and
MUST be named:

```
<YYYY-MM-DD_HH-MM>_snipdock_local.sql
```

where `<YYYY-MM-DD_HH-MM>` is the user's local-time timestamp at the moment
the run started. `<YYYY-MM-DD>` is fixed-width zero-padded; `<HH-MM>` is a
24-hour clock with two-digit zero-pad.

### Cloud destination

When `settings.cloud.provider` is not `None`, the uploaded object key MUST
be:

```
[<prefix>/]<YYYY-MM-DD_HH-MM>_snipdock_r2.sql
```

where `<prefix>` is `settings.cloud.prefix` with surrounding slashes trimmed
and the new object name appended. If `<prefix>` is empty, the key is just
the bare filename.

### Pruning

`prune_local` MUST only consider files whose name starts with the local
prefix shape (`<digits-dash-digits-dash-digits>_<digits-dash-digits>_snipdock_local.sql`)
and MUST NOT remove pre-upgrade snapshots or the `.snipdock-connection-test`
probe.

### Encryption

Encryption is unchanged. The local file is a plain SQLite binary snapshot
written by `Repository::snapshot_to`. The cloud file is the existing
`BackupEnvelope` JSON sealed with `crypto_secretstream`. The `.sql`
extension in both names is for human readability only; neither file is a
SQL text dump.

### Settings panel

The Settings → Backup and restore panel MUST continue to show the path the
backup was written to and the URL it was uploaded to, in the same form as
before (a `local_path` and a `cloud_url` on `BackupRunReport`).

## Scenarios

- A user triggers **Back up now** at 3:30pm local on 1 September 2026 with
  the local destination on and the cloud destination off. The local folder
  gains `2026-09-01_15-30_snipdock_local.sql`. The R2 bucket is unchanged.
- The same user enables R2 with an empty prefix and runs again at 4:02pm.
  The local folder gains `2026-09-01_16-02_snipdock_local.sql` and the R2
  bucket gains `2026-09-01_16-02_snipdock_r2.sql` at the bucket root.
- The same user sets a prefix `team/laptop` and runs again at 11:08pm.
  The R2 object lands at `team/laptop/2026-09-01_23-08_snipdock_r2.sql`.
- The local folder already contains three pre-upgrade snapshots named
  `pre-upgrade-20260101T000000Z-schema5-to6.sqlite` etc. After the next
  run with `keep = 7`, the new file is added and the oldest non-matching
  file is dropped once there are more than seven files matching the new
  pattern. The pre-upgrade snapshots are never considered.
