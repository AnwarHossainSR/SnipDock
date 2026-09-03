-- Device identity and the Lamport clock cross-device sync orders records by.
--
-- Wall-clock time cannot order these records: devices disagree about the time,
-- and a phone that was off for a week must not lose to a laptop's clock skew.
-- Each device keeps a monotonic counter, stamps every record it writes with
-- it, and advances it past the highest value seen in anything it pulls.
-- `updated_at` stays what the user sees; the counter is what the merge
-- compares.

-- This installation. One row, like `app_settings`. `device_id` is generated on
-- first launch and stable across restarts and updates; `name` is the
-- user-visible label, editable in Settings.
CREATE TABLE IF NOT EXISTS sync_device (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    device_id TEXT NOT NULL,
    name TEXT NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0 CHECK (counter >= 0),
    created_at TEXT NOT NULL
);

-- Per-peer high-water marks: the highest counter this device has successfully
-- pulled from each peer. A steady-state pull lists that peer's prefix from a
-- start-after key rather than re-reading the whole log, and compaction refuses
-- to run while any peer's mark lags behind the records it would delete.
CREATE TABLE IF NOT EXISTS sync_peers (
    device_id TEXT PRIMARY KEY,
    name TEXT,
    watermark INTEGER NOT NULL DEFAULT 0 CHECK (watermark >= 0),
    last_seen_at TEXT NOT NULL
);

-- `sync_records` gains the counter and the object key each staged record was
-- (or will be) written under.
--
-- Rebuilt rather than altered because the schema-upgrade test rewinds the
-- migration journal and replays the newest migration, and a second
-- `ALTER TABLE ADD COLUMN` fails with "duplicate column name". Nothing is
-- preserved because nothing can be lost: no shipped build exposes a command
-- that stages a record, so the outbox is empty in every existing database.
DROP TABLE IF EXISTS sync_records;

CREATE TABLE sync_records (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    record_id TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    counter INTEGER NOT NULL DEFAULT 0,
    tombstone INTEGER NOT NULL DEFAULT 0,
    ciphertext TEXT NOT NULL,
    -- Set once the record has been pushed; NULL while it is still staged.
    object_key TEXT,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sync_records_record_idx ON sync_records(record_id);
-- The push reads the outbox in counter order so a partial push leaves a
-- prefix of the log uploaded rather than holes in it.
CREATE INDEX IF NOT EXISTS sync_records_pending_idx ON sync_records(counter) WHERE object_key IS NULL;

-- The losing revision of a conflict, kept so last-writer-wins is inspectable
-- and reversible rather than silent. 0003 logged only the revision numbers,
-- which named a conflict without retaining anything to restore.
CREATE TABLE IF NOT EXISTS sync_conflict_revisions (
    conflict_id TEXT PRIMARY KEY,
    ciphertext TEXT NOT NULL
);
