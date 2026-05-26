import crypto from 'node:crypto'
import {
  buildMemoryFingerprint,
  buildMemorySearchText,
  buildTopicKey,
  MEMORY_SCHEMA_VERSION,
  MEMORY_STATUS,
  MEMORY_VISIBILITY,
  normalizeMemoryKind,
  rerankMemoryCandidates,
  shouldSupersedeKind,
  summarizeMemoryStats,
} from '../../../packages/memory/index.js'
import { getDb } from '../../db/index.js'
import type { ExtensionHostCallResult } from './types.js'
import {
  getDefaultEmotion,
  getDefaultImportance,
  getDefaultStability,
} from './memory-scoring.js'

type MemoryScope = 'global' | 'project'
type MemoryListScope = MemoryScope | 'all'
type MemoryStatusValue = 'active' | 'superseded'
type MemoryVisibilityValue = 'private' | 'shared'

type MemoryRow = {
  id: string
  scope: MemoryScope
  project_id: string | null
  kind: string
  title: string | null
  content: string
  tags_json: string
  source: string
  conversation_id: string | null
  embedding_model: string
  embedding_json: string
  created_at: string
  updated_at: string
  last_accessed_at: string | null
  access_count: number
  archived: number
  importance: number
  stability_hours: number
  emotion_valence: number
  emotion_arousal: number
  decay_factor: number
  topic_key: string
  confidence: number
  schema_version: number
  reinforced_at: string | null
  last_used_at: string | null
  times_used: number
  source_conversation_id: string | null
  origin_type: string
  status: MemoryStatusValue
  visibility: MemoryVisibilityValue
  fingerprint: string
  last_seen_at: string | null
}

type SearchCandidate = MemoryRow & {
  fts_rank: number
}

function memoryInvalidArgs(message: string): ExtensionHostCallResult {
  return { ok: false, error: { code: 'invalid_args', message } }
}

function normalizeMemoryLimit(value: unknown, defaultValue: number, maxValue: number): number | ExtensionHostCallResult {
  if (typeof value === 'undefined' || value === null) return defaultValue
  if (typeof value !== 'number' || !Number.isFinite(value)) return memoryInvalidArgs('limit must be a finite number')
  if (!Number.isInteger(value)) return memoryInvalidArgs('limit must be an integer')
  if (value < 1) return memoryInvalidArgs('limit must be at least 1')
  if (value > maxValue) return memoryInvalidArgs(`limit must be at most ${maxValue}`)
  return value
}

function memorySafeParseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function memoryReadTags(row: Pick<MemoryRow, 'tags_json'>) {
  return memorySafeParseJson<string[]>(row.tags_json, [])
}

function memoryHydrateRow(row: MemoryRow) {
  return {
    id: row.id,
    scope: row.scope,
    projectId: row.project_id,
    kind: normalizeMemoryKind(row.kind),
    title: row.title,
    content: row.content,
    tags: memoryReadTags(row),
    topicKey: row.topic_key || buildTopicKey(row),
    confidence: Number(row.confidence ?? 0.5),
    schemaVersion: Number(row.schema_version ?? 0),
    source: row.source,
    conversationId: row.conversation_id,
    sourceConversationId: row.source_conversation_id ?? row.conversation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reinforcedAt: row.reinforced_at,
    lastUsedAt: row.last_used_at,
    lastSeenAt: row.last_seen_at,
    lastAccessedAt: row.last_accessed_at,
    accessCount: row.access_count,
    timesUsed: row.times_used ?? 0,
    archived: Boolean(row.archived),
    importance: row.importance,
    stabilityHours: row.stability_hours,
    emotionValence: row.emotion_valence,
    emotionArousal: row.emotion_arousal,
    decayFactor: row.decay_factor,
    originType: row.origin_type || 'legacy',
    status: row.status === MEMORY_STATUS.SUPERSEDED ? MEMORY_STATUS.SUPERSEDED : MEMORY_STATUS.ACTIVE,
    visibility: row.visibility === MEMORY_VISIBILITY.SHARED ? MEMORY_VISIBILITY.SHARED : MEMORY_VISIBILITY.PRIVATE,
    fingerprint: row.fingerprint,
  }
}

function memoryValidateScope(scope: unknown): scope is MemoryScope {
  return scope === 'global' || scope === 'project'
}

function listMemoryRows(filters?: {
  scope?: MemoryListScope
  projectId?: string
  kind?: string
  includeArchived?: boolean
  includeSuperseded?: boolean
  limit?: number
}) {
  const db = getDb()
  const conditions: string[] = []
  const params: unknown[] = []

  if (!filters?.includeArchived) conditions.push('archived = 0')
  if (!filters?.includeSuperseded) conditions.push("status = 'active'")

  if (filters?.scope === 'global') {
    conditions.push("scope = 'global'")
  } else if (filters?.scope === 'project') {
    conditions.push("scope = 'project'")
  } else if (filters?.scope === 'all' && filters?.projectId) {
    conditions.push("(scope = 'global' OR (scope = 'project' AND project_id = ?))")
    params.push(filters.projectId)
  }

  if (filters?.scope === 'project' && filters?.projectId) {
    conditions.push('project_id = ?')
    params.push(filters.projectId)
  }

  if (filters?.kind) {
    conditions.push('kind = ?')
    params.push(normalizeMemoryKind(filters.kind))
  }

  let sql = 'SELECT * FROM memory_entries'
  if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`
  sql += ' ORDER BY updated_at DESC'
  if (filters?.limit && Number.isFinite(filters.limit)) sql += ` LIMIT ${Math.max(1, Math.floor(filters.limit))}`

  return db.prepare(sql).all(...params) as MemoryRow[]
}

function refreshMemoryFts(row: {
  id: string
  title: string | null
  content: string
  tags_json: string
  topic_key: string
}) {
  const db = getDb()
  db.prepare('DELETE FROM memory_entries_fts WHERE memory_id = ?').run(row.id)
  db.prepare(
    'INSERT INTO memory_entries_fts(memory_id, title, content, tags, topic_key) VALUES (?, ?, ?, ?, ?)',
  ).run(
    row.id,
    row.title ?? '',
    row.content ?? '',
    row.tags_json ?? '[]',
    row.topic_key ?? '',
  )
}

function deleteMemoryFts(id: string) {
  getDb().prepare('DELETE FROM memory_entries_fts WHERE memory_id = ?').run(id)
}

function markMemorySeen(id: string) {
  const now = new Date().toISOString()
  getDb()
    .prepare('UPDATE memory_entries SET last_seen_at = ?, last_accessed_at = ?, access_count = access_count + 1 WHERE id = ?')
    .run(now, now, id)
}

function reinforceMemory(id: string) {
  const now = new Date().toISOString()
  getDb()
    .prepare(
      'UPDATE memory_entries SET reinforced_at = ?, last_used_at = ?, last_accessed_at = ?, access_count = access_count + 1, times_used = times_used + 1, updated_at = ? WHERE id = ?',
    )
    .run(now, now, now, now, id)
}

function coerceTags(input: unknown) {
  return Array.isArray(input)
    ? input
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
    : []
}

function readMemoryRowById(id: string) {
  return getDb().prepare('SELECT * FROM memory_entries WHERE id = ?').get(id) as MemoryRow | undefined
}

function upsertMemoryRow(payload: {
  id?: string
  scope: MemoryScope
  projectId?: string | null
  kind?: string | null
  title?: string | null
  content: string
  tags?: string[]
  source?: string | null
  conversationId?: string | null
  sourceConversationId?: string | null
  topicKey?: string | null
  confidence?: number | null
  visibility?: MemoryVisibilityValue | null
  importance?: number | null
  stabilityHours?: number | null
  emotionValence?: number | null
  emotionArousal?: number | null
  originType?: string | null
  schemaVersion?: number | null
  status?: MemoryStatusValue | null
  fingerprint?: string | null
}) {
  const db = getDb()
  const now = new Date().toISOString()
  const id = payload.id?.trim() || crypto.randomUUID()
  const kind = normalizeMemoryKind(payload.kind)
  const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : null
  const tags = coerceTags(payload.tags)
  const topicKey = buildTopicKey({
    topicKey: payload.topicKey,
    kind,
    title,
    content: payload.content,
    tags,
  })
  const confidence =
    typeof payload.confidence === 'number' && Number.isFinite(payload.confidence)
      ? Math.min(1, Math.max(0, payload.confidence))
      : 0.5
  const visibility = payload.visibility === MEMORY_VISIBILITY.SHARED ? MEMORY_VISIBILITY.SHARED : MEMORY_VISIBILITY.PRIVATE
  const source = typeof payload.source === 'string' && payload.source.trim() ? payload.source.trim() : 'manual'
  const conversationId = payload.conversationId?.trim() || null
  const sourceConversationId = payload.sourceConversationId?.trim() || conversationId
  const originType =
    typeof payload.originType === 'string' && payload.originType.trim()
      ? payload.originType.trim()
      : 'manual'
  const status = payload.status === MEMORY_STATUS.SUPERSEDED ? MEMORY_STATUS.SUPERSEDED : MEMORY_STATUS.ACTIVE
  const importance =
    typeof payload.importance === 'number'
      ? Math.min(1, Math.max(0, payload.importance))
      : getDefaultImportance(kind)
  const stabilityHours =
    typeof payload.stabilityHours === 'number'
      ? Math.max(1, Math.floor(payload.stabilityHours))
      : getDefaultStability(kind)
  const defaultEmotion = getDefaultEmotion(kind)
  const emotionValence =
    typeof payload.emotionValence === 'number'
      ? Math.min(1, Math.max(-1, payload.emotionValence))
      : defaultEmotion.valence
  const emotionArousal =
    typeof payload.emotionArousal === 'number'
      ? Math.min(1, Math.max(0, payload.emotionArousal))
      : defaultEmotion.arousal
  const schemaVersion =
    typeof payload.schemaVersion === 'number' && Number.isFinite(payload.schemaVersion)
      ? Math.max(0, Math.floor(payload.schemaVersion))
      : MEMORY_SCHEMA_VERSION
  const fingerprint =
    payload.fingerprint?.trim() ||
    buildMemoryFingerprint({
      scope: payload.scope,
      projectId: payload.projectId ?? null,
      kind,
      topicKey,
      title,
      content: payload.content,
      tags,
    })

  if (shouldSupersedeKind(kind)) {
    db.prepare(
      `UPDATE memory_entries
         SET status = 'superseded', updated_at = ?, origin_type = CASE WHEN origin_type = 'legacy' THEN origin_type ELSE 'superseded' END
       WHERE fingerprint = ? AND id != ? AND status = 'active' AND archived = 0`,
    ).run(now, fingerprint, id)
  }

  const existingById = readMemoryRowById(id)
  const existingByFingerprint = !existingById
    ? (db
        .prepare(
          `SELECT * FROM memory_entries
             WHERE fingerprint = ? AND status = 'active' AND archived = 0
             LIMIT 1`,
        )
        .get(fingerprint) as MemoryRow | undefined)
    : undefined
  const existing = existingById ?? existingByFingerprint
  const targetId = existing?.id ?? id

  const rowPayload = {
    scope: payload.scope,
    projectId: payload.projectId ?? null,
    kind,
    title,
    content: payload.content.trim(),
    tagsJson: JSON.stringify(tags),
    source,
    conversationId,
    sourceConversationId,
    now,
    importance,
    stabilityHours,
    emotionValence,
    emotionArousal,
    topicKey,
    confidence,
    schemaVersion,
    reinforcedAt: existing?.reinforced_at ?? null,
    lastUsedAt: existing?.last_used_at ?? null,
    timesUsed: existing?.times_used ?? 0,
    originType,
    status,
    visibility,
    fingerprint,
  }

  if (existing) {
    db.prepare(`UPDATE memory_entries
      SET scope = ?, project_id = ?, kind = ?, title = ?, content = ?, tags_json = ?, source = ?, conversation_id = ?,
          updated_at = ?, importance = ?, stability_hours = ?, emotion_valence = ?, emotion_arousal = ?, decay_factor = ?,
          topic_key = ?, confidence = ?, schema_version = ?, source_conversation_id = ?, origin_type = ?, status = ?, visibility = ?, fingerprint = ?
      WHERE id = ?`).run(
      rowPayload.scope,
      rowPayload.projectId,
      rowPayload.kind,
      rowPayload.title,
      rowPayload.content,
      rowPayload.tagsJson,
      rowPayload.source,
      rowPayload.conversationId,
      rowPayload.now,
      rowPayload.importance,
      rowPayload.stabilityHours,
      rowPayload.emotionValence,
      rowPayload.emotionArousal,
      1.0,
      rowPayload.topicKey,
      rowPayload.confidence,
      rowPayload.schemaVersion,
      rowPayload.sourceConversationId,
      rowPayload.originType,
      rowPayload.status,
      rowPayload.visibility,
      rowPayload.fingerprint,
      targetId,
    )
  } else {
    db.prepare(`INSERT INTO memory_entries (
      id, scope, project_id, kind, title, content, tags_json, source, conversation_id,
      embedding_model, embedding_json, created_at, updated_at, archived,
      importance, stability_hours, emotion_valence, emotion_arousal, decay_factor,
      topic_key, confidence, schema_version, reinforced_at, last_used_at, times_used,
      source_conversation_id, origin_type, status, visibility, fingerprint, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '[]', ?, ?, 0, ?, ?, ?, ?, 1.0, ?, ?, ?, NULL, NULL, 0, ?, ?, ?, ?, ?, NULL)`).run(
      targetId,
      rowPayload.scope,
      rowPayload.projectId,
      rowPayload.kind,
      rowPayload.title,
      rowPayload.content,
      rowPayload.tagsJson,
      rowPayload.source,
      rowPayload.conversationId,
      rowPayload.now,
      rowPayload.now,
      rowPayload.importance,
      rowPayload.stabilityHours,
      rowPayload.emotionValence,
      rowPayload.emotionArousal,
      rowPayload.topicKey,
      rowPayload.confidence,
      rowPayload.schemaVersion,
      rowPayload.sourceConversationId,
      rowPayload.originType,
      rowPayload.status,
      rowPayload.visibility,
      rowPayload.fingerprint,
    )
  }

  const next = readMemoryRowById(targetId)
  if (next) {
    refreshMemoryFts({
      id: next.id,
      title: next.title,
      content: next.content,
      tags_json: next.tags_json,
      topic_key: next.topic_key || topicKey,
    })
  }
  return next
}

function backfillLegacyRows(limit: number = 50) {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT * FROM memory_entries
         WHERE schema_version = 0 OR topic_key = '' OR fingerprint = ''
         ORDER BY updated_at DESC
         LIMIT ?`,
    )
    .all(limit) as MemoryRow[]

  for (const row of rows) {
    const tags = memoryReadTags(row)
    const topicKey = buildTopicKey({
      kind: row.kind,
      title: row.title,
      content: row.content,
      tags,
    })
    const fingerprint = buildMemoryFingerprint({
      scope: row.scope,
      projectId: row.project_id,
      kind: row.kind,
      topicKey,
      title: row.title,
      content: row.content,
      tags,
    })
    db.prepare(
      `UPDATE memory_entries
         SET topic_key = ?, schema_version = ?, fingerprint = ?, source_conversation_id = COALESCE(source_conversation_id, conversation_id), origin_type = CASE WHEN origin_type = 'legacy' THEN 'legacy' ELSE origin_type END, status = COALESCE(NULLIF(status, ''), 'active'), visibility = COALESCE(NULLIF(visibility, ''), 'private')
       WHERE id = ?`,
    ).run(topicKey, MEMORY_SCHEMA_VERSION, fingerprint, row.id)

    refreshMemoryFts({
      id: row.id,
      title: row.title,
      content: row.content,
      tags_json: row.tags_json,
      topic_key: topicKey,
    })
  }
}

function searchCandidateRows(params: {
  query: string
  scope: MemoryListScope
  projectId?: string
  kind?: string
  includeArchived?: boolean
  tagsFilter?: string[]
  candidateLimit?: number
}) {
  backfillLegacyRows(80)

  const db = getDb()
  const terms = params.query
    .trim()
    .split(/\s+/)
    .map((term) => term.replace(/["']/g, ''))
    .filter(Boolean)
  const ftsQuery = terms.length > 0 ? terms.map((term) => `${term}*`).join(' OR ') : '*'

  const conditions: string[] = []
  const sqlParams: unknown[] = [ftsQuery]

  if (!params.includeArchived) conditions.push('m.archived = 0')
  conditions.push("m.status = 'active'")

  if (params.scope === 'global') {
    conditions.push("m.scope = 'global'")
  } else if (params.scope === 'project') {
    conditions.push("m.scope = 'project'")
    if (params.projectId) {
      conditions.push('m.project_id = ?')
      sqlParams.push(params.projectId)
    }
  } else if (params.scope === 'all' && params.projectId) {
    conditions.push("(m.scope = 'global' OR (m.scope = 'project' AND m.project_id = ?))")
    sqlParams.push(params.projectId)
  }

  if (params.kind) {
    conditions.push('m.kind = ?')
    sqlParams.push(normalizeMemoryKind(params.kind))
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = db
    .prepare(
      `SELECT m.*, (1.0 / (1.0 + bm25(memory_entries_fts))) AS fts_rank
         FROM memory_entries_fts
         JOIN memory_entries m ON m.id = memory_entries_fts.memory_id
         ${whereClause}
         ORDER BY bm25(memory_entries_fts)
         LIMIT ?`,
    )
    .all(...sqlParams, params.candidateLimit ?? 120) as SearchCandidate[]

  const tagsFilter = (params.tagsFilter ?? []).map((tag) => tag.toLowerCase())
  return rows.filter((row) => {
    if (tagsFilter.length === 0) return true
    const tags = memoryReadTags(row).map((tag) => tag.toLowerCase())
    return tagsFilter.every((tag) => tags.includes(tag))
  })
}

export function memoryUpsert(payload: unknown): ExtensionHostCallResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: { code: 'invalid_args', message: 'payload object expected' } }
  }
  const p = payload as Record<string, unknown>
  const scope = p.scope
  if (!memoryValidateScope(scope)) {
    return { ok: false, error: { code: 'invalid_args', message: 'scope must be global or project' } }
  }
  const projectId = typeof p.projectId === 'string' && p.projectId.trim() ? p.projectId.trim() : null
  if (scope === 'project' && !projectId) {
    return { ok: false, error: { code: 'invalid_args', message: 'projectId is required when scope=project' } }
  }
  const content = typeof p.content === 'string' ? p.content.trim() : ''
  if (!content) {
    return { ok: false, error: { code: 'invalid_args', message: 'content is required' } }
  }

  const row = upsertMemoryRow({
    id: typeof p.id === 'string' ? p.id : undefined,
    scope,
    projectId,
    kind: typeof p.kind === 'string' ? p.kind : null,
    title: typeof p.title === 'string' ? p.title : null,
    content,
    tags: coerceTags(p.tags),
    source: typeof p.source === 'string' ? p.source : null,
    conversationId: typeof p.conversationId === 'string' ? p.conversationId : null,
    sourceConversationId: typeof p.sourceConversationId === 'string' ? p.sourceConversationId : null,
    topicKey: typeof p.topicKey === 'string' ? p.topicKey : null,
    confidence: typeof p.confidence === 'number' ? p.confidence : null,
    visibility: p.visibility === MEMORY_VISIBILITY.SHARED ? MEMORY_VISIBILITY.SHARED : MEMORY_VISIBILITY.PRIVATE,
    importance: typeof p.importance === 'number' ? p.importance : null,
    stabilityHours: typeof p.stabilityHours === 'number' ? p.stabilityHours : null,
    emotionValence: typeof p.emotionValence === 'number' ? p.emotionValence : null,
    emotionArousal: typeof p.emotionArousal === 'number' ? p.emotionArousal : null,
    originType: typeof p.originType === 'string' ? p.originType : null,
    schemaVersion: MEMORY_SCHEMA_VERSION,
    status: p.status === MEMORY_STATUS.SUPERSEDED ? MEMORY_STATUS.SUPERSEDED : MEMORY_STATUS.ACTIVE,
  })

  return { ok: true, data: row ? memoryHydrateRow(row) : null }
}

export function memorySearch(payload: unknown): ExtensionHostCallResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: { code: 'invalid_args', message: 'payload object expected' } }
  }
  const p = payload as Record<string, unknown>
  const query = typeof p.query === 'string' ? p.query.trim() : ''
  if (!query) {
    return { ok: false, error: { code: 'invalid_args', message: 'query is required' } }
  }

  const scope = p.scope === 'global' || p.scope === 'project' || p.scope === 'all' ? p.scope : 'all'
  const projectId = typeof p.projectId === 'string' && p.projectId.trim() ? p.projectId.trim() : undefined
  const kind = typeof p.kind === 'string' && p.kind.trim() ? p.kind.trim() : undefined
  const includeArchived = p.includeArchived === true
  const limit = normalizeMemoryLimit(p.limit, 10, 100)
  if (typeof limit !== 'number') return limit
  const tagsFilter = Array.isArray(p.tags)
    ? p.tags
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim().toLowerCase())
    : []

  const candidates = searchCandidateRows({
    query,
    scope,
    projectId,
    kind,
    includeArchived,
    tagsFilter,
    candidateLimit: Math.max(50, limit * 8),
  })

  const ranked = rerankMemoryCandidates({
    query,
    limit,
    candidates: candidates.map((row) => ({
      ...memoryHydrateRow(row),
      ftsRank: Number(row.fts_rank ?? 0),
      status: row.status,
      confidence: row.confidence,
      importance: row.importance,
      reinforcedAt: row.reinforced_at,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
      timesUsed: row.times_used,
    })),
  }).map((item) => ({
    ...item,
    score: Number(item.score.toFixed(4)),
  }))

  for (const item of ranked) markMemorySeen(item.id)
  return { ok: true, data: ranked }
}

export function memoryGet(payload: unknown): ExtensionHostCallResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof (payload as Record<string, unknown>).id !== 'string') {
    return { ok: false, error: { code: 'invalid_args', message: 'id is required' } }
  }
  const id = ((payload as Record<string, unknown>).id as string).trim()
  const row = readMemoryRowById(id)
  if (!row) return { ok: false, error: { code: 'not_found', message: 'memory not found' } }
  reinforceMemory(id)
  const next = readMemoryRowById(id)
  return { ok: true, data: next ? memoryHydrateRow(next) : memoryHydrateRow(row) }
}

export function memoryUpdate(payload: unknown): ExtensionHostCallResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof (payload as Record<string, unknown>).id !== 'string') {
    return { ok: false, error: { code: 'invalid_args', message: 'id is required' } }
  }
  const p = payload as Record<string, unknown>
  const id = String(p.id).trim()
  const row = readMemoryRowById(id)
  if (!row) return { ok: false, error: { code: 'not_found', message: 'memory not found' } }

  const next = upsertMemoryRow({
    id,
    scope: row.scope,
    projectId: row.project_id,
    kind: typeof p.kind === 'string' ? p.kind : row.kind,
    title: typeof p.title === 'string' ? p.title : row.title,
    content: typeof p.content === 'string' ? p.content.trim() || row.content : row.content,
    tags: Array.isArray(p.tags) ? coerceTags(p.tags) : memoryReadTags(row),
    source: row.source,
    conversationId: row.conversation_id,
    sourceConversationId: row.source_conversation_id ?? row.conversation_id,
    topicKey: typeof p.topicKey === 'string' ? p.topicKey : row.topic_key,
    confidence: typeof p.confidence === 'number' ? p.confidence : row.confidence,
    visibility:
      p.visibility === MEMORY_VISIBILITY.SHARED || p.visibility === MEMORY_VISIBILITY.PRIVATE
        ? (p.visibility as MemoryVisibilityValue)
        : row.visibility,
    importance: row.importance,
    stabilityHours: row.stability_hours,
    emotionValence: row.emotion_valence,
    emotionArousal: row.emotion_arousal,
    originType: typeof p.originType === 'string' ? p.originType : row.origin_type,
    schemaVersion: MEMORY_SCHEMA_VERSION,
    status:
      p.status === MEMORY_STATUS.SUPERSEDED
        ? MEMORY_STATUS.SUPERSEDED
        : typeof p.archived === 'boolean' && p.archived
          ? row.status
          : row.status,
    fingerprint: row.fingerprint,
  })

  if (typeof p.archived === 'boolean') {
    getDb().prepare('UPDATE memory_entries SET archived = ?, updated_at = ? WHERE id = ?').run(
      p.archived ? 1 : 0,
      new Date().toISOString(),
      id,
    )
  }

  const finalRow = readMemoryRowById(id)
  return { ok: true, data: finalRow ? memoryHydrateRow(finalRow) : next ? memoryHydrateRow(next) : null }
}

export function memoryDelete(payload: unknown): ExtensionHostCallResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof (payload as Record<string, unknown>).id !== 'string') {
    return { ok: false, error: { code: 'invalid_args', message: 'id is required' } }
  }
  const id = ((payload as Record<string, unknown>).id as string).trim()
  const info = getDb().prepare('DELETE FROM memory_entries WHERE id = ?').run(id)
  deleteMemoryFts(id)
  if (info.changes < 1) return { ok: false, error: { code: 'not_found', message: 'memory not found' } }
  return { ok: true, data: { id, deleted: true } }
}

export function memoryList(payload: unknown): ExtensionHostCallResult {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {}
  const scope = p.scope === 'global' || p.scope === 'project' || p.scope === 'all' ? p.scope : 'all'
  const projectId = typeof p.projectId === 'string' && p.projectId.trim() ? p.projectId.trim() : undefined
  const kind = typeof p.kind === 'string' && p.kind.trim() ? p.kind.trim() : undefined
  const includeArchived = p.includeArchived === true
  const limit = normalizeMemoryLimit(p.limit, 50, 500)
  if (typeof limit !== 'number') return limit
  const includeSuperseded = p.includeSuperseded === true
  backfillLegacyRows(80)

  return {
    ok: true,
    data: listMemoryRows({
      scope,
      projectId,
      kind,
      includeArchived,
      includeSuperseded,
      limit,
    }).map(memoryHydrateRow),
  }
}

export function memoryStats(payload: unknown): ExtensionHostCallResult {
  backfillLegacyRows(80)
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {}
  const scope = p.scope === 'global' || p.scope === 'project' || p.scope === 'all' ? p.scope : 'all'
  const projectId = typeof p.projectId === 'string' && p.projectId.trim() ? p.projectId.trim() : undefined
  const kind = typeof p.kind === 'string' && p.kind.trim() ? p.kind.trim() : undefined
  const includeArchived = p.includeArchived === true
  const includeSuperseded = p.includeSuperseded === true

  const rows = listMemoryRows({
    scope,
    projectId,
    kind,
    includeArchived,
    includeSuperseded,
    limit: 100000,
  }).map(memoryHydrateRow)

  return { ok: true, data: summarizeMemoryStats(rows) }
}

export function memoryMarkUsed(payload: unknown): ExtensionHostCallResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof (payload as Record<string, unknown>).id !== 'string') {
    return { ok: false, error: { code: 'invalid_args', message: 'id is required' } }
  }
  const id = ((payload as Record<string, unknown>).id as string).trim()
  const row = readMemoryRowById(id)
  if (!row) return { ok: false, error: { code: 'not_found', message: 'memory not found' } }
  reinforceMemory(id)
  const next = readMemoryRowById(id)
  return { ok: true, data: next ? memoryHydrateRow(next) : memoryHydrateRow(row) }
}
