-- Add hidden_from_sidebar column to conversations table
-- Conversations marked as hidden are not displayed in the sidebar, but are still accessible via their extension
ALTER TABLE conversations ADD COLUMN hidden_from_sidebar INTEGER NOT NULL DEFAULT 0;

-- Create index for hidden_from_sidebar for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversations_hidden_from_sidebar ON conversations(hidden_from_sidebar);
