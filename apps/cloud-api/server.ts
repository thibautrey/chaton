import http from 'node:http'
import crypto from 'node:crypto'
import { createPublicKey } from 'node:crypto'
import type {
  CloudAccountResponse,
  CloudConversationMessageRecord,
  CloudAdminListUsersResponse,
  CloudAdminUpdatePlanRequest,
  CloudAdminUpdateUserRequest,
  CloudBootstrapResponse,
  CloudDesktopAuthExchangeRequest,
  CloudDesktopAuthExchangeResponse,
  CreateCloudConversationRequest,
  CreateCloudConversationResponse,
  CreateCloudProjectRequest,
  CreateCloudProjectResponse,
  GetCloudConversationMessagesResponse,
  HealthResponse,
} from '../../packages/protocol/index.js'
import type {
  CloudRuntimeAccessGrant,
  CloudSubscriptionPlan,
  CloudSubscriptionRecord,
  CloudUsageRecord,
  CloudUserRecord,
} from '../../packages/domain/index.js'
import { createCloudStore, type CloudUserState } from './store.js'

const port = Number.parseInt(process.env.PORT ?? '4000', 10)
const version = process.env.CHATONS_CLOUD_VERSION ?? '0.1.0'
const publicBaseUrl = process.env.CHATONS_CLOUD_PUBLIC_URL ?? `http://127.0.0.1:${port}`
const desktopAuthRequestTtlSeconds = Number.parseInt(
  process.env.CHATONS_DESKTOP_AUTH_REQUEST_TTL_SECONDS ?? '300',
  10,
)
const maxJsonBodyBytes = Number.parseInt(
  process.env.CHATONS_CLOUD_MAX_JSON_BODY_BYTES ?? '1048576',
  10,
)
const internalServiceToken = process.env.CHATONS_INTERNAL_SERVICE_TOKEN?.trim() ?? ''
const oidcIssuer = process.env.OIDC_ISSUER_URL?.trim() || publicBaseUrl
const oidcClientId = process.env.OIDC_CLIENT_ID?.trim() || 'chatons-desktop'
const oidcClientSecret = process.env.OIDC_CLIENT_SECRET?.trim() || ''
const jwtSigningKey = process.env.JWT_SIGNING_KEY?.trim() || 'replace-with-32-plus-char-random-signing-key'
const accessTokenLifetimeSeconds = Number.parseInt(
  process.env.CHATONS_CLOUD_ACCESS_TOKEN_TTL_SECONDS ?? `${30 * 24 * 60 * 60}`,
  10,
)
const idTokenLifetimeSeconds = Number.parseInt(
  process.env.CHATONS_CLOUD_ID_TOKEN_TTL_SECONDS ?? '3600',
  10,
)

const jwkKid = crypto
  .createHash('sha256')
  .update(jwtSigningKey)
  .digest('base64url')
  .slice(0, 16)

const store = createCloudStore({
  publicBaseUrl,
})

const signingKeyObject = createPrivateSigningKey(jwtSigningKey)
const signingPublicJwk = createPublicJwk(signingKeyObject, jwkKid)

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

function redirect(response: http.ServerResponse, location: string): void {
  response.writeHead(302, { location })
  response.end()
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

function createPrivateSigningKey(secret: string): crypto.KeyObject {
  const privateKeyPem = [
    '-----BEGIN PRIVATE KEY-----',
    secret.includes('BEGIN PRIVATE KEY')
      ? secret
      : '',
  ]
  if (privateKeyPem[1]) {
    return crypto.createPrivateKey(secret)
  }
  return crypto.createSecretKey(Buffer.from(secret, 'utf8'))
}

function createPublicJwk(key: crypto.KeyObject, kid: string): Record<string, string> {
  if (key.type === 'secret') {
    const digest = crypto.createHash('sha256').update(key.export()).digest('base64url')
    return {
      kty: 'oct',
      k: digest,
      alg: 'HS256',
      use: 'sig',
      kid,
    }
  }
  const publicKey = createPublicKey(key)
  return {
    ...(publicKey.export({ format: 'jwk' }) as Record<string, string>),
    alg: 'RS256',
    use: 'sig',
    kid,
  }
}

function signJwt(payload: Record<string, unknown>, options?: { expiresInSeconds?: number }): string {
  const now = Math.floor(Date.now() / 1000)
  const header = {
    alg: signingKeyObject.type === 'secret' ? 'HS256' : 'RS256',
    typ: 'JWT',
    kid: jwkKid,
  }
  const fullPayload = {
    iat: now,
    exp: now + (options?.expiresInSeconds ?? idTokenLifetimeSeconds),
    iss: oidcIssuer,
    ...payload,
  }
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(fullPayload))}`
  const signature =
    signingKeyObject.type === 'secret'
      ? crypto.createHmac('sha256', signingKeyObject).update(signingInput).digest('base64url')
      : crypto.sign('RSA-SHA256', Buffer.from(signingInput), signingKeyObject).toString('base64url')
  return `${signingInput}.${signature}`
}

function verifyPkceChallenge(codeVerifier: string, expectedChallenge: string): boolean {
  const digest = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
  return digest === expectedChallenge
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

async function issueCloudSession(user: CloudUserState): Promise<{
  accessToken: string
  refreshToken: string
  expiresAt: string
}> {
  const accessToken = `access-${crypto.randomUUID()}`
  const refreshToken = `refresh-${crypto.randomUUID()}`
  const expiresAt = new Date(Date.now() + accessTokenLifetimeSeconds * 1000).toISOString()
  await store.saveSession({
    userId: user.id,
    accessToken,
    refreshToken,
    expiresAt,
  })
  return {
    accessToken,
    refreshToken,
    expiresAt,
  }
}

async function issueIdToken(params: {
  user: CloudUserState
  audience: string
  nonce?: string | null
}): Promise<string> {
  return signJwt(
    {
      sub: params.user.id,
      aud: params.audience,
      email: params.user.email,
      email_verified: true,
      name: params.user.displayName,
      preferred_username: params.user.email.split('@')[0] ?? params.user.email,
      nonce: params.nonce ?? undefined,
    },
    { expiresInSeconds: idTokenLifetimeSeconds },
  )
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

function toCloudUserRecord(
  user: CloudUserState,
  plans: CloudSubscriptionRecord[],
): CloudUserRecord {
  const subscription =
    plans.find((plan) => plan.id === user.subscriptionPlan) ??
    plans.find((plan) => plan.isDefault) ?? {
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

async function buildUsage(user: CloudUserState): Promise<CloudUsageRecord> {
  const plans = await store.listPlans()
  const subscription =
    plans.find((plan) => plan.id === user.subscriptionPlan) ??
    plans.find((plan) => plan.isDefault) ??
    { id: 'plus', label: 'Plus', parallelSessionsLimit: 3 }
  const activeParallelSessions = await store.getActiveParallelSessions(user.id)
  return {
    activeParallelSessions,
    parallelSessionsLimit: subscription.parallelSessionsLimit,
    remainingParallelSessions: Math.max(
      0,
      subscription.parallelSessionsLimit - activeParallelSessions,
    ),
  }
}

async function renderAuthorizePage(params: {
  state: string
  clientId: string
  redirectUri: string
  baseUrl: string
  scope: string
  nonce: string | null
  codeChallenge: string
}): Promise<string> {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Sign in to Chatons Cloud</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f5f2ea; color: #1d1b18; margin: 0; }
      main { max-width: 440px; margin: 6rem auto; background: #fffdf8; border: 1px solid #e6dcc8; border-radius: 18px; padding: 2rem; box-shadow: 0 18px 50px rgba(60,45,20,0.08); }
      h1 { margin: 0 0 0.75rem; font-size: 1.7rem; }
      p { line-height: 1.5; color: #5b5448; }
      label { display: block; margin-top: 1rem; margin-bottom: 0.35rem; font-weight: 600; }
      input { width: 100%; box-sizing: border-box; padding: 0.8rem 0.9rem; border-radius: 12px; border: 1px solid #d8cfbc; font-size: 1rem; }
      button { margin-top: 1.25rem; width: 100%; background: #1f6f5b; color: white; border: 0; border-radius: 999px; padding: 0.85rem 1rem; font-size: 1rem; font-weight: 700; cursor: pointer; }
      .meta { margin-top: 1rem; font-size: 0.9rem; color: #7b7366; }
    </style>
  </head>
  <body>
    <main>
      <h1>Sign in to Chatons Cloud</h1>
      <p>Authorize the Chatons desktop app to access this Chatons Cloud instance.</p>
      <form method="POST" action="/oidc/authorize">
        <input type="hidden" name="state" value="${escapeHtml(params.state)}" />
        <input type="hidden" name="client_id" value="${escapeHtml(params.clientId)}" />
        <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}" />
        <input type="hidden" name="base_url" value="${escapeHtml(params.baseUrl)}" />
        <input type="hidden" name="scope" value="${escapeHtml(params.scope)}" />
        <input type="hidden" name="nonce" value="${escapeHtml(params.nonce ?? '')}" />
        <input type="hidden" name="code_challenge" value="${escapeHtml(params.codeChallenge)}" />
        <label for="email">Email</label>
        <input id="email" name="email" type="email" placeholder="you@company.com" required />
        <label for="display_name">Display name</label>
        <input id="display_name" name="display_name" type="text" placeholder="Your name" />
        <button type="submit">Continue</button>
      </form>
      <div class="meta">Issuer: ${escapeHtml(oidcIssuer)}</div>
    </main>
  </body>
</html>`
}

async function readFormBody(request: http.IncomingMessage): Promise<Record<string, string>> {
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
  const parsed = new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
  return Object.fromEntries(parsed.entries())
}

async function buildBootstrapPayload(user: CloudUserState): Promise<CloudBootstrapResponse> {
  const workspace = await store.getWorkspaceState(user)
  const plans = await store.listPlans()
  const projects = Array.from(workspace.projectsById.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  )
  const conversations = Array.from(workspace.conversationsById.values()).sort((left, right) =>
    left.title.localeCompare(right.title),
  )

  return {
    user: toCloudUserRecord(user, plans),
    organizations: [workspace.organization],
    cloudInstances: [workspace.cloudInstance],
    projects,
    conversations,
    usage: await buildUsage(user),
  }
}

async function requireAuthedUser(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<{ user: CloudUserState; accessToken: string } | null> {
  const accessToken = getBearerToken(request)
  if (!accessToken) {
    json(response, 401, {
      error: 'unauthorized',
      message: 'Missing bearer token',
    })
    return null
  }
  const user = await store.getUserByAccessToken(accessToken)
  if (!user) {
    json(response, 401, {
      error: 'unauthorized',
      message: 'Unknown bearer token',
    })
    return null
  }
  return { user, accessToken }
}

function requireInternalService(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): boolean {
  if (!internalServiceToken) {
    json(response, 500, {
      error: 'misconfigured',
      message: 'Missing internal service token',
    })
    return false
  }
  if (getBearerToken(request) !== internalServiceToken) {
    json(response, 401, {
      error: 'unauthorized',
      message: 'Internal service token required',
    })
    return false
  }
  return true
}

async function requireSubscription(
  user: CloudUserState,
  response: http.ServerResponse,
): Promise<boolean> {
  if (user.subscriptionPlan) {
    return true
  }
  json(response, 403, {
    error: 'subscription_required',
    message: 'An active subscription is required to use Chatons Cloud.',
    usage: await buildUsage(user),
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

async function handleRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
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

  if (method === 'GET' && url === '/.well-known/openid-configuration') {
    json(response, 200, {
      issuer: oidcIssuer,
      authorization_endpoint: new URL('/oidc/authorize', oidcIssuer).toString(),
      token_endpoint: new URL('/oidc/token', oidcIssuer).toString(),
      userinfo_endpoint: new URL('/oidc/userinfo', oidcIssuer).toString(),
      jwks_uri: new URL('/oidc/jwks.json', oidcIssuer).toString(),
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: [signingKeyObject.type === 'secret' ? 'HS256' : 'RS256'],
      token_endpoint_auth_methods_supported: oidcClientSecret ? ['client_secret_post', 'none'] : ['none'],
      scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
      claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'nonce', 'email', 'email_verified', 'name', 'preferred_username'],
      code_challenge_methods_supported: ['S256'],
      grant_types_supported: ['authorization_code'],
    })
    return
  }

  if (method === 'GET' && url === '/oidc/jwks.json') {
    json(response, 200, { keys: [signingPublicJwk] })
    return
  }

  if (method === 'GET' && url.startsWith('/oidc/authorize')) {
    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const state = parsed.searchParams.get('state')?.trim() ?? ''
    const redirectUri = parsed.searchParams.get('redirect_uri')?.trim() ?? 'chatons://cloud/auth/callback'
    const clientId = parsed.searchParams.get('client_id')?.trim() ?? ''
    const responseType = parsed.searchParams.get('response_type')?.trim() ?? ''
    const scope = parsed.searchParams.get('scope')?.trim() || 'openid profile email offline_access'
    const nonce = parsed.searchParams.get('nonce')?.trim() ?? null
    const codeChallenge = parsed.searchParams.get('code_challenge')?.trim() ?? ''
    const codeChallengeMethod = parsed.searchParams.get('code_challenge_method')?.trim() ?? ''
    const baseUrl = parsed.searchParams.get('base_url')?.trim() ?? publicBaseUrl

    if (!state || !clientId || !redirectUri || responseType !== 'code' || !codeChallenge || codeChallengeMethod !== 'S256') {
      json(response, 400, {
        error: 'invalid_request',
        message: 'state, client_id, redirect_uri, response_type=code, and PKCE S256 challenge are required',
      })
      return
    }
    if (clientId !== oidcClientId) {
      json(response, 400, {
        error: 'invalid_client',
        message: 'Unknown OIDC client',
      })
      return
    }

    const authCode = crypto.randomUUID()
    await store.createDesktopAuthRequest({
      state,
      clientId,
      redirectUri,
      baseUrl,
      authCode,
      codeChallenge,
      codeChallengeMethod: 'S256',
      scope,
      nonce,
      userId: null,
      expiresAt: new Date(Date.now() + desktopAuthRequestTtlSeconds * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      consumedAt: null,
    })

    html(
      response,
      200,
      await renderAuthorizePage({
        state,
        clientId,
        redirectUri,
        baseUrl,
        scope,
        nonce,
        codeChallenge,
      }),
    )
    return
  }

  if (method === 'POST' && url === '/oidc/authorize') {
    const body = await readFormBody(request)
    const state = body.state?.trim() ?? ''
    const email = body.email?.trim() ?? ''
    const displayName = body.display_name?.trim() ?? ''
    if (!state || !email) {
      json(response, 400, {
        error: 'invalid_request',
        message: 'Missing state or email',
      })
      return
    }

    const authRequest = await store.getDesktopAuthRequest(state)
    if (!authRequest) {
      json(response, 400, {
        error: 'invalid_request',
        message: 'Unknown or expired authorization request',
      })
      return
    }

    const user = await store.findOrCreateUserForLogin({
      email,
      displayName,
    })
    const authorized = await store.authorizeDesktopAuthRequest({
      state,
      userId: user.id,
    })
    if (!authorized) {
      json(response, 400, {
        error: 'invalid_request',
        message: 'Authorization request could not be completed',
      })
      return
    }

    const redirectUrl = new URL(authorized.redirectUri)
    redirectUrl.searchParams.set('code', authorized.authCode)
    redirectUrl.searchParams.set('state', authorized.state)
    redirectUrl.searchParams.set('base_url', authorized.baseUrl)
    redirect(response, redirectUrl.toString())
    return
  }

  if (method === 'POST' && url === '/oidc/token') {
    const body = await readJsonBody<CloudDesktopAuthExchangeRequest>(request)
    const grantType = body.grantType?.trim?.() || 'authorization_code'
    const clientId = body.clientId?.trim() ?? ''
    const redirectUri = body.redirectUri?.trim() ?? ''
    const code = body.code?.trim() ?? ''
    const codeVerifier = body.codeVerifier?.trim() ?? ''
    if (grantType !== 'authorization_code') {
      json(response, 400, {
        error: 'unsupported_grant_type',
        message: 'Only authorization_code is supported',
      })
      return
    }
    if (!clientId || !redirectUri || !code || !codeVerifier) {
      json(response, 400, {
        error: 'invalid_request',
        message: 'clientId, redirectUri, code, and codeVerifier are required',
      })
      return
    }
    if (clientId !== oidcClientId) {
      json(response, 401, {
        error: 'invalid_client',
        message: 'Unknown OIDC client',
      })
      return
    }
    if (oidcClientSecret) {
      const presentedSecret = request.headers['x-oidc-client-secret']?.toString().trim() ?? ''
      if (presentedSecret && presentedSecret !== oidcClientSecret) {
        json(response, 401, {
          error: 'invalid_client',
          message: 'Invalid OIDC client secret',
        })
        return
      }
    }

    const authRequest = await store.consumeDesktopAuthCode({
      authCode: code,
      clientId,
      redirectUri,
    })
    if (!authRequest || !authRequest.userId) {
      json(response, 400, {
        error: 'invalid_grant',
        message: 'Invalid or expired authorization code',
      })
      return
    }
    if (!verifyPkceChallenge(codeVerifier, authRequest.codeChallenge)) {
      json(response, 400, {
        error: 'invalid_grant',
        message: 'Invalid PKCE verifier',
      })
      return
    }

    const user = await store.getUserById(authRequest.userId)
    if (!user) {
      json(response, 400, {
        error: 'invalid_grant',
        message: 'Authorization code user no longer exists',
      })
      return
    }

    const session = await issueCloudSession(user)
    const plans = await store.listPlans()
    const payload: CloudDesktopAuthExchangeResponse = {
      user: toCloudUserRecord(user, plans),
      session,
      idToken: await issueIdToken({
        user,
        audience: clientId,
        nonce: authRequest.nonce,
      }),
    }
    json(response, 200, payload)
    return
  }

  if (method === 'GET' && url === '/oidc/userinfo') {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    json(response, 200, {
      sub: auth.user.id,
      email: auth.user.email,
      email_verified: true,
      name: auth.user.displayName,
      preferred_username: auth.user.email.split('@')[0] ?? auth.user.email,
    })
    return
  }

  if (method === 'GET' && url === '/v1/bootstrap') {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    if (!(await requireSubscription(auth.user, response))) {
      return
    }
    json(response, 200, await buildBootstrapPayload(auth.user))
    return
  }

  if (method === 'GET' && url === '/v1/account') {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    const plans = await store.listPlans()
    const payload: CloudAccountResponse = {
      user: toCloudUserRecord(auth.user, plans),
      usage: await buildUsage(auth.user),
      plans,
    }
    json(response, 200, payload)
    return
  }

  if (method === 'GET' && url === '/v1/admin/users') {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    if (!requireAdmin(auth.user, response)) {
      return
    }
    const plans = await store.listPlans()
    const payload: CloudAdminListUsersResponse = {
      users: (await store.listUsers()).map((user) => toCloudUserRecord(user, plans)),
      plans,
    }
    json(response, 200, payload)
    return
  }

  if (method === 'PATCH' && url.startsWith('/v1/admin/plans/')) {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    if (!requireAdmin(auth.user, response)) {
      return
    }

    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const planId = parsed.pathname.split('/').filter(Boolean)[3] as CloudSubscriptionPlan | undefined
    const plans = await store.listPlans()
    const target = planId ? plans.find((plan) => plan.id === planId) ?? null : null
    if (!target || !planId) {
      json(response, 404, {
        error: 'not_found',
        message: 'Plan not found',
      })
      return
    }

    const body = await readJsonBody<CloudAdminUpdatePlanRequest>(request)
    const next: CloudSubscriptionRecord = {
      ...target,
      label:
        typeof body.label === 'string' && body.label.trim()
          ? body.label.trim()
          : target.label,
      parallelSessionsLimit:
        typeof body.parallelSessionsLimit === 'number'
          ? Math.max(0, Math.floor(body.parallelSessionsLimit))
          : target.parallelSessionsLimit,
      isDefault: body.isDefault === true ? true : target.isDefault === true,
    }
    await store.savePlan(next)

    const refreshedPlans = await store.listPlans()
    const payload: CloudAdminListUsersResponse = {
      users: (await store.listUsers()).map((user) => toCloudUserRecord(user, refreshedPlans)),
      plans: refreshedPlans,
    }
    json(response, 200, payload)
    return
  }

  if (method === 'PATCH' && url.startsWith('/v1/admin/users/')) {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    if (!requireAdmin(auth.user, response)) {
      return
    }

    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const userId = parsed.pathname.split('/').filter(Boolean)[3] ?? ''
    const body = await readJsonBody<CloudAdminUpdateUserRequest>(request)
    const plans = await store.listPlans()
    if (body.subscriptionPlan && !plans.some((plan) => plan.id === body.subscriptionPlan)) {
      json(response, 400, {
        error: 'invalid_request',
        message: 'Invalid subscription plan',
      })
      return
    }

    const updated = await store.updateUser(userId, {
      subscriptionPlan: body.subscriptionPlan,
      isAdmin: body.isAdmin,
    })
    if (!updated) {
      json(response, 404, {
        error: 'not_found',
        message: 'User not found',
      })
      return
    }

    const refreshedPlans = await store.listPlans()
    const payload: CloudAccountResponse = {
      user: toCloudUserRecord(updated, refreshedPlans),
      usage: await buildUsage(updated),
      plans: refreshedPlans,
    }
    json(response, 200, payload)
    return
  }

  if (method === 'GET' && url.startsWith('/desktop/auth')) {
    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const state = parsed.searchParams.get('state')?.trim() ?? ''
    const redirectUri =
      parsed.searchParams.get('redirect_uri')?.trim() ?? 'chatons://cloud/auth/callback'
    const baseUrl = parsed.searchParams.get('base_url')?.trim() ?? publicBaseUrl
    const authorizeUrl = new URL('/oidc/authorize', oidcIssuer)
    authorizeUrl.searchParams.set('response_type', 'code')
    authorizeUrl.searchParams.set('client_id', oidcClientId)
    authorizeUrl.searchParams.set('redirect_uri', redirectUri)
    authorizeUrl.searchParams.set('scope', 'openid profile email offline_access')
    authorizeUrl.searchParams.set('state', state)
    authorizeUrl.searchParams.set('nonce', crypto.randomUUID())
    authorizeUrl.searchParams.set('base_url', baseUrl)
    authorizeUrl.searchParams.set('code_challenge', crypto.createHash('sha256').update(state).digest('base64url'))
    authorizeUrl.searchParams.set('code_challenge_method', 'S256')
    redirect(response, authorizeUrl.toString())
    return
  }

  if (method === 'POST' && url === '/v1/cloud-instances') {
    json(response, 201, { ok: true })
    return
  }

  if (method === 'POST' && url === '/v1/auth/desktop/exchange') {
    const body = await readJsonBody<CloudDesktopAuthExchangeRequest>(request)
    const tokenPayload = await (async () => {
      const authRequest = await store.consumeDesktopAuthCode({
        authCode: body.code?.trim() ?? '',
        clientId: body.clientId?.trim() ?? '',
        redirectUri: body.redirectUri?.trim() ?? '',
      })
      if (!authRequest || !authRequest.userId) {
        return null
      }
      if (!verifyPkceChallenge(body.codeVerifier?.trim() ?? '', authRequest.codeChallenge)) {
        return null
      }
      const user = await store.getUserById(authRequest.userId)
      if (!user) {
        return null
      }
      const session = await issueCloudSession(user)
      const plans = await store.listPlans()
      const payload: CloudDesktopAuthExchangeResponse = {
        user: toCloudUserRecord(user, plans),
        session,
        idToken: await issueIdToken({
          user,
          audience: body.clientId?.trim() ?? oidcClientId,
          nonce: authRequest.nonce,
        }),
      }
      return payload
    })()
    if (!tokenPayload) {
      json(response, 400, {
        error: 'invalid_grant',
        message: 'Invalid or expired desktop auth request',
      })
      return
    }
    json(response, 200, tokenPayload)
    return
  }

  if (method === 'POST' && url === '/v1/projects') {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    if (!(await requireSubscription(auth.user, response))) {
      return
    }

    const body = await readJsonBody<CreateCloudProjectRequest>(request)
    const workspace = await store.getWorkspaceState(auth.user)
    const trimmedName = body.name?.trim()
    if (!trimmedName) {
      json(response, 400, {
        error: 'invalid_request',
        message: 'Project name is required',
      })
      return
    }
    if (body.organizationId !== workspace.organization.id) {
      json(response, 400, {
        error: 'invalid_request',
        message: 'Unknown organization',
      })
      return
    }

    const project = await store.createProject(auth.user, {
      ...body,
      name: trimmedName,
    })
    const payload: CreateCloudProjectResponse = {
      project,
    }
    json(response, 201, payload)
    return
  }

  if (method === 'POST' && url === '/v1/conversations') {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    if (!(await requireSubscription(auth.user, response))) {
      return
    }

    const body = await readJsonBody<CreateCloudConversationRequest>(request)
    const conversation = await store.createConversation(auth.user, body)
    if (!conversation) {
      json(response, 404, {
        error: 'not_found',
        message: 'Project not found',
      })
      return
    }

    const payload: CreateCloudConversationResponse = {
      conversation,
    }
    json(response, 201, payload)
    return
  }

  if (method === 'GET' && url.match(/^\/v1\/conversations\/[^/]+\/messages$/)) {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    if (!(await requireSubscription(auth.user, response))) {
      return
    }

    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const conversationId = parsed.pathname.split('/').filter(Boolean)[2] ?? ''
    const messages = await store.getConversationMessages(auth.user, conversationId)
    if (messages === null) {
      json(response, 404, {
        error: 'not_found',
        message: 'Conversation not found',
      })
      return
    }

    const payload: GetCloudConversationMessagesResponse = {
      conversationId,
      messages,
    }
    json(response, 200, payload)
    return
  }

  if (method === 'POST' && url.match(/^\/v1\/conversations\/[^/]+\/messages$/)) {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    if (!(await requireSubscription(auth.user, response))) {
      return
    }

    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const conversationId = parsed.pathname.split('/').filter(Boolean)[2] ?? ''
    const body = await readJsonBody<{ messages?: CloudConversationMessageRecord[] }>(request)
    const messages = await store.saveConversationMessages(
      auth.user,
      conversationId,
      Array.isArray(body.messages) ? body.messages : [],
    )
    if (messages === null) {
      json(response, 404, {
        error: 'not_found',
        message: 'Conversation not found',
      })
      return
    }

    const payload: GetCloudConversationMessagesResponse = {
      conversationId,
      messages,
    }
    json(response, 200, payload)
    return
  }

  if (method === 'POST' && url === '/v1/internal/runtime/access') {
    if (!requireInternalService(request, response)) {
      return
    }
    const body = await readJsonBody<{
      accessToken: string
      cloudInstanceId: string
      projectId?: string | null
      conversationId?: string | null
    }>(request)
    if (!body.accessToken || !body.cloudInstanceId) {
      json(response, 400, {
        error: 'invalid_request',
        message: 'accessToken and cloudInstanceId are required',
      })
      return
    }
    const grant = await store.authorizeAccess(body)
    if (!grant) {
      json(response, 404, {
        error: 'not_found',
        message: 'Cloud access grant not found',
      })
      return
    }
    json(response, 200, grant satisfies CloudRuntimeAccessGrant)
    return
  }

  if (method === 'POST' && url === '/v1/internal/realtime/access') {
    if (!requireInternalService(request, response)) {
      return
    }
    const body = await readJsonBody<{
      accessToken: string
      cloudInstanceId: string
    }>(request)
    if (!body.accessToken || !body.cloudInstanceId) {
      json(response, 400, {
        error: 'invalid_request',
        message: 'accessToken and cloudInstanceId are required',
      })
      return
    }
    const grant = await store.authorizeAccess(body)
    if (!grant) {
      json(response, 404, {
        error: 'not_found',
        message: 'Cloud access grant not found',
      })
      return
    }
    json(response, 200, {
      userId: grant.user.id,
      cloudInstanceId: grant.cloudInstance.id,
      organizationId: grant.organization.id,
    })
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
        ? ((error as { statusCode: number }).statusCode)
        : 500
    json(response, statusCode, {
      error: statusCode >= 500 ? 'internal_error' : 'invalid_request',
      message: error instanceof Error ? error.message : String(error),
    })
  })
})

void store.init().catch((error) => {
  console.error('[cloud-api] failed to initialize store', error)
  process.exitCode = 1
})

server.listen(port, '0.0.0.0', () => {
  console.log(`cloud-api listening on :${port}`)
})
