import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `extensions:storage:kv:delete` IPC handler.
 *
 * Handler (workspace-handlers.ts lines ~2529–2542):
 *   ipcMain.handle("extensions:storage:kv:delete",
 *     (_event, extensionId: string, key: string) => {
 *       if (typeof extensionId !== "string" || !extensionId.trim()) {
 *         return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
 *       }
 *       if (typeof key !== "string") {
 *         return { ok: false, error: { code: "bad_request", message: "key must be a string" } };
 *       }
 *       return storageKvDeleteEntry(extensionId.trim(), key);
 *     });
 *
 * Validation coverage:
 * - extensionId must be a non-empty string after trim (null/undefined/number/object/array/boolean/empty/whitespace rejected)
 * - key must be a string (null/undefined/number/object/array/boolean rejected)
 * - extensionId is trimmed before delegation
 * - value is passed through directly (no transformation)
 */

type HandlerResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: { code: string; message: string } }

// Inline handler mirrors workspace-handlers.ts lines 2529–2542
function handleExtensionsStorageKvDelete(params: {
  extensionId: unknown
  key: unknown
  storageKvDeleteEntry: (extensionId: string, key: string) => HandlerResult
}): HandlerResult {
  const { extensionId, key, storageKvDeleteEntry } = params
  if (typeof extensionId !== 'string' || !extensionId.trim()) {
    return { ok: false, error: { code: 'bad_request', message: 'extensionId is required' } }
  }
  if (typeof key !== 'string') {
    return { ok: false, error: { code: 'bad_request', message: 'key must be a string' } }
  }
  return storageKvDeleteEntry(extensionId.trim(), key)
}

describe('extensions:storage:kv:delete', () => {
  const makeStorageKvDeleteEntry = (result: HandlerResult = { ok: true, data: { removed: true } }) =>
    vi.fn<[string, string], HandlerResult>().mockReturnValue(result)

  // ── extensionId validation ────────────────────────────────────────────────

  it('returns error when extensionId is null', () => {
    const storageKvDeleteEntry = makeStorageKvDeleteEntry()
    const result = handleExtensionsStorageKvDelete({ extensionId: null, key: 'my-key', storageKvDeleteEntry })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvDeleteEntry).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is undefined', () => {
    const storageKvDeleteEntry = makeStorageKvDeleteEntry()
    const result = handleExtensionsStorageKvDelete({ extensionId: undefined, key: 'my-key', storageKvDeleteEntry })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvDeleteEntry).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is a number', () => {
    const storageKvDeleteEntry = makeStorageKvDeleteEntry()
    const result = handleExtensionsStorageKvDelete({ extensionId: 7, key: 'my-key', storageKvDeleteEntry })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvDeleteEntry).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is an object', () => {
    const storageKvDeleteEntry = makeStorageKvDeleteEntry()
    const result = handleExtensionsStorageKvDelete({ extensionId: { id: 'x' }, key: 'my-key', storageKvDeleteEntry })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvDeleteEntry).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is an array', () => {
    const storageKvDeleteEntry = makeStorageKvDeleteEntry()
    const result = handleExtensionsStorageKvDelete({ extensionId: ['e1'], key: 'my-key', storageKvDeleteEntry })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvDeleteEntry).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is a boolean', () => {
    const storageKvDeleteEntry = makeStorageKvDeleteEntry()
    const result = handleExtensionsStorageKvDelete({ extensionId: true, key: 'my-key', storageKvDeleteEntry })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvDeleteEntry).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is a function', () => {
    const storageKvDeleteEntry = makeStorageKvDeleteEntry()
    const result = handleExtensionsStorageKvDelete({ extensionId: () => 'x', key: 'my-key', storageKvDeleteEntry })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvDeleteEntry).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is an empty string', () => {
    const storageKvDeleteEntry = makeStorageKvDeleteEntry()
    const result = handleExtensionsStorageKvDelete({ extensionId: '', key: 'my-key', storageKvDeleteEntry })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvDeleteEntry).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is whitespace-only', () => {
    const storageKvDeleteEntry = makeStorageKvDeleteEntry()
    const result = handleExtensionsStorageKvDelete({ extensionId: '  \t\n  ', key: 'my-key', storageKvDeleteEntry })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageKvDeleteEntry).not.toHaveBeenCalled()
  })

  // ── extensionId trimming ──────────────────────────────────────────────────

  it('trims whitespace from extensionId before calling storageKvDeleteEntry', () => {
    const storageKvDeleteEntry = makeStorageKvDeleteEntry()
    handleExtensionsStorageKvDelete({ extensionId: '  ext-1  ', key: 'my-key', storageKvDeleteEntry })
    expect(storageKvDeleteEntry).toHaveBeenCalledOnce()
    expect(storageKvDeleteEntry).toHaveBeenCalledWith('ext-1', 'my-key')
  })

  // ── key validation ────────────────────────────────────────────────────────

  it('returns error when key is null', () => {
    const storageKvDeleteEntry = makeStorageKvDeleteEntry()
    const result = handleExtensionsStorageKvDelete({ extensionId: 'ext-1', key: null, storageKvDeleteEntry })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'key must be a string' } })
    expect(storageKvDeleteEntry).not.toHaveBeenCalled()
  })

  it('returns error when key is undefined', () => {
    const storageKvDeleteEntry = makeStorageKvDeleteEntry()
    const result = handleExtensionsStorageKvDelete({ extensionId: 'ext-1', key: undefined, storageKvDeleteEntry })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'key must be a string' } })
    expect(storageKvDeleteEntry).not.toHaveBeenCalled()
  })

  it('returns error when key is a number', () => {
    const storageKvDeleteEntry = makeStorageKvDeleteEntry()
    const result = handleExtensionsStorageKvDelete({ extensionId: 'ext-1', key: 1, storageKvDeleteEntry })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'key must be a string' } })
    expect(storageKvDeleteEntry).not.toHaveBeenCalled()
  })

  it('returns error when key is an object', () => {
    const storageKvDeleteEntry = makeStorageKvDeleteEntry()
    const result = handleExtensionsStorageKvDelete({ extensionId: 'ext-1', key: { k: 'v' }, storageKvDeleteEntry })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'key must be a string' } })
    expect(storageKvDeleteEntry).not.toHaveBeenCalled()
  })

  it('returns error when key is an array', () => {
    const storageKvDeleteEntry = makeStorageKvDeleteEntry()
    const result = handleExtensionsStorageKvDelete({ extensionId: 'ext-1', key: ['k1', 'k2'], storageKvDeleteEntry })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'key must be a string' } })
    expect(storageKvDeleteEntry).not.toHaveBeenCalled()
  })

  it('returns error when key is a boolean', () => {
    const storageKvDeleteEntry = makeStorageKvDeleteEntry()
    const result = handleExtensionsStorageKvDelete({ extensionId: 'ext-1', key: false, storageKvDeleteEntry })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'key must be a string' } })
    expect(storageKvDeleteEntry).not.toHaveBeenCalled()
  })

  it('returns error when key is a function', () => {
    const storageKvDeleteEntry = makeStorageKvDeleteEntry()
    const result = handleExtensionsStorageKvDelete({ extensionId: 'ext-1', key: () => 'k', storageKvDeleteEntry })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'key must be a string' } })
    expect(storageKvDeleteEntry).not.toHaveBeenCalled()
  })

  // ── Valid input ───────────────────────────────────────────────────────────

  it('delegates to storageKvDeleteEntry with trimmed extensionId and key', () => {
    const storageKvDeleteEntry = makeStorageKvDeleteEntry({ ok: true, data: { removed: true } })
    const result = handleExtensionsStorageKvDelete({ extensionId: '  ext-1  ', key: 'my-key', storageKvDeleteEntry })
    expect(result).toEqual({ ok: true, data: { removed: true } })
    expect(storageKvDeleteEntry).toHaveBeenCalledOnce()
    expect(storageKvDeleteEntry).toHaveBeenCalledWith('ext-1', 'my-key')
  })

  it('passes through unauthorized result from storageKvDeleteEntry', () => {
    const storageKvDeleteEntry = makeStorageKvDeleteEntry({
      ok: false,
      error: { code: 'unauthorized', message: 'missing storage.kv capability' },
    })
    const result = handleExtensionsStorageKvDelete({ extensionId: 'bad-ext', key: 'k', storageKvDeleteEntry })
    expect(result).toEqual({ ok: false, error: { code: 'unauthorized', message: 'missing storage.kv capability' } })
  })

  it('calls storageKvDeleteEntry exactly once per invocation', () => {
    const storageKvDeleteEntry = makeStorageKvDeleteEntry()
    handleExtensionsStorageKvDelete({ extensionId: 'ext-1', key: 'k', storageKvDeleteEntry })
    expect(storageKvDeleteEntry).toHaveBeenCalledTimes(1)
  })

  it('returns ok:true when key does not exist (no-op delete)', () => {
    const storageKvDeleteEntry = makeStorageKvDeleteEntry({ ok: true, data: { removed: false } })
    const result = handleExtensionsStorageKvDelete({ extensionId: 'ext-1', key: 'nonexistent', storageKvDeleteEntry })
    expect(result).toEqual({ ok: true, data: { removed: false } })
  })
})
