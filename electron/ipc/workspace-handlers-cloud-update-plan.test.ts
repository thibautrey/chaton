import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `cloud:updatePlan` IPC handler.
 *
 * Branching outcomes:
 *   1. invalid_plan_id  — planId is not a valid ("plus" | "pro" | "max")
 *   2. invalid_updates  — updates is not a plain object or has wrong field types
 *   3. not_connected   — no authenticated cloud instance in the DB
 *   4. unknown         — session expired or API error
 *   5. forbidden       — API returned 403
 *   6. ok              — plan updated, refreshed account returned
 *
 * The handler is replicated inline so tests run without the full module graph.
 * Mirrors electron/ipc/workspace-handlers.ts "cloud:updatePlan" (~lines 1547–1591).
 */

type UpdatePlanResult =
  | { ok: true; account: { id: string; email: string; organizations: string[] } | null; users: Array<{ id: string; email: string }> }
  | { ok: false; reason: 'invalid_plan_id' | 'invalid_updates' | 'not_connected' | 'forbidden' | 'unknown'; message?: string }

interface Dependencies {
  listCloudInstances: () => Array<{ id: string; access_token: string | null; base_url: string }>
  findCloudInstanceById: (db: unknown, id: string) => { id: string; access_token: string | null; base_url: string } | undefined
  ensureFreshCloudSession: (id: string) => Promise<boolean>
  getPrimaryCloudAccount: () => Promise<{
    account: { id: string; email: string; organizations: string[] } | null
    users: Array<{ id: string; email: string }>
    reason?: string
  }>
  fetch: typeof globalThis.fetch
}

// Inline handler — mirrors workspace-handlers.ts "cloud:updatePlan"
async function handleCloudUpdatePlan(
  deps: Dependencies,
  planId: unknown,
  updates: unknown,
): Promise<UpdatePlanResult> {
  // Validate planId: must be one of the allowed plan identifiers.
  if (
    typeof planId !== 'string' ||
    !(['plus', 'pro', 'max'] as readonly string[]).includes(planId)
  ) {
    return { ok: false as const, reason: 'invalid_plan_id' as const }
  }

  // Validate updates: must be a plain object (not null, array, or primitive).
  if (
    updates !== undefined &&
    updates !== null &&
    (typeof updates !== 'object' || Array.isArray(updates))
  ) {
    return { ok: false as const, reason: 'invalid_updates' as const }
  }

  const typedUpdates = (updates ?? {}) as {
    label?: unknown
    parallelSessionsLimit?: unknown
    isDefault?: unknown
  }

  // Validate updates fields: all optional, each must be the correct type if present.
  if (
    typedUpdates.label !== undefined &&
    typeof typedUpdates.label !== 'string'
  ) {
    return { ok: false as const, reason: 'invalid_updates' as const }
  }
  if (
    typedUpdates.parallelSessionsLimit !== undefined &&
    typeof typedUpdates.parallelSessionsLimit !== 'number'
  ) {
    return { ok: false as const, reason: 'invalid_updates' as const }
  }
  if (
    typedUpdates.isDefault !== undefined &&
    typeof typedUpdates.isDefault !== 'boolean'
  ) {
    return { ok: false as const, reason: 'invalid_updates' as const }
  }

  const instance = deps.listCloudInstances().find((entry) => Boolean(entry.access_token))
  if (!instance?.access_token) {
    return { ok: false as const, reason: 'not_connected' as const }
  }

  if (!(await deps.ensureFreshCloudSession(instance.id))) {
    return { ok: false as const, reason: 'unknown' as const, message: 'Cloud session expired. Please reconnect.' }
  }
  const freshInstance = deps.findCloudInstanceById({}, instance.id) ?? instance

  const response = await deps.fetch(
    new URL(`/v1/admin/plans/${encodeURIComponent(planId)}`, freshInstance.base_url).toString(),
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${freshInstance.access_token}`,
      },
      body: JSON.stringify(updates),
    },
  )

  if (response.status === 403) {
    return { ok: false as const, reason: 'forbidden' as const }
  }
  if (!response.ok) {
    return { ok: false as const, reason: 'unknown' as const, message: await response.text() }
  }

  const refreshed = await deps.getPrimaryCloudAccount()
  return { ok: true as const, account: refreshed.account, users: refreshed.users }
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ACCOUNT = { id: 'acc-1', email: 'admin@example.com', organizations: ['org-1'] }
const USERS = [{ id: 'u-1', email: 'admin@example.com' }]

const fakeFetch = vi.fn<typeof globalThis.fetch>()
const listCloudInstances = vi.fn<Dependencies['listCloudInstances']>()
const findCloudInstanceById = vi.fn<Dependencies['findCloudInstanceById']>()
const ensureFreshCloudSession = vi.fn<Dependencies['ensureFreshCloudSession']>()
const getPrimaryCloudAccount = vi.fn<Dependencies['getPrimaryCloudAccount']>()

const deps: Dependencies = {
  listCloudInstances,
  findCloudInstanceById,
  ensureFreshCloudSession,
  getPrimaryCloudAccount,
  fetch: fakeFetch,
}

beforeEach(() => {
  vi.clearAllMocks()
  listCloudInstances.mockReturnValue([])
})

// ---------------------------------------------------------------------------
// IPC-level planId validation
// ---------------------------------------------------------------------------

describe('cloud:updatePlan — invalid_plan_id', () => {
  it.each([
    { planId: undefined, label: 'undefined' },
    { planId: null, label: 'null' },
    { planId: 42, label: 'number' },
    { planId: true, label: 'boolean' },
    { planId: {}, label: 'object' },
    { planId: [], label: 'array' },
    { planId: 'enterprise', label: 'unknown string' },
    { planId: '', label: 'empty string' },
    { planId: '   ', label: 'whitespace-only string' },
    { planId: 'PLUS', label: 'uppercase plan name' },
    { planId: 'Plus', label: 'mixed case plan name' },
  ])('returns invalid_plan_id for $label planId', async ({ planId }) => {
    const result = await handleCloudUpdatePlan(deps, planId, undefined)
    expect(result).toEqual({ ok: false, reason: 'invalid_plan_id' })
  })

  it('returns invalid_plan_id before any DB call', async () => {
    const result = await handleCloudUpdatePlan(deps, 'unknown', undefined)
    expect(listCloudInstances).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, reason: 'invalid_plan_id' })
  })
})

// ---------------------------------------------------------------------------
// IPC-level updates validation
// ---------------------------------------------------------------------------

describe('cloud:updatePlan — invalid_updates', () => {
  it('returns invalid_updates when updates is a primitive string', async () => {
    const result = await handleCloudUpdatePlan(deps, 'plus', 'string')
    expect(result).toEqual({ ok: false, reason: 'invalid_updates' })
  })

  it('returns invalid_updates when updates is an array', async () => {
    const result = await handleCloudUpdatePlan(deps, 'plus', ['label', 1])
    expect(result).toEqual({ ok: false, reason: 'invalid_updates' })
  })

  it('returns invalid_updates when label is a number', async () => {
    const result = await handleCloudUpdatePlan(deps, 'plus', { label: 123 })
    expect(result).toEqual({ ok: false, reason: 'invalid_updates' })
  })

  it('returns invalid_updates when label is a boolean', async () => {
    const result = await handleCloudUpdatePlan(deps, 'plus', { label: true })
    expect(result).toEqual({ ok: false, reason: 'invalid_updates' })
  })

  it('returns invalid_updates when parallelSessionsLimit is a string', async () => {
    const result = await handleCloudUpdatePlan(deps, 'plus', { parallelSessionsLimit: '5' })
    expect(result).toEqual({ ok: false, reason: 'invalid_updates' })
  })

  it('returns invalid_updates when parallelSessionsLimit is a boolean', async () => {
    const result = await handleCloudUpdatePlan(deps, 'plus', { parallelSessionsLimit: true })
    expect(result).toEqual({ ok: false, reason: 'invalid_updates' })
  })

  it('returns invalid_updates when isDefault is a string', async () => {
    const result = await handleCloudUpdatePlan(deps, 'plus', { isDefault: 'true' })
    expect(result).toEqual({ ok: false, reason: 'invalid_updates' })
  })

  it('returns invalid_updates when isDefault is a number', async () => {
    const result = await handleCloudUpdatePlan(deps, 'plus', { isDefault: 1 })
    expect(result).toEqual({ ok: false, reason: 'invalid_updates' })
  })

  it('returns invalid_updates before any DB call', async () => {
    const result = await handleCloudUpdatePlan(deps, 'plus', { label: 42 })
    expect(listCloudInstances).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, reason: 'invalid_updates' })
  })
})

// ---------------------------------------------------------------------------
// Updates edge cases
// ---------------------------------------------------------------------------

describe('cloud:updatePlan — updates edge cases', () => {
  beforeEach(() => {
    listCloudInstances.mockReturnValue([
      { id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' },
    ])
    ensureFreshCloudSession.mockResolvedValue(true)
    findCloudInstanceById.mockReturnValue({
      id: 'inst-1',
      access_token: 'tok-1',
      base_url: 'https://api.example.com',
    })
    fakeFetch.mockResolvedValue(new Response('{}', { status: 200 }))
    getPrimaryCloudAccount.mockResolvedValue({ account: ACCOUNT, users: USERS })
  })

  it('accepts undefined updates (empty object)', async () => {
    const result = await handleCloudUpdatePlan(deps, 'plus', undefined)
    expect(result.ok).toBe(true)
  })

  it('accepts null updates (treated as empty object)', async () => {
    const result = await handleCloudUpdatePlan(deps, 'plus', null)
    expect(result.ok).toBe(true)
  })

  it('accepts empty object updates', async () => {
    const result = await handleCloudUpdatePlan(deps, 'plus', {})
    expect(result.ok).toBe(true)
  })

  it('accepts updates with valid label string', async () => {
    const result = await handleCloudUpdatePlan(deps, 'plus', { label: 'My Plan' })
    expect(result.ok).toBe(true)
  })

  it('accepts updates with valid parallelSessionsLimit number', async () => {
    const result = await handleCloudUpdatePlan(deps, 'plus', { parallelSessionsLimit: 5 })
    expect(result.ok).toBe(true)
  })

  it('accepts updates with valid isDefault boolean', async () => {
    const result = await handleCloudUpdatePlan(deps, 'plus', { isDefault: true })
    expect(result.ok).toBe(true)
  })

  it('accepts updates with all valid fields combined', async () => {
    const result = await handleCloudUpdatePlan(deps, 'plus', {
      label: 'Pro Plan',
      parallelSessionsLimit: 10,
      isDefault: false,
    })
    expect(result.ok).toBe(true)
  })

  it('sends correct PATCH body to the API', async () => {
    await handleCloudUpdatePlan(deps, 'pro', { label: 'Max Plan', isDefault: true })
    const [, init] = fakeFetch.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ label: 'Max Plan', isDefault: true })
  })
})

// ---------------------------------------------------------------------------
// not_connected
// ---------------------------------------------------------------------------

describe('cloud:updatePlan — not_connected', () => {
  it('returns not_connected when listCloudInstances returns empty array', async () => {
    const result = await handleCloudUpdatePlan(deps, 'plus', undefined)
    expect(result).toEqual({ ok: false, reason: 'not_connected' })
  })

  it('returns not_connected when instance has no access_token', async () => {
    listCloudInstances.mockReturnValue([
      { id: 'inst-1', access_token: null, base_url: 'https://api.example.com' },
    ])
    const result = await handleCloudUpdatePlan(deps, 'plus', undefined)
    expect(result).toEqual({ ok: false, reason: 'not_connected' })
  })
})

// ---------------------------------------------------------------------------
// unknown (session expired)
// ---------------------------------------------------------------------------

describe('cloud:updatePlan — unknown (session)', () => {
  it('returns unknown with message when ensureFreshCloudSession returns false', async () => {
    listCloudInstances.mockReturnValue([
      { id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' },
    ])
    ensureFreshCloudSession.mockResolvedValue(false)
    const result = await handleCloudUpdatePlan(deps, 'plus', undefined)
    expect(result).toEqual({
      ok: false,
      reason: 'unknown',
      message: 'Cloud session expired. Please reconnect.',
    })
  })
})

// ---------------------------------------------------------------------------
// forbidden
// ---------------------------------------------------------------------------

describe('cloud:updatePlan — forbidden', () => {
  it('returns forbidden when API responds with 403', async () => {
    listCloudInstances.mockReturnValue([
      { id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' },
    ])
    ensureFreshCloudSession.mockResolvedValue(true)
    findCloudInstanceById.mockReturnValue({
      id: 'inst-1',
      access_token: 'tok-1',
      base_url: 'https://api.example.com',
    })
    fakeFetch.mockResolvedValue(new Response('', { status: 403 }))
    const result = await handleCloudUpdatePlan(deps, 'plus', undefined)
    expect(result).toEqual({ ok: false, reason: 'forbidden' })
  })
})

// ---------------------------------------------------------------------------
// unknown (API error)
// ---------------------------------------------------------------------------

describe('cloud:updatePlan — unknown (API error)', () => {
  it('returns unknown with message when API responds with 500', async () => {
    listCloudInstances.mockReturnValue([
      { id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' },
    ])
    ensureFreshCloudSession.mockResolvedValue(true)
    findCloudInstanceById.mockReturnValue({
      id: 'inst-1',
      access_token: 'tok-1',
      base_url: 'https://api.example.com',
    })
    fakeFetch.mockResolvedValue(new Response('Internal Server Error', { status: 500 }))
    const result = await handleCloudUpdatePlan(deps, 'plus', undefined)
    expect(result).toEqual({ ok: false, reason: 'unknown', message: 'Internal Server Error' })
  })
})

// ---------------------------------------------------------------------------
// ok
// ---------------------------------------------------------------------------

describe('cloud:updatePlan — ok', () => {
  beforeEach(() => {
    listCloudInstances.mockReturnValue([
      { id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' },
    ])
    ensureFreshCloudSession.mockResolvedValue(true)
    findCloudInstanceById.mockReturnValue({
      id: 'inst-1',
      access_token: 'tok-1',
      base_url: 'https://api.example.com',
    })
    fakeFetch.mockResolvedValue(new Response('{}', { status: 200 }))
    getPrimaryCloudAccount.mockResolvedValue({ account: ACCOUNT, users: USERS })
  })

  it('returns ok with refreshed account when PATCH succeeds', async () => {
    const result = await handleCloudUpdatePlan(deps, 'plus', { label: 'Pro' })
    expect(result).toEqual({ ok: true, account: ACCOUNT, users: USERS })
  })

  it.each(['plus', 'pro', 'max'] as const)(
    'accepts valid planId: %s',
    async (plan) => {
      const result = await handleCloudUpdatePlan(deps, plan, undefined)
      expect(result.ok).toBe(true)
    },
  )

  it('uses the correct URL path for the plan', async () => {
    await handleCloudUpdatePlan(deps, 'max', undefined)
    const [url] = fakeFetch.mock.calls[0] as [string]
    expect(url).toContain('/v1/admin/plans/max')
  })

  it('calls getPrimaryCloudAccount after successful PATCH', async () => {
    await handleCloudUpdatePlan(deps, 'plus', undefined)
    expect(getPrimaryCloudAccount).toHaveBeenCalledTimes(1)
  })

  it('sends authorization header with the instance token', async () => {
    await handleCloudUpdatePlan(deps, 'pro', undefined)
    const [, init] = fakeFetch.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['authorization']).toBe('Bearer tok-1')
  })
})
