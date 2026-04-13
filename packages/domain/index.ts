export type CloudRuntimeLocation = 'local' | 'cloud'

export type CloudConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'error'

export type CloudSubscriptionPlan = 'plus' | 'pro' | 'max'

export type CloudSubscriptionRecord = {
  id: CloudSubscriptionPlan
  label: string
  parallelSessionsLimit: number
  isDefault?: boolean
  /** When true, this plan is hidden from the client UI (but still usable by admins) */
  isHidden?: boolean
}

export type CloudSubscriptionGrantRecord = {
  plan: CloudSubscriptionRecord
  grantedAt: string
  expiresAt: string | null
}

export type OrganizationProviderKind =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'github-copilot'

export type CloudProviderModelRecord = {
  id: string
  label: string
}

export type CloudProviderCredentialType =
  | 'api_key'
  | 'oauth'

export type CloudProjectKind =
  | 'repository'
  | 'conversation_only'

export type CloudWorkspaceCapability =
  | 'full_tools'
  | 'chat_only'

export type CloudRepositoryAuthMode =
  | 'none'
  | 'token'

export type OrganizationProviderRecord = {
  id: string
  kind: OrganizationProviderKind
  label: string
  secretHint: string
  baseUrl: string
  credentialType: CloudProviderCredentialType
  models: CloudProviderModelRecord[]
  defaultModel: string | null
  supportsCloudRuntime: boolean
  createdAt: string
}

export type OrganizationProviderRuntimeRecord = {
  id: string
  kind: OrganizationProviderKind
  label: string
  baseUrl: string
  credentialType: CloudProviderCredentialType
  secret: string
  models: CloudProviderModelRecord[]
  defaultModel: string | null
  supportsCloudRuntime: boolean
}

export type OrganizationRole =
  | 'owner'
  | 'admin'
  | 'member'
  | 'billing_viewer'

export type ProjectRole = 'project_admin' | 'editor' | 'viewer'

export type CloudInstanceRecord = {
  id: string
  name: string
  baseUrl: string
  authMode: 'oauth'
  connectionStatus: CloudConnectionStatus
  lastError: string | null
  endpoints?: {
    apiBaseUrl: string
    realtimeBaseUrl: string
    runtimeBaseUrl: string
  }
}

export type CloudUserRecord = {
  id: string
  email: string
  displayName: string
  isAdmin: boolean
  createdAt: string
  subscription: CloudSubscriptionRecord
  complimentaryGrant?: CloudSubscriptionGrantRecord | null
}

export type CloudUsageRecord = {
  activeParallelSessions: number
  parallelSessionsLimit: number
  remainingParallelSessions: number
}

export type MemoryScope = 'global' | 'project'

export type MemoryKind =
  | 'preference'
  | 'decision'
  | 'fact'
  | 'profile'
  | 'repo_convention'
  | 'task_state'
  | 'summary'

export type MemoryStatus = 'active' | 'superseded'

export type MemoryVisibility = 'private' | 'shared'

export type MemoryOwnershipRecord = {
  organizationId: string | null
  userId: string | null
  projectId: string | null
}

export type MemoryRecord = {
  id: string
  scope: MemoryScope
  kind: MemoryKind
  title: string | null
  content: string
  tags: string[]
  topicKey: string
  confidence: number
  schemaVersion: number
  reinforcedAt: string | null
  lastUsedAt: string | null
  timesUsed: number
  sourceConversationId: string | null
  originType: string
  status: MemoryStatus
  visibility: MemoryVisibility
  fingerprint: string
  archived: boolean
  source: string
  createdAt: string
  updatedAt: string
  ownership: MemoryOwnershipRecord
}

export type MemoryStatsRecord = {
  total: number
  active: number
  superseded: number
  byKind: Record<string, number>
  byScope: Record<string, number>
  schemaVersion: number
}

export type CloudAccountRecord = {
  user: CloudUserRecord
  usage: CloudUsageRecord
  plans: CloudSubscriptionRecord[]
  organizations: OrganizationRecord[]
  activeOrganizationId: string | null
}

export type OrganizationRecord = {
  id: string
  slug: string
  name: string
  role: OrganizationRole
  providers?: OrganizationProviderRecord[]
}

export type CloudProjectRecord = {
  id: string
  organizationId: string
  organizationName: string
  name: string
  repoName: string
  kind: CloudProjectKind
  workspaceCapability: CloudWorkspaceCapability
  repository?: {
    cloneUrl: string
    defaultBranch: string | null
    authMode: CloudRepositoryAuthMode
  } | null
  location: 'cloud'
  cloudStatus: CloudConnectionStatus
}

export type CloudConversationRecord = {
  id: string
  projectId: string
  runtimeLocation: 'cloud'
  title: string
  status: 'active' | 'done' | 'archived'
  modelProvider: string | null
  modelId: string | null
}

export type CloudRuntimeAccessGrant = {
  user: CloudUserRecord
  usage: CloudUsageRecord
  subscription: CloudSubscriptionRecord
  organization: OrganizationRecord
  cloudInstance: CloudInstanceRecord
  project: CloudProjectRecord | null
  conversation: CloudConversationRecord | null
  providers: OrganizationProviderRuntimeRecord[]
  repository: {
    cloneUrl: string
    defaultBranch: string | null
    authMode: CloudRepositoryAuthMode
    accessToken: string | null
  } | null
}
