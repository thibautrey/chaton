import type { JsonValue, PiConversationRuntime } from './rpc'

export type ConversationStatus = 'active' | 'done' | 'archived'

export type Project = {
  id: string
  name: string
  repoPath: string
  repoName: string
  createdAt: string
  updatedAt: string
  isArchived: boolean
}

export type Conversation = {
  id: string
  projectId: string
  title: string
  status: ConversationStatus
  isRelevant: boolean
  createdAt: string
  updatedAt: string
  lastMessageAt: string
  modelProvider: string | null
  modelId: string | null
  thinkingLevel: string | null
  lastRuntimeError: string | null
}

export type CreateConversationResult =
  | { ok: true; conversation: Conversation }
  | { ok: false; reason: 'project_not_found' | 'unknown' }

export type DeleteConversationResult = { ok: true } | { ok: false; reason: 'conversation_not_found' | 'unknown' }
export type DeleteProjectResult = { ok: true } | { ok: false; reason: 'project_not_found' | 'unknown' }

export type SidebarSettings = {
  organizeBy: 'project' | 'chronological'
  sortBy: 'created' | 'updated'
  show: 'all' | 'relevant'
  showAssistantStats: boolean
  searchQuery: string
  collapsedProjectIds: string[]
  sidebarWidth: number
  defaultBehaviorPrompt: string
}

export type SidebarMode = 'default' | 'settings' | 'skills' | 'extensions'

export type ExtensionHealth = 'ok' | 'warning' | 'error'

export type ChatonExtension = {
  id: string
  name: string
  version: string
  description: string
  enabled: boolean
  installSource: 'builtin' | 'localPath' | 'git'
  health: ExtensionHealth
  lastRunAt?: string
  lastRunStatus?: 'ok' | 'error'
  lastError?: string
  config?: Record<string, unknown>
}

export type ExtensionActionResult =
  | { ok: true; message?: string }
  | { ok: false; message: string }

export type PiSettingsJson = Record<string, unknown>

export type PiModelsJson = {
  providers?: Record<string, unknown>
  [key: string]: unknown
}

export type PiConfigSnapshot = {
  settingsPath: string
  modelsPath: string
  settings: PiSettingsJson | null
  models: PiModelsJson | null
  errors: string[]
}

export type PiDiagnostics = {
  piPath: string
  settingsPath: string
  modelsPath: string
  checks: Array<{ id: string; level: 'info' | 'warning' | 'error'; message: string }>
}

export type PiCommandAction = 'list' | 'list-models' | 'install' | 'remove' | 'update' | 'config'

export type PiCommandResult = {
  ok: boolean
  code: number
  command: string[]
  stdout: string
  stderr: string
  ranAt: string
  message?: string
}

export type WorkspaceState = {
  projects: Project[]
  conversations: Conversation[]
  selectedProjectId: string | null
  selectedConversationId: string | null
  sidebarMode: SidebarMode
  settings: SidebarSettings
  notice: string | null
  piByConversation: Record<string, PiConversationRuntime>
}

export type WorkspacePayload = {
  projects: Project[]
  conversations: Conversation[]
  settings: SidebarSettings
}

export type CachedMessage = JsonValue
