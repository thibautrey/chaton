import { getDb } from '../../db/index.js'
import { listProjects, findProjectById, updateProjectIsHidden } from '../../db/repos/projects.js'
import { listConversations, listConversationsByProjectId } from '../../db/repos/conversations.js'
import type { ExtensionHostCallResult } from './types.js'

type DbProject = {
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

type DbConversation = {
  id: string
  project_id: string | null
  title: string
  created_at: string
  updated_at: string
  last_message_at: string
  model_provider: string | null
  model_id: string | null
}

function hydrateProject(row: DbProject) {
  return {
    id: row.id,
    name: row.name,
    repoPath: row.repo_path,
    repoName: row.repo_name,
    location: row.location,
    kind: row.cloud_project_kind,
    workspaceCapability: row.cloud_workspace_capability,
    repository:
      row.cloud_repository_clone_url == null
        ? null
        : {
            cloneUrl: row.cloud_repository_clone_url,
            defaultBranch: row.cloud_repository_default_branch,
            authMode: row.cloud_repository_auth_mode ?? 'none',
          },
    cloudInstanceId: row.cloud_instance_id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    cloudStatus: row.cloud_status,
    isArchived: row.is_archived === 1,
    isHidden: row.is_hidden === 1,
    icon: row.icon,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function hydrateConversation(row: DbConversation) {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
    modelProvider: row.model_provider,
    modelId: row.model_id,
  }
}

export function chatonsListProjects(payload: unknown): ExtensionHostCallResult {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {}
  const includeArchived = p.includeArchived === true
  const limit = typeof p.limit === 'number' && Number.isFinite(p.limit) ? Math.max(1, Math.floor(p.limit)) : undefined

  const rows = listProjects(getDb())
  let filtered = rows.filter((row) => includeArchived || row.is_archived === 0)

  if (limit) {
    filtered = filtered.slice(0, limit)
  }

  return { ok: true, data: filtered.map(hydrateProject) }
}

export function chatonsGetProject(payload: unknown): ExtensionHostCallResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: { code: 'invalid_args', message: 'payload object expected' } }
  }
  const p = payload as Record<string, unknown>
  const projectId = typeof p.projectId === 'string' ? p.projectId.trim() : ''
  if (!projectId) {
    return { ok: false, error: { code: 'invalid_args', message: 'projectId is required' } }
  }

  const row = findProjectById(getDb(), projectId)
  if (!row) {
    return { ok: false, error: { code: 'not_found', message: 'Project not found' } }
  }

  return { ok: true, data: hydrateProject(row) }
}

export function chatonsGetProjectConversations(payload: unknown): ExtensionHostCallResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: { code: 'invalid_args', message: 'payload object expected' } }
  }
  const p = payload as Record<string, unknown>
  const projectId = typeof p.projectId === 'string' ? p.projectId.trim() : ''
  if (!projectId) {
    return { ok: false, error: { code: 'invalid_args', message: 'projectId is required' } }
  }

  const rows = listConversationsByProjectId(getDb(), projectId)
  return { ok: true, data: rows.map(hydrateConversation) }
}

export function chatonsGetHiddenProjects(): ExtensionHostCallResult {
  const rows = listProjects(getDb())
  const hidden = rows.filter((row) => row.is_hidden === 1)
  return { ok: true, data: hidden.map(hydrateProject) }
}

export function chatonsGetVisibleProjects(): ExtensionHostCallResult {
  const rows = listProjects(getDb())
  const visible = rows.filter((row) => row.is_hidden === 0 && row.is_archived === 0)
  return { ok: true, data: visible.map(hydrateProject) }
}

export function chatonsUpdateProjectVisibility(payload: unknown): ExtensionHostCallResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: { code: 'invalid_args', message: 'payload object expected' } }
  }
  const p = payload as Record<string, unknown>
  const projectId = typeof p.projectId === 'string' ? p.projectId.trim() : ''
  if (!projectId) {
    return { ok: false, error: { code: 'invalid_args', message: 'projectId is required' } }
  }

  const hidden = p.hidden === true
  const success = updateProjectIsHidden(getDb(), projectId, hidden)
  if (!success) {
    return { ok: false, error: { code: 'not_found', message: 'Project not found' } }
  }

  return { ok: true, data: { projectId, hidden } }
}
