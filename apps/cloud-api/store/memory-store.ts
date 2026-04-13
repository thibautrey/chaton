import crypto from 'node:crypto'
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
  CloudProjectRecord,
  CloudProviderCredentialType,
  CloudProviderModelRecord,
  CloudSubscriptionPlan,
  CloudSubscriptionRecord,
  MemoryRecord,
  MemoryStatsRecord,
  OrganizationProviderRecord,
  OrganizationProviderRuntimeRecord,
  OrganizationRecord,
} from '../../../packages/domain/index.js'
import {
  buildMemoryFingerprint,
  buildMemorySearchText,
  buildTopicKey,
  normalizeMemoryKind,
  rerankMemoryCandidates,
  shouldSupersedeKind,
  summarizeMemoryStats,
} from '../../../packages/memory/index.js'
import {
  DEFAULT_PLANS,
  canAccessMemoryRecord,
  cloneMemoryRecord,
  clonePlan,
  createDefaultWorkspaceState,
  getPlanRecord,
  getProjectKind,
  normalizePlans,
  normalizeProviderBaseUrl,
  normalizeProviderCredentialType,
  normalizeProviderModels,
  normalizeRepositoryConfig,
  supportsCloudRuntime,
  toMemoryRecord,
  toProjectRecord,
} from './shared.js'
import type {
  CloudDesktopAuthRequestState,
  CloudOrganizationInviteRecord,
  CloudRuntimeAccessGrant,
  CloudStore,
  CloudUserState,
  CloudWorkspaceState,
  StoreContext,
} from './shared.js'

export class MemoryCloudStore implements CloudStore {
  mode: 'memory' = 'memory' as const
  private readonly context: StoreContext
  private readonly usersById = new Map<string, CloudUserState>()
  private readonly usersByAccessToken = new Map<string, string>()
  private readonly usersByRefreshToken = new Map<string, string>()
  private readonly userIdsByEmail = new Map<string, string>()
  private readonly passwordHashesByUserId = new Map<string, string>()
  private readonly workspaceStateByUserId = new Map<string, CloudWorkspaceState>()
  private readonly plansById = new Map<CloudSubscriptionPlan, CloudSubscriptionRecord>(
    DEFAULT_PLANS.map((plan) => [plan.id, clonePlan(plan)]),
  )
  private readonly desktopAuthRequestsByState = new Map<string, CloudDesktopAuthRequestState>()
  private readonly activeOrganizationIdByUserId = new Map<string, string>()
  private readonly organizationInvitesByToken = new Map<string, CloudOrganizationInviteRecord>()
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

  async close(): Promise<void> {}

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

  async getUserByRefreshToken(refreshToken: string): Promise<CloudUserState | null> {
    const userId = this.usersByRefreshToken.get(refreshToken)
    return userId ? this.usersById.get(userId) ?? null : null
  }

  async revokeSessionByRefreshToken(refreshToken: string): Promise<void> {
    const userId = this.usersByRefreshToken.get(refreshToken)
    this.usersByRefreshToken.delete(refreshToken)
    if (!userId) {
      return
    }
    for (const [accessToken, currentUserId] of this.usersByAccessToken.entries()) {
      if (currentUserId === userId) {
        this.usersByAccessToken.delete(accessToken)
      }
    }
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
      createDefaultWorkspaceState(user, this.context.publicBaseUrl, this.context.endpoints),
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
    password: string
    verifyPassword: (password: string, passwordHash: string) => boolean
  }): Promise<CloudUserState | null> {
    const user = await this.getUserByEmail(params.email)
    if (!user) {
      return null
    }
    const passwordHash = this.passwordHashesByUserId.get(user.id)
    if (!passwordHash) {
      return null
    }
    return params.verifyPassword(params.password, passwordHash) ? user : null
  }

  async saveSession(params: {
    userId: string
    accessToken: string
    refreshToken: string
    expiresAt: string
  }): Promise<void> {
    this.usersByAccessToken.set(params.accessToken, params.userId)
    this.usersByRefreshToken.set(params.refreshToken, params.userId)
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
      if (workspace.organizations[0]) {
        workspace.organizations[0] = {
          ...workspace.organizations[0],
          role: user.isAdmin ? 'owner' : 'member',
          providers: [...(workspace.organizations[0].providers ?? [])],
        }
      }
      workspace.cloudInstance.baseUrl = this.context.publicBaseUrl
      workspace.cloudInstance.authMode = 'oauth'
      workspace.cloudInstance.connectionStatus = 'connected'
      workspace.cloudInstance.lastError = null
      workspace.cloudInstance.endpoints = {
        apiBaseUrl: this.context.endpoints.apiBaseUrl,
        realtimeBaseUrl: this.context.endpoints.realtimeBaseUrl,
        runtimeBaseUrl: this.context.endpoints.runtimeBaseUrl,
      }
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
      existing.activeOrganizationId =
        this.activeOrganizationIdByUserId.get(user.id) ??
        existing.activeOrganizationId ??
        existing.organizations[0]?.id ??
        null
      existing.cloudInstance.baseUrl = this.context.publicBaseUrl
      return existing
    }
    const created = createDefaultWorkspaceState(user, this.context.publicBaseUrl, this.context.endpoints)
    this.activeOrganizationIdByUserId.set(
      user.id,
      created.activeOrganizationId ?? created.organizations[0]?.id ?? '',
    )
    this.workspaceStateByUserId.set(user.id, created)
    return created
  }

  async setActiveOrganization(
    user: CloudUserState,
    input: SetActiveOrganizationRequest,
  ): Promise<string | null> {
    const workspace = await this.getWorkspaceState(user)
    if (!workspace.organizations.some((organization) => organization.id === input.organizationId)) {
      return null
    }
    workspace.activeOrganizationId = input.organizationId
    this.activeOrganizationIdByUserId.set(user.id, input.organizationId)
    return input.organizationId
  }

  async createProject(
    user: CloudUserState,
    input: CreateCloudProjectRequest,
  ): Promise<CloudProjectRecord> {
    const workspace = await this.getWorkspaceState(user)
    const organization = workspace.organizations.find((item) => item.id === input.organizationId)
    if (!organization) {
      throw new Error('Unknown organization')
    }
    const repository = normalizeRepositoryConfig(input.repository)
    const project = toProjectRecord({
      id: `project-${crypto.randomUUID()}`,
      organizationId: organization.id,
      organizationName: organization.name,
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
      organizationId?: string
      name: string
      slug: string
      plan?: CloudSubscriptionPlan
    },
  ): Promise<OrganizationRecord> {
    const workspace = await this.getWorkspaceState(user)
    const targetId =
      input.organizationId?.trim() ||
      workspace.activeOrganizationId ||
      workspace.organizations[0]?.id ||
      ''
    const index = workspace.organizations.findIndex((organization) => organization.id === targetId)
    if (index < 0) {
      throw new Error('Unknown organization')
    }
    workspace.organizations[index] = {
      ...workspace.organizations[index],
      name: input.name.trim(),
      slug: input.slug.trim(),
      providers: workspace.organizations[index]?.providers ?? [],
    }
    if (input.plan) {
      user.subscriptionPlan = input.plan
      this.usersById.set(user.id, user)
    }
    return {
      ...workspace.organizations[index],
      providers: [...(workspace.organizations[index]?.providers ?? [])],
    }
  }

  async addOrganizationProvider(
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
  }> {
    const workspace = await this.getWorkspaceState(user)
    const targetId =
      (input as { organizationId?: string }).organizationId?.trim() ||
      workspace.activeOrganizationId ||
      workspace.organizations[0]?.id ||
      ''
    const index = workspace.organizations.findIndex((organization) => organization.id === targetId)
    if (index < 0) {
      throw new Error('Unknown organization')
    }
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
    workspace.organizations[index] = {
      ...workspace.organizations[index],
      providers: [...(workspace.organizations[index]?.providers ?? []), provider],
    }
    workspace.providerSecretsById?.set(provider.id, input.secret.trim())
    return {
      organization: {
        ...workspace.organizations[index],
        providers: [...(workspace.organizations[index]?.providers ?? [])],
      },
      provider,
    }
  }

  async createOrganizationInvite(
    user: CloudUserState,
    input: CreateOrganizationInviteRequest,
  ): Promise<{ organization: OrganizationRecord; email: string; token: string } | null> {
    const workspace = await this.getWorkspaceState(user)
    const organization = workspace.organizations.find((item) => item.id === input.organizationId)
    if (!organization || !['owner', 'admin'].includes(organization.role)) {
      return null
    }
    const token = crypto.randomUUID()
    this.organizationInvitesByToken.set(token, {
      organizationId: organization.id,
      email: input.email.trim().toLowerCase(),
      inviterUserId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      acceptedAt: null,
    })
    return {
      organization: {
        ...organization,
        providers: [...(organization.providers ?? [])],
      },
      email: input.email.trim().toLowerCase(),
      token,
    }
  }

  async acceptOrganizationInvite(
    user: CloudUserState,
    input: AcceptOrganizationInviteRequest,
  ): Promise<OrganizationRecord | null> {
    const invite = this.organizationInvitesByToken.get(input.token)
    if (!invite || invite.acceptedAt || invite.expiresAt <= new Date().toISOString()) {
      return null
    }
    if (invite.email !== user.email.trim().toLowerCase()) {
      return null
    }
    const inviterWorkspace = this.workspaceStateByUserId.get(invite.inviterUserId)
    const invitedOrganization =
      inviterWorkspace?.organizations.find((item) => item.id === invite.organizationId) ?? null
    if (!invitedOrganization) {
      return null
    }
    const workspace = await this.getWorkspaceState(user)
    if (!workspace.organizations.some((item) => item.id === invitedOrganization.id)) {
      workspace.organizations.push({
        ...invitedOrganization,
        role: 'member',
        providers: [...(invitedOrganization.providers ?? [])],
      })
    }
    workspace.activeOrganizationId = invitedOrganization.id
    this.activeOrganizationIdByUserId.set(user.id, invitedOrganization.id)
    invite.acceptedAt = new Date().toISOString()
    const organization = workspace.organizations.find((item) => item.id === invitedOrganization.id)
    return organization
      ? {
          ...organization,
          providers: [...(organization.providers ?? [])],
        }
      : null
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

  async listMemory(
    user: CloudUserState,
    input: MemoryListRequest,
  ): Promise<MemoryRecord[]> {
    const workspace = await this.getWorkspaceState(user)
    const activeOrganizationId =
      workspace.activeOrganizationId ?? workspace.organizations[0]?.id ?? null
    const scope = input.scope ?? 'all'
    const kind = input.kind ? normalizeMemoryKind(input.kind) : null
    const includeArchived = input.includeArchived === true

    return Array.from(workspace.memoriesById?.values() ?? [])
      .filter((record) => canAccessMemoryRecord(record, {
        organizationId: activeOrganizationId,
        userId: user.id,
        projectId: input.projectId ?? null,
      }))
      .filter((record) => scope === 'all' || record.scope === scope)
      .filter((record) => !kind || record.kind === kind)
      .filter((record) => includeArchived || !record.archived)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, Math.max(1, input.limit ?? 50))
      .map(cloneMemoryRecord)
  }

  async searchMemory(
    user: CloudUserState,
    input: MemorySearchRequest,
  ): Promise<Array<MemoryRecord & { score: number; matchReasons: string[] }>> {
    const listed = await this.listMemory(user, {
      scope: input.scope ?? 'all',
      projectId: input.projectId ?? null,
      kind: input.kind ?? null,
      includeArchived: input.includeArchived === true,
      limit: 1000,
    })
    const tags = Array.isArray(input.tags) ? input.tags.map((tag) => tag.toLowerCase()) : []
    const filtered = listed.filter((record) => {
      if (record.status === 'superseded') return false
      if (tags.length === 0) return true
      const lowerTags = record.tags.map((tag) => tag.toLowerCase())
      return tags.every((tag) => lowerTags.includes(tag))
    })
    return rerankMemoryCandidates({
      query: input.query,
      limit: Math.max(1, input.limit ?? 10),
      candidates: filtered.map((record) => ({
        ...record,
        ftsRank: Math.min(
          1,
          buildMemorySearchText(record)
            .toLowerCase()
            .includes(input.query.trim().toLowerCase())
            ? 0.85
            : 0.45,
        ),
      })),
    }).map((record) => ({ ...cloneMemoryRecord(record), score: record.score, matchReasons: [...record.matchReasons] }))
  }

  async getMemory(
    user: CloudUserState,
    memoryId: string,
  ): Promise<MemoryRecord | null> {
    const workspace = await this.getWorkspaceState(user)
    const record = workspace.memoriesById?.get(memoryId)
    if (!record) return null
    if (!canAccessMemoryRecord(record, {
      organizationId: workspace.activeOrganizationId ?? workspace.organizations[0]?.id ?? null,
      userId: user.id,
      projectId: record.ownership.projectId,
    })) {
      return null
    }
    record.lastUsedAt = new Date().toISOString()
    record.timesUsed += 1
    record.reinforcedAt = record.lastUsedAt
    record.updatedAt = record.lastUsedAt
    workspace.memoriesById?.set(memoryId, cloneMemoryRecord(record))
    return cloneMemoryRecord(record)
  }

  async upsertMemory(
    user: CloudUserState,
    input: MemoryUpsertRequest & { organizationId?: string | null },
  ): Promise<MemoryRecord | null> {
    const workspace = await this.getWorkspaceState(user)
    const organizationId =
      input.organizationId?.trim() ||
      workspace.activeOrganizationId ||
      workspace.organizations[0]?.id ||
      null
    const scope = input.scope === 'project' ? 'project' : 'global'
    const projectId = scope === 'project' ? input.projectId?.trim() || null : null
    const tags = Array.isArray(input.tags)
      ? input.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0).map((tag) => tag.trim())
      : []
    const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim() : null
    const content = input.content?.trim?.() ?? ''
    if (!content) return null

    const kind = normalizeMemoryKind(input.kind)
    const topicKey = buildTopicKey({
      topicKey: input.topicKey,
      kind,
      title,
      content,
      tags,
    })
    const fingerprint = buildMemoryFingerprint({
      scope,
      organizationId,
      userId: scope === 'global' ? user.id : null,
      projectId,
      kind,
      topicKey,
      title,
      content,
      tags,
    })

    const existing = Array.from(workspace.memoriesById?.values() ?? []).find(
      (record) => record.fingerprint === fingerprint && !record.archived && record.status === 'active',
    )

    if (shouldSupersedeKind(kind)) {
      for (const record of workspace.memoriesById?.values() ?? []) {
        if (record.fingerprint === fingerprint && record.id !== existing?.id) {
          record.status = 'superseded'
          record.updatedAt = new Date().toISOString()
          workspace.memoriesById?.set(record.id, cloneMemoryRecord(record))
        }
      }
    }

    const next = toMemoryRecord({
      id: existing?.id ?? input.id?.trim() ?? `memory-${crypto.randomUUID()}`,
      organizationId,
      userId: scope === 'global' ? user.id : null,
      projectId,
      scope,
      kind,
      title,
      content,
      tags,
      source: input.source ?? 'manual',
      sourceConversationId: input.conversationId ?? null,
      topicKey,
      confidence: input.confidence ?? null,
      visibility:
        input.visibility === 'shared' || scope === 'project' ? 'shared' : 'private',
      status: 'active',
      originType: existing?.originType ?? 'manual',
      fingerprint,
      archived: false,
      createdAt: existing?.createdAt,
      updatedAt: new Date().toISOString(),
      reinforcedAt: existing?.reinforcedAt ?? null,
      lastUsedAt: existing?.lastUsedAt ?? null,
      timesUsed: existing?.timesUsed ?? 0,
    })
    workspace.memoriesById?.set(next.id, cloneMemoryRecord(next))
    return cloneMemoryRecord(next)
  }

  async updateMemory(
    user: CloudUserState,
    input: MemoryUpdateRequest,
  ): Promise<MemoryRecord | null> {
    const workspace = await this.getWorkspaceState(user)
    const existing = workspace.memoriesById?.get(input.id)
    if (!existing) return null
    if (!canAccessMemoryRecord(existing, {
      organizationId: workspace.activeOrganizationId ?? workspace.organizations[0]?.id ?? null,
      userId: user.id,
      projectId: existing.ownership.projectId,
    })) {
      return null
    }

    const next = toMemoryRecord({
      id: existing.id,
      organizationId: existing.ownership.organizationId,
      userId: existing.ownership.userId,
      projectId: existing.ownership.projectId,
      scope: existing.scope,
      kind: input.kind ?? existing.kind,
      title: input.title === undefined ? existing.title : input.title,
      content: input.content == null ? existing.content : input.content,
      tags: Array.isArray(input.tags) ? input.tags : existing.tags,
      source: existing.source,
      sourceConversationId: existing.sourceConversationId,
      topicKey: input.topicKey ?? existing.topicKey,
      confidence: input.confidence ?? existing.confidence,
      visibility: input.visibility ?? existing.visibility,
      status: input.status ?? existing.status,
      originType: existing.originType,
      fingerprint: existing.fingerprint,
      archived: input.archived ?? existing.archived,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      reinforcedAt: existing.reinforcedAt,
      lastUsedAt: existing.lastUsedAt,
      timesUsed: existing.timesUsed,
    })
    workspace.memoriesById?.set(next.id, cloneMemoryRecord(next))
    return cloneMemoryRecord(next)
  }

  async deleteMemory(
    user: CloudUserState,
    memoryId: string,
  ): Promise<boolean> {
    const workspace = await this.getWorkspaceState(user)
    const existing = workspace.memoriesById?.get(memoryId)
    if (!existing) return false
    if (!canAccessMemoryRecord(existing, {
      organizationId: workspace.activeOrganizationId ?? workspace.organizations[0]?.id ?? null,
      userId: user.id,
      projectId: existing.ownership.projectId,
    })) {
      return false
    }
    workspace.memoriesById?.delete(memoryId)
    return true
  }

  async getMemoryStats(
    user: CloudUserState,
    input: MemoryListRequest,
  ): Promise<MemoryStatsRecord> {
    const records = await this.listMemory(user, {
      ...input,
      limit: 100000,
      includeArchived: input.includeArchived === true,
    })
    return summarizeMemoryStats(records)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getActiveParallelSessions(__userId: string): Promise<number> {
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
    const organization =
      workspace.organizations.find((item) => item.id === (project?.organizationId ?? workspace.activeOrganizationId)) ??
      workspace.organizations[0]
    const providers: OrganizationProviderRuntimeRecord[] = (organization?.providers ?? []).map(
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
      organization,
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

  async internalUpsertMemory(params: {
    organizationId: string
    userId: string
    input: MemoryUpsertRequest
  }): Promise<MemoryRecord | null> {
    const user = await this.getUserById(params.userId)
    if (!user) return null
    return this.upsertMemory(user, {
      ...params.input,
      organizationId: params.organizationId,
    })
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
