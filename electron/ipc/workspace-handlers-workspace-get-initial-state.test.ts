import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Unit tests for the `workspace:getInitialState` IPC handler.
 *
 * Handler (workspace-handlers.ts lines 866–916):
 *   Orchestrates app startup by running five sequential steps:
 *     1. syncConnectedCloudInstances()      — non-critical, caught
 *     2. connectCloudRealtime() loop         — non-critical, caught
 *     3. getPrimaryCloudAccount()           — non-critical, caught; defaults null/[]
 *     4. deps.toWorkspacePayload()           — CRITICAL; no catch; propagates on failure
 *     5. checkForExtensionUpdates()          — non-critical, caught; defaults 0
 *
 * Key behavioral guarantees verified:
 * - Always returns the same top-level shape: { ...payload, cloudAccount, cloudAdminUsers, extensionUpdatesCount }
 * - Steps 1–3 and 5 fail gracefully: handler still returns a valid payload with defaults
 * - Step 4 is uncaught: toWorkspacePayload() errors propagate as-is
 * - cloudAccount is null and cloudAdminUsers is [] when getPrimaryCloudAccount throws
 * - extensionUpdatesCount is 0 when checkForExtensionUpdates throws
 * - cloudInstances and realtime connections are attempted even if sync fails
 *
 * The handler is replicated inline to test without the full module graph.
 */

// ─── Shared mock types ────────────────────────────────────────────────────────

type CloudInstance = { id: string; access_token: string | null; base_url: string }

type CloudAccountResult = {
  account: { id: string; name: string; email: string } | null
  users: Array<{ id: string; email: string }>
}

type ExtensionUpdatesResult = { updates: Array<{ extensionId: string }> }

type WorkspacePayload = Record<string, unknown>

// ─── Inline handler replica ───────────────────────────────────────────────────
// MUST mirror workspace-handlers.ts lines 866–916 exactly.

async function handleGetInitialState(deps: {
  syncConnectedCloudInstances: () => Promise<void>
  getDb: () => unknown
  listCloudInstances: (db: unknown) => CloudInstance[]
  connectCloudRealtime: (id: string) => void
  getPrimaryCloudAccount: () => Promise<CloudAccountResult>
  toWorkspacePayload: () => WorkspacePayload
  checkForExtensionUpdates: () => Promise<ExtensionUpdatesResult>
}): Promise<
  WorkspacePayload & {
    cloudAccount: CloudAccountResult['account']
    cloudAdminUsers: CloudAccountResult['users']
    extensionUpdatesCount: number
  }
> {
  // Step 1: sync cloud instances — non-critical
  try {
    await deps.syncConnectedCloudInstances()
  } catch (err) {
    console.warn('[getInitialState] syncConnectedCloudInstances failed:', err)
  }

  // Step 2: connect realtime for authenticated instances — non-critical
  try {
    const db = deps.getDb()
    for (const instance of deps.listCloudInstances(db)) {
      if (instance.access_token) {
        void deps.connectCloudRealtime(instance.id)
      }
    }
  } catch (err) {
    console.warn('[getInitialState] connectCloudRealtime loop failed:', err)
  }

  // Step 3: fetch cloud account — non-critical, defaults to null/[]
  let cloudAccountResult: CloudAccountResult = { account: null, users: [] }
  try {
    cloudAccountResult = await deps.getPrimaryCloudAccount()
  } catch (err) {
    console.warn('[getInitialState] getPrimaryCloudAccount failed:', err)
  }

  // Step 4: build workspace payload — CRITICAL; no try/catch
  const payload = deps.toWorkspacePayload()

  // Step 5: check extension updates — non-critical, defaults to 0
  let updatesCount = 0
  try {
    const updatesResult = await deps.checkForExtensionUpdates()
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

// ─── Shared mock factories ────────────────────────────────────────────────────

function makeSyncMock() {
  return vi.fn<() => Promise<void>>()
}

function makeGetDbMock(db: unknown = {}) {
  return vi.fn<() => unknown>(() => db)
}

function makeListCloudInstancesMock(instances: CloudInstance[] = []) {
  return vi.fn<(_db: unknown) => CloudInstance[]>(() => instances)
}

function makeConnectRealtimeMock() {
  return vi.fn<(_id: string) => void>()
}

function makeGetPrimaryCloudAccountMock(result: CloudAccountResult) {
  return vi.fn<() => Promise<CloudAccountResult>>(() => Promise.resolve(result))
}

function makeToWorkspacePayloadMock(payload: WorkspacePayload) {
  return vi.fn<() => WorkspacePayload>(() => payload)
}

function makeCheckExtensionUpdatesMock(result: ExtensionUpdatesResult) {
  return vi.fn<() => Promise<ExtensionUpdatesResult>>(() => Promise.resolve(result))
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('workspace:getInitialState', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  let syncMock: ReturnType<typeof makeSyncMock>
  let getDbMock: ReturnType<typeof makeGetDbMock>
  let listCloudInstancesMock: ReturnType<typeof makeListCloudInstancesMock>
  let connectRealtimeMock: ReturnType<typeof makeConnectRealtimeMock>
  let getPrimaryCloudAccountMock: ReturnType<typeof makeGetPrimaryCloudAccountMock>
  let toWorkspacePayloadMock: ReturnType<typeof makeToWorkspacePayloadMock>
  let checkExtensionUpdatesMock: ReturnType<typeof makeCheckExtensionUpdatesMock>

  const basePayload: WorkspacePayload = {
    conversations: [],
    projects: [],
    settings: { theme: 'dark' },
  }

  const baseCloudAccount: CloudAccountResult = {
    account: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
    users: [{ id: 'user-1', email: 'test@example.com' }],
  }

  const baseExtensionsResult: ExtensionUpdatesResult = {
    updates: [{ extensionId: 'ext-a' }, { extensionId: 'ext-b' }],
  }

  beforeEach(() => {
    vi.resetAllMocks()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    syncMock = makeSyncMock()
    getDbMock = makeGetDbMock({})
    listCloudInstancesMock = makeListCloudInstancesMock([])
    connectRealtimeMock = makeConnectRealtimeMock()
    getPrimaryCloudAccountMock = makeGetPrimaryCloudAccountMock(baseCloudAccount)
    toWorkspacePayloadMock = makeToWorkspacePayloadMock(basePayload)
    checkExtensionUpdatesMock = makeCheckExtensionUpdatesMock(baseExtensionsResult)
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  // ── Happy path ──────────────────────────────────────────────────────────────

  describe('all steps succeed', () => {
    it('returns workspace payload spread at top level', async () => {
      const deps = {
        syncConnectedCloudInstances: syncMock,
        getDb: getDbMock,
        listCloudInstances: listCloudInstancesMock,
        connectCloudRealtime: connectRealtimeMock,
        getPrimaryCloudAccount: getPrimaryCloudAccountMock,
        toWorkspacePayload: toWorkspacePayloadMock,
        checkForExtensionUpdates: checkExtensionUpdatesMock,
      }
      const result = await handleGetInitialState(deps)

      expect(result).toMatchObject({
        conversations: [],
        projects: [],
        settings: { theme: 'dark' },
      })
    })

    it('returns cloud account and admin users', async () => {
      const deps = {
        syncConnectedCloudInstances: syncMock,
        getDb: getDbMock,
        listCloudInstances: listCloudInstancesMock,
        connectCloudRealtime: connectRealtimeMock,
        getPrimaryCloudAccount: getPrimaryCloudAccountMock,
        toWorkspacePayload: toWorkspacePayloadMock,
        checkForExtensionUpdates: checkExtensionUpdatesMock,
      }
      const result = await handleGetInitialState(deps)

      expect(result.cloudAccount).toEqual({ id: 'user-1', name: 'Test User', email: 'test@example.com' })
      expect(result.cloudAdminUsers).toEqual([{ id: 'user-1', email: 'test@example.com' }])
    })

    it('returns correct extension updates count', async () => {
      const deps = {
        syncConnectedCloudInstances: syncMock,
        getDb: getDbMock,
        listCloudInstances: listCloudInstancesMock,
        connectCloudRealtime: connectRealtimeMock,
        getPrimaryCloudAccount: getPrimaryCloudAccountMock,
        toWorkspacePayload: toWorkspacePayloadMock,
        checkForExtensionUpdates: checkExtensionUpdatesMock,
      }
      const result = await handleGetInitialState(deps)

      expect(result.extensionUpdatesCount).toBe(2)
    })

    it('calls all collaborators exactly once', async () => {
      const deps = {
        syncConnectedCloudInstances: syncMock,
        getDb: getDbMock,
        listCloudInstances: listCloudInstancesMock,
        connectCloudRealtime: connectRealtimeMock,
        getPrimaryCloudAccount: getPrimaryCloudAccountMock,
        toWorkspacePayload: toWorkspacePayloadMock,
        checkForExtensionUpdates: checkExtensionUpdatesMock,
      }
      await handleGetInitialState(deps)

      expect(syncMock).toHaveBeenCalledTimes(1)
      expect(getDbMock).toHaveBeenCalledTimes(1)
      expect(listCloudInstancesMock).toHaveBeenCalledTimes(1)
      expect(connectRealtimeMock).not.toHaveBeenCalled() // no instances with tokens
      expect(getPrimaryCloudAccountMock).toHaveBeenCalledTimes(1)
      expect(toWorkspacePayloadMock).toHaveBeenCalledTimes(1)
      expect(checkExtensionUpdatesMock).toHaveBeenCalledTimes(1)
    })

    it('connects realtime for instances with access_token', async () => {
      listCloudInstancesMock = makeListCloudInstancesMock([
        { id: 'inst-1', access_token: null, base_url: 'https://a.example.com' },
        { id: 'inst-2', access_token: 'tok-abc', base_url: 'https://b.example.com' },
        { id: 'inst-3', access_token: 'tok-xyz', base_url: 'https://c.example.com' },
      ])

      const deps = {
        syncConnectedCloudInstances: syncMock,
        getDb: getDbMock,
        listCloudInstances: listCloudInstancesMock,
        connectCloudRealtime: connectRealtimeMock,
        getPrimaryCloudAccount: getPrimaryCloudAccountMock,
        toWorkspacePayload: toWorkspacePayloadMock,
        checkForExtensionUpdates: checkExtensionUpdatesMock,
      }
      await handleGetInitialState(deps)

      expect(connectRealtimeMock).toHaveBeenCalledTimes(2)
      expect(connectRealtimeMock).toHaveBeenCalledWith('inst-2')
      expect(connectRealtimeMock).toHaveBeenCalledWith('inst-3')
      expect(connectRealtimeMock).not.toHaveBeenCalledWith('inst-1')
    })
  })

  // ── Step 1: syncConnectedCloudInstances failure ─────────────────────────────

  describe('syncConnectedCloudInstances throws', () => {
    it('still returns a valid payload with defaults for downstream fields', async () => {
      syncMock.mockRejectedValue(new Error('network error'))

      const deps = {
        syncConnectedCloudInstances: syncMock,
        getDb: getDbMock,
        listCloudInstances: listCloudInstancesMock,
        connectCloudRealtime: connectRealtimeMock,
        getPrimaryCloudAccount: getPrimaryCloudAccountMock,
        toWorkspacePayload: toWorkspacePayloadMock,
        checkForExtensionUpdates: checkExtensionUpdatesMock,
      }
      const result = await handleGetInitialState(deps)

      expect(result).toMatchObject({ conversations: [], projects: [], settings: { theme: 'dark' } })
      expect(result.cloudAccount).toEqual({ id: 'user-1', name: 'Test User', email: 'test@example.com' })
      expect(result.extensionUpdatesCount).toBe(2)
      expect(warnSpy).toHaveBeenCalledWith(
        '[getInitialState] syncConnectedCloudInstances failed:',
        expect.any(Error),
      )
    })

    it('still calls all downstream collaborators', async () => {
      syncMock.mockRejectedValue(new Error('network error'))

      const deps = {
        syncConnectedCloudInstances: syncMock,
        getDb: getDbMock,
        listCloudInstances: listCloudInstancesMock,
        connectCloudRealtime: connectRealtimeMock,
        getPrimaryCloudAccount: getPrimaryCloudAccountMock,
        toWorkspacePayload: toWorkspacePayloadMock,
        checkForExtensionUpdates: checkExtensionUpdatesMock,
      }
      await handleGetInitialState(deps)

      expect(getPrimaryCloudAccountMock).toHaveBeenCalledTimes(1)
      expect(toWorkspacePayloadMock).toHaveBeenCalledTimes(1)
      expect(checkExtensionUpdatesMock).toHaveBeenCalledTimes(1)
    })
  })

  // ── Step 2: connectCloudRealtime loop failure ───────────────────────────────

  describe('connectCloudRealtime loop throws', () => {
    it('still returns a valid payload with defaults for downstream fields', async () => {
      listCloudInstancesMock = makeListCloudInstancesMock([
        { id: 'inst-1', access_token: 'tok', base_url: 'https://a.example.com' },
      ])
      connectRealtimeMock.mockImplementation(() => {
        throw new Error('realtime connection failed')
      })

      const deps = {
        syncConnectedCloudInstances: syncMock,
        getDb: getDbMock,
        listCloudInstances: listCloudInstancesMock,
        connectCloudRealtime: connectRealtimeMock,
        getPrimaryCloudAccount: getPrimaryCloudAccountMock,
        toWorkspacePayload: toWorkspacePayloadMock,
        checkForExtensionUpdates: checkExtensionUpdatesMock,
      }
      const result = await handleGetInitialState(deps)

      expect(result).toMatchObject({ conversations: [], projects: [], settings: { theme: 'dark' } })
      expect(result.cloudAccount).toEqual({ id: 'user-1', name: 'Test User', email: 'test@example.com' })
      expect(result.extensionUpdatesCount).toBe(2)
      expect(warnSpy).toHaveBeenCalledWith(
        '[getInitialState] connectCloudRealtime loop failed:',
        expect.any(Error),
      )
    })

    it('still calls all downstream collaborators', async () => {
      listCloudInstancesMock = makeListCloudInstancesMock([
        { id: 'inst-1', access_token: 'tok', base_url: 'https://a.example.com' },
      ])
      connectRealtimeMock.mockImplementation(() => {
        throw new Error('realtime connection failed')
      })

      const deps = {
        syncConnectedCloudInstances: syncMock,
        getDb: getDbMock,
        listCloudInstances: listCloudInstancesMock,
        connectCloudRealtime: connectRealtimeMock,
        getPrimaryCloudAccount: getPrimaryCloudAccountMock,
        toWorkspacePayload: toWorkspacePayloadMock,
        checkForExtensionUpdates: checkExtensionUpdatesMock,
      }
      await handleGetInitialState(deps)

      expect(getPrimaryCloudAccountMock).toHaveBeenCalledTimes(1)
      expect(toWorkspacePayloadMock).toHaveBeenCalledTimes(1)
      expect(checkExtensionUpdatesMock).toHaveBeenCalledTimes(1)
    })
  })

  // ── Step 3: getPrimaryCloudAccount failure ─────────────────────────────────

  describe('getPrimaryCloudAccount throws', () => {
    it('defaults cloudAccount to null and cloudAdminUsers to []', async () => {
      getPrimaryCloudAccountMock = makeGetPrimaryCloudAccountMock({
        account: null,
        users: [],
      })
      getPrimaryCloudAccountMock.mockRejectedValue(new Error('auth expired'))

      const deps = {
        syncConnectedCloudInstances: syncMock,
        getDb: getDbMock,
        listCloudInstances: listCloudInstancesMock,
        connectCloudRealtime: connectRealtimeMock,
        getPrimaryCloudAccount: getPrimaryCloudAccountMock,
        toWorkspacePayload: toWorkspacePayloadMock,
        checkForExtensionUpdates: checkExtensionUpdatesMock,
      }
      const result = await handleGetInitialState(deps)

      expect(result.cloudAccount).toBeNull()
      expect(result.cloudAdminUsers).toEqual([])
      expect(warnSpy).toHaveBeenCalledWith(
        '[getInitialState] getPrimaryCloudAccount failed:',
        expect.any(Error),
      )
    })

    it('still returns workspace payload and extension updates count', async () => {
      getPrimaryCloudAccountMock = makeGetPrimaryCloudAccountMock({
        account: null,
        users: [],
      })
      getPrimaryCloudAccountMock.mockRejectedValue(new Error('auth expired'))

      const deps = {
        syncConnectedCloudInstances: syncMock,
        getDb: getDbMock,
        listCloudInstances: listCloudInstancesMock,
        connectCloudRealtime: connectRealtimeMock,
        getPrimaryCloudAccount: getPrimaryCloudAccountMock,
        toWorkspacePayload: toWorkspacePayloadMock,
        checkForExtensionUpdates: checkExtensionUpdatesMock,
      }
      const result = await handleGetInitialState(deps)

      expect(result).toMatchObject({ conversations: [], projects: [], settings: { theme: 'dark' } })
      expect(result.extensionUpdatesCount).toBe(2)
    })
  })

  // ── Step 4: toWorkspacePayload failure ────────────────────────────────────

  describe('toWorkspacePayload throws', () => {
    it('propagates the error without a try/catch wrapper', async () => {
      toWorkspacePayloadMock = makeToWorkspacePayloadMock({} as WorkspacePayload)
      toWorkspacePayloadMock.mockImplementation(() => {
        throw new Error('SQLite corruption: cannot read conversations table')
      })

      const deps = {
        syncConnectedCloudInstances: syncMock,
        getDb: getDbMock,
        listCloudInstances: listCloudInstancesMock,
        connectCloudRealtime: connectRealtimeMock,
        getPrimaryCloudAccount: getPrimaryCloudAccountMock,
        toWorkspacePayload: toWorkspacePayloadMock,
        checkForExtensionUpdates: checkExtensionUpdatesMock,
      }

      await expect(handleGetInitialState(deps)).rejects.toThrow(
        'SQLite corruption: cannot read conversations table',
      )
    })

    it('does NOT call checkForExtensionUpdates when toWorkspacePayload fails', async () => {
      toWorkspacePayloadMock = makeToWorkspacePayloadMock({} as WorkspacePayload)
      toWorkspacePayloadMock.mockImplementation(() => {
        throw new Error('DB error')
      })

      const deps = {
        syncConnectedCloudInstances: syncMock,
        getDb: getDbMock,
        listCloudInstances: listCloudInstancesMock,
        connectCloudRealtime: connectRealtimeMock,
        getPrimaryCloudAccount: getPrimaryCloudAccountMock,
        toWorkspacePayload: toWorkspacePayloadMock,
        checkForExtensionUpdates: checkExtensionUpdatesMock,
      }

      await expect(handleGetInitialState(deps)).rejects.toThrow()
      expect(checkExtensionUpdatesMock).not.toHaveBeenCalled()
    })

    it('propagates non-Error throws as-is', async () => {
      toWorkspacePayloadMock = makeToWorkspacePayloadMock({} as WorkspacePayload)
      toWorkspacePayloadMock.mockImplementation(() => {
        throw 'string error'
      })

      const deps = {
        syncConnectedCloudInstances: syncMock,
        getDb: getDbMock,
        listCloudInstances: listCloudInstancesMock,
        connectCloudRealtime: connectRealtimeMock,
        getPrimaryCloudAccount: getPrimaryCloudAccountMock,
        toWorkspacePayload: toWorkspacePayloadMock,
        checkForExtensionUpdates: checkExtensionUpdatesMock,
      }

      await expect(handleGetInitialState(deps)).rejects.toThrow('string error')
    })
  })

  // ── Step 5: checkForExtensionUpdates failure ────────────────────────────────

  describe('checkForExtensionUpdates throws', () => {
    it('defaults extensionUpdatesCount to 0', async () => {
      checkExtensionUpdatesMock = makeCheckExtensionUpdatesMock({ updates: [] })
      checkExtensionUpdatesMock.mockRejectedValue(new Error('network unreachable'))

      const deps = {
        syncConnectedCloudInstances: syncMock,
        getDb: getDbMock,
        listCloudInstances: listCloudInstancesMock,
        connectCloudRealtime: connectRealtimeMock,
        getPrimaryCloudAccount: getPrimaryCloudAccountMock,
        toWorkspacePayload: toWorkspacePayloadMock,
        checkForExtensionUpdates: checkExtensionUpdatesMock,
      }
      const result = await handleGetInitialState(deps)

      expect(result.extensionUpdatesCount).toBe(0)
    })

    it('still returns workspace payload and cloud account', async () => {
      checkExtensionUpdatesMock = makeCheckExtensionUpdatesMock({ updates: [] })
      checkExtensionUpdatesMock.mockRejectedValue(new Error('network unreachable'))

      const deps = {
        syncConnectedCloudInstances: syncMock,
        getDb: getDbMock,
        listCloudInstances: listCloudInstancesMock,
        connectCloudRealtime: connectRealtimeMock,
        getPrimaryCloudAccount: getPrimaryCloudAccountMock,
        toWorkspacePayload: toWorkspacePayloadMock,
        checkForExtensionUpdates: checkExtensionUpdatesMock,
      }
      const result = await handleGetInitialState(deps)

      expect(result).toMatchObject({ conversations: [], projects: [], settings: { theme: 'dark' } })
      expect(result.cloudAccount).toEqual({ id: 'user-1', name: 'Test User', email: 'test@example.com' })
    })
  })

  // ── Multiple failures combined ─────────────────────────────────────────────

  describe('multiple steps fail simultaneously', () => {
    it('gracefully degrades: sync + realtime + account fail but payload + extensions succeed', async () => {
      syncMock.mockRejectedValue(new Error('sync failed'))
      connectRealtimeMock.mockImplementation(() => {
        throw new Error('realtime failed')
      })
      getPrimaryCloudAccountMock = makeGetPrimaryCloudAccountMock({ account: null, users: [] })
      getPrimaryCloudAccountMock.mockRejectedValue(new Error('auth failed'))

      const deps = {
        syncConnectedCloudInstances: syncMock,
        getDb: getDbMock,
        listCloudInstances: listCloudInstancesMock,
        connectCloudRealtime: connectRealtimeMock,
        getPrimaryCloudAccount: getPrimaryCloudAccountMock,
        toWorkspacePayload: toWorkspacePayloadMock,
        checkForExtensionUpdates: checkExtensionUpdatesMock,
      }
      const result = await handleGetInitialState(deps)

      expect(result.cloudAccount).toBeNull()
      expect(result.cloudAdminUsers).toEqual([])
      expect(result.extensionUpdatesCount).toBe(2)
      expect(result).toMatchObject({ conversations: [], projects: [] })
    })

    it('propagates toWorkspacePayload error even when earlier steps also failed', async () => {
      syncMock.mockRejectedValue(new Error('sync failed'))
      getPrimaryCloudAccountMock = makeGetPrimaryCloudAccountMock({ account: null, users: [] })
      getPrimaryCloudAccountMock.mockRejectedValue(new Error('auth failed'))
      toWorkspacePayloadMock = makeToWorkspacePayloadMock({} as WorkspacePayload)
      toWorkspacePayloadMock.mockImplementation(() => {
        throw new Error('critical DB failure')
      })

      const deps = {
        syncConnectedCloudInstances: syncMock,
        getDb: getDbMock,
        listCloudInstances: listCloudInstancesMock,
        connectCloudRealtime: connectRealtimeMock,
        getPrimaryCloudAccount: getPrimaryCloudAccountMock,
        toWorkspacePayload: toWorkspacePayloadMock,
        checkForExtensionUpdates: checkExtensionUpdatesMock,
      }

      await expect(handleGetInitialState(deps)).rejects.toThrow('critical DB failure')
    })
  })

  // ── Edge cases ─────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('returns empty cloudAdminUsers array (not undefined) when no users', async () => {
      getPrimaryCloudAccountMock = makeGetPrimaryCloudAccountMock({
        account: { id: 'user-1', name: 'Solo', email: 'solo@example.com' },
        users: [],
      })

      const deps = {
        syncConnectedCloudInstances: syncMock,
        getDb: getDbMock,
        listCloudInstances: listCloudInstancesMock,
        connectCloudRealtime: connectRealtimeMock,
        getPrimaryCloudAccount: getPrimaryCloudAccountMock,
        toWorkspacePayload: toWorkspacePayloadMock,
        checkForExtensionUpdates: checkExtensionUpdatesMock,
      }
      const result = await handleGetInitialState(deps)

      expect(result.cloudAdminUsers).toEqual([])
      expect(Array.isArray(result.cloudAdminUsers)).toBe(true)
    })

    it('spreads workspace payload fields alongside cloud-specific fields', async () => {
      toWorkspacePayloadMock = makeToWorkspacePayloadMock({
        conversations: [{ id: 'conv-1', title: 'My Chat' }],
        projects: [{ id: 'proj-1', name: 'My Project' }],
        settings: { theme: 'light' },
        pinnedConversations: ['conv-1'],
      })

      const deps = {
        syncConnectedCloudInstances: syncMock,
        getDb: getDbMock,
        listCloudInstances: listCloudInstancesMock,
        connectCloudRealtime: connectRealtimeMock,
        getPrimaryCloudAccount: getPrimaryCloudAccountMock,
        toWorkspacePayload: toWorkspacePayloadMock,
        checkForExtensionUpdates: checkExtensionUpdatesMock,
      }
      const result = await handleGetInitialState(deps)

      expect(result.conversations).toEqual([{ id: 'conv-1', title: 'My Chat' }])
      expect(result.projects).toEqual([{ id: 'proj-1', name: 'My Project' }])
      expect(result.settings).toEqual({ theme: 'light' })
      expect(result.pinnedConversations).toEqual(['conv-1'])
      // cloud-specific fields are also present
      expect(result.cloudAccount).toBeTruthy()
      expect(result.extensionUpdatesCount).toBe(2)
    })

    // Note: getPrimaryCloudAccount IS called (before toWorkspacePayload in execution order).
    // The critical assertion is that checkForExtensionUpdates is NOT called after the throw.
    it('does not call checkForExtensionUpdates when toWorkspacePayload throws (getPrimaryCloudAccount still called since it runs first)', async () => {
      toWorkspacePayloadMock = makeToWorkspacePayloadMock({} as WorkspacePayload)
      toWorkspacePayloadMock.mockImplementation(() => {
        throw new Error('DB unavailable')
      })

      const deps = {
        syncConnectedCloudInstances: syncMock,
        getDb: getDbMock,
        listCloudInstances: listCloudInstancesMock,
        connectCloudRealtime: connectRealtimeMock,
        getPrimaryCloudAccount: getPrimaryCloudAccountMock,
        toWorkspacePayload: toWorkspacePayloadMock,
        checkForExtensionUpdates: checkExtensionUpdatesMock,
      }

      await expect(handleGetInitialState(deps)).rejects.toThrow()
      expect(getPrimaryCloudAccountMock).toHaveBeenCalledTimes(1) // called before toWorkspacePayload throws
      expect(checkExtensionUpdatesMock).not.toHaveBeenCalled()
    })
  })
})
