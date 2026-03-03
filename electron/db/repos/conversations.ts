import type Database from 'better-sqlite3'

export type DbConversation = {
  id: string
  project_id: string
  title: string
  status: 'active' | 'done' | 'archived'
  is_relevant: number
  created_at: string
  updated_at: string
  last_message_at: string
}

export function listConversations(db: Database.Database): DbConversation[] {
  return db
    .prepare('SELECT * FROM conversations WHERE status != ? ORDER BY updated_at DESC')
    .all('archived') as DbConversation[]
}
