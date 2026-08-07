-- Recreates the smart_folders updated_at trigger with a recursion guard.
--
-- 0005 shipped in v0.1.9 without the WHEN clause, so the trigger fired again on
-- the row it had just written. Editing 0005 in place would change its checksum
-- and make sqlx refuse to start for anyone who already ran v0.1.9, so the fix
-- lands here instead.
--
-- WHEN NEW.updated_at = OLD.updated_at limits the trigger to updates that left
-- the timestamp alone: a caller's write stamps the row once, and the trigger's
-- own write is skipped because it changed updated_at.

DROP TRIGGER IF EXISTS smart_folders_update_timestamp;

CREATE TRIGGER smart_folders_update_timestamp
AFTER UPDATE ON smart_folders
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE smart_folders SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = NEW.id;
END;
