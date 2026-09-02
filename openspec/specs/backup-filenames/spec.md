# backup-filenames Specification

## Purpose

A user glancing at the local backup folder or the R2 dashboard should be able to read the date of each backup from the filename without parsing a machine-style timestamp.

## Requirements

### Requirement: Local destination
When the `local` flag in `BackupSettings` is on, the local backup file SHALL be written into the configured local folder and SHALL be named `<YYYY-MM-DD_HH-MM-SS>_snipdock_local.sql`, where the stamp is the user's local time at the moment the run started. `<YYYY-MM-DD>` is fixed-width zero-padded; `<HH-MM-SS>` is a 24-hour clock with two-digit zero-pad. The stamp carries seconds so two runs in the same minute cannot overwrite each other.

#### Scenario: A local backup is named for the moment it was taken
- **WHEN** the user triggers **Back up now** at 3:30:00pm local on 1 September 2026 with the local destination on and the cloud destination off
- **THEN** the local folder gains `2026-09-01_15-30-00_snipdock_local.sql` and the R2 bucket is unchanged

#### Scenario: A second run in the same minute keeps both backups
- **WHEN** a second run starts in the same minute as the previous one
- **THEN** it writes its own file under a distinct name and the earlier backup is left intact

### Requirement: Cloud destination
When `settings.cloud.provider` is not `None`, the uploaded object key SHALL be `[<prefix>/]<YYYY-MM-DD_HH-MM-SS>_snipdock_r2.sql`, where `<prefix>` is `settings.cloud.prefix` with surrounding slashes trimmed and the object name appended. When the prefix is empty, the key is the bare filename.

#### Scenario: Empty prefix uploads to the bucket root
- **WHEN** the user enables R2 with an empty prefix and runs a backup at 4:02:00pm
- **THEN** the local folder gains `2026-09-01_16-02-00_snipdock_local.sql` and the R2 bucket gains `2026-09-01_16-02-00_snipdock_r2.sql` at the bucket root

#### Scenario: A prefix is applied to the object key
- **WHEN** the user sets the prefix `team/laptop` and runs a backup at 11:08:00pm
- **THEN** the R2 object lands at `team/laptop/2026-09-01_23-08-00_snipdock_r2.sql`

### Requirement: Pruning is limited to generated backups
Retention SHALL only consider files whose whole name matches the generated local shape (`<digits-dash-digits-dash-digits>_<digits-dash-digits[-dash-digits]>_snipdock_local.sql`, the optional seconds group covering files written before the stamp gained seconds), and SHALL NOT remove pre-upgrade snapshots, the `.snipdock-connection-test` probe, or any other file that merely ends in the same suffix.

#### Scenario: Retention drops the oldest generated backup
- **WHEN** the local folder holds more than `keep` files matching the generated shape and a new backup is written
- **THEN** the oldest matching file is dropped until `keep` remain

#### Scenario: Pre-upgrade snapshots and lookalike files survive
- **WHEN** the folder also holds `pre-upgrade-20260101T000000Z-schema5-to6.sqlite` and a user's own `2026-01-01_00-00_notes_snipdock_local.sql`
- **THEN** neither is considered by retention, whatever the value of `keep`

### Requirement: Encryption is unchanged
The rename SHALL NOT change how either destination is written. The local file stays a plain SQLite binary snapshot; the cloud file stays the `BackupEnvelope` JSON sealed on this machine before the request is made. The `.sql` extension in both names is for human readability only; neither file is a SQL text dump.

#### Scenario: A cloud backup is sealed before it leaves the machine
- **WHEN** a backup is uploaded to R2
- **THEN** the uploaded bytes are the sealed envelope, not a readable database or SQL text

### Requirement: The Settings panel still reports where a backup landed
The Settings → Backup and restore panel SHALL continue to show the path the backup was written to and the URL it was uploaded to, in the same form as before (`local_path` and `cloud_url` on `BackupRunReport`).

#### Scenario: A completed run names its destinations
- **WHEN** a backup run finishes with both destinations configured
- **THEN** the panel shows the local path and the cloud URL for that run
