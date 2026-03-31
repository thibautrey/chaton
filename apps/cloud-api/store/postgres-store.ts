import crypto from 'node:crypto'
import { Pool } from 'pg'
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
  CloudProjectKind,
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
  buildTopicKey,
  MEMORY_SCHEMA_VERSION,
  normalizeMemoryKind,
  rerankMemoryCandidates,
  shouldSupersedeKind,
  summarizeMemoryStats,
} from '../../../packages/memory/index.js'
import {
  DEFAULT_PLANS,
  buildMemorySearchDocumentParts,
  buildMemoryTagsText,
  cloneOrganizations,
  createDefaultWorkspaceState,
  getPlanRecord,
  getProjectKind,
  normalizePlans,
  normalizeProviderBaseUrl,
  normalizeProviderCredentialType,
  normalizeProviderModels,
  normalizeRepositoryConfig,
  supportsCloudRuntime,
  toMemoryRecordFromRow,
  toProjectRecord,
} from './shared.js'
import type {
  CloudDesktopAuthRequestState,
  CloudMemoryRow,
  CloudRepositoryConfigRecord,
  CloudRuntimeAccessGrant,
  CloudStore,
  CloudUserState,
  CloudWorkspaceState,
  StoreContext,
} from './shared.js'

export class PostgresCloudStore implements CloudStore {
  mode: 'postgres' = 'postgres' as const
  private readonly context: StoreContext
  private readonly pool: Pool
  private initialized = false
  private initPromise: Promise<void> | null = null

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
    if (this.initPromise) {
      await this.initPromise
      return
    }

    this.initPromise = this.runInit()
    try {
      await this.initPromise
    } finally {
      this.initPromise = null
    }
  }

  async close(): Promise<void> {
    await this.pool.end()
  }

  private async runInit(): Promise<void> {
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
        active_organization_id TEXT,
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
      CREATE TABLE IF NOT EXISTS cloud_organization_invites (
        token_hash TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES cloud_organizations(id) ON DELETE CASCADE,
        invited_email TEXT NOT NULL,
        inviter_user_id TEXT NOT NULL REFERENCES cloud_users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        accepted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS cloud_organization_invites_organization_id_idx
        ON cloud_organization_invites(organization_id);
      CREATE TABLE IF NOT EXISTS cloud_memories (
        id TEXT PRIMARY KEY,
        organization_id TEXT,
        user_id TEXT REFERENCES cloud_users(id) ON DELETE CASCADE,
        project_id TEXT REFERENCES cloud_projects(id) ON DELETE CASCADE,
        scope TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT,
        content TEXT NOT NULL,
        tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        topic_key TEXT NOT NULL,
        confidence DOUBLE PRECISION NOT NULL DEFAULT 0.5,
        schema_version INTEGER NOT NULL DEFAULT 1,
        reinforced_at TIMESTAMPTZ,
        last_used_at TIMESTAMPTZ,
        times_used INTEGER NOT NULL DEFAULT 0,
        source_conversation_id TEXT REFERENCES cloud_conversations(id) ON DELETE SET NULL,
        origin_type TEXT NOT NULL DEFAULT 'manual',
        status TEXT NOT NULL DEFAULT 'active',
        visibility TEXT NOT NULL DEFAULT 'private',
        fingerprint TEXT NOT NULL,
        archived BOOLEAN NOT NULL DEFAULT FALSE,
        source TEXT NOT NULL DEFAULT 'manual',
        search_document TSVECTOR,
        last_seen_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS cloud_memories_org_scope_status_idx
        ON cloud_memories(organization_id, scope, status, archived, updated_at DESC);
      CREATE INDEX IF NOT EXISTS cloud_memories_user_scope_idx
        ON cloud_memories(user_id, scope, archived, updated_at DESC);
      CREATE INDEX IF NOT EXISTS cloud_memories_project_scope_idx
        ON cloud_memories(project_id, scope, archived, updated_at DESC);
      CREATE INDEX IF NOT EXISTS cloud_memories_fingerprint_idx
        ON cloud_memories(fingerprint);
      CREATE INDEX IF NOT EXISTS cloud_memories_source_conversation_idx
        ON cloud_memories(source_conversation_id);
      CREATE INDEX IF NOT EXISTS cloud_memories_search_document_idx
        ON cloud_memories USING GIN(search_document);
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
      ADD COLUMN IF NOT EXISTS complimentary_expires_at TIMESTAMPTZ;
      ALTER TABLE cloud_sessions
      ADD COLUMN IF NOT EXISTS active_organization_id TEXT
    `)

    await this.pool.query(`
      ALTER TABLE cloud_memories
      ADD COLUMN IF NOT EXISTS organization_id TEXT;
      ALTER TABLE cloud_memories
      ADD COLUMN IF NOT EXISTS user_id TEXT;
      ALTER TABLE cloud_memories
      ADD COLUMN IF NOT EXISTS project_id TEXT;
      ALTER TABLE cloud_memories
      ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'global';
      ALTER TABLE cloud_memories
      ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'fact';
      ALTER TABLE cloud_memories
      ADD COLUMN IF NOT EXISTS title TEXT;
      ALTER TABLE cloud_memories
      ADD COLUMN IF NOT EXISTS content TEXT NOT NULL DEFAULT '';
      ALTER TABLE cloud_memories
      ADD COLUMN IF NOT EXISTS tags_json JSONB NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE cloud_memories
      ADD COLUMN IF NOT EXISTS topic_key TEXT NOT NULL DEFAULT 'memory';
      ALTER TABLE cloud_memories
      ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION NOT NULL DEFAULT 0.5;
      ALTER TABLE cloud_memories
      ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE cloud_memories
      ADD COLUMN IF NOT EXISTS reinforced_at TIMESTAMPTZ;
      ALTER TABLE cloud_memories
      ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
      ALTER TABLE cloud_memories
      ADD COLUMN IF NOT EXISTS times_used INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE cloud_memories
      ADD COLUMN IF NOT EXISTS source_conversation_id TEXT;
      ALTER TABLE cloud_memories
      ADD COLUMN IF NOT EXISTS origin_type TEXT NOT NULL DEFAULT 'manual';
      ALTER TABLE cloud_memories
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
      ALTER TABLE cloud_memories
      ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';
      ALTER TABLE cloud_memories
      ADD COLUMN IF NOT EXISTS fingerprint TEXT NOT NULL DEFAULT '';
      ALTER TABLE cloud_memories
      ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE cloud_memories
      ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
      ALTER TABLE cloud_memories
      ADD COLUMN IF NOT EXISTS search_document TSVECTOR;
      ALTER TABLE cloud_memories
      ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ
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
        UPDATE cloud_memories
        SET search_document = to_tsvector(
          'simple',
          concat_ws(
            ' ',
            coalesce(title, ''),
            coalesce(content, ''),
            coalesce(topic_key, ''),
            coalesce(array_to_string(ARRAY(
              SELECT jsonb_array_elements_text(tags_json)
            ), ' '), ''),
            coalesce(kind, '')
          )
        )
        WHERE search_document IS NULL
           OR fingerprint = ''
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
    workspace.organizations = (workspace.organizations.length
      ? workspace.organizations
      : [createDefaultWorkspaceState(user, this.context.publicBaseUrl).organizations[0]]
    ).map((organization, index) => ({
      ...organization,
      role: index === 0 ? (user.isAdmin ? 'owner' : organization.role) : organization.role,
      providers: [...(organization.providers ?? [])],
    }))
    workspace.activeOrganizationId =
      workspace.activeOrganizationId ??
      workspace.organizations[0]?.id ??
      null
    workspace.cloudInstance.baseUrl = this.context.publicBaseUrl
    workspace.cloudInstance.authMode = 'oauth'
    workspace.cloudInstance.connectionStatus = 'connected'
    workspace.cloudInstance.lastError = null
    workspace.providerSecretsById = workspace.providerSecretsById ?? new Map()
    workspace.repositoryAccessTokenByProjectId = workspace.repositoryAccessTokenByProjectId ?? new Map()
    workspace.memoriesById = workspace.memoriesById ?? new Map()
    return workspace
  }

  private async listMemoryRowsForUser(params: {
    userId: string
    organizationId: string | null
    scope?: MemoryListRequest['scope']
    projectId?: string | null
    kind?: MemoryListRequest['kind']
    includeArchived?: boolean
    limit?: number
  }): Promise<CloudMemoryRow[]> {
    await this.init()
    const scope = params.scope ?? 'all'
    const includeArchived = params.includeArchived === true
    const queryParams: Array<string | number | boolean | null> = [params.userId, params.organizationId]
    const clauses = [
      'm.organization_id = $2',
      `(
        (m.scope = 'global' AND m.user_id = $1)
        OR
        (m.scope = 'project' AND EXISTS (
          SELECT 1
          FROM cloud_projects p
          INNER JOIN cloud_organization_memberships membership
            ON membership.organization_id = p.organization_id
          WHERE p.id = m.project_id
            AND membership.user_id = $1
        ))
      )`,
    ]

    if (scope === 'global') {
      clauses.push(`m.scope = 'global'`)
    } else if (scope === 'project') {
      clauses.push(`m.scope = 'project'`)
    }

    if (params.projectId) {
      queryParams.push(params.projectId)
      const projectParam = `$${queryParams.length}`
      if (scope === 'project') {
        clauses.push(`m.project_id = ${projectParam}`)
      } else if (scope === 'all') {
        clauses.push(`(m.scope = 'global' OR m.project_id = ${projectParam})`)
      }
    }

    if (params.kind) {
      queryParams.push(normalizeMemoryKind(params.kind))
      clauses.push(`m.kind = $${queryParams.length}`)
    }

    if (!includeArchived) {
      clauses.push(`m.archived = FALSE`)
    }

    queryParams.push(Math.max(1, params.limit ?? 50))

    const result = await this.pool.query<CloudMemoryRow>(
      `
        SELECT
          m.id,
          m.organization_id,
          m.user_id,
          m.project_id,
          m.scope,
          m.kind,
          m.title,
          m.content,
          m.tags_json,
          m.topic_key,
          m.confidence,
          m.schema_version,
          m.reinforced_at,
          m.last_used_at,
          m.times_used,
          m.source_conversation_id,
          m.origin_type,
          m.status,
          m.visibility,
          m.fingerprint,
          m.archived,
          m.source,
          m.created_at,
          m.updated_at,
          m.last_seen_at
        FROM cloud_memories m
        WHERE ${clauses.join('\n          AND ')}
        ORDER BY m.updated_at DESC
        LIMIT $${queryParams.length}
      `,
      queryParams,
    )
    return result.rows
  }

  private async markMemoryUsed(memoryId: string): Promise<void> {
    await this.pool.query(
      `
        UPDATE cloud_memories
        SET last_used_at = NOW(),
            reinforced_at = NOW(),
            times_used = GREATEST(0, COALESCE(times_used, 0)) + 1,
            updated_at = NOW()
        WHERE id = $1
      `,
      [memoryId],
    )
  }

  private async markMemorySeen(memoryIds: string[]): Promise<void> {
    if (memoryIds.length === 0) {
      return
    }
    await this.pool.query(
      `
        UPDATE cloud_memories
        SET last_seen_at = NOW()
        WHERE id = ANY($1::text[])
      `,
      [memoryIds],
    )
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

  private async listOrganizationsForUser(user: CloudUserState): Promise<OrganizationRecord[]> {
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
      await this.upsertNormalizedOrganization(user, fallback.organizations[0])
      return cloneOrganizations(fallback.organizations)
    }

    const providersResult = await this.pool.query<{
      organization_id: string
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
        SELECT organization_id, id, kind, label, secret_hint, base_url, credential_type, models_json, default_model,
               supports_cloud_runtime, created_at
        FROM cloud_organization_providers
        WHERE organization_id = ANY($1::text[])
        ORDER BY created_at ASC
      `,
      [organizationResult.rows.map((row) => row.id)],
    )

    const providersByOrganizationId = new Map<string, OrganizationProviderRecord[]>()
    for (const row of providersResult.rows) {
      const provider: OrganizationProviderRecord = {
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
      }
      providersByOrganizationId.set(row.organization_id, [
        ...(providersByOrganizationId.get(row.organization_id) ?? []),
        provider,
      ])
    }

    return organizationResult.rows.map((organizationRow) => ({
      id: organizationRow.id,
      slug: organizationRow.slug,
      name: organizationRow.name,
      role: organizationRow.role,
      providers: providersByOrganizationId.get(organizationRow.id) ?? [],
    }))
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
    if (!this.initialized && !this.initPromise) {
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
    password: string
    verifyPassword: (password: string, passwordHash: string) => boolean
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
      password_hash: string | null
    }>(
      `
        SELECT id, email, display_name, is_admin, created_at, subscription_plan, email_verified_at,
               complimentary_plan_id, complimentary_granted_at, complimentary_expires_at, password_hash
        FROM cloud_users
        WHERE lower(email) = $1
      `,
      [normalizedEmail],
    )
    if (!result.rowCount) {
      return null
    }
    const row = result.rows[0]
    if (!row.password_hash || !params.verifyPassword(params.password, row.password_hash)) {
      return null
    }
    return this.toUser(row)
  }

  async saveSession(params: {
    userId: string
    accessToken: string
    refreshToken: string
    expiresAt: string
  }): Promise<void> {
    await this.init()
    const organizations = await this.listOrganizationsForUser(
      (await this.getUserById(params.userId)) as CloudUserState,
    )
    await this.pool.query(
      `
        INSERT INTO cloud_sessions(access_token, refresh_token, user_id, active_organization_id, expires_at, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (access_token) DO UPDATE
        SET refresh_token = EXCLUDED.refresh_token,
            user_id = EXCLUDED.user_id,
            active_organization_id = COALESCE(cloud_sessions.active_organization_id, EXCLUDED.active_organization_id),
            expires_at = EXCLUDED.expires_at
      `,
      [
        params.accessToken,
        params.refreshToken,
        params.userId,
        organizations[0]?.id ?? null,
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
          organizations: [existing.rows[0].organization_json],
          activeOrganizationId: existing.rows[0].organization_json?.id ?? null,
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
        JSON.stringify(workspace.organizations[0]),
        JSON.stringify(workspace.cloudInstance),
        new Date().toISOString(),
      ],
    )

    await this.upsertNormalizedOrganization(user, workspace.organizations[0])

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
        workspace.organizations[0].id,
        workspace.organizations[0].name,
        'Cloud Workspace',
        workspace.organizations[0].name,
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
      active_organization_id: string | null
    }>(
      `
        SELECT w.cloud_instance_json,
               (
                 SELECT s.active_organization_id
                 FROM cloud_sessions s
                 WHERE s.user_id = $1
                   AND s.expires_at > NOW()
                   AND s.active_organization_id IS NOT NULL
                 ORDER BY s.created_at DESC
                 LIMIT 1
               ) AS active_organization_id
        FROM cloud_workspaces w
        WHERE w.user_id = $1
      `,
      [user.id],
    )
    const organizations = await this.listOrganizationsForUser(user)
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
        SELECT p.id, p.organization_id, p.organization_name, p.name, p.repo_name, p.project_kind, p.workspace_capability, p.repository_json, p.cloud_status
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
      organizations,
      activeOrganizationId:
        workspaceResult.rows[0]?.active_organization_id ??
        organizations[0]?.id ??
        null,
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
    const workspace = await this.getWorkspaceState(user)
    const organization =
      workspace.organizations.find((item) => item.id === input.organizationId.trim()) ?? null
    if (!organization || input.organizationId.trim() !== organization.id) {
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
      organizationId?: string
      name: string
      slug: string
      plan?: CloudSubscriptionPlan
    },
  ): Promise<OrganizationRecord> {
    await this.ensureWorkspaceExists(user)
    const workspace = await this.getWorkspaceState(user)
    const current =
      workspace.organizations.find(
        (item) => item.id === (input.organizationId?.trim() || workspace.activeOrganizationId),
      ) ?? null
    if (!current) {
      throw new Error('Unknown organization')
    }
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
    await this.ensureWorkspaceExists(user)
    const workspace = await this.getWorkspaceState(user)
    const organization =
      workspace.organizations.find(
        (item) => item.id === (input.organizationId?.trim() || workspace.activeOrganizationId),
      ) ?? null
    if (!organization) {
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

  async setActiveOrganization(
    user: CloudUserState,
    input: SetActiveOrganizationRequest,
  ): Promise<string | null> {
    await this.ensureWorkspaceExists(user)
    const memberships = await this.pool.query<{ organization_id: string }>(
      `
        SELECT organization_id
        FROM cloud_organization_memberships
        WHERE user_id = $1
          AND organization_id = $2
        LIMIT 1
      `,
      [user.id, input.organizationId],
    )
    if (!memberships.rowCount) {
      return null
    }
    await this.pool.query(
      `
        UPDATE cloud_sessions
        SET active_organization_id = $2
        WHERE user_id = $1
      `,
      [user.id, input.organizationId],
    )
    return input.organizationId
  }

  async createOrganizationInvite(
    user: CloudUserState,
    input: CreateOrganizationInviteRequest,
  ): Promise<{ organization: OrganizationRecord; email: string; token: string } | null> {
    await this.ensureWorkspaceExists(user)
    const result = await this.pool.query<{
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
          AND o.id = $2
        LIMIT 1
      `,
      [user.id, input.organizationId],
    )
    const organization = result.rows[0] ?? null
    if (!organization || !['owner', 'admin'].includes(organization.role)) {
      return null
    }
    const token = crypto.randomUUID()
    await this.pool.query(
      `
        INSERT INTO cloud_organization_invites(
          token_hash, organization_id, invited_email, inviter_user_id, expires_at, accepted_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, NULL, $6)
      `,
      [
        token,
        organization.id,
        input.email.trim().toLowerCase(),
        user.id,
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        new Date().toISOString(),
      ],
    )
    return {
      organization: {
        ...organization,
        providers: [],
      },
      email: input.email.trim().toLowerCase(),
      token,
    }
  }

  async acceptOrganizationInvite(
    user: CloudUserState,
    input: AcceptOrganizationInviteRequest,
  ): Promise<OrganizationRecord | null> {
    await this.ensureWorkspaceExists(user)
    const inviteResult = await this.pool.query<{
      organization_id: string
      invited_email: string
      expires_at: string | Date
      accepted_at: string | Date | null
    }>(
      `
        SELECT organization_id, invited_email, expires_at, accepted_at
        FROM cloud_organization_invites
        WHERE token_hash = $1
        LIMIT 1
      `,
      [input.token],
    )
    if (!inviteResult.rowCount) {
      return null
    }
    const invite = inviteResult.rows[0]
    const expiresAt =
      typeof invite.expires_at === 'string' ? invite.expires_at : invite.expires_at.toISOString()
    if (invite.accepted_at || expiresAt <= new Date().toISOString()) {
      return null
    }
    if (invite.invited_email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      return null
    }
    const now = new Date().toISOString()
    await this.pool.query(
      `
        INSERT INTO cloud_organization_memberships(organization_id, user_id, role, created_at, updated_at)
        VALUES ($1, $2, 'member', $3, $3)
        ON CONFLICT (organization_id, user_id) DO UPDATE
        SET updated_at = EXCLUDED.updated_at
      `,
      [invite.organization_id, user.id, now],
    )
    await this.pool.query(
      `
        UPDATE cloud_organization_invites
        SET accepted_at = $2
        WHERE token_hash = $1
      `,
      [input.token, now],
    )
    await this.pool.query(
      `
        UPDATE cloud_sessions
        SET active_organization_id = $2
        WHERE user_id = $1
      `,
      [user.id, invite.organization_id],
    )
    const workspace = await this.getWorkspaceState(user)
    return (
      workspace.organizations.find((organization) => organization.id === invite.organization_id) ??
      null
    )
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

  async listMemory(
    user: CloudUserState,
    input: MemoryListRequest,
  ): Promise<MemoryRecord[]> {
    await this.ensureWorkspaceExists(user)
    const workspace = await this.getWorkspaceState(user)
    const rows = await this.listMemoryRowsForUser({
      userId: user.id,
      organizationId: workspace.activeOrganizationId ?? workspace.organizations[0]?.id ?? null,
      scope: input.scope ?? 'all',
      projectId: input.projectId ?? null,
      kind: input.kind ?? null,
      includeArchived: input.includeArchived === true,
      limit: input.limit ?? 50,
    })
    return rows.map(toMemoryRecordFromRow)
  }

  async searchMemory(
    user: CloudUserState,
    input: MemorySearchRequest,
  ): Promise<Array<MemoryRecord & { score: number; matchReasons: string[] }>> {
    await this.ensureWorkspaceExists(user)
    const workspace = await this.getWorkspaceState(user)
    const organizationId = workspace.activeOrganizationId ?? workspace.organizations[0]?.id ?? null
    const scope = input.scope ?? 'all'
    const includeArchived = input.includeArchived === true
    const tags = Array.isArray(input.tags)
      ? input.tags
          .map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : ''))
          .filter(Boolean)
      : []
    const query = input.query.trim()
    const queryParams: Array<string | number | boolean | null | string[]> = [
      user.id,
      organizationId,
      query,
    ]
    const clauses = [
      'm.organization_id = $2',
      `(
        (m.scope = 'global' AND m.user_id = $1)
        OR
        (m.scope = 'project' AND EXISTS (
          SELECT 1
          FROM cloud_projects p
          INNER JOIN cloud_organization_memberships membership
            ON membership.organization_id = p.organization_id
          WHERE p.id = m.project_id
            AND membership.user_id = $1
        ))
      )`,
      `m.status = 'active'`,
    ]

    if (scope === 'global') {
      clauses.push(`m.scope = 'global'`)
    } else if (scope === 'project') {
      clauses.push(`m.scope = 'project'`)
    }

    if (input.projectId) {
      queryParams.push(input.projectId)
      const projectParam = `$${queryParams.length}`
      if (scope === 'project') {
        clauses.push(`m.project_id = ${projectParam}`)
      } else if (scope === 'all') {
        clauses.push(`(m.scope = 'global' OR m.project_id = ${projectParam})`)
      }
    }

    if (input.kind) {
      queryParams.push(normalizeMemoryKind(input.kind))
      clauses.push(`m.kind = $${queryParams.length}`)
    }

    if (!includeArchived) {
      clauses.push(`m.archived = FALSE`)
    }

    if (tags.length > 0) {
      queryParams.push(tags)
      clauses.push(`
        NOT EXISTS (
          SELECT 1
          FROM unnest($${queryParams.length}::text[]) AS required_tag
          WHERE NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(m.tags_json) AS tag
            WHERE lower(tag) = required_tag
          )
        )
      `)
    }

    queryParams.push(Math.max(50, (input.limit ?? 10) * 10))
    const limitParam = `$${queryParams.length}`
    const result = await this.pool.query<CloudMemoryRow>(
      `
        SELECT
          m.id,
          m.organization_id,
          m.user_id,
          m.project_id,
          m.scope,
          m.kind,
          m.title,
          m.content,
          m.tags_json,
          m.topic_key,
          m.confidence,
          m.schema_version,
          m.reinforced_at,
          m.last_used_at,
          m.times_used,
          m.source_conversation_id,
          m.origin_type,
          m.status,
          m.visibility,
          m.fingerprint,
          m.archived,
          m.source,
          m.created_at,
          m.updated_at,
          m.last_seen_at,
          ts_rank_cd(m.search_document, websearch_to_tsquery('simple', $3)) AS fts_rank
        FROM cloud_memories m
        WHERE ${clauses.join('\n          AND ')}
          AND (
            m.search_document @@ websearch_to_tsquery('simple', $3)
            OR lower(coalesce(m.title, '')) LIKE '%' || lower($3) || '%'
            OR lower(m.topic_key) LIKE '%' || lower($3) || '%'
            OR lower(m.content) LIKE '%' || lower($3) || '%'
          )
        ORDER BY fts_rank DESC NULLS LAST, m.updated_at DESC
        LIMIT ${limitParam}
      `,
      queryParams,
    )

    const reranked = rerankMemoryCandidates({
      query,
      limit: Math.max(1, input.limit ?? 10),
      candidates: result.rows.map((row) => {
        const record = toMemoryRecordFromRow(row)
        return {
          ...record,
          ftsRank: typeof row.fts_rank === 'number' ? Math.min(1, row.fts_rank) : 0.3,
        }
      }),
    }).map((record) => ({
      ...record,
      matchReasons: [...record.matchReasons],
    }))

    await this.markMemorySeen(reranked.map((record) => record.id))
    return reranked
  }

  async getMemory(
    user: CloudUserState,
    memoryId: string,
  ): Promise<MemoryRecord | null> {
    await this.ensureWorkspaceExists(user)
    const workspace = await this.getWorkspaceState(user)
    const organizationId = workspace.activeOrganizationId ?? workspace.organizations[0]?.id ?? null
    const result = await this.pool.query<CloudMemoryRow>(
      `
        SELECT
          m.id,
          m.organization_id,
          m.user_id,
          m.project_id,
          m.scope,
          m.kind,
          m.title,
          m.content,
          m.tags_json,
          m.topic_key,
          m.confidence,
          m.schema_version,
          m.reinforced_at,
          m.last_used_at,
          m.times_used,
          m.source_conversation_id,
          m.origin_type,
          m.status,
          m.visibility,
          m.fingerprint,
          m.archived,
          m.source,
          m.created_at,
          m.updated_at,
          m.last_seen_at
        FROM cloud_memories m
        WHERE m.id = $1
          AND m.organization_id = $3
          AND (
            (m.scope = 'global' AND m.user_id = $2)
            OR
            (m.scope = 'project' AND EXISTS (
              SELECT 1
              FROM cloud_projects p
              INNER JOIN cloud_organization_memberships membership
                ON membership.organization_id = p.organization_id
              WHERE p.id = m.project_id
                AND membership.user_id = $2
            ))
          )
        LIMIT 1
      `,
      [memoryId, user.id, organizationId],
    )
    if (!result.rowCount) {
      return null
    }
    await this.markMemoryUsed(memoryId)
    const refreshed = await this.pool.query<CloudMemoryRow>(
      `
        SELECT
          id,
          organization_id,
          user_id,
          project_id,
          scope,
          kind,
          title,
          content,
          tags_json,
          topic_key,
          confidence,
          schema_version,
          reinforced_at,
          last_used_at,
          times_used,
          source_conversation_id,
          origin_type,
          status,
          visibility,
          fingerprint,
          archived,
          source,
          created_at,
          updated_at,
          last_seen_at
        FROM cloud_memories
        WHERE id = $1
      `,
      [memoryId],
    )
    return refreshed.rowCount ? toMemoryRecordFromRow(refreshed.rows[0]) : null
  }

  async upsertMemory(
    user: CloudUserState,
    input: MemoryUpsertRequest & { organizationId?: string | null },
  ): Promise<MemoryRecord | null> {
    await this.ensureWorkspaceExists(user)
    const workspace = await this.getWorkspaceState(user)
    const organizationId =
      input.organizationId?.trim() ||
      workspace.activeOrganizationId ||
      workspace.organizations[0]?.id ||
      null
    const scope = input.scope === 'project' ? 'project' : 'global'
    const projectId = scope === 'project' ? input.projectId?.trim() || null : null
    const content = input.content?.trim?.() ?? ''
    if (!content) {
      return null
    }
    if (scope === 'project' && projectId) {
      const projectAccess = await this.pool.query<{ id: string }>(
        `
          SELECT p.id
          FROM cloud_projects p
          INNER JOIN cloud_organization_memberships m
            ON m.organization_id = p.organization_id
          WHERE m.user_id = $1
            AND p.id = $2
            AND p.organization_id = $3
          LIMIT 1
        `,
        [user.id, projectId, organizationId],
      )
      if (!projectAccess.rowCount) {
        return null
      }
    }

    const tags = Array.isArray(input.tags)
      ? input.tags
          .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
          .map((tag) => tag.trim())
      : []
    const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim() : null
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
    const tagsText = buildMemoryTagsText(tags)
    const searchDocument = buildMemorySearchDocumentParts({
      title,
      content,
      topicKey,
      tagsText,
      kind,
    })

    const existing = await this.pool.query<CloudMemoryRow>(
      `
        SELECT
          id,
          organization_id,
          user_id,
          project_id,
          scope,
          kind,
          title,
          content,
          tags_json,
          topic_key,
          confidence,
          schema_version,
          reinforced_at,
          last_used_at,
          times_used,
          source_conversation_id,
          origin_type,
          status,
          visibility,
          fingerprint,
          archived,
          source,
          created_at,
          updated_at
        FROM cloud_memories
        WHERE fingerprint = $1
          AND organization_id = $2
          AND (
            ($3 = 'global' AND user_id = $4)
            OR
            ($3 = 'project' AND project_id = $5)
          )
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [fingerprint, organizationId, scope, scope === 'global' ? user.id : null, projectId],
    )
    const existingRecord = existing.rowCount ? toMemoryRecordFromRow(existing.rows[0]) : null

    if (shouldSupersedeKind(kind)) {
      await this.pool.query(
        `
          UPDATE cloud_memories
          SET status = 'superseded',
              archived = FALSE,
              updated_at = NOW()
          WHERE fingerprint = $1
            AND organization_id = $2
            AND id <> COALESCE($3, '')
            AND status <> 'superseded'
        `,
        [fingerprint, organizationId, existingRecord?.id ?? null],
      )
    }

    const nextId = existingRecord?.id ?? input.id?.trim() ?? `memory-${crypto.randomUUID()}`
    const nextVisibility =
      input.visibility === 'shared' || scope === 'project' ? 'shared' : 'private'
    const now = new Date().toISOString()
    await this.pool.query(
      `
        INSERT INTO cloud_memories(
          id,
          organization_id,
          user_id,
          project_id,
          scope,
          kind,
          title,
          content,
          tags_json,
          topic_key,
          confidence,
          schema_version,
          reinforced_at,
          last_used_at,
          times_used,
          source_conversation_id,
          origin_type,
          status,
          visibility,
          fingerprint,
          archived,
          source,
          search_document,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16, $17,
          'active', $18, $19, FALSE, $20, to_tsvector('simple', $21), $22, $23
        )
        ON CONFLICT (id) DO UPDATE
        SET organization_id = EXCLUDED.organization_id,
            user_id = EXCLUDED.user_id,
            project_id = EXCLUDED.project_id,
            scope = EXCLUDED.scope,
            kind = EXCLUDED.kind,
            title = EXCLUDED.title,
            content = EXCLUDED.content,
            tags_json = EXCLUDED.tags_json,
            topic_key = EXCLUDED.topic_key,
            confidence = EXCLUDED.confidence,
            schema_version = EXCLUDED.schema_version,
            source_conversation_id = EXCLUDED.source_conversation_id,
            origin_type = EXCLUDED.origin_type,
            status = 'active',
            visibility = EXCLUDED.visibility,
            fingerprint = EXCLUDED.fingerprint,
            archived = FALSE,
            source = EXCLUDED.source,
            search_document = EXCLUDED.search_document,
            updated_at = EXCLUDED.updated_at
      `,
      [
        nextId,
        organizationId,
        scope === 'global' ? user.id : null,
        projectId,
        scope,
        kind,
        title,
        content,
        JSON.stringify(tags),
        topicKey,
        typeof input.confidence === 'number' ? input.confidence : existingRecord?.confidence ?? 0.5,
        MEMORY_SCHEMA_VERSION,
        existingRecord?.reinforcedAt ?? null,
        existingRecord?.lastUsedAt ?? null,
        existingRecord?.timesUsed ?? 0,
        input.conversationId ?? existingRecord?.sourceConversationId ?? null,
        existingRecord?.originType ?? 'manual',
        nextVisibility,
        fingerprint,
        input.source ?? existingRecord?.source ?? 'manual',
        searchDocument,
        existingRecord?.createdAt ?? now,
        now,
      ],
    )
    const created = await this.pool.query<CloudMemoryRow>(
      `
        SELECT
          id,
          organization_id,
          user_id,
          project_id,
          scope,
          kind,
          title,
          content,
          tags_json,
          topic_key,
          confidence,
          schema_version,
          reinforced_at,
          last_used_at,
          times_used,
          source_conversation_id,
          origin_type,
          status,
          visibility,
          fingerprint,
          archived,
          source,
          created_at,
          updated_at,
          last_seen_at
        FROM cloud_memories
        WHERE id = $1
      `,
      [nextId],
    )
    return created.rowCount ? toMemoryRecordFromRow(created.rows[0]) : null
  }

  async updateMemory(
    user: CloudUserState,
    input: MemoryUpdateRequest,
  ): Promise<MemoryRecord | null> {
    await this.ensureWorkspaceExists(user)
    const workspace = await this.getWorkspaceState(user)
    const organizationId = workspace.activeOrganizationId ?? workspace.organizations[0]?.id ?? null
    const result = await this.pool.query<CloudMemoryRow>(
      `
        SELECT
          id,
          organization_id,
          user_id,
          project_id,
          scope,
          kind,
          title,
          content,
          tags_json,
          topic_key,
          confidence,
          schema_version,
          reinforced_at,
          last_used_at,
          times_used,
          source_conversation_id,
          origin_type,
          status,
          visibility,
          fingerprint,
          archived,
          source,
          created_at,
          updated_at,
          last_seen_at
        FROM cloud_memories
        WHERE id = $1
          AND organization_id = $3
          AND (
            (scope = 'global' AND user_id = $2)
            OR
            (scope = 'project' AND EXISTS (
              SELECT 1
              FROM cloud_projects p
              INNER JOIN cloud_organization_memberships m
                ON m.organization_id = p.organization_id
              WHERE p.id = cloud_memories.project_id
                AND m.user_id = $2
            ))
          )
        LIMIT 1
      `,
      [input.id, user.id, organizationId],
    )
    if (!result.rowCount) {
      return null
    }
    const existing = toMemoryRecordFromRow(result.rows[0])
    const nextKind = normalizeMemoryKind(input.kind ?? existing.kind)
    const nextTitle = input.title === undefined ? existing.title : input.title
    const nextContent = input.content === undefined || input.content == null ? existing.content : input.content.trim()
    if (!nextContent) {
      return null
    }
    const nextTags = Array.isArray(input.tags) ? input.tags.filter(Boolean).map((tag) => tag.trim()) : existing.tags
    const nextTopicKey = buildTopicKey({
      topicKey: input.topicKey ?? existing.topicKey,
      kind: nextKind,
      title: nextTitle,
      content: nextContent,
      tags: nextTags,
    })
    const nextFingerprint = buildMemoryFingerprint({
      scope: existing.scope,
      organizationId: existing.ownership.organizationId,
      userId: existing.ownership.userId,
      projectId: existing.ownership.projectId,
      kind: nextKind,
      topicKey: nextTopicKey,
      title: nextTitle,
      content: nextContent,
      tags: nextTags,
    })
    await this.pool.query(
      `
        UPDATE cloud_memories
        SET kind = $2,
            title = $3,
            content = $4,
            tags_json = $5::jsonb,
            topic_key = $6,
            confidence = $7,
            status = $8,
            visibility = $9,
            fingerprint = $10,
            archived = $11,
            search_document = to_tsvector('simple', $12),
            updated_at = NOW()
        WHERE id = $1
      `,
      [
        input.id,
        nextKind,
        nextTitle,
        nextContent,
        JSON.stringify(nextTags),
        nextTopicKey,
        input.confidence ?? existing.confidence,
        input.status ?? existing.status,
        input.visibility ?? existing.visibility,
        nextFingerprint,
        input.archived ?? existing.archived,
        buildMemorySearchDocumentParts({
          title: nextTitle,
          content: nextContent,
          topicKey: nextTopicKey,
          tagsText: buildMemoryTagsText(nextTags),
          kind: nextKind,
        }),
      ],
    )
    const updated = await this.pool.query<CloudMemoryRow>(
      `
        SELECT
          id,
          organization_id,
          user_id,
          project_id,
          scope,
          kind,
          title,
          content,
          tags_json,
          topic_key,
          confidence,
          schema_version,
          reinforced_at,
          last_used_at,
          times_used,
          source_conversation_id,
          origin_type,
          status,
          visibility,
          fingerprint,
          archived,
          source,
          created_at,
          updated_at,
          last_seen_at
        FROM cloud_memories
        WHERE id = $1
      `,
      [input.id],
    )
    return updated.rowCount ? toMemoryRecordFromRow(updated.rows[0]) : null
  }

  async deleteMemory(
    user: CloudUserState,
    memoryId: string,
  ): Promise<boolean> {
    await this.ensureWorkspaceExists(user)
    const workspace = await this.getWorkspaceState(user)
    const organizationId = workspace.activeOrganizationId ?? workspace.organizations[0]?.id ?? null
    const result = await this.pool.query<{ id: string }>(
      `
        DELETE FROM cloud_memories
        WHERE id = $1
          AND organization_id = $3
          AND (
            (scope = 'global' AND user_id = $2)
            OR
            (scope = 'project' AND EXISTS (
              SELECT 1
              FROM cloud_projects p
              INNER JOIN cloud_organization_memberships m
                ON m.organization_id = p.organization_id
              WHERE p.id = cloud_memories.project_id
                AND m.user_id = $2
            ))
          )
        RETURNING id
      `,
      [memoryId, user.id, organizationId],
    )
    return (result.rowCount ?? 0) > 0
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
    await this.init()
    const user = await this.getUserById(params.userId)
    if (!user) {
      return null
    }
    return this.upsertMemory(user, {
      ...params.input,
      organizationId: params.organizationId,
    })
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
