import type {
  CloudConnectionStatus,
  CloudConversationRecord,
  CloudProjectRecord,
  CloudInstanceRecord,
  CloudSubscriptionPlan,
  CloudSubscriptionRecord,
  CloudUsageRecord,
  CloudUserRecord,
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
  organizationName: string
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
}

export type CloudAdminListUsersResponse = {
  users: CloudUserRecord[]
  plans: CloudSubscriptionRecord[]
}

export type CloudAdminUpdateUserRequest = {
  subscriptionPlan?: CloudSubscriptionPlan
  isAdmin?: boolean
}

export type CloudAdminUpdatePlanRequest = {
  label?: string
  parallelSessionsLimit?: number
  isDefault?: boolean
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
