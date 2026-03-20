import http from 'node:http'
import crypto from 'node:crypto'
import { WebSocketServer } from 'ws'
import type { RealtimeTokenResponse, RealtimeServerEvent } from '../../packages/protocol/index.js'

const port = Number.parseInt(process.env.PORT ?? '4001', 10)
const version = process.env.CHATONS_CLOUD_VERSION ?? '0.1.0'
const publicUrl = process.env.CHATONS_REALTIME_PUBLIC_URL ?? `ws://127.0.0.1:${port}/ws`

const issuedTokens = new Map<
  string,
  {
    expiresAt: number
    accessToken: string
  }
>()
const socketsByInstanceId = new Map<string, Set<import('ws').WebSocket>>()

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

const server = http.createServer((request, response) => {
  const method = request.method ?? 'GET'
  const url = request.url ?? '/'

  if (method === 'GET' && url === '/healthz') {
    json(response, 200, {
      ok: true,
      service: 'cloud-realtime',
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

  if (method === 'GET' && url.startsWith('/v1/realtime/token')) {
    const authorization = request.headers.authorization ?? ''
    const accessToken = authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : ''

    if (!accessToken) {
      json(response, 401, {
        error: 'unauthorized',
        message: 'Missing bearer token',
      })
      return
    }

    const token = crypto.randomUUID()
    const expiresAt = Date.now() + 5 * 60 * 1000
    issuedTokens.set(token, {
      expiresAt,
      accessToken,
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
    const chunks: Buffer[] = []
    request.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    request.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          cloudInstanceId: string
          event: RealtimeServerEvent
        }
        const targets = socketsByInstanceId.get(body.cloudInstanceId) ?? new Set()
        for (const socket of targets) {
          if (socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify(body.event))
          }
        }
        json(response, 202, { ok: true })
      } catch (error) {
        json(response, 400, {
          error: 'invalid_request',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    })
    return
  }

  json(response, 404, {
    error: 'not_found',
    message: `No route for ${method} ${url}`,
  })
})

const wss = new WebSocketServer({
  server,
  path: '/ws',
})

wss.on('connection', (socket, request) => {
  const parsed = new URL(request.url ?? '/ws', `http://127.0.0.1:${port}`)
  const token = parsed.searchParams.get('token') ?? ''
  const record = issuedTokens.get(token)

  if (!record || record.expiresAt <= Date.now()) {
    socket.close(1008, 'invalid_token')
    return
  }

  const tokenSuffix = record.accessToken.slice(-8) || 'desktop'
  const cloudInstanceId = `instance-${tokenSuffix}`
  const instanceSockets = socketsByInstanceId.get(cloudInstanceId) ?? new Set()
  instanceSockets.add(socket)
  socketsByInstanceId.set(cloudInstanceId, instanceSockets)

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
        message: 'Heartbeat ok',
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

server.listen(port, '0.0.0.0', () => {
  console.log(`cloud-realtime listening on :${port}`)
})
