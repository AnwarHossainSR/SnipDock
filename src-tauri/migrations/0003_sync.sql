CREATE TABLE IF NOT EXISTS sync_records (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  tombstone INTEGER NOT NULL DEFAULT 0,
  ciphertext TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL,
  local_revision INTEGER NOT NULL,
  remote_revision INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
