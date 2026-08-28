# Backup And Restore

Everything below is configured in **Settings > Backup and restore**.

## What SnipDock backs up on its own

Two moments are backed up without being asked, because both are points of no return:

- **Before installing an update.** If no destination accepts a copy, the update is not installed and the reason is shown.
- **Before upgrading the database schema.** A release that ships a migration copies the database first. If that copy cannot be written, migrations do not run and SnipDock reports why rather than migrating unbacked.

Schema snapshots are written to a `backups` folder beside the database and named `pre-upgrade-<timestamp>-schema<from>-to<to>.sqlite`. The five most recent are kept. The "copies to keep" retention setting never deletes them — they are the last line of defence, not a scheduled copy.

## Destinations

A backup run takes one snapshot and writes it to every destination that is turned on. A destination that fails does not cancel the others; the run only fails if nothing was written anywhere.

**This computer** keeps a plain SQLite file in the folder you choose, or in the `backups` folder beside the database when the field is left empty. It is unencrypted because it never leaves the machine, which also means any SQLite tool can open it if SnipDock itself will not start. Older copies past "copies to keep" are deleted.

**Amazon S3 or Cloudflare R2** uploads the same snapshot sealed in the encrypted envelope described below. Encryption happens on this computer before any request is made, so the bucket only ever holds ciphertext and the password never leaves the device — which is why setting a provider requires a backup password.

R2 needs the account endpoint, `https://<account>.r2.cloudflarestorage.com`, and always signs as region `auto`. S3 needs a region, or an endpoint for an S3-compatible service. Endpoints must be HTTPS. **Test connection** writes a small object and deletes it again, so a wrong key or a missing bucket is caught in Settings rather than at the first scheduled run.

Access keys and the backup password are stored in SnipDock's local settings database. Use a key scoped to write to one bucket. "Copies to keep" applies to local files only; set a lifecycle rule on the bucket to age out old uploads.

## Schedule

**Manual** runs only when you press **Back up now**. **Daily** and **Weekly** run while SnipDock is open, and catch up on the next launch if the machine was off when one was due — a week offline owes one backup, not seven. Turning a schedule on backs up immediately rather than promising one in 24 hours.

## The encrypted backup format

A backup is a consistent snapshot of the complete SQLite database, wrapped in authenticated encryption. It includes clipboard and library items, private items, projects, categories, tags, relationships, settings, trash receipts, activity, sync staging records, and conflicts.

The JSON backup format accepts SQLite snapshots up to 128 MiB. SnipDock checks the size before reading or encrypting the snapshot so malformed or unexpectedly large backups cannot cause unbounded memory use.

**Export an encrypted backup file** produces one of these on demand, for a USB stick or another machine. SnipDock never stores that file's password.

## Restoring

Local backups and pre-upgrade snapshots are listed under **Backups on this computer**, newest first, with the automatic ones labelled. Restoring one stages it and restarts.

**Restore from a backup file** takes an encrypted backup — one downloaded from a bucket, or exported earlier — and its password. Dry-run restore decrypts the backup, authenticates it, checks its SQLite integrity, and verifies schema compatibility without changing application data.

A full restore replaces the complete application database. SnipDock stages the verified database, restarts, and swaps it into place before normal startup. The previous database remains available as a rollback copy until the restored database opens and migrations succeed. Failed startup restores the previous database automatically.

## What is not a backup

Regular JSON, Markdown, and text exports are not application backups. JSON retains item metadata but not all application tables. Markdown and text are intentionally lossy. Regular export rejects private items; use an encrypted backup for them.
