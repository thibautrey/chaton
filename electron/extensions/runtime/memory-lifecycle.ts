import crypto from 'node:crypto'
import {
  buildMemoryCapturePrompt,
  parseMemoryCaptureResponse,
  shouldPersistCapturedEntry,
  summarizeMemoryStats,
} from '../../../packages/memory/index.js'
import { getDb } from '../../db/index.js'
import {
  findConversationById,
  listConversationMessagesCache,
} from '../../db/repos/conversations.js'
import { memoryList, memoryStats, memoryUpsert } from './memory.js'
import { parseModelKey, stripThinkingBlocks } from './helpers.js'
import type { PiSessionRuntimeManager } from '../../pi-sdk-runtime.js'
import { calculateAutoImportance, calculateDecayFactor, shouldArchiveMemory } from './memory-scoring.js'

const MEMORY_MODEL_SETTINGS_KEY = 'memory_model'
const CAPTURE_IDLE_MS = 10 * 60 * 1000

type CaptureQueueEntry = {
  conversationId: string
  checkpointHash: string
  idleDueAt: number
  modelKey?: string | null
}

const captureQueue = new Map<string, CaptureQueueEntry>()
let captureInterval: ReturnType<typeof setInterval> | null = null

export function isSqliteBusyError(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === 'object'
      && 'code' in error
      && (error as { code?: unknown }).code === 'SQLITE_BUSY',
  )
}

interface ConversationMetrics {
  text: string
  messageCount: number
  fileEdits: number
  hasErrors: boolean
  durationMinutes: number
}

function ensureCaptureStateTable() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS memory_capture_state (
      conversation_id TEXT PRIMARY KEY,
      last_checkpoint_hash TEXT NOT NULL,
      last_captured_at TEXT NOT NULL
    );
  `)
}

export function getMemoryModelPreference(): string | null {
  const db = getDb()
  const row = db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(MEMORY_MODEL_SETTINGS_KEY) as { value: string } | undefined
  return row?.value ?? null
}

export function setMemoryModelPreference(modelKey: string | null) {
  const db = getDb()
  const now = new Date().toISOString()
  if (modelKey) {
    db.prepare(
      `INSERT INTO app_settings(key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
    ).run(MEMORY_MODEL_SETTINGS_KEY, modelKey, now)
  } else {
    db.prepare('DELETE FROM app_settings WHERE key = ?').run(MEMORY_MODEL_SETTINGS_KEY)
  }
}

function extractConversationMetrics(conversationId: string): ConversationMetrics | null {
  const db = getDb()
  const rows = listConversationMessagesCache(db, conversationId)
  if (rows.length === 0) return null

  const parts: string[] = []
  let messageCount = 0
  let fileEdits = 0
  let hasErrors = false
  let firstTimestamp: number | null = null
  let lastTimestamp: number | null = null

  for (const row of rows) {
    try {
      const msg = JSON.parse(row.payload_json) as Record<string, unknown>
      const role = typeof msg.role === 'string' ? msg.role : ''
      if (role !== 'user' && role !== 'assistant') continue
      messageCount += 1

      const timestamp = typeof row.created_at === 'string' ? new Date(row.created_at).getTime() : null
      if (timestamp) {
        if (!firstTimestamp || timestamp < firstTimestamp) firstTimestamp = timestamp
        if (!lastTimestamp || timestamp > lastTimestamp) lastTimestamp = timestamp
      }

      const content = msg.content
      let text = ''
      if (typeof content === 'string') {
        text = content
      } else if (Array.isArray(content)) {
        text = content
          .filter(
            (part): part is { type: 'text'; text: string } =>
              !!part &&
              typeof part === 'object' &&
              (part as Record<string, unknown>).type === 'text' &&
              typeof (part as Record<string, unknown>).text === 'string',
          )
          .map((part) => part.text)
          .join('\n')
      }

      text = stripThinkingBlocks(text)

      if (
        role === 'assistant' &&
        (text.includes('Created file:') ||
          text.includes('Modified file:') ||
          text.includes('Wrote file:') ||
          text.includes('```'))
      ) {
        const filePathMatches = text.match(/\/[^\s]+\.[a-zA-Z]+/g)
        if (filePathMatches) fileEdits += filePathMatches.length
      }

      if (
        !hasErrors &&
        (text.toLowerCase().includes('error') ||
          text.toLowerCase().includes('exception') ||
          text.toLowerCase().includes('failed') ||
          text.toLowerCase().includes('fix'))
      ) {
        hasErrors = true
      }

      if (text.trim()) {
        parts.push(`${role === 'user' ? 'User' : 'Assistant'}: ${text.trim()}`)
      }
    } catch {
      // ignore malformed messages
    }
  }

  const durationMinutes =
    firstTimestamp && lastTimestamp
      ? Math.round((lastTimestamp - firstTimestamp) / (1000 * 60))
      : 0

  return {
    text: parts.join('\n\n'),
    messageCount,
    fileEdits: Math.min(fileEdits, 50),
    hasErrors,
    durationMinutes,
  }
}

function buildConversationCheckpointHash(conversationId: string, metrics: ConversationMetrics) {
  const base = `${conversationId}:${metrics.messageCount}:${metrics.fileEdits}:${metrics.hasErrors ? 1 : 0}:${metrics.durationMinutes}:${metrics.text}`
  return crypto.createHash('sha256').update(base).digest('hex')
}

function getLastCapturedCheckpoint(conversationId: string): string | null {
  ensureCaptureStateTable()
  const row = getDb()
    .prepare('SELECT last_checkpoint_hash FROM memory_capture_state WHERE conversation_id = ?')
    .get(conversationId) as { last_checkpoint_hash: string } | undefined
  return row?.last_checkpoint_hash ?? null
}

function saveCapturedCheckpoint(conversationId: string, checkpointHash: string) {
  ensureCaptureStateTable()
  const now = new Date().toISOString()
  getDb()
    .prepare(
      `INSERT INTO memory_capture_state(conversation_id, last_checkpoint_hash, last_captured_at) VALUES (?, ?, ?)
       ON CONFLICT(conversation_id) DO UPDATE SET last_checkpoint_hash=excluded.last_checkpoint_hash, last_captured_at=excluded.last_captured_at`,
    )
    .run(conversationId, checkpointHash, now)
}

function collectExistingTopicKeys(params: {
  scope: 'global' | 'project'
  projectId?: string | null
}) {
  const result = memoryList({
    scope: params.scope,
    projectId: params.projectId ?? undefined,
    includeArchived: false,
    limit: 1000,
  })
  if (!result.ok || !Array.isArray(result.data)) return new Set<string>()
  return new Set(
    (result.data as Array<{ topicKey?: string; status?: string }>)
      .filter((entry) => entry.status !== 'superseded')
      .map((entry) => String(entry.topicKey || '').trim())
      .filter(Boolean),
  )
}

export function enqueueConversationMemoryCapture(
  conversationId: string,
  opts?: { modelKey?: string | null },
) {
  const metrics = extractConversationMetrics(conversationId)
  if (!metrics || metrics.text.length < 200) {
    return { queued: false, reason: 'too_short' as const }
  }

  const checkpointHash = buildConversationCheckpointHash(conversationId, metrics)
  const previous = getLastCapturedCheckpoint(conversationId)
  if (previous === checkpointHash) {
    return { queued: false, reason: 'unchanged' as const }
  }

  captureQueue.set(conversationId, {
    conversationId,
    checkpointHash,
    idleDueAt: Date.now() + CAPTURE_IDLE_MS,
    modelKey: opts?.modelKey ?? null,
  })
  return { queued: true, reason: 'scheduled' as const, checkpointHash }
}

async function runCaptureForConversation(
  conversationId: string,
  piRuntimeManager: PiSessionRuntimeManager,
  opts?: { modelKey?: string | null },
) {
  const metrics = extractConversationMetrics(conversationId)
  if (!metrics || metrics.text.length < 200) return { stored: 0, skipped: true }

  const checkpointHash = buildConversationCheckpointHash(conversationId, metrics)
  if (getLastCapturedCheckpoint(conversationId) === checkpointHash) {
    return { stored: 0, skipped: true }
  }

  const db = getDb()
  const conversation = findConversationById(db, conversationId)
  if (!conversation) return { stored: 0, skipped: true }

  const memoryModel = getMemoryModelPreference()
  const modelKey =
    opts?.modelKey ??
    memoryModel ??
    (conversation.model_provider && conversation.model_id
      ? `${conversation.model_provider}/${conversation.model_id}`
      : null)

  const prompt = buildMemoryCapturePrompt({
    conversationText:
      metrics.text.length > 14000
        ? `${metrics.text.slice(0, 14000)}\n\n[...truncated]`
        : metrics.text,
  })

  const ephemeralId = `memory-capture-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  try {
    const { insertConversation } = await import('../../db/repos/conversations.js')
    insertConversation(db, {
      id: ephemeralId,
      projectId: conversation.project_id,
      title: 'Memory Capture',
      hiddenFromSidebar: true,
    })

    const startResult = await piRuntimeManager.start(ephemeralId)
    if (!startResult.ok) return { stored: 0, skipped: true }

    if (modelKey) {
      const parsed = parseModelKey(modelKey)
      if (parsed) {
        await piRuntimeManager.sendCommand(ephemeralId, {
          type: 'set_model',
          provider: parsed.provider,
          modelId: parsed.modelId,
        })
      }
    }

    const response = await piRuntimeManager.sendCommand(ephemeralId, {
      type: 'prompt',
      message: prompt,
    })
    if (!response.success) return { stored: 0, skipped: true }

    const snapshot = await piRuntimeManager.getSnapshot(ephemeralId)
    let output = ''
    const messages = Array.isArray(snapshot.messages) ? snapshot.messages : []
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i] as Record<string, unknown> | null
      if (!msg || msg.role !== 'assistant') continue
      const content = Array.isArray(msg.content) ? msg.content : []
      for (const part of content) {
        const p = part as Record<string, unknown> | null
        if (p?.type === 'text' && typeof p.text === 'string') {
          output = stripThinkingBlocks(p.text)
        }
      }
      if (output) break
    }

    const extracted = parseMemoryCaptureResponse(output)
    if (!extracted.length) {
      saveCapturedCheckpoint(conversationId, checkpointHash)
      return { stored: 0, skipped: true }
    }

    const autoImportance = calculateAutoImportance({
      messageCount: metrics.messageCount,
      fileEdits: metrics.fileEdits,
      hasErrors: metrics.hasErrors,
      durationMinutes: metrics.durationMinutes,
    })

    const scope = conversation.project_id ? 'project' : 'global'
    const visibility = conversation.project_id ? 'shared' : 'private'
    const existingTopics = collectExistingTopicKeys({
      scope,
      projectId: conversation.project_id,
    })

    let stored = 0
    for (const entry of extracted) {
      if (!shouldPersistCapturedEntry(entry)) continue
      const isSummary = entry.kind === 'summary'
      if (isSummary && existingTopics.has(entry.topicKey)) {
        continue
      }

      const result = memoryUpsert({
        scope,
        projectId: conversation.project_id ?? undefined,
        kind: entry.kind,
        title: entry.title || conversation.title || 'Captured memory',
        content: entry.content,
        tags: Array.from(new Set([...(entry.tags ?? []), 'captured'])),
        source: 'auto-capture',
        conversationId,
        sourceConversationId: conversationId,
        topicKey: entry.topicKey,
        confidence: entry.confidence,
        visibility: entry.visibility === 'shared' ? 'shared' : visibility,
        importance: isSummary ? Math.max(0.35, autoImportance - 0.15) : autoImportance,
        emotionValence: metrics.hasErrors ? 0.2 : 0,
        emotionArousal: metrics.hasErrors ? 0.3 : 0.1,
        originType: 'captured',
      })

      if (result.ok) {
        stored += 1
        existingTopics.add(entry.topicKey)
      }
    }

    saveCapturedCheckpoint(conversationId, checkpointHash)
    return { stored, skipped: stored === 0 }
  } catch (error) {
    console.warn('[Memory] capture failed:', error)
    return { stored: 0, skipped: true }
  } finally {
    void piRuntimeManager.stop(ephemeralId).catch(() => {})
  }
}

export async function flushQueuedMemoryCaptures(
  piRuntimeManager: PiSessionRuntimeManager,
): Promise<Array<{ conversationId: string; stored: number; skipped: boolean }>> {
  const due = Array.from(captureQueue.values()).filter((entry) => entry.idleDueAt <= Date.now())
  const results: Array<{ conversationId: string; stored: number; skipped: boolean }> = []
  for (const entry of due) {
    captureQueue.delete(entry.conversationId)
    const result = await runCaptureForConversation(entry.conversationId, piRuntimeManager, {
      modelKey: entry.modelKey ?? null,
    })
    results.push({ conversationId: entry.conversationId, ...result })
  }
  return results
}

export async function captureConversationMemoryNow(
  conversationId: string,
  piRuntimeManager: PiSessionRuntimeManager,
  opts?: { modelKey?: string | null },
): Promise<{ stored: number; skipped: boolean }> {
  captureQueue.delete(conversationId)
  return runCaptureForConversation(conversationId, piRuntimeManager, opts)
}

interface CleanupResult {
  archived: number
  updated: number
}

export function cleanupDecayedMemories(): CleanupResult {
  const db = getDb()
  let archived = 0
  let updated = 0

  const rows = db.prepare(`
    SELECT id, importance, stability_hours, access_count, updated_at, reinforced_at, status
    FROM memory_entries
    WHERE archived = 0
  `).all() as Array<{
    id: string
    importance: number
    stability_hours: number
    access_count: number
    updated_at: string
    reinforced_at: string | null
    status: string
  }>

  for (const row of rows) {
    const decayFactor = calculateDecayFactor(
      row.reinforced_at ?? row.updated_at,
      row.stability_hours,
      row.access_count,
    )

    if (row.status === 'superseded' || shouldArchiveMemory(decayFactor, row.importance)) {
      db.prepare('UPDATE memory_entries SET archived = 1 WHERE id = ?').run(row.id)
      archived += 1
    } else if (decayFactor < 1.0) {
      db.prepare('UPDATE memory_entries SET decay_factor = ? WHERE id = ?').run(decayFactor, row.id)
      updated += 1
    }
  }

  return { archived, updated }
}

export function runMemoryMaintenance() {
  const db = getDb()
  const rows = db.prepare(`
    SELECT id, title, content, tags_json, topic_key
    FROM memory_entries
    WHERE archived = 0
  `).all() as Array<{
    id: string
    title: string | null
    content: string
    tags_json: string
    topic_key: string
  }>

  for (const row of rows) {
    db.prepare('DELETE FROM memory_entries_fts WHERE memory_id = ?').run(row.id)
    db.prepare(
      'INSERT INTO memory_entries_fts(memory_id, title, content, tags, topic_key) VALUES (?, ?, ?, ?, ?)',
    ).run(row.id, row.title ?? '', row.content ?? '', row.tags_json ?? '[]', row.topic_key ?? '')
  }

  const allEntries = memoryList({ scope: 'all', includeArchived: true, includeSuperseded: true, limit: 100000 })
  return summarizeMemoryStats(
    (allEntries.ok ? (allEntries.data as Array<Record<string, unknown>>) : []) as Array<Record<string, unknown>>,
  )
}

export function startMemoryCleanupScheduler(
  intervalMs: number = 60 * 60 * 1000,
  piRuntimeManager?: PiSessionRuntimeManager,
): void {
  if (captureInterval) {
    console.warn('[Memory] Cleanup scheduler already running')
    return
  }

  const tick = () => {
    try {
      cleanupDecayedMemories()
      runMemoryMaintenance()
      if (piRuntimeManager) {
        void flushQueuedMemoryCaptures(piRuntimeManager).catch((error) =>
          console.warn('[Memory] queued capture flush failed:', error),
        )
      }
    } catch (error) {
      if (isSqliteBusyError(error)) {
        console.info('[Memory] maintenance tick skipped because the database is busy')
        return
      }
      console.warn('[Memory] maintenance tick failed:', error)
    }
  }

  tick()
  captureInterval = setInterval(tick, intervalMs)
}

export function stopMemoryCleanupScheduler(): void {
  if (captureInterval) {
    clearInterval(captureInterval)
    captureInterval = null
  }
  captureQueue.clear()
}
