import type Database from 'better-sqlite3'
import crypto from 'node:crypto'

export type DbProjectCustomTerminalCommand = {
  id: string
  project_id: string
  command_text: string
  last_used_at: string
  created_at: string
  updated_at: string
}

export function listProjectCustomTerminalCommands(
  db: Database.Database,
  projectId: string,
  limit: number = 5,
): DbProjectCustomTerminalCommand[] {
  return db
    .prepare(
      'SELECT * FROM project_custom_terminal_commands WHERE project_id = ? ORDER BY last_used_at DESC, updated_at DESC LIMIT ?'
    )
    .all(projectId, limit) as DbProjectCustomTerminalCommand[]
}

export function saveProjectCustomTerminalCommand(
  db: Database.Database,
  projectId: string,
  commandText: string,
): DbProjectCustomTerminalCommand[] {
  const trimmed = commandText.trim()
  if (!trimmed) {
    return listProjectCustomTerminalCommands(db, projectId)
  }

  const now = new Date().toISOString()
  const existing = db
    .prepare('SELECT id FROM project_custom_terminal_commands WHERE project_id = ? AND command_text = ?')
    .get(projectId, trimmed) as { id: string } | undefined

  if (existing) {
    db.prepare(
      'UPDATE project_custom_terminal_commands SET last_used_at = ?, updated_at = ? WHERE id = ?'
    ).run(now, now, existing.id)
  } else {
    db.prepare(
      'INSERT INTO project_custom_terminal_commands(id, project_id, command_text, last_used_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(crypto.randomUUID(), projectId, trimmed, now, now, now)
  }

  const overflowRows = db
    .prepare(
      'SELECT id FROM project_custom_terminal_commands WHERE project_id = ? ORDER BY last_used_at DESC, updated_at DESC LIMIT -1 OFFSET 5'
    )
    .all(projectId) as Array<{ id: string }>

  if (overflowRows.length > 0) {
    const deleteStmt = db.prepare('DELETE FROM project_custom_terminal_commands WHERE id = ?')
    const tx = db.transaction((rows: Array<{ id: string }>) => {
      for (const row of rows) {
        deleteStmt.run(row.id)
      }
    })
    tx(overflowRows)
  }

  return listProjectCustomTerminalCommands(db, projectId)
}
