import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

let dbInstance: Database.Database | null = null

function runMigrations(db: Database.Database) {
  const migrationsDir = path.join(__dirname, 'migrations')
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()

  db.exec('CREATE TABLE IF NOT EXISTS _migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
  const appliedRows = db.prepare('SELECT name FROM _migrations').all() as Array<{ name: string }>
  const applied = new Set(appliedRows.map((row) => row.name))

  for (const file of files) {
    if (applied.has(file)) {
      continue
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    db.exec(sql)
    db.prepare('INSERT INTO _migrations(name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString())
  }
}

function seedIfEmpty(db: Database.Database) {
  const hasProjects = db.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number }
  if (hasProjects.count > 0) {
    return
  }

  const now = new Date().toISOString()
  const projectId = crypto.randomUUID()
  const conversationId = crypto.randomUUID()
  db.prepare(
    'INSERT INTO projects(id, name, repo_path, repo_name, is_archived, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)'
  ).run(projectId, 'Projet exemple', path.join(app.getPath('home'), 'example-repo'), 'example-repo', now, now)

  db.prepare(
    'INSERT INTO conversations(id, project_id, title, status, is_relevant, created_at, updated_at, last_message_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(conversationId, projectId, 'Initialiser le dashboard', 'active', 1, now, now, now)

  const defaultSettings = {
    organizeBy: 'project',
    sortBy: 'updated',
    show: 'all',
    searchQuery: '',
    collapsedProjectIds: [],
  }

  db.prepare('INSERT INTO app_settings(key, value, updated_at) VALUES (?, ?, ?)').run(
    'sidebar',
    JSON.stringify(defaultSettings),
    now,
  )
}

export function getDb() {
  if (dbInstance) {
    return dbInstance
  }

  const dbPath = path.join(app.getPath('userData'), 'dashboard.sqlite')
  dbInstance = new Database(dbPath)
  dbInstance.pragma('foreign_keys = ON')
  runMigrations(dbInstance)
  seedIfEmpty(dbInstance)
  return dbInstance
}
