import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `cloud:grantSubscription` IPC handler.
 *
 * Branching outcomes:
 *   1. invalid_user_id  — userId is not a non-empty string
 *   2. invalid_grant    — grant parameter is malformed or planId is not valid
 *   3. not_connected   — no authenticated cloud instance in the DB
 *   4. unknown         — session expired or API error
 *   5. forbidden       — API returned 403
 *   6. ok              — subscription granted, refreshed account returned
 *
 * The handler is replicated inline so tests run without the full module graph.
 * Mirrors electron/ipc/workspace-handlers.ts "cloud:grantSubscription" (~lines 1413–1485).
 */

type GrantSubscriptionResult =
  | { ok: true; account: { id: string; email: string; organizations: string[] } | null; users: Array<{ id: string; email: string }> }
  | { ok: false; reason: 'invalid_user_id' | 'invalid_grant' | 'not_connected' | 'forbidden' | 'unknown'; message?: string }

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

// Inline handler — mirrors workspace-handlers.ts "cloud:grantSubscription"
async function handleCloudGrantSubscription(
  deps: Dependencies,
  userId: string,
  grant: Record<string, unknown>,
): Promise<GrantSubscriptionResult> {
  if (typeof userId !== 'string' || !userId.trim()) {
    return { ok: false as const, reason: 'invalid_user_id' as const }
  }
  const trimmedUserId = userId.trim()

  if (!grant || typeof grant !== 'object' || Array.isArray(grant)) {
    return { ok: false as const, reason: 'invalid_grant' as const }
  }

  const validPlans = ['plus', 'pro', 'max'] as const
  if (!validPlans.includes(((grant.planId as string) ?? '') as typeof validPlans[number])) {
    return { ok: false as const, reason: 'invalid_grant' as const }
  }

  if (grant.durationDays !== undefined && grant.durationDays !== null && typeof grant.durationDays !== 'number') {
    return { ok: false as const, reason: 'invalid_grant' as const }
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
    new URL(`/v1/admin/users/${encodeURIComponent(trimmedUserId)}/grant-subscription`, freshInstance.base_url).toString(),
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${freshInstance.access_token}`,
      },
      body: JSON.stringify(grant),
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
// Test cases
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

describe('cloud:grantSubscription — invalid_user_id', () => {
  it.each([
    { userId: '', label: 'empty string' },
    { userId: '   ', label: 'whitespace-only string' },
    { userId: 42 as unknown as string, label: 'non-string (number)' },
    { userId: null as unknown as string, label: 'non-string (null)' },
    { userId: undefined as unknown as string, label: 'non-string (undefined)' },
  ])('returns invalid_user_id for $label', async ({ userId }) => {
    const result = await handleCloudGrantSubscription(deps, userId, { planId: 'plus' })
    expect(result).toEqual({ ok: false, reason: 'invalid_user_id' })
  })
})

describe('cloud:grantSubscription — invalid_grant', () => {
  it('returns invalid_grant when grant is null', async () => {
    const result = await handleCloudGrantSubscription(deps, 'u-1', null as unknown as Record<string, unknown>)
    expect(result).toEqual({ ok: false, reason: 'invalid_grant' })
  })

  it('returns invalid_grant when grant is an array', async () => {
    const result = await handleCloudGrantSubscription(deps, 'u-1', [] as unknown as Record<string, unknown>)
    expect(result).toEqual({ ok: false, reason: 'invalid_grant' })
  })

  it('returns invalid_grant when grant is a primitive', async () => {
    const result = await handleCloudGrantSubscription(deps, 'u-1', 'plus' as unknown as Record<string, unknown>)
    expect(result).toEqual({ ok: false, reason: 'invalid_grant' })
  })

  it('returns invalid_grant when planId is not a valid plan', async () => {
    const result = await handleCloudGrantSubscription(deps, 'u-1', { planId: 'enterprise' } as Record<string, unknown>)
    expect(result).toEqual({ ok: false, reason: 'invalid_grant' })
  })

  it('returns invalid_grant when planId is a number', async () => {
    const result = await handleCloudGrantSubscription(deps, 'u-1', { planId: 1 } as Record<string, unknown>)
    expect(result).toEqual({ ok: false, reason: 'invalid_grant' })
  })

  it('returns invalid_grant when durationDays is a string', async () => {
    const result = await handleCloudGrantSubscription(deps, 'u-1', { planId: 'plus', durationDays: '30' } as Record<string, unknown>)
    expect(result).toEqual({ ok: false, reason: 'invalid_grant' })
  })

  it('returns invalid_grant when durationDays is an object', async () => {
    const result = await handleCloudGrantSubscription(deps, 'u-1', { planId: 'plus', durationDays: { n: 30 } } as Record<string, unknown>)
    expect(result).toEqual({ ok: false, reason: 'invalid_grant' })
  })
})

describe('cloud:grantSubscription — durationDays edge cases', () => {
  it('accepts when durationDays is undefined', async () => {
    listCloudInstances.mockReturnValue([{ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' }])
    ensureFreshCloudSession.mockResolvedValue(true)
    findCloudInstanceById.mockReturnValue({ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' })
    fakeFetch.mockResolvedValue(new Response('{}', { status: 200 }))
    getPrimaryCloudAccount.mockResolvedValue({ account: ACCOUNT, users: USERS })

    const result = await handleCloudGrantSubscription(deps, 'u-1', { planId: 'plus' })
    expect(result.ok).toBe(true)
  })

  it('accepts when durationDays is null', async () => {
    listCloudInstances.mockReturnValue([{ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' }])
    ensureFreshCloudSession.mockResolvedValue(true)
    findCloudInstanceById.mockReturnValue({ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' })
    fakeFetch.mockResolvedValue(new Response('{}', { status: 200 }))
    getPrimaryCloudAccount.mockResolvedValue({ account: ACCOUNT, users: USERS })

    const result = await handleCloudGrantSubscription(deps, 'u-1', { planId: 'pro', durationDays: null })
    expect(result.ok).toBe(true)
  })

  it('accepts when durationDays is a valid number', async () => {
    listCloudInstances.mockReturnValue([{ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' }])
    ensureFreshCloudSession.mockResolvedValue(true)
    findCloudInstanceById.mockReturnValue({ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' })
    fakeFetch.mockResolvedValue(new Response('{}', { status: 200 }))
    getPrimaryCloudAccount.mockResolvedValue({ account: ACCOUNT, users: USERS })

    const result = await handleCloudGrantSubscription(deps, 'u-1', { planId: 'max', durationDays: 365 })
    expect(result.ok).toBe(true)
  })
})

describe('cloud:grantSubscription — not_connected', () => {
  it('returns not_connected when no authenticated instance exists', async () => {
    listCloudInstances.mockReturnValue([{ id: 'inst-1', access_token: null, base_url: 'https://api.example.com' }])
    const result = await handleCloudGrantSubscription(deps, 'u-1', { planId: 'plus' })
    expect(result).toEqual({ ok: false, reason: 'not_connected' })
  })

  it('returns not_connected when listCloudInstances returns empty array', async () => {
    const result = await handleCloudGrantSubscription(deps, 'u-1', { planId: 'plus' })
    expect(result).toEqual({ ok: false, reason: 'not_connected' })
  })
})

describe('cloud:grantSubscription — unknown (session)', () => {
  it('returns unknown with message when ensureFreshCloudSession returns false', async () => {
    listCloudInstances.mockReturnValue([{ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' }])
    ensureFreshCloudSession.mockResolvedValue(false)
    const result = await handleCloudGrantSubscription(deps, 'u-1', { planId: 'plus' })
    expect(result).toEqual({ ok: false, reason: 'unknown', message: 'Cloud session expired. Please reconnect.' })
  })
})

describe('cloud:grantSubscription — forbidden', () => {
  it('returns forbidden when API responds with 403', async () => {
    listCloudInstances.mockReturnValue([{ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' }])
    ensureFreshCloudSession.mockResolvedValue(true)
    findCloudInstanceById.mockReturnValue({ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' })
    fakeFetch.mockResolvedValue(new Response('', { status: 403 }))

    const result = await handleCloudGrantSubscription(deps, 'u-1', { planId: 'plus' })
    expect(result).toEqual({ ok: false, reason: 'forbidden' })
  })
})

describe('cloud:grantSubscription — unknown (API error)', () => {
  it('returns unknown with message when API responds with 500', async () => {
    listCloudInstances.mockReturnValue([{ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' }])
    ensureFreshCloudSession.mockResolvedValue(true)
    findCloudInstanceById.mockReturnValue({ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' })
    fakeFetch.mockResolvedValue(new Response('Internal Server Error', { status: 500 }))

    const result = await handleCloudGrantSubscription(deps, 'u-1', { planId: 'plus' })
    expect(result).toEqual({ ok: false, reason: 'unknown', message: 'Internal Server Error' })
  })
})

describe('cloud:grantSubscription — ok', () => {
  it('returns ok with refreshed account when POST succeeds', async () => {
    listCloudInstances.mockReturnValue([{ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' }])
    ensureFreshCloudSession.mockResolvedValue(true)
    findCloudInstanceById.mockReturnValue({ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' })
    fakeFetch.mockResolvedValue(new Response('{}', { status: 200 }))
    getPrimaryCloudAccount.mockResolvedValue({ account: ACCOUNT, users: USERS })

    const result = await handleCloudGrantSubscription(deps, 'u-1', { planId: 'plus', durationDays: 30 })
    expect(result).toEqual({ ok: true, account: ACCOUNT, users: USERS })
  })

  it('trims whitespace from userId before using in URL', async () => {
    listCloudInstances.mockReturnValue([{ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' }])
    ensureFreshCloudSession.mockResolvedValue(true)
    findCloudInstanceById.mockReturnValue({ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' })
    fakeFetch.mockResolvedValue(new Response('{}', { status: 200 }))
    getPrimaryCloudAccount.mockResolvedValue({ account: ACCOUNT, users: USERS })

    await handleCloudGrantSubscription(deps, '  u-1  ', { planId: 'pro' })
    const calledUrl = fakeFetch.mock.calls[0]?.[0] as string
    expect(calledUrl).toContain('/v1/admin/users/u-1/grant-subscription')
  })

  it.each(['plus', 'pro', 'max'] as const)('accepts valid planId: %s', async (plan) => {
    listCloudInstances.mockReturnValue([{ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' }])
    ensureFreshCloudSession.mockResolvedValue(true)
    findCloudInstanceById.mockReturnValue({ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' })
    fakeFetch.mockResolvedValue(new Response('{}', { status: 200 }))
    getPrimaryCloudAccount.mockResolvedValue({ account: ACCOUNT, users: USERS })

    const result = await handleCloudGrantSubscription(deps, 'u-1', { planId: plan })
    expect(result.ok).toBe(true)
  })
})
