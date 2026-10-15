-- Environment sets belong to projects. `production` is a set every project
-- has, so a set's name is unique within its project (or among the sets that
-- have none) rather than across the whole app.
--
-- A table rebuild rather than `ALTER TABLE ADD COLUMN`, for two reasons: the
-- uniqueness rule changes, and the schema-upgrade snapshot test replays the
-- newest migration, where a second `ADD COLUMN` would fail with "duplicate
-- column name".
--
-- Dropping `env_groups` performs an implicit DELETE, and `env_vars` cascades
-- on it, so the variables are staged first and put back afterwards - the
-- pattern 0007 uses for `items`.
PRAGMA defer_foreign_keys = ON;

CREATE TEMP TABLE env_vars_staged AS SELECT * FROM env_vars;

CREATE TABLE env_groups_rebuilt (
    id TEXT PRIMARY KEY,
    -- A project that is deleted leaves its sets behind, unfiled. (Nothing in
    -- the app deletes projects; if something does, a set whose name an
    -- unfiled set already has blocks the delete through the index below.)
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    name TEXT NOT NULL COLLATE NOCASE,
    description TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO env_groups_rebuilt (id, project_id, name, description, position, created_at, updated_at)
SELECT id, NULL, name, description, position, created_at, updated_at FROM env_groups;

DROP TABLE env_groups;
ALTER TABLE env_groups_rebuilt RENAME TO env_groups;

DELETE FROM env_vars;
INSERT INTO env_vars SELECT * FROM env_vars_staged;
DROP TABLE env_vars_staged;

-- `IFNULL` because NULLs are distinct in a UNIQUE index: without it two
-- unfiled sets could share a name. Replaying this file unfiles every set, so
-- it only replays cleanly over schema-9 data, where names were unique app-wide.
CREATE UNIQUE INDEX IF NOT EXISTS env_groups_project_name_idx
    ON env_groups(IFNULL(project_id, ''), name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS env_groups_project_idx ON env_groups(project_id);
