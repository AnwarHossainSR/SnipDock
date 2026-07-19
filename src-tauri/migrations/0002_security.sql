ALTER TABLE items ADD COLUMN security_envelope_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN protected_content_hash TEXT;

CREATE TABLE IF NOT EXISTS app_lock (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  pin_hash TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_at TEXT
);
