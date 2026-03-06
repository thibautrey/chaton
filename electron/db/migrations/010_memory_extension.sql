CREATE TABLE IF NOT EXISTS memory_entries (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK(scope IN ('global','project')),
  project_id TEXT,
  kind TEXT NOT NULL DEFAULT 'fact',
  title TEXT,
  content TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'manual',
  conversation_id TEXT,
  embedding_model TEXT NOT NULL,
  embedding_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_accessed_at TEXT,
  access_count INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
  CHECK((scope = 'global' AND project_id IS NULL) OR (scope = 'project' AND project_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_memory_entries_scope_project_archived
  ON memory_entries(scope, project_id, archived, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_entries_kind
  ON memory_entries(kind, archived, updated_at DESC);
