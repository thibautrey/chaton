import http from 'node:http'
import crypto from 'node:crypto'
import type {
  CloudAccountResponse,
  CloudAdminListUsersResponse,
  CloudAdminUpdatePlanRequest,
  CloudAdminUpdateUserRequest,
  CloudBootstrapResponse,
  CloudDesktopAuthExchangeRequest,
  CloudDesktopAuthExchangeResponse,
  HealthResponse,
} from '../../packages/protocol/index.js'
import type { CloudSubscriptionPlan, CloudSubscriptionRecord, CloudUsageRecord, CloudUserRecord } from '../../packages/domain/index.js'

const port = Number.parseInt(process.env.PORT ?? '4000', 10)
const version = process.env.CHATONS_CLOUD_VERSION ?? '0.1.0'

type CloudUserState = {
  id: string
  email: string
  displayName: string
  isAdmin: boolean
  createdAt: string
  subscriptionPlan: CloudSubscriptionPlan | null
}

const plansById = new Map<CloudSubscriptionPlan, CloudSubscriptionRecord>([
  ['plus', { id: 'plus', label: 'Plus', parallelSessionsLimit: 3, isDefault: true }],
  ['pro', { id: 'pro', label: 'Pro', parallelSessionsLimit: 10, isDefault: false }],
  ['max', { id: 'max', label: 'Max', parallelSessionsLimit: 30, isDefault: false }],
])
const usersById = new Map<string, CloudUserState>()
const usersByAccessToken = new Map<string, string>()
const usersByRefreshToken = new Map<string, string>()
const activeSessionsByUserId = new Map<string, Set<string>>()

function listPlans(): CloudSubscriptionRecord[] {
  return Array.from(plansById.values())
}

function getDefaultPlanId(): CloudSubscriptionPlan {
  return listPlans().find((plan) => plan.isDefault)?.id ?? 'plus'
}

function getSubscriptionRecord(plan: CloudSubscriptionPlan | null): CloudSubscriptionRecord | null {
  if (!plan) {
    return null
  }
  return plansById.get(plan) ?? null
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

function html(response: http.ServerResponse, statusCode: number, markup: string): void {
  response.writeHead(statusCode, {
    'content-type': 'text/html; charset=utf-8',
  })
  response.end(markup)
}

async function readJsonBody<T>(request: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return JSON.parse(text) as T
}

function toCloudUserRecord(user: CloudUserState): CloudUserRecord {
  const subscription =
    getSubscriptionRecord(user.subscriptionPlan) ??
    plansById.get(getDefaultPlanId()) ?? {
      id: 'plus',
      label: 'Plus',
      parallelSessionsLimit: 3,
      isDefault: true,
    }

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
    subscription,
  }
}

function getActiveParallelSessions(userId: string): number {
  return activeSessionsByUserId.get(userId)?.size ?? 0
}

function buildUsage(user: CloudUserState): CloudUsageRecord {
  const subscription = getSubscriptionRecord(user.subscriptionPlan)
  const limit = subscription?.parallelSessionsLimit ?? 0
  const activeParallelSessions = getActiveParallelSessions(user.id)
  return {
    activeParallelSessions,
    parallelSessionsLimit: limit,
    remainingParallelSessions: Math.max(0, limit - activeParallelSessions),
  }
}

function buildBootstrapPayload(
  user: CloudUserState,
  accessToken: string,
): CloudBootstrapResponse {
  const tokenSuffix = accessToken.slice(-8) || 'desktop'
  const organizationId = `org-${tokenSuffix}`
  const organizationName = 'Chatons Cloud'

  return {
    user: toCloudUserRecord(user),
    organizations: [
      {
        id: organizationId,
        slug: 'chatons-cloud',
        name: organizationName,
        role: user.isAdmin ? 'owner' : 'member',
      },
    ],
    cloudInstances: [
      {
        id: `instance-${tokenSuffix}`,
        name: 'Chatons Cloud',
        baseUrl: process.env.CHATONS_CLOUD_PUBLIC_URL ?? `http://127.0.0.1:${port}`,
        authMode: 'oauth',
        connectionStatus: 'connected',
        lastError: null,
      },
    ],
    projects: [
      {
        id: `project-${tokenSuffix}`,
        organizationId,
        organizationName,
        name: 'Cloud Workspace',
        repoName: organizationName,
        location: 'cloud',
        cloudStatus: 'connected',
      },
    ],
    conversations: [],
    usage: buildUsage(user),
  }
}

function ensureUserForDesktopAuth(code: string): CloudUserState {
  const normalized = code.trim().toLowerCase()
  const createdAt = new Date().toISOString()
  const existingCount = usersById.size
  const userId = `user-${normalized.replace(/[^a-z0-9]+/g, '-').slice(0, 32) || crypto.randomUUID()}`
  const existing = usersById.get(userId)
  if (existing) {
    return existing
  }

  const user: CloudUserState = {
    id: userId,
    email: `${normalized || 'connected'}@cloud.chatons.ai`,
    displayName:
      normalized
        .split(/[^a-z0-9]+/g)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ') || 'Connected User',
    isAdmin: existingCount === 0,
    createdAt,
    subscriptionPlan: getDefaultPlanId(),
  }
  usersById.set(user.id, user)
  return user
}

function requireAuthedUser(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): { user: CloudUserState; accessToken: string } | null {
  const accessToken = getBearerToken(request)
  if (!accessToken) {
    json(response, 401, {
      error: 'unauthorized',
      message: 'Missing bearer token',
    })
    return null
  }
  const userId = usersByAccessToken.get(accessToken)
  const user = userId ? usersById.get(userId) ?? null : null
  if (!user) {
    json(response, 401, {
      error: 'unauthorized',
      message: 'Unknown bearer token',
    })
    return null
  }
  return { user, accessToken }
}

function requireSubscription(
  user: CloudUserState,
  response: http.ServerResponse,
): boolean {
  if (user.subscriptionPlan) {
    return true
  }
  json(response, 403, {
    error: 'subscription_required',
    message: 'An active subscription is required to use Chatons Cloud.',
    usage: buildUsage(user),
  })
  return false
}

function requireAdmin(
  user: CloudUserState,
  response: http.ServerResponse,
): boolean {
  if (user.isAdmin) {
    return true
  }
  json(response, 403, {
    error: 'forbidden',
    message: 'Admin access required.',
  })
  return false
}

const server = http.createServer(async (request, response) => {
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
    const auth = requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    if (!requireSubscription(auth.user, response)) {
      return
    }
    json(response, 200, buildBootstrapPayload(auth.user, auth.accessToken))
    return
  }

  if (method === 'GET' && url === '/v1/account') {
    const auth = requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    const payload: CloudAccountResponse = {
      user: toCloudUserRecord(auth.user),
      usage: buildUsage(auth.user),
      plans: listPlans(),
    }
    json(response, 200, payload)
    return
  }

  if (method === 'GET' && url === '/v1/admin/users') {
    const auth = requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    if (!requireAdmin(auth.user, response)) {
      return
    }
    const payload: CloudAdminListUsersResponse = {
      users: Array.from(usersById.values())
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map(toCloudUserRecord),
      plans: listPlans(),
    }
    json(response, 200, payload)
    return
  }

  if (method === 'PATCH' && url.startsWith('/v1/admin/plans/')) {
    const auth = requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    if (!requireAdmin(auth.user, response)) {
      return
    }

    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const planId = parsed.pathname.split('/').filter(Boolean)[3] as CloudSubscriptionPlan | undefined
    const target = planId ? plansById.get(planId) : null
    if (!target || !planId) {
      json(response, 404, {
        error: 'not_found',
        message: 'Plan not found',
      })
      return
    }

    const body = await readJsonBody<CloudAdminUpdatePlanRequest>(request)
    if (typeof body.label === 'string' && body.label.trim()) {
      target.label = body.label.trim()
    }
    if (typeof body.parallelSessionsLimit === 'number') {
      target.parallelSessionsLimit = Math.max(0, Math.floor(body.parallelSessionsLimit))
    }
    if (body.isDefault === true) {
      for (const plan of plansById.values()) {
        plan.isDefault = false
      }
      target.isDefault = true
    }

    const payload: CloudAdminListUsersResponse = {
      users: Array.from(usersById.values())
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map(toCloudUserRecord),
      plans: listPlans(),
    }
    json(response, 200, payload)
    return
  }

  if (method === 'PATCH' && url.startsWith('/v1/admin/users/')) {
    const auth = requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    if (!requireAdmin(auth.user, response)) {
      return
    }

    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const userId = parsed.pathname.split('/').filter(Boolean)[3] ?? ''
    const target = usersById.get(userId)
    if (!target) {
      json(response, 404, {
        error: 'not_found',
        message: 'User not found',
      })
      return
    }

    const body = await readJsonBody<CloudAdminUpdateUserRequest>(request)
    if (body.subscriptionPlan) {
      if (!plansById.has(body.subscriptionPlan)) {
        json(response, 400, {
          error: 'invalid_request',
          message: 'Invalid subscription plan',
        })
        return
      }
      target.subscriptionPlan = body.subscriptionPlan
    }
    if (typeof body.isAdmin === 'boolean') {
      target.isAdmin = body.isAdmin
    }

    const payload: CloudAccountResponse = {
      user: toCloudUserRecord(target),
      usage: buildUsage(target),
      plans: listPlans(),
    }
    json(response, 200, payload)
    return
  }

  if (method === 'GET' && url.startsWith('/desktop/auth')) {
    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const state = parsed.searchParams.get('state') ?? ''
    const redirectUri = parsed.searchParams.get('redirect_uri') ?? 'chatons://cloud/auth/callback'
    const baseUrl = parsed.searchParams.get('base_url') ?? `http://127.0.0.1:${port}`
    const code = `demo-${state.slice(0, 8)}`

    const redirect = new URL(redirectUri)
    redirect.searchParams.set('code', code)
    redirect.searchParams.set('state', state)
    redirect.searchParams.set('base_url', baseUrl)

    html(
      response,
      200,
      `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Chatons Cloud Desktop Login</title>
    <meta http-equiv="refresh" content="0; url=${redirect.toString()}" />
  </head>
  <body>
    <p>Connecting Chatons Desktop...</p>
    <p>If nothing happens, <a href="${redirect.toString()}">return to Chatons Desktop</a>.</p>
  </body>
</html>`,
    )
    return
  }

  if (method === 'POST' && url === '/v1/cloud-instances') {
    json(response, 201, { ok: true })
    return
  }

  if (method === 'POST' && url === '/v1/auth/desktop/exchange') {
    const body = await readJsonBody<CloudDesktopAuthExchangeRequest>(request)
    if (!body.code || !body.state || !body.redirectUri) {
      json(response, 400, {
        error: 'invalid_request',
        message: 'code, state, and redirectUri are required',
      })
      return
    }

    const user = ensureUserForDesktopAuth(body.code)
    const accessToken = `access-${crypto.randomUUID()}`
    const refreshToken = `refresh-${crypto.randomUUID()}`
    usersByAccessToken.set(accessToken, user.id)
    usersByRefreshToken.set(refreshToken, user.id)

    const payload: CloudDesktopAuthExchangeResponse = {
      user: toCloudUserRecord(user),
      session: {
        accessToken,
        refreshToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    }
    json(response, 200, payload)
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
