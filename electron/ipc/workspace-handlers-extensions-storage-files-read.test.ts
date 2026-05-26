import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `extensions:storage:files:read` IPC handler.
 *
 * Handler (workspace-handlers.ts lines ~2595–2607):
 *   ipcMain.handle("extensions:storage:files:read",
 *     (_event, extensionId: string, relativePath: string) => {
 *       if (typeof extensionId !== "string" || !extensionId.trim()) {
 *         return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
 *       }
 *       if (typeof relativePath !== "string") {
 *         return { ok: false, error: { code: "bad_request", message: "relativePath must be a string" } };
 *       }
 *       return storageFilesRead(extensionId.trim(), relativePath);
 *     });
 *
 * Validation coverage:
 * - extensionId must be a non-empty string after trim
 * - relativePath must be a string (null/undefined/number/object/array/boolean rejected)
 * - extensionId is trimmed before delegation; relativePath is passed as-is
 */

type ExtensionHostCallResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: { code: string; message: string } }

type HandlerResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: { code: string; message: string } }

// Inline handler mirrors workspace-handlers.ts lines 2595–2607
function handleExtensionsStorageFilesRead(params: {
  extensionId: unknown
  relativePath: unknown
  storageFilesRead: (extensionId: string, relativePath: string) => HandlerResult
}): HandlerResult {
  const { extensionId, relativePath, storageFilesRead } = params
  if (typeof extensionId !== 'string' || !extensionId.trim()) {
    return { ok: false, error: { code: 'bad_request', message: 'extensionId is required' } }
  }
  if (typeof relativePath !== 'string') {
    return { ok: false, error: { code: 'bad_request', message: 'relativePath must be a string' } }
  }
  return storageFilesRead(extensionId.trim(), relativePath)
}

describe('extensions:storage:files:read', () => {
  const makeStorageFilesRead = (result: HandlerResult = { ok: true, data: 'file content' }) =>
    vi.fn<[string, string], HandlerResult>().mockReturnValue(result)

  // ── extensionId validation ────────────────────────────────────────────────

  it('returns error when extensionId is null', () => {
    const storageFilesRead = makeStorageFilesRead()
    const result = handleExtensionsStorageFilesRead({ extensionId: null, relativePath: 'test.txt', storageFilesRead })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageFilesRead).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is undefined', () => {
    const storageFilesRead = makeStorageFilesRead()
    const result = handleExtensionsStorageFilesRead({ extensionId: undefined, relativePath: 'test.txt', storageFilesRead })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageFilesRead).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is a number', () => {
    const storageFilesRead = makeStorageFilesRead()
    const result = handleExtensionsStorageFilesRead({ extensionId: 42, relativePath: 'test.txt', storageFilesRead })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageFilesRead).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is an object', () => {
    const storageFilesRead = makeStorageFilesRead()
    const result = handleExtensionsStorageFilesRead({ extensionId: { id: 'ext-1' }, relativePath: 'test.txt', storageFilesRead })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageFilesRead).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is an array', () => {
    const storageFilesRead = makeStorageFilesRead()
    const result = handleExtensionsStorageFilesRead({ extensionId: ['ext-1'], relativePath: 'test.txt', storageFilesRead })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageFilesRead).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is a boolean', () => {
    const storageFilesRead = makeStorageFilesRead()
    const result = handleExtensionsStorageFilesRead({ extensionId: true, relativePath: 'test.txt', storageFilesRead })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageFilesRead).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is a function', () => {
    const storageFilesRead = makeStorageFilesRead()
    const result = handleExtensionsStorageFilesRead({ extensionId: () => 'x', relativePath: 'test.txt', storageFilesRead })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageFilesRead).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is an empty string', () => {
    const storageFilesRead = makeStorageFilesRead()
    const result = handleExtensionsStorageFilesRead({ extensionId: '', relativePath: 'test.txt', storageFilesRead })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageFilesRead).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is whitespace-only', () => {
    const storageFilesRead = makeStorageFilesRead()
    const result = handleExtensionsStorageFilesRead({ extensionId: '   ', relativePath: 'test.txt', storageFilesRead })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageFilesRead).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is invalid type even with valid relativePath', () => {
    const storageFilesRead = makeStorageFilesRead()
    const result = handleExtensionsStorageFilesRead({ extensionId: 123, relativePath: 'test.txt', storageFilesRead })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageFilesRead).not.toHaveBeenCalled()
  })

  // ── relativePath validation ────────────────────────────────────────────────

  it('returns error when relativePath is null', () => {
    const storageFilesRead = makeStorageFilesRead()
    const result = handleExtensionsStorageFilesRead({ extensionId: 'ext-1', relativePath: null, storageFilesRead })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'relativePath must be a string' } })
    expect(storageFilesRead).not.toHaveBeenCalled()
  })

  it('returns error when relativePath is undefined', () => {
    const storageFilesRead = makeStorageFilesRead()
    const result = handleExtensionsStorageFilesRead({ extensionId: 'ext-1', relativePath: undefined, storageFilesRead })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'relativePath must be a string' } })
    expect(storageFilesRead).not.toHaveBeenCalled()
  })

  it('returns error when relativePath is a number', () => {
    const storageFilesRead = makeStorageFilesRead()
    const result = handleExtensionsStorageFilesRead({ extensionId: 'ext-1', relativePath: 99, storageFilesRead })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'relativePath must be a string' } })
    expect(storageFilesRead).not.toHaveBeenCalled()
  })

  it('returns error when relativePath is an object', () => {
    const storageFilesRead = makeStorageFilesRead()
    const result = handleExtensionsStorageFilesRead({ extensionId: 'ext-1', relativePath: { path: 'test.txt' }, storageFilesRead })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'relativePath must be a string' } })
    expect(storageFilesRead).not.toHaveBeenCalled()
  })

  it('returns error when relativePath is an array', () => {
    const storageFilesRead = makeStorageFilesRead()
    const result = handleExtensionsStorageFilesRead({ extensionId: 'ext-1', relativePath: ['test.txt'], storageFilesRead })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'relativePath must be a string' } })
    expect(storageFilesRead).not.toHaveBeenCalled()
  })

  it('returns error when relativePath is a boolean', () => {
    const storageFilesRead = makeStorageFilesRead()
    const result = handleExtensionsStorageFilesRead({ extensionId: 'ext-1', relativePath: true, storageFilesRead })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'relativePath must be a string' } })
    expect(storageFilesRead).not.toHaveBeenCalled()
  })

  it('returns error when relativePath is a function', () => {
    const storageFilesRead = makeStorageFilesRead()
    const result = handleExtensionsStorageFilesRead({ extensionId: 'ext-1', relativePath: () => 'test.txt', storageFilesRead })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'relativePath must be a string' } })
    expect(storageFilesRead).not.toHaveBeenCalled()
  })

  // Note: empty string for relativePath is accepted — storageFilesRead handles path sanitization

  // ── Valid input ────────────────────────────────────────────────────────────

  it('delegates to storageFilesRead with trimmed extensionId and relativePath', () => {
    const storageFilesRead = makeStorageFilesRead({ ok: true, data: 'hello world' })
    const result = handleExtensionsStorageFilesRead({ extensionId: '  ext-1  ', relativePath: 'subdir/test.txt', storageFilesRead })
    expect(result).toEqual({ ok: true, data: 'hello world' })
    expect(storageFilesRead).toHaveBeenCalledOnce()
    expect(storageFilesRead).toHaveBeenCalledWith('ext-1', 'subdir/test.txt')
  })

  it('passes through unauthorized result from storageFilesRead', () => {
    const storageFilesRead = makeStorageFilesRead({
      ok: false,
      error: { code: 'unauthorized', message: 'missing storage.files capability' },
    })
    const result = handleExtensionsStorageFilesRead({ extensionId: 'bad-ext', relativePath: 'test.txt', storageFilesRead })
    expect(result).toEqual({ ok: false, error: { code: 'unauthorized', message: 'missing storage.files capability' } })
  })

  it('passes through invalid_path result from storageFilesRead', () => {
    const storageFilesRead = makeStorageFilesRead({
      ok: false,
      error: { code: 'invalid_args', message: 'invalid path' },
    })
    const result = handleExtensionsStorageFilesRead({ extensionId: 'ext-1', relativePath: '../etc/passwd', storageFilesRead })
    expect(result).toEqual({ ok: false, error: { code: 'invalid_args', message: 'invalid path' } })
  })

  it('passes through not_found result from storageFilesRead', () => {
    const storageFilesRead = makeStorageFilesRead({
      ok: false,
      error: { code: 'not_found', message: 'file not found' },
    })
    const result = handleExtensionsStorageFilesRead({ extensionId: 'ext-1', relativePath: 'nonexistent.txt', storageFilesRead })
    expect(result).toEqual({ ok: false, error: { code: 'not_found', message: 'file not found' } })
  })

  it('calls storageFilesRead exactly once per invocation', () => {
    const storageFilesRead = makeStorageFilesRead()
    handleExtensionsStorageFilesRead({ extensionId: 'ext-1', relativePath: 'test.txt', storageFilesRead })
    expect(storageFilesRead).toHaveBeenCalledTimes(1)
  })

  it('returns ok:true with file content data', () => {
    const storageFilesRead = makeStorageFilesRead({ ok: true, data: '# config\nname: test' })
    const result = handleExtensionsStorageFilesRead({ extensionId: 'ext-1', relativePath: 'config.json', storageFilesRead })
    expect(result).toEqual({ ok: true, data: '# config\nname: test' })
  })
})
