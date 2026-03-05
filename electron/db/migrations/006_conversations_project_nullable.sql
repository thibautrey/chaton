PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS conversations_new (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','done','archived')) DEFAULT 'active',
  is_relevant INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_message_at TEXT NOT NULL,
  pi_session_file TEXT,
  model_provider TEXT,
  model_id TEXT,
  thinking_level TEXT,
  last_runtime_error TEXT,
  worktree_path TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

INSERT INTO conversations_new (
  id,
  project_id,
  title,
  status,
  is_relevant,
  created_at,
  updated_at,
  last_message_at,
  pi_session_file,
  model_provider,
  model_id,
  thinking_level,
  last_runtime_error,
  worktree_path
)
SELECT
  id,
  project_id,
  title,
  status,
  is_relevant,
  created_at,
  updated_at,
  last_message_at,
  pi_session_file,
  model_provider,
  model_id,
  thinking_level,
  last_runtime_error,
  worktree_path
FROM conversations;

DROP TABLE conversations;
ALTER TABLE conversations_new RENAME TO conversations;

CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_is_relevant ON conversations(is_relevant);

PRAGMA foreign_keys = ON;
