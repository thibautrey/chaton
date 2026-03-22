import type http from 'node:http'
import { internalServiceToken } from './config.ts'
import { store, buildUsage } from './context.ts'
import { getEffectivePlanId, type CloudUserState } from './store.ts'
import { getBearerToken, json } from './http.ts'

export async function requireAuthedUser(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<{ user: CloudUserState; accessToken: string } | null> {
  const accessToken = getBearerToken(request)
  if (!accessToken) {
    json(request, response, 401, {
      error: 'unauthorized',
      message: 'Missing bearer token',
    })
    return null
  }
  const user = await store.getUserByAccessToken(accessToken)
  if (!user) {
    json(request, response, 401, {
      error: 'unauthorized',
      message: 'Unknown bearer token',
    })
    return null
  }
  return { user, accessToken }
}

export function requireInternalService(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): boolean {
  if (!internalServiceToken) {
    json(request, response, 500, {
      error: 'misconfigured',
      message: 'Missing internal service token',
    })
    return false
  }
  if (getBearerToken(request) !== internalServiceToken) {
    json(request, response, 401, {
      error: 'unauthorized',
      message: 'Internal service token required',
    })
    return false
  }
  return true
}

export async function requireSubscription(
  request: http.IncomingMessage,
  user: CloudUserState,
  response: http.ServerResponse,
): Promise<boolean> {
  if (getEffectivePlanId(user)) {
    return true
  }
  json(request, response, 403, {
    error: 'subscription_required',
    message: 'An active subscription is required to use Chatons Cloud.',
    usage: await buildUsage(user),
  })
  return false
}

export function requireAdmin(
  request: http.IncomingMessage,
  user: CloudUserState,
  response: http.ServerResponse,
): boolean {
  if (user.isAdmin) {
    return true
  }
  json(request, response, 403, {
    error: 'forbidden',
    message: 'Admin access required.',
  })
  return false
}
