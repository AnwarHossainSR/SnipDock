# SnipDock Privacy

SnipDock is local-first. Clipboard text, settings, exports, and backups stay on the device unless the user explicitly moves an exported file elsewhere, or configures a cloud backup destination.

Private and sensitive records are marked for redaction and protected workflows. Private records cannot leave the local export boundary.

Automatic capture skips content that scans as a high-risk secret, so it never reaches the history. Saving an item by hand is an explicit act and is never discarded: content that scans as a secret is stored, marked private, and shown masked until it is revealed for the session.

Cloud backup is off by default and does nothing until an S3 or R2 bucket and its credentials are entered in Settings. Once configured, SnipDock uploads database snapshots to that bucket on the schedule set there. Snapshots are sealed with the configured backup password on the device before any request is made, so the bucket receives ciphertext and the password never leaves the machine. Credentials are stored in the local settings database and are excluded from exports and from the backups themselves. See the [backup model](backup-restore.md).

Normal production launches contact GitHub Releases over HTTPS to check for and download signed SnipDock updates. Hidden sign-in launches do not check for updates. Update requests contain application version and platform metadata, never clipboard text, settings, exports, or backups.
