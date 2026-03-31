import type Database from 'better-sqlite3'

import type { HarnessCandidate } from '../../meta-harness/types.js'

export type DbConversationHarnessFeedback = {
  conversation_id: string
  harness_candidate_id: string | null
  harness_snapshot_json: string | null
  enabled: number
  user_rating: number | null
  user_feedback_submitted_at: string | null
  created_at: string
  updated_at: string
}

export type ConversationHarnessFeedbackRecord = {
  conversationId: string
  harnessCandidateId: string | null
  harnessSnapshot: HarnessCandidate | null
  enabled: boolean
  userRating: -1 | 1 | null
  userFeedbackSubmittedAt: string | null
  createdAt: string
  updatedAt: string
}

function parseHarnessSnapshot(raw: string | null): HarnessCandidate | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as HarnessCandidate
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function mapRecord(row: DbConversationHarnessFeedback): ConversationHarnessFeedbackRecord {
  return {
    conversationId: row.conversation_id,
    harnessCandidateId: row.harness_candidate_id ?? null,
    harnessSnapshot: parseHarnessSnapshot(row.harness_snapshot_json ?? null),
    enabled: row.enabled === 1,
    userRating: row.user_rating === 1 ? 1 : row.user_rating === -1 ? -1 : null,
    userFeedbackSubmittedAt: row.user_feedback_submitted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function getConversationHarnessFeedback(
  db: Database.Database,
  conversationId: string,
): ConversationHarnessFeedbackRecord | null {
  const row = db
    .prepare('SELECT * FROM conversation_harness_feedback WHERE conversation_id = ?')
    .get(conversationId) as DbConversationHarnessFeedback | undefined
  return row ? mapRecord(row) : null
}

export function upsertConversationHarnessFeedback(
  db: Database.Database,
  params: {
    conversationId: string
    harnessCandidateId?: string | null
    harnessSnapshot?: HarnessCandidate | null
    enabled: boolean
    userRating?: -1 | 1 | null
    userFeedbackSubmittedAt?: string | null
  },
): ConversationHarnessFeedbackRecord {
  const now = new Date().toISOString()
  const existing = getConversationHarnessFeedback(db, params.conversationId)
  const harnessSnapshotJson = Object.prototype.hasOwnProperty.call(params, 'harnessSnapshot')
    ? (params.harnessSnapshot ? JSON.stringify(params.harnessSnapshot) : null)
    : (existing?.harnessSnapshot ? JSON.stringify(existing.harnessSnapshot) : null)
  const harnessCandidateId = Object.prototype.hasOwnProperty.call(params, 'harnessCandidateId')
    ? (params.harnessCandidateId ?? null)
    : (existing?.harnessCandidateId ?? null)
  const userRating = Object.prototype.hasOwnProperty.call(params, 'userRating')
    ? (params.userRating ?? null)
    : (existing?.userRating ?? null)
  const userFeedbackSubmittedAt = Object.prototype.hasOwnProperty.call(params, 'userFeedbackSubmittedAt')
    ? (params.userFeedbackSubmittedAt ?? null)
    : (existing?.userFeedbackSubmittedAt ?? null)

  db.prepare(
    `INSERT INTO conversation_harness_feedback(
      conversation_id,
      harness_candidate_id,
      harness_snapshot_json,
      enabled,
      user_rating,
      user_feedback_submitted_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(conversation_id) DO UPDATE SET
      harness_candidate_id = excluded.harness_candidate_id,
      harness_snapshot_json = excluded.harness_snapshot_json,
      enabled = excluded.enabled,
      user_rating = excluded.user_rating,
      user_feedback_submitted_at = excluded.user_feedback_submitted_at,
      updated_at = excluded.updated_at`
  ).run(
    params.conversationId,
    harnessCandidateId,
    harnessSnapshotJson,
    params.enabled ? 1 : 0,
    userRating,
    userFeedbackSubmittedAt,
    existing?.createdAt ?? now,
    now,
  )

  return getConversationHarnessFeedback(db, params.conversationId) ?? {
    conversationId: params.conversationId,
    harnessCandidateId,
    harnessSnapshot: parseHarnessSnapshot(harnessSnapshotJson),
    enabled: params.enabled,
    userRating,
    userFeedbackSubmittedAt,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

export function listHarnessFeedbackByCandidate(
  db: Database.Database,
  candidateId: string,
): ConversationHarnessFeedbackRecord[] {
  return db
    .prepare('SELECT * FROM conversation_harness_feedback WHERE harness_candidate_id = ? ORDER BY updated_at DESC')
    .all(candidateId)
    .map((row) => mapRecord(row as DbConversationHarnessFeedback))
}

export function getHarnessFeedbackStats(
  db: Database.Database,
  candidateId?: string | null,
): {
  total: number
  positive: number
  negative: number
  score: number | null
 } {
  const row = candidateId
    ? db
        .prepare(
          `SELECT
             COUNT(*) AS total,
             SUM(CASE WHEN user_rating = 1 THEN 1 ELSE 0 END) AS positive,
             SUM(CASE WHEN user_rating = -1 THEN 1 ELSE 0 END) AS negative
           FROM conversation_harness_feedback
           WHERE harness_candidate_id = ? AND user_rating IS NOT NULL`,
        )
        .get(candidateId)
    : db
        .prepare(
          `SELECT
             COUNT(*) AS total,
             SUM(CASE WHEN user_rating = 1 THEN 1 ELSE 0 END) AS positive,
             SUM(CASE WHEN user_rating = -1 THEN 1 ELSE 0 END) AS negative
           FROM conversation_harness_feedback
           WHERE user_rating IS NOT NULL`,
        )
        .get()
  const total = Number((row as Record<string, unknown> | undefined)?.total ?? 0)
  const positive = Number((row as Record<string, unknown> | undefined)?.positive ?? 0)
  const negative = Number((row as Record<string, unknown> | undefined)?.negative ?? 0)
  const score = total > 0 ? (positive - negative) / total : null
  return { total, positive, negative, score }
}
