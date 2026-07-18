# Backup And Restore

Use Settings > Manual backup and restore.

Backups write a versioned local JSON envelope with a checksum. Restore validates the manifest and checksum before importing records.

Plain exports are convenient but lossy. JSON export is the canonical format for retaining SnipDock metadata.

Restore currently imports backup records into the library. It does not silently overwrite the active database.
