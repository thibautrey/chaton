CREATE TABLE IF NOT EXISTS quick_actions_usage (
  action_id TEXT PRIMARY KEY,
  uses_count INTEGER NOT NULL DEFAULT 0,
  decayed_score REAL NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quick_actions_usage_updated_at
  ON quick_actions_usage(updated_at DESC);
