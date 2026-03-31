import { Pool } from 'pg'
import type { CloudSubscriptionPlan } from '../../packages/domain/index.js'

export type RuntimeMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export type RuntimeSession = {
  id: string
  userId: string
  conversationId: string
  projectId: string | null
  cloudInstanceId: string
  ownerId: string
  leaseExpiresAt: string
  status: 'starting' | 'ready' | 'streaming' | 'stopped' | 'error'
  modelProvider: string | null
  modelId: string | null
  thinkingLevel: string | null
  messages: RuntimeMessage[]
  createdAt: string
  updatedAt: string
  accessToken: string
  subscriptionPlan: CloudSubscriptionPlan
  subscriptionLabel: string
  parallelSessionsLimit: number
}

export type RuntimeStore = {
  mode: 'memory' | 'postgres'
  init(): Promise<void>
  close(): Promise<void>
  getActiveSessionCount(userId: string): Promise<number>
  acquireConversationSession(session: RuntimeSession): Promise<{
    session: RuntimeSession
    created: boolean
  }>
  getActiveSessionByConversation(
    conversationId: string,
    userId: string,
  ): Promise<RuntimeSession | null>
  saveSession(session: RuntimeSession): Promise<void>
  getSession(sessionId: string): Promise<RuntimeSession | null>
  listSessionsByOwner(ownerId: string): Promise<RuntimeSession[]>
  touchSessionLease(
    sessionId: string,
    ownerId: string,
    leaseExpiresAt: string,
  ): Promise<RuntimeSession | null>
  updateSession(session: RuntimeSession): Promise<void>
  deleteSession(sessionId: string): Promise<void>
}

class MemoryRuntimeStore implements RuntimeStore {
  mode: 'memory' = 'memory' as const
  private readonly sessions = new Map<string, RuntimeSession>()

  async init(): Promise<void> {}

  async close(): Promise<void> {}

  async getActiveSessionCount(userId: string): Promise<number> {
    let count = 0
    for (const session of this.sessions.values()) {
      if (
        session.userId === userId &&
        session.status !== 'stopped' &&
        session.status !== 'error'
      ) {
        count += 1
      }
    }
    return count
  }

  async acquireConversationSession(session: RuntimeSession): Promise<{
    session: RuntimeSession
    created: boolean
  }> {
    const existing = await this.getActiveSessionByConversation(
      session.conversationId,
      session.userId,
    )
    if (existing) {
      existing.ownerId = session.ownerId
      existing.leaseExpiresAt = session.leaseExpiresAt
      existing.updatedAt = session.updatedAt
      existing.accessToken = session.accessToken
      await this.updateSession(existing)
      return { session: existing, created: false }
    }
    await this.saveSession(session)
    return { session, created: true }
  }

  async getActiveSessionByConversation(
    conversationId: string,
    userId: string,
  ): Promise<RuntimeSession | null> {
    for (const session of this.sessions.values()) {
      if (
        session.conversationId === conversationId &&
        session.userId === userId &&
        session.status !== 'stopped' &&
        session.status !== 'error'
      ) {
        return structuredClone(session)
      }
    }
    return null
  }

  async saveSession(session: RuntimeSession): Promise<void> {
    this.sessions.set(session.id, structuredClone(session))
  }

  async getSession(sessionId: string): Promise<RuntimeSession | null> {
    const session = this.sessions.get(sessionId)
    return session ? structuredClone(session) : null
  }

  async listSessionsByOwner(ownerId: string): Promise<RuntimeSession[]> {
    return Array.from(this.sessions.values())
      .filter((session) => session.ownerId === ownerId)
      .map((session) => structuredClone(session))
  }

  async touchSessionLease(
    sessionId: string,
    ownerId: string,
    leaseExpiresAt: string,
  ): Promise<RuntimeSession | null> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return null
    }
    session.ownerId = ownerId
    session.leaseExpiresAt = leaseExpiresAt
    session.updatedAt = new Date().toISOString()
    this.sessions.set(sessionId, structuredClone(session))
    return structuredClone(session)
  }

  async updateSession(session: RuntimeSession): Promise<void> {
    this.sessions.set(session.id, structuredClone(session))
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId)
  }
}

class PostgresRuntimeStore implements RuntimeStore {
  mode: 'postgres' = 'postgres' as const
  private readonly pool: Pool
  private initialized = false

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
    })
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS runtime_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        conversation_id TEXT NOT NULL,
        project_id TEXT,
        cloud_instance_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        lease_expires_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL,
        model_provider TEXT,
        model_id TEXT,
        thinking_level TEXT,
        messages_json JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        access_token TEXT NOT NULL,
        subscription_plan TEXT NOT NULL,
        subscription_label TEXT NOT NULL,
        parallel_sessions_limit INTEGER NOT NULL
      );
      ALTER TABLE runtime_sessions ADD COLUMN IF NOT EXISTS user_id TEXT;
      UPDATE runtime_sessions
      SET user_id = COALESCE(NULLIF(user_id, ''), access_token)
      WHERE user_id IS NULL OR user_id = '';
      CREATE INDEX IF NOT EXISTS runtime_sessions_user_id_idx
        ON runtime_sessions(user_id);
      CREATE INDEX IF NOT EXISTS runtime_sessions_access_token_idx
        ON runtime_sessions(access_token);
      CREATE INDEX IF NOT EXISTS runtime_sessions_conversation_id_idx
        ON runtime_sessions(conversation_id);
      CREATE UNIQUE INDEX IF NOT EXISTS runtime_sessions_active_conversation_uidx
        ON runtime_sessions(conversation_id)
        WHERE status NOT IN ('stopped', 'error');
    `)

    this.initialized = true
  }

  async close(): Promise<void> {
    await this.pool.end()
  }

  private fromRow(row: {
    id: string
    user_id: string | null
    conversation_id: string
    project_id: string | null
    cloud_instance_id: string
    owner_id: string
    lease_expires_at: string | Date
    status: RuntimeSession['status']
    model_provider: string | null
    model_id: string | null
    thinking_level: string | null
    messages_json: RuntimeMessage[]
    created_at: string | Date
    updated_at: string | Date
    access_token: string
    subscription_plan: CloudSubscriptionPlan
    subscription_label: string
    parallel_sessions_limit: number
  }): RuntimeSession {
    return {
      id: row.id,
      userId: row.user_id ?? row.access_token,
      conversationId: row.conversation_id,
      projectId: row.project_id,
      cloudInstanceId: row.cloud_instance_id,
      ownerId: row.owner_id,
      leaseExpiresAt:
        typeof row.lease_expires_at === 'string'
          ? row.lease_expires_at
          : row.lease_expires_at.toISOString(),
      status: row.status,
      modelProvider: row.model_provider,
      modelId: row.model_id,
      thinkingLevel: row.thinking_level,
      messages: Array.isArray(row.messages_json) ? row.messages_json : [],
      createdAt: typeof row.created_at === 'string' ? row.created_at : row.created_at.toISOString(),
      updatedAt: typeof row.updated_at === 'string' ? row.updated_at : row.updated_at.toISOString(),
      accessToken: row.access_token,
      subscriptionPlan: row.subscription_plan,
      subscriptionLabel: row.subscription_label,
      parallelSessionsLimit: row.parallel_sessions_limit,
    }
  }

  async getActiveSessionCount(userId: string): Promise<number> {
    await this.init()
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
  }

  async acquireConversationSession(session: RuntimeSession): Promise<{
    session: RuntimeSession
    created: boolean
  }> {
    await this.init()
    const claimed = await this.pool.query<{
      id: string
      user_id: string | null
      conversation_id: string
      project_id: string | null
      cloud_instance_id: string
      owner_id: string
      lease_expires_at: string | Date
      status: RuntimeSession['status']
      model_provider: string | null
      model_id: string | null
      thinking_level: string | null
      messages_json: RuntimeMessage[]
      created_at: string | Date
      updated_at: string | Date
      access_token: string
      subscription_plan: CloudSubscriptionPlan
      subscription_label: string
      parallel_sessions_limit: number
    }>(
      `
        WITH target AS (
          SELECT id
          FROM runtime_sessions
          WHERE conversation_id = $1
            AND user_id = $2
            AND status NOT IN ('stopped', 'error')
            AND lease_expires_at > NOW()
          ORDER BY updated_at DESC
          LIMIT 1
        )
        UPDATE runtime_sessions
        SET owner_id = $3,
            lease_expires_at = $4,
            updated_at = $5,
            access_token = $6
        WHERE id IN (SELECT id FROM target)
        RETURNING *
      `,
      [
        session.conversationId,
        session.userId,
        session.ownerId,
        session.leaseExpiresAt,
        session.updatedAt,
        session.accessToken,
      ],
    )
    if (claimed.rowCount) {
      return { session: this.fromRow(claimed.rows[0]), created: false }
    }

    try {
      await this.saveSession(session)
      return { session, created: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('runtime_sessions_active_conversation_uidx')) {
        throw error
      }
      const existing = await this.getActiveSessionByConversation(
        session.conversationId,
        session.userId,
      )
      if (!existing) {
        throw error
      }
      return { session: existing, created: false }
    }
  }

  async getActiveSessionByConversation(
    conversationId: string,
    userId: string,
  ): Promise<RuntimeSession | null> {
    await this.init()
    const result = await this.pool.query<{
      id: string
      user_id: string | null
      conversation_id: string
      project_id: string | null
      cloud_instance_id: string
      owner_id: string
      lease_expires_at: string | Date
      status: RuntimeSession['status']
      model_provider: string | null
      model_id: string | null
      thinking_level: string | null
      messages_json: RuntimeMessage[]
      created_at: string | Date
      updated_at: string | Date
      access_token: string
      subscription_plan: CloudSubscriptionPlan
      subscription_label: string
      parallel_sessions_limit: number
    }>(
      `
        SELECT *
        FROM runtime_sessions
        WHERE conversation_id = $1
          AND user_id = $2
          AND status NOT IN ('stopped', 'error')
          AND lease_expires_at > NOW()
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [conversationId, userId],
    )
    return result.rowCount ? this.fromRow(result.rows[0]) : null
  }

  async saveSession(session: RuntimeSession): Promise<void> {
    await this.init()
    await this.pool.query(
      `
        INSERT INTO runtime_sessions(
          id, user_id, conversation_id, project_id, cloud_instance_id, owner_id, lease_expires_at,
          status, model_provider, model_id, thinking_level, messages_json, created_at, updated_at,
          access_token, subscription_plan, subscription_label, parallel_sessions_limit
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12::jsonb, $13, $14,
          $15, $16, $17, $18
        )
        ON CONFLICT (id) DO UPDATE
        SET user_id = EXCLUDED.user_id,
            conversation_id = EXCLUDED.conversation_id,
            project_id = EXCLUDED.project_id,
            cloud_instance_id = EXCLUDED.cloud_instance_id,
            owner_id = EXCLUDED.owner_id,
            lease_expires_at = EXCLUDED.lease_expires_at,
            status = EXCLUDED.status,
            model_provider = EXCLUDED.model_provider,
            model_id = EXCLUDED.model_id,
            thinking_level = EXCLUDED.thinking_level,
            messages_json = EXCLUDED.messages_json,
            updated_at = EXCLUDED.updated_at,
            access_token = EXCLUDED.access_token,
            subscription_plan = EXCLUDED.subscription_plan,
            subscription_label = EXCLUDED.subscription_label,
            parallel_sessions_limit = EXCLUDED.parallel_sessions_limit
      `,
      [
        session.id,
        session.userId,
        session.conversationId,
        session.projectId,
        session.cloudInstanceId,
        session.ownerId,
        session.leaseExpiresAt,
        session.status,
        session.modelProvider,
        session.modelId,
        session.thinkingLevel,
        JSON.stringify(session.messages),
        session.createdAt,
        session.updatedAt,
        session.accessToken,
        session.subscriptionPlan,
        session.subscriptionLabel,
        session.parallelSessionsLimit,
      ],
    )
  }

  async getSession(sessionId: string): Promise<RuntimeSession | null> {
    await this.init()
    const result = await this.pool.query<{
      id: string
      user_id: string | null
      conversation_id: string
      project_id: string | null
      cloud_instance_id: string
      owner_id: string
      lease_expires_at: string | Date
      status: RuntimeSession['status']
      model_provider: string | null
      model_id: string | null
      thinking_level: string | null
      messages_json: RuntimeMessage[]
      created_at: string | Date
      updated_at: string | Date
      access_token: string
      subscription_plan: CloudSubscriptionPlan
      subscription_label: string
      parallel_sessions_limit: number
    }>(
      `
        SELECT *
        FROM runtime_sessions
        WHERE id = $1
      `,
      [sessionId],
    )
    return result.rowCount ? this.fromRow(result.rows[0]) : null
  }

  async listSessionsByOwner(ownerId: string): Promise<RuntimeSession[]> {
    await this.init()
    const result = await this.pool.query<{
      id: string
      user_id: string | null
      conversation_id: string
      project_id: string | null
      cloud_instance_id: string
      owner_id: string
      lease_expires_at: string | Date
      status: RuntimeSession['status']
      model_provider: string | null
      model_id: string | null
      thinking_level: string | null
      messages_json: RuntimeMessage[]
      created_at: string | Date
      updated_at: string | Date
      access_token: string
      subscription_plan: CloudSubscriptionPlan
      subscription_label: string
      parallel_sessions_limit: number
    }>(
      `
        SELECT *
        FROM runtime_sessions
        WHERE owner_id = $1
          AND status NOT IN ('stopped', 'error')
      `,
      [ownerId],
    )
    return result.rows.map((row) => this.fromRow(row))
  }

  async touchSessionLease(
    sessionId: string,
    ownerId: string,
    leaseExpiresAt: string,
  ): Promise<RuntimeSession | null> {
    await this.init()
    const result = await this.pool.query<{
      id: string
      user_id: string | null
      conversation_id: string
      project_id: string | null
      cloud_instance_id: string
      owner_id: string
      lease_expires_at: string | Date
      status: RuntimeSession['status']
      model_provider: string | null
      model_id: string | null
      thinking_level: string | null
      messages_json: RuntimeMessage[]
      created_at: string | Date
      updated_at: string | Date
      access_token: string
      subscription_plan: CloudSubscriptionPlan
      subscription_label: string
      parallel_sessions_limit: number
    }>(
      `
        UPDATE runtime_sessions
        SET owner_id = $2,
            lease_expires_at = $3,
            updated_at = $4
        WHERE id = $1
        RETURNING *
      `,
      [sessionId, ownerId, leaseExpiresAt, new Date().toISOString()],
    )
    return result.rowCount ? this.fromRow(result.rows[0]) : null
  }

  async updateSession(session: RuntimeSession): Promise<void> {
    await this.saveSession(session)
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.init()
    await this.pool.query(
      `
        DELETE FROM runtime_sessions
        WHERE id = $1
      `,
      [sessionId],
    )
  }
}

export function createRuntimeStore(): RuntimeStore {
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? ''
  if (!databaseUrl) {
    return new MemoryRuntimeStore()
  }
  return new PostgresRuntimeStore(databaseUrl)
}
