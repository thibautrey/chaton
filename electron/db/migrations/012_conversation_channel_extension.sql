-- Add channel_extension_id column to conversations table
ALTER TABLE conversations ADD COLUMN channel_extension_id TEXT;

-- Create index for channel_extension_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversations_channel_extension_id ON conversations(channel_extension_id);