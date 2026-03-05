import type Database from 'better-sqlite3'

export type DbQueueStatus = 'queued' | 'processing' | 'done' | 'dead'

export type DbExtensionQueueMessage = {
  id: string
  topic: string
  payload_json: string
  status: DbQueueStatus
  consumer_id: string | null
  attempts: number
  available_at: string
  last_error: string | null
  idempotency_key: string | null
  created_at: string
  updated_at: string
}

export function enqueueExtensionMessage(
  db: Database.Database,
  params: { id: string; topic: string; payload: unknown; idempotencyKey?: string | null; availableAt?: string; maxDuplicatesByIdempotency?: boolean },
) {
  const now = new Date().toISOString()
  const availableAt = params.availableAt ?? now
  if (params.idempotencyKey && params.maxDuplicatesByIdempotency !== false) {
    const existing = db
      .prepare('SELECT id FROM extension_queue WHERE idempotency_key = ? AND topic = ? AND status IN (\'queued\',\'processing\',\'done\') LIMIT 1')
      .get(params.idempotencyKey, params.topic) as { id: string } | undefined
    if (existing) return { deduplicated: true as const, id: existing.id }
  }

  db.prepare(
    `INSERT INTO extension_queue(id, topic, payload_json, status, consumer_id, attempts, available_at, last_error, idempotency_key, created_at, updated_at)
     VALUES (?, ?, ?, 'queued', NULL, 0, ?, NULL, ?, ?, ?)`,
  ).run(params.id, params.topic, JSON.stringify(params.payload), availableAt, params.idempotencyKey ?? null, now, now)

  return { deduplicated: false as const, id: params.id }
}

export function listQueueMessages(
  db: Database.Database,
  params: { topic?: string; status?: DbQueueStatus; limit?: number },
): DbExtensionQueueMessage[] {
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 500)
  if (params.topic && params.status) {
    return db
      .prepare('SELECT * FROM extension_queue WHERE topic = ? AND status = ? ORDER BY created_at DESC LIMIT ?')
      .all(params.topic, params.status, limit) as DbExtensionQueueMessage[]
  }
  if (params.topic) {
    return db
      .prepare('SELECT * FROM extension_queue WHERE topic = ? ORDER BY created_at DESC LIMIT ?')
      .all(params.topic, limit) as DbExtensionQueueMessage[]
  }
  if (params.status) {
    return db
      .prepare('SELECT * FROM extension_queue WHERE status = ? ORDER BY created_at DESC LIMIT ?')
      .all(params.status, limit) as DbExtensionQueueMessage[]
  }
  return db.prepare('SELECT * FROM extension_queue ORDER BY created_at DESC LIMIT ?').all(limit) as DbExtensionQueueMessage[]
}

export function claimQueueMessages(
  db: Database.Database,
  params: { topic: string; consumerId: string; limit?: number; nowIso?: string },
): DbExtensionQueueMessage[] {
  const now = params.nowIso ?? new Date().toISOString()
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 100)
  const candidates = db
    .prepare(
      `SELECT id FROM extension_queue
       WHERE topic = ? AND status = 'queued' AND available_at <= ?
       ORDER BY created_at ASC
       LIMIT ?`,
    )
    .all(params.topic, now, limit) as Array<{ id: string }>
  if (candidates.length === 0) return []

  const ids = candidates.map((row) => row.id)
  const placeholders = ids.map(() => '?').join(',')
  db.prepare(
    `UPDATE extension_queue
     SET status = 'processing', consumer_id = ?, updated_at = ?
     WHERE id IN (${placeholders})`,
  ).run(params.consumerId, now, ...ids)

  return db
    .prepare(`SELECT * FROM extension_queue WHERE id IN (${placeholders}) ORDER BY created_at ASC`)
    .all(...ids) as DbExtensionQueueMessage[]
}

export function ackQueueMessage(db: Database.Database, id: string): boolean {
  const now = new Date().toISOString()
  const result = db
    .prepare("UPDATE extension_queue SET status = 'done', updated_at = ?, last_error = NULL WHERE id = ?")
    .run(now, id)
  return result.changes > 0
}

export function nackQueueMessage(
  db: Database.Database,
  params: { id: string; error?: string; retryAt?: string; maxAttempts?: number },
): { ok: boolean; deadLettered: boolean } {
  const now = new Date().toISOString()
  const row = db.prepare('SELECT attempts FROM extension_queue WHERE id = ?').get(params.id) as { attempts: number } | undefined
  if (!row) return { ok: false, deadLettered: false }
  const nextAttempts = row.attempts + 1
  const maxAttempts = params.maxAttempts ?? 5
  if (nextAttempts >= maxAttempts) {
    const result = db
      .prepare("UPDATE extension_queue SET status = 'dead', attempts = ?, last_error = ?, updated_at = ? WHERE id = ?")
      .run(nextAttempts, params.error ?? 'max attempts reached', now, params.id)
    return { ok: result.changes > 0, deadLettered: true }
  }

  const retryAt = params.retryAt ?? new Date(Date.now() + Math.pow(2, nextAttempts) * 1000).toISOString()
  const result = db
    .prepare("UPDATE extension_queue SET status = 'queued', attempts = ?, last_error = ?, available_at = ?, updated_at = ? WHERE id = ?")
    .run(nextAttempts, params.error ?? null, retryAt, now, params.id)
  return { ok: result.changes > 0, deadLettered: false }
}
