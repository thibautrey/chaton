import http from 'node:http'
import crypto from 'node:crypto'
import type {
  AddOrganizationProviderRequest,
  AddOrganizationProviderResponse,
  CloudAccountResponse,
  CloudConversationMessageRecord,
  CloudDesktopAuthExchangeRequest,
  CloudDesktopAuthExchangeResponse,
  CreateCloudConversationRequest,
  CreateCloudConversationResponse,
  CreateCloudProjectRequest,
  CreateCloudProjectResponse,
  GetCloudConversationMessagesResponse,
  HealthResponse,
  UpdateOrganizationRequest,
} from '../../packages/protocol/index.js'
import type {
  CloudRuntimeAccessGrant,
  CloudSubscriptionPlan,
} from '../../packages/domain/index.js'
import {
  desktopAuthRequestTtlSeconds,
  oidcClientId,
  oidcClientSecret,
  oidcIssuer,
  port,
  publicBaseUrl,
  version,
} from './config.ts'
import {
  buildBootstrapPayload,
  buildUsage,
  issueCloudSession,
  issueIdToken,
  signingKeyObject,
  signingPublicJwk,
  store,
  toCloudUserRecord,
  verifyPkceChallenge,
} from './context.ts'
import { requireAdmin, requireAuthedUser, requireInternalService, requireSubscription } from './guards.ts'
import { escapeHtml, html, json, readFormBody, readJsonBody, redirect } from './http.ts'
import { handleWebAuthRoute } from './web-auth.ts'
import { handleAdminRoute } from './admin-routes.ts'

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

  if (await handleWebAuthRoute(method, url, request, response)) {
    return
  }

  if (await handleAdminRoute(method, url, request, response)) {
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

  if (method === 'PATCH' && url === '/v1/organization') {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    const body = await readJsonBody<UpdateOrganizationRequest>(request)
    const name = body.name?.trim() ?? ''
    const slug = body.slug?.trim() ?? ''
    if (!name || !slug) {
      json(response, 400, {
        error: 'invalid_request',
        message: 'name and slug are required',
      })
      return
    }
    const plans = await store.listPlans()
    if (body.plan && !plans.some((plan) => plan.id === body.plan)) {
      json(response, 400, {
        error: 'invalid_request',
        message: 'Invalid subscription plan',
      })
      return
    }
    const organization = await store.updateOrganization(auth.user, {
      name,
      slug,
      plan: body.plan,
    })
    json(response, 200, { organization })
    return
  }

  if (method === 'POST' && url === '/v1/organization/providers') {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    const body = await readJsonBody<AddOrganizationProviderRequest>(request)
    const label = body.label?.trim() ?? ''
    const secret = body.secret?.trim() ?? ''
    if (!body.kind || !label || !secret) {
      json(response, 400, {
        error: 'invalid_request',
        message: 'kind, label, and secret are required',
      })
      return
    }
    const result = await store.addOrganizationProvider(auth.user, {
      kind: body.kind,
      label,
      secret,
    })
    const payload: AddOrganizationProviderResponse = {
      provider: result.provider,
      organization: result.organization,
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
