import type Database from 'better-sqlite3'

export type DbProject = {
  id: string
  name: string
  repo_path: string | null
  repo_name: string
  is_archived: number
  is_hidden: number
  icon: string | null
  location: 'local' | 'cloud'
  cloud_instance_id: string | null
  organization_id: string | null
  organization_name: string | null
  cloud_status: 'connected' | 'connecting' | 'disconnected' | 'error' | null
  cloud_project_kind: 'repository' | 'conversation_only' | null
  cloud_workspace_capability: 'full_tools' | 'chat_only' | null
  cloud_repository_clone_url: string | null
  cloud_repository_default_branch: string | null
  cloud_repository_auth_mode: 'none' | 'token' | null
  created_at: string
  updated_at: string
}

export function listProjects(db: Database.Database): DbProject[] {
  return db.prepare('SELECT * FROM projects WHERE is_archived = 0 ORDER BY updated_at DESC').all() as DbProject[]
}

export function findProjectById(db: Database.Database, id: string): DbProject | undefined {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as DbProject | undefined
}

export function findProjectByRepoPath(db: Database.Database, repoPath: string): DbProject | undefined {
  return db.prepare('SELECT * FROM projects WHERE repo_path = ?').get(repoPath) as DbProject | undefined
}

export function insertProject(
  db: Database.Database,
  params: {
    id: string
    name: string
    repoPath?: string | null
    repoName: string
    location?: 'local' | 'cloud'
    cloudInstanceId?: string | null
    organizationId?: string | null
    organizationName?: string | null
    cloudStatus?: 'connected' | 'connecting' | 'disconnected' | 'error' | null
    cloudProjectKind?: 'repository' | 'conversation_only' | null
    cloudWorkspaceCapability?: 'full_tools' | 'chat_only' | null
    cloudRepositoryCloneUrl?: string | null
    cloudRepositoryDefaultBranch?: string | null
    cloudRepositoryAuthMode?: 'none' | 'token' | null
  },
) {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO projects(
      id, name, repo_path, repo_name, is_archived, is_hidden, icon, location, cloud_instance_id,
      organization_id, organization_name, cloud_status, cloud_project_kind, cloud_workspace_capability,
      cloud_repository_clone_url, cloud_repository_default_branch, cloud_repository_auth_mode, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 0, 0, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.id,
    params.name,
    params.repoPath ?? null,
    params.repoName,
    params.location ?? 'local',
    params.cloudInstanceId ?? null,
    params.organizationId ?? null,
    params.organizationName ?? null,
    params.cloudStatus ?? null,
    params.cloudProjectKind ?? null,
    params.cloudWorkspaceCapability ?? null,
    params.cloudRepositoryCloneUrl ?? null,
    params.cloudRepositoryDefaultBranch ?? null,
    params.cloudRepositoryAuthMode ?? null,
    now,
    now,
  )
}

export function upsertCloudProject(
  db: Database.Database,
  params: {
    id: string
    name: string
    repoName: string
    cloudInstanceId: string
    organizationId: string
    organizationName: string
    cloudStatus: 'connected' | 'connecting' | 'disconnected' | 'error' | null
    cloudProjectKind?: 'repository' | 'conversation_only' | null
    cloudWorkspaceCapability?: 'full_tools' | 'chat_only' | null
    cloudRepositoryCloneUrl?: string | null
    cloudRepositoryDefaultBranch?: string | null
    cloudRepositoryAuthMode?: 'none' | 'token' | null
  },
): void {
  const existing = findProjectById(db, params.id)
  const now = new Date().toISOString()

  if (existing) {
    db.prepare(
      `UPDATE projects
       SET
         name = ?,
         repo_path = NULL,
         repo_name = ?,
         location = 'cloud',
         cloud_instance_id = ?,
         organization_id = ?,
         organization_name = ?,
         cloud_status = ?,
         cloud_project_kind = ?,
         cloud_workspace_capability = ?,
         cloud_repository_clone_url = ?,
         cloud_repository_default_branch = ?,
         cloud_repository_auth_mode = ?,
         updated_at = ?
       WHERE id = ?`,
    ).run(
      params.name,
      params.repoName,
      params.cloudInstanceId,
      params.organizationId,
      params.organizationName,
      params.cloudStatus,
      params.cloudProjectKind ?? null,
      params.cloudWorkspaceCapability ?? null,
      params.cloudRepositoryCloneUrl ?? null,
      params.cloudRepositoryDefaultBranch ?? null,
      params.cloudRepositoryAuthMode ?? null,
      now,
      params.id,
    )
    return
  }

  db.prepare(
    `INSERT INTO projects(
      id, name, repo_path, repo_name, is_archived, is_hidden, icon, location, cloud_instance_id,
      organization_id, organization_name, cloud_status, cloud_project_kind, cloud_workspace_capability,
      cloud_repository_clone_url, cloud_repository_default_branch, cloud_repository_auth_mode, created_at, updated_at
    ) VALUES (?, ?, NULL, ?, 0, 0, NULL, 'cloud', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    params.id,
    params.name,
    params.repoName,
    params.cloudInstanceId,
    params.organizationId,
    params.organizationName,
    params.cloudStatus,
    params.cloudProjectKind ?? null,
    params.cloudWorkspaceCapability ?? null,
    params.cloudRepositoryCloneUrl ?? null,
    params.cloudRepositoryDefaultBranch ?? null,
    params.cloudRepositoryAuthMode ?? null,
    now,
    now,
  )
}

export function updateProjectIcon(db: Database.Database, id: string, icon: string | null): boolean {
  const now = new Date().toISOString()
  const normalizedIcon = icon && icon.trim().length > 0 ? icon.trim() : null
  const result = db.prepare('UPDATE projects SET icon = ?, updated_at = ? WHERE id = ?').run(normalizedIcon, now, id)
  return result.changes > 0
}

export function updateProjectIsArchived(db: Database.Database, id: string, isArchived: boolean): boolean {
  const now = new Date().toISOString()
  const result = db.prepare('UPDATE projects SET is_archived = ?, updated_at = ? WHERE id = ?').run(isArchived ? 1 : 0, now, id)
  return result.changes > 0
}

export function updateProjectIsHidden(db: Database.Database, id: string, isHidden: boolean): boolean {
  const now = new Date().toISOString()
  const result = db.prepare('UPDATE projects SET is_hidden = ?, updated_at = ? WHERE id = ?').run(isHidden ? 1 : 0, now, id)
  return result.changes > 0
}

export function updateProjectCloudStatus(
  db: Database.Database,
  id: string,
  cloudStatus: 'connected' | 'connecting' | 'disconnected' | 'error' | null,
): boolean {
  const now = new Date().toISOString()
  const result = db
    .prepare('UPDATE projects SET cloud_status = ?, updated_at = ? WHERE id = ?')
    .run(cloudStatus, now, id)
  return result.changes > 0
}

export function updateCloudProjectsStatusByInstance(
  db: Database.Database,
  cloudInstanceId: string,
  cloudStatus: 'connected' | 'connecting' | 'disconnected' | 'error' | null,
): number {
  const now = new Date().toISOString()
  const result = db
    .prepare(
      `UPDATE projects
       SET cloud_status = ?, updated_at = ?
       WHERE cloud_instance_id = ? AND location = 'cloud'`,
    )
    .run(cloudStatus, now, cloudInstanceId)
  return result.changes
}

export function deleteProjectById(db: Database.Database, id: string): boolean {
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  return result.changes > 0
}
