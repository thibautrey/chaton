import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `models:listPi` and `models:syncPi` IPC handlers.
 *
 * Both handlers are pure passthroughs to deps methods:
 *   models:listPi  → deps.listPiModelsCached()
 *   models:syncPi  → deps.syncPiModelsCache()
 *
 * We replicate the handler logic inline to test without needing the full
 * workspace-handlers.ts module (which requires database, IPC, and PiRuntimeManager wiring).
 */

interface HandlerDeps {
  listPiModelsCached: () => Promise<unknown>
  syncPiModelsCache: () => Promise<unknown>
}

// Inline handlers — mirrors workspace-handlers.ts lines 1582–1583
async function listPi(deps: HandlerDeps): Promise<unknown> {
  return deps.listPiModelsCached()
}

async function syncPi(deps: HandlerDeps): Promise<unknown> {
  return deps.syncPiModelsCache()
}

describe('models:listPi — passthrough contract', () => {
  it('calls listPiModelsCached with no arguments', async () => {
    const deps: HandlerDeps = {
      listPiModelsCached: vi.fn().mockResolvedValue([]),
      syncPiModelsCache: vi.fn(),
    }
    await listPi(deps)
    expect(deps.listPiModelsCached).toHaveBeenCalledTimes(1)
    expect(deps.listPiModelsCached).toHaveBeenCalledWith()
  })

  it('returns the result of listPiModelsCached unchanged', async () => {
    const deps: HandlerDeps = {
      listPiModelsCached: vi.fn().mockResolvedValue([
        { id: 'openai/gpt-4o', name: 'GPT-4o' },
      ]),
      syncPiModelsCache: vi.fn(),
    }
    const result = await listPi(deps)
    expect(result).toEqual([{ id: 'openai/gpt-4o', name: 'GPT-4o' }])
  })

  it('returns empty array when no models are configured', async () => {
    const deps: HandlerDeps = {
      listPiModelsCached: vi.fn().mockResolvedValue([]),
      syncPiModelsCache: vi.fn(),
    }
    const result = await listPi(deps)
    expect(result).toEqual([])
  })

  it('returns the result even when it contains additional fields', async () => {
    const deps: HandlerDeps = {
      listPiModelsCached: vi.fn().mockResolvedValue({
        providers: [
          {
            id: 'anthropic',
            models: [{ id: 'claude-3-5-sonnet' }],
          },
        ],
      }),
      syncPiModelsCache: vi.fn(),
    }
    const result = await listPi(deps)
    expect(result).toHaveProperty('providers')
    expect(deps.listPiModelsCached).toHaveBeenCalledOnce()
  })
})

describe('models:syncPi — passthrough contract', () => {
  it('calls syncPiModelsCache with no arguments', async () => {
    const deps: HandlerDeps = {
      listPiModelsCached: vi.fn(),
      syncPiModelsCache: vi.fn().mockResolvedValue({ ok: true }),
    }
    await syncPi(deps)
    expect(deps.syncPiModelsCache).toHaveBeenCalledTimes(1)
    expect(deps.syncPiModelsCache).toHaveBeenCalledWith()
  })

  it('returns the result of syncPiModelsCache unchanged', async () => {
    const deps: HandlerDeps = {
      listPiModelsCached: vi.fn(),
      syncPiModelsCache: vi.fn().mockResolvedValue({ ok: true, added: 3 }),
    }
    const result = await syncPi(deps)
    expect(result).toEqual({ ok: true, added: 3 })
  })

  it('returns ok:true when sync succeeds', async () => {
    const deps: HandlerDeps = {
      listPiModelsCached: vi.fn(),
      syncPiModelsCache: vi.fn().mockResolvedValue({ ok: true }),
    }
    const result = await syncPi(deps)
    expect(result).toEqual({ ok: true })
  })

  it('returns ok:false with message when sync fails', async () => {
    const deps: HandlerDeps = {
      listPiModelsCached: vi.fn(),
      syncPiModelsCache: vi.fn().mockResolvedValue({
        ok: false,
        message: 'Network unreachable',
      }),
    }
    const result = await syncPi(deps)
    expect(result).toEqual({
      ok: false,
      message: 'Network unreachable',
    })
  })
})
