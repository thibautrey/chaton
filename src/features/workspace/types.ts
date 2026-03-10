import type { JsonValue } from './rpc'

export type AppMode = 'workspace' | 'assistant'

export type AssistantView = 'home' | 'conversations' | 'memory' | 'automations' | 'channels'

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
  projectId: string | null
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
  worktreePath: string | null
  accessMode: 'secure' | 'open'
  channelExtensionId: string | null
  hasCompletedAction?: boolean
}

export type CreateConversationResult =
  | { ok: true; conversation: Conversation }
  | { ok: false; reason: 'project_not_found' | 'unknown' }

export type DeleteConversationResult = { ok: true } | { ok: false; reason: 'conversation_not_found' | 'has_uncommitted_changes' | 'user_cancelled' | 'unknown' }
export type DeleteProjectResult = { ok: true } | { ok: false; reason: 'project_not_found' | 'unknown' }

export type SidebarSettings = {
  organizeBy: 'project' | 'chronological'
  sortBy: 'created' | 'updated'
  show: 'all' | 'relevant'
  showAssistantStats: boolean
  searchQuery: string
  isSearchVisible: boolean
  collapsedProjectIds: string[]
  sidebarWidth: number
  defaultBehaviorPrompt: string
  hasCompletedOnboarding: boolean
  allowAnonymousTelemetry: boolean
  telemetryConsentAnswered: boolean
  anonymousInstallId: string | null
  enableConversationChime: boolean
  assistantOnboardingCompleted: boolean
  assistantName: string
  assistantUserName: string
  assistantChannelId: string | null
}

export type SidebarMode = 'default' | 'settings' | 'skills' | 'extensions' | 'channels' | 'extension-main-view'

export type ExtensionHealth = 'ok' | 'warning' | 'error'

export type ChatonsExtensionQuickAction = {
  id: string
  title: string
  description?: string
  scope?: 'always' | 'global-thread' | 'project-thread' | 'global-or-no-thread'
  prompt?: string
  extensionViewId?: string
  deeplink?: {
    viewId: string
    target: string
    params?: Record<string, unknown>
    createConversation?: boolean
    prefillPrompt?: string
  }
}

export type ChatonsExtensionConfig = {
  requiresRestart?: boolean
  icon?: string
  iconUrl?: string
  quickActions?: ChatonsExtensionQuickAction[]
  [key: string]: unknown
}

export type ChatonsExtension = {
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
  config?: ChatonsExtensionConfig
  capabilitiesDeclared?: string[]
  capabilitiesUsed?: string[]
  healthDetails?: Record<string, unknown>
  apiContracts?: Record<string, unknown>
  manifestDigest?: string | null
  installed?: boolean
  serverStatus?: {
    startedAt?: string
    pid?: number
    ready?: boolean
    lastError?: string
    lastExitAt?: string
    lastExitCode?: number | null
  } | null
  npmPublishedVersion?: string | null
}

export type ChatonsExtensionCatalogItem = {
  id: string
  name: string
  version: string
  description: string
  source: 'builtin' | 'npmRegistry'
  requiresRestart: boolean
  // Marketplace metadata (optional)
  category?: string
  tags?: string[]
  author?: string
  downloadCount?: number
  rating?: number
  lastUpdated?: string
  featured?: boolean
  popularity?: 'new' | 'trending' | 'popular' | 'recommended'
  icon?: string
  iconUrl?: string
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
  activeExtensionViewId: string | null
  deeplinkExtensionId: string | null
  appMode: AppMode
  assistantView: AssistantView
  assistantExtensionViewId: string | null
  settings: SidebarSettings
  notice: string | null
  extensionUpdatesCount: number
  // piByConversation and completedActionByConversation moved to pi-store.ts
  // (external store) to avoid re-rendering all context consumers on every
  // streaming event. Use usePiRuntime() / usePiStore() hooks instead.
}

export type WorkspacePayload = {
  projects: Project[]
  conversations: Conversation[]
  settings: SidebarSettings
  extensionUpdatesCount: number
}

export type CachedMessage = JsonValue
