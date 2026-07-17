CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    built_in INTEGER NOT NULL DEFAULT 0 CHECK (built_in IN (0, 1)),
    created_at TEXT NOT NULL
);

CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(name) > 0 AND name = trim(name)),
    color TEXT NOT NULL,
    usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
    created_at TEXT NOT NULL
);

CREATE TABLE items (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('clipboard', 'snippet', 'command', 'template', 'note')),
    title TEXT,
    description TEXT,
    content BLOB NOT NULL,
    notes TEXT,
    content_type TEXT NOT NULL DEFAULT 'plain_text' CHECK (
        content_type IN ('plain_text', 'code', 'json', 'sql', 'html', 'css', 'xml', 'shell', 'markdown', 'config')
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
    updated_at TEXT NOT NULL
);

CREATE TABLE item_tags (
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, tag_id)
);

CREATE TABLE project_tags (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, tag_id)
);

CREATE TABLE trash_receipts (
    id TEXT PRIMARY KEY,
    operation TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE trash_items (
    receipt_id TEXT NOT NULL REFERENCES trash_receipts(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    PRIMARY KEY (receipt_id, item_id)
);

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE activity (
    id TEXT PRIMARY KEY,
    item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX items_active_created_idx ON items(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX items_project_created_idx ON items(project_id, created_at DESC);
CREATE INDEX items_category_created_idx ON items(category_id, created_at DESC);
CREATE INDEX items_content_hash_idx ON items(content_hash);
CREATE INDEX items_flags_created_idx ON items(pinned, favorite, created_at DESC);
CREATE INDEX items_archive_idx ON items(archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX item_tags_tag_idx ON item_tags(tag_id);
CREATE INDEX project_tags_tag_idx ON project_tags(tag_id);
CREATE INDEX trash_receipts_expiry_idx ON trash_receipts(expires_at);
CREATE INDEX trash_items_item_idx ON trash_items(item_id);
CREATE INDEX activity_created_idx ON activity(created_at DESC);
CREATE INDEX activity_item_created_idx ON activity(item_id, created_at DESC);
CREATE INDEX activity_project_created_idx ON activity(project_id, created_at DESC);

CREATE VIRTUAL TABLE items_fts USING fts5(
    item_id UNINDEXED,
    title,
    description,
    content,
    notes,
    tokenize = 'unicode61'
);

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

-- Default taxonomy authorized by owner. Change persisted names only through a forward migration.
INSERT INTO categories (id, name, built_in, created_at) VALUES
    ('builtin-api', 'API', 1, '1970-01-01T00:00:00Z'),
    ('builtin-authentication', 'Authentication', 1, '1970-01-01T00:00:00Z'),
    ('builtin-code', 'Code', 1, '1970-01-01T00:00:00Z'),
    ('builtin-commands', 'Commands', 1, '1970-01-01T00:00:00Z'),
    ('builtin-configuration', 'Configuration', 1, '1970-01-01T00:00:00Z'),
    ('builtin-database', 'Database', 1, '1970-01-01T00:00:00Z'),
    ('builtin-deployment', 'Deployment', 1, '1970-01-01T00:00:00Z'),
    ('builtin-docker', 'Docker', 1, '1970-01-01T00:00:00Z'),
    ('builtin-documentation', 'Documentation', 1, '1970-01-01T00:00:00Z'),
    ('builtin-environment', 'Environment', 1, '1970-01-01T00:00:00Z'),
    ('builtin-git', 'Git', 1, '1970-01-01T00:00:00Z'),
    ('builtin-json', 'JSON', 1, '1970-01-01T00:00:00Z'),
    ('builtin-kubernetes', 'Kubernetes', 1, '1970-01-01T00:00:00Z'),
    ('builtin-networking', 'Networking', 1, '1970-01-01T00:00:00Z'),
    ('builtin-notes', 'Notes', 1, '1970-01-01T00:00:00Z'),
    ('builtin-regex', 'Regex', 1, '1970-01-01T00:00:00Z'),
    ('builtin-shell', 'Shell', 1, '1970-01-01T00:00:00Z'),
    ('builtin-sql', 'SQL', 1, '1970-01-01T00:00:00Z'),
    ('builtin-templates', 'Templates', 1, '1970-01-01T00:00:00Z'),
    ('builtin-testing', 'Testing', 1, '1970-01-01T00:00:00Z'),
    ('builtin-troubleshooting', 'Troubleshooting', 1, '1970-01-01T00:00:00Z');
