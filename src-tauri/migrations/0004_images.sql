-- Adds 'image' to the items.content_type CHECK constraint so clipboard images
-- can be stored alongside text. SQLite cannot alter a CHECK in place, so the
-- table is rebuilt following the documented procedure.
--
-- Dropping `items` performs an implicit DELETE, which fires ON DELETE CASCADE
-- into item_tags/trash_items and ON DELETE SET NULL into activity. Those rows
-- are staged in temp tables first and restored after the rename, so no
-- relationship is lost. Foreign keys are deferred to the end of the migration
-- transaction because `items` briefly does not exist.
PRAGMA defer_foreign_keys = ON;

CREATE TEMP TABLE item_tags_staged AS SELECT item_id, tag_id FROM item_tags;
CREATE TEMP TABLE trash_items_staged AS SELECT receipt_id, item_id FROM trash_items;
CREATE TEMP TABLE activity_staged AS SELECT id, item_id FROM activity WHERE item_id IS NOT NULL;

CREATE TABLE items_rebuilt (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('clipboard', 'snippet', 'command', 'template', 'note')),
    title TEXT,
    description TEXT,
    content BLOB NOT NULL,
    notes TEXT,
    content_type TEXT NOT NULL DEFAULT 'plain_text' CHECK (
        content_type IN ('plain_text', 'code', 'json', 'sql', 'html', 'css', 'xml', 'shell', 'markdown', 'config', 'image')
    ),
    language TEXT,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    content_hash TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
    private INTEGER NOT NULL DEFAULT 0 CHECK (private IN (0, 1)),
    archived_at TEXT,
    deleted_at TEXT,
    expires_at TEXT,
    usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
    last_used_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    security_envelope_version INTEGER NOT NULL DEFAULT 0,
    protected_content_hash TEXT
);

INSERT INTO items_rebuilt (
    id, kind, title, description, content, notes, content_type, language,
    project_id, category_id, content_hash, pinned, favorite, private,
    archived_at, deleted_at, expires_at, usage_count, last_used_at,
    created_at, updated_at, security_envelope_version, protected_content_hash
)
SELECT
    id, kind, title, description, content, notes, content_type, language,
    project_id, category_id, content_hash, pinned, favorite, private,
    archived_at, deleted_at, expires_at, usage_count, last_used_at,
    created_at, updated_at, security_envelope_version, protected_content_hash
FROM items;

DROP TABLE items;
ALTER TABLE items_rebuilt RENAME TO items;

DELETE FROM item_tags;
INSERT INTO item_tags (item_id, tag_id) SELECT item_id, tag_id FROM item_tags_staged;

DELETE FROM trash_items;
INSERT INTO trash_items (receipt_id, item_id) SELECT receipt_id, item_id FROM trash_items_staged;

UPDATE activity
SET item_id = (SELECT staged.item_id FROM activity_staged staged WHERE staged.id = activity.id)
WHERE id IN (SELECT id FROM activity_staged);

DROP TABLE item_tags_staged;
DROP TABLE trash_items_staged;
DROP TABLE activity_staged;

CREATE INDEX items_active_created_idx ON items(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX items_project_created_idx ON items(project_id, created_at DESC);
CREATE INDEX items_category_created_idx ON items(category_id, created_at DESC);
CREATE INDEX items_content_hash_idx ON items(content_hash);
CREATE INDEX items_flags_created_idx ON items(pinned, favorite, created_at DESC);
CREATE INDEX items_archive_idx ON items(archived_at) WHERE archived_at IS NOT NULL;

CREATE TRIGGER items_fts_insert
AFTER INSERT ON items
WHEN new.deleted_at IS NULL
BEGIN
    INSERT INTO items_fts(item_id, title, description, content, notes)
    VALUES (new.id, new.title, new.description, new.content, new.notes);
END;

CREATE TRIGGER items_fts_update
AFTER UPDATE OF title, description, content, notes, deleted_at ON items
BEGIN
    DELETE FROM items_fts WHERE item_id = old.id;
    INSERT INTO items_fts(item_id, title, description, content, notes)
    SELECT new.id, new.title, new.description, new.content, new.notes
    WHERE new.deleted_at IS NULL;
END;

CREATE TRIGGER items_fts_delete
AFTER DELETE ON items
BEGIN
    DELETE FROM items_fts WHERE item_id = old.id;
END;
