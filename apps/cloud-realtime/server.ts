import http from 'node:http'
import crypto from 'node:crypto'
import { WebSocketServer } from 'ws'
import { createClient, type RedisClientType } from 'redis'
import type {
  RealtimeReplayResponse,
  RealtimeTokenResponse,
  RealtimeServerEvent,
} from '../../packages/protocol/index.js'

const port = Number.parseInt(process.env.PORT ?? '4001', 10)
const version = process.env.CHATONS_CLOUD_VERSION ?? '0.1.0'
const publicUrl = process.env.CHATONS_REALTIME_PUBLIC_URL ?? `ws://127.0.0.1:${port}/ws`
const redisUrl = process.env.REDIS_URL ?? ''
const redisChannelPrefix = process.env.CHATONS_REALTIME_CHANNEL_PREFIX ?? 'chatons:realtime:instance:'
const tokenTtlSeconds = Number.parseInt(process.env.CHATONS_REALTIME_TOKEN_TTL_SECONDS ?? '300', 10)
const cloudApiBaseUrl =
  process.env.CHATONS_CLOUD_API_URL ?? 'http://127.0.0.1:4000'
const internalServiceToken = process.env.CHATONS_INTERNAL_SERVICE_TOKEN?.trim() ?? ''
const maxJsonBodyBytes = Number.parseInt(
  process.env.CHATONS_CLOUD_MAX_JSON_BODY_BYTES ?? '1048576',
  10,
)
const maxSocketsPerInstance = Number.parseInt(
  process.env.CHATONS_REALTIME_MAX_SOCKETS_PER_INSTANCE ?? '200',
  10,
)
const replayBufferSize = Number.parseInt(
  process.env.CHATONS_REALTIME_REPLAY_BUFFER_SIZE ?? '100',
  10,
)

type IssuedTokenRecord = {
  expiresAt: number
  cloudInstanceId: string
  userId: string
}

const issuedTokens = new Map<string, IssuedTokenRecord>()
const socketsByInstanceId = new Map<string, Set<import('ws').WebSocket>>()
const eventReplayByInstanceId = new Map<string, RealtimeServerEvent[]>()

let redisPub: RedisClientType | null = null
let redisSub: RedisClientType | null = null
let redisReady = false

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
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
}

async function fetchRealtimeAccess(params: {
  accessToken: string
  cloudInstanceId: string
}): Promise<{ userId: string; cloudInstanceId: string; organizationId: string } | null> {
  if (!internalServiceToken) {
    throw new Error('Missing CHATONS_INTERNAL_SERVICE_TOKEN')
  }
  const response = await fetch(
    new URL('/v1/internal/realtime/access', cloudApiBaseUrl).toString(),
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
    throw new Error(`Realtime access lookup failed with status ${response.status}`)
  }
  return (await response.json()) as {
    userId: string
    cloudInstanceId: string
    organizationId: string
  }
}

function getRedisChannel(cloudInstanceId: string): string {
  return `${redisChannelPrefix}${cloudInstanceId}`
}

function reapExpiredTokens(): void {
  const now = Date.now()
  for (const [token, record] of issuedTokens.entries()) {
    if (record.expiresAt <= now) {
      issuedTokens.delete(token)
    }
  }
}

async function ensureRedisClients(): Promise<void> {
  if (!redisUrl || redisReady) {
    return
  }

  const publisher = createClient({ url: redisUrl })
  const subscriber = publisher.duplicate()

  subscriber.on('message', (channel, message) => {
    if (!channel.startsWith(redisChannelPrefix)) {
      return
    }
    const cloudInstanceId = channel.slice(redisChannelPrefix.length)
    broadcastToInstance(cloudInstanceId, message)
  })

  await publisher.connect()
  await subscriber.connect()
  await subscriber.pSubscribe(`${redisChannelPrefix}*`, (message, channel) => {
    if (!channel.startsWith(redisChannelPrefix)) {
      return
    }
    const cloudInstanceId = channel.slice(redisChannelPrefix.length)
    broadcastToInstance(cloudInstanceId, message)
  })

  redisPub = publisher
  redisSub = subscriber
  redisReady = true
}

function broadcastToInstance(cloudInstanceId: string, rawEvent: string): void {
  const targets = socketsByInstanceId.get(cloudInstanceId) ?? new Set()
  for (const socket of targets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(rawEvent)
    }
  }
}

function appendReplayEvent(cloudInstanceId: string, event: RealtimeServerEvent): void {
  const current = eventReplayByInstanceId.get(cloudInstanceId) ?? []
  current.push(event)
  while (current.length > replayBufferSize) {
    current.shift()
  }
  eventReplayByInstanceId.set(cloudInstanceId, current)
}

async function publishEvent(cloudInstanceId: string, event: RealtimeServerEvent): Promise<void> {
  appendReplayEvent(cloudInstanceId, event)
  const rawEvent = JSON.stringify(event)
  if (redisPub && redisReady) {
    await redisPub.publish(getRedisChannel(cloudInstanceId), rawEvent)
    return
  }
  broadcastToInstance(cloudInstanceId, rawEvent)
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
      service: 'cloud-realtime',
      version,
      timestamp: new Date().toISOString(),
      redis: redisReady ? 'connected' : 'disabled',
    })
    return
  }

  if (method === 'GET' && url === '/readyz') {
    response.writeHead(204)
    response.end()
    return
  }

  if (method === 'GET' && url.startsWith('/v1/realtime/token')) {
    const accessToken = getBearerToken(request)
    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const cloudInstanceId = parsed.searchParams.get('cloudInstanceId')?.trim() ?? ''

    if (!accessToken) {
      json(response, 401, {
        error: 'unauthorized',
        message: 'Missing bearer token',
      })
      return
    }

    if (!cloudInstanceId) {
      json(response, 400, {
        error: 'invalid_request',
        message: 'Missing cloudInstanceId',
      })
      return
    }

    const access = await fetchRealtimeAccess({
      accessToken,
      cloudInstanceId,
    })
    if (!access) {
      json(response, 403, {
        error: 'forbidden',
        message: 'Realtime access denied',
      })
      return
    }

    const token = crypto.randomUUID()
    const expiresAt = Date.now() + tokenTtlSeconds * 1000
    issuedTokens.set(token, {
      expiresAt,
      cloudInstanceId,
      userId: access.userId,
    })

    const payload: RealtimeTokenResponse = {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      websocketUrl: publicUrl,
    }

    json(response, 200, payload)
    return
  }

  if (method === 'POST' && url === '/v1/realtime/events') {
    if (!internalServiceToken || getBearerToken(request) !== internalServiceToken) {
      json(response, 401, {
        error: 'unauthorized',
        message: 'Internal service token required',
      })
      return
    }

    const body = await readJsonBody<{
      cloudInstanceId: string
      event: RealtimeServerEvent
    }>(request)
    if (!body.cloudInstanceId) {
      json(response, 400, {
        error: 'invalid_request',
        message: 'Missing cloudInstanceId',
      })
      return
    }
    await publishEvent(body.cloudInstanceId, body.event)
    json(response, 202, { ok: true })
    return
  }

  if (method === 'GET' && url.startsWith('/v1/realtime/replay')) {
    const accessToken = getBearerToken(request)
    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const cloudInstanceId = parsed.searchParams.get('cloudInstanceId')?.trim() ?? ''

    if (!accessToken) {
      json(response, 401, {
        error: 'unauthorized',
        message: 'Missing bearer token',
      })
      return
    }
    if (!cloudInstanceId) {
      json(response, 400, {
        error: 'invalid_request',
        message: 'Missing cloudInstanceId',
      })
      return
    }

    const access = await fetchRealtimeAccess({
      accessToken,
      cloudInstanceId,
    })
    if (!access) {
      json(response, 403, {
        error: 'forbidden',
        message: 'Realtime access denied',
      })
      return
    }

    const payload: RealtimeReplayResponse = {
      cloudInstanceId,
      events: eventReplayByInstanceId.get(cloudInstanceId) ?? [],
    }
    json(response, 200, payload)
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

const wss = new WebSocketServer({
  server,
  path: '/ws',
})

wss.on('connection', (socket, request) => {
  reapExpiredTokens()
  const parsed = new URL(request.url ?? '/ws', `http://127.0.0.1:${port}`)
  const token = parsed.searchParams.get('token') ?? ''
  const record = issuedTokens.get(token)

  if (!record || record.expiresAt <= Date.now()) {
    socket.close(1008, 'invalid_token')
    return
  }

  const cloudInstanceId = record.cloudInstanceId
  const instanceSockets = socketsByInstanceId.get(cloudInstanceId) ?? new Set()
  if (instanceSockets.size >= maxSocketsPerInstance) {
    issuedTokens.delete(token)
    socket.close(1013, 'instance_capacity_reached')
    return
  }
  instanceSockets.add(socket)
  socketsByInstanceId.set(cloudInstanceId, instanceSockets)
  issuedTokens.delete(token)

  const connectedEvent: RealtimeServerEvent = {
    id: crypto.randomUUID(),
    type: 'cloud.instance.status',
    ts: new Date().toISOString(),
    payload: {
      cloudInstanceId,
      status: 'connected',
      message: 'Realtime connected',
    },
  }

  socket.send(JSON.stringify(connectedEvent))
  for (const event of eventReplayByInstanceId.get(cloudInstanceId) ?? []) {
    socket.send(JSON.stringify(event))
  }

  const heartbeat = setInterval(() => {
    if (socket.readyState !== socket.OPEN) {
      return
    }

    const event: RealtimeServerEvent = {
      id: crypto.randomUUID(),
      type: 'cloud.instance.status',
      ts: new Date().toISOString(),
      payload: {
        cloudInstanceId,
        status: 'connected',
        message: redisReady ? 'Heartbeat ok (redis)' : 'Heartbeat ok',
      },
    }
    socket.send(JSON.stringify(event))
  }, 15_000)

  socket.on('close', () => {
    clearInterval(heartbeat)
    const targets = socketsByInstanceId.get(cloudInstanceId)
    targets?.delete(socket)
    if (targets && targets.size === 0) {
      socketsByInstanceId.delete(cloudInstanceId)
    }
  })
})

const tokenReaper = setInterval(() => {
  reapExpiredTokens()
}, Math.max(10_000, tokenTtlSeconds * 1000))
tokenReaper.unref?.()

void ensureRedisClients().catch((error) => {
  console.warn('[cloud-realtime] Redis disabled, falling back to in-memory fan-out:', error)
  redisPub = null
  redisSub = null
  redisReady = false
})

server.listen(port, '0.0.0.0', () => {
  console.log(`cloud-realtime listening on :${port}`)
})
