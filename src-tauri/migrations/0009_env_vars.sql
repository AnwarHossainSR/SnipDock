-- Environment variables, kept in named sets ("acme-api · production").
--
-- A set is what gets copied out as one `.env` file, JSON object or shell
-- block, so the variable key is unique within its set and nowhere else: the
-- same `DATABASE_URL` belongs in staging and production with two values.
--
-- Values are text of any shape - a single word, a multi-line PEM key, a JSON
-- document - and are stored exactly as entered. `secret` only decides whether
-- the UI masks the value until asked; it is not encryption.
--
-- Every statement is `IF NOT EXISTS`: the schema-upgrade snapshot test rewinds
-- the migration journal by one version and replays the newest migration over a
-- database that already has these tables.
CREATE TABLE IF NOT EXISTS env_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    description TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS env_vars (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES env_groups(id) ON DELETE CASCADE,
    -- Case-sensitive, as environment variables are on every platform but
    -- Windows, where `Path` and `PATH` collide; keeping both is the safer side.
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    secret INTEGER NOT NULL DEFAULT 0 CHECK (secret IN (0, 1)),
    note TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (group_id, key)
);

CREATE INDEX IF NOT EXISTS env_vars_group_position_idx ON env_vars(group_id, position);
