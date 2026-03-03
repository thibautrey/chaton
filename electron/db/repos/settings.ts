import type Database from 'better-sqlite3'

export type DbSidebarSettings = {
  organizeBy: 'project' | 'chronological'
  sortBy: 'created' | 'updated'
  show: 'all' | 'relevant'
  searchQuery: string
  collapsedProjectIds: string[]
}

const DEFAULT_SETTINGS: DbSidebarSettings = {
  organizeBy: 'project',
  sortBy: 'updated',
  show: 'all',
  searchQuery: '',
  collapsedProjectIds: [],
}

export function getSidebarSettings(db: Database.Database): DbSidebarSettings {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('sidebar') as { value: string } | undefined
  if (!row) {
    return DEFAULT_SETTINGS
  }

  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(row.value) as Partial<DbSidebarSettings>) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSidebarSettings(db: Database.Database, settings: DbSidebarSettings) {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO app_settings(key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
  ).run('sidebar', JSON.stringify(settings), now)
}
