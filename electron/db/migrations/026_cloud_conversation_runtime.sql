PRAGMA foreign_keys = ON;

ALTER TABLE conversations ADD COLUMN runtime_location TEXT NOT NULL DEFAULT 'local';
ALTER TABLE conversations ADD COLUMN cloud_runtime_session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_conversations_runtime_location ON conversations(runtime_location);
