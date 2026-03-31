import http from 'node:http'
import crypto from 'node:crypto'
import process from 'node:process'
import type {
  AcceptOrganizationInviteRequest,
  AddOrganizationProviderRequest,
  AddOrganizationProviderResponse,
  CloudAccountResponse,
  CloudConversationMessageRecord,
  CloudDesktopAuthExchangeRequest,
  CloudDesktopAuthExchangeResponse,
  CreateOrganizationInviteRequest,
  CreateOrganizationInviteResponse,
  CreateCloudConversationRequest,
  CreateCloudConversationResponse,
  CreateCloudProjectRequest,
  CreateCloudProjectResponse,
  GetCloudConversationMessagesResponse,
  HealthResponse,
  MemoryListRequest,
  MemorySearchRequest,
  MemoryUpdateRequest,
  MemoryUpsertRequest,
  SetActiveOrganizationRequest,
  UpdateOrganizationRequest,
} from '../../packages/protocol/index.js'
import type {
  CloudRuntimeAccessGrant,
} from '../../packages/domain/index.js'
import {
  desktopAuthRequestTtlSeconds,
  oidcClientId,
  oidcClientSecret,
  oidcIssuer,
  port,
  publicBaseUrl,
  webBaseUrl,
  version,
} from './config.js'
import {
  buildBootstrapPayload,
  buildUsage,
  issueCloudSession,
  issueIdToken,
  signingKeyObject,
  signingPublicJwk,
  store,
  toCloudUserRecord,
  filterVisiblePlans,
  verifyPkceChallenge,
} from './context.js'
import { getAuthedWebUser, requireAuthedUser, requireInternalService, requireSubscription } from './guards.js'
import { escapeHtml, handleCorsPreflight, html, json, readFormBody, readJsonBody, redirect } from './http.js'
import { handleWebAuthRoute } from './web-auth.js'
import { handleAdminRoute } from './admin-routes.js'
import { buildOrganizationInviteEmail, sendMail } from './mailer.js'

let isReady = false
let initFailed = false
let isShuttingDown = false
let shutdownPromise: Promise<void> | null = null

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shutdownPromise) {
    await shutdownPromise
    return
  }

  shutdownPromise = (async () => {
    isShuttingDown = true
    isReady = false
    console.log(`[cloud-api] received ${signal}, shutting down`)

    await new Promise<void>((resolve) => {
      server.close((error) => {
        if (error) {
          console.error('[cloud-api] server close failed', error)
        }
        resolve()
      })
    })

    try {
      await store.close()
    } catch (error) {
      console.error('[cloud-api] store close failed', error)
    }
  })()

  await shutdownPromise
}

async function renderAuthorizePage(params: {
  scope: string
  state: string
  user: {
    email: string
    displayName: string
  }
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
      .secondary { background: transparent; color: #1d1b18; border: 1px solid #d8cfbc; }
      .account { margin-top: 1rem; padding: 0.9rem 1rem; border-radius: 12px; background: #f7f2e7; border: 1px solid #e6dcc8; }
      .account strong { display: block; font-size: 0.98rem; }
      .meta { margin-top: 1rem; font-size: 0.9rem; color: #7b7366; }
    </style>
  </head>
  <body>
    <main>
      <h1>Sign in to Chatons Cloud</h1>
      <p>Authorize the Chatons desktop app to access this Chatons Cloud instance with your existing cloud account.</p>
      <div class="account">
        <strong>${escapeHtml(params.user.displayName)}</strong>
        <div>${escapeHtml(params.user.email)}</div>
      </div>
      <p>The desktop app is requesting access to your OpenID profile and cloud session.</p>
      <p class="meta">Requested scopes: ${escapeHtml(params.scope)}</p>
      <form method="POST" action="/oidc/authorize">
        <input type="hidden" name="state" value="${escapeHtml(params.state)}" />
        <input type="hidden" name="action" value="approve" />
        <button type="submit">Continue to Desktop</button>
      </form>
      <form method="POST" action="/oidc/authorize">
        <input type="hidden" name="state" value="${escapeHtml(params.state)}" />
        <input type="hidden" name="action" value="deny" />
        <button class="secondary" type="submit">Cancel</button>
      </form>
      <div class="meta">Issuer: ${escapeHtml(oidcIssuer)}</div>
    </main>
  </body>
</html>`
}

function buildAuthorizeUrlFromRequest(params: {
  state: string
  clientId: string
  redirectUri: string
  baseUrl: string
  scope: string
  nonce: string | null
  codeChallenge: string
  codeChallengeMethod: string
}): string {
  const target = new URL('/oidc/authorize', publicBaseUrl)
  target.searchParams.set('response_type', 'code')
  target.searchParams.set('state', params.state)
  target.searchParams.set('client_id', params.clientId)
  target.searchParams.set('redirect_uri', params.redirectUri)
  target.searchParams.set('scope', params.scope)
  target.searchParams.set('base_url', params.baseUrl)
  target.searchParams.set('code_challenge', params.codeChallenge)
  target.searchParams.set('code_challenge_method', params.codeChallengeMethod)
  if (params.nonce) {
    target.searchParams.set('nonce', params.nonce)
  }
  return target.toString()
}

function buildWebAuthRedirect(path: '/cloud/login' | '/cloud/signup', returnTo: string): string {
  const target = new URL(path, webBaseUrl)
  target.searchParams.set('return_to', returnTo)
  return target.toString()
}

async function handleRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  const method = request.method ?? 'GET'
  const url = request.url ?? '/'

  if (handleCorsPreflight(request, response)) {
    return
  }

  if (method === 'GET' && url === '/healthz') {
    const payload: HealthResponse = {
      ok: true,
      service: 'cloud-api',
      version,
      timestamp: new Date().toISOString(),
    }
    json(request, response, 200, payload)
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

  if (await handleWebAuthRoute(method, url, request, response)) {
    return
  }

  if (await handleAdminRoute(method, url, request, response)) {
    return
  }

  if (method === 'GET' && url === '/.well-known/openid-configuration') {
    json(request, response, 200, {
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
    json(request, response, 200, { keys: [signingPublicJwk] })
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
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'state, client_id, redirect_uri, response_type=code, and PKCE S256 challenge are required',
      })
      return
    }
    if (clientId !== oidcClientId) {
      json(request, response, 400, {
        error: 'invalid_client',
        message: 'Unknown OIDC client',
      })
      return
    }

    const returnTo = buildAuthorizeUrlFromRequest({
      state,
      clientId,
      redirectUri,
      baseUrl,
      scope,
      nonce,
      codeChallenge,
      codeChallengeMethod: 'S256',
    })
    const auth = await getAuthedWebUser(request)
    if (!auth) {
      redirect(request, response, buildWebAuthRedirect('/cloud/login', returnTo), webBaseUrl)
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
      request,
      response,
      200,
      await renderAuthorizePage({
        scope,
        state,
        user: {
          email: auth.user.email,
          displayName: auth.user.displayName,
        },
      }),
    )
    return
  }

  if (method === 'POST' && url === '/oidc/authorize') {
    const body = await readFormBody(request)
    const state = body.state?.trim() ?? ''
    const action = body.action?.trim() ?? 'approve'
    if (!state) {
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'Missing authorization state',
      })
      return
    }

    const authRequest = await store.getDesktopAuthRequest(state)
    if (!authRequest) {
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'Unknown or expired authorization request',
      })
      return
    }

    if (action === 'deny') {
      const redirectUrl = new URL(authRequest.redirectUri)
      redirectUrl.searchParams.set('error', 'access_denied')
      redirectUrl.searchParams.set('state', authRequest.state)
      redirect(request, response, redirectUrl.toString(), webBaseUrl)
      return
    }

    const auth = await getAuthedWebUser(request)
    if (!auth) {
      redirect(
        request,
        response,
        buildWebAuthRedirect(
          '/cloud/login',
          buildAuthorizeUrlFromRequest({
            state: authRequest.state,
            clientId: authRequest.clientId,
            redirectUri: authRequest.redirectUri,
            baseUrl: authRequest.baseUrl,
            scope: authRequest.scope,
            nonce: authRequest.nonce,
            codeChallenge: authRequest.codeChallenge,
            codeChallengeMethod: authRequest.codeChallengeMethod,
          }),
        ),
        webBaseUrl,
      )
      return
    }

    const authorized = await store.authorizeDesktopAuthRequest({
      state,
      userId: auth.user.id,
    })
    if (!authorized) {
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'Authorization request could not be completed',
      })
      return
    }

    const redirectUrl = new URL(authorized.redirectUri)
    redirectUrl.searchParams.set('code', authorized.authCode)
    redirectUrl.searchParams.set('state', authorized.state)
    redirectUrl.searchParams.set('base_url', authorized.baseUrl)
    redirect(request, response, redirectUrl.toString(), webBaseUrl)
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
      json(request, response, 400, {
        error: 'unsupported_grant_type',
        message: 'Only authorization_code is supported',
      })
      return
    }
    if (!clientId || !redirectUri || !code || !codeVerifier) {
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'clientId, redirectUri, code, and codeVerifier are required',
      })
      return
    }
    if (clientId !== oidcClientId) {
      json(request, response, 401, {
        error: 'invalid_client',
        message: 'Unknown OIDC client',
      })
      return
    }
    if (oidcClientSecret) {
      const presentedSecret = request.headers['x-oidc-client-secret']?.toString().trim() ?? ''
      if (presentedSecret && presentedSecret !== oidcClientSecret) {
        json(request, response, 401, {
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
      json(request, response, 400, {
        error: 'invalid_grant',
        message: 'Invalid or expired authorization code',
      })
      return
    }
    if (!verifyPkceChallenge(codeVerifier, authRequest.codeChallenge)) {
      json(request, response, 400, {
        error: 'invalid_grant',
        message: 'Invalid PKCE verifier',
      })
      return
    }

    const user = await store.getUserById(authRequest.userId)
    if (!user) {
      json(request, response, 400, {
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
    json(request, response, 200, payload)
    return
  }

  if (method === 'GET' && url === '/oidc/userinfo') {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    json(request, response, 200, {
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
    if (!(await requireSubscription(request, auth.user, response))) {
      return
    }
    json(request, response, 200, await buildBootstrapPayload(auth.user))
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
      plans: filterVisiblePlans(plans),
    }
    json(request, response, 200, payload)
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
    redirect(request, response, authorizeUrl.toString(), webBaseUrl)
    return
  }

  if (method === 'POST' && url === '/v1/cloud-instances') {
    json(request, response, 201, { ok: true })
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
      json(request, response, 400, {
        error: 'invalid_grant',
        message: 'Invalid or expired desktop auth request',
      })
      return
    }
    json(request, response, 200, tokenPayload)
    return
  }

  if (method === 'POST' && url === '/v1/projects') {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    if (!(await requireSubscription(request, auth.user, response))) {
      return
    }

    const body = await readJsonBody<CreateCloudProjectRequest>(request)
    const trimmedName = body.name?.trim()
    if (!trimmedName) {
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'Project name is required',
      })
      return
    }
    let project: Awaited<ReturnType<typeof store.createProject>>
    try {
      project = await store.createProject(auth.user, {
        ...body,
        name: trimmedName,
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Unknown organization') {
        json(request, response, 400, {
          error: 'invalid_request',
          message: 'Unknown organization',
        })
        return
      }
      throw error
    }
    const payload: CreateCloudProjectResponse = {
      project,
    }
    json(request, response, 201, payload)
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
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'name and slug are required',
      })
      return
    }
    const plans = await store.listPlans()
    if (body.plan && !plans.some((plan) => plan.id === body.plan)) {
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'Invalid subscription plan',
      })
      return
    }
    const organization = await store.updateOrganization(auth.user, {
      organizationId: body.organizationId,
      name,
      slug,
      plan: body.plan,
    })
    json(request, response, 200, { organization })
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
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'kind, label, and secret are required',
      })
      return
    }
    const result = await store.addOrganizationProvider(auth.user, {
      organizationId: body.organizationId,
      kind: body.kind,
      label,
      secret,
      baseUrl: body.baseUrl ?? null,
      credentialType: body.credentialType ?? null,
      models: body.models ?? null,
      defaultModel: body.defaultModel ?? null,
    })
    const payload: AddOrganizationProviderResponse = {
      provider: result.provider,
      organization: result.organization,
    }
    json(request, response, 201, payload)
    return
  }

  if (method === 'POST' && url === '/v1/organization/active') {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    const body = await readJsonBody<SetActiveOrganizationRequest>(request)
    const organizationId = body.organizationId?.trim() ?? ''
    if (!organizationId) {
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'organizationId is required',
      })
      return
    }
    const activeOrganizationId = await store.setActiveOrganization(auth.user, {
      organizationId,
    })
    if (!activeOrganizationId) {
      json(request, response, 404, {
        error: 'not_found',
        message: 'Organization not found',
      })
      return
    }
    json(request, response, 200, { ok: true, activeOrganizationId })
    return
  }

  if (method === 'POST' && url === '/v1/organization/invites') {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    const body = await readJsonBody<CreateOrganizationInviteRequest>(request)
    const organizationId = body.organizationId?.trim() ?? ''
    const email = body.email?.trim() ?? ''
    if (!organizationId || !email) {
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'organizationId and email are required',
      })
      return
    }
    const created = await store.createOrganizationInvite(auth.user, {
      organizationId,
      email,
    })
    if (!created) {
      json(request, response, 403, {
        error: 'forbidden',
        message: 'Invite creation not allowed',
      })
      return
    }
    const inviteUrl = new URL('/cloud/accept-invite', publicBaseUrl)
    inviteUrl.searchParams.set('token', created.token)
    void sendMail({
      ...buildOrganizationInviteEmail({
        inviteUrl: inviteUrl.toString(),
        organizationName: created.organization.name,
        inviterName: auth.user.displayName,
      }),
      to: created.email,
    }).catch((error) => {
      console.error('[cloud-api] organization invite email delivery failed', error)
    })
    json(request, response, 201, { ok: true } satisfies CreateOrganizationInviteResponse)
    return
  }

  if (method === 'POST' && url === '/v1/organization/invites/accept') {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    const body = await readJsonBody<AcceptOrganizationInviteRequest>(request)
    const token = body.token?.trim() ?? ''
    if (!token) {
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'token is required',
      })
      return
    }
    const organization = await store.acceptOrganizationInvite(auth.user, { token })
    if (!organization) {
      json(request, response, 400, {
        error: 'invalid_token',
        message: 'Invalid or expired organization invite',
      })
      return
    }
    json(request, response, 200, { ok: true, organization })
    return
  }

  if (method === 'POST' && url === '/v1/conversations') {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    if (!(await requireSubscription(request, auth.user, response))) {
      return
    }

    const body = await readJsonBody<CreateCloudConversationRequest>(request)
    const conversation = await store.createConversation(auth.user, body)
    if (!conversation) {
      json(request, response, 404, {
        error: 'not_found',
        message: 'Project not found',
      })
      return
    }

    const payload: CreateCloudConversationResponse = {
      conversation,
    }
    json(request, response, 201, payload)
    return
  }

  if (method === 'GET' && url.match(/^\/v1\/conversations\/[^/]+\/messages$/)) {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    if (!(await requireSubscription(request, auth.user, response))) {
      return
    }

    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const conversationId = parsed.pathname.split('/').filter(Boolean)[2] ?? ''
    const messages = await store.getConversationMessages(auth.user, conversationId)
    if (messages === null) {
      json(request, response, 404, {
        error: 'not_found',
        message: 'Conversation not found',
      })
      return
    }

    const payload: GetCloudConversationMessagesResponse = {
      conversationId,
      messages,
    }
    json(request, response, 200, payload)
    return
  }

  if (method === 'POST' && url.match(/^\/v1\/conversations\/[^/]+\/messages$/)) {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    if (!(await requireSubscription(request, auth.user, response))) {
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
      json(request, response, 404, {
        error: 'not_found',
        message: 'Conversation not found',
      })
      return
    }

    const payload: GetCloudConversationMessagesResponse = {
      conversationId,
      messages,
    }
    json(request, response, 200, payload)
    return
  }

  if (method === 'GET' && url === '/v1/memory') {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const items = await store.listMemory(auth.user, {
      scope: (parsed.searchParams.get('scope')?.trim() as MemoryListRequest['scope']) ?? 'all',
      projectId: parsed.searchParams.get('projectId')?.trim() || null,
      kind: parsed.searchParams.get('kind')?.trim() as MemoryListRequest['kind'],
      includeArchived: parsed.searchParams.get('includeArchived') === 'true',
      limit: Number.parseInt(parsed.searchParams.get('limit') ?? '50', 10),
    })
    json(request, response, 200, { items })
    return
  }

  if (method === 'GET' && url.startsWith('/v1/memory/search')) {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const query = parsed.searchParams.get('query')?.trim() ?? ''
    if (!query) {
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'query is required',
      })
      return
    }
    const items = await store.searchMemory(auth.user, {
      query,
      scope: (parsed.searchParams.get('scope')?.trim() as MemorySearchRequest['scope']) ?? 'all',
      projectId: parsed.searchParams.get('projectId')?.trim() || null,
      kind: parsed.searchParams.get('kind')?.trim() as MemorySearchRequest['kind'],
      includeArchived: parsed.searchParams.get('includeArchived') === 'true',
      limit: Number.parseInt(parsed.searchParams.get('limit') ?? '10', 10),
      tags: parsed.searchParams.getAll('tag'),
    })
    json(request, response, 200, { items })
    return
  }

  if (method === 'GET' && url.startsWith('/v1/memory/stats')) {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const payload = await store.getMemoryStats(auth.user, {
      scope: (parsed.searchParams.get('scope')?.trim() as MemoryListRequest['scope']) ?? 'all',
      projectId: parsed.searchParams.get('projectId')?.trim() || null,
      kind: parsed.searchParams.get('kind')?.trim() as MemoryListRequest['kind'],
      includeArchived: parsed.searchParams.get('includeArchived') === 'true',
    })
    json(request, response, 200, payload)
    return
  }

  if (method === 'POST' && url === '/v1/memory') {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    const body = await readJsonBody<MemoryUpsertRequest>(request)
    const item = await store.upsertMemory(auth.user, body)
    if (!item) {
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'Unable to store memory',
      })
      return
    }
    json(request, response, 201, { item })
    return
  }

  if (method === 'GET' && url.match(/^\/v1\/memory\/[^/]+$/)) {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const memoryId = parsed.pathname.split('/').filter(Boolean)[2] ?? ''
    const item = await store.getMemory(auth.user, memoryId)
    if (!item) {
      json(request, response, 404, {
        error: 'not_found',
        message: 'Memory not found',
      })
      return
    }
    json(request, response, 200, { item })
    return
  }

  if (method === 'PATCH' && url.match(/^\/v1\/memory\/[^/]+$/)) {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const memoryId = parsed.pathname.split('/').filter(Boolean)[2] ?? ''
    const body = await readJsonBody<MemoryUpdateRequest>(request)
    const item = await store.updateMemory(auth.user, { ...body, id: memoryId })
    if (!item) {
      json(request, response, 404, {
        error: 'not_found',
        message: 'Memory not found',
      })
      return
    }
    json(request, response, 200, { item })
    return
  }

  if (method === 'DELETE' && url.match(/^\/v1\/memory\/[^/]+$/)) {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return
    }
    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const memoryId = parsed.pathname.split('/').filter(Boolean)[2] ?? ''
    const deleted = await store.deleteMemory(auth.user, memoryId)
    if (!deleted) {
      json(request, response, 404, {
        error: 'not_found',
        message: 'Memory not found',
      })
      return
    }
    json(request, response, 200, { ok: true })
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
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'accessToken and cloudInstanceId are required',
      })
      return
    }
    const grant = await store.authorizeAccess(body)
    if (!grant) {
      json(request, response, 404, {
        error: 'not_found',
        message: 'Cloud access grant not found',
      })
      return
    }
    json(request, response, 200, grant satisfies CloudRuntimeAccessGrant)
    return
  }

  if (method === 'POST' && url === '/v1/internal/memory/upsert') {
    if (!requireInternalService(request, response)) {
      return
    }
    const body = await readJsonBody<{
      organizationId: string
      userId: string
      input: MemoryUpsertRequest
    }>(request)
    if (!body.organizationId?.trim() || !body.userId?.trim() || !body.input) {
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'organizationId, userId, and input are required',
      })
      return
    }
    const item = await store.internalUpsertMemory({
      organizationId: body.organizationId.trim(),
      userId: body.userId.trim(),
      input: body.input,
    })
    if (!item) {
      json(request, response, 404, {
        error: 'not_found',
        message: 'Unable to upsert memory',
      })
      return
    }
    json(request, response, 200, { item })
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
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'accessToken and cloudInstanceId are required',
      })
      return
    }
    const grant = await store.authorizeAccess(body)
    if (!grant) {
      json(request, response, 404, {
        error: 'not_found',
        message: 'Cloud access grant not found',
      })
      return
    }
    json(request, response, 200, {
      userId: grant.user.id,
      cloudInstanceId: grant.cloudInstance.id,
      organizationId: grant.organization.id,
    })
    return
  }

  json(request, response, 404, {
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
    json(request, response, statusCode, {
      error: statusCode >= 500 ? 'internal_error' : 'invalid_request',
      message:
        statusCode >= 500
          ? 'An unexpected server error occurred'
          : error instanceof Error
            ? error.message
            : String(error),
    })
  })
})

void store.init()
  .then(() => {
    isReady = true
    initFailed = false
  })
  .catch((error) => {
    initFailed = true
    isReady = false
    console.error('[cloud-api] failed to initialize store', error)
    process.exitCode = 1
    process.exit(1)
  })

server.listen(port, '0.0.0.0', () => {
  console.log(`cloud-api listening on :${port}`)
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
