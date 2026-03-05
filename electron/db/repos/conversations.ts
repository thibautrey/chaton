import type Database from 'better-sqlite3'

export type DbConversation = {
  id: string
  project_id: string | null
  title: string
  status: 'active' | 'done' | 'archived'
  is_relevant: number
  created_at: string
  updated_at: string
  last_message_at: string
  pi_session_file: string | null
  model_provider: string | null
  model_id: string | null
  thinking_level: string | null
  last_runtime_error: string | null
  worktree_path: string | null
  access_mode: 'secure' | 'open'
}

export type DbConversationMessageCache = {
  id: string
  conversation_id: string
  role: string
  payload_json: string
  created_at: string
  updated_at: string
}

export function listConversations(db: Database.Database): DbConversation[] {
  return db
    .prepare('SELECT * FROM conversations WHERE status != ? ORDER BY updated_at DESC')
    .all('archived') as DbConversation[]
}

export function insertConversation(
  db: Database.Database,
  params: {
    id: string
    projectId?: string | null
    title: string
    isRelevant?: boolean
    modelProvider?: string | null
    modelId?: string | null
    thinkingLevel?: string | null
    worktreePath?: string | null
    accessMode?: 'secure' | 'open'
  },
) {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO conversations(
      id, project_id, title, status, is_relevant, created_at, updated_at, last_message_at,
      pi_session_file, model_provider, model_id, thinking_level, last_runtime_error, worktree_path, access_mode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?)`
  ).run(
    params.id,
    params.projectId ?? null,
    params.title,
    'active',
    params.isRelevant === false ? 0 : 1,
    now,
    now,
    now,
    params.modelProvider ?? null,
    params.modelId ?? null,
    params.thinkingLevel ?? null,
    params.worktreePath ?? null,
    params.accessMode ?? 'secure',
  )
}

export function findConversationById(db: Database.Database, id: string): DbConversation | undefined {
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as DbConversation | undefined
}

export function listConversationsByProjectId(db: Database.Database, projectId: string): DbConversation[] {
  return db.prepare('SELECT * FROM conversations WHERE project_id = ? ORDER BY updated_at DESC').all(projectId) as DbConversation[]
}

export function deleteConversationById(db: Database.Database, id: string): boolean {
  const result = db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
  return result.changes > 0
}

export function updateConversationTitle(db: Database.Database, id: string, title: string): boolean {
  const now = new Date().toISOString()
  const result = db
    .prepare(
      `UPDATE conversations
       SET title = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(title, now, id)
  return result.changes > 0
}

export function saveConversationPiRuntime(
  db: Database.Database,
  id: string,
  updates: {
    piSessionFile?: string
    modelProvider?: string
    modelId?: string
    thinkingLevel?: string
    lastRuntimeError?: string
    worktreePath?: string
    accessMode?: 'secure' | 'open'
  },
) {
  const now = new Date().toISOString()
  db.prepare(
    `UPDATE conversations
      SET
        pi_session_file = COALESCE(?, pi_session_file),
        model_provider = COALESCE(?, model_provider),
        model_id = COALESCE(?, model_id),
        thinking_level = COALESCE(?, thinking_level),
        last_runtime_error = COALESCE(?, last_runtime_error),
        worktree_path = COALESCE(?, worktree_path),
        access_mode = COALESCE(?, access_mode),
        updated_at = ?
      WHERE id = ?`
  ).run(
    updates.piSessionFile ?? null,
    updates.modelProvider ?? null,
    updates.modelId ?? null,
    updates.thinkingLevel ?? null,
    updates.lastRuntimeError ?? null,
    updates.worktreePath ?? null,
    updates.accessMode ?? null,
    now,
    id,
  )
}

export function clearConversationWorktreePath(db: Database.Database, id: string): boolean {
  const now = new Date().toISOString()
  const result = db
    .prepare(
      `UPDATE conversations
       SET worktree_path = NULL, updated_at = ?
       WHERE id = ?`,
    )
    .run(now, id)
  return result.changes > 0
}

export function replaceConversationMessagesCache(
  db: Database.Database,
  conversationId: string,
  messages: Array<{ id: string; role: string; payloadJson: string }>,
) {
  const now = new Date().toISOString()
  const deleteStmt = db.prepare('DELETE FROM conversation_messages_cache WHERE conversation_id = ?')
  const insertStmt = db.prepare(
    `INSERT INTO conversation_messages_cache(id, conversation_id, role, payload_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )

  const transaction = db.transaction(() => {
    deleteStmt.run(conversationId)
    for (const message of messages) {
      insertStmt.run(message.id, conversationId, message.role, message.payloadJson, now, now)
    }
  })

  transaction()
}

export function listConversationMessagesCache(db: Database.Database, conversationId: string): DbConversationMessageCache[] {
  return db
    .prepare('SELECT * FROM conversation_messages_cache WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(conversationId) as DbConversationMessageCache[]
}
