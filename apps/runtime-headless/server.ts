import http from 'node:http'
import crypto from 'node:crypto'
import type { CloudSubscriptionPlan, CloudSubscriptionRecord, CloudUsageRecord } from '../../packages/domain/index.js'
import type { CloudRuntimeSessionCreateResponse } from '../../packages/protocol/index.js'

const port = Number.parseInt(process.env.PORT ?? '4002', 10)
const version = process.env.CHATONS_CLOUD_VERSION ?? '0.1.0'
const realtimePublishUrl =
  process.env.CHATONS_REALTIME_PUBLISH_URL ?? 'http://127.0.0.1:4001/v1/realtime/events'

const SUBSCRIPTION_PLANS: Record<CloudSubscriptionPlan, CloudSubscriptionRecord> = {
  plus: {
    plan: 'plus',
    label: 'Plus',
    parallelSessionsLimit: 3,
  },
  pro: {
    plan: 'pro',
    label: 'Pro',
    parallelSessionsLimit: 10,
  },
  max: {
    plan: 'max',
    label: 'Max',
    parallelSessionsLimit: 30,
  },
}

type RuntimeMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

type RuntimeSession = {
  id: string
  conversationId: string
  projectId: string | null
  cloudInstanceId: string
  status: 'starting' | 'ready' | 'streaming' | 'stopped' | 'error'
  modelProvider: string | null
  modelId: string | null
  thinkingLevel: string | null
  messages: RuntimeMessage[]
  createdAt: string
  updatedAt: string
  accessToken: string
  subscriptionPlan: CloudSubscriptionPlan
}

const sessions = new Map<string, RuntimeSession>()
const sessionIdsByAccessToken = new Map<string, Set<string>>()

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
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return JSON.parse(text) as T
}

function getPlanFromRequest(request: http.IncomingMessage): CloudSubscriptionPlan | null {
  const raw = request.headers['x-chatons-subscription-plan']
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value === 'plus' || value === 'pro' || value === 'max') {
    return value
  }
  return null
}

function buildUsage(accessToken: string, subscriptionPlan: CloudSubscriptionPlan | null): CloudUsageRecord {
  const limit = subscriptionPlan ? SUBSCRIPTION_PLANS[subscriptionPlan].parallelSessionsLimit : 0
  const activeParallelSessions = sessionIdsByAccessToken.get(accessToken)?.size ?? 0
  return {
    activeParallelSessions,
    parallelSessionsLimit: limit,
    remainingParallelSessions: Math.max(0, limit - activeParallelSessions),
  }
}

function trackSession(session: RuntimeSession): void {
  const current = sessionIdsByAccessToken.get(session.accessToken) ?? new Set<string>()
  current.add(session.id)
  sessionIdsByAccessToken.set(session.accessToken, current)
}

function untrackSession(session: RuntimeSession | undefined): void {
  if (!session) {
    return
  }
  const current = sessionIdsByAccessToken.get(session.accessToken)
  if (!current) {
    return
  }
  current.delete(session.id)
  if (current.size === 0) {
    sessionIdsByAccessToken.delete(session.accessToken)
  }
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

  await fetch(realtimePublishUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      cloudInstanceId: event.cloudInstanceId,
      event: envelope,
    }),
  }).catch(() => undefined)
}

const server = http.createServer(async (request, response) => {
  const method = request.method ?? 'GET'
  const url = request.url ?? '/'

  if (method === 'GET' && url === '/healthz') {
    json(response, 200, {
      ok: true,
      service: 'runtime-headless',
      version,
      timestamp: new Date().toISOString(),
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

    const subscriptionPlan = getPlanFromRequest(request)
    const usage = buildUsage(accessToken, subscriptionPlan)
    if (!subscriptionPlan) {
      const payload: CloudRuntimeSessionCreateResponse = {
        error: 'subscription_required',
        message: 'An active subscription is required to create a cloud runtime session.',
        usage,
      }
      json(response, 403, payload)
      return
    }
    if (usage.activeParallelSessions >= usage.parallelSessionsLimit) {
      const payload: CloudRuntimeSessionCreateResponse = {
        error: 'parallel_session_limit_reached',
        message: `Parallel session limit reached for ${SUBSCRIPTION_PLANS[subscriptionPlan].label}.`,
        usage,
      }
      json(response, 429, payload)
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

    const sessionId = `runtime-session-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const session: RuntimeSession = {
      id: sessionId,
      conversationId: body.conversationId,
      projectId: body.projectId ?? null,
      cloudInstanceId: body.cloudInstanceId ?? process.env.CHATONS_CLOUD_INSTANCE_ID ?? 'instance-desktop',
      status: 'ready',
      modelProvider: body.modelProvider ?? null,
      modelId: body.modelId ?? null,
      thinkingLevel: body.thinkingLevel ?? null,
      messages: [],
      createdAt: now,
      updatedAt: now,
      accessToken,
      subscriptionPlan,
    }
    sessions.set(sessionId, session)
    trackSession(session)

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
      usage: buildUsage(accessToken, subscriptionPlan),
    }
    json(response, 201, payload)
    return
  }

  if (method === 'GET' && url.startsWith('/v1/runtime/sessions/')) {
    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const parts = parsed.pathname.split('/').filter(Boolean)
    const sessionId = parts[3] ?? ''
    const session = sessions.get(sessionId)

    if (!session) {
      json(response, 404, {
        error: 'not_found',
        message: 'Runtime session not found',
      })
      return
    }

    json(response, 200, {
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
    })
    return
  }

  if (method === 'POST' && url.match(/^\/v1\/runtime\/sessions\/[^/]+\/commands$/)) {
    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const parts = parsed.pathname.split('/').filter(Boolean)
    const sessionId = parts[3] ?? ''
    const session = sessions.get(sessionId)

    if (!session) {
      json(response, 404, {
        error: 'not_found',
        message: 'Runtime session not found',
      })
      return
    }

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
        await publishRealtimeEvent({
          cloudInstanceId: session.cloudInstanceId,
          conversationId: session.conversationId,
          payload: {
            event: {
              type: 'message',
              id: userMessage.id,
              role: userMessage.role,
              content: [{ type: 'text', text: userMessage.content }],
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
      session.updatedAt = new Date().toISOString()

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
            type: 'message',
            id: assistantMessage.id,
            role: assistantMessage.role,
            content: [{ type: 'text', text: assistantMessage.content }],
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
    const session = sessions.get(sessionId)
    sessions.delete(sessionId)
    untrackSession(session)
    response.writeHead(204)
    response.end()
    return
  }

  json(response, 404, {
    error: 'not_found',
    message: `No route for ${method} ${url}`,
  })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`runtime-headless listening on :${port}`)
})
