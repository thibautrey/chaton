import crypto from 'node:crypto'
import { Pool } from 'pg'
import type {
  CloudConversationMessageRecord,
  CreateCloudConversationRequest,
  CreateCloudProjectRequest,
} from '../../packages/protocol/index.js'
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
  OrganizationProviderRecord,
  OrganizationProviderRuntimeRecord,
  OrganizationRecord,
} from '../../packages/domain/index.js'

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
  organization: OrganizationRecord
  cloudInstance: CloudInstanceRecord
  projectsById: Map<string, CloudProjectRecord>
  conversationsById: Map<string, CloudConversationRecord>
  messagesByConversationId: Map<string, CloudConversationMessageRecord[]>
  providerSecretsById?: Map<string, string>
  repositoryAccessTokenByProjectId?: Map<string, string>
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
    passwordHash: string
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
  updateOrganization(
    user: CloudUserState,
    input: {
      name: string
      slug: string
      plan?: CloudSubscriptionPlan
    },
  ): Promise<OrganizationRecord>
  addOrganizationProvider(
    user: CloudUserState,
    input: {
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
  getActiveParallelSessions(userId: string): Promise<number>
  authorizeAccess(params: {
    accessToken: string
    cloudInstanceId: string
    projectId?: string | null
    conversationId?: string | null
  }): Promise<CloudRuntimeAccessGrant | null>
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
}

type StoreContext = {
  publicBaseUrl: string
}

type CloudRepositoryConfigRecord = {
  cloneUrl: string
  defaultBranch: string | null
  authMode: CloudRepositoryAuthMode
  accessToken: string | null
}

function normalizeProviderCredentialType(
  credentialType: CloudProviderCredentialType | null | undefined,
): CloudProviderCredentialType {
  return credentialType === 'oauth' ? 'oauth' : 'api_key'
}

function normalizeProviderBaseUrl(
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

function normalizeProviderModels(
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

function supportsCloudRuntime(kind: OrganizationProviderRecord['kind']): boolean {
  return kind !== 'github-copilot'
}

function getProjectKind(
  kind: CloudProjectKind | null | undefined,
): CloudProjectKind {
  return kind === 'repository' ? 'repository' : 'conversation_only'
}

function getWorkspaceCapabilityForKind(kind: CloudProjectKind): CloudProjectRecord['workspaceCapability'] {
  return kind === 'repository' ? 'full_tools' : 'chat_only'
}

function normalizeRepositoryConfig(
  input: CreateCloudProjectRequest['repository'],
  fallbackRepoName: string,
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

function toProjectRecord(params: {
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

const DEFAULT_PLANS: CloudSubscriptionRecord[] = [
  { id: 'plus', label: 'Plus', parallelSessionsLimit: 3, isDefault: true },
  { id: 'pro', label: 'Pro', parallelSessionsLimit: 10, isDefault: false },
  { id: 'max', label: 'Max', parallelSessionsLimit: 30, isDefault: false },
]

function clonePlan(plan: CloudSubscriptionRecord): CloudSubscriptionRecord {
  return {
    id: plan.id,
    label: plan.label,
    parallelSessionsLimit: plan.parallelSessionsLimit,
    isDefault: plan.isDefault === true,
  }
}

function normalizePlans(plans: CloudSubscriptionRecord[]): CloudSubscriptionRecord[] {
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

function getPlanRecord(
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

function createDefaultWorkspaceState(
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
    organization,
    cloudInstance,
    projectsById: new Map([[defaultProject.id, defaultProject]]),
    conversationsById: new Map(),
    messagesByConversationId: new Map(),
    providerSecretsById: new Map(),
    repositoryAccessTokenByProjectId: new Map(),
  }
}

class MemoryCloudStore implements CloudStore {
  mode: 'memory' = 'memory'
  private readonly context: StoreContext
  private readonly usersById = new Map<string, CloudUserState>()
  private readonly usersByAccessToken = new Map<string, string>()
  private readonly userIdsByEmail = new Map<string, string>()
  private readonly passwordHashesByUserId = new Map<string, string>()
  private readonly workspaceStateByUserId = new Map<string, CloudWorkspaceState>()
  private readonly plansById = new Map<CloudSubscriptionPlan, CloudSubscriptionRecord>(
    DEFAULT_PLANS.map((plan) => [plan.id, clonePlan(plan)]),
  )
  private readonly desktopAuthRequestsByState = new Map<string, CloudDesktopAuthRequestState>()
  private readonly emailVerificationByTokenHash = new Map<string, {
    userId: string
    expiresAt: string
  }>()
  private readonly passwordResetByTokenHash = new Map<string, {
    userId: string
    expiresAt: string
  }>()

  constructor(context: StoreContext) {
    this.context = context
  }

  async init(): Promise<void> {}

  async listPlans(): Promise<CloudSubscriptionRecord[]> {
    return normalizePlans(Array.from(this.plansById.values()))
  }

  async savePlan(plan: CloudSubscriptionRecord): Promise<void> {
    if (plan.isDefault) {
      for (const current of this.plansById.values()) {
        current.isDefault = false
      }
    }
    this.plansById.set(plan.id, clonePlan(plan))
  }

  async getUserByAccessToken(accessToken: string): Promise<CloudUserState | null> {
    const userId = this.usersByAccessToken.get(accessToken)
    return userId ? this.usersById.get(userId) ?? null : null
  }

  async getUserById(userId: string): Promise<CloudUserState | null> {
    return this.usersById.get(userId) ?? null
  }

  async getUserByEmail(email: string): Promise<CloudUserState | null> {
    const userId = this.userIdsByEmail.get(email.trim().toLowerCase())
    return userId ? this.usersById.get(userId) ?? null : null
  }

  async findOrCreateUserForLogin(params: {
    email: string
    displayName?: string | null
  }): Promise<CloudUserState> {
    const normalizedEmail = params.email.trim().toLowerCase()
    const existingId = this.userIdsByEmail.get(normalizedEmail)
    if (existingId) {
      const existing = this.usersById.get(existingId)
      if (existing) {
        return existing
      }
    }

    const existingCount = this.usersById.size
    const derivedSlug = normalizedEmail.replace(/[^a-z0-9]+/g, '-').slice(0, 48)
    const userId = `user-${derivedSlug || crypto.randomUUID()}`
    const displayName =
      params.displayName?.trim() ||
      normalizedEmail
        .split('@')[0]
        .split(/[^a-z0-9]+/g)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ') ||
      'Connected User'

    const user: CloudUserState = {
      id: userId,
      email: normalizedEmail,
      displayName,
      isAdmin: existingCount === 0,
      createdAt: new Date().toISOString(),
      subscriptionPlan: 'plus',
      emailVerifiedAt: null,
      complimentaryGrant: null,
    }
    this.userIdsByEmail.set(normalizedEmail, user.id)
    this.usersById.set(user.id, user)
    this.workspaceStateByUserId.set(
      user.id,
      createDefaultWorkspaceState(user, this.context.publicBaseUrl),
    )
    return user
  }

  async createUserWithPassword(params: {
    email: string
    displayName: string
    passwordHash: string
  }): Promise<CloudUserState> {
    const existing = await this.getUserByEmail(params.email)
    if (existing) {
      throw new Error('An account already exists for this email')
    }
    const user = await this.findOrCreateUserForLogin({
      email: params.email,
      displayName: params.displayName,
    })
    this.passwordHashesByUserId.set(user.id, params.passwordHash)
    return user
  }

  async authenticateUserWithPassword(params: {
    email: string
    passwordHash: string
  }): Promise<CloudUserState | null> {
    const user = await this.getUserByEmail(params.email)
    if (!user) {
      return null
    }
    return this.passwordHashesByUserId.get(user.id) === params.passwordHash ? user : null
  }

  async saveSession(params: {
    userId: string
    accessToken: string
    refreshToken: string
    expiresAt: string
  }): Promise<void> {
    this.usersByAccessToken.set(params.accessToken, params.userId)
  }

  async listUsers(): Promise<CloudUserState[]> {
    return Array.from(this.usersById.values()).sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    )
  }

  async updateUser(
    userId: string,
    updates: {
      subscriptionPlan?: CloudSubscriptionPlan
      isAdmin?: boolean
    },
  ): Promise<CloudUserState | null> {
    const user = this.usersById.get(userId)
    if (!user) {
      return null
    }
    if (updates.subscriptionPlan) {
      user.subscriptionPlan = updates.subscriptionPlan
    }
    if (typeof updates.isAdmin === 'boolean') {
      user.isAdmin = updates.isAdmin
    }
    const workspace = this.workspaceStateByUserId.get(user.id)
    if (workspace) {
      workspace.organization.role = user.isAdmin ? 'owner' : 'member'
      workspace.cloudInstance.baseUrl = this.context.publicBaseUrl
    }
    return user
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    this.passwordHashesByUserId.set(userId, passwordHash)
  }

  async markEmailVerified(userId: string): Promise<void> {
    const user = this.usersById.get(userId)
    if (user) {
      user.emailVerifiedAt = new Date().toISOString()
    }
  }

  async grantComplimentarySubscription(params: {
    userId: string
    planId: CloudSubscriptionPlan
    durationDays?: number | null
  }): Promise<CloudUserState | null> {
    const user = this.usersById.get(params.userId)
    if (!user) {
      return null
    }
    user.complimentaryGrant = {
      planId: params.planId,
      grantedAt: new Date().toISOString(),
      expiresAt:
        typeof params.durationDays === 'number' && params.durationDays > 0
          ? new Date(Date.now() + params.durationDays * 24 * 60 * 60 * 1000).toISOString()
          : null,
    }
    return user
  }

  async getWorkspaceState(user: CloudUserState): Promise<CloudWorkspaceState> {
    const existing = this.workspaceStateByUserId.get(user.id)
    if (existing) {
      existing.organization.role = user.isAdmin ? 'owner' : 'member'
      existing.cloudInstance.baseUrl = this.context.publicBaseUrl
      return existing
    }
    const created = createDefaultWorkspaceState(user, this.context.publicBaseUrl)
    this.workspaceStateByUserId.set(user.id, created)
    return created
  }

  async createProject(
    user: CloudUserState,
    input: CreateCloudProjectRequest,
  ): Promise<CloudProjectRecord> {
    const workspace = await this.getWorkspaceState(user)
    const repository = normalizeRepositoryConfig(input.repository, workspace.organization.name)
    const project = toProjectRecord({
      id: `project-${crypto.randomUUID()}`,
      organizationId: workspace.organization.id,
      organizationName: input.organizationName?.trim() || workspace.organization.name,
      name: input.name.trim(),
      kind: getProjectKind(input.kind),
      repository,
      cloudStatus: 'connected',
    })
    workspace.projectsById.set(project.id, project)
    if (repository?.accessToken) {
      workspace.repositoryAccessTokenByProjectId?.set(project.id, repository.accessToken)
    }
    return project
  }

  async updateOrganization(
    user: CloudUserState,
    input: {
      name: string
      slug: string
      plan?: CloudSubscriptionPlan
    },
  ): Promise<OrganizationRecord> {
    const workspace = await this.getWorkspaceState(user)
    workspace.organization = {
      ...workspace.organization,
      name: input.name.trim(),
      slug: input.slug.trim(),
      providers: workspace.organization.providers ?? [],
    }
    if (input.plan) {
      user.subscriptionPlan = input.plan
      this.usersById.set(user.id, user)
    }
    return {
      ...workspace.organization,
      providers: [...(workspace.organization.providers ?? [])],
    }
  }

  async addOrganizationProvider(
    user: CloudUserState,
    input: {
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
  }> {
    const workspace = await this.getWorkspaceState(user)
    const models = normalizeProviderModels(input.models)
    const provider: OrganizationProviderRecord = {
      id: `provider-${crypto.randomUUID()}`,
      kind: input.kind,
      label: input.label.trim(),
      secretHint: input.secret.trim().slice(0, 6),
      baseUrl: normalizeProviderBaseUrl(input.kind, input.baseUrl),
      credentialType: normalizeProviderCredentialType(input.credentialType),
      models,
      defaultModel: input.defaultModel?.trim() || models[0]?.id || null,
      supportsCloudRuntime: supportsCloudRuntime(input.kind),
      createdAt: new Date().toISOString(),
    }
    workspace.organization = {
      ...workspace.organization,
      providers: [...(workspace.organization.providers ?? []), provider],
    }
    workspace.providerSecretsById?.set(provider.id, input.secret.trim())
    return {
      organization: {
        ...workspace.organization,
        providers: [...(workspace.organization.providers ?? [])],
      },
      provider,
    }
  }

  async createConversation(
    user: CloudUserState,
    input: CreateCloudConversationRequest,
  ): Promise<CloudConversationRecord | null> {
    const workspace = await this.getWorkspaceState(user)
    const project = workspace.projectsById.get(input.projectId)
    if (!project) {
      return null
    }
    const conversation: CloudConversationRecord = {
      id: `conversation-${crypto.randomUUID()}`,
      projectId: project.id,
      runtimeLocation: 'cloud',
      title: input.title?.trim() || `New - ${project.name}`,
      status: 'active',
      modelProvider: input.modelProvider ?? null,
      modelId: input.modelId ?? null,
    }
    workspace.conversationsById.set(conversation.id, conversation)
    workspace.messagesByConversationId.set(conversation.id, [])
    return conversation
  }

  async getConversationMessages(
    user: CloudUserState,
    conversationId: string,
  ): Promise<CloudConversationMessageRecord[] | null> {
    const workspace = await this.getWorkspaceState(user)
    if (!workspace.conversationsById.has(conversationId)) {
      return null
    }
    return workspace.messagesByConversationId.get(conversationId) ?? []
  }

  async saveConversationMessages(
    user: CloudUserState,
    conversationId: string,
    messages: CloudConversationMessageRecord[],
  ): Promise<CloudConversationMessageRecord[] | null> {
    const workspace = await this.getWorkspaceState(user)
    if (!workspace.conversationsById.has(conversationId)) {
      return null
    }
    const normalized = messages.map((message) => ({
      id: message.id,
      role: message.role,
      timestamp: message.timestamp,
      content: message.content,
    }))
    workspace.messagesByConversationId.set(conversationId, normalized)
    return normalized
  }

  async getActiveParallelSessions(_userId: string): Promise<number> {
    return 0
  }

  async authorizeAccess(params: {
    accessToken: string
    cloudInstanceId: string
    projectId?: string | null
    conversationId?: string | null
  }): Promise<CloudRuntimeAccessGrant | null> {
    const user = await this.getUserByAccessToken(params.accessToken)
    if (!user) {
      return null
    }
    const workspace = await this.getWorkspaceState(user)
    if (workspace.cloudInstance.id !== params.cloudInstanceId) {
      return null
    }

    let project = params.projectId ? workspace.projectsById.get(params.projectId) ?? null : null
    const conversation = params.conversationId
      ? workspace.conversationsById.get(params.conversationId) ?? null
      : null
    if (params.projectId && !project) {
      return null
    }
    if (params.conversationId && !conversation) {
      return null
    }
    if (conversation) {
      project = workspace.projectsById.get(conversation.projectId) ?? project
      if (params.projectId && conversation.projectId !== params.projectId) {
        return null
      }
    }
    const plans = await this.listPlans()
    const subscription = getPlanRecord(plans, user.subscriptionPlan)
    const activeParallelSessions = await this.getActiveParallelSessions(user.id)
    const providers: OrganizationProviderRuntimeRecord[] = (workspace.organization.providers ?? []).map(
      (provider) => ({
        id: provider.id,
        kind: provider.kind,
        label: provider.label,
        baseUrl: provider.baseUrl,
        credentialType: provider.credentialType,
        secret: workspace.providerSecretsById?.get(provider.id) ?? '',
        models: provider.models,
        defaultModel: provider.defaultModel,
        supportsCloudRuntime: provider.supportsCloudRuntime,
      }),
    )
    return {
      user,
      subscription,
      usage: {
        activeParallelSessions,
        parallelSessionsLimit: subscription.parallelSessionsLimit,
        remainingParallelSessions: Math.max(
          0,
          subscription.parallelSessionsLimit - activeParallelSessions,
        ),
      },
      organization: workspace.organization,
      cloudInstance: workspace.cloudInstance,
      project,
      conversation,
      providers,
      repository:
        project?.repository == null
          ? null
          : {
              cloneUrl: project.repository.cloneUrl,
              defaultBranch: project.repository.defaultBranch,
              authMode: project.repository.authMode,
              accessToken: workspace.repositoryAccessTokenByProjectId?.get(project.id) ?? null,
            },
    }
  }

  async createDesktopAuthRequest(request: CloudDesktopAuthRequestState): Promise<void> {
    this.desktopAuthRequestsByState.set(request.state, {
      ...request,
    })
  }

  async getDesktopAuthRequest(state: string): Promise<CloudDesktopAuthRequestState | null> {
    const request = this.desktopAuthRequestsByState.get(state)
    if (!request) {
      return null
    }
    if (Date.parse(request.expiresAt) <= Date.now()) {
      this.desktopAuthRequestsByState.delete(state)
      return null
    }
    return { ...request }
  }

  async authorizeDesktopAuthRequest(params: {
    state: string
    userId: string
  }): Promise<CloudDesktopAuthRequestState | null> {
    const request = await this.getDesktopAuthRequest(params.state)
    if (!request) {
      return null
    }
    if (request.consumedAt) {
      return null
    }
    request.userId = params.userId
    this.desktopAuthRequestsByState.set(request.state, request)
    return { ...request }
  }

  async consumeDesktopAuthCode(params: {
    authCode: string
    clientId: string
    redirectUri: string
  }): Promise<CloudDesktopAuthRequestState | null> {
    const request = Array.from(this.desktopAuthRequestsByState.values()).find(
      (entry) =>
        entry.authCode === params.authCode &&
        entry.clientId === params.clientId &&
        entry.redirectUri === params.redirectUri,
    )
    if (!request) {
      return null
    }
    if (request.consumedAt || !request.userId || Date.parse(request.expiresAt) <= Date.now()) {
      return null
    }
    request.consumedAt = new Date().toISOString()
    this.desktopAuthRequestsByState.set(request.state, request)
    return { ...request }
  }

  async saveEmailVerificationToken(params: {
    userId: string
    tokenHash: string
    expiresAt: string
  }): Promise<void> {
    this.emailVerificationByTokenHash.set(params.tokenHash, {
      userId: params.userId,
      expiresAt: params.expiresAt,
    })
  }

  async consumeEmailVerificationToken(tokenHash: string): Promise<CloudUserState | null> {
    const record = this.emailVerificationByTokenHash.get(tokenHash)
    if (!record || Date.parse(record.expiresAt) <= Date.now()) {
      return null
    }
    this.emailVerificationByTokenHash.delete(tokenHash)
    const user = await this.getUserById(record.userId)
    if (!user) {
      return null
    }
    await this.markEmailVerified(user.id)
    return user
  }

  async savePasswordResetToken(params: {
    userId: string
    tokenHash: string
    expiresAt: string
  }): Promise<void> {
    this.passwordResetByTokenHash.set(params.tokenHash, {
      userId: params.userId,
      expiresAt: params.expiresAt,
    })
  }

  async consumePasswordResetToken(tokenHash: string): Promise<CloudUserState | null> {
    const record = this.passwordResetByTokenHash.get(tokenHash)
    if (!record || Date.parse(record.expiresAt) <= Date.now()) {
      return null
    }
    this.passwordResetByTokenHash.delete(tokenHash)
    return this.getUserById(record.userId)
  }
}

class PostgresCloudStore implements CloudStore {
  mode: 'postgres' = 'postgres'
  private readonly context: StoreContext
  private readonly pool: Pool
  private initialized = false

  constructor(
    context: StoreContext,
    databaseUrl: string,
  ) {
    this.context = context
    this.pool = new Pool({
      connectionString: databaseUrl,
    })
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS cloud_users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        display_name TEXT NOT NULL,
        is_admin BOOLEAN NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        subscription_plan TEXT,
        password_hash TEXT,
        email_verified_at TIMESTAMPTZ,
        complimentary_plan_id TEXT,
        complimentary_granted_at TIMESTAMPTZ,
        complimentary_expires_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS cloud_sessions (
        access_token TEXT PRIMARY KEY,
        refresh_token TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES cloud_users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS cloud_sessions_user_id_idx ON cloud_sessions(user_id);
      CREATE TABLE IF NOT EXISTS cloud_subscription_plans (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        parallel_sessions_limit INTEGER NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cloud_desktop_auth_requests (
        state TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        base_url TEXT NOT NULL,
        auth_code TEXT NOT NULL UNIQUE,
        code_challenge TEXT NOT NULL,
        code_challenge_method TEXT NOT NULL,
        scope TEXT NOT NULL,
        nonce TEXT,
        user_id TEXT REFERENCES cloud_users(id) ON DELETE SET NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS cloud_workspaces (
        user_id TEXT PRIMARY KEY REFERENCES cloud_users(id) ON DELETE CASCADE,
        organization_json JSONB NOT NULL,
        cloud_instance_json JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cloud_organizations (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES cloud_users(id) ON DELETE CASCADE,
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS cloud_organizations_owner_user_id_uidx
        ON cloud_organizations(owner_user_id);
      CREATE TABLE IF NOT EXISTS cloud_organization_memberships (
        organization_id TEXT NOT NULL REFERENCES cloud_organizations(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES cloud_users(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (organization_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS cloud_organization_memberships_user_id_idx
        ON cloud_organization_memberships(user_id);
      CREATE TABLE IF NOT EXISTS cloud_organization_providers (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES cloud_organizations(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        secret_hint TEXT NOT NULL,
        base_url TEXT NOT NULL,
        credential_type TEXT NOT NULL,
        models_json JSONB NOT NULL,
        default_model TEXT,
        supports_cloud_runtime BOOLEAN NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS cloud_organization_providers_organization_id_idx
        ON cloud_organization_providers(organization_id);
      CREATE TABLE IF NOT EXISTS cloud_projects (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES cloud_users(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL,
        organization_name TEXT NOT NULL,
        name TEXT NOT NULL,
        repo_name TEXT NOT NULL,
        project_kind TEXT NOT NULL DEFAULT 'conversation_only',
        workspace_capability TEXT NOT NULL DEFAULT 'chat_only',
        repository_json JSONB,
        location TEXT NOT NULL,
        cloud_status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS cloud_projects_user_id_idx ON cloud_projects(user_id);
      CREATE TABLE IF NOT EXISTS cloud_conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES cloud_users(id) ON DELETE CASCADE,
        organization_id TEXT,
        project_id TEXT NOT NULL REFERENCES cloud_projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        model_provider TEXT,
        model_id TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS cloud_conversations_user_id_idx ON cloud_conversations(user_id);
      CREATE INDEX IF NOT EXISTS cloud_conversations_organization_id_idx ON cloud_conversations(organization_id);
      CREATE TABLE IF NOT EXISTS cloud_conversation_messages (
        conversation_id TEXT PRIMARY KEY REFERENCES cloud_conversations(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES cloud_users(id) ON DELETE CASCADE,
        organization_id TEXT,
        messages_json JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cloud_organization_provider_secrets (
        provider_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES cloud_users(id) ON DELETE CASCADE,
        organization_id TEXT,
        secret TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS cloud_organization_provider_secrets_user_id_idx
        ON cloud_organization_provider_secrets(user_id);
      CREATE INDEX IF NOT EXISTS cloud_organization_provider_secrets_organization_id_idx
        ON cloud_organization_provider_secrets(organization_id);
      CREATE TABLE IF NOT EXISTS cloud_project_repository_secrets (
        project_id TEXT PRIMARY KEY REFERENCES cloud_projects(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES cloud_users(id) ON DELETE CASCADE,
        organization_id TEXT,
        access_token TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS cloud_project_repository_secrets_user_id_idx
        ON cloud_project_repository_secrets(user_id);
      CREATE INDEX IF NOT EXISTS cloud_project_repository_secrets_organization_id_idx
        ON cloud_project_repository_secrets(organization_id);
      CREATE TABLE IF NOT EXISTS cloud_email_verification_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES cloud_users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cloud_password_reset_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES cloud_users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
    `)

    await this.pool.query(`
      ALTER TABLE cloud_projects
      ADD COLUMN IF NOT EXISTS project_kind TEXT NOT NULL DEFAULT 'conversation_only';
      ALTER TABLE cloud_projects
      ADD COLUMN IF NOT EXISTS workspace_capability TEXT NOT NULL DEFAULT 'chat_only';
      ALTER TABLE cloud_projects
      ADD COLUMN IF NOT EXISTS repository_json JSONB;
      ALTER TABLE cloud_conversations
      ADD COLUMN IF NOT EXISTS organization_id TEXT;
      ALTER TABLE cloud_conversation_messages
      ADD COLUMN IF NOT EXISTS organization_id TEXT;
      ALTER TABLE cloud_organization_provider_secrets
      ADD COLUMN IF NOT EXISTS organization_id TEXT;
      ALTER TABLE cloud_project_repository_secrets
      ADD COLUMN IF NOT EXISTS organization_id TEXT;
      ALTER TABLE cloud_users
      ADD COLUMN IF NOT EXISTS password_hash TEXT;
      ALTER TABLE cloud_users
      ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
      ALTER TABLE cloud_users
      ADD COLUMN IF NOT EXISTS complimentary_plan_id TEXT;
      ALTER TABLE cloud_users
      ADD COLUMN IF NOT EXISTS complimentary_granted_at TIMESTAMPTZ;
      ALTER TABLE cloud_users
      ADD COLUMN IF NOT EXISTS complimentary_expires_at TIMESTAMPTZ
    `)

    await this.pool.query(`
      ALTER TABLE cloud_desktop_auth_requests
      ADD COLUMN IF NOT EXISTS client_id TEXT;
      ALTER TABLE cloud_desktop_auth_requests
      ADD COLUMN IF NOT EXISTS code_challenge TEXT;
      ALTER TABLE cloud_desktop_auth_requests
      ADD COLUMN IF NOT EXISTS code_challenge_method TEXT;
      ALTER TABLE cloud_desktop_auth_requests
      ADD COLUMN IF NOT EXISTS scope TEXT;
      ALTER TABLE cloud_desktop_auth_requests
      ADD COLUMN IF NOT EXISTS nonce TEXT;
      ALTER TABLE cloud_desktop_auth_requests
      ADD COLUMN IF NOT EXISTS user_id TEXT;
    `)
    await this.pool.query(
      `
        UPDATE cloud_conversations c
        SET organization_id = p.organization_id
        FROM cloud_projects p
        WHERE c.project_id = p.id
          AND (c.organization_id IS NULL OR c.organization_id = '');
        UPDATE cloud_conversation_messages cm
        SET organization_id = c.organization_id
        FROM cloud_conversations c
        WHERE cm.conversation_id = c.id
          AND (cm.organization_id IS NULL OR cm.organization_id = '');
        UPDATE cloud_organization_provider_secrets s
        SET organization_id = p.organization_id
        FROM cloud_organization_providers p
        WHERE s.provider_id = p.id
          AND (s.organization_id IS NULL OR s.organization_id = '');
        UPDATE cloud_project_repository_secrets s
        SET organization_id = p.organization_id
        FROM cloud_projects p
        WHERE s.project_id = p.id
          AND (s.organization_id IS NULL OR s.organization_id = '');
        UPDATE cloud_desktop_auth_requests
        SET
          client_id = COALESCE(NULLIF(client_id, ''), 'chatons-desktop'),
          code_challenge = COALESCE(NULLIF(code_challenge, ''), auth_code),
          code_challenge_method = COALESCE(NULLIF(code_challenge_method, ''), 'S256'),
          scope = COALESCE(NULLIF(scope, ''), 'openid profile email offline_access')
        WHERE client_id IS NULL
           OR code_challenge IS NULL
           OR code_challenge_method IS NULL
           OR scope IS NULL
      `,
    )
    await this.pool.query(
      `
        ALTER TABLE cloud_desktop_auth_requests
        ALTER COLUMN client_id SET NOT NULL;
        ALTER TABLE cloud_desktop_auth_requests
        ALTER COLUMN code_challenge SET NOT NULL;
        ALTER TABLE cloud_desktop_auth_requests
        ALTER COLUMN code_challenge_method SET NOT NULL;
        ALTER TABLE cloud_desktop_auth_requests
        ALTER COLUMN scope SET NOT NULL
      `,
    )

    const existingPlans = await this.pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM cloud_subscription_plans',
    )
    if (Number.parseInt(existingPlans.rows[0]?.count ?? '0', 10) === 0) {
      for (const plan of DEFAULT_PLANS) {
        await this.savePlan(plan)
      }
    }

    this.initialized = true
  }

  private toUser(row: {
    id: string
    email: string
    display_name: string
    is_admin: boolean
    created_at: string | Date
    subscription_plan: CloudSubscriptionPlan | null
    email_verified_at?: string | Date | null
    complimentary_plan_id?: CloudSubscriptionPlan | null
    complimentary_granted_at?: string | Date | null
    complimentary_expires_at?: string | Date | null
  }): CloudUserState {
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      isAdmin: row.is_admin,
      createdAt:
        typeof row.created_at === 'string'
          ? row.created_at
          : row.created_at.toISOString(),
      subscriptionPlan: row.subscription_plan,
      emailVerifiedAt:
        row.email_verified_at == null
          ? null
          : typeof row.email_verified_at === 'string'
            ? row.email_verified_at
            : row.email_verified_at.toISOString(),
      complimentaryGrant:
        row.complimentary_plan_id
          ? {
              planId: row.complimentary_plan_id,
              grantedAt:
                row.complimentary_granted_at == null
                  ? new Date().toISOString()
                  : typeof row.complimentary_granted_at === 'string'
                    ? row.complimentary_granted_at
                    : row.complimentary_granted_at.toISOString(),
              expiresAt:
                row.complimentary_expires_at == null
                  ? null
                  : typeof row.complimentary_expires_at === 'string'
                    ? row.complimentary_expires_at
                    : row.complimentary_expires_at.toISOString(),
            }
          : null,
    }
  }

  private toAuthRequest(row: {
    state: string
    client_id: string
    redirect_uri: string
    base_url: string
    auth_code: string
    code_challenge: string
    code_challenge_method: string
    scope: string
    nonce: string | null
    user_id: string | null
    expires_at: string | Date
    created_at: string | Date
    consumed_at: string | Date | null
  }): CloudDesktopAuthRequestState {
    return {
      state: row.state,
      clientId: row.client_id,
      redirectUri: row.redirect_uri,
      baseUrl: row.base_url,
      authCode: row.auth_code,
      codeChallenge: row.code_challenge,
      codeChallengeMethod: row.code_challenge_method === 'S256' ? 'S256' : 'S256',
      scope: row.scope,
      nonce: row.nonce,
      userId: row.user_id,
      expiresAt: typeof row.expires_at === 'string' ? row.expires_at : row.expires_at.toISOString(),
      createdAt: typeof row.created_at === 'string' ? row.created_at : row.created_at.toISOString(),
      consumedAt:
        row.consumed_at == null
          ? null
          : typeof row.consumed_at === 'string'
            ? row.consumed_at
            : row.consumed_at.toISOString(),
    }
  }

  private normalizeWorkspace(user: CloudUserState, workspace: CloudWorkspaceState): CloudWorkspaceState {
    workspace.organization.role = user.isAdmin ? 'owner' : 'member'
    workspace.organization.providers = workspace.organization.providers ?? []
    workspace.cloudInstance.baseUrl = this.context.publicBaseUrl
    workspace.cloudInstance.authMode = 'oauth'
    workspace.cloudInstance.connectionStatus = 'connected'
    workspace.cloudInstance.lastError = null
    workspace.providerSecretsById = workspace.providerSecretsById ?? new Map()
    workspace.repositoryAccessTokenByProjectId = workspace.repositoryAccessTokenByProjectId ?? new Map()
    return workspace
  }

  private async upsertNormalizedOrganization(
    user: CloudUserState,
    organization: OrganizationRecord,
  ): Promise<void> {
    await this.init()
    const now = new Date().toISOString()
    await this.pool.query(
      `
        INSERT INTO cloud_organizations(id, owner_user_id, slug, name, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE
        SET owner_user_id = EXCLUDED.owner_user_id,
            slug = EXCLUDED.slug,
            name = EXCLUDED.name,
            updated_at = EXCLUDED.updated_at
      `,
      [organization.id, user.id, organization.slug, organization.name, now, now],
    )
    await this.pool.query(
      `
        INSERT INTO cloud_organization_memberships(organization_id, user_id, role, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (organization_id, user_id) DO UPDATE
        SET role = EXCLUDED.role,
            updated_at = EXCLUDED.updated_at
      `,
      [organization.id, user.id, organization.role, now, now],
    )

    for (const provider of organization.providers ?? []) {
      await this.pool.query(
        `
          INSERT INTO cloud_organization_providers(
            id, organization_id, kind, label, secret_hint, base_url, credential_type, models_json,
            default_model, supports_cloud_runtime, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12)
          ON CONFLICT (id) DO UPDATE
          SET organization_id = EXCLUDED.organization_id,
              kind = EXCLUDED.kind,
              label = EXCLUDED.label,
              secret_hint = EXCLUDED.secret_hint,
              base_url = EXCLUDED.base_url,
              credential_type = EXCLUDED.credential_type,
              models_json = EXCLUDED.models_json,
              default_model = EXCLUDED.default_model,
              supports_cloud_runtime = EXCLUDED.supports_cloud_runtime,
              updated_at = EXCLUDED.updated_at
        `,
        [
          provider.id,
          organization.id,
          provider.kind,
          provider.label,
          provider.secretHint,
          provider.baseUrl,
          provider.credentialType,
          JSON.stringify(provider.models),
          provider.defaultModel,
          provider.supportsCloudRuntime,
          provider.createdAt,
          now,
        ],
      )
    }
  }

  private async syncWorkspaceOrganizationJson(
    userId: string,
    organization: OrganizationRecord,
  ): Promise<void> {
    await this.pool.query(
      `
        UPDATE cloud_workspaces
        SET organization_json = $2::jsonb,
            updated_at = $3
        WHERE user_id = $1
      `,
      [userId, JSON.stringify(organization), new Date().toISOString()],
    )
  }

  private async getOrganizationForUser(user: CloudUserState): Promise<OrganizationRecord> {
    await this.init()
    const organizationResult = await this.pool.query<{
      id: string
      slug: string
      name: string
      role: OrganizationRecord['role']
    }>(
      `
        SELECT o.id, o.slug, o.name, m.role
        FROM cloud_organizations o
        INNER JOIN cloud_organization_memberships m
          ON m.organization_id = o.id
        WHERE m.user_id = $1
        ORDER BY
          CASE WHEN o.owner_user_id = $1 THEN 0 ELSE 1 END,
          o.created_at ASC
        LIMIT 1
      `,
      [user.id],
    )

    if (!organizationResult.rowCount) {
      const fallback = createDefaultWorkspaceState(user, this.context.publicBaseUrl)
      await this.upsertNormalizedOrganization(user, fallback.organization)
      return fallback.organization
    }

    const organizationRow = organizationResult.rows[0]
    const providersResult = await this.pool.query<{
      id: string
      kind: OrganizationProviderRecord['kind']
      label: string
      secret_hint: string
      base_url: string
      credential_type: CloudProviderCredentialType
      models_json: CloudProviderModelRecord[]
      default_model: string | null
      supports_cloud_runtime: boolean
      created_at: string | Date
    }>(
      `
        SELECT id, kind, label, secret_hint, base_url, credential_type, models_json, default_model,
               supports_cloud_runtime, created_at
        FROM cloud_organization_providers
        WHERE organization_id = $1
        ORDER BY created_at ASC
      `,
      [organizationRow.id],
    )

    return {
      id: organizationRow.id,
      slug: organizationRow.slug,
      name: organizationRow.name,
      role: organizationRow.role,
      providers: providersResult.rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        label: row.label,
        secretHint: row.secret_hint,
        baseUrl: row.base_url,
        credentialType: row.credential_type,
        models: Array.isArray(row.models_json) ? row.models_json : [],
        defaultModel: row.default_model,
        supportsCloudRuntime: row.supports_cloud_runtime,
        createdAt:
          typeof row.created_at === 'string' ? row.created_at : row.created_at.toISOString(),
      })),
    }
  }

  async listPlans(): Promise<CloudSubscriptionRecord[]> {
    await this.init()
    const result = await this.pool.query<{
      id: CloudSubscriptionPlan
      label: string
      parallel_sessions_limit: number
      is_default: boolean
    }>(
      `
        SELECT id, label, parallel_sessions_limit, is_default
        FROM cloud_subscription_plans
        ORDER BY id ASC
      `,
    )
    if (!result.rowCount) {
      return normalizePlans(DEFAULT_PLANS)
    }
    return normalizePlans(
      result.rows.map((row) => ({
        id: row.id,
        label: row.label,
        parallelSessionsLimit: row.parallel_sessions_limit,
        isDefault: row.is_default,
      })),
    )
  }

  async savePlan(plan: CloudSubscriptionRecord): Promise<void> {
    if (!this.initialized) {
      await this.init()
    }
    if (plan.isDefault) {
      await this.pool.query('UPDATE cloud_subscription_plans SET is_default = FALSE')
    }
    await this.pool.query(
      `
        INSERT INTO cloud_subscription_plans(id, label, parallel_sessions_limit, is_default, updated_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE
        SET label = EXCLUDED.label,
            parallel_sessions_limit = EXCLUDED.parallel_sessions_limit,
            is_default = EXCLUDED.is_default,
            updated_at = EXCLUDED.updated_at
      `,
      [
        plan.id,
        plan.label,
        plan.parallelSessionsLimit,
        plan.isDefault === true,
        new Date().toISOString(),
      ],
    )
  }

  async getUserByAccessToken(accessToken: string): Promise<CloudUserState | null> {
    await this.init()
    const result = await this.pool.query<{
      id: string
      email: string
      display_name: string
      is_admin: boolean
      created_at: string | Date
      subscription_plan: CloudSubscriptionPlan | null
      email_verified_at?: string | Date | null
      complimentary_plan_id?: CloudSubscriptionPlan | null
      complimentary_granted_at?: string | Date | null
      complimentary_expires_at?: string | Date | null
    }>(
      `
        SELECT u.id, u.email, u.display_name, u.is_admin, u.created_at, u.subscription_plan, u.email_verified_at,
               u.complimentary_plan_id, u.complimentary_granted_at, u.complimentary_expires_at
        FROM cloud_sessions s
        INNER JOIN cloud_users u ON u.id = s.user_id
        WHERE s.access_token = $1
          AND s.expires_at > NOW()
      `,
      [accessToken],
    )
    return result.rowCount ? this.toUser(result.rows[0]) : null
  }

  async getUserById(userId: string): Promise<CloudUserState | null> {
    await this.init()
    const result = await this.pool.query<{
      id: string
      email: string
      display_name: string
      is_admin: boolean
      created_at: string | Date
      subscription_plan: CloudSubscriptionPlan | null
      email_verified_at?: string | Date | null
      complimentary_plan_id?: CloudSubscriptionPlan | null
      complimentary_granted_at?: string | Date | null
      complimentary_expires_at?: string | Date | null
    }>(
      `
        SELECT id, email, display_name, is_admin, created_at, subscription_plan, email_verified_at,
               complimentary_plan_id, complimentary_granted_at, complimentary_expires_at
        FROM cloud_users
        WHERE id = $1
      `,
      [userId],
    )
    return result.rowCount ? this.toUser(result.rows[0]) : null
  }

  async getUserByEmail(email: string): Promise<CloudUserState | null> {
    await this.init()
    const normalizedEmail = email.trim().toLowerCase()
    const result = await this.pool.query<{
      id: string
      email: string
      display_name: string
      is_admin: boolean
      created_at: string | Date
      subscription_plan: CloudSubscriptionPlan | null
      email_verified_at?: string | Date | null
      complimentary_plan_id?: CloudSubscriptionPlan | null
      complimentary_granted_at?: string | Date | null
      complimentary_expires_at?: string | Date | null
    }>(
      `
        SELECT id, email, display_name, is_admin, created_at, subscription_plan, email_verified_at,
               complimentary_plan_id, complimentary_granted_at, complimentary_expires_at
        FROM cloud_users
        WHERE lower(email) = $1
      `,
      [normalizedEmail],
    )
    return result.rowCount ? this.toUser(result.rows[0]) : null
  }

  async findOrCreateUserForLogin(params: {
    email: string
    displayName?: string | null
  }): Promise<CloudUserState> {
    await this.init()
    const normalizedEmail = params.email.trim().toLowerCase()
    const existing = await this.pool.query<{
      id: string
      email: string
      display_name: string
      is_admin: boolean
      created_at: string | Date
      subscription_plan: CloudSubscriptionPlan | null
      email_verified_at?: string | Date | null
      complimentary_plan_id?: CloudSubscriptionPlan | null
      complimentary_granted_at?: string | Date | null
      complimentary_expires_at?: string | Date | null
    }>(
      `
        SELECT id, email, display_name, is_admin, created_at, subscription_plan, email_verified_at,
               complimentary_plan_id, complimentary_granted_at, complimentary_expires_at
        FROM cloud_users
        WHERE lower(email) = $1
      `,
      [normalizedEmail],
    )
    if (existing.rowCount) {
      return this.toUser(existing.rows[0])
    }

    const countResult = await this.pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM cloud_users',
    )
    const derivedSlug = normalizedEmail.replace(/[^a-z0-9]+/g, '-').slice(0, 48)
    const user: CloudUserState = {
      id: `user-${derivedSlug || crypto.randomUUID()}`,
      email: normalizedEmail,
      displayName:
        params.displayName?.trim() ||
        normalizedEmail
          .split('@')[0]
          .split(/[^a-z0-9]+/g)
          .filter(Boolean)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ') ||
        'Connected User',
      isAdmin: Number.parseInt(countResult.rows[0]?.count ?? '0', 10) === 0,
      createdAt: new Date().toISOString(),
      subscriptionPlan: 'plus',
      emailVerifiedAt: null,
      complimentaryGrant: null,
    }

    await this.pool.query(
      `
        INSERT INTO cloud_users(
          id, email, display_name, is_admin, created_at, subscription_plan, email_verified_at,
          complimentary_plan_id, complimentary_granted_at, complimentary_expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        user.id,
        user.email,
        user.displayName,
        user.isAdmin,
        user.createdAt,
        user.subscriptionPlan,
        user.emailVerifiedAt,
        null,
        null,
        null,
      ],
    )
    await this.ensureWorkspaceExists(user)
    return user
  }

  async createUserWithPassword(params: {
    email: string
    displayName: string
    passwordHash: string
  }): Promise<CloudUserState> {
    await this.init()
    const existing = await this.getUserByEmail(params.email)
    if (existing) {
      throw new Error('An account already exists for this email')
    }
    const user = await this.findOrCreateUserForLogin({
      email: params.email,
      displayName: params.displayName,
    })
    await this.pool.query(
      `
        UPDATE cloud_users
        SET password_hash = $2
        WHERE id = $1
      `,
      [user.id, params.passwordHash],
    )
    return (await this.getUserById(user.id)) as CloudUserState
  }

  async authenticateUserWithPassword(params: {
    email: string
    passwordHash: string
  }): Promise<CloudUserState | null> {
    await this.init()
    const normalizedEmail = params.email.trim().toLowerCase()
    const result = await this.pool.query<{
      id: string
      email: string
      display_name: string
      is_admin: boolean
      created_at: string | Date
      subscription_plan: CloudSubscriptionPlan | null
      email_verified_at?: string | Date | null
      complimentary_plan_id?: CloudSubscriptionPlan | null
      complimentary_granted_at?: string | Date | null
      complimentary_expires_at?: string | Date | null
    }>(
      `
        SELECT id, email, display_name, is_admin, created_at, subscription_plan, email_verified_at,
               complimentary_plan_id, complimentary_granted_at, complimentary_expires_at
        FROM cloud_users
        WHERE lower(email) = $1
          AND password_hash = $2
      `,
      [normalizedEmail, params.passwordHash],
    )
    return result.rowCount ? this.toUser(result.rows[0]) : null
  }

  async saveSession(params: {
    userId: string
    accessToken: string
    refreshToken: string
    expiresAt: string
  }): Promise<void> {
    await this.init()
    await this.pool.query(
      `
        INSERT INTO cloud_sessions(access_token, refresh_token, user_id, expires_at, created_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (access_token) DO UPDATE
        SET refresh_token = EXCLUDED.refresh_token,
            user_id = EXCLUDED.user_id,
            expires_at = EXCLUDED.expires_at
      `,
      [
        params.accessToken,
        params.refreshToken,
        params.userId,
        params.expiresAt,
        new Date().toISOString(),
      ],
    )
  }

  async listUsers(): Promise<CloudUserState[]> {
    await this.init()
    const result = await this.pool.query<{
      id: string
      email: string
      display_name: string
      is_admin: boolean
      created_at: string | Date
      subscription_plan: CloudSubscriptionPlan | null
      email_verified_at?: string | Date | null
      complimentary_plan_id?: CloudSubscriptionPlan | null
      complimentary_granted_at?: string | Date | null
      complimentary_expires_at?: string | Date | null
    }>(
      `
        SELECT id, email, display_name, is_admin, created_at, subscription_plan, email_verified_at,
               complimentary_plan_id, complimentary_granted_at, complimentary_expires_at
        FROM cloud_users
        ORDER BY created_at ASC
      `,
    )
    return result.rows.map((row) => this.toUser(row))
  }

  async updateUser(
    userId: string,
    updates: {
      subscriptionPlan?: CloudSubscriptionPlan
      isAdmin?: boolean
    },
  ): Promise<CloudUserState | null> {
    await this.init()
    const current = await this.pool.query<{
      id: string
      email: string
      display_name: string
      is_admin: boolean
      created_at: string | Date
      subscription_plan: CloudSubscriptionPlan | null
      email_verified_at?: string | Date | null
      complimentary_plan_id?: CloudSubscriptionPlan | null
      complimentary_granted_at?: string | Date | null
      complimentary_expires_at?: string | Date | null
    }>(
      `
        SELECT id, email, display_name, is_admin, created_at, subscription_plan, email_verified_at,
               complimentary_plan_id, complimentary_granted_at, complimentary_expires_at
        FROM cloud_users
        WHERE id = $1
      `,
      [userId],
    )
    if (!current.rowCount) {
      return null
    }
    const next = this.toUser(current.rows[0])
    if (updates.subscriptionPlan) {
      next.subscriptionPlan = updates.subscriptionPlan
    }
    if (typeof updates.isAdmin === 'boolean') {
      next.isAdmin = updates.isAdmin
    }

    await this.pool.query(
      `
        UPDATE cloud_users
        SET is_admin = $2, subscription_plan = $3
        WHERE id = $1
      `,
      [userId, next.isAdmin, next.subscriptionPlan],
    )
    await this.ensureWorkspaceExists(next)
    return next
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await this.init()
    await this.pool.query(
      `
        UPDATE cloud_users
        SET password_hash = $2
        WHERE id = $1
      `,
      [userId, passwordHash],
    )
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.init()
    await this.pool.query(
      `
        UPDATE cloud_users
        SET email_verified_at = NOW()
        WHERE id = $1
      `,
      [userId],
    )
  }

  async grantComplimentarySubscription(params: {
    userId: string
    planId: CloudSubscriptionPlan
    durationDays?: number | null
  }): Promise<CloudUserState | null> {
    await this.init()
    const expiresAt =
      typeof params.durationDays === 'number' && params.durationDays > 0
        ? new Date(Date.now() + params.durationDays * 24 * 60 * 60 * 1000).toISOString()
        : null
    const result = await this.pool.query(
      `
        UPDATE cloud_users
        SET complimentary_plan_id = $2,
            complimentary_granted_at = $3,
            complimentary_expires_at = $4
        WHERE id = $1
        RETURNING id
      `,
      [params.userId, params.planId, new Date().toISOString(), expiresAt],
    )
    if (!result.rowCount) {
      return null
    }
    return this.getUserById(params.userId)
  }

  private async ensureWorkspaceExists(user: CloudUserState): Promise<void> {
    await this.init()
    const existing = await this.pool.query<{
      organization_json: OrganizationRecord
      cloud_instance_json: CloudInstanceRecord
    }>(
      `
        SELECT organization_json, cloud_instance_json
        FROM cloud_workspaces
        WHERE user_id = $1
      `,
      [user.id],
    )
    const workspace = existing.rowCount
      ? this.normalizeWorkspace(user, {
          organization: existing.rows[0].organization_json,
          cloudInstance: existing.rows[0].cloud_instance_json,
          projectsById: new Map(),
          conversationsById: new Map(),
          messagesByConversationId: new Map(),
        })
      : createDefaultWorkspaceState(user, this.context.publicBaseUrl)

    await this.pool.query(
      `
        INSERT INTO cloud_workspaces(user_id, organization_json, cloud_instance_json, updated_at)
        VALUES ($1, $2::jsonb, $3::jsonb, $4)
        ON CONFLICT (user_id) DO UPDATE
        SET organization_json = EXCLUDED.organization_json,
            cloud_instance_json = EXCLUDED.cloud_instance_json,
            updated_at = EXCLUDED.updated_at
      `,
      [
        user.id,
        JSON.stringify(workspace.organization),
        JSON.stringify(workspace.cloudInstance),
        new Date().toISOString(),
      ],
    )

    await this.upsertNormalizedOrganization(user, workspace.organization)

    const defaultProjectId = `project-${user.id}-workspace`
    await this.pool.query(
      `
        INSERT INTO cloud_projects(
          id, user_id, organization_id, organization_name, name, repo_name, project_kind, workspace_capability, repository_json, location, cloud_status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        defaultProjectId,
        user.id,
        workspace.organization.id,
        workspace.organization.name,
        'Cloud Workspace',
        workspace.organization.name,
        'conversation_only',
        'chat_only',
        JSON.stringify(null),
        'cloud',
        'connected',
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    )
  }

  async getWorkspaceState(user: CloudUserState): Promise<CloudWorkspaceState> {
    await this.ensureWorkspaceExists(user)

    const workspaceResult = await this.pool.query<{
      cloud_instance_json: CloudInstanceRecord
    }>(
      `
        SELECT cloud_instance_json
        FROM cloud_workspaces
        WHERE user_id = $1
      `,
      [user.id],
    )
    const organization = await this.getOrganizationForUser(user)
    const projectsResult = await this.pool.query<{
      id: string
      organization_id: string
      organization_name: string
      name: string
      repo_name: string
      project_kind: CloudProjectKind
      workspace_capability: CloudProjectRecord['workspaceCapability']
      repository_json: CloudRepositoryConfigRecord | null
      cloud_status: CloudProjectRecord['cloudStatus']
    }>(
      `
        SELECT id, organization_id, organization_name, name, repo_name, project_kind, workspace_capability, repository_json, cloud_status
        FROM cloud_projects p
        INNER JOIN cloud_organization_memberships m
          ON m.organization_id = p.organization_id
        WHERE m.user_id = $1
        ORDER BY p.created_at ASC
      `,
      [user.id],
    )
    const conversationsResult = await this.pool.query<{
      id: string
      project_id: string
      title: string
      status: CloudConversationRecord['status']
      model_provider: string | null
      model_id: string | null
    }>(
      `
        SELECT c.id, c.project_id, c.title, c.status, c.model_provider, c.model_id
        FROM cloud_conversations c
        INNER JOIN cloud_projects p ON p.id = c.project_id
        INNER JOIN cloud_organization_memberships m
          ON m.organization_id = p.organization_id
        WHERE m.user_id = $1
        ORDER BY c.created_at ASC
      `,
      [user.id],
    )
    const messagesResult = await this.pool.query<{
      conversation_id: string
      messages_json: CloudConversationMessageRecord[]
    }>(
      `
        SELECT cm.conversation_id, cm.messages_json
        FROM cloud_conversation_messages cm
        INNER JOIN cloud_conversations c ON c.id = cm.conversation_id
        INNER JOIN cloud_projects p ON p.id = c.project_id
        INNER JOIN cloud_organization_memberships m
          ON m.organization_id = p.organization_id
        WHERE m.user_id = $1
      `,
      [user.id],
    )
    const providerSecretsResult = await this.pool.query<{
      provider_id: string
      secret: string
    }>(
      `
        SELECT s.provider_id, s.secret
        FROM cloud_organization_provider_secrets s
        INNER JOIN cloud_organization_providers p ON p.id = s.provider_id
        INNER JOIN cloud_organization_memberships m
          ON m.organization_id = p.organization_id
        WHERE m.user_id = $1
      `,
      [user.id],
    )
    const repositorySecretsResult = await this.pool.query<{
      project_id: string
      access_token: string
    }>(
      `
        SELECT s.project_id, s.access_token
        FROM cloud_project_repository_secrets s
        INNER JOIN cloud_projects p ON p.id = s.project_id
        INNER JOIN cloud_organization_memberships m
          ON m.organization_id = p.organization_id
        WHERE m.user_id = $1
      `,
      [user.id],
    )

    return this.normalizeWorkspace(user, {
      organization,
      cloudInstance: workspaceResult.rows[0].cloud_instance_json,
      projectsById: new Map(
        projectsResult.rows.map((row) => [
          row.id,
          {
            id: row.id,
            organizationId: row.organization_id,
            organizationName: row.organization_name,
            name: row.name,
            repoName: row.repo_name,
            kind: getProjectKind(row.project_kind),
            workspaceCapability:
              row.workspace_capability === 'full_tools' ? 'full_tools' : 'chat_only',
            repository:
              row.repository_json == null
                ? null
                : {
                    cloneUrl: row.repository_json.cloneUrl,
                    defaultBranch: row.repository_json.defaultBranch,
                    authMode: row.repository_json.authMode === 'token' ? 'token' : 'none',
                  },
            location: 'cloud',
            cloudStatus: row.cloud_status,
          } satisfies CloudProjectRecord,
        ]),
      ),
      conversationsById: new Map(
        conversationsResult.rows.map((row) => [
          row.id,
          {
            id: row.id,
            projectId: row.project_id,
            runtimeLocation: 'cloud',
            title: row.title,
            status: row.status,
            modelProvider: row.model_provider,
            modelId: row.model_id,
          } satisfies CloudConversationRecord,
        ]),
      ),
      messagesByConversationId: new Map(
        messagesResult.rows.map((row) => [row.conversation_id, row.messages_json ?? []]),
      ),
      providerSecretsById: new Map(
        providerSecretsResult.rows.map((row) => [row.provider_id, row.secret]),
      ),
      repositoryAccessTokenByProjectId: new Map(
        repositorySecretsResult.rows.map((row) => [row.project_id, row.access_token]),
      ),
    })
  }

  async createProject(
    user: CloudUserState,
    input: CreateCloudProjectRequest,
  ): Promise<CloudProjectRecord> {
    await this.ensureWorkspaceExists(user)
    const organization = await this.getOrganizationForUser(user)
    if (input.organizationId.trim() !== organization.id) {
      throw new Error('Unknown organization')
    }
    const repository = normalizeRepositoryConfig(input.repository, organization.name)
    const project = toProjectRecord({
      id: `project-${crypto.randomUUID()}`,
      organizationId: organization.id,
      organizationName: input.organizationName?.trim() || organization.name,
      name: input.name.trim(),
      kind: getProjectKind(input.kind),
      repository,
      cloudStatus: 'connected',
    })
    const now = new Date().toISOString()
    await this.pool.query(
      `
        INSERT INTO cloud_projects(
          id, user_id, organization_id, organization_name, name, repo_name, project_kind, workspace_capability, repository_json, location, cloud_status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)
      `,
      [
        project.id,
        user.id,
        project.organizationId,
        project.organizationName,
        project.name,
        project.repoName,
        project.kind,
        project.workspaceCapability,
        JSON.stringify(repository),
        project.location,
        project.cloudStatus,
        now,
        now,
      ],
    )
    if (repository?.accessToken) {
      await this.pool.query(
        `
          INSERT INTO cloud_project_repository_secrets(project_id, user_id, organization_id, access_token, updated_at)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (project_id) DO UPDATE
          SET organization_id = EXCLUDED.organization_id,
              user_id = EXCLUDED.user_id,
              access_token = EXCLUDED.access_token,
              updated_at = EXCLUDED.updated_at
        `,
        [project.id, user.id, organization.id, repository.accessToken, now],
      )
    }
    return project
  }

  async updateOrganization(
    user: CloudUserState,
    input: {
      name: string
      slug: string
      plan?: CloudSubscriptionPlan
    },
  ): Promise<OrganizationRecord> {
    await this.ensureWorkspaceExists(user)
    const current = await this.getOrganizationForUser(user)
    const organization: OrganizationRecord = {
      ...current,
      name: input.name.trim(),
      slug: input.slug.trim(),
      providers: current.providers ?? [],
    }
    if (input.plan) {
      await this.pool.query(
        `
          UPDATE cloud_users
          SET subscription_plan = $2
          WHERE id = $1
        `,
        [user.id, input.plan],
      )
    }
    await this.pool.query(
      `
        UPDATE cloud_organizations
        SET slug = $2,
            name = $3,
            updated_at = $4
        WHERE id = $1
      `,
      [organization.id, organization.slug, organization.name, new Date().toISOString()],
    )
    await this.syncWorkspaceOrganizationJson(user.id, organization)
    await this.pool.query(
      `
        UPDATE cloud_projects
        SET organization_name = $2,
            repo_name = $2,
            updated_at = $3
        WHERE organization_id = $1
      `,
      [organization.id, organization.name, new Date().toISOString()],
    )
    return organization
  }

  async addOrganizationProvider(
    user: CloudUserState,
    input: {
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
  }> {
    await this.ensureWorkspaceExists(user)
    const organization = await this.getOrganizationForUser(user)
    const models = normalizeProviderModels(input.models)
    const provider: OrganizationProviderRecord = {
      id: `provider-${crypto.randomUUID()}`,
      kind: input.kind,
      label: input.label.trim(),
      secretHint: input.secret.trim().slice(0, 6),
      baseUrl: normalizeProviderBaseUrl(input.kind, input.baseUrl),
      credentialType: normalizeProviderCredentialType(input.credentialType),
      models,
      defaultModel: input.defaultModel?.trim() || models[0]?.id || null,
      supportsCloudRuntime: supportsCloudRuntime(input.kind),
      createdAt: new Date().toISOString(),
    }
    await this.pool.query(
      `
        INSERT INTO cloud_organization_providers(
          id, organization_id, kind, label, secret_hint, base_url, credential_type, models_json,
          default_model, supports_cloud_runtime, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12)
      `,
      [
        provider.id,
        organization.id,
        provider.kind,
        provider.label,
        provider.secretHint,
        provider.baseUrl,
        provider.credentialType,
        JSON.stringify(provider.models),
        provider.defaultModel,
        provider.supportsCloudRuntime,
        provider.createdAt,
        new Date().toISOString(),
      ],
    )
    await this.pool.query(
      `
        INSERT INTO cloud_organization_provider_secrets(provider_id, user_id, organization_id, secret, updated_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (provider_id) DO UPDATE
        SET user_id = EXCLUDED.user_id,
            organization_id = EXCLUDED.organization_id,
            secret = EXCLUDED.secret,
            updated_at = EXCLUDED.updated_at
      `,
      [provider.id, user.id, organization.id, input.secret.trim(), new Date().toISOString()],
    )
    const nextOrganization: OrganizationRecord = {
      ...organization,
      providers: [...(organization.providers ?? []), provider],
    }
    await this.syncWorkspaceOrganizationJson(user.id, nextOrganization)
    return {
      organization: nextOrganization,
      provider,
    }
  }

  async createConversation(
    user: CloudUserState,
    input: CreateCloudConversationRequest,
  ): Promise<CloudConversationRecord | null> {
    await this.ensureWorkspaceExists(user)
    const projectResult = await this.pool.query<{ id: string; name: string; organization_id: string }>(
      `
        SELECT p.id, p.name, p.organization_id
        FROM cloud_projects p
        INNER JOIN cloud_organization_memberships m
          ON m.organization_id = p.organization_id
        WHERE m.user_id = $1 AND p.id = $2
      `,
      [user.id, input.projectId],
    )
    if (!projectResult.rowCount) {
      return null
    }
    const project = projectResult.rows[0]
    const organizationId = project.organization_id
    const conversation: CloudConversationRecord = {
      id: `conversation-${crypto.randomUUID()}`,
      projectId: project.id,
      runtimeLocation: 'cloud',
      title: input.title?.trim() || `New - ${project.name}`,
      status: 'active',
      modelProvider: input.modelProvider ?? null,
      modelId: input.modelId ?? null,
    }
    const now = new Date().toISOString()
    await this.pool.query(
      `
        INSERT INTO cloud_conversations(
          id, user_id, organization_id, project_id, title, status, model_provider, model_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        conversation.id,
        user.id,
        organizationId,
        conversation.projectId,
        conversation.title,
        conversation.status,
        conversation.modelProvider,
        conversation.modelId,
        now,
        now,
      ],
    )
    await this.pool.query(
      `
        INSERT INTO cloud_conversation_messages(conversation_id, user_id, organization_id, messages_json, updated_at)
        VALUES ($1, $2, $3, $4::jsonb, $5)
        ON CONFLICT (conversation_id) DO NOTHING
      `,
      [conversation.id, user.id, organizationId, JSON.stringify([]), now],
    )
    return conversation
  }

  async getConversationMessages(
    user: CloudUserState,
    conversationId: string,
  ): Promise<CloudConversationMessageRecord[] | null> {
    await this.ensureWorkspaceExists(user)
    const conversationResult = await this.pool.query<{ id: string }>(
      `
        SELECT c.id
        FROM cloud_conversations c
        INNER JOIN cloud_projects p ON p.id = c.project_id
        INNER JOIN cloud_organization_memberships m
          ON m.organization_id = p.organization_id
        WHERE m.user_id = $1 AND c.id = $2
      `,
      [user.id, conversationId],
    )
    if (!conversationResult.rowCount) {
      return null
    }
    const messagesResult = await this.pool.query<{
      messages_json: CloudConversationMessageRecord[]
    }>(
      `
        SELECT messages_json
        FROM cloud_conversation_messages
        WHERE conversation_id = $1
      `,
      [conversationId],
    )
    return messagesResult.rowCount ? messagesResult.rows[0].messages_json ?? [] : []
  }

  async saveConversationMessages(
    user: CloudUserState,
    conversationId: string,
    messages: CloudConversationMessageRecord[],
  ): Promise<CloudConversationMessageRecord[] | null> {
    await this.ensureWorkspaceExists(user)
    const conversationResult = await this.pool.query<{ id: string }>(
      `
        SELECT c.id
        FROM cloud_conversations c
        INNER JOIN cloud_projects p ON p.id = c.project_id
        INNER JOIN cloud_organization_memberships m
          ON m.organization_id = p.organization_id
        WHERE m.user_id = $1 AND c.id = $2
      `,
      [user.id, conversationId],
    )
    if (!conversationResult.rowCount) {
      return null
    }
    const normalized = messages.map((message) => ({
      id: message.id,
      role: message.role,
      timestamp: message.timestamp,
      content: message.content,
    }))
    await this.pool.query(
      `
        INSERT INTO cloud_conversation_messages(conversation_id, user_id, organization_id, messages_json, updated_at)
        VALUES (
          $1,
          $2,
          (SELECT c.organization_id FROM cloud_conversations c WHERE c.id = $1),
          $3::jsonb,
          $4
        )
        ON CONFLICT (conversation_id) DO UPDATE
        SET user_id = EXCLUDED.user_id,
            organization_id = EXCLUDED.organization_id,
            messages_json = EXCLUDED.messages_json,
            updated_at = EXCLUDED.updated_at
      `,
      [conversationId, user.id, JSON.stringify(normalized), new Date().toISOString()],
    )
    return normalized
  }

  async getActiveParallelSessions(userId: string): Promise<number> {
    await this.init()
    try {
      const result = await this.pool.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM runtime_sessions
          WHERE user_id = $1
            AND status NOT IN ('stopped', 'error')
            AND lease_expires_at > NOW()
        `,
        [userId],
      )
      return Number.parseInt(result.rows[0]?.count ?? '0', 10)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('relation "runtime_sessions" does not exist')) {
        return 0
      }
      throw error
    }
  }

  async authorizeAccess(params: {
    accessToken: string
    cloudInstanceId: string
    projectId?: string | null
    conversationId?: string | null
  }): Promise<CloudRuntimeAccessGrant | null> {
    await this.init()
    const user = await this.getUserByAccessToken(params.accessToken)
    if (!user) {
      return null
    }
    const workspace = await this.getWorkspaceState(user)
    if (workspace.cloudInstance.id !== params.cloudInstanceId) {
      return null
    }

    let project = params.projectId ? workspace.projectsById.get(params.projectId) ?? null : null
    const conversation = params.conversationId
      ? workspace.conversationsById.get(params.conversationId) ?? null
      : null
    if (params.projectId && !project) {
      return null
    }
    if (params.conversationId && !conversation) {
      return null
    }
    if (conversation) {
      project = workspace.projectsById.get(conversation.projectId) ?? project
      if (params.projectId && conversation.projectId !== params.projectId) {
        return null
      }
    }

    const plans = await this.listPlans()
    const subscription = getPlanRecord(plans, user.subscriptionPlan)
    const activeParallelSessions = await this.getActiveParallelSessions(user.id)
    const providers: OrganizationProviderRuntimeRecord[] = (workspace.organization.providers ?? []).map(
      (provider) => ({
        id: provider.id,
        kind: provider.kind,
        label: provider.label,
        baseUrl: provider.baseUrl,
        credentialType: provider.credentialType,
        secret: workspace.providerSecretsById?.get(provider.id) ?? '',
        models: provider.models,
        defaultModel: provider.defaultModel,
        supportsCloudRuntime: provider.supportsCloudRuntime,
      }),
    )
    return {
      user,
      subscription,
      usage: {
        activeParallelSessions,
        parallelSessionsLimit: subscription.parallelSessionsLimit,
        remainingParallelSessions: Math.max(
          0,
          subscription.parallelSessionsLimit - activeParallelSessions,
        ),
      },
      organization: workspace.organization,
      cloudInstance: workspace.cloudInstance,
      project,
      conversation,
      providers,
      repository:
        project?.repository == null
          ? null
          : {
              cloneUrl: project.repository.cloneUrl,
              defaultBranch: project.repository.defaultBranch,
              authMode: project.repository.authMode,
              accessToken: workspace.repositoryAccessTokenByProjectId?.get(project.id) ?? null,
            },
    }
  }

  async createDesktopAuthRequest(request: CloudDesktopAuthRequestState): Promise<void> {
    await this.init()
    await this.pool.query(
      `
        INSERT INTO cloud_desktop_auth_requests(
          state, client_id, redirect_uri, base_url, auth_code, code_challenge,
          code_challenge_method, scope, nonce, user_id, expires_at, created_at, consumed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (state) DO UPDATE
        SET client_id = EXCLUDED.client_id,
            redirect_uri = EXCLUDED.redirect_uri,
            base_url = EXCLUDED.base_url,
            auth_code = EXCLUDED.auth_code,
            code_challenge = EXCLUDED.code_challenge,
            code_challenge_method = EXCLUDED.code_challenge_method,
            scope = EXCLUDED.scope,
            nonce = EXCLUDED.nonce,
            user_id = EXCLUDED.user_id,
            expires_at = EXCLUDED.expires_at,
            created_at = EXCLUDED.created_at,
            consumed_at = EXCLUDED.consumed_at
      `,
      [
        request.state,
        request.clientId,
        request.redirectUri,
        request.baseUrl,
        request.authCode,
        request.codeChallenge,
        request.codeChallengeMethod,
        request.scope,
        request.nonce,
        request.userId,
        request.expiresAt,
        request.createdAt,
        request.consumedAt,
      ],
    )
  }

  async getDesktopAuthRequest(state: string): Promise<CloudDesktopAuthRequestState | null> {
    await this.init()
    const result = await this.pool.query<{
      state: string
      client_id: string
      redirect_uri: string
      base_url: string
      auth_code: string
      code_challenge: string
      code_challenge_method: string
      scope: string
      nonce: string | null
      user_id: string | null
      expires_at: string | Date
      created_at: string | Date
      consumed_at: string | Date | null
    }>(
      `
        SELECT state, client_id, redirect_uri, base_url, auth_code, code_challenge,
               code_challenge_method, scope, nonce, user_id, expires_at, created_at, consumed_at
        FROM cloud_desktop_auth_requests
        WHERE state = $1
          AND expires_at > NOW()
      `,
      [state],
    )
    return result.rowCount ? this.toAuthRequest(result.rows[0]) : null
  }

  async authorizeDesktopAuthRequest(params: {
    state: string
    userId: string
  }): Promise<CloudDesktopAuthRequestState | null> {
    await this.init()
    const result = await this.pool.query<{
      state: string
      client_id: string
      redirect_uri: string
      base_url: string
      auth_code: string
      code_challenge: string
      code_challenge_method: string
      scope: string
      nonce: string | null
      user_id: string | null
      expires_at: string | Date
      created_at: string | Date
      consumed_at: string | Date | null
    }>(
      `
        UPDATE cloud_desktop_auth_requests
        SET user_id = $2
        WHERE state = $1
          AND consumed_at IS NULL
          AND expires_at > NOW()
        RETURNING state, client_id, redirect_uri, base_url, auth_code, code_challenge,
                  code_challenge_method, scope, nonce, user_id, expires_at, created_at, consumed_at
      `,
      [params.state, params.userId],
    )
    return result.rowCount ? this.toAuthRequest(result.rows[0]) : null
  }

  async consumeDesktopAuthCode(params: {
    authCode: string
    clientId: string
    redirectUri: string
  }): Promise<CloudDesktopAuthRequestState | null> {
    await this.init()
    const result = await this.pool.query<{
      state: string
      client_id: string
      redirect_uri: string
      base_url: string
      auth_code: string
      code_challenge: string
      code_challenge_method: string
      scope: string
      nonce: string | null
      user_id: string | null
      expires_at: string | Date
      created_at: string | Date
      consumed_at: string | Date | null
    }>(
      `
        UPDATE cloud_desktop_auth_requests
        SET consumed_at = NOW()
        WHERE auth_code = $1
          AND client_id = $2
          AND redirect_uri = $3
          AND user_id IS NOT NULL
          AND consumed_at IS NULL
          AND expires_at > NOW()
        RETURNING state, client_id, redirect_uri, base_url, auth_code, code_challenge,
                  code_challenge_method, scope, nonce, user_id, expires_at, created_at, consumed_at
      `,
      [params.authCode, params.clientId, params.redirectUri],
    )
    return result.rowCount ? this.toAuthRequest(result.rows[0]) : null
  }

  async saveEmailVerificationToken(params: {
    userId: string
    tokenHash: string
    expiresAt: string
  }): Promise<void> {
    await this.init()
    await this.pool.query(
      `
        INSERT INTO cloud_email_verification_tokens(token_hash, user_id, expires_at, created_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (token_hash) DO UPDATE
        SET user_id = EXCLUDED.user_id,
            expires_at = EXCLUDED.expires_at
      `,
      [params.tokenHash, params.userId, params.expiresAt, new Date().toISOString()],
    )
  }

  async consumeEmailVerificationToken(tokenHash: string): Promise<CloudUserState | null> {
    await this.init()
    const result = await this.pool.query<{ user_id: string }>(
      `
        DELETE FROM cloud_email_verification_tokens
        WHERE token_hash = $1
          AND expires_at > NOW()
        RETURNING user_id
      `,
      [tokenHash],
    )
    if (!result.rowCount) {
      return null
    }
    await this.markEmailVerified(result.rows[0].user_id)
    return this.getUserById(result.rows[0].user_id)
  }

  async savePasswordResetToken(params: {
    userId: string
    tokenHash: string
    expiresAt: string
  }): Promise<void> {
    await this.init()
    await this.pool.query(
      `
        INSERT INTO cloud_password_reset_tokens(token_hash, user_id, expires_at, created_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (token_hash) DO UPDATE
        SET user_id = EXCLUDED.user_id,
            expires_at = EXCLUDED.expires_at
      `,
      [params.tokenHash, params.userId, params.expiresAt, new Date().toISOString()],
    )
  }

  async consumePasswordResetToken(tokenHash: string): Promise<CloudUserState | null> {
    await this.init()
    const result = await this.pool.query<{ user_id: string }>(
      `
        DELETE FROM cloud_password_reset_tokens
        WHERE token_hash = $1
          AND expires_at > NOW()
        RETURNING user_id
      `,
      [tokenHash],
    )
    if (!result.rowCount) {
      return null
    }
    return this.getUserById(result.rows[0].user_id)
  }
}

export function createCloudStore(context: StoreContext): CloudStore {
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? ''
  if (!databaseUrl) {
    return new MemoryCloudStore(context)
  }
  return new PostgresCloudStore(context, databaseUrl)
}
