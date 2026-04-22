CREATE TABLE IF NOT EXISTS acp_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  from_agent TEXT NOT NULL,
  to_agent TEXT,
  agent_role TEXT NOT NULL,
  message_type TEXT NOT NULL,
  title TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_acp_messages_conversation_created
  ON acp_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS acp_agent_states (
  conversation_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  role TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  objective TEXT,
  status TEXT NOT NULL,
  execution_mode TEXT,
  result_json TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(conversation_id, agent_id),
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_acp_agent_states_conversation_updated
  ON acp_agent_states(conversation_id, updated_at);

CREATE TABLE IF NOT EXISTS acp_task_lists (
  conversation_id TEXT NOT NULL,
  task_list_id TEXT NOT NULL,
  owner_kind TEXT NOT NULL,
  owner_agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  tasks_json TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(conversation_id, task_list_id),
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_acp_task_lists_conversation_owner_current
  ON acp_task_lists(conversation_id, owner_kind, owner_agent_id, is_current, updated_at);
