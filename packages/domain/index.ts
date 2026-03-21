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
