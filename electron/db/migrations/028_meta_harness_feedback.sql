CREATE TABLE IF NOT EXISTS conversation_harness_feedback (
  conversation_id TEXT PRIMARY KEY,
  harness_candidate_id TEXT,
  harness_snapshot_json TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  user_rating INTEGER,
  user_feedback_submitted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversation_harness_feedback_candidate
  ON conversation_harness_feedback(harness_candidate_id);

CREATE INDEX IF NOT EXISTS idx_conversation_harness_feedback_rating
  ON conversation_harness_feedback(user_rating);
