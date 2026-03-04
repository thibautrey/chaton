import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'

let dbInstance: Database.Database | null = null
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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

export function getDb() {
  if (dbInstance) {
    return dbInstance
  }

  const dbPath = path.join(app.getPath('userData'), 'chaton.sqlite')
  dbInstance = new Database(dbPath)
  dbInstance.pragma('foreign_keys = ON')
  runMigrations(dbInstance)
  return dbInstance
}
