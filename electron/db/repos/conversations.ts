import type Database from 'better-sqlite3'

export type ConversationTitleSource = 'placeholder' | 'auto-deterministic' | 'auto-ai' | 'manual'

export type DbConversation = {
  id: string
  project_id: string | null
  title: string
  title_source: ConversationTitleSource
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
  channel_extension_id: string | null
  hidden_from_sidebar: number
  memory_injected: number
  runtime_location: 'local' | 'cloud'
  cloud_runtime_session_id: string | null
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
    .prepare('SELECT * FROM conversations ORDER BY updated_at DESC')
    .all() as DbConversation[]
}

export function insertConversation(
  db: Database.Database,
  params: {
    id: string
    projectId?: string | null
    title: string
    titleSource?: ConversationTitleSource
    isRelevant?: boolean
    modelProvider?: string | null
    modelId?: string | null
    thinkingLevel?: string | null
    worktreePath?: string | null
    accessMode?: 'secure' | 'open'
    channelExtensionId?: string | null
    hiddenFromSidebar?: boolean
    memoryInjected?: boolean
    runtimeLocation?: 'local' | 'cloud'
    cloudRuntimeSessionId?: string | null
  },
) {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO conversations(
      id, project_id, title, title_source, status, is_relevant, created_at, updated_at, last_message_at,
      pi_session_file, model_provider, model_id, thinking_level, last_runtime_error, worktree_path, access_mode, channel_extension_id, hidden_from_sidebar, memory_injected, runtime_location, cloud_runtime_session_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.id,
    params.projectId ?? null,
    params.title,
    params.titleSource ?? 'placeholder',
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
    params.channelExtensionId ?? null,
    params.hiddenFromSidebar === true ? 1 : 0,
    params.memoryInjected === true ? 1 : 0,
    params.runtimeLocation ?? 'local',
    params.cloudRuntimeSessionId ?? null,
  )
}

export function upsertConversation(
  db: Database.Database,
  params: {
    id: string
    projectId?: string | null
    title: string
    status?: 'active' | 'done' | 'archived'
    modelProvider?: string | null
    modelId?: string | null
    thinkingLevel?: string | null
    accessMode?: 'secure' | 'open'
    runtimeLocation?: 'local' | 'cloud'
    cloudRuntimeSessionId?: string | null
  },
) {
  const existing = findConversationById(db, params.id)
  const now = new Date().toISOString()

  if (!existing) {
    insertConversation(db, {
      id: params.id,
      projectId: params.projectId ?? null,
      title: params.title,
      modelProvider: params.modelProvider ?? null,
      modelId: params.modelId ?? null,
      thinkingLevel: params.thinkingLevel ?? null,
      accessMode: params.accessMode ?? 'secure',
      runtimeLocation: params.runtimeLocation ?? 'local',
      cloudRuntimeSessionId: params.cloudRuntimeSessionId ?? null,
    })
    if (params.status && params.status !== 'active') {
      updateConversationStatus(db, params.id, params.status)
    }
    return
  }

  db.prepare(
    `UPDATE conversations
     SET
       project_id = ?,
       title = ?,
       status = ?,
       model_provider = ?,
       model_id = ?,
       thinking_level = ?,
       access_mode = ?,
       runtime_location = ?,
       cloud_runtime_session_id = ?,
       updated_at = ?
     WHERE id = ?`,
  ).run(
    params.projectId ?? null,
    params.title,
    params.status ?? existing.status,
    params.modelProvider ?? null,
    params.modelId ?? null,
    params.thinkingLevel ?? null,
    params.accessMode ?? existing.access_mode,
    params.runtimeLocation ?? existing.runtime_location,
    params.cloudRuntimeSessionId ?? existing.cloud_runtime_session_id,
    now,
    params.id,
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

export function updateConversationStatus(
  db: Database.Database,
  id: string,
  status: DbConversation['status'],
): boolean {
  const now = new Date().toISOString()
  const result = db
    .prepare(
      `UPDATE conversations
       SET status = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(status, now, id)
  return result.changes > 0
}

export function updateConversationTitle(
  db: Database.Database,
  id: string,
  title: string,
  titleSource?: ConversationTitleSource,
): boolean {
  const now = new Date().toISOString()
  const result = titleSource
    ? db
        .prepare(
          `UPDATE conversations
           SET title = ?, title_source = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(title, titleSource, now, id)
    : db
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
    piSessionFile?: string | null
    modelProvider?: string | null
    modelId?: string | null
    thinkingLevel?: string | null
    lastRuntimeError?: string | null
    worktreePath?: string | null
    accessMode?: 'secure' | 'open' | null
    channelExtensionId?: string | null
    runtimeLocation?: 'local' | 'cloud' | null
    cloudRuntimeSessionId?: string | null
  },
) {
  const now = new Date().toISOString()
  const hasPiSessionFile = Object.prototype.hasOwnProperty.call(updates, 'piSessionFile')
  const hasModelProvider = Object.prototype.hasOwnProperty.call(updates, 'modelProvider')
  const hasModelId = Object.prototype.hasOwnProperty.call(updates, 'modelId')
  const hasThinkingLevel = Object.prototype.hasOwnProperty.call(updates, 'thinkingLevel')
  const hasLastRuntimeError = Object.prototype.hasOwnProperty.call(updates, 'lastRuntimeError')
  const hasWorktreePath = Object.prototype.hasOwnProperty.call(updates, 'worktreePath')
  const hasAccessMode = Object.prototype.hasOwnProperty.call(updates, 'accessMode')
  const hasChannelExtensionId = Object.prototype.hasOwnProperty.call(updates, 'channelExtensionId')
  const hasRuntimeLocation = Object.prototype.hasOwnProperty.call(updates, 'runtimeLocation')
  const hasCloudRuntimeSessionId = Object.prototype.hasOwnProperty.call(updates, 'cloudRuntimeSessionId')
  db.prepare(
    `UPDATE conversations
      SET
        pi_session_file = CASE WHEN ? = 1 THEN ? ELSE pi_session_file END,
        model_provider = CASE WHEN ? = 1 THEN ? ELSE model_provider END,
        model_id = CASE WHEN ? = 1 THEN ? ELSE model_id END,
        thinking_level = CASE WHEN ? = 1 THEN ? ELSE thinking_level END,
        last_runtime_error = CASE WHEN ? = 1 THEN ? ELSE last_runtime_error END,
        worktree_path = CASE WHEN ? = 1 THEN ? ELSE worktree_path END,
        access_mode = CASE WHEN ? = 1 THEN ? ELSE access_mode END,
        channel_extension_id = CASE WHEN ? = 1 THEN ? ELSE channel_extension_id END,
        runtime_location = CASE WHEN ? = 1 THEN ? ELSE runtime_location END,
        cloud_runtime_session_id = CASE WHEN ? = 1 THEN ? ELSE cloud_runtime_session_id END,
        updated_at = ?
      WHERE id = ?`
  ).run(
    hasPiSessionFile ? 1 : 0,
    updates.piSessionFile ?? null,
    hasModelProvider ? 1 : 0,
    updates.modelProvider ?? null,
    hasModelId ? 1 : 0,
    updates.modelId ?? null,
    hasThinkingLevel ? 1 : 0,
    updates.thinkingLevel ?? null,
    hasLastRuntimeError ? 1 : 0,
    updates.lastRuntimeError ?? null,
    hasWorktreePath ? 1 : 0,
    updates.worktreePath ?? null,
    hasAccessMode ? 1 : 0,
    updates.accessMode ?? null,
    hasChannelExtensionId ? 1 : 0,
    updates.channelExtensionId ?? null,
    hasRuntimeLocation ? 1 : 0,
    updates.runtimeLocation ?? null,
    hasCloudRuntimeSessionId ? 1 : 0,
    updates.cloudRuntimeSessionId ?? null,
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

export type DbComposerDraft = {
  key: string
  content: string
  created_at: string
  updated_at: string
}

export type DbComposerQueuedMessages = {
  key: string
  messages_json: string
  created_at: string
  updated_at: string
}

export function saveComposerDraft(db: Database.Database, key: string, content: string): void {
  const now = new Date().toISOString()
  if (content.length === 0) {
    // Delete empty drafts
    db.prepare('DELETE FROM composer_drafts WHERE key = ?').run(key)
  } else {
    db.prepare(
      `INSERT INTO composer_drafts(key, content, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET content = ?, updated_at = ?`
    ).run(key, content, now, now, content, now)
  }
}

export function getComposerDraft(db: Database.Database, key: string): DbComposerDraft | undefined {
  return db.prepare('SELECT * FROM composer_drafts WHERE key = ?').get(key) as DbComposerDraft | undefined
}

export function getComposerDrafts(db: Database.Database): DbComposerDraft[] {
  return db.prepare('SELECT * FROM composer_drafts ORDER BY updated_at DESC').all() as DbComposerDraft[]
}

export function deleteComposerDraft(db: Database.Database, key: string): boolean {
  const result = db.prepare('DELETE FROM composer_drafts WHERE key = ?').run(key)
  return result.changes > 0
}

export function saveComposerQueuedMessages(db: Database.Database, key: string, messages: string[]): void {
  const now = new Date().toISOString()
  if (messages.length === 0) {
    db.prepare('DELETE FROM composer_queued_messages WHERE key = ?').run(key)
  } else {
    const messagesJson = JSON.stringify(messages)
    db.prepare(
      `INSERT INTO composer_queued_messages(key, messages_json, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET messages_json = ?, updated_at = ?`
    ).run(key, messagesJson, now, now, messagesJson, now)
  }
}

export function getComposerQueuedMessages(db: Database.Database, key: string): DbComposerQueuedMessages | undefined {
  return db.prepare('SELECT * FROM composer_queued_messages WHERE key = ?').get(key) as DbComposerQueuedMessages | undefined
}

export function getAllComposerQueuedMessages(db: Database.Database): DbComposerQueuedMessages[] {
  return db.prepare('SELECT * FROM composer_queued_messages ORDER BY updated_at DESC').all() as DbComposerQueuedMessages[]
}

export function deleteComposerQueuedMessages(db: Database.Database, key: string): boolean {
  const result = db.prepare('DELETE FROM composer_queued_messages WHERE key = ?').run(key)
  return result.changes > 0
}
