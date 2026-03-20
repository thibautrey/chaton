import crypto from 'node:crypto'
import type {
  CloudBootstrapResponse,
  CloudDesktopAuthExchangeResponse,
  CloudWebSessionResponse,
} from '../../packages/protocol/index.js'
import type {
  CloudRuntimeAccessGrant,
  CloudSubscriptionGrantRecord,
  CloudSubscriptionRecord,
  CloudUsageRecord,
  CloudUserRecord,
} from '../../packages/domain/index.js'
import {
  accessTokenLifetimeSeconds,
  idTokenLifetimeSeconds,
  jwkKid,
  jwtSigningKey,
  oidcIssuer,
  publicBaseUrl,
} from './config.ts'
import { createCloudStore, getEffectiveGrant, getEffectivePlanId, type CloudStore, type CloudUserState } from './store.ts'
import { base64UrlEncode } from './security.ts'

export const store: CloudStore = createCloudStore({
  publicBaseUrl,
})

export function createPrivateSigningKey(secret: string): crypto.KeyObject {
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

export function createPublicJwk(key: crypto.KeyObject, kid: string): Record<string, string> {
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
  const publicKey = crypto.createPublicKey(key)
  return {
    ...(publicKey.export({ format: 'jwk' }) as Record<string, string>),
    alg: 'RS256',
    use: 'sig',
    kid,
  }
}

export const signingKeyObject = createPrivateSigningKey(jwtSigningKey)
export const signingPublicJwk = createPublicJwk(signingKeyObject, jwkKid)

export function signJwt(payload: Record<string, unknown>, options?: { expiresInSeconds?: number }): string {
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

export function verifyPkceChallenge(codeVerifier: string, expectedChallenge: string): boolean {
  const digest = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
  return digest === expectedChallenge
}

export async function issueCloudSession(user: CloudUserState): Promise<{
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

export async function issueCloudWebSessionResponse(user: CloudUserState): Promise<CloudWebSessionResponse> {
  const session = await issueCloudSession(user)
  const plans = await store.listPlans()
  return {
    user: toCloudUserRecord(user, plans),
    session,
  }
}

export async function issueIdToken(params: {
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

export function toCloudUserRecord(
  user: CloudUserState,
  plans: CloudSubscriptionRecord[],
): CloudUserRecord {
  const subscription =
    plans.find((plan) => plan.id === getEffectivePlanId(user)) ??
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
    complimentaryGrant: getEffectiveGrant(user, plans) satisfies CloudSubscriptionGrantRecord | null,
  }
}

export async function buildUsage(user: CloudUserState): Promise<CloudUsageRecord> {
  const plans = await store.listPlans()
  const subscription =
    plans.find((plan) => plan.id === getEffectivePlanId(user)) ??
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

export async function buildBootstrapPayload(user: CloudUserState): Promise<CloudBootstrapResponse> {
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
