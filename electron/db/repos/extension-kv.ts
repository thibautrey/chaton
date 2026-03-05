import type Database from 'better-sqlite3'

export function extensionKvGet(db: Database.Database, extensionId: string, key: string): unknown | null {
  const row = db.prepare('SELECT value_json FROM extension_kv WHERE extension_id = ? AND key = ?').get(extensionId, key) as { value_json: string } | undefined
  if (!row) return null
  try {
    return JSON.parse(row.value_json)
  } catch {
    return null
  }
}

export function extensionKvSet(db: Database.Database, extensionId: string, key: string, value: unknown) {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO extension_kv(extension_id, key, value_json, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(extension_id, key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at`,
  ).run(extensionId, key, JSON.stringify(value), now)
}

export function extensionKvDelete(db: Database.Database, extensionId: string, key: string): boolean {
  const result = db.prepare('DELETE FROM extension_kv WHERE extension_id = ? AND key = ?').run(extensionId, key)
  return result.changes > 0
}

export function extensionKvList(db: Database.Database, extensionId: string): Array<{ key: string; value: unknown; updatedAt: string }> {
  const rows = db.prepare('SELECT key, value_json, updated_at FROM extension_kv WHERE extension_id = ? ORDER BY key ASC').all(extensionId) as Array<{ key: string; value_json: string; updated_at: string }>
  return rows.map((row) => {
    let value: unknown = null
    try {
      value = JSON.parse(row.value_json)
    } catch {
      value = null
    }
    return { key: row.key, value, updatedAt: row.updated_at }
  })
}
