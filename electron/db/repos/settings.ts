import type Database from 'better-sqlite3'
import type { Rectangle } from 'electron'

export type DbSidebarSettings = {
  organizeBy: 'project' | 'chronological'
  sortBy: 'created' | 'updated'
  show: 'all' | 'relevant'
  showAssistantStats: boolean
  searchQuery: string
  collapsedProjectIds: string[]
}

export type DbWindowBounds = Pick<Rectangle, 'x' | 'y' | 'width' | 'height'>

const DEFAULT_SETTINGS: DbSidebarSettings = {
  organizeBy: 'project',
  sortBy: 'updated',
  show: 'all',
  showAssistantStats: false,
  searchQuery: '',
  collapsedProjectIds: [],
}

const DEFAULT_WINDOW_BOUNDS: DbWindowBounds = {
  x: 0,
  y: 0,
  width: 1500,
  height: 980,
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

export function getWindowBounds(db: Database.Database): DbWindowBounds {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('window_bounds') as { value: string } | undefined
  if (!row) {
    return DEFAULT_WINDOW_BOUNDS
  }

  try {
    return { ...DEFAULT_WINDOW_BOUNDS, ...(JSON.parse(row.value) as Partial<DbWindowBounds>) }
  } catch {
    return DEFAULT_WINDOW_BOUNDS
  }
}

export function saveWindowBounds(db: Database.Database, bounds: DbWindowBounds) {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO app_settings(key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
  ).run('window_bounds', JSON.stringify(bounds), now)
}

export function getLanguagePreference(db: Database.Database): string {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('language') as { value: string } | undefined
  return row?.value ?? 'fr'
}

export function saveLanguagePreference(db: Database.Database, language: string) {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO app_settings(key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
  ).run('language', language, now)
}
