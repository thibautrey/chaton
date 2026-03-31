import type http from 'node:http'
import type {
  CloudAccountResponse,
  CloudAdminGrantSubscriptionRequest,
  CloudAdminListUsersResponse,
  CloudAdminUpdatePlanRequest,
  CloudAdminUpdateUserRequest,
} from '../../packages/protocol/index.js'
import type { CloudSubscriptionPlan, CloudSubscriptionRecord } from '../../packages/domain/index.js'
import { buildUsage, store, toCloudUserRecord } from './context.js'
import { requireAdmin, requireAuthedUser } from './guards.js'
import { json, readJsonBody } from './http.js'
import { port } from './config.js'

export async function handleAdminRoute(
  method: string,
  url: string,
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<boolean> {
  if (method === 'GET' && url === '/v1/admin/users') {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return true
    }
    if (!requireAdmin(request, auth.user, response)) {
      return true
    }
    const plans = await store.listPlans()
    const payload: CloudAdminListUsersResponse = {
      users: (await store.listUsers()).map((user) => toCloudUserRecord(user, plans)),
      plans,
    }
    json(request, response, 200, payload)
    return true
  }

  if (method === 'PATCH' && url.startsWith('/v1/admin/plans/')) {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return true
    }
    if (!requireAdmin(request, auth.user, response)) {
      return true
    }

    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const planId = parsed.pathname.split('/').filter(Boolean)[3] as CloudSubscriptionPlan | undefined
    const plans = await store.listPlans()
    const target = planId ? plans.find((plan) => plan.id === planId) ?? null : null
    if (!target || !planId) {
      json(request, response, 404, {
        error: 'not_found',
        message: 'Plan not found',
      })
      return true
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
      isHidden: body.isHidden === true ? true : target.isHidden === true,
    }
    await store.savePlan(next)

    const refreshedPlans = await store.listPlans()
    const payload: CloudAdminListUsersResponse = {
      users: (await store.listUsers()).map((user) => toCloudUserRecord(user, refreshedPlans)),
      plans: refreshedPlans,
    }
    json(request, response, 200, payload)
    return true
  }

  if (method === 'PATCH' && url.startsWith('/v1/admin/users/')) {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return true
    }
    if (!requireAdmin(request, auth.user, response)) {
      return true
    }

    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const userId = parsed.pathname.split('/').filter(Boolean)[3] ?? ''
    const body = await readJsonBody<CloudAdminUpdateUserRequest>(request)
    const plans = await store.listPlans()
    if (body.subscriptionPlan && !plans.some((plan) => plan.id === body.subscriptionPlan)) {
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'Invalid subscription plan',
      })
      return true
    }

    const updated = await store.updateUser(userId, {
      subscriptionPlan: body.subscriptionPlan,
      isAdmin: body.isAdmin,
    })
    if (!updated) {
      json(request, response, 404, {
        error: 'not_found',
        message: 'User not found',
      })
      return true
    }

    const refreshedPlans = await store.listPlans()
    const workspace = await store.getWorkspaceState(updated)
    const payload: CloudAccountResponse = {
      user: toCloudUserRecord(updated, refreshedPlans),
      usage: await buildUsage(updated),
      plans: refreshedPlans,
      organizations: workspace.organizations,
      activeOrganizationId: workspace.activeOrganizationId,
    }
    json(request, response, 200, payload)
    return true
  }

  if (method === 'POST' && url.startsWith('/v1/admin/users/') && url.endsWith('/grant-subscription')) {
    const auth = await requireAuthedUser(request, response)
    if (!auth) {
      return true
    }
    if (!requireAdmin(request, auth.user, response)) {
      return true
    }

    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const parts = parsed.pathname.split('/').filter(Boolean)
    const userId = parts[3] ?? ''
    const body = await readJsonBody<CloudAdminGrantSubscriptionRequest>(request)
    const plans = await store.listPlans()
    if (!plans.some((plan) => plan.id === body.planId)) {
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'Invalid subscription plan',
      })
      return true
    }
    if (
      body.durationDays != null &&
      (!Number.isFinite(body.durationDays) || Math.floor(body.durationDays) < 1)
    ) {
      json(request, response, 400, {
        error: 'invalid_request',
        message: 'durationDays must be at least 1 when provided',
      })
      return true
    }
    const updated = await store.grantComplimentarySubscription({
      userId,
      planId: body.planId,
      durationDays:
        typeof body.durationDays === 'number'
          ? Math.floor(body.durationDays)
          : null,
    })
    if (!updated) {
      json(request, response, 404, {
        error: 'not_found',
        message: 'User not found',
      })
      return true
    }
    const refreshedPlans = await store.listPlans()
    const workspace = await store.getWorkspaceState(updated)
    const payload: CloudAccountResponse = {
      user: toCloudUserRecord(updated, refreshedPlans),
      usage: await buildUsage(updated),
      plans: refreshedPlans,
      organizations: workspace.organizations,
      activeOrganizationId: workspace.activeOrganizationId,
    }
    json(request, response, 200, payload)
    return true
  }

  return false
}
