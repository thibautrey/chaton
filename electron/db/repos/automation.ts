import type Database from 'better-sqlite3'

export type DbAutomationRule = {
  id: string
  name: string
  enabled: number
  trigger_topic: string
  trigger_data?: string | null
  conditions_json: string
  actions_json: string
  cooldown_ms: number
  run_once: number
  last_triggered_at: string | null
  created_at: string
  updated_at: string
}

export function listAutomationRules(db: Database.Database): DbAutomationRule[] {
  return db.prepare('SELECT * FROM automation_rules ORDER BY updated_at DESC').all() as DbAutomationRule[]
}

export function findAutomationRule(db: Database.Database, id: string): DbAutomationRule | undefined {
  return db.prepare('SELECT * FROM automation_rules WHERE id = ?').get(id) as DbAutomationRule | undefined
}

export function saveAutomationRule(
  db: Database.Database,
  params: {
    id: string
    name: string
    enabled: boolean
    triggerTopic: string
    triggerData?: string
    conditionsJson: string
    actionsJson: string
    cooldownMs: number
    runOnce?: boolean
  },
) {
  const now = new Date().toISOString()
  const existing = findAutomationRule(db, params.id)
  if (existing) {
    db.prepare(
      `UPDATE automation_rules
       SET name = ?, enabled = ?, trigger_topic = ?, trigger_data = ?, conditions_json = ?, actions_json = ?, cooldown_ms = ?, run_once = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      params.name,
      params.enabled ? 1 : 0,
      params.triggerTopic,
      params.triggerData ?? null,
      params.conditionsJson,
      params.actionsJson,
      params.cooldownMs,
      params.runOnce ? 1 : 0,
      now,
      params.id,
    )
    return
  }

  db.prepare(
    `INSERT INTO automation_rules(id, name, enabled, trigger_topic, trigger_data, conditions_json, actions_json, cooldown_ms, run_once, last_triggered_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(
    params.id,
    params.name,
    params.enabled ? 1 : 0,
    params.triggerTopic,
    params.triggerData ?? null,
    params.conditionsJson,
    params.actionsJson,
    params.cooldownMs,
    params.runOnce ? 1 : 0,
    now,
    now,
  )
}

export function deleteAutomationRule(db: Database.Database, id: string): boolean {
  const result = db.prepare('DELETE FROM automation_rules WHERE id = ?').run(id)
  return result.changes > 0
}

export function markAutomationRuleTriggered(db: Database.Database, id: string) {
  const now = new Date().toISOString()
  db.prepare('UPDATE automation_rules SET last_triggered_at = ?, updated_at = ? WHERE id = ?').run(now, now, id)
}

export function insertAutomationRun(
  db: Database.Database,
  params: { id: string; ruleId: string; eventTopic: string; eventPayloadJson: string; status: 'ok' | 'error'; errorMessage?: string },
) {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO automation_runs(id, rule_id, event_topic, event_payload_json, status, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(params.id, params.ruleId, params.eventTopic, params.eventPayloadJson, params.status, params.errorMessage ?? null, now)
}

export function listAutomationRuns(
  db: Database.Database,
  params: { ruleId?: string; limit?: number },
): Array<{ id: string; rule_id: string; event_topic: string; event_payload_json: string; status: 'ok' | 'error'; error_message: string | null; created_at: string }> {
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 500)
  if (params.ruleId) {
    return db
      .prepare('SELECT * FROM automation_runs WHERE rule_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(params.ruleId, limit) as Array<{ id: string; rule_id: string; event_topic: string; event_payload_json: string; status: 'ok' | 'error'; error_message: string | null; created_at: string }>
  }

  return db
    .prepare('SELECT * FROM automation_runs ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Array<{ id: string; rule_id: string; event_topic: string; event_payload_json: string; status: 'ok' | 'error'; error_message: string | null; created_at: string }>
}
