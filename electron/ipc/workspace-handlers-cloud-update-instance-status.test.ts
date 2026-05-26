import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `cloud:updateInstanceStatus` IPC handler.
 *
 * Branching outcomes:
 *   1. instance_not_found — instanceId is not a non-empty string (IPC validation)
 *   2. instance_not_found — status is not one of the allowed enum values (IPC validation)
 *   3. instance_not_found — instanceId not found in the database
 *   4. ok                 — instance found and status updated
 *
 * The handler is replicated inline so tests run without the full module graph.
 * Mirrors electron/ipc/workspace-handlers.ts "cloud:updateInstanceStatus" (~lines 1305–1325).
 */

type UpdateInstanceStatusResult =
  | { ok: true }
  | { ok: false; reason: 'instance_not_found' }

interface Dependencies {
  getDb: () => unknown
  updateCloudInstanceStatus: (
    db: unknown,
    id: string,
    status: 'connected' | 'connecting' | 'disconnected' | 'error',
    lastError?: string | null,
  ) => boolean
}

// Inline handler — mirrors workspace-handlers.ts "cloud:updateInstanceStatus"
async function handleCloudUpdateInstanceStatus(
  deps: Dependencies,
  instanceId: unknown,
  status: unknown,
  lastError?: unknown,
): Promise<UpdateInstanceStatusResult> {
  if (typeof instanceId !== 'string' || !instanceId.trim()) {
    return { ok: false as const, reason: 'instance_not_found' as const }
  }
  const validStatuses = ['connected', 'connecting', 'disconnected', 'error'] as const
  if (!validStatuses.includes(status as typeof validStatuses[number])) {
    return { ok: false as const, reason: 'instance_not_found' as const }
  }
  const db = deps.getDb()
  const updated = deps.updateCloudInstanceStatus(
    db,
    instanceId.trim(),
    status as 'connected' | 'connecting' | 'disconnected' | 'error',
    lastError as string | null | undefined,
  )
  if (!updated) {
    return { ok: false as const, reason: 'instance_not_found' as const }
  }
  return { ok: true as const }
}

describe('cloud:updateInstanceStatus', () => {
  let mockDb: unknown
  let updateCalls: Array<{
    id: string
    status: string
    lastError?: string | null
  }>

  const makeDeps = () => ({
    getDb: () => mockDb,
    updateCloudInstanceStatus: vi.fn(
      (
        _db: unknown,
        id: string,
        status: 'connected' | 'connecting' | 'disconnected' | 'error',
        lastError?: string | null,
      ): boolean => {
        updateCalls.push({ id, status, lastError })
        return true
      },
    ),
  })

  beforeEach(() => {
    mockDb = {}
    updateCalls = []
  })

  // -------------------------------------------------------------------------
  // IPC-level instanceId validation
  // -------------------------------------------------------------------------
  describe('IPC-level instanceId parameter validation', () => {
    const deps = makeDeps()

    it('rejects undefined instanceId', async () => {
      const result = await handleCloudUpdateInstanceStatus(deps, undefined, 'connected')
      expect(result).toEqual({ ok: false, reason: 'instance_not_found' })
    })

    it('rejects null instanceId', async () => {
      const result = await handleCloudUpdateInstanceStatus(deps, null, 'connected')
      expect(result).toEqual({ ok: false, reason: 'instance_not_found' })
    })

    it('rejects number instanceId', async () => {
      const result = await handleCloudUpdateInstanceStatus(
        deps,
        123 as unknown as string,
        'connected',
      )
      expect(result).toEqual({ ok: false, reason: 'instance_not_found' })
    })

    it('rejects boolean instanceId', async () => {
      const result = await handleCloudUpdateInstanceStatus(
        deps,
        true as unknown as string,
        'connected',
      )
      expect(result).toEqual({ ok: false, reason: 'instance_not_found' })
    })

    it('rejects object instanceId', async () => {
      const result = await handleCloudUpdateInstanceStatus(
        deps,
        { id: 'test' } as unknown as string,
        'connected',
      )
      expect(result).toEqual({ ok: false, reason: 'instance_not_found' })
    })

    it('rejects array instanceId', async () => {
      const result = await handleCloudUpdateInstanceStatus(
        deps,
        ['test'] as unknown as string,
        'connected',
      )
      expect(result).toEqual({ ok: false, reason: 'instance_not_found' })
    })

    it('rejects function instanceId', async () => {
      const result = await handleCloudUpdateInstanceStatus(
        deps,
        (() => 'test') as unknown as string,
        'connected',
      )
      expect(result).toEqual({ ok: false, reason: 'instance_not_found' })
    })

    it('rejects empty string instanceId', async () => {
      const result = await handleCloudUpdateInstanceStatus(deps, '', 'connected')
      expect(result).toEqual({ ok: false, reason: 'instance_not_found' })
    })

    it('rejects whitespace-only instanceId', async () => {
      const result = await handleCloudUpdateInstanceStatus(deps, '   ', 'connected')
      expect(result).toEqual({ ok: false, reason: 'instance_not_found' })
    })

    it('accepts valid non-empty string instanceId', async () => {
      const depsWithUpdate = makeDeps()
      const result = await handleCloudUpdateInstanceStatus(
        depsWithUpdate,
        'inst-abc123',
        'connected',
      )
      expect(result).toEqual({ ok: true })
    })

    it('trims whitespace from instanceId before DB call', async () => {
      const depsWithUpdate = makeDeps()
      await handleCloudUpdateInstanceStatus(depsWithUpdate, '  inst-xyz  ', 'error')
      expect(updateCalls).toContainEqual({
        id: 'inst-xyz',
        status: 'error',
        lastError: undefined,
      })
    })

    it('trims and passes valid status to update function', async () => {
      const depsWithUpdate = makeDeps()
      await handleCloudUpdateInstanceStatus(depsWithUpdate, 'inst-1', 'connecting')
      expect(updateCalls).toContainEqual({
        id: 'inst-1',
        status: 'connecting',
        lastError: undefined,
      })
    })

    it('passes lastError through to update function when provided', async () => {
      const depsWithUpdate = makeDeps()
      await handleCloudUpdateInstanceStatus(depsWithUpdate, 'inst-1', 'error', 'timeout')
      expect(updateCalls).toContainEqual({
        id: 'inst-1',
        status: 'error',
        lastError: 'timeout',
      })
    })
  })

  // -------------------------------------------------------------------------
  // IPC-level status validation
  // -------------------------------------------------------------------------
  describe('IPC-level status parameter validation', () => {
    it('rejects invalid status string (unknown value)', async () => {
      const deps = makeDeps()
      const result = await handleCloudUpdateInstanceStatus(
        deps,
        'inst-1',
        'invalid_status' as unknown,
      )
      expect(result).toEqual({ ok: false, reason: 'instance_not_found' })
    })

    it('rejects non-string status', async () => {
      const deps = makeDeps()
      const result = await handleCloudUpdateInstanceStatus(
        deps,
        'inst-1',
        123 as unknown,
      )
      expect(result).toEqual({ ok: false, reason: 'instance_not_found' })
    })

    it('accepts "connected" status', async () => {
      const deps = makeDeps()
      const result = await handleCloudUpdateInstanceStatus(deps, 'inst-1', 'connected')
      expect(result).toEqual({ ok: true })
    })

    it('accepts "connecting" status', async () => {
      const deps = makeDeps()
      const result = await handleCloudUpdateInstanceStatus(deps, 'inst-1', 'connecting')
      expect(result).toEqual({ ok: true })
    })

    it('accepts "disconnected" status', async () => {
      const deps = makeDeps()
      const result = await handleCloudUpdateInstanceStatus(deps, 'inst-1', 'disconnected')
      expect(result).toEqual({ ok: true })
    })

    it('accepts "error" status', async () => {
      const deps = makeDeps()
      const result = await handleCloudUpdateInstanceStatus(deps, 'inst-1', 'error')
      expect(result).toEqual({ ok: true })
    })
  })

  // -------------------------------------------------------------------------
  // Database lookup outcomes
  // -------------------------------------------------------------------------
  describe('database lookup outcomes', () => {
    it('returns instance_not_found when updateCloudInstanceStatus returns false', async () => {
      const deps = makeDeps()
      deps.updateCloudInstanceStatus = vi.fn(() => false)
      const result = await handleCloudUpdateInstanceStatus(deps, 'nonexistent-id', 'connected')
      expect(result).toEqual({ ok: false, reason: 'instance_not_found' })
    })

    it('returns ok:true when updateCloudInstanceStatus returns true', async () => {
      const deps = makeDeps()
      deps.updateCloudInstanceStatus = vi.fn(() => true)
      const result = await handleCloudUpdateInstanceStatus(deps, 'inst-1', 'connected')
      expect(result).toEqual({ ok: true })
    })
  })
})
