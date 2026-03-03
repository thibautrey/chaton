import type Database from 'better-sqlite3'

export type DbProject = {
  id: string
  name: string
  repo_path: string
  repo_name: string
  is_archived: number
  created_at: string
  updated_at: string
}

export function listProjects(db: Database.Database): DbProject[] {
  return db.prepare('SELECT * FROM projects WHERE is_archived = 0 ORDER BY updated_at DESC').all() as DbProject[]
}

export function findProjectByRepoPath(db: Database.Database, repoPath: string): DbProject | undefined {
  return db.prepare('SELECT * FROM projects WHERE repo_path = ?').get(repoPath) as DbProject | undefined
}

export function insertProject(db: Database.Database, params: { id: string; name: string; repoPath: string; repoName: string }) {
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO projects(id, name, repo_path, repo_name, is_archived, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)'
  ).run(params.id, params.name, params.repoPath, params.repoName, now, now)
}
