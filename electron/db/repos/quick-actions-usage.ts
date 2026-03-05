import type Database from 'better-sqlite3'

export type DbQuickActionUsage = {
  action_id: string
  uses_count: number
  decayed_score: number
  last_used_at: string | null
  created_at: string
  updated_at: string
}

const HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 14

function decayFactor(elapsedMs: number): number {
  if (elapsedMs <= 0) return 1
  return Math.exp((-Math.log(2) * elapsedMs) / HALF_LIFE_MS)
}

export function listQuickActionsUsage(db: Database.Database): DbQuickActionUsage[] {
  return db
    .prepare('SELECT action_id, uses_count, decayed_score, last_used_at, created_at, updated_at FROM quick_actions_usage')
    .all() as DbQuickActionUsage[]
}

export function recordQuickActionUse(
  db: Database.Database,
  actionId: string,
): DbQuickActionUsage {
  const now = new Date().toISOString()
  const nowMs = Date.parse(now)
  const existing = db
    .prepare('SELECT action_id, uses_count, decayed_score, last_used_at, created_at, updated_at FROM quick_actions_usage WHERE action_id = ?')
    .get(actionId) as DbQuickActionUsage | undefined

  if (!existing) {
    db.prepare(
      `INSERT INTO quick_actions_usage(action_id, uses_count, decayed_score, last_used_at, created_at, updated_at)
       VALUES (?, 1, 1, ?, ?, ?)`,
    ).run(actionId, now, now, now)
    return {
      action_id: actionId,
      uses_count: 1,
      decayed_score: 1,
      last_used_at: now,
      created_at: now,
      updated_at: now,
    }
  }

  const lastMs = existing.last_used_at ? Date.parse(existing.last_used_at) : nowMs
  const elapsed = Number.isFinite(lastMs) ? Math.max(0, nowMs - lastMs) : 0
  const nextScore = existing.decayed_score * decayFactor(elapsed) + 1
  const nextCount = existing.uses_count + 1

  db.prepare(
    `UPDATE quick_actions_usage
     SET uses_count = ?, decayed_score = ?, last_used_at = ?, updated_at = ?
     WHERE action_id = ?`,
  ).run(nextCount, nextScore, now, now, actionId)

  return {
    action_id: actionId,
    uses_count: nextCount,
    decayed_score: nextScore,
    last_used_at: now,
    created_at: existing.created_at,
    updated_at: now,
  }
}
