# Data Safety: Backup, Restore, Export, and Import

Date: 2026-07-22
Status: Approved

## Scope

This design fixes the release-blocking data-safety defects before UI, native-event, sync-transport, and documentation work:

- backups silently stop at 200 items;
- backups contain only library items;
- regular exports can expose private items;
- restore imports into the live library instead of restoring the application state;
- import `replace` does not replace records;
- imports discard content types.

Cloud scheduling and its settings UI will consume the backup artifact defined here in the later UI/cloud phase. Network transport is not part of this implementation cycle.

## Backup Format and Creation

Use SQLite's native snapshot mechanism (`VACUUM INTO`) to create a consistent copy of every committed database table. This avoids the repository's 200-row search limit and automatically includes library items, projects, categories, tags, relationship tables, settings, sync records, conflict records, and future database tables.

The snapshot is wrapped in a versioned, authenticated-encryption envelope. A user-supplied backup password derives the encryption key. Scheduled backups later retrieve that password from the operating-system credential vault. Cloud credentials and the backup password remain outside the application database and are never included in a backup.

Creation uses this order:

1. Create the SQLite snapshot beside the destination as a temporary file.
2. Verify the snapshot with SQLite integrity and schema checks.
3. Encrypt the snapshot into a temporary backup envelope.
4. Flush the completed envelope to stable storage.
5. Atomically rename it to the final destination.

A failed backup leaves the previous successful backup untouched. Retention later removes old backups only after a new backup succeeds.

## Restore

Restore is full replacement, not merge:

1. Read and authenticate the encrypted envelope.
2. Decrypt into a temporary SQLite file.
3. Reject unsupported newer schemas.
4. Run SQLite integrity checks without opening the live database for writes.
5. Report the dry-run result without changing application state when requested.
6. Stage the verified database for replacement and restart the application.
7. Before normal database startup, atomically move the live database to a rollback path and move the staged database into place.
8. Open the restored database and apply supported forward migrations.
9. Delete the rollback copy only after startup succeeds; otherwise restore it automatically.

Wrong passwords, modified envelopes, corrupt databases, and unsupported schemas fail before the live database changes.

## Regular Export

Regular export remains a logical, portable format separate from full application backup.

Export retrieves every matching item by paging through repository search results within the existing 200-row limit. It compares collected rows with the reported total and fails if they differ. This removes silent truncation without weakening interactive search limits.

If any selected item is private, the entire regular export fails with a clear validation error. Private items are never silently omitted. Complete encrypted backups include private items because they remain inside the authenticated encrypted boundary.

Canonical JSON retains item IDs, kinds, content types, flags, timestamps, and organization relationships. Text and Markdown remain intentionally lossy and report warnings.

## Import

`SaveItemInput` gains a real `content_type` field. The current no-op content-type helper is removed.

Canonical JSON import uses stable item IDs. With `replace`, an imported item whose ID already exists updates that record and its relationships. External files have no stable ID, so duplicate detection continues to use matching content; `replace` updates the matched record's metadata and content type. `skip` and `keep_both` retain their current meanings.

Each non-dry-run import runs in one database transaction. Any failed row rolls back the complete import. Dry run performs the same parsing and matching and reports created, updated, and skipped counts without writes.

## Error Reporting

Errors identify the failed stage: snapshot creation, snapshot validation, encryption, destination write, authentication, schema compatibility, restore staging, database swap, migration, or import transaction. No success receipt is returned until the final atomic operation completes.

Scheduler integration later records the last successful backup and the latest error. A failed upload or local write does not advance success time or trigger retention.

## Verification

Automated checks must prove:

- a database with more than 500 items restores every item;
- projects, categories, tags, all relationships, settings, sync records, and conflicts survive backup and restore;
- private regular export fails before writing a file;
- complete encrypted backup includes private items;
- imported content types survive;
- `replace` updates the intended record;
- dry run performs no writes;
- wrong passwords, tampered envelopes, corrupt snapshots, and newer schemas are rejected;
- interrupted creation leaves the previous backup intact;
- failed restored-database startup rolls back to the original database.

Run focused Rust tests first, then the complete Rust and Bun test suites, TypeScript checks, and production build.

## Deferred Work

The following approved work remains separate, in order:

1. Clipboard reliability: direct paste, shortcut events, and startup tracking-state synchronization.
2. Clipboard and settings UI: date range, refined search and tabs, all-matching selection and bulk delete, Tools removal, external GitHub link handling, simplified settings, local/R2/S3 destinations, automatic scheduler controls, credential-vault integration, restore browsing, and retention UI.
3. Sync-metadata authentication, README corrections, and issue cleanup.
