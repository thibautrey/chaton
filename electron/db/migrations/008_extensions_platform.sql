CREATE TABLE IF NOT EXISTS extension_kv (
  extension_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (extension_id, key)
);

CREATE TABLE IF NOT EXISTS extension_queue (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','processing','done','dead')) DEFAULT 'queued',
  consumer_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  last_error TEXT,
  idempotency_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_extension_queue_topic_status_available
  ON extension_queue(topic, status, available_at);

CREATE TABLE IF NOT EXISTS automation_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  trigger_topic TEXT NOT NULL,
  conditions_json TEXT NOT NULL,
  actions_json TEXT NOT NULL,
  cooldown_ms INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  event_topic TEXT NOT NULL,
  event_payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ok','error')),
  error_message TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(rule_id) REFERENCES automation_rules(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_rule_created
  ON automation_runs(rule_id, created_at DESC);
