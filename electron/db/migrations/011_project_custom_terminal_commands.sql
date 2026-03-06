CREATE TABLE IF NOT EXISTS project_custom_terminal_commands (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  command_text TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_custom_terminal_commands_project_last_used
  ON project_custom_terminal_commands(project_id, last_used_at DESC);
