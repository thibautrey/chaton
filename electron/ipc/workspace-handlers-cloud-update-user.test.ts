import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `cloud:updateUser` IPC handler.
 *
 * Branching outcomes:
 *   1. invalid_user_id  — userId is not a non-empty string
 *   2. invalid_updates  — updates contains unknown keys or wrong types
 *   3. not_connected   — no authenticated cloud instance in the DB
 *   4. unknown         — session expired or API error
 *   5. forbidden       — API returned 403
 *   6. ok              — user updated, refreshed account returned
 *
 * The handler is replicated inline so tests run without the full module graph.
 * Mirrors electron/ipc/workspace-handlers.ts "cloud:updateUser" (~lines 1340–1410).
 */

type UpdateUserResult =
  | { ok: true; account: { id: string; email: string; organizations: string[] } | null; users: Array<{ id: string; email: string }> }
  | { ok: false; reason: 'invalid_user_id' | 'invalid_updates' | 'not_connected' | 'forbidden' | 'unknown'; message?: string }

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

// Inline handler — mirrors workspace-handlers.ts "cloud:updateUser"
async function handleCloudUpdateUser(
  deps: Dependencies,
  userId: string,
  updates: Record<string, unknown>,
): Promise<UpdateUserResult> {
  if (typeof userId !== 'string' || !userId.trim()) {
    return { ok: false as const, reason: 'invalid_user_id' as const }
  }
  const trimmedUserId = userId.trim()

  const validPlans = ['plus', 'pro', 'max'] as const
  if (updates.subscriptionPlan !== undefined && !validPlans.includes((updates.subscriptionPlan as typeof validPlans[number]) ?? '')) {
    return { ok: false as const, reason: 'invalid_updates' as const }
  }
  if (updates.isAdmin !== undefined && typeof updates.isAdmin !== 'boolean') {
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
    new URL(`/v1/admin/users/${encodeURIComponent(trimmedUserId)}`, freshInstance.base_url).toString(),
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

describe('cloud:updateUser — invalid_user_id', () => {
  it.each([
    { userId: '', label: 'empty string' },
    { userId: '   ', label: 'whitespace-only string' },
    { userId: 42 as unknown as string, label: 'non-string (number)' },
    { userId: null as unknown as string, label: 'non-string (null)' },
    { userId: undefined as unknown as string, label: 'non-string (undefined)' },
    { userId: { id: 'u-1' } as unknown as string, label: 'non-string (object)' },
  ])('returns invalid_user_id for $label', async ({ userId }) => {
    const result = await handleCloudUpdateUser(deps, userId, { isAdmin: true })
    expect(result).toEqual({ ok: false, reason: 'invalid_user_id' })
  })
})

describe('cloud:updateUser — invalid_updates', () => {
  it('returns invalid_updates when subscriptionPlan is not a valid plan', async () => {
    const result = await handleCloudUpdateUser(deps, 'u-1', {
      subscriptionPlan: 'enterprise',
    } as Record<string, unknown>)
    expect(result).toEqual({ ok: false, reason: 'invalid_updates' })
  })

  it('returns invalid_updates when isAdmin is not a boolean', async () => {
    const result = await handleCloudUpdateUser(deps, 'u-1', {
      isAdmin: 'true',
    } as Record<string, unknown>)
    expect(result).toEqual({ ok: false, reason: 'invalid_updates' })
  })

  it('returns invalid_updates when isAdmin is a number', async () => {
    const result = await handleCloudUpdateUser(deps, 'u-1', {
      isAdmin: 1,
    } as Record<string, unknown>)
    expect(result).toEqual({ ok: false, reason: 'invalid_updates' })
  })
})

describe('cloud:updateUser — not_connected', () => {
  it('returns not_connected when no authenticated instance exists', async () => {
    listCloudInstances.mockReturnValue([{ id: 'inst-1', access_token: null, base_url: 'https://api.example.com' }])
    const result = await handleCloudUpdateUser(deps, 'u-1', { isAdmin: true })
    expect(result).toEqual({ ok: false, reason: 'not_connected' })
  })

  it('returns not_connected when listCloudInstances returns empty array', async () => {
    const result = await handleCloudUpdateUser(deps, 'u-1', { isAdmin: true })
    expect(result).toEqual({ ok: false, reason: 'not_connected' })
  })
})

describe('cloud:updateUser — unknown (session)', () => {
  it('returns unknown with message when ensureFreshCloudSession returns false', async () => {
    listCloudInstances.mockReturnValue([{ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' }])
    ensureFreshCloudSession.mockResolvedValue(false)
    const result = await handleCloudUpdateUser(deps, 'u-1', { isAdmin: true })
    expect(result).toEqual({ ok: false, reason: 'unknown', message: 'Cloud session expired. Please reconnect.' })
  })
})

describe('cloud:updateUser — forbidden', () => {
  it('returns forbidden when API responds with 403', async () => {
    listCloudInstances.mockReturnValue([{ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' }])
    ensureFreshCloudSession.mockResolvedValue(true)
    findCloudInstanceById.mockReturnValue({ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' })
    fakeFetch.mockResolvedValue(new Response('', { status: 403 }))

    const result = await handleCloudUpdateUser(deps, 'u-1', { isAdmin: true })
    expect(result).toEqual({ ok: false, reason: 'forbidden' })
  })
})

describe('cloud:updateUser — unknown (API error)', () => {
  it('returns unknown with message when API responds with 500', async () => {
    listCloudInstances.mockReturnValue([{ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' }])
    ensureFreshCloudSession.mockResolvedValue(true)
    findCloudInstanceById.mockReturnValue({ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' })
    fakeFetch.mockResolvedValue(new Response('Internal Server Error', { status: 500 }))

    const result = await handleCloudUpdateUser(deps, 'u-1', { isAdmin: true })
    expect(result).toEqual({ ok: false, reason: 'unknown', message: 'Internal Server Error' })
  })
})

describe('cloud:updateUser — ok', () => {
  it('returns ok with refreshed account when PATCH succeeds', async () => {
    listCloudInstances.mockReturnValue([{ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' }])
    ensureFreshCloudSession.mockResolvedValue(true)
    findCloudInstanceById.mockReturnValue({ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' })
    fakeFetch.mockResolvedValue(new Response('{}', { status: 200 }))
    getPrimaryCloudAccount.mockResolvedValue({ account: ACCOUNT, users: USERS })

    const result = await handleCloudUpdateUser(deps, 'u-1', { isAdmin: true })
    expect(result).toEqual({ ok: true, account: ACCOUNT, users: USERS })
  })

  it('trims whitespace from userId before using in URL', async () => {
    listCloudInstances.mockReturnValue([{ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' }])
    ensureFreshCloudSession.mockResolvedValue(true)
    findCloudInstanceById.mockReturnValue({ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' })
    fakeFetch.mockResolvedValue(new Response('{}', { status: 200 }))
    getPrimaryCloudAccount.mockResolvedValue({ account: ACCOUNT, users: USERS })

    await handleCloudUpdateUser(deps, '  u-1  ', { isAdmin: false })
    const calledUrl = fakeFetch.mock.calls[0]?.[0] as string
    expect(calledUrl).toContain('/v1/admin/users/u-1')
  })

  it('accepts valid subscriptionPlan values', async () => {
    for (const plan of ['plus', 'pro', 'max']) {
      vi.clearAllMocks()
      listCloudInstances.mockReturnValue([{ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' }])
      ensureFreshCloudSession.mockResolvedValue(true)
      findCloudInstanceById.mockReturnValue({ id: 'inst-1', access_token: 'tok-1', base_url: 'https://api.example.com' })
      fakeFetch.mockResolvedValue(new Response('{}', { status: 200 }))
      getPrimaryCloudAccount.mockResolvedValue({ account: ACCOUNT, users: USERS })

      const result = await handleCloudUpdateUser(deps, 'u-1', { subscriptionPlan: plan } as Record<string, unknown>)
      expect(result.ok).toBe(true)
    }
  })
})
