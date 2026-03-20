import http from 'node:http'
import {
  type CloudBootstrapResponse,
  type HealthResponse,
} from '../../packages/protocol/index.js'

const port = Number.parseInt(process.env.PORT ?? '4000', 10)
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

const bootstrapPayload: CloudBootstrapResponse = {
  user: {
    id: 'demo-user',
    email: 'demo@chatons.local',
    displayName: 'Demo User',
  },
  organizations: [
    {
      id: 'org-demo',
      slug: 'demo',
      name: 'Demo Org',
      role: 'owner',
    },
  ],
  cloudInstances: [],
  projects: [],
  conversations: [],
}

const server = http.createServer((request, response) => {
  const method = request.method ?? 'GET'
  const url = request.url ?? '/'

  if (method === 'GET' && url === '/healthz') {
    const payload: HealthResponse = {
      ok: true,
      service: 'cloud-api',
      version,
      timestamp: new Date().toISOString(),
    }
    json(response, 200, payload)
    return
  }

  if (method === 'GET' && url === '/readyz') {
    response.writeHead(204)
    response.end()
    return
  }

  if (method === 'GET' && url === '/v1/bootstrap') {
    json(response, 200, bootstrapPayload)
    return
  }

  if (method === 'POST' && url === '/v1/cloud-instances') {
    json(response, 201, { ok: true })
    return
  }

  json(response, 404, {
    error: 'not_found',
    message: `No route for ${method} ${url}`,
  })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`cloud-api listening on :${port}`)
})
