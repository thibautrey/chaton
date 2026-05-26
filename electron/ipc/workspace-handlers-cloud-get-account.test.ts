import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `cloud:getAccount` IPC handler.
 *
 * Tests the three branching outcomes:
 *   1. not_connected — no authenticated cloud instance in the DB
 *   2. session_expired — instance exists but session is no longer valid
 *   3. success — valid account returned from the cloud API
 *
 * The handler is replicated inline so tests run without the full module graph.
 * Mirrors electron/ipc/workspace-handlers.ts lines 1319–1325.
 */

interface GetPrimaryCloudAccountResult {
  account: { id: string; email: string; organizations: string[] } | null
  users: Array<{ id: string; email: string }>
  reason?: 'not_connected' | 'session_expired' | 'unknown'
}

// Inline handler — mirrors the production code at workspace-handlers.ts:1319
async function handleCloudGetAccount(
  getPrimaryCloudAccount: () => Promise<GetPrimaryCloudAccountResult>,
): Promise<
  | { ok: true; account: GetPrimaryCloudAccountResult['account']; users: GetPrimaryCloudAccountResult['users'] }
  | { ok: false; reason: 'not_connected' | 'session_expired' | 'unknown' }
> {
  try {
    const { account, users, reason } = await getPrimaryCloudAccount()
    if (!account) {
      return {
        ok: false as const,
        reason: (reason ?? 'not_connected') as 'not_connected' | 'session_expired' | 'unknown',
      }
    }
    return { ok: true as const, account, users }
  } catch {
    return { ok: false as const, reason: 'unknown' as const }
  }
}

describe('cloud:getAccount', () => {
  let getPrimaryCloudAccountMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getPrimaryCloudAccountMock = vi.fn()
  })

  // -------------------------------------------------------------------------
  // not_connected
  // -------------------------------------------------------------------------

  it('returns ok:false with reason:not_connected when getPrimaryCloudAccount returns null account and not_connected reason', async () => {
    getPrimaryCloudAccountMock.mockResolvedValue({
      account: null,
      users: [],
      reason: 'not_connected',
    })

    const result = await handleCloudGetAccount(getPrimaryCloudAccountMock)

    expect(result).toEqual({ ok: false, reason: 'not_connected' })
  })

  it('returns ok:false with reason:not_connected when getPrimaryCloudAccount returns null account with undefined reason (defaults to not_connected)', async () => {
    getPrimaryCloudAccountMock.mockResolvedValue({
      account: null,
      users: [],
      reason: undefined,
    })

    const result = await handleCloudGetAccount(getPrimaryCloudAccountMock)

    expect(result).toEqual({ ok: false, reason: 'not_connected' })
  })

  // -------------------------------------------------------------------------
  // session_expired
  // -------------------------------------------------------------------------

  it('returns ok:false with reason:session_expired when getPrimaryCloudAccount returns null account and session_expired reason', async () => {
    getPrimaryCloudAccountMock.mockResolvedValue({
      account: null,
      users: [],
      reason: 'session_expired',
    })

    const result = await handleCloudGetAccount(getPrimaryCloudAccountMock)

    expect(result).toEqual({ ok: false, reason: 'session_expired' })
  })

  // -------------------------------------------------------------------------
  // unknown reason (edge case — should not normally happen)
  // -------------------------------------------------------------------------

  it('returns ok:false with reason:unknown when getPrimaryCloudAccount returns null account with unknown reason', async () => {
    getPrimaryCloudAccountMock.mockResolvedValue({
      account: null,
      users: [],
      reason: 'unknown',
    })

    const result = await handleCloudGetAccount(getPrimaryCloudAccountMock)

    expect(result).toEqual({ ok: false, reason: 'unknown' })
  })

  // -------------------------------------------------------------------------
  // success
  // -------------------------------------------------------------------------

  it('returns ok:true with account and users when getPrimaryCloudAccount returns a valid account', async () => {
    const account = {
      id: 'acc-123',
      email: 'alice@example.com',
      organizations: ['org-abc'],
    }
    const users = [
      { id: 'usr-1', email: 'alice@example.com' },
      { id: 'usr-2', email: 'bob@example.com' },
    ]
    getPrimaryCloudAccountMock.mockResolvedValue({ account, users })

    const result = await handleCloudGetAccount(getPrimaryCloudAccountMock)

    expect(result).toEqual({ ok: true, account, users })
  })

  it('getPrimaryCloudAccount is called exactly once', async () => {
    getPrimaryCloudAccountMock.mockResolvedValue({
      account: null,
      users: [],
      reason: 'not_connected',
    })

    await handleCloudGetAccount(getPrimaryCloudAccountMock)

    expect(getPrimaryCloudAccountMock).toHaveBeenCalledTimes(1)
  })

  it('returns ok:true with empty users array when getPrimaryCloudAccount returns account with no users', async () => {
    const account = { id: 'acc-456', email: 'solo@example.com', organizations: [] }
    getPrimaryCloudAccountMock.mockResolvedValue({ account, users: [] })

    const result = await handleCloudGetAccount(getPrimaryCloudAccountMock)

    expect(result).toEqual({ ok: true, account, users: [] })
  })

  // -------------------------------------------------------------------------
  // exception safety
  // -------------------------------------------------------------------------

  it('returns ok:false reason:unknown when getPrimaryCloudAccount throws an Error', async () => {
    getPrimaryCloudAccountMock.mockRejectedValue(new Error('Network unreachable'))

    const result = await handleCloudGetAccount(getPrimaryCloudAccountMock)

    expect(result).toEqual({ ok: false, reason: 'unknown' })
  })

  it('returns ok:false reason:unknown when getPrimaryCloudAccount throws a non-Error value', async () => {
    getPrimaryCloudAccountMock.mockRejectedValue('unexpected string rejection')

    const result = await handleCloudGetAccount(getPrimaryCloudAccountMock)

    expect(result).toEqual({ ok: false, reason: 'unknown' })
  })

  it('does not throw when getPrimaryCloudAccount throws', async () => {
    getPrimaryCloudAccountMock.mockRejectedValue(new Error('boom'))

    await expect(handleCloudGetAccount(getPrimaryCloudAccountMock)).resolves.toEqual({
      ok: false,
      reason: 'unknown',
    })
  })
})
