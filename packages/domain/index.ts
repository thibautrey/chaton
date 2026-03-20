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

export type OrganizationProviderKind =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'github-copilot'

export type OrganizationProviderRecord = {
  id: string
  kind: OrganizationProviderKind
  label: string
  secretHint: string
  createdAt: string
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
