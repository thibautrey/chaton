ALTER TABLE conversations
ADD COLUMN access_mode TEXT NOT NULL DEFAULT 'secure'
CHECK(access_mode IN ('secure','open'));
