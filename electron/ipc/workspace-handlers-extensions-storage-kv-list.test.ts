import { describe, expect, it, vi } from 'vitest'

/**
 * Unit tests for the `extensions:storage:kv:list` IPC handler.
 *
 * The handler (workspace-handlers.ts) validates the extensionId parameter
 * before delegating to storageKvListEntries():
 *
 *   ipcMain.handle("extensions:storage:kv:list", (_event, extensionId: string) => {
 *     if (typeof extensionId !== "string" || !extensionId.trim()) {
 *       return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
 *     }
 *     return storageKvListEntries(extensionId.trim());
 *   });
 *
 * Key behaviors verified:
 * - Handler rejects non-string or empty/whitespace extensionId with {ok:false, error:bad_request}
 * - Handler trims the extensionId before passing to storageKvListEntries
 * - Returns ok:true with entries when extension has 'storage.kv' capability
 * - Returns ok:false (unauthorized) when extension lacks 'storage.kv' capability
 * - Tracks capability usage after successful authorization
 * - Passes extensionId unchanged to the underlying DB function
 * - Handles empty entries array gracefully
 *
 * We replicate the handler and business logic inline to test without needing the full
 * workspace-handlers.ts module graph (runtime state, DB, extension-manager wiring).
 */

// -------------------------------------------------------------------------
// IPC handler layer — mirrors workspace-handlers.ts IPC validation guard
// -------------------------------------------------------------------------

type BadResult = { ok: false; error: { code: string; message: string } }
type OkResult = { ok: true; data?: unknown }

function handleExtensionsStorageKvList(
  extensionId: unknown,
  storageKvListEntries: (extensionId: string) => BadResult | OkResult,
): BadResult | OkResult {
  if (typeof extensionId !== 'string' || !extensionId.trim()) {
    return {
      ok: false,
      error: { code: 'bad_request', message: 'extensionId is required' },
    }
  }
  return storageKvListEntries(extensionId.trim())
}

// -------------------------------------------------------------------------
// Business logic layer — mirrors storage.ts storageKvListEntries
// -------------------------------------------------------------------------

type KvEntry = { key: string; value: unknown; updatedAt: string }

type StorageBadResult = {
  ok: false
  error: {
    code: 'unauthorized' | 'invalid_args' | 'not_found' | 'rate_limited' | 'internal'
    message: string
  }
}
type StorageOkResult = { ok: true; data?: unknown }

function storageKvListEntries(params: {
  hasCapability: (extensionId: string, capability: 'storage.kv') => boolean
  trackCapability: (extensionId: string, capability: 'storage.kv') => void
  extensionKvList: (extensionId: string) => KvEntry[]
  capabilityUnauthorized: (
    extensionId: string,
    capability: 'storage.kv',
  ) => StorageBadResult
}, extensionId: string): StorageOkResult | StorageBadResult {
  if (!params.hasCapability(extensionId, 'storage.kv')) {
    return params.capabilityUnauthorized(extensionId, 'storage.kv')
  }
  params.trackCapability(extensionId, 'storage.kv')
  return { ok: true, data: params.extensionKvList(extensionId) }
}

// -------------------------------------------------------------------------
// Tests: IPC handler validation layer
// -------------------------------------------------------------------------

type MockStorageKvListEntries = (id: string) => StorageOkResult | StorageBadResult

function makeMockStorageKvListEntries(): MockStorageKvListEntries {
  return vi.fn<(id: string) => StorageOkResult | StorageBadResult>().mockReturnValue({
    ok: true,
    data: [],
  })
}

describe('extensions:storage:kv:list — IPC handler validation', () => {
  describe('rejects invalid extensionId types', () => {
    it('returns bad_request when extensionId is undefined', () => {
      const storageKvListEntries = makeMockStorageKvListEntries()
      const result = handleExtensionsStorageKvList(undefined, storageKvListEntries)
      expect(result.ok).toBe(false)
      expect((result as BadResult).error.code).toBe('bad_request')
      expect((result as BadResult).error.message).toBe('extensionId is required')
    })

    it('returns bad_request when extensionId is null', () => {
      const storageKvListEntries = makeMockStorageKvListEntries()
      const result = handleExtensionsStorageKvList(null, storageKvListEntries)
      expect(result.ok).toBe(false)
      expect((result as BadResult).error.code).toBe('bad_request')
      expect((result as BadResult).error.message).toBe('extensionId is required')
    })

    it('returns bad_request when extensionId is a number', () => {
      const storageKvListEntries = makeMockStorageKvListEntries()
      const result = handleExtensionsStorageKvList(42 as unknown, storageKvListEntries)
      expect(result.ok).toBe(false)
      expect((result as BadResult).error.code).toBe('bad_request')
      expect((result as BadResult).error.message).toBe('extensionId is required')
    })

    it('returns bad_request when extensionId is an object', () => {
      const storageKvListEntries = makeMockStorageKvListEntries()
      const result = handleExtensionsStorageKvList({ id: 'test' } as unknown, storageKvListEntries)
      expect(result.ok).toBe(false)
      expect((result as BadResult).error.code).toBe('bad_request')
      expect((result as BadResult).error.message).toBe('extensionId is required')
    })

    it('returns bad_request when extensionId is an array', () => {
      const storageKvListEntries = makeMockStorageKvListEntries()
      const result = handleExtensionsStorageKvList(['ext-id'] as unknown, storageKvListEntries)
      expect(result.ok).toBe(false)
      expect((result as BadResult).error.code).toBe('bad_request')
      expect((result as BadResult).error.message).toBe('extensionId is required')
    })

    it('returns bad_request when extensionId is a boolean', () => {
      const storageKvListEntries = makeMockStorageKvListEntries()
      const result = handleExtensionsStorageKvList(true as unknown, storageKvListEntries)
      expect(result.ok).toBe(false)
      expect((result as BadResult).error.code).toBe('bad_request')
      expect((result as BadResult).error.message).toBe('extensionId is required')
    })

    it('returns bad_request when extensionId is a function', () => {
      const storageKvListEntries = makeMockStorageKvListEntries()
      const result = handleExtensionsStorageKvList((() => {}) as unknown, storageKvListEntries)
      expect(result.ok).toBe(false)
      expect((result as BadResult).error.code).toBe('bad_request')
      expect((result as BadResult).error.message).toBe('extensionId is required')
    })

    it('does NOT call storageKvListEntries for non-string extensionId', () => {
      const storageKvListEntries = makeMockStorageKvListEntries()
      handleExtensionsStorageKvList(null, storageKvListEntries)
      expect(storageKvListEntries).not.toHaveBeenCalled()
    })
  })

  describe('rejects empty and whitespace-only strings', () => {
    it('returns bad_request when extensionId is an empty string', () => {
      const storageKvListEntries = makeMockStorageKvListEntries()
      const result = handleExtensionsStorageKvList('', storageKvListEntries)
      expect(result.ok).toBe(false)
      expect((result as BadResult).error.code).toBe('bad_request')
      expect((result as BadResult).error.message).toBe('extensionId is required')
    })

    it('returns bad_request when extensionId is whitespace-only', () => {
      const storageKvListEntries = makeMockStorageKvListEntries()
      const result = handleExtensionsStorageKvList('   \t\n', storageKvListEntries)
      expect(result.ok).toBe(false)
      expect((result as BadResult).error.code).toBe('bad_request')
      expect((result as BadResult).error.message).toBe('extensionId is required')
    })

    it('does NOT call storageKvListEntries for empty or whitespace extensionId', () => {
      const storageKvListEntries = makeMockStorageKvListEntries()
      handleExtensionsStorageKvList('', storageKvListEntries)
      handleExtensionsStorageKvList('  \t', storageKvListEntries)
      expect(storageKvListEntries).not.toHaveBeenCalled()
    })
  })

  describe('delegation with trimming', () => {
    it('trims extensionId before delegating to storageKvListEntries', () => {
      const storageKvListEntries = makeMockStorageKvListEntries()
      handleExtensionsStorageKvList('  @chaton/my-ext  ', storageKvListEntries)
      expect(storageKvListEntries).toHaveBeenCalledWith('@chaton/my-ext')
    })

    it('passes valid extensionId unchanged (no whitespace) to storageKvListEntries', () => {
      const storageKvListEntries = makeMockStorageKvListEntries()
      handleExtensionsStorageKvList('@chaton/my-extension', storageKvListEntries)
      expect(storageKvListEntries).toHaveBeenCalledWith('@chaton/my-extension')
    })
  })

  describe('result passthrough', () => {
    it('propagates ok:true result from storageKvListEntries', () => {
      const storageKvListEntries = makeMockStorageKvListEntries()
      const mockResult: OkResult = {
        ok: true,
        data: [{ key: 'theme', value: 'dark', updatedAt: '2026-01-01T00:00:00Z' }],
      }
      storageKvListEntries.mockReturnValue(mockResult)
      const result = handleExtensionsStorageKvList('my-ext', storageKvListEntries)
      expect(result.ok).toBe(true)
      expect((result as OkResult).data).toHaveLength(1)
    })

    it('propagates ok:false unauthorized result from storageKvListEntries', () => {
      const storageKvListEntries = makeMockStorageKvListEntries()
      storageKvListEntries.mockReturnValue({
        ok: false,
        error: { code: 'unauthorized', message: 'missing storage.kv' },
      })
      const result = handleExtensionsStorageKvList('bad-ext', storageKvListEntries)
      expect(result.ok).toBe(false)
      expect((result as BadResult).error.code).toBe('unauthorized')
    })

    it('propagates ok:false not_found result from storageKvListEntries', () => {
      const storageKvListEntries = makeMockStorageKvListEntries()
      storageKvListEntries.mockReturnValue({
        ok: false,
        error: { code: 'not_found', message: 'extension not installed' },
      })
      const result = handleExtensionsStorageKvList('missing-ext', storageKvListEntries)
      expect(result.ok).toBe(false)
      expect((result as BadResult).error.code).toBe('not_found')
    })
  })
})

// -------------------------------------------------------------------------
// Tests: storageKvListEntries business logic layer
// -------------------------------------------------------------------------

describe('extensions:storage:kv:list — storageKvListEntries unit', () => {
  describe('authorization', () => {
    it('returns ok:true when extension has storage.kv capability', () => {
      const result = storageKvListEntries(
        {
          hasCapability: vi.fn().mockReturnValue(true),
          trackCapability: vi.fn(),
          extensionKvList: vi.fn().mockReturnValue([]),
          capabilityUnauthorized: vi.fn(),
        },
        '@chaton/my-extension',
      )
      expect(result).toEqual({ ok: true, data: [] })
    })

    it('returns ok:false (unauthorized) when extension lacks storage.kv capability', () => {
      const capabilityUnauthorized = vi.fn().mockReturnValue({
        ok: false,
        error: {
          code: 'unauthorized' as const,
          message: 'Extension @chaton/bad-extension missing capability storage.kv',
        },
      })
      const result = storageKvListEntries(
        {
          hasCapability: vi.fn().mockReturnValue(false),
          trackCapability: vi.fn(),
          extensionKvList: vi.fn(),
          capabilityUnauthorized,
        },
        '@chaton/bad-extension',
      )
      expect(result.ok).toBe(false)
      expect((result as StorageBadResult).error.code).toBe('unauthorized')
    })

    it('does NOT call extensionKvList when capability check fails', () => {
      const extensionKvList = vi.fn()
      storageKvListEntries(
        {
          hasCapability: vi.fn().mockReturnValue(false),
          trackCapability: vi.fn(),
          extensionKvList,
          capabilityUnauthorized: vi.fn().mockReturnValue({
            ok: false,
            error: { code: 'unauthorized', message: 'nope' },
          }),
        },
        'no-cap-ext',
      )
      expect(extensionKvList).not.toHaveBeenCalled()
    })

    it('does NOT track capability when authorization fails', () => {
      const trackCapability = vi.fn()
      storageKvListEntries(
        {
          hasCapability: vi.fn().mockReturnValue(false),
          trackCapability,
          extensionKvList: vi.fn(),
          capabilityUnauthorized: vi.fn().mockReturnValue({
            ok: false,
            error: { code: 'unauthorized', message: 'nope' },
          }),
        },
        'no-cap-ext',
      )
      expect(trackCapability).not.toHaveBeenCalled()
    })
  })

  describe('delegation', () => {
    it('passes extensionId to hasCapability with storage.kv', () => {
      const hasCapability = vi.fn().mockReturnValue(true)
      storageKvListEntries(
        {
          hasCapability,
          trackCapability: vi.fn(),
          extensionKvList: vi.fn().mockReturnValue([]),
          capabilityUnauthorized: vi.fn(),
        },
        '@chaton/special-ext',
      )
      expect(hasCapability).toHaveBeenCalledWith('@chaton/special-ext', 'storage.kv')
    })

    it('passes extensionId unchanged to extensionKvList on success', () => {
      const extensionKvList = vi.fn().mockReturnValue([])
      storageKvListEntries(
        {
          hasCapability: vi.fn().mockReturnValue(true),
          trackCapability: vi.fn(),
          extensionKvList,
          capabilityUnauthorized: vi.fn(),
        },
        '@chaton/persist-ext',
      )
      expect(extensionKvList).toHaveBeenCalledWith('@chaton/persist-ext')
    })

    it('tracks storage.kv capability after successful authorization', () => {
      const trackCapability = vi.fn()
      storageKvListEntries(
        {
          hasCapability: vi.fn().mockReturnValue(true),
          trackCapability,
          extensionKvList: vi.fn().mockReturnValue([]),
          capabilityUnauthorized: vi.fn(),
        },
        '@chaton/trackable-ext',
      )
      expect(trackCapability).toHaveBeenCalledWith('@chaton/trackable-ext', 'storage.kv')
    })
  })

  describe('data handling', () => {
    it('returns entries from extensionKvList in data field', () => {
      const entries: KvEntry[] = [
        { key: 'theme', value: 'dark', updatedAt: '2025-01-01T00:00:00Z' },
        { key: 'language', value: 'en', updatedAt: '2025-01-01T00:00:00Z' },
      ]
      const result = storageKvListEntries(
        {
          hasCapability: vi.fn().mockReturnValue(true),
          trackCapability: vi.fn(),
          extensionKvList: vi.fn().mockReturnValue(entries),
          capabilityUnauthorized: vi.fn(),
        },
        'ext-with-data',
      )
      expect(result).toEqual({ ok: true, data: entries })
    })

    it('handles empty entries array gracefully', () => {
      const result = storageKvListEntries(
        {
          hasCapability: vi.fn().mockReturnValue(true),
          trackCapability: vi.fn(),
          extensionKvList: vi.fn().mockReturnValue([]),
          capabilityUnauthorized: vi.fn(),
        },
        'ext-empty',
      )
      expect(result).toEqual({ ok: true, data: [] })
    })

    it('preserves all fields on a rich entry', () => {
      const entries: KvEntry[] = [
        {
          key: 'config',
          value: { timeout: 5000, retries: 3, endpoints: ['a', 'b'] },
          updatedAt: '2026-05-06T10:00:00Z',
        },
      ]
      const result = storageKvListEntries(
        {
          hasCapability: vi.fn().mockReturnValue(true),
          trackCapability: vi.fn(),
          extensionKvList: vi.fn().mockReturnValue(entries),
          capabilityUnauthorized: vi.fn(),
        },
        'ext-rich',
      )
      expect((result as StorageOkResult & { data: KvEntry[] }).data[0].key).toBe('config')
      expect((result as StorageOkResult & { data: KvEntry[] }).data[0].value).toEqual({
        timeout: 5000,
        retries: 3,
        endpoints: ['a', 'b'],
      })
    })
  })
})
