-- Memory Psychology: Chetna-inspired multi-factor scoring
-- Adds importance, stability, emotion tracking, and decay factors

-- Importance: intrinsic importance of the memory (0.0 - 1.0)
-- Higher importance = more resistant to forgetting
ALTER TABLE memory_entries ADD COLUMN importance REAL NOT NULL DEFAULT 0.5;

-- Stability period: hours before decay begins (based on Chetna's memory types)
-- system: 10000h, skill_learned: 336h, preference: 720h, fact: 168h, rule: 240h, experience: 24h
ALTER TABLE memory_entries ADD COLUMN stability_hours INTEGER NOT NULL DEFAULT 168;

-- Emotion tracking (Chetna-inspired)
-- Valence: -1.0 (negative) to 1.0 (positive)
ALTER TABLE memory_entries ADD COLUMN emotion_valence REAL NOT NULL DEFAULT 0.0;
-- Arousal: 0.0 (calm) to 1.0 (exciting/intense)
ALTER TABLE memory_entries ADD COLUMN emotion_arousal REAL NOT NULL DEFAULT 0.0;

-- Decay factor: 1.0 = fresh, decreases over time (Ebbinghaus curve)
ALTER TABLE memory_entries ADD COLUMN decay_factor REAL NOT NULL DEFAULT 1.0;

-- Index for decay-based cleanup queries
CREATE INDEX IF NOT EXISTS idx_memory_decay 
  ON memory_entries(archived, stability_hours, decay_factor, updated_at);

-- Index for importance-based queries
CREATE INDEX IF NOT EXISTS idx_memory_importance 
  ON memory_entries(archived, importance DESC, updated_at DESC);
