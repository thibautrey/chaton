import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `extensions:storage:kv:get` IPC handler.
 *
 * Handler (workspace-handlers.ts lines ~2505–2516):
 *   ipcMain.handle("extensions:storage:kv:get",
 *     (_event, extensionId: string, key: string) => {
 *       if (typeof extensionId !== "string" || !extensionId.trim()) {
 *         return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
 *       }
 *       if (typeof key !== "string") {
 *         return { ok: false, error: { code: "bad_request", message: "key must be a string" } };
 *       }
 *       return storageKvGet(extensionId.trim(), key);
 *     });
 *
 * Validation coverage:
 * - extensionId must be a non-empty string after trim (null/undefined/number/object/array/boolean/empty/whitespace rejected)
 * - key must be a string (null/undefined/number/object/array/boolean rejected; empty string accepted — storageKvGet handles it)
 * - extensionId is trimmed before delegation
 * - value is delegated directly (no transformation)
 */

type ExtensionHostCallResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: { code: string; message: string } }

type HandlerResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: { code: string; message: string } }

// Inline handler mirrors workspace-handlers.ts lines 2505–2516
function handleExtensionsStorageKvGet(params: {
  extensionId: unknown
  key: unknown
  storageKvGet: (extensionId: string, key: string) => HandlerResult
}): HandlerResult {
  const { extensionId, key, storageKvGet } = params
  if (typeof extensionId !== 'string' || !extensionId.trim()) {
    return { ok: false, error: { code: 'bad_request', message: 'extensionId is required' } }
  }
  if (typeof key !== 'string') {
    return { ok: false, error: { code: 'bad_request', message: 'key must be a string' } }
  }
  return storageKvGet(extensionId.trim(), key)
}

describe('extensions:storage:kv:get', () => {
  const makeStorageKvGet = (result: HandlerResult = { ok: true, data: 'stored-value' }) =>
    vi.fn<[string, string], HandlerResult>().mockReturnValue(result)

  // ── extensionId validation ────────────────────────────────────────────────

  it('returns error when extensionId is null', () => {
    const storageKvGet = makeStorageKvGet()
    const result = handleExtensionsStorageKvGet({ extensionId: null, key: 'my-key', storageKvGet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvGet).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is undefined', () => {
    const storageKvGet = makeStorageKvGet()
    const result = handleExtensionsStorageKvGet({ extensionId: undefined, key: 'my-key', storageKvGet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvGet).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is a number', () => {
    const storageKvGet = makeStorageKvGet()
    const result = handleExtensionsStorageKvGet({ extensionId: 42, key: 'my-key', storageKvGet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvGet).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is an object', () => {
    const storageKvGet = makeStorageKvGet()
    const result = handleExtensionsStorageKvGet({ extensionId: { id: 'ext-1' }, key: 'my-key', storageKvGet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvGet).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is an array', () => {
    const storageKvGet = makeStorageKvGet()
    const result = handleExtensionsStorageKvGet({ extensionId: ['ext-1', 'ext-2'], key: 'my-key', storageKvGet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvGet).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is a boolean', () => {
    const storageKvGet = makeStorageKvGet()
    const result = handleExtensionsStorageKvGet({ extensionId: true, key: 'my-key', storageKvGet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvGet).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is a function', () => {
    const storageKvGet = makeStorageKvGet()
    const result = handleExtensionsStorageKvGet({ extensionId: () => 'x', key: 'my-key', storageKvGet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvGet).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is an empty string', () => {
    const storageKvGet = makeStorageKvGet()
    const result = handleExtensionsStorageKvGet({ extensionId: '', key: 'my-key', storageKvGet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvGet).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is whitespace-only', () => {
    const storageKvGet = makeStorageKvGet()
    const result = handleExtensionsStorageKvGet({ extensionId: '   \t\n  ', key: 'my-key', storageKvGet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvGet).not.toHaveBeenCalled()
  })

  // ── extensionId trimming ──────────────────────────────────────────────────

  it('trims whitespace from extensionId before calling storageKvGet', () => {
    const storageKvGet = makeStorageKvGet()
    handleExtensionsStorageKvGet({ extensionId: '  ext-1  ', key: 'my-key', storageKvGet })
    expect(storageKvGet).toHaveBeenCalledOnce()
    expect(storageKvGet).toHaveBeenCalledWith('ext-1', 'my-key')
  })

  // ── key validation ────────────────────────────────────────────────────────

  it('returns error when key is null', () => {
    const storageKvGet = makeStorageKvGet()
    const result = handleExtensionsStorageKvGet({ extensionId: 'ext-1', key: null, storageKvGet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'key must be a string' } })
    expect(storageKvGet).not.toHaveBeenCalled()
  })

  it('returns error when key is undefined', () => {
    const storageKvGet = makeStorageKvGet()
    const result = handleExtensionsStorageKvGet({ extensionId: 'ext-1', key: undefined, storageKvGet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'key must be a string' } })
    expect(storageKvGet).not.toHaveBeenCalled()
  })

  it('returns error when key is a number', () => {
    const storageKvGet = makeStorageKvGet()
    const result = handleExtensionsStorageKvGet({ extensionId: 'ext-1', key: 123, storageKvGet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'key must be a string' } })
    expect(storageKvGet).not.toHaveBeenCalled()
  })

  it('returns error when key is an object', () => {
    const storageKvGet = makeStorageKvGet()
    const result = handleExtensionsStorageKvGet({ extensionId: 'ext-1', key: { k: 'v' }, storageKvGet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'key must be a string' } })
    expect(storageKvGet).not.toHaveBeenCalled()
  })

  it('returns error when key is an array', () => {
    const storageKvGet = makeStorageKvGet()
    const result = handleExtensionsStorageKvGet({ extensionId: 'ext-1', key: ['k1', 'k2'], storageKvGet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'key must be a string' } })
    expect(storageKvGet).not.toHaveBeenCalled()
  })

  it('returns error when key is a boolean', () => {
    const storageKvGet = makeStorageKvGet()
    const result = handleExtensionsStorageKvGet({ extensionId: 'ext-1', key: true, storageKvGet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'key must be a string' } })
    expect(storageKvGet).not.toHaveBeenCalled()
  })

  it('returns error when key is a function', () => {
    const storageKvGet = makeStorageKvGet()
    const result = handleExtensionsStorageKvGet({ extensionId: 'ext-1', key: () => 'k', storageKvGet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'key must be a string' } })
    expect(storageKvGet).not.toHaveBeenCalled()
  })

  // Note: empty string for key is accepted — storageKvGet handles it (returns null/undefined data)

  // ── Valid input ───────────────────────────────────────────────────────────

  it('delegates to storageKvGet with trimmed extensionId and key', () => {
    const storageKvGet = makeStorageKvGet({ ok: true, data: { value: 42 } })
    const result = handleExtensionsStorageKvGet({ extensionId: '  ext-1  ', key: 'my-key', storageKvGet })
    expect(result).toEqual({ ok: true, data: { value: 42 } })
    expect(storageKvGet).toHaveBeenCalledOnce()
    expect(storageKvGet).toHaveBeenCalledWith('ext-1', 'my-key')
  })

  it('passes through unauthorized result from storageKvGet', () => {
    const storageKvGet = makeStorageKvGet({
      ok: false,
      error: { code: 'unauthorized', message: 'missing storage.kv capability' },
    })
    const result = handleExtensionsStorageKvGet({ extensionId: 'bad-ext', key: 'k', storageKvGet })
    expect(result).toEqual({ ok: false, error: { code: 'unauthorized', message: 'missing storage.kv capability' } })
  })

  it('calls storageKvGet exactly once per invocation', () => {
    const storageKvGet = makeStorageKvGet()
    handleExtensionsStorageKvGet({ extensionId: 'ext-1', key: 'k', storageKvGet })
    expect(storageKvGet).toHaveBeenCalledTimes(1)
  })

  it('returns ok:true with null data when key does not exist', () => {
    const storageKvGet = makeStorageKvGet({ ok: true, data: null })
    const result = handleExtensionsStorageKvGet({ extensionId: 'ext-1', key: 'nonexistent', storageKvGet })
    expect(result).toEqual({ ok: true, data: null })
  })
})
