-- Create table for storing composer drafts
CREATE TABLE IF NOT EXISTS composer_drafts (
  key TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_composer_drafts_updated_at ON composer_drafts(updated_at);
