import http from 'node:http'
import crypto from 'node:crypto'

const port = Number.parseInt(process.env.PORT ?? '4001', 10)
const version = process.env.CHATONS_CLOUD_VERSION ?? '0.1.0'

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
    json(response, 200, {
      token: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })
    return
  }

  json(response, 404, {
    error: 'not_found',
    message: `No route for ${method} ${url}`,
  })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`cloud-realtime listening on :${port}`)
})
