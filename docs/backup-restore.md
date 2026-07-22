# Backup And Restore

Use Settings > Manual backup and restore. Choose a new `.backup` path and a password. SnipDock never stores the password in its database.

A backup is a consistent snapshot of the complete SQLite database, wrapped in authenticated encryption. It includes clipboard and library items, private items, projects, categories, tags, relationships, settings, trash receipts, activity, sync staging records, and conflicts. Cloud credentials and backup passwords are excluded.

Dry-run restore decrypts the backup, authenticates it, checks its SQLite integrity, and verifies schema compatibility without changing application data.

A full restore replaces the complete application database. SnipDock stages the verified database, restarts, and swaps it into place before normal startup. The previous database remains available as a rollback copy until the restored database opens and migrations succeed. Failed startup restores the previous database automatically.

Regular JSON, Markdown, and text exports are not application backups. JSON retains item metadata but not all application tables. Markdown and text are intentionally lossy. Regular export rejects private items; use an encrypted backup for them.
