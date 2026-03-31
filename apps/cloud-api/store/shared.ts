import type {
  AcceptOrganizationInviteRequest,
  CloudConversationMessageRecord,
  CreateOrganizationInviteRequest,
  CreateCloudConversationRequest,
  CreateCloudProjectRequest,
  MemoryListRequest,
  MemorySearchRequest,
  MemoryUpdateRequest,
  MemoryUpsertRequest,
  SetActiveOrganizationRequest,
} from '../../../packages/protocol/index.js'
import type {
  CloudConversationRecord,
  CloudInstanceRecord,
  CloudProjectRecord,
  CloudProjectKind,
  CloudProviderCredentialType,
  CloudProviderModelRecord,
  CloudRepositoryAuthMode,
  CloudSubscriptionPlan,
  CloudSubscriptionGrantRecord,
  CloudSubscriptionRecord,
  CloudUsageRecord,
  MemoryRecord,
  MemoryStatsRecord,
  OrganizationProviderRecord,
  OrganizationProviderRuntimeRecord,
  OrganizationRecord,
} from '../../../packages/domain/index.js'
import {
  buildMemoryFingerprint,
  buildTopicKey,
  MEMORY_SCHEMA_VERSION,
  MEMORY_STATUS,
  MEMORY_VISIBILITY,
  normalizeMemoryKind,
} from '../../../packages/memory/index.js'

export type CloudUserState = {
  id: string
  email: string
  displayName: string
  isAdmin: boolean
  createdAt: string
  subscriptionPlan: CloudSubscriptionPlan | null
  emailVerifiedAt?: string | null
  complimentaryGrant?: {
    planId: CloudSubscriptionPlan
    grantedAt: string
    expiresAt: string | null
  } | null
}

export type CloudWorkspaceState = {
  organizations: OrganizationRecord[]
  activeOrganizationId: string | null
  cloudInstance: CloudInstanceRecord
  projectsById: Map<string, CloudProjectRecord>
  conversationsById: Map<string, CloudConversationRecord>
  messagesByConversationId: Map<string, CloudConversationMessageRecord[]>
  providerSecretsById?: Map<string, string>
  repositoryAccessTokenByProjectId?: Map<string, string>
  memoriesById?: Map<string, MemoryRecord>
}

export type CloudOrganizationInviteRecord = {
  organizationId: string
  email: string
  inviterUserId: string
  tokenHash?: string
  expiresAt: string
  acceptedAt: string | null
}

export type CloudDesktopAuthRequestState = {
  state: string
  clientId: string
  redirectUri: string
  baseUrl: string
  authCode: string
  codeChallenge: string
  codeChallengeMethod: 'S256'
  scope: string
  nonce: string | null
  userId: string | null
  expiresAt: string
  createdAt: string
  consumedAt: string | null
}

export type CloudRuntimeAccessGrant = {
  user: CloudUserState
  subscription: CloudSubscriptionRecord
  usage: CloudUsageRecord
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

export type CloudStore = {
  mode: 'memory' | 'postgres'
  init(): Promise<void>
  close(): Promise<void>
  listPlans(): Promise<CloudSubscriptionRecord[]>
  savePlan(plan: CloudSubscriptionRecord): Promise<void>
  getUserByAccessToken(accessToken: string): Promise<CloudUserState | null>
  getUserById(userId: string): Promise<CloudUserState | null>
  getUserByEmail(email: string): Promise<CloudUserState | null>
  findOrCreateUserForLogin(params: {
    email: string
    displayName?: string | null
  }): Promise<CloudUserState>
  createUserWithPassword(params: {
    email: string
    displayName: string
    passwordHash: string
  }): Promise<CloudUserState>
  authenticateUserWithPassword(params: {
    email: string
    password: string
    verifyPassword: (password: string, passwordHash: string) => boolean
  }): Promise<CloudUserState | null>
  saveSession(params: {
    userId: string
    accessToken: string
    refreshToken: string
    expiresAt: string
  }): Promise<void>
  listUsers(): Promise<CloudUserState[]>
  updateUser(
    userId: string,
    updates: {
      subscriptionPlan?: CloudSubscriptionPlan
      isAdmin?: boolean
    },
  ): Promise<CloudUserState | null>
  getWorkspaceState(user: CloudUserState): Promise<CloudWorkspaceState>
  setActiveOrganization(
    user: CloudUserState,
    input: SetActiveOrganizationRequest,
  ): Promise<string | null>
  updateOrganization(
    user: CloudUserState,
    input: {
      organizationId?: string
      name: string
      slug: string
      plan?: CloudSubscriptionPlan
    },
  ): Promise<OrganizationRecord>
  addOrganizationProvider(
    user: CloudUserState,
    input: {
      organizationId?: string
      kind: OrganizationProviderRecord['kind']
      label: string
      secret: string
      baseUrl?: string | null
      credentialType?: CloudProviderCredentialType | null
      models?: CloudProviderModelRecord[] | null
      defaultModel?: string | null
    },
  ): Promise<{
    organization: OrganizationRecord
    provider: OrganizationProviderRecord
  }>
  createProject(user: CloudUserState, input: CreateCloudProjectRequest): Promise<CloudProjectRecord>
  createConversation(
    user: CloudUserState,
    input: CreateCloudConversationRequest,
  ): Promise<CloudConversationRecord | null>
  getConversationMessages(
    user: CloudUserState,
    conversationId: string,
  ): Promise<CloudConversationMessageRecord[] | null>
  saveConversationMessages(
    user: CloudUserState,
    conversationId: string,
    messages: CloudConversationMessageRecord[],
  ): Promise<CloudConversationMessageRecord[] | null>
  listMemory(
    user: CloudUserState,
    input: MemoryListRequest,
  ): Promise<MemoryRecord[]>
  searchMemory(
    user: CloudUserState,
    input: MemorySearchRequest,
  ): Promise<Array<MemoryRecord & { score: number; matchReasons: string[] }>>
  getMemory(
    user: CloudUserState,
    memoryId: string,
  ): Promise<MemoryRecord | null>
  upsertMemory(
    user: CloudUserState,
    input: MemoryUpsertRequest & { organizationId?: string | null },
  ): Promise<MemoryRecord | null>
  updateMemory(
    user: CloudUserState,
    input: MemoryUpdateRequest,
  ): Promise<MemoryRecord | null>
  deleteMemory(
    user: CloudUserState,
    memoryId: string,
  ): Promise<boolean>
  getMemoryStats(
    user: CloudUserState,
    input: MemoryListRequest,
  ): Promise<MemoryStatsRecord>
  getActiveParallelSessions(userId: string): Promise<number>
  authorizeAccess(params: {
    accessToken: string
    cloudInstanceId: string
    projectId?: string | null
    conversationId?: string | null
  }): Promise<CloudRuntimeAccessGrant | null>
  internalUpsertMemory(params: {
    organizationId: string
    userId: string
    input: MemoryUpsertRequest
  }): Promise<MemoryRecord | null>
  createDesktopAuthRequest(request: CloudDesktopAuthRequestState): Promise<void>
  getDesktopAuthRequest(state: string): Promise<CloudDesktopAuthRequestState | null>
  authorizeDesktopAuthRequest(params: {
    state: string
    userId: string
  }): Promise<CloudDesktopAuthRequestState | null>
  consumeDesktopAuthCode(params: {
    authCode: string
    clientId: string
    redirectUri: string
  }): Promise<CloudDesktopAuthRequestState | null>
  saveEmailVerificationToken(params: {
    userId: string
    tokenHash: string
    expiresAt: string
  }): Promise<void>
  consumeEmailVerificationToken(tokenHash: string): Promise<CloudUserState | null>
  savePasswordResetToken(params: {
    userId: string
    tokenHash: string
    expiresAt: string
  }): Promise<void>
  consumePasswordResetToken(tokenHash: string): Promise<CloudUserState | null>
  updateUserPassword(userId: string, passwordHash: string): Promise<void>
  markEmailVerified(userId: string): Promise<void>
  grantComplimentarySubscription(params: {
    userId: string
    planId: CloudSubscriptionPlan
    durationDays?: number | null
  }): Promise<CloudUserState | null>
  createOrganizationInvite(
    user: CloudUserState,
    input: CreateOrganizationInviteRequest,
  ): Promise<{ organization: OrganizationRecord; email: string; token: string } | null>
  acceptOrganizationInvite(
    user: CloudUserState,
    input: AcceptOrganizationInviteRequest,
  ): Promise<OrganizationRecord | null>
}

export type StoreContext = {
  publicBaseUrl: string
}

export type CloudRepositoryConfigRecord = {
  cloneUrl: string
  defaultBranch: string | null
  authMode: CloudRepositoryAuthMode
  accessToken: string | null
}

export function normalizeProviderCredentialType(
  credentialType: CloudProviderCredentialType | null | undefined,
): CloudProviderCredentialType {
  return credentialType === 'oauth' ? 'oauth' : 'api_key'
}

export function normalizeProviderBaseUrl(
  kind: OrganizationProviderRecord['kind'],
  baseUrl: string | null | undefined,
): string {
  const trimmed = typeof baseUrl === 'string' ? baseUrl.trim() : ''
  if (trimmed) {
    return trimmed
  }
  switch (kind) {
    case 'openai':
      return 'https://api.openai.com/v1'
    case 'anthropic':
      return 'https://api.anthropic.com/v1'
    case 'google':
      return 'https://generativelanguage.googleapis.com/v1beta/openai'
    case 'github-copilot':
      return 'https://api.individual.githubcopilot.com'
    default:
      return ''
  }
}

export function normalizeProviderModels(
  models: CloudProviderModelRecord[] | null | undefined,
): CloudProviderModelRecord[] {
  if (!Array.isArray(models)) {
    return []
  }
  return models
    .map((model) => ({
      id: model?.id?.trim?.() ?? '',
      label: model?.label?.trim?.() ?? model?.id?.trim?.() ?? '',
    }))
    .filter((model) => model.id.length > 0)
}

export function supportsCloudRuntime(kind: OrganizationProviderRecord['kind']): boolean {
  return kind !== 'github-copilot'
}

export function getProjectKind(
  kind: CloudProjectKind | null | undefined,
): CloudProjectKind {
  return kind === 'repository' ? 'repository' : 'conversation_only'
}

export function getWorkspaceCapabilityForKind(kind: CloudProjectKind): CloudProjectRecord['workspaceCapability'] {
  return kind === 'repository' ? 'full_tools' : 'chat_only'
}

export function normalizeRepositoryConfig(
  input: CreateCloudProjectRequest['repository'],
): CloudRepositoryConfigRecord | null {
  if (!input) {
    return null
  }
  const cloneUrl = input.cloneUrl?.trim?.() ?? ''
  if (!cloneUrl) {
    return null
  }
  return {
    cloneUrl,
    defaultBranch: input.defaultBranch?.trim?.() || null,
    authMode: input.authMode === 'token' ? 'token' : 'none',
    accessToken: input.accessToken?.trim?.() || null,
  }
}

export function toProjectRecord(params: {
  id: string
  organizationId: string
  organizationName: string
  name: string
  kind: CloudProjectKind
  repository: CloudRepositoryConfigRecord | null
  cloudStatus?: CloudProjectRecord['cloudStatus']
}): CloudProjectRecord {
  const kind = getProjectKind(params.kind)
  const repository = kind === 'repository' ? params.repository : null
  return {
    id: params.id,
    organizationId: params.organizationId,
    organizationName: params.organizationName,
    name: params.name,
    repoName:
      repository?.cloneUrl
        ?.split('/')
        ?.filter(Boolean)
        ?.at(-1)
        ?.replace(/\.git$/i, '') || params.organizationName,
    kind,
    workspaceCapability: getWorkspaceCapabilityForKind(kind),
    repository:
      repository == null
        ? null
        : {
            cloneUrl: repository.cloneUrl,
            defaultBranch: repository.defaultBranch,
            authMode: repository.authMode,
          },
    location: 'cloud',
    cloudStatus: params.cloudStatus ?? 'connected',
  }
}

export const DEFAULT_PLANS: CloudSubscriptionRecord[] = [
  { id: 'plus', label: 'Plus', parallelSessionsLimit: 3, isDefault: true },
  { id: 'pro', label: 'Pro', parallelSessionsLimit: 10, isDefault: false },
  { id: 'max', label: 'Max', parallelSessionsLimit: 30, isDefault: false },
]

export function clonePlan(plan: CloudSubscriptionRecord): CloudSubscriptionRecord {
  return {
    id: plan.id,
    label: plan.label,
    parallelSessionsLimit: plan.parallelSessionsLimit,
    isDefault: plan.isDefault === true,
    isHidden: plan.isHidden === true,
  }
}

export function normalizePlans(plans: CloudSubscriptionRecord[]): CloudSubscriptionRecord[] {
  const ordered = plans
    .map((plan) => clonePlan(plan))
    .sort((left, right) => left.id.localeCompare(right.id))
  if (!ordered.some((plan) => plan.isDefault)) {
    const plus = ordered.find((plan) => plan.id === 'plus') ?? ordered[0]
    if (plus) {
      plus.isDefault = true
    }
  }
  return ordered
}

export function getPlanRecord(
  plans: CloudSubscriptionRecord[],
  planId: CloudSubscriptionPlan | null,
): CloudSubscriptionRecord {
  return (
    plans.find((plan) => plan.id === planId) ??
    plans.find((plan) => plan.isDefault) ??
    DEFAULT_PLANS[0]
  )
}

export function getEffectivePlanId(user: CloudUserState): CloudSubscriptionPlan | null {
  const grant = user.complimentaryGrant
  if (grant && (grant.expiresAt == null || Date.parse(grant.expiresAt) > Date.now())) {
    return grant.planId
  }
  return user.subscriptionPlan
}

export function getEffectiveGrant(
  user: CloudUserState,
  plans: CloudSubscriptionRecord[],
): CloudSubscriptionGrantRecord | null {
  const grant = user.complimentaryGrant
  if (!grant) {
    return null
  }
  if (grant.expiresAt != null && Date.parse(grant.expiresAt) <= Date.now()) {
    return null
  }
  return {
    plan: getPlanRecord(plans, grant.planId),
    grantedAt: grant.grantedAt,
    expiresAt: grant.expiresAt,
  }
}

export function createDefaultWorkspaceState(
  user: CloudUserState,
  publicBaseUrl: string,
): CloudWorkspaceState {
  const organizationId = `org-${user.id}`
  const organizationName = 'Chatons Cloud'
  const organization: OrganizationRecord = {
    id: organizationId,
    slug: `chatons-cloud-${user.id}`,
    name: organizationName,
    role: user.isAdmin ? 'owner' : 'member',
    providers: [],
  }
  const cloudInstance: CloudInstanceRecord = {
    id: `instance-${user.id}`,
    name: 'Chatons Cloud',
    baseUrl: publicBaseUrl,
    authMode: 'oauth',
    connectionStatus: 'connected',
    lastError: null,
  }
  const defaultProject: CloudProjectRecord = {
    id: `project-${user.id}-workspace`,
    organizationId,
    organizationName,
    name: 'Cloud Workspace',
    repoName: organizationName,
    kind: 'conversation_only',
    workspaceCapability: 'chat_only',
    repository: null,
    location: 'cloud',
    cloudStatus: 'connected',
  }

  return {
    organizations: [organization],
    activeOrganizationId: organization.id,
    cloudInstance,
    projectsById: new Map([[defaultProject.id, defaultProject]]),
    conversationsById: new Map(),
    messagesByConversationId: new Map(),
    providerSecretsById: new Map(),
    repositoryAccessTokenByProjectId: new Map(),
    memoriesById: new Map(),
  }
}

export function cloneOrganizations(organizations: OrganizationRecord[]): OrganizationRecord[] {
  return organizations.map((organization) => ({
    ...organization,
    providers: [...(organization.providers ?? [])],
  }))
}

export function cloneMemoryRecord(record: MemoryRecord): MemoryRecord {
  return {
    ...record,
    tags: [...record.tags],
    ownership: { ...record.ownership },
  }
}

export function toMemoryRecord(params: {
  id: string
  organizationId: string | null
  userId: string | null
  projectId: string | null
  scope: 'global' | 'project'
  title: string | null
  content: string
  tags: string[]
  kind?: string | null
  source?: string | null
  sourceConversationId?: string | null
  topicKey?: string | null
  confidence?: number | null
  visibility?: 'private' | 'shared' | null
  status?: 'active' | 'superseded' | null
  originType?: string | null
  fingerprint?: string | null
  archived?: boolean
  createdAt?: string
  updatedAt?: string
  reinforcedAt?: string | null
  lastUsedAt?: string | null
  timesUsed?: number
}): MemoryRecord {
  const now = new Date().toISOString()
  const kind = normalizeMemoryKind(params.kind)
  const topicKey = buildTopicKey({
    topicKey: params.topicKey,
    kind,
    title: params.title,
    content: params.content,
    tags: params.tags,
  })
  return {
    id: params.id,
    scope: params.scope,
    kind,
    title: params.title,
    content: params.content.trim(),
    tags: [...params.tags],
    topicKey,
    confidence:
      typeof params.confidence === 'number' && Number.isFinite(params.confidence)
        ? Math.min(1, Math.max(0, params.confidence))
        : 0.5,
    schemaVersion: MEMORY_SCHEMA_VERSION,
    reinforcedAt: params.reinforcedAt ?? null,
    lastUsedAt: params.lastUsedAt ?? null,
    timesUsed: params.timesUsed ?? 0,
    sourceConversationId: params.sourceConversationId ?? null,
    originType: params.originType?.trim() || 'manual',
    status: params.status === MEMORY_STATUS.SUPERSEDED ? 'superseded' : 'active',
    visibility: params.visibility === MEMORY_VISIBILITY.SHARED ? 'shared' : 'private',
    fingerprint:
      params.fingerprint?.trim() ||
      buildMemoryFingerprint({
        scope: params.scope,
        organizationId: params.organizationId,
        userId: params.userId,
        projectId: params.projectId,
        kind,
        topicKey,
        title: params.title,
        content: params.content,
        tags: params.tags,
      }),
    archived: params.archived === true,
    source: params.source?.trim() || 'manual',
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
    ownership: {
      organizationId: params.organizationId,
      userId: params.userId,
      projectId: params.projectId,
    },
  }
}

export function canAccessMemoryRecord(
  record: MemoryRecord,
  params: {
    organizationId: string | null
    userId: string
    projectId?: string | null
  },
): boolean {
  if (record.ownership.organizationId !== params.organizationId) return false
  if (record.scope === 'global') return record.ownership.userId === params.userId
  if (!params.projectId) return true
  return record.ownership.projectId === params.projectId
}

export type CloudMemoryRow = {
  id: string
  organization_id: string | null
  user_id: string | null
  project_id: string | null
  scope: 'global' | 'project'
  kind: string | null
  title: string | null
  content: string
  tags_json: string[] | null
  topic_key: string | null
  confidence: number | null
  schema_version: number | null
  reinforced_at: string | Date | null
  last_used_at: string | Date | null
  times_used: number | null
  source_conversation_id: string | null
  origin_type: string | null
  status: 'active' | 'superseded' | null
  visibility: 'private' | 'shared' | null
  fingerprint: string | null
  archived: boolean | null
  source: string | null
  created_at: string | Date
  updated_at: string | Date
  last_seen_at?: string | Date | null
  fts_rank?: number | null
}

export function toIsoString(value: string | Date | null | undefined): string | null {
  if (value == null) return null
  return typeof value === 'string' ? value : value.toISOString()
}

export function toMemoryRecordFromRow(row: CloudMemoryRow): MemoryRecord {
  return toMemoryRecord({
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    projectId: row.project_id,
    scope: row.scope === 'project' ? 'project' : 'global',
    kind: row.kind,
    title: row.title,
    content: row.content,
    tags: Array.isArray(row.tags_json) ? row.tags_json : [],
    source: row.source ?? 'manual',
    sourceConversationId: row.source_conversation_id,
    topicKey: row.topic_key,
    confidence: row.confidence,
    visibility: row.visibility,
    status: row.status,
    originType: row.origin_type,
    fingerprint: row.fingerprint,
    archived: row.archived === true,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
    reinforcedAt: toIsoString(row.reinforced_at),
    lastUsedAt: toIsoString(row.last_used_at),
    timesUsed: row.times_used ?? 0,
  })
}

export function buildMemoryTagsText(tags: string[]): string {
  return tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .join(' ')
}

export function buildMemorySearchDocumentParts(input: {
  title: string | null
  content: string
  topicKey: string
  tagsText: string
  kind: string
}): string {
  return [
    input.title?.trim() ?? '',
    input.content.trim(),
    input.topicKey.trim(),
    input.tagsText.trim(),
    normalizeMemoryKind(input.kind),
  ]
    .filter(Boolean)
    .join(' ')
}
