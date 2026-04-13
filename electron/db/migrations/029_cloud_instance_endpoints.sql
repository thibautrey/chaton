PRAGMA foreign_keys = ON;

ALTER TABLE cloud_instances ADD COLUMN endpoints_json TEXT;
