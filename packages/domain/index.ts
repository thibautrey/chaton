export type CloudRuntimeLocation = 'local' | 'cloud'

export type CloudConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'error'

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

export type OrganizationRecord = {
  id: string
  slug: string
  name: string
  role: OrganizationRole
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
