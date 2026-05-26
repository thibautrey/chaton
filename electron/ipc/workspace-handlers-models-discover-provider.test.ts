import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `models:discoverProvider` IPC handler.
 *
 * The handler validates that `providerConfig` is a non-null, non-array object
 * before passing it to `discoverProviderModels`.  These tests verify the
 * validation contract and the passthrough of valid input.
 *
 * We replicate the handler logic inline to test without needing the full
 * workspace-handlers.ts module (which requires database, IPC, and PiRuntimeManager wiring).
 */

type DiscoverResult = { ok: boolean; models: unknown[]; message?: string }

interface HandlerDeps {
  discoverProviderModels: (
    providerConfig: Record<string, unknown>,
    providerId?: string,
  ) => Promise<DiscoverResult>
}

// Inline handler — mirrors workspace-handlers.ts lines 1585–1602
async function discoverProvider(
  deps: HandlerDeps,
  providerConfig: unknown,
  providerId?: string,
): Promise<DiscoverResult> {
  if (
    !providerConfig ||
    typeof providerConfig !== 'object' ||
    Array.isArray(providerConfig)
  ) {
    return {
      ok: false,
      models: [],
      message: 'Invalid provider configuration',
    }
  }
  return deps.discoverProviderModels(
    providerConfig as Record<string, unknown>,
    typeof providerId === 'string' ? providerId : undefined,
  )
}

describe('models:discoverProvider — input validation', () => {
  const deps: HandlerDeps = {
    discoverProviderModels: vi.fn().mockResolvedValue({
      ok: true,
      models: [{ id: 'test-model' }],
    }),
  }

  it('returns ok:false when providerConfig is null', async () => {
    const result = await discoverProvider(deps, null)
    expect(result).toEqual({
      ok: false,
      models: [],
      message: 'Invalid provider configuration',
    })
    expect(deps.discoverProviderModels).not.toHaveBeenCalled()
  })

  it('returns ok:false when providerConfig is undefined', async () => {
    const result = await discoverProvider(deps, undefined)
    expect(result).toEqual({
      ok: false,
      models: [],
      message: 'Invalid provider configuration',
    })
    expect(deps.discoverProviderModels).not.toHaveBeenCalled()
  })

  it('returns ok:false when providerConfig is a number', async () => {
    const result = await discoverProvider(deps, 42)
    expect(result).toEqual({
      ok: false,
      models: [],
      message: 'Invalid provider configuration',
    })
    expect(deps.discoverProviderModels).not.toHaveBeenCalled()
  })

  it('returns ok:false when providerConfig is a string', async () => {
    const result = await discoverProvider(deps, 'openai')
    expect(result).toEqual({
      ok: false,
      models: [],
      message: 'Invalid provider configuration',
    })
    expect(deps.discoverProviderModels).not.toHaveBeenCalled()
  })

  it('returns ok:false when providerConfig is an array', async () => {
    const result = await discoverProvider(deps, [{ id: 'model-1' }])
    expect(result).toEqual({
      ok: false,
      models: [],
      message: 'Invalid provider configuration',
    })
    expect(deps.discoverProviderModels).not.toHaveBeenCalled()
  })

  it('returns ok:false when providerConfig is a boolean', async () => {
    const result = await discoverProvider(deps, true)
    expect(result).toEqual({
      ok: false,
      models: [],
      message: 'Invalid provider configuration',
    })
    expect(deps.discoverProviderModels).not.toHaveBeenCalled()
  })

  it('returns ok:false when providerConfig is a function', async () => {
    const result = await discoverProvider(deps, () => {})
    expect(result).toEqual({
      ok: false,
      models: [],
      message: 'Invalid provider configuration',
    })
    expect(deps.discoverProviderModels).not.toHaveBeenCalled()
  })
})

describe('models:discoverProvider — valid passthrough', () => {
  it('passes providerConfig object to discoverProviderModels', async () => {
    const deps: HandlerDeps = {
      discoverProviderModels: vi.fn().mockResolvedValue({
        ok: true,
        models: [{ id: 'gpt-4o' }],
      }),
    }
    const config = { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test' }
    await discoverProvider(deps, config)
    expect(deps.discoverProviderModels).toHaveBeenCalledOnce()
    expect(deps.discoverProviderModels).toHaveBeenCalledWith(config, undefined)
  })

  it('passes providerId when it is a string', async () => {
    const deps: HandlerDeps = {
      discoverProviderModels: vi.fn().mockResolvedValue({
        ok: true,
        models: [],
      }),
    }
    const config = { baseUrl: 'https://api.example.com' }
    await discoverProvider(deps, config, 'custom-provider')
    expect(deps.discoverProviderModels).toHaveBeenCalledWith(
      config,
      'custom-provider',
    )
  })

  it('omits providerId when it is not a string', async () => {
    const deps: HandlerDeps = {
      discoverProviderModels: vi.fn().mockResolvedValue({
        ok: true,
        models: [],
      }),
    }
    const config = { baseUrl: 'https://api.example.com' }

    await discoverProvider(deps, config, 123 as unknown as string)
    expect(deps.discoverProviderModels).toHaveBeenCalledWith(config, undefined)

    await discoverProvider(deps, config, null as unknown as string)
    expect(deps.discoverProviderModels).toHaveBeenCalledWith(config, undefined)

    await discoverProvider(deps, config, undefined as unknown as string)
    expect(deps.discoverProviderModels).toHaveBeenCalledWith(config, undefined)
  })

  it('returns discoverProviderModels result unchanged when ok:true', async () => {
    const deps: HandlerDeps = {
      discoverProviderModels: vi.fn().mockResolvedValue({
        ok: true,
        models: [
          { id: 'model-a', name: 'Model A', maxTokens: 4096 },
          { id: 'model-b', name: 'Model B', maxTokens: 8192 },
        ],
      }),
    }
    const result = await discoverProvider(deps, { baseUrl: 'https://api.test.com' })
    expect(result.ok).toBe(true)
    expect(result.models).toHaveLength(2)
  })

  it('returns discoverProviderModels result unchanged when ok:false', async () => {
    const deps: HandlerDeps = {
      discoverProviderModels: vi.fn().mockResolvedValue({
        ok: false,
        models: [],
        message: 'Provider unreachable',
      }),
    }
    const result = await discoverProvider(deps, { baseUrl: 'https://bad-host' })
    expect(result).toEqual({
      ok: false,
      models: [],
      message: 'Provider unreachable',
    })
  })

  it('awaits discoverProviderModels even when it takes time', async () => {
    let resolve = false
    const deps: HandlerDeps = {
      discoverProviderModels: vi.fn().mockImplementation(() =>
        new Promise<DiscoverResult>((r) => {
          setTimeout(() => r({ ok: true, models: [] }), 10)
        }),
      ),
    }
    const promise = discoverProvider(deps, { baseUrl: 'https://slow.api' })
    expect(deps.discoverProviderModels).toHaveBeenCalled()
    const result = await promise
    expect(result.ok).toBe(true)
  })
})
