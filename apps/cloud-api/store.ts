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
  CloudSubscriptionPlan,
  CloudSubscriptionRecord,
  CloudUsageRecord,
  OrganizationRecord,
} from '../../packages/domain/index.js'

export type CloudUserState = {
  id: string
  email: string
  displayName: string
  isAdmin: boolean
  createdAt: string
  subscriptionPlan: CloudSubscriptionPlan | null
}

export type CloudWorkspaceState = {
  organization: OrganizationRecord
  cloudInstance: CloudInstanceRecord
  projectsById: Map<string, CloudProjectRecord>
  conversationsById: Map<string, CloudConversationRecord>
  messagesByConversationId: Map<string, CloudConversationMessageRecord[]>
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
}

export type CloudStore = {
  mode: 'memory' | 'postgres'
  init(): Promise<void>
  listPlans(): Promise<CloudSubscriptionRecord[]>
  savePlan(plan: CloudSubscriptionRecord): Promise<void>
  getUserByAccessToken(accessToken: string): Promise<CloudUserState | null>
  getUserById(userId: string): Promise<CloudUserState | null>
  findOrCreateUserForLogin(params: {
    email: string
    displayName?: string | null
  }): Promise<CloudUserState>
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
}

type StoreContext = {
  publicBaseUrl: string
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
    location: 'cloud',
    cloudStatus: 'connected',
  }

  return {
    organization,
    cloudInstance,
    projectsById: new Map([[defaultProject.id, defaultProject]]),
    conversationsById: new Map(),
    messagesByConversationId: new Map(),
  }
}

class MemoryCloudStore implements CloudStore {
  mode: 'memory' = 'memory'
  private readonly usersById = new Map<string, CloudUserState>()
  private readonly usersByAccessToken = new Map<string, string>()
  private readonly userIdsByEmail = new Map<string, string>()
  private readonly workspaceStateByUserId = new Map<string, CloudWorkspaceState>()
  private readonly plansById = new Map<CloudSubscriptionPlan, CloudSubscriptionRecord>(
    DEFAULT_PLANS.map((plan) => [plan.id, clonePlan(plan)]),
  )
  private readonly desktopAuthRequestsByState = new Map<string, CloudDesktopAuthRequestState>()

  constructor(private readonly context: StoreContext) {}

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
    }
    this.userIdsByEmail.set(normalizedEmail, user.id)
    this.usersById.set(user.id, user)
    this.workspaceStateByUserId.set(
      user.id,
      createDefaultWorkspaceState(user, this.context.publicBaseUrl),
    )
    return user
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
    const project: CloudProjectRecord = {
      id: `project-${crypto.randomUUID()}`,
      organizationId: workspace.organization.id,
      organizationName: input.organizationName?.trim() || workspace.organization.name,
      name: input.name.trim(),
      repoName: input.organizationName?.trim() || workspace.organization.name,
      location: 'cloud',
      cloudStatus: 'connected',
    }
    workspace.projectsById.set(project.id, project)
    return project
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
}

class PostgresCloudStore implements CloudStore {
  mode: 'postgres' = 'postgres'
  private readonly pool: Pool
  private initialized = false

  constructor(
    private readonly context: StoreContext,
    databaseUrl: string,
  ) {
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
        subscription_plan TEXT
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
      CREATE TABLE IF NOT EXISTS cloud_projects (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES cloud_users(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL,
        organization_name TEXT NOT NULL,
        name TEXT NOT NULL,
        repo_name TEXT NOT NULL,
        location TEXT NOT NULL,
        cloud_status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS cloud_projects_user_id_idx ON cloud_projects(user_id);
      CREATE TABLE IF NOT EXISTS cloud_conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES cloud_users(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES cloud_projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        model_provider TEXT,
        model_id TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS cloud_conversations_user_id_idx ON cloud_conversations(user_id);
      CREATE TABLE IF NOT EXISTS cloud_conversation_messages (
        conversation_id TEXT PRIMARY KEY REFERENCES cloud_conversations(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES cloud_users(id) ON DELETE CASCADE,
        messages_json JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
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
    workspace.cloudInstance.baseUrl = this.context.publicBaseUrl
    workspace.cloudInstance.authMode = 'oauth'
    workspace.cloudInstance.connectionStatus = 'connected'
    workspace.cloudInstance.lastError = null
    return workspace
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
    }>(
      `
        SELECT u.id, u.email, u.display_name, u.is_admin, u.created_at, u.subscription_plan
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
    }>(
      `
        SELECT id, email, display_name, is_admin, created_at, subscription_plan
        FROM cloud_users
        WHERE id = $1
      `,
      [userId],
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
    }>(
      `
        SELECT id, email, display_name, is_admin, created_at, subscription_plan
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
    }

    await this.pool.query(
      `
        INSERT INTO cloud_users(id, email, display_name, is_admin, created_at, subscription_plan)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        user.id,
        user.email,
        user.displayName,
        user.isAdmin,
        user.createdAt,
        user.subscriptionPlan,
      ],
    )
    await this.ensureWorkspaceExists(user)
    return user
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
    }>(
      `
        SELECT id, email, display_name, is_admin, created_at, subscription_plan
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
    }>(
      `
        SELECT id, email, display_name, is_admin, created_at, subscription_plan
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

    const defaultProjectId = `project-${user.id}-workspace`
    await this.pool.query(
      `
        INSERT INTO cloud_projects(
          id, user_id, organization_id, organization_name, name, repo_name, location, cloud_status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        defaultProjectId,
        user.id,
        workspace.organization.id,
        workspace.organization.name,
        'Cloud Workspace',
        workspace.organization.name,
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
    const projectsResult = await this.pool.query<{
      id: string
      organization_id: string
      organization_name: string
      name: string
      repo_name: string
      cloud_status: CloudProjectRecord['cloudStatus']
    }>(
      `
        SELECT id, organization_id, organization_name, name, repo_name, cloud_status
        FROM cloud_projects
        WHERE user_id = $1
        ORDER BY created_at ASC
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
        SELECT id, project_id, title, status, model_provider, model_id
        FROM cloud_conversations
        WHERE user_id = $1
        ORDER BY created_at ASC
      `,
      [user.id],
    )
    const messagesResult = await this.pool.query<{
      conversation_id: string
      messages_json: CloudConversationMessageRecord[]
    }>(
      `
        SELECT conversation_id, messages_json
        FROM cloud_conversation_messages
        WHERE user_id = $1
      `,
      [user.id],
    )

    return this.normalizeWorkspace(user, {
      organization: workspaceResult.rows[0].organization_json,
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
    })
  }

  async createProject(
    user: CloudUserState,
    input: CreateCloudProjectRequest,
  ): Promise<CloudProjectRecord> {
    await this.ensureWorkspaceExists(user)
    const workspace = await this.getWorkspaceState(user)
    const project: CloudProjectRecord = {
      id: `project-${crypto.randomUUID()}`,
      organizationId: workspace.organization.id,
      organizationName: input.organizationName?.trim() || workspace.organization.name,
      name: input.name.trim(),
      repoName: input.organizationName?.trim() || workspace.organization.name,
      location: 'cloud',
      cloudStatus: 'connected',
    }
    const now = new Date().toISOString()
    await this.pool.query(
      `
        INSERT INTO cloud_projects(
          id, user_id, organization_id, organization_name, name, repo_name, location, cloud_status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        project.id,
        user.id,
        project.organizationId,
        project.organizationName,
        project.name,
        project.repoName,
        project.location,
        project.cloudStatus,
        now,
        now,
      ],
    )
    return project
  }

  async createConversation(
    user: CloudUserState,
    input: CreateCloudConversationRequest,
  ): Promise<CloudConversationRecord | null> {
    await this.ensureWorkspaceExists(user)
    const projectResult = await this.pool.query<{ id: string; name: string }>(
      `
        SELECT id, name
        FROM cloud_projects
        WHERE user_id = $1 AND id = $2
      `,
      [user.id, input.projectId],
    )
    if (!projectResult.rowCount) {
      return null
    }
    const project = projectResult.rows[0]
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
          id, user_id, project_id, title, status, model_provider, model_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        conversation.id,
        user.id,
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
        INSERT INTO cloud_conversation_messages(conversation_id, user_id, messages_json, updated_at)
        VALUES ($1, $2, $3::jsonb, $4)
        ON CONFLICT (conversation_id) DO NOTHING
      `,
      [conversation.id, user.id, JSON.stringify([]), now],
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
        SELECT id
        FROM cloud_conversations
        WHERE user_id = $1 AND id = $2
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
        WHERE user_id = $1 AND conversation_id = $2
      `,
      [user.id, conversationId],
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
        SELECT id
        FROM cloud_conversations
        WHERE user_id = $1 AND id = $2
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
        INSERT INTO cloud_conversation_messages(conversation_id, user_id, messages_json, updated_at)
        VALUES ($1, $2, $3::jsonb, $4)
        ON CONFLICT (conversation_id) DO UPDATE
        SET messages_json = EXCLUDED.messages_json,
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
}

export function createCloudStore(context: StoreContext): CloudStore {
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? ''
  if (!databaseUrl) {
    return new MemoryCloudStore(context)
  }
  return new PostgresCloudStore(context, databaseUrl)
}
