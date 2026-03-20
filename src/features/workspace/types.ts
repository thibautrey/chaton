import type { JsonValue } from './rpc'

export type AppMode = 'workspace' | 'assistant'

export type ToolCallDisplayMode = 'verbose' | 'light' | 'quiet'

export type AssistantView = 'home' | 'conversations' | 'memory' | 'automations' | 'channels' | 'channel-conversations'

export type ConversationStatus = 'active' | 'done' | 'archived'

export type Project = {
  id: string
  name: string
  repoPath: string | null
  repoName: string
  location: 'local' | 'cloud'
  cloudInstanceId?: string | null
  organizationId?: string | null
  organizationName?: string | null
  cloudStatus?: 'connected' | 'connecting' | 'disconnected' | 'error' | null
  createdAt: string
  updatedAt: string
  isArchived: boolean
  isHidden: boolean
  icon: string | null
  subFolderId?: string | null
}

export type CloudInstance = {
  id: string
  name: string
  baseUrl: string
  authMode: 'oauth'
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error'
  lastError: string | null
  userEmail?: string | null
  createdAt: string
  updatedAt: string
}

export type CloudSubscriptionPlan = 'plus' | 'pro' | 'max'

export type CloudSubscription = {
  plan: CloudSubscriptionPlan
  label: string
  parallelSessionsLimit: number
}

export type CloudUsage = {
  activeParallelSessions: number
  parallelSessionsLimit: number
  remainingParallelSessions: number
}

export type CloudAccountUser = {
  id: string
  email: string
  displayName: string
  isAdmin: boolean
  createdAt: string
  subscription: CloudSubscription
}

export type CloudAccount = {
  user: CloudAccountUser
  usage: CloudUsage
}

export type ConversationTitleSource = 'placeholder' | 'auto-deterministic' | 'auto-ai' | 'manual'

export type Conversation = {
  id: string
  projectId: string | null
  title: string
  titleSource: ConversationTitleSource
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
  runtimeLocation?: 'local' | 'cloud'
  channelExtensionId: string | null
  hasCompletedAction?: boolean
  hiddenFromSidebar: boolean
  memoryInjected?: boolean
}

export type CreateConversationResult =
  | { ok: true; conversation: Conversation }
  | { ok: false; reason: 'project_not_found' | 'unknown' }

export type DeleteConversationResult = { ok: true } | { ok: false; reason: 'conversation_not_found' | 'has_uncommitted_changes' | 'user_cancelled' | 'unknown' }
export type DeleteProjectResult = { ok: true } | { ok: false; reason: 'project_not_found' | 'unknown' }

/** A named sub-folder that holds a set of project IDs. */
export type ProjectSubFolder = {
  id: string
  name: string
  projectIds: string[]
}

export type SidebarSettings = {
  organizeBy: 'project' | 'chronological'
  sortBy: 'created' | 'updated'
  show: 'all' | 'relevant'
  showAssistantStats: boolean
  toolCallDisplayMode: ToolCallDisplayMode
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
  /** User-created sub-folders inside the auto-folded projects section. */
  projectSubFolders: ProjectSubFolder[]
}

export type SidebarMode = 'default' | 'settings' | 'skills' | 'extensions' | 'channels' | 'extension-main-view'

export type ExtensionHealth = 'ok' | 'warning' | 'error'

export type ChatonsExtensionDeeplink = {
  viewId: string
  target: string
  params?: Record<string, unknown>
  createConversation?: boolean
  prefillPrompt?: string
}

export type ChatonsTopbarWidgetContext = {
  extensionId: string
  itemId: string
  label: string
  conversation: {
    id: string | null
    projectId: string | null
    worktreePath: string | null
    accessMode: 'secure' | 'open' | null
  }
  project: {
    id: string | null
    name: string | null
    repoPath: string | null
  }
  thread: {
    kind: 'project' | 'global' | 'none'
  }
}

export type ChatonsExtensionQuickAction = {
  id: string
  title: string
  description?: string
  scope?: 'always' | 'global-thread' | 'project-thread' | 'global-or-no-thread'
  prompt?: string
  extensionViewId?: string
  deeplink?: ChatonsExtensionDeeplink
}

export type ChatonsExtensionTopbarItem = {
  id: string
  label: string
  icon?: string
  order?: number
  when?: string
  context?: 'always' | 'project' | 'global'
  openMainView?: string
  deeplink?: ChatonsExtensionDeeplink
  widget?: {
    viewId: string
    width?: number
    minWidth?: number
  }
}

export type ChatonsExtensionConfig = {
  requiresRestart?: boolean
  icon?: string
  iconUrl?: string
  quickActions?: ChatonsExtensionQuickAction[]
  topbarItems?: ChatonsExtensionTopbarItem[]
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

export type ExtensionConfigSheet = {
  viewId: string
  title: string
}

export type WorkspaceState = {
  projects: Project[]
  conversations: Conversation[]
  cloudInstances: CloudInstance[]
  cloudAccount: CloudAccount | null
  cloudAdminUsers: CloudAccountUser[]
  selectedProjectId: string | null
  selectedConversationId: string | null
  sidebarMode: SidebarMode
  activeExtensionViewId: string | null
  deeplinkExtensionId: string | null
  appMode: AppMode
  assistantView: AssistantView
  assistantExtensionViewId: string | null
  extensionConfigSheet: ExtensionConfigSheet | null
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
  cloudInstances: CloudInstance[]
  cloudAccount: CloudAccount | null
  cloudAdminUsers: CloudAccountUser[]
  settings: SidebarSettings
  extensionUpdatesCount: number
}

export type CachedMessage = JsonValue
