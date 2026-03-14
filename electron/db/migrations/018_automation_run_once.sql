-- Add run_once column to support single-execution automations
ALTER TABLE automation_rules ADD COLUMN run_once INTEGER DEFAULT 0;