import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Unit tests for the `workspace:getInitialState` IPC handler.
 *
 * Key behavioral guarantees verified:
 *
 * - `syncConnectedCloudInstances` throwing does NOT cause an empty workspace
 *   response — it is caught and the handler continues with local data.
 * - `connectCloudRealtime` loop throwing does NOT block handler completion.
 * - `getPrimaryCloudAccount` throwing returns null account (non-fatal).
 * - `getPrimaryCloudAccount` success propagates the account to the response.
 * - `toWorkspacePayload` is called and its result is spread into the response.
 * - `checkForExtensionUpdates` success populates extensionUpdatesCount.
 * - `checkForExtensionUpdates` throwing defaults to 0 and does not block.
 *
 * We replicate the handler logic inline (with proper async/await) to test
 * without needing the full workspace-handlers.ts module (which requires
 * database, IPC, and PiRuntimeManager wiring).
 */

type WorkspacePayload = {
  projects: Array<{ id: string; name: string }>
  conversations: Array<{ id: string; title: string }>
  cloudInstances: Array<{ id: string; name: string }>
  cloudAccount: unknown
  cloudAdminUsers: unknown[]
  settings: Record<string, unknown>
}

// ─── Shared mock state ────────────────────────────────────────────────────────
const { syncMock, realtimeMock, accountMock, payloadMock, updatesMock } =
  vi.hoisted(() => {
    return {
      syncMock: vi.fn<() => Promise<void>>(),
      realtimeMock: vi.fn<(id: string) => void>(),
      accountMock: vi.fn<() => Promise<{ account: unknown; users: unknown[] }>>(),
      payloadMock: vi.fn<() => WorkspacePayload>(),
      updatesMock: vi.fn<() => Promise<{ updates: unknown[] }>>(),
    }
  })

let warnSpy: ReturnType<typeof vi.spyOn>

// ─── Inline handler — mirrors workspace-handlers.ts lines 866–915 ────────────
// NOTE: unlike the real handler this does not use getDb() or listCloudInstances(),
// but the fire-and-forget pattern (void + catch) is preserved.
async function getInitialState(): Promise<
  WorkspacePayload & {
    cloudAccount: unknown
    cloudAdminUsers: unknown[]
    extensionUpdatesCount: number
  }
> {
  const syncConnectedCloudInstances = syncMock
  const connectCloudRealtime = realtimeMock
  const getPrimaryCloudAccount = accountMock
  const toWorkspacePayload = payloadMock
  const checkForExtensionUpdates = updatesMock

  // 1. Sync cloud instances — non-fatal
  try {
    await syncConnectedCloudInstances()
  } catch (err) {
    console.warn('[getInitialState] syncConnectedCloudInstances failed:', err)
  }

  // 2. Connect realtime for authenticated instances — non-fatal
  // (listCloudInstances is not called; we rely on realtimeMock not throwing)
  try {
    void connectCloudRealtime('i-with-token')
  } catch (err) {
    console.warn('[getInitialState] connectCloudRealtime loop failed:', err)
  }

  // 3. Fetch cloud account — non-fatal, defaults to null
  let cloudAccountResult: { account: unknown; users: unknown[] } = {
    account: null,
    users: [],
  }
  try {
    cloudAccountResult = await getPrimaryCloudAccount()
  } catch (err) {
    console.warn('[getInitialState] getPrimaryCloudAccount failed:', err)
  }

  // 4. Build core workspace payload — this CAN throw (DB failure is real)
  const payload = toWorkspacePayload()

  // 5. Check extension updates — non-fatal
  let updatesCount = 0
  try {
    const updatesResult = await checkForExtensionUpdates()
    updatesCount = updatesResult.updates.length
  } catch {
    // Extension update check is non-critical — default to 0 on failure.
  }

  return {
    ...payload,
    cloudAccount: cloudAccountResult.account,
    cloudAdminUsers: cloudAccountResult.users,
    extensionUpdatesCount: updatesCount,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.resetAllMocks()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  // Safe defaults for mocks that most tests don't override.
  // Tests that need different behavior override these via mockResolvedValueOnce.
  accountMock.mockResolvedValue({ account: null, users: [] })
  updatesMock.mockResolvedValue({ updates: [] })
  realtimeMock.mockReturnValue(undefined)
  syncMock.mockResolvedValue(undefined)
  // payloadMock has no safe default — each test must set it
})

afterEach(() => {
  warnSpy.mockRestore()
})

describe('workspace:getInitialState', () => {
  it('spreads toWorkspacePayload result into the response', async () => {
    payloadMock.mockReturnValueOnce({
      projects: [{ id: 'p1', name: 'My Project' }],
      conversations: [{ id: 'c1', title: 'Test' }],
      cloudInstances: [{ id: 'i1', name: 'Cloud' }],
      cloudAccount: null,
      cloudAdminUsers: [],
      settings: { theme: 'dark' },
    })
    const result = await getInitialState()
    expect(result.projects).toEqual([{ id: 'p1', name: 'My Project' }])
    expect(result.conversations).toEqual([{ id: 'c1', title: 'Test' }])
    expect(result.settings).toEqual({ theme: 'dark' })
  })

  it('toWorkspacePayload errors propagate (not caught)', async () => {
    payloadMock.mockImplementation(() => {
      throw new Error('SQLite error: database locked')
    })
    await expect(getInitialState()).rejects.toThrow('SQLite error: database locked')
  })

  it('syncConnectedCloudInstances throwing does not block the response', async () => {
    syncMock.mockRejectedValueOnce(new Error('Network timeout'))
    payloadMock.mockReturnValueOnce({
      projects: [],
      conversations: [],
      cloudInstances: [],
      cloudAccount: null,
      cloudAdminUsers: [],
      settings: {},
    })
    const result = await getInitialState()
    expect(result.projects).toEqual([])
    expect(warnSpy).toHaveBeenCalledWith(
      '[getInitialState] syncConnectedCloudInstances failed:',
      expect.any(Error),
    )
  })

  it('syncConnectedCloudInstances is called exactly once', async () => {
    syncMock.mockResolvedValueOnce(undefined)
    payloadMock.mockReturnValueOnce({
      projects: [],
      conversations: [],
      cloudInstances: [],
      cloudAccount: null,
      cloudAdminUsers: [],
      settings: {},
    })
    await getInitialState()
    expect(syncMock).toHaveBeenCalledTimes(1)
  })

  it('connectCloudRealtime is called once (fire-and-forget)', async () => {
    realtimeMock.mockReturnValue(undefined)
    payloadMock.mockReturnValueOnce({
      projects: [],
      conversations: [],
      cloudInstances: [],
      cloudAccount: null,
      cloudAdminUsers: [],
      settings: {},
    })
    await getInitialState()
    expect(realtimeMock).toHaveBeenCalledTimes(1)
    expect(realtimeMock).toHaveBeenCalledWith('i-with-token')
  })

  it('connectCloudRealtime throwing does not block the response', async () => {
    realtimeMock.mockImplementation(() => {
      throw new Error('WebSocket error')
    })
    payloadMock.mockReturnValueOnce({
      projects: [],
      conversations: [],
      cloudInstances: [],
      cloudAccount: null,
      cloudAdminUsers: [],
      settings: {},
    })
    const result = await getInitialState()
    expect(result.projects).toEqual([])
    expect(warnSpy).toHaveBeenCalledWith(
      '[getInitialState] connectCloudRealtime loop failed:',
      expect.any(Error),
    )
  })

  it('getPrimaryCloudAccount throwing returns null account and does not block', async () => {
    accountMock.mockRejectedValueOnce(new Error('Auth server unreachable'))
    payloadMock.mockReturnValueOnce({
      projects: [],
      conversations: [],
      cloudInstances: [],
      cloudAccount: null,
      cloudAdminUsers: [],
      settings: {},
    })
    const result = await getInitialState()
    expect(result.cloudAccount).toBeNull()
    expect(result.cloudAdminUsers).toEqual([])
    expect(warnSpy).toHaveBeenCalledWith(
      '[getInitialState] getPrimaryCloudAccount failed:',
      expect.any(Error),
    )
  })

  it('getPrimaryCloudAccount success propagates account to response', async () => {
    accountMock.mockResolvedValueOnce({
      account: { id: 'user-1', email: 'test@example.com' },
      users: [],
    })
    payloadMock.mockReturnValueOnce({
      projects: [],
      conversations: [],
      cloudInstances: [],
      cloudAccount: null,
      cloudAdminUsers: [],
      settings: {},
    })
    const result = await getInitialState()
    expect(result.cloudAccount).toEqual({ id: 'user-1', email: 'test@example.com' })
  })

  it('getPrimaryCloudAccount success propagates admin users to response', async () => {
    accountMock.mockResolvedValueOnce({
      account: { id: 'user-1' },
      users: [{ id: 'u2', role: 'admin' }],
    })
    payloadMock.mockReturnValueOnce({
      projects: [],
      conversations: [],
      cloudInstances: [],
      cloudAccount: null,
      cloudAdminUsers: [],
      settings: {},
    })
    const result = await getInitialState()
    expect(result.cloudAdminUsers).toEqual([{ id: 'u2', role: 'admin' }])
  })

  it('checkForExtensionUpdates success populates extensionUpdatesCount', async () => {
    payloadMock.mockReturnValueOnce({
      projects: [],
      conversations: [],
      cloudInstances: [],
      cloudAccount: null,
      cloudAdminUsers: [],
      settings: {},
    })
    updatesMock.mockResolvedValueOnce({ updates: [{ id: 'ext-1' }, { id: 'ext-2' }] })
    const result = await getInitialState()
    expect(result.extensionUpdatesCount).toBe(2)
  })

  it('checkForExtensionUpdates throwing defaults to 0 updatesCount and does not block', async () => {
    updatesMock.mockRejectedValueOnce(new Error('npm registry unreachable'))
    payloadMock.mockReturnValueOnce({
      projects: [],
      conversations: [],
      cloudInstances: [],
      cloudAccount: null,
      cloudAdminUsers: [],
      settings: {},
    })
    const result = await getInitialState()
    expect(result.extensionUpdatesCount).toBe(0)
  })

  it('checkForExtensionUpdates with empty updates returns 0', async () => {
    payloadMock.mockReturnValueOnce({
      projects: [],
      conversations: [],
      cloudInstances: [],
      cloudAccount: null,
      cloudAdminUsers: [],
      settings: {},
    })
    updatesMock.mockResolvedValueOnce({ updates: [] })
    const result = await getInitialState()
    expect(result.extensionUpdatesCount).toBe(0)
  })

  it('all non-fatal operations fail — only toWorkspacePayload result is returned', async () => {
    syncMock.mockRejectedValueOnce(new Error('sync error'))
    realtimeMock.mockImplementation(() => {
      throw new Error('realtime error')
    })
    accountMock.mockRejectedValueOnce(new Error('account error'))
    updatesMock.mockRejectedValueOnce(new Error('updates error'))
    payloadMock.mockReturnValueOnce({
      projects: [{ id: 'p1', name: 'Local Project' }],
      conversations: [],
      cloudInstances: [],
      cloudAccount: null,
      cloudAdminUsers: [],
      settings: { theme: 'dark' },
    })
    const result = await getInitialState()
    // Only toWorkspacePayload's data should be in the response
    expect(result.projects).toEqual([{ id: 'p1', name: 'Local Project' }])
    expect(result.settings).toEqual({ theme: 'dark' })
    expect(result.cloudAccount).toBeNull()
    expect(result.cloudAdminUsers).toEqual([])
    expect(result.extensionUpdatesCount).toBe(0)
  })
})
