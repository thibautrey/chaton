import type {
  CloudConnectionStatus,
  CloudConversationRecord,
  CloudProjectRecord,
  CloudInstanceRecord,
  CloudProjectKind,
  CloudProviderCredentialType,
  CloudProviderModelRecord,
  CloudRepositoryAuthMode,
  OrganizationProviderKind,
  OrganizationProviderRecord,
  CloudSubscriptionPlan,
  CloudSubscriptionRecord,
  CloudUsageRecord,
  CloudUserRecord,
  MemoryKind,
  MemoryRecord,
  MemoryScope,
  MemoryStatsRecord,
  OrganizationRecord,
} from '../domain/index.js'

export type EventEnvelope<TPayload> = {
  id: string
  type: string
  ts: string
  seq?: number
  organizationId?: string
  projectId?: string
  conversationId?: string
  payload: TPayload
}

export type CloudBootstrapResponse = {
  user: CloudUserRecord
  organizations: OrganizationRecord[]
  activeOrganizationId: string | null
  cloudInstances: CloudInstanceRecord[]
  projects: CloudProjectRecord[]
  conversations: CloudConversationRecord[]
  usage: CloudUsageRecord
}

export type HealthResponse = {
  ok: true
  service: 'cloud-api' | 'cloud-realtime' | 'runtime-headless'
  version: string
  timestamp: string
}

export type ConnectInstanceRequest = {
  name: string
  baseUrl: string
}

export type CreateCloudProjectRequest = {
  name: string
  organizationId: string
  kind: CloudProjectKind
  repository?: {
    cloneUrl: string
    defaultBranch?: string | null
    authMode?: CloudRepositoryAuthMode
    accessToken?: string | null
  } | null
}

export type CreateCloudProjectResponse = {
  project: CloudProjectRecord
}

export type CreateCloudConversationRequest = {
  projectId: string
  title: string
  modelProvider?: string | null
  modelId?: string | null
}

export type CreateCloudConversationResponse = {
  conversation: CloudConversationRecord
}

export type CloudConversationMessageRecord = {
  id: string
  role: string
  timestamp: number
  content: string
}

export type GetCloudConversationMessagesResponse = {
  conversationId: string
  messages: CloudConversationMessageRecord[]
}

export type CloudDesktopAuthExchangeRequest = {
  grantType?: 'authorization_code' | 'refresh_token'
  clientId: string
  redirectUri: string
  code?: string
  refreshToken?: string
  codeVerifier?: string
}

export type CloudDesktopAuthExchangeResponse = {
  user: CloudUserRecord
  session: {
    accessToken: string
    refreshToken: string
    expiresAt: string
  }
  idToken?: string
}

export type CloudAccountResponse = {
  user: CloudUserRecord
  usage: CloudUsageRecord
  plans: CloudSubscriptionRecord[]
  organizations: OrganizationRecord[]
  activeOrganizationId: string | null
}

export type CloudAdminListUsersResponse = {
  users: CloudUserRecord[]
  plans: CloudSubscriptionRecord[]
}

export type CloudAdminUpdateUserRequest = {
  subscriptionPlan?: CloudSubscriptionPlan
  isAdmin?: boolean
}

export type CloudAdminGrantSubscriptionRequest = {
  planId: CloudSubscriptionPlan
  durationDays?: number | null
}

export type CloudAdminUpdatePlanRequest = {
  label?: string
  parallelSessionsLimit?: number
  isDefault?: boolean
  /** When true, this plan is hidden from the client UI */
  isHidden?: boolean
}

export type CloudWebSessionResponse = {
  user: CloudUserRecord
  session: {
    accessToken: string
    refreshToken: string
    expiresAt: string
  }
  requiresEmailVerification?: boolean
}

export type CloudWebSignupRequest = {
  email: string
  displayName: string
  password: string
}

export type CloudWebLoginRequest = {
  email: string
  password: string
}

export type CloudEmailActionResponse = {
  ok: true
}

export type CloudForgotPasswordRequest = {
  email: string
}

export type CloudResetPasswordRequest = {
  token: string
  password: string
}

export type CloudVerifyEmailRequest = {
  token: string
}

export type UpdateOrganizationRequest = {
  organizationId?: string
  name: string
  slug: string
  plan?: CloudSubscriptionPlan
}

export type SetActiveOrganizationRequest = {
  organizationId: string
}

export type CreateOrganizationInviteRequest = {
  organizationId: string
  email: string
}

export type CreateOrganizationInviteResponse = {
  ok: true
}

export type AcceptOrganizationInviteRequest = {
  token: string
}

export type AcceptOrganizationInviteResponse = {
  ok: true
  organization: OrganizationRecord
}

export type AddOrganizationProviderRequest = {
  organizationId?: string
  kind: OrganizationProviderKind
  label: string
  secret: string
  baseUrl?: string | null
  credentialType?: CloudProviderCredentialType
  models?: CloudProviderModelRecord[] | null
  defaultModel?: string | null
}

export type AddOrganizationProviderResponse = {
  provider: OrganizationProviderRecord
  organization: OrganizationRecord
}

export type CloudRuntimeSessionCreateResponse =
  | { id: string; status: string; usage: CloudUsageRecord }
  | {
      error: 'subscription_required' | 'parallel_session_limit_reached'
      message: string
      usage: CloudUsageRecord
    }

export type RealtimeTokenResponse = {
  token: string
  expiresAt: string
  websocketUrl: string
}

export type RealtimeReplayResponse = {
  cloudInstanceId: string
  lastSeq: number
  events: RealtimeServerEvent[]
}

export type RuntimeStatusPayload = {
  status: CloudConnectionStatus
  message?: string
}

export type CloudInstanceStatusPayload = {
  cloudInstanceId: string
  status: CloudConnectionStatus
  message?: string
}

export type ConversationChunkPayload = {
  chunk: string
}

export type ConversationEventPayload = {
  event: {
    type: string
    [key: string]: unknown
  }
}

export type RealtimeServerEvent =
  | EventEnvelope<{ project: CloudProjectRecord }>
  | EventEnvelope<{ conversation: CloudConversationRecord }>
  | EventEnvelope<RuntimeStatusPayload>
  | EventEnvelope<CloudInstanceStatusPayload>
  | EventEnvelope<ConversationChunkPayload>
  | EventEnvelope<ConversationEventPayload>

export type MemorySearchRequest = {
  query: string
  scope?: 'global' | 'project' | 'all'
  projectId?: string | null
  limit?: number
  kind?: MemoryKind | null
  tags?: string[] | null
  includeArchived?: boolean
}

export type MemoryListRequest = {
  scope?: MemoryScope | 'all'
  projectId?: string | null
  kind?: MemoryKind | null
  limit?: number
  includeArchived?: boolean
}

export type MemoryUpsertRequest = {
  id?: string
  scope: MemoryScope
  projectId?: string | null
  kind?: MemoryKind | null
  title?: string | null
  content: string
  tags?: string[] | null
  source?: string | null
  conversationId?: string | null
  topicKey?: string | null
  confidence?: number | null
  visibility?: 'private' | 'shared' | null
}

export type MemoryUpdateRequest = {
  id: string
  title?: string | null
  content?: string | null
  kind?: MemoryKind | null
  tags?: string[] | null
  archived?: boolean | null
  status?: 'active' | 'superseded' | null
  topicKey?: string | null
  confidence?: number | null
  visibility?: 'private' | 'shared' | null
}

export type MemoryStatsResponse = MemoryStatsRecord

export type MemorySearchResult = MemoryRecord & {
  score: number
  matchReasons: string[]
}

export type MemorySearchResponse = {
  items: MemorySearchResult[]
}

export type MemoryListResponse = {
  items: MemoryRecord[]
}

export type MemoryGetResponse = {
  item: MemoryRecord | null
}
