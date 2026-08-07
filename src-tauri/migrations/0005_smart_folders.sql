-- Adds smart_folders table for saved search queries.
-- Smart folders allow users to save frequently used search queries
-- and access them quickly from the sidebar.

CREATE TABLE smart_folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    query TEXT NOT NULL,  -- JSON-encoded SearchQuery
    icon TEXT DEFAULT 'folder',
    color TEXT DEFAULT '#6366f1',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX smart_folders_position_idx ON smart_folders(position);

-- Create trigger to update updated_at timestamp.
-- The WHEN clause prevents re-triggering when the trigger itself updates the row.
CREATE TRIGGER smart_folders_update_timestamp
AFTER UPDATE ON smart_folders
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE smart_folders SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = NEW.id;
END;
