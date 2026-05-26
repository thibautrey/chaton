import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `extensions:storage:kv:set` IPC handler.
 *
 * Handler (workspace-handlers.ts lines ~2517–2528):
 *   ipcMain.handle("extensions:storage:kv:set",
 *     (_event, extensionId: string, key: string, value: unknown) => {
 *       if (typeof extensionId !== "string" || !extensionId.trim()) {
 *         return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
 *       }
 *       if (typeof key !== "string") {
 *         return { ok: false, error: { code: "bad_request", message: "key must be a string" } };
 *       }
 *       return storageKvSet(extensionId.trim(), key, value);
 *     });
 *
 * Validation coverage:
 * - extensionId must be a non-empty string after trim
 * - key must be a string (null/undefined/number/object/array/boolean rejected)
 * - value is passed through as-is (any JSON-serializable type accepted)
 * - extensionId is trimmed before delegation
 */

type HandlerResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: { code: string; message: string } }

// Inline handler mirrors workspace-handlers.ts lines 2517–2528
function handleExtensionsStorageKvSet(params: {
  extensionId: unknown
  key: unknown
  value: unknown
  storageKvSet: (extensionId: string, key: string, value: unknown) => HandlerResult
}): HandlerResult {
  const { extensionId, key, value, storageKvSet } = params
  if (typeof extensionId !== 'string' || !extensionId.trim()) {
    return { ok: false, error: { code: 'bad_request', message: 'extensionId is required' } }
  }
  if (typeof key !== 'string') {
    return { ok: false, error: { code: 'bad_request', message: 'key must be a string' } }
  }
  return storageKvSet(extensionId.trim(), key, value)
}

describe('extensions:storage:kv:set', () => {
  const makeStorageKvSet = (result: HandlerResult = { ok: true }) =>
    vi.fn<[string, string, unknown], HandlerResult>().mockReturnValue(result)

  // ── extensionId validation ────────────────────────────────────────────────

  it('returns error when extensionId is null', () => {
    const storageKvSet = makeStorageKvSet()
    const result = handleExtensionsStorageKvSet({ extensionId: null, key: 'my-key', value: 42, storageKvSet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvSet).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is undefined', () => {
    const storageKvSet = makeStorageKvSet()
    const result = handleExtensionsStorageKvSet({ extensionId: undefined, key: 'my-key', value: 42, storageKvSet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvSet).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is a number', () => {
    const storageKvSet = makeStorageKvSet()
    const result = handleExtensionsStorageKvSet({ extensionId: 99, key: 'my-key', value: 42, storageKvSet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvSet).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is an object', () => {
    const storageKvSet = makeStorageKvSet()
    const result = handleExtensionsStorageKvSet({ extensionId: { id: 'x' }, key: 'my-key', value: 42, storageKvSet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvSet).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is an array', () => {
    const storageKvSet = makeStorageKvSet()
    const result = handleExtensionsStorageKvSet({ extensionId: ['e1', 'e2'], key: 'my-key', value: 42, storageKvSet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvSet).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is a boolean', () => {
    const storageKvSet = makeStorageKvSet()
    const result = handleExtensionsStorageKvSet({ extensionId: false, key: 'my-key', value: 42, storageKvSet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvSet).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is a function', () => {
    const storageKvSet = makeStorageKvSet()
    const result = handleExtensionsStorageKvSet({ extensionId: () => 'x', key: 'my-key', value: 42, storageKvSet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvSet).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is an empty string', () => {
    const storageKvSet = makeStorageKvSet()
    const result = handleExtensionsStorageKvSet({ extensionId: '', key: 'my-key', value: 42, storageKvSet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvSet).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is whitespace-only', () => {
    const storageKvSet = makeStorageKvSet()
    const result = handleExtensionsStorageKvSet({ extensionId: '  \t  ', key: 'my-key', value: 42, storageKvSet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvSet).not.toHaveBeenCalled()
  })

  // ── extensionId trimming ──────────────────────────────────────────────────

  it('trims whitespace from extensionId before calling storageKvSet', () => {
    const storageKvSet = makeStorageKvSet()
    handleExtensionsStorageKvSet({ extensionId: '  ext-1  ', key: 'my-key', value: 42, storageKvSet })
    expect(storageKvSet).toHaveBeenCalledOnce()
    expect(storageKvSet).toHaveBeenCalledWith('ext-1', 'my-key', 42)
  })

  // ── key validation ────────────────────────────────────────────────────────

  it('returns error when key is null', () => {
    const storageKvSet = makeStorageKvSet()
    const result = handleExtensionsStorageKvSet({ extensionId: 'ext-1', key: null, value: 42, storageKvSet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'key must be a string' } })
    expect(storageKvSet).not.toHaveBeenCalled()
  })

  it('returns error when key is undefined', () => {
    const storageKvSet = makeStorageKvSet()
    const result = handleExtensionsStorageKvSet({ extensionId: 'ext-1', key: undefined, value: 42, storageKvSet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'key must be a string' } })
    expect(storageKvSet).not.toHaveBeenCalled()
  })

  it('returns error when key is a number', () => {
    const storageKvSet = makeStorageKvSet()
    const result = handleExtensionsStorageKvSet({ extensionId: 'ext-1', key: 1, value: 42, storageKvSet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'key must be a string' } })
    expect(storageKvSet).not.toHaveBeenCalled()
  })

  it('returns error when key is an object', () => {
    const storageKvSet = makeStorageKvSet()
    const result = handleExtensionsStorageKvSet({ extensionId: 'ext-1', key: { k: 'v' }, value: 42, storageKvSet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'key must be a string' } })
    expect(storageKvSet).not.toHaveBeenCalled()
  })

  it('returns error when key is an array', () => {
    const storageKvSet = makeStorageKvSet()
    const result = handleExtensionsStorageKvSet({ extensionId: 'ext-1', key: ['k1', 'k2'], value: 42, storageKvSet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'key must be a string' } })
    expect(storageKvSet).not.toHaveBeenCalled()
  })

  it('returns error when key is a boolean', () => {
    const storageKvSet = makeStorageKvSet()
    const result = handleExtensionsStorageKvSet({ extensionId: 'ext-1', key: true, value: 42, storageKvSet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'key must be a string' } })
    expect(storageKvSet).not.toHaveBeenCalled()
  })

  it('returns error when key is a function', () => {
    const storageKvSet = makeStorageKvSet()
    const result = handleExtensionsStorageKvSet({ extensionId: 'ext-1', key: () => 'k', value: 42, storageKvSet })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'key must be a string' } })
    expect(storageKvSet).not.toHaveBeenCalled()
  })

  // ── Valid input ───────────────────────────────────────────────────────────

  it('accepts null as value', () => {
    const storageKvSet = makeStorageKvSet()
    const result = handleExtensionsStorageKvSet({ extensionId: 'ext-1', key: 'my-key', value: null, storageKvSet })
    expect(result).toEqual({ ok: true })
    expect(storageKvSet).toHaveBeenCalledOnce()
    expect(storageKvSet).toHaveBeenCalledWith('ext-1', 'my-key', null)
  })

  it('accepts object as value', () => {
    const storageKvSet = makeStorageKvSet()
    const val = { nested: { value: [1, 2, 3] } }
    const result = handleExtensionsStorageKvSet({ extensionId: 'ext-1', key: 'my-key', value: val, storageKvSet })
    expect(result).toEqual({ ok: true })
    expect(storageKvSet).toHaveBeenCalledOnce()
    expect(storageKvSet).toHaveBeenCalledWith('ext-1', 'my-key', val)
  })

  it('accepts array as value', () => {
    const storageKvSet = makeStorageKvSet()
    const result = handleExtensionsStorageKvSet({ extensionId: 'ext-1', key: 'my-key', value: ['a', 'b'], storageKvSet })
    expect(result).toEqual({ ok: true })
    expect(storageKvSet).toHaveBeenCalledOnce()
    expect(storageKvSet).toHaveBeenCalledWith('ext-1', 'my-key', ['a', 'b'])
  })

  it('passes through unauthorized result from storageKvSet', () => {
    const storageKvSet = makeStorageKvSet({
      ok: false,
      error: { code: 'unauthorized', message: 'missing storage.kv capability' },
    })
    const result = handleExtensionsStorageKvSet({ extensionId: 'bad-ext', key: 'k', value: 1, storageKvSet })
    expect(result).toEqual({ ok: false, error: { code: 'unauthorized', message: 'missing storage.kv capability' } })
  })

  it('calls storageKvSet exactly once per invocation', () => {
    const storageKvSet = makeStorageKvSet()
    handleExtensionsStorageKvSet({ extensionId: 'ext-1', key: 'k', value: 'val', storageKvSet })
    expect(storageKvSet).toHaveBeenCalledTimes(1)
  })
})
