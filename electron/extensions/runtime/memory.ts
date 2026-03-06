import crypto from 'node:crypto'
import { getDb } from '../../db/index.js'
import type { ExtensionHostCallResult } from './types.js'

const MEMORY_EMBEDDING_MODEL = 'chatons-local-hash-trigram-v1'
const MEMORY_VECTOR_SIZE = 256

type MemoryScope = 'global' | 'project'
type MemoryListScope = MemoryScope | 'all'

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
}

function memoryNormalizeText(input: string) {
  return String(input || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function memoryHashToken(token: string) {
  let hash = 2166136261
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0)
}

function memoryBuildEmbedding(text: string) {
  const normalized = ` ${memoryNormalizeText(text)} `
  const vector = new Array<number>(MEMORY_VECTOR_SIZE).fill(0)
  for (let i = 0; i < normalized.length - 2; i += 1) {
    const gram = normalized.slice(i, i + 3)
    const hash = memoryHashToken(gram)
    const idx = hash % MEMORY_VECTOR_SIZE
    vector[idx] += 1
  }
  let norm = 0
  for (const value of vector) norm += value * value
  norm = Math.sqrt(norm) || 1
  return vector.map((value) => Number((value / norm).toFixed(6)))
}

function memoryCosineSimilarity(a: number[], b: number[]) {
  const len = Math.min(a.length, b.length)
  let dot = 0
  for (let i = 0; i < len; i += 1) dot += a[i] * b[i]
  return dot
}

function memorySafeParseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function memoryReadTags(row: MemoryRow) {
  return memorySafeParseJson<string[]>(row.tags_json, [])
}

function memoryHydrateRow(row: MemoryRow) {
  return {
    id: row.id,
    scope: row.scope,
    projectId: row.project_id,
    kind: row.kind,
    title: row.title,
    content: row.content,
    tags: memoryReadTags(row),
    source: row.source,
    conversationId: row.conversation_id,
    embeddingModel: row.embedding_model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastAccessedAt: row.last_accessed_at,
    accessCount: row.access_count,
    archived: Boolean(row.archived),
  }
}

function memoryListRows(filters?: {
  scope?: MemoryListScope
  projectId?: string
  kind?: string
  includeArchived?: boolean
  limit?: number
}) {
  const db = getDb()
  const conditions: string[] = []
  const params: unknown[] = []

  if (!filters?.includeArchived) conditions.push('archived = 0')
  if (filters?.scope === 'global') conditions.push("scope = 'global'")
  if (filters?.scope === 'project') conditions.push("scope = 'project'")
  if (filters?.projectId) {
    conditions.push('project_id = ?')
    params.push(filters.projectId)
  }
  if (filters?.kind) {
    conditions.push('kind = ?')
    params.push(filters.kind)
  }

  let sql = 'SELECT * FROM memory_entries'
  if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`
  sql += ' ORDER BY updated_at DESC'
  if (filters?.limit && Number.isFinite(filters.limit)) sql += ` LIMIT ${Math.max(1, Math.floor(filters.limit))}`

  return db.prepare(sql).all(...params) as MemoryRow[]
}

function memoryTouch(id: string) {
  const db = getDb()
  const now = new Date().toISOString()
  db.prepare('UPDATE memory_entries SET last_accessed_at = ?, access_count = access_count + 1 WHERE id = ?').run(now, id)
}

function memoryValidateScope(scope: unknown): scope is MemoryScope {
  return scope === 'global' || scope === 'project'
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
  const db = getDb()
  const now = new Date().toISOString()
  const id = typeof p.id === 'string' && p.id.trim() ? p.id.trim() : crypto.randomUUID()
  const title = typeof p.title === 'string' && p.title.trim() ? p.title.trim() : null
  const kind = typeof p.kind === 'string' && p.kind.trim() ? p.kind.trim() : 'fact'
  const tags = Array.isArray(p.tags) ? p.tags.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()) : []
  const source = typeof p.source === 'string' && p.source.trim() ? p.source.trim() : 'manual'
  const conversationId = typeof p.conversationId === 'string' && p.conversationId.trim() ? p.conversationId.trim() : null
  const embedding = memoryBuildEmbedding([title || '', kind, content, tags.join(' ')].filter(Boolean).join('\n'))

  const existing = db.prepare('SELECT id FROM memory_entries WHERE id = ?').get(id) as { id: string } | undefined
  if (existing) {
    db.prepare(`UPDATE memory_entries
      SET scope = ?, project_id = ?, kind = ?, title = ?, content = ?, tags_json = ?, source = ?, conversation_id = ?,
          embedding_model = ?, embedding_json = ?, updated_at = ?
      WHERE id = ?`).run(
      scope,
      projectId,
      kind,
      title,
      content,
      JSON.stringify(tags),
      source,
      conversationId,
      MEMORY_EMBEDDING_MODEL,
      JSON.stringify(embedding),
      now,
      id,
    )
  } else {
    db.prepare(`INSERT INTO memory_entries (
      id, scope, project_id, kind, title, content, tags_json, source, conversation_id,
      embedding_model, embedding_json, created_at, updated_at, archived
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
      id,
      scope,
      projectId,
      kind,
      title,
      content,
      JSON.stringify(tags),
      source,
      conversationId,
      MEMORY_EMBEDDING_MODEL,
      JSON.stringify(embedding),
      now,
      now,
    )
  }

  const row = db.prepare('SELECT * FROM memory_entries WHERE id = ?').get(id) as MemoryRow | undefined
  return { ok: true, data: row ? memoryHydrateRow(row) : { id } }
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
  const limit = typeof p.limit === 'number' && Number.isFinite(p.limit) ? Math.max(1, Math.floor(p.limit)) : 10
  const tagsFilter = Array.isArray(p.tags) ? p.tags.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim().toLowerCase()) : []
  const queryEmbedding = memoryBuildEmbedding(query)
  const rows = memoryListRows({ scope, projectId, kind, includeArchived, limit: 500 })

  const ranked = rows
    .map((row) => {
      const embedding = memorySafeParseJson<number[]>(row.embedding_json, [])
      const tags = memoryReadTags(row)
      const lowerTags = tags.map((tag) => tag.toLowerCase())
      if (tagsFilter.length > 0 && !tagsFilter.every((tag) => lowerTags.includes(tag))) return null
      let score = memoryCosineSimilarity(queryEmbedding, embedding)
      const haystack = `${row.title || ''}\n${row.kind}\n${row.content}\n${tags.join(' ')}`.toLowerCase()
      const normalizedQuery = query.toLowerCase()
      if (haystack.includes(normalizedQuery)) score += 0.2
      return { row, score }
    })
    .filter((item): item is { row: MemoryRow; score: number } => item !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => ({ ...memoryHydrateRow(item.row), score: Number(item.score.toFixed(4)) }))

  for (const item of ranked) memoryTouch(item.id)
  return { ok: true, data: ranked }
}

export function memoryGet(payload: unknown): ExtensionHostCallResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof (payload as Record<string, unknown>).id !== 'string') {
    return { ok: false, error: { code: 'invalid_args', message: 'id is required' } }
  }
  const id = ((payload as Record<string, unknown>).id as string).trim()
  const row = getDb().prepare('SELECT * FROM memory_entries WHERE id = ?').get(id) as MemoryRow | undefined
  if (!row) return { ok: false, error: { code: 'not_found', message: 'memory not found' } }
  memoryTouch(id)
  return { ok: true, data: memoryHydrateRow(row) }
}

export function memoryUpdate(payload: unknown): ExtensionHostCallResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof (payload as Record<string, unknown>).id !== 'string') {
    return { ok: false, error: { code: 'invalid_args', message: 'id is required' } }
  }
  const p = payload as Record<string, unknown>
  const id = String(p.id).trim()
  const db = getDb()
  const row = db.prepare('SELECT * FROM memory_entries WHERE id = ?').get(id) as MemoryRow | undefined
  if (!row) return { ok: false, error: { code: 'not_found', message: 'memory not found' } }

  const title = typeof p.title === 'string' ? p.title.trim() || null : row.title
  const content = typeof p.content === 'string' ? p.content.trim() || row.content : row.content
  const kind = typeof p.kind === 'string' && p.kind.trim() ? p.kind.trim() : row.kind
  const tags = Array.isArray(p.tags) ? p.tags.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()) : memoryReadTags(row)
  const archived = typeof p.archived === 'boolean' ? (p.archived ? 1 : 0) : row.archived
  const updatedAt = new Date().toISOString()
  const embedding = memoryBuildEmbedding([title || '', kind, content, tags.join(' ')].filter(Boolean).join('\n'))

  db.prepare(`UPDATE memory_entries
    SET title = ?, content = ?, kind = ?, tags_json = ?, archived = ?, embedding_model = ?, embedding_json = ?, updated_at = ?
    WHERE id = ?`).run(
    title,
    content,
    kind,
    JSON.stringify(tags),
    archived,
    MEMORY_EMBEDDING_MODEL,
    JSON.stringify(embedding),
    updatedAt,
    id,
  )

  const next = db.prepare('SELECT * FROM memory_entries WHERE id = ?').get(id) as MemoryRow
  return { ok: true, data: memoryHydrateRow(next) }
}

export function memoryDelete(payload: unknown): ExtensionHostCallResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof (payload as Record<string, unknown>).id !== 'string') {
    return { ok: false, error: { code: 'invalid_args', message: 'id is required' } }
  }
  const id = ((payload as Record<string, unknown>).id as string).trim()
  const info = getDb().prepare('DELETE FROM memory_entries WHERE id = ?').run(id)
  if (info.changes < 1) return { ok: false, error: { code: 'not_found', message: 'memory not found' } }
  return { ok: true, data: { id, deleted: true } }
}

export function memoryList(payload: unknown): ExtensionHostCallResult {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {}
  const scope = p.scope === 'global' || p.scope === 'project' || p.scope === 'all' ? p.scope : 'all'
  const projectId = typeof p.projectId === 'string' && p.projectId.trim() ? p.projectId.trim() : undefined
  const kind = typeof p.kind === 'string' && p.kind.trim() ? p.kind.trim() : undefined
  const includeArchived = p.includeArchived === true
  const limit = typeof p.limit === 'number' && Number.isFinite(p.limit) ? Math.max(1, Math.floor(p.limit)) : 50
  return { ok: true, data: memoryListRows({ scope, projectId, kind, includeArchived, limit }).map(memoryHydrateRow) }
}
