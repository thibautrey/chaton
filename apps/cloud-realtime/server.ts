import http from 'node:http'
import crypto from 'node:crypto'
import type { Socket } from 'node:net'
import process from 'node:process'
import { WebSocketServer, type WebSocket } from 'ws'
import { createClient } from 'redis'
import type {
  RealtimeReplayResponse,
  RealtimeTokenResponse,
  RealtimeServerEvent,
  CloudInstanceStatusPayload,
} from '../../packages/protocol/index.js'

type BasicRedisClient = ReturnType<typeof createClient>

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
  organizationId: string
}

type SocketAudienceRecord = {
  socket: WebSocket
  userId: string
  organizationId: string
}

const issuedTokens = new Map<string, IssuedTokenRecord>()
const socketsByInstanceId = new Map<string, Set<SocketAudienceRecord>>()
const eventReplayByInstanceId = new Map<string, RealtimeServerEvent[]>()
const eventSeqByInstanceId = new Map<string, number>()

let redisPub: BasicRedisClient | null = null
 
let _redisSub: BasicRedisClient | null = null
let redisReady = false
let isReady = false
let initFailed = false
let isShuttingDown = false
let shutdownPromise: Promise<void> | null = null
const activeSockets = new Set<Socket>()

async function waitForShutdownStep(
  label: string,
  operation: Promise<void>,
  timeoutMs: number,
): Promise<void> {
  let timeoutId: NodeJS.Timeout | null = null
  const timeout = new Promise<void>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`[cloud-realtime] ${label} exceeded ${timeoutMs}ms during shutdown; continuing`)
      resolve()
    }, timeoutMs)
    timeoutId.unref?.()
  })

  try {
    await Promise.race([
      operation.catch((error) => {
        console.error(`[cloud-realtime] ${label} failed during shutdown`, error)
      }),
      timeout,
    ])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
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

function getRedisReplayKey(cloudInstanceId: string): string {
  return `${redisChannelPrefix}${cloudInstanceId}:replay`
}

function getRedisSeqKey(cloudInstanceId: string): string {
  return `${redisChannelPrefix}${cloudInstanceId}:seq`
}

function canAccessEvent(
  audience: Pick<SocketAudienceRecord, 'organizationId'>,
  event: Pick<RealtimeServerEvent, 'organizationId'>,
): boolean {
  if (event.organizationId && event.organizationId !== audience.organizationId) {
    return false
  }
  return true
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
  _redisSub = subscriber
  redisReady = true
}

function broadcastToInstance(cloudInstanceId: string, rawEvent: string): void {
  let parsedEvent: RealtimeServerEvent | null = null
  try {
    parsedEvent = JSON.parse(rawEvent) as RealtimeServerEvent
  } catch {
    return
  }
  const targets = socketsByInstanceId.get(cloudInstanceId) ?? new Set()
  for (const target of targets) {
    if (
      target.socket.readyState === target.socket.OPEN &&
      canAccessEvent(target, parsedEvent)
    ) {
      target.socket.send(rawEvent)
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

async function appendReplayEventPersistent(
  cloudInstanceId: string,
  event: RealtimeServerEvent,
): Promise<void> {
  appendReplayEvent(cloudInstanceId, event)
  if (!redisPub || !redisReady) {
    return
  }
  const key = getRedisReplayKey(cloudInstanceId)
  await redisPub.lPush(key, JSON.stringify(event))
  await redisPub.lTrim(key, 0, Math.max(0, replayBufferSize - 1))
}

async function getNextEventSeq(cloudInstanceId: string): Promise<number> {
  if (!redisPub || !redisReady) {
    const current = eventSeqByInstanceId.get(cloudInstanceId) ?? 0
    const next = current + 1
    eventSeqByInstanceId.set(cloudInstanceId, next)
    return next
  }
  const next = await redisPub.incr(getRedisSeqKey(cloudInstanceId))
  eventSeqByInstanceId.set(cloudInstanceId, next)
  return next
}

async function getLastEventSeq(cloudInstanceId: string): Promise<number> {
  if (!redisPub || !redisReady) {
    return eventSeqByInstanceId.get(cloudInstanceId) ?? 0
  }
  const raw = await redisPub.get(getRedisSeqKey(cloudInstanceId))
  return Number.parseInt(raw ?? '0', 10) || 0
}

async function readReplayEvents(
  cloudInstanceId: string,
  afterSeq?: number,
): Promise<RealtimeServerEvent[]> {
  if (!redisPub || !redisReady) {
    return (eventReplayByInstanceId.get(cloudInstanceId) ?? []).filter((event) =>
      typeof afterSeq === 'number' ? (event.seq ?? 0) > afterSeq : true,
    )
  }
  const rawEvents = await redisPub.lRange(getRedisReplayKey(cloudInstanceId), 0, replayBufferSize - 1)
  return rawEvents
    .slice()
    .reverse()
    .map((rawEvent) => {
      try {
        return JSON.parse(rawEvent) as RealtimeServerEvent
      } catch {
        return null
      }
    })
    .filter((event): event is RealtimeServerEvent => event !== null)
    .filter((event) => (typeof afterSeq === 'number' ? (event.seq ?? 0) > afterSeq : true))
}

async function readAuthorizedReplayEvents(
  cloudInstanceId: string,
  audience: Pick<SocketAudienceRecord, 'organizationId'>,
  afterSeq?: number,
): Promise<RealtimeServerEvent[]> {
  const events = await readReplayEvents(cloudInstanceId, afterSeq)
  return events.filter((event) => canAccessEvent(audience, event))
}

async function publishEvent(cloudInstanceId: string, event: RealtimeServerEvent): Promise<void> {
  const seq = await getNextEventSeq(cloudInstanceId)
  event.seq = seq
  await appendReplayEventPersistent(cloudInstanceId, event)
  const rawEvent = JSON.stringify(event)
  if (redisPub && redisReady) {
    await redisPub.publish(getRedisChannel(cloudInstanceId), rawEvent)
    return
  }
  broadcastToInstance(cloudInstanceId, rawEvent)
}

function buildInstanceStatusPayload(
  cloudInstanceId: string,
  status: CloudInstanceStatusPayload['status'],
  message: string,
): CloudInstanceStatusPayload {
  return {
    cloudInstanceId,
    status,
    message,
  }
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shutdownPromise) {
    await shutdownPromise
    return
  }

  shutdownPromise = (async () => {
    isShuttingDown = true
    isReady = false
    console.log(`[cloud-realtime] received ${signal}, shutting down`)

    clearInterval(tokenReaper)

    for (const socketRecords of socketsByInstanceId.values()) {
      for (const record of socketRecords) {
        try {
          record.socket.close(1001, 'server_shutdown')
        } catch {
          // Ignore best-effort websocket close failures during shutdown.
        }
      }
    }

    server.closeIdleConnections?.()
    const forceCloseTimer = setTimeout(() => {
      console.warn('[cloud-realtime] forcing remaining HTTP connections closed during shutdown')
      server.closeAllConnections?.()
      for (const socket of activeSockets) {
        socket.destroy()
      }
    }, 5_000)
    forceCloseTimer.unref?.()

    await waitForShutdownStep(
      'websocket and server close',
      new Promise<void>((resolve) => {
        wss.close(() => {
          server.close((error) => {
            if (error) {
              console.error('[cloud-realtime] server close failed', error)
            }
            resolve()
          })
        })
      }),
      10_000,
    )
    clearTimeout(forceCloseTimer)

    const closers: Promise<void>[] = []
    if (_redisSub) {
      closers.push(
        _redisSub.quit().then(() => undefined).catch((error) => {
          console.error('[cloud-realtime] redis subscriber close failed', error)
        }),
      )
    }
    if (redisPub) {
      closers.push(
        redisPub.quit().then(() => undefined).catch((error) => {
          console.error('[cloud-realtime] redis publisher close failed', error)
        }),
      )
    }
    await waitForShutdownStep('redis close', Promise.all(closers).then(() => undefined), 5_000)
  })()

  await shutdownPromise
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
    if (!isReady || initFailed || isShuttingDown) {
      response.writeHead(503)
      response.end()
      return
    }
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
      organizationId: access.organizationId,
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
    const afterSeq = Number.parseInt(parsed.searchParams.get('afterSeq') ?? '0', 10)

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
      lastSeq: await getLastEventSeq(cloudInstanceId),
      events: await readAuthorizedReplayEvents(
        cloudInstanceId,
        {
          organizationId: access.organizationId,
        },
        Number.isFinite(afterSeq) && afterSeq > 0 ? afterSeq : undefined,
      ),
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

server.on('connection', (socket) => {
  if (isShuttingDown) {
    socket.destroy()
    return
  }

  activeSockets.add(socket)
  socket.on('close', () => {
    activeSockets.delete(socket)
  })
})

const wss = new WebSocketServer({
  server,
  path: '/ws',
})

wss.on('connection', (socket: WebSocket, request: http.IncomingMessage) => {
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
  const socketRecord: SocketAudienceRecord = {
    socket,
    userId: record.userId,
    organizationId: record.organizationId,
  }
  instanceSockets.add(socketRecord)
  socketsByInstanceId.set(cloudInstanceId, instanceSockets)
  issuedTokens.delete(token)

  const connectedEvent: RealtimeServerEvent = {
    id: crypto.randomUUID(),
    type: 'cloud.instance.status',
    ts: new Date().toISOString(),
    organizationId: record.organizationId,
    payload: buildInstanceStatusPayload(cloudInstanceId, 'connected', 'Realtime connected'),
  }

  socket.send(JSON.stringify(connectedEvent))
  void readAuthorizedReplayEvents(cloudInstanceId, socketRecord)
    .then((events) => {
      for (const event of events) {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(event))
        }
      }
    })
    .catch(() => undefined)

  const heartbeat = setInterval(() => {
    if (socket.readyState !== socket.OPEN) {
      return
    }

    const event: RealtimeServerEvent = {
      id: crypto.randomUUID(),
      type: 'cloud.instance.status',
      ts: new Date().toISOString(),
      organizationId: record.organizationId,
      payload: buildInstanceStatusPayload(
        cloudInstanceId,
        'connected',
        redisReady ? 'Heartbeat ok (redis)' : 'Heartbeat ok',
      ),
    }
    socket.send(JSON.stringify(event))
  }, 15_000)

  socket.on('close', () => {
    clearInterval(heartbeat)
    const targets = socketsByInstanceId.get(cloudInstanceId)
    targets?.delete(socketRecord)
    if (targets && targets.size === 0) {
      socketsByInstanceId.delete(cloudInstanceId)
    }
  })
})

const tokenReaper = setInterval(() => {
  reapExpiredTokens()
}, Math.max(10_000, tokenTtlSeconds * 1000))
tokenReaper.unref?.()

void ensureRedisClients()
  .then(() => {
    isReady = true
    initFailed = false
  })
  .catch((error) => {
    console.warn('[cloud-realtime] Redis disabled, falling back to in-memory fan-out:', error)
    redisPub = null
    _redisSub = null
    redisReady = false
    isReady = true
    initFailed = false
  })

server.listen(port, '0.0.0.0', () => {
  console.log(`cloud-realtime listening on :${port}`)
})

process.on('SIGTERM', () => {
  void shutdown('SIGTERM').finally(() => {
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  void shutdown('SIGINT').finally(() => {
    process.exit(0)
  })
})
