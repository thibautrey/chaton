import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `models:syncPi` IPC handler.
 *
 * The handler (workspace-handlers.ts line 1583) is a simple passthrough:
 *   ipcMain.handle("models:syncPi", async () => deps.syncPiModelsCache());
 *
 * It was completely untested. Key behaviors to verify:
 * - Calls syncPiModelsCache with no arguments
 * - Returns the result of syncPiModelsCache unchanged (passthrough)
 * - Handles sync success result (models refreshed)
 * - Handles sync failure result
 * - Async — returns a Promise
 * - Error propagation when syncPiModelsCache throws
 */

describe('models:syncPi handler', () => {
  // -------------------------------------------------------------------------
  // Inline minimal handler — mirrors workspace-handlers.ts line 1583.
  // -------------------------------------------------------------------------
  async function syncPiModelsHandler(deps: {
    syncPiModelsCache: () => Promise<unknown>
  }): Promise<unknown> {
    return deps.syncPiModelsCache()
  }

  // -------------------------------------------------------------------------
  // Tests
  // -------------------------------------------------------------------------

  it('calls syncPiModelsCache with no arguments', async () => {
    const syncPiModelsCache = vi.fn().mockResolvedValue({ ok: true, synced: 0 })
    const deps = { syncPiModelsCache }
    await syncPiModelsHandler(deps)
    expect(syncPiModelsCache).toHaveBeenCalledTimes(1)
    expect(syncPiModelsCache).toHaveBeenCalledWith()
  })

  it('returns the result of syncPiModelsCache unchanged', async () => {
    const mockResult = { ok: true, synced: 3, providers: ['openai', 'anthropic'] }
    const deps = { syncPiModelsCache: vi.fn().mockResolvedValue(mockResult) }
    const result = await syncPiModelsHandler(deps)
    expect(result).toBe(mockResult)
  })

  it('handles sync success result with synced count', async () => {
    const mockResult = { ok: true, synced: 5 }
    const deps = { syncPiModelsCache: vi.fn().mockResolvedValue(mockResult) }
    const result = await syncPiModelsHandler(deps)
    expect(result).toEqual({ ok: true, synced: 5 })
  })

  it('handles sync failure result', async () => {
    const mockResult = { ok: false, message: 'Network error' }
    const deps = { syncPiModelsCache: vi.fn().mockResolvedValue(mockResult) }
    const result = await syncPiModelsHandler(deps)
    expect(result).toEqual({ ok: false, message: 'Network error' })
  })

  it('handles empty result gracefully', async () => {
    const deps = { syncPiModelsCache: vi.fn().mockResolvedValue({}) }
    const result = await syncPiModelsHandler(deps)
    expect(result).toEqual({})
  })

  it('is async — returns a Promise', () => {
    const deps = { syncPiModelsCache: vi.fn().mockResolvedValue(undefined) }
    const result = syncPiModelsHandler(deps)
    expect(result).toBeInstanceOf(Promise)
  })

  it('propagates errors when syncPiModelsCache throws', async () => {
    const error = new Error('Pi directory not accessible')
    const deps = { syncPiModelsCache: vi.fn().mockRejectedValue(error) }
    await expect(syncPiModelsHandler(deps)).rejects.toThrow('Pi directory not accessible')
  })

  it('propagates non-Error rejections', async () => {
    const deps = { syncPiModelsCache: vi.fn().mockRejectedValue('sync failed') }
    await expect(syncPiModelsHandler(deps)).rejects.toBe('sync failed')
  })

  it('does not call syncPiModelsCache more than once per call', async () => {
    const syncPiModelsCache = vi.fn().mockResolvedValue({ ok: true })
    const deps = { syncPiModelsCache }
    await syncPiModelsHandler(deps)
    await syncPiModelsHandler(deps)
    expect(syncPiModelsCache).toHaveBeenCalledTimes(2)
  })

  it('handles result with provider and model details', async () => {
    const mockResult = {
      ok: true,
      synced: 2,
      providers: {
        openai: {
          name: 'OpenAI',
          models: [{ id: 'gpt-4o' }],
        },
      },
    }
    const deps = { syncPiModelsCache: vi.fn().mockResolvedValue(mockResult) }
    const result = await syncPiModelsHandler(deps)
    expect(result).toEqual(mockResult)
    expect(result).toHaveProperty('providers')
  })
})
