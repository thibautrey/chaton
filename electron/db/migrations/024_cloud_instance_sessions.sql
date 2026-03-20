PRAGMA foreign_keys = ON;

ALTER TABLE cloud_instances ADD COLUMN oauth_state TEXT;
ALTER TABLE cloud_instances ADD COLUMN user_email TEXT;
ALTER TABLE cloud_instances ADD COLUMN access_token TEXT;
ALTER TABLE cloud_instances ADD COLUMN refresh_token TEXT;
ALTER TABLE cloud_instances ADD COLUMN token_expires_at TEXT;
