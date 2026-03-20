import http from 'node:http'
import crypto from 'node:crypto'
import type { CloudRuntimeAccessGrant } from '../../packages/domain/index.js'
import type {
  CloudConversationMessageRecord,
  CloudRuntimeSessionCreateResponse,
} from '../../packages/protocol/index.js'
import { createRuntimeStore, type RuntimeMessage, type RuntimeSession } from './store.ts'

const port = Number.parseInt(process.env.PORT ?? '4002', 10)
const version = process.env.CHATONS_CLOUD_VERSION ?? '0.1.0'
const realtimePublishUrl =
  process.env.CHATONS_REALTIME_PUBLISH_URL ?? 'http://127.0.0.1:4001/v1/realtime/events'
const cloudApiBaseUrl =
  process.env.CHATONS_CLOUD_API_URL ?? 'http://127.0.0.1:4000'
const runtimeOwnerId =
  process.env.CHATONS_RUNTIME_OWNER_ID?.trim() || `runtime-${crypto.randomUUID()}`
const leaseTtlSeconds = Number.parseInt(process.env.CHATONS_RUNTIME_LEASE_TTL_SECONDS ?? '60', 10)
const leaseHeartbeatIntervalMs = Math.max(5_000, Math.floor((leaseTtlSeconds * 1000) / 2))
const maxJsonBodyBytes = Number.parseInt(
  process.env.CHATONS_CLOUD_MAX_JSON_BODY_BYTES ?? '1048576',
  10,
)
const internalServiceToken = process.env.CHATONS_INTERNAL_SERVICE_TOKEN?.trim() ?? ''

const runtimeStore = createRuntimeStore()

function buildLeaseExpiresAt(): string {
  return new Date(Date.now() + leaseTtlSeconds * 1000).toISOString()
}

async function refreshOwnedSessionLeases(): Promise<void> {
  const sessions = await runtimeStore.listSessionsByOwner(runtimeOwnerId)
  const nextLease = buildLeaseExpiresAt()
  for (const session of sessions) {
    await runtimeStore.touchSessionLease(session.id, runtimeOwnerId, nextLease).catch(() => null)
  }
}

function getBearerToken(request: http.IncomingMessage): string | null {
  const header = request.headers.authorization
  if (!header) {
    return null
  }
  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null
  }
  return token.trim()
}

function json(
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

async function readJsonBody<T>(request: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  let totalSize = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalSize += buffer.length
    if (totalSize > maxJsonBodyBytes) {
      const error = new Error(`Request body exceeds ${maxJsonBodyBytes} bytes`)
      ;(error as Error & { statusCode?: number }).statusCode = 413
      throw error
    }
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return JSON.parse(text) as T
}

async function fetchAccessGrant(params: {
  accessToken: string
  cloudInstanceId: string
  projectId?: string | null
  conversationId?: string | null
}): Promise<CloudRuntimeAccessGrant | null> {
  if (!internalServiceToken) {
    throw new Error('Missing CHATONS_INTERNAL_SERVICE_TOKEN')
  }
  const response = await fetch(
    new URL('/v1/internal/runtime/access', cloudApiBaseUrl).toString(),
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${internalServiceToken}`,
      },
      body: JSON.stringify(params),
    },
  )
  if (response.status === 404 || response.status === 401) {
    return null
  }
  if (!response.ok) {
    throw new Error(`Cloud access lookup failed with status ${response.status}`)
  }
  return (await response.json()) as CloudRuntimeAccessGrant
}

async function requireSessionAccess(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  sessionId: string,
): Promise<{ session: RuntimeSession; grant: CloudRuntimeAccessGrant } | null> {
  const accessToken = getBearerToken(request)
  if (!accessToken) {
    json(response, 401, {
      error: 'unauthorized',
      message: 'Missing bearer token',
    })
    return null
  }
  const session = await runtimeStore.getSession(sessionId)
  if (!session) {
    json(response, 404, {
      error: 'not_found',
      message: 'Runtime session not found',
    })
    return null
  }
  const grant = await fetchAccessGrant({
    accessToken,
    cloudInstanceId: session.cloudInstanceId,
    projectId: session.projectId,
    conversationId: session.conversationId,
  })
  if (!grant || grant.user.id !== session.userId) {
    json(response, 403, {
      error: 'forbidden',
      message: 'Cloud runtime session access denied',
    })
    return null
  }
  return { session, grant }
}

async function publishRealtimeEvent(event: {
  cloudInstanceId: string
  conversationId?: string
  payload: {
    event: {
      type: string
      [key: string]: unknown
    }
  }
}): Promise<void> {
  const envelope = {
    id: crypto.randomUUID(),
    type: 'conversation.event',
    ts: new Date().toISOString(),
    conversationId: event.conversationId,
    payload: event.payload,
  }

  const response = await fetch(realtimePublishUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${internalServiceToken}`,
    },
    body: JSON.stringify({
      cloudInstanceId: event.cloudInstanceId,
      event: envelope,
    }),
  })
  if (!response.ok) {
    throw new Error(`Realtime publish failed with status ${response.status}`)
  }
}

async function persistConversationMessages(session: RuntimeSession): Promise<void> {
  const messages: CloudConversationMessageRecord[] = session.messages.map((message) => ({
    id: message.id,
    role: message.role,
    timestamp: message.timestamp,
    content: message.content,
  }))

  const response = await fetch(
    new URL(
      `/v1/conversations/${encodeURIComponent(session.conversationId)}/messages`,
      cloudApiBaseUrl,
    ).toString(),
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({
        messages,
      }),
    },
  )
  if (!response.ok) {
    throw new Error(`Transcript persistence failed with status ${response.status}`)
  }
}

function toSnapshot(session: RuntimeSession): {
  status: RuntimeSession['status']
  state: Record<string, unknown>
  messages: Array<Record<string, unknown>>
} {
  return {
    status: session.status,
    state: {
      model:
        session.modelProvider && session.modelId
          ? {
              provider: session.modelProvider,
              id: session.modelId,
            }
          : null,
      thinkingLevel: session.thinkingLevel ?? 'medium',
      isStreaming: session.status === 'streaming',
      isCompacting: false,
      steeringMode: 'all',
      followUpMode: 'all',
      sessionFile: session.id,
      sessionId: session.id,
      autoCompactionEnabled: false,
      messageCount: session.messages.length,
      pendingMessageCount: 0,
    },
    messages: session.messages.map((message) => ({
      id: message.id,
      role: message.role,
      timestamp: message.timestamp,
      content: message.content,
      message: {
        id: message.id,
        role: message.role,
        content: message.content,
      },
    })),
  }
}

async function handleRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  const method = request.method ?? 'GET'
  const url = request.url ?? '/'

  if (method === 'GET' && url === '/healthz') {
    json(response, 200, {
      ok: true,
      service: 'runtime-headless',
      version,
      timestamp: new Date().toISOString(),
      store: runtimeStore.mode,
    })
    return
  }

  if (method === 'GET' && url === '/readyz') {
    response.writeHead(204)
    response.end()
    return
  }

  if (method === 'POST' && url === '/v1/runtime/sessions') {
    const accessToken = getBearerToken(request)
    if (!accessToken) {
      json(response, 401, {
        error: 'unauthorized',
        message: 'Missing bearer token',
      })
      return
    }

    const body = await readJsonBody<{
      conversationId: string
      projectId?: string | null
      cloudInstanceId?: string
      modelProvider?: string | null
      modelId?: string | null
      thinkingLevel?: string | null
    }>(request)
    if (!body.conversationId || !body.cloudInstanceId) {
      json(response, 400, {
        error: 'invalid_request',
        message: 'conversationId and cloudInstanceId are required',
      })
      return
    }

    const grant = await fetchAccessGrant({
      accessToken,
      cloudInstanceId: body.cloudInstanceId,
      projectId: body.projectId ?? null,
      conversationId: body.conversationId,
    })
    if (!grant) {
      json(response, 403, {
        error: 'forbidden',
        message: 'Cloud runtime access denied',
      })
      return
    }
    if (!grant.user.subscription.id) {
      const payload: CloudRuntimeSessionCreateResponse = {
        error: 'subscription_required',
        message: 'An active subscription is required to create a cloud runtime session.',
        usage: grant.usage,
      }
      json(response, 403, payload)
      return
    }
    if (grant.usage.activeParallelSessions >= grant.usage.parallelSessionsLimit) {
      const payload: CloudRuntimeSessionCreateResponse = {
        error: 'parallel_session_limit_reached',
        message: `Parallel session limit reached for ${grant.user.subscription.label}.`,
        usage: grant.usage,
      }
      json(response, 429, payload)
      return
    }

    const sessionId = `runtime-session-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const session: RuntimeSession = {
      id: sessionId,
      userId: grant.user.id,
      conversationId: body.conversationId,
      projectId: body.projectId ?? grant.project?.id ?? null,
      cloudInstanceId: grant.cloudInstance.id,
      ownerId: runtimeOwnerId,
      leaseExpiresAt: buildLeaseExpiresAt(),
      status: 'ready',
      modelProvider: body.modelProvider ?? grant.conversation?.modelProvider ?? null,
      modelId: body.modelId ?? grant.conversation?.modelId ?? null,
      thinkingLevel: body.thinkingLevel ?? null,
      messages: [],
      createdAt: now,
      updatedAt: now,
      accessToken,
      subscriptionPlan: grant.user.subscription.id,
      subscriptionLabel: grant.user.subscription.label,
      parallelSessionsLimit: grant.user.subscription.parallelSessionsLimit,
    }
    const acquired = await runtimeStore.acquireConversationSession(session)
    if (!acquired.created) {
      acquired.session.accessToken = accessToken
      acquired.session.leaseExpiresAt = buildLeaseExpiresAt()
      acquired.session.updatedAt = new Date().toISOString()
      await runtimeStore.updateSession(acquired.session)
      const payload: CloudRuntimeSessionCreateResponse = {
        id: acquired.session.id,
        status: acquired.session.status,
        usage: grant.usage,
      }
      json(response, 200, payload)
      return
    }

    await persistConversationMessages(session)
    await publishRealtimeEvent({
      cloudInstanceId: session.cloudInstanceId,
      conversationId: session.conversationId,
      payload: {
        event: {
          type: 'runtime_status',
          status: 'ready',
          message: 'Cloud runtime ready',
        },
      },
    })

    const payload: CloudRuntimeSessionCreateResponse = {
      id: sessionId,
      status: session.status,
      usage: grant.usage,
    }
    json(response, 201, payload)
    return
  }

  if (method === 'GET' && url.startsWith('/v1/runtime/sessions/')) {
    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const parts = parsed.pathname.split('/').filter(Boolean)
    const sessionId = parts[3] ?? ''
    const access = await requireSessionAccess(request, response, sessionId)
    if (!access) {
      return
    }

    json(response, 200, toSnapshot(access.session))
    return
  }

  if (method === 'POST' && url.match(/^\/v1\/runtime\/sessions\/[^/]+\/commands$/)) {
    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const parts = parsed.pathname.split('/').filter(Boolean)
    const sessionId = parts[3] ?? ''
    const access = await requireSessionAccess(request, response, sessionId)
    if (!access) {
      return
    }
    const session = access.session

    await runtimeStore.touchSessionLease(
      session.id,
      runtimeOwnerId,
      buildLeaseExpiresAt(),
    )
    session.ownerId = runtimeOwnerId
    session.leaseExpiresAt = buildLeaseExpiresAt()

    const body = await readJsonBody<{
      type: string
      message?: string
      provider?: string
      modelId?: string
      level?: string
    }>(request)

    if (body.type === 'set_model') {
      session.modelProvider = body.provider ?? session.modelProvider
      session.modelId = body.modelId ?? session.modelId
      session.updatedAt = new Date().toISOString()
      await runtimeStore.updateSession(session)
      await publishRealtimeEvent({
        cloudInstanceId: session.cloudInstanceId,
        conversationId: session.conversationId,
        payload: {
          event: {
            type: 'runtime_status',
            status: 'ready',
            message: 'Model updated',
          },
        },
      })
      json(response, 200, {
        id: crypto.randomUUID(),
        type: 'response',
        command: 'set_model',
        success: true,
      })
      return
    }

    if (body.type === 'set_thinking_level') {
      session.thinkingLevel = body.level ?? session.thinkingLevel
      session.updatedAt = new Date().toISOString()
      await runtimeStore.updateSession(session)
      await publishRealtimeEvent({
        cloudInstanceId: session.cloudInstanceId,
        conversationId: session.conversationId,
        payload: {
          event: {
            type: 'runtime_status',
            status: 'ready',
            message: 'Thinking level updated',
          },
        },
      })
      json(response, 200, {
        id: crypto.randomUUID(),
        type: 'response',
        command: 'set_thinking_level',
        success: true,
      })
      return
    }

    if (body.type === 'prompt' || body.type === 'follow_up' || body.type === 'steer') {
      session.status = 'streaming'
      session.leaseExpiresAt = buildLeaseExpiresAt()
      session.updatedAt = new Date().toISOString()
      await runtimeStore.updateSession(session)
      await publishRealtimeEvent({
        cloudInstanceId: session.cloudInstanceId,
        conversationId: session.conversationId,
        payload: {
          event: {
            type: 'runtime_status',
            status: 'streaming',
            message: 'Cloud runtime streaming',
          },
        },
      })

      if (typeof body.message === 'string' && body.message.trim()) {
        const userMessage: RuntimeMessage = {
          id: `user-${crypto.randomUUID()}`,
          role: 'user',
          content: body.message,
          timestamp: Date.now(),
        }
        session.messages.push(userMessage)
        session.leaseExpiresAt = buildLeaseExpiresAt()
        session.updatedAt = new Date().toISOString()
        await runtimeStore.updateSession(session)
        await persistConversationMessages(session)
        await publishRealtimeEvent({
          cloudInstanceId: session.cloudInstanceId,
          conversationId: session.conversationId,
          payload: {
            event: {
              type: 'message_update',
              message: {
                id: userMessage.id,
                role: userMessage.role,
                timestamp: userMessage.timestamp,
                content: [{ type: 'text', text: userMessage.content }],
              },
            },
          },
        })
      }

      const assistantText =
        body.type === 'steer'
          ? 'Steering updated for remote cloud runtime.'
          : `Cloud runtime reply: ${body.message ?? ''}`.trim()
      const toolCallId = `cloud-tool-${crypto.randomUUID()}`

      await publishRealtimeEvent({
        cloudInstanceId: session.cloudInstanceId,
        conversationId: session.conversationId,
        payload: {
          event: {
            type: 'tool_execution_start',
            toolCallId,
            toolName: 'cloud_runtime_echo',
          },
        },
      })

      const assistantMessage: RuntimeMessage = {
        id: `assistant-${crypto.randomUUID()}`,
        role: 'assistant',
        content: assistantText,
        timestamp: Date.now(),
      }
      session.messages.push(assistantMessage)
      session.status = 'ready'
      session.leaseExpiresAt = buildLeaseExpiresAt()
      session.updatedAt = new Date().toISOString()
      await runtimeStore.updateSession(session)
      await persistConversationMessages(session)

      await publishRealtimeEvent({
        cloudInstanceId: session.cloudInstanceId,
        conversationId: session.conversationId,
        payload: {
          event: {
            type: 'tool_execution_end',
            toolCallId,
            toolName: 'cloud_runtime_echo',
            result: {
              runtime: 'cloud',
            },
          },
        },
      })

      await publishRealtimeEvent({
        cloudInstanceId: session.cloudInstanceId,
        conversationId: session.conversationId,
        payload: {
          event: {
            type: 'message_update',
            message: {
              id: assistantMessage.id,
              role: assistantMessage.role,
              timestamp: assistantMessage.timestamp,
              content: [{ type: 'text', text: assistantMessage.content }],
            },
          },
        },
      })

      await publishRealtimeEvent({
        cloudInstanceId: session.cloudInstanceId,
        conversationId: session.conversationId,
        payload: {
          event: {
            type: 'agent_end',
          },
        },
      })

      await publishRealtimeEvent({
        cloudInstanceId: session.cloudInstanceId,
        conversationId: session.conversationId,
        payload: {
          event: {
            type: 'runtime_status',
            status: 'ready',
            message: 'Cloud runtime ready',
          },
        },
      })

      json(response, 200, {
        id: crypto.randomUUID(),
        type: 'response',
        command: body.type,
        success: true,
      })
      return
    }

    json(response, 400, {
      id: crypto.randomUUID(),
      type: 'response',
      command: body.type,
      success: false,
      error: `Unsupported command: ${body.type}`,
    })
    return
  }

  if (method === 'DELETE' && url.startsWith('/v1/runtime/sessions/')) {
    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const parts = parsed.pathname.split('/').filter(Boolean)
    const sessionId = parts[3] ?? ''
    const access = await requireSessionAccess(request, response, sessionId)
    if (!access) {
      return
    }
    const session = access.session
    session.status = 'stopped'
    session.leaseExpiresAt = new Date().toISOString()
    session.updatedAt = new Date().toISOString()
    await runtimeStore.updateSession(session)
    await runtimeStore.deleteSession(sessionId)
    response.writeHead(204)
    response.end()
    return
  }

  json(response, 404, {
    error: 'not_found',
    message: `No route for ${method} ${url}`,
  })
}

const server = http.createServer((request, response) => {
  void handleRequest(request, response).catch((error) => {
    const statusCode =
      typeof (error as { statusCode?: unknown })?.statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : 500
    json(response, statusCode, {
      error: statusCode >= 500 ? 'internal_error' : 'invalid_request',
      message: error instanceof Error ? error.message : String(error),
    })
  })
})

void runtimeStore.init().catch((error) => {
  console.error('[runtime-headless] failed to initialize store', error)
  process.exitCode = 1
})

const leaseHeartbeat = setInterval(() => {
  void refreshOwnedSessionLeases().catch((error) => {
    console.warn('[runtime-headless] failed to refresh session leases', error)
  })
}, leaseHeartbeatIntervalMs)

leaseHeartbeat.unref?.()

server.listen(port, '0.0.0.0', () => {
  console.log(`runtime-headless listening on :${port}`)
})
