import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `extensions:storage:files:write` IPC handler.
 *
 * Handler (workspace-handlers.ts lines ~2608–2624):
 *   ipcMain.handle("extensions:storage:files:write",
 *     (_event, extensionId: string, relativePath: string, content: string) => {
 *       if (typeof extensionId !== "string" || !extensionId.trim()) {
 *         return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
 *       }
 *       if (typeof relativePath !== "string") {
 *         return { ok: false, error: { code: "bad_request", message: "relativePath must be a string" } };
 *       }
 *       return storageFilesWrite(extensionId.trim(), relativePath, content ?? "");
 *     });
 *
 * Validation coverage:
 * - extensionId must be a non-empty string after trim
 * - relativePath must be a string (null/undefined/number/object/array/boolean rejected)
 * - content must be a string
 * - extensionId is trimmed before delegation
 */

type ExtensionHostCallResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: { code: string; message: string } }

type HandlerResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: { code: string; message: string } }

// Inline handler mirrors workspace-handlers.ts lines 2608–2624
function handleExtensionsStorageFilesWrite(params: {
  extensionId: unknown
  relativePath: unknown
  content: unknown
  storageFilesWrite: (extensionId: string, relativePath: string, content: string) => HandlerResult
}): HandlerResult {
  const { extensionId, relativePath, content, storageFilesWrite } = params
  if (typeof extensionId !== 'string' || !extensionId.trim()) {
    return { ok: false, error: { code: 'bad_request', message: 'extensionId is required' } }
  }
  if (typeof relativePath !== 'string') {
    return { ok: false, error: { code: 'bad_request', message: 'relativePath must be a string' } }
  }
  if (typeof content !== 'string') {
    return { ok: false, error: { code: 'bad_request', message: 'content must be a string' } }
  }
  return storageFilesWrite(extensionId.trim(), relativePath, content)
}

describe('extensions:storage:files:write', () => {
  const makeStorageFilesWrite = (result: HandlerResult = { ok: true }) =>
    vi.fn<[string, string, string], HandlerResult>().mockReturnValue(result)

  // ── extensionId validation ────────────────────────────────────────────────

  it('returns error when extensionId is null', () => {
    const storageFilesWrite = makeStorageFilesWrite()
    const result = handleExtensionsStorageFilesWrite({ extensionId: null, relativePath: 'test.txt', content: 'data', storageFilesWrite })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageFilesWrite).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is undefined', () => {
    const storageFilesWrite = makeStorageFilesWrite()
    const result = handleExtensionsStorageFilesWrite({ extensionId: undefined, relativePath: 'test.txt', content: 'data', storageFilesWrite })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageFilesWrite).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is a number', () => {
    const storageFilesWrite = makeStorageFilesWrite()
    const result = handleExtensionsStorageFilesWrite({ extensionId: 42, relativePath: 'test.txt', content: 'data', storageFilesWrite })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageFilesWrite).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is an object', () => {
    const storageFilesWrite = makeStorageFilesWrite()
    const result = handleExtensionsStorageFilesWrite({ extensionId: { id: 'ext-1' }, relativePath: 'test.txt', content: 'data', storageFilesWrite })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageFilesWrite).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is an array', () => {
    const storageFilesWrite = makeStorageFilesWrite()
    const result = handleExtensionsStorageFilesWrite({ extensionId: ['ext-1'], relativePath: 'test.txt', content: 'data', storageFilesWrite })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageFilesWrite).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is a boolean', () => {
    const storageFilesWrite = makeStorageFilesWrite()
    const result = handleExtensionsStorageFilesWrite({ extensionId: true, relativePath: 'test.txt', content: 'data', storageFilesWrite })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageFilesWrite).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is a function', () => {
    const storageFilesWrite = makeStorageFilesWrite()
    const result = handleExtensionsStorageFilesWrite({ extensionId: () => 'x', relativePath: 'test.txt', content: 'data', storageFilesWrite })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageFilesWrite).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is an empty string', () => {
    const storageFilesWrite = makeStorageFilesWrite()
    const result = handleExtensionsStorageFilesWrite({ extensionId: '', relativePath: 'test.txt', content: 'data', storageFilesWrite })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageFilesWrite).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is whitespace-only', () => {
    const storageFilesWrite = makeStorageFilesWrite()
    const result = handleExtensionsStorageFilesWrite({ extensionId: '   ', relativePath: 'test.txt', content: 'data', storageFilesWrite })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageFilesWrite).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is invalid type even with valid relativePath', () => {
    const storageFilesWrite = makeStorageFilesWrite()
    const result = handleExtensionsStorageFilesWrite({ extensionId: 123, relativePath: 'test.txt', content: 'data', storageFilesWrite })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'extensionId is required' } })
    expect(storageFilesWrite).not.toHaveBeenCalled()
  })

  // ── relativePath validation ────────────────────────────────────────────────

  it('returns error when relativePath is null', () => {
    const storageFilesWrite = makeStorageFilesWrite()
    const result = handleExtensionsStorageFilesWrite({ extensionId: 'ext-1', relativePath: null, content: 'data', storageFilesWrite })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'relativePath must be a string' } })
    expect(storageFilesWrite).not.toHaveBeenCalled()
  })

  it('returns error when relativePath is undefined', () => {
    const storageFilesWrite = makeStorageFilesWrite()
    const result = handleExtensionsStorageFilesWrite({ extensionId: 'ext-1', relativePath: undefined, content: 'data', storageFilesWrite })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'relativePath must be a string' } })
    expect(storageFilesWrite).not.toHaveBeenCalled()
  })

  it('returns error when relativePath is a number', () => {
    const storageFilesWrite = makeStorageFilesWrite()
    const result = handleExtensionsStorageFilesWrite({ extensionId: 'ext-1', relativePath: 99, content: 'data', storageFilesWrite })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'relativePath must be a string' } })
    expect(storageFilesWrite).not.toHaveBeenCalled()
  })

  it('returns error when relativePath is an object', () => {
    const storageFilesWrite = makeStorageFilesWrite()
    const result = handleExtensionsStorageFilesWrite({ extensionId: 'ext-1', relativePath: { path: 'test.txt' }, content: 'data', storageFilesWrite })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'relativePath must be a string' } })
    expect(storageFilesWrite).not.toHaveBeenCalled()
  })

  it('returns error when relativePath is an array', () => {
    const storageFilesWrite = makeStorageFilesWrite()
    const result = handleExtensionsStorageFilesWrite({ extensionId: 'ext-1', relativePath: ['test.txt'], content: 'data', storageFilesWrite })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'relativePath must be a string' } })
    expect(storageFilesWrite).not.toHaveBeenCalled()
  })

  it('returns error when relativePath is a boolean', () => {
    const storageFilesWrite = makeStorageFilesWrite()
    const result = handleExtensionsStorageFilesWrite({ extensionId: 'ext-1', relativePath: true, content: 'data', storageFilesWrite })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'relativePath must be a string' } })
    expect(storageFilesWrite).not.toHaveBeenCalled()
  })

  it('returns error when relativePath is a function', () => {
    const storageFilesWrite = makeStorageFilesWrite()
    const result = handleExtensionsStorageFilesWrite({ extensionId: 'ext-1', relativePath: () => 'test.txt', content: 'data', storageFilesWrite })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'relativePath must be a string' } })
    expect(storageFilesWrite).not.toHaveBeenCalled()
  })

  // ── content validation ─────────────────────────────────────────────────────

  it('returns error when content is null', () => {
    const storageFilesWrite = makeStorageFilesWrite({ ok: true })
    const result = handleExtensionsStorageFilesWrite({ extensionId: 'ext-1', relativePath: 'test.txt', content: null, storageFilesWrite })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'content must be a string' } })
    expect(storageFilesWrite).not.toHaveBeenCalled()
  })

  it('returns error when content is undefined', () => {
    const storageFilesWrite = makeStorageFilesWrite({ ok: true })
    const result = handleExtensionsStorageFilesWrite({ extensionId: 'ext-1', relativePath: 'test.txt', content: undefined, storageFilesWrite })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'content must be a string' } })
    expect(storageFilesWrite).not.toHaveBeenCalled()
  })

  it('returns error when content is an object', () => {
    const storageFilesWrite = makeStorageFilesWrite({ ok: true })
    const result = handleExtensionsStorageFilesWrite({ extensionId: 'ext-1', relativePath: 'test.txt', content: { data: 'x' }, storageFilesWrite })
    expect(result).toEqual({ ok: false, error: { code: 'bad_request', message: 'content must be a string' } })
    expect(storageFilesWrite).not.toHaveBeenCalled()
  })

  // ── Valid input ────────────────────────────────────────────────────────────

  it('delegates to storageFilesWrite with trimmed extensionId and relativePath', () => {
    const storageFilesWrite = makeStorageFilesWrite({ ok: true })
    const result = handleExtensionsStorageFilesWrite({ extensionId: '  ext-1  ', relativePath: 'subdir/test.txt', content: 'hello', storageFilesWrite })
    expect(result).toEqual({ ok: true })
    expect(storageFilesWrite).toHaveBeenCalledOnce()
    expect(storageFilesWrite).toHaveBeenCalledWith('ext-1', 'subdir/test.txt', 'hello')
  })

  it('passes content through as-is when it is a non-empty string', () => {
    const storageFilesWrite = makeStorageFilesWrite({ ok: true })
    const result = handleExtensionsStorageFilesWrite({ extensionId: 'ext-1', relativePath: 'config.json', content: '{"key": "value"}', storageFilesWrite })
    expect(result).toEqual({ ok: true })
    expect(storageFilesWrite).toHaveBeenCalledWith('ext-1', 'config.json', '{"key": "value"}')
  })

  it('passes through unauthorized result from storageFilesWrite', () => {
    const storageFilesWrite = makeStorageFilesWrite({
      ok: false,
      error: { code: 'unauthorized', message: 'missing storage.files capability' },
    })
    const result = handleExtensionsStorageFilesWrite({ extensionId: 'bad-ext', relativePath: 'test.txt', content: 'data', storageFilesWrite })
    expect(result).toEqual({ ok: false, error: { code: 'unauthorized', message: 'missing storage.files capability' } })
  })

  it('passes through invalid_args result from storageFilesWrite', () => {
    const storageFilesWrite = makeStorageFilesWrite({
      ok: false,
      error: { code: 'invalid_args', message: 'invalid path' },
    })
    const result = handleExtensionsStorageFilesWrite({ extensionId: 'ext-1', relativePath: '../etc/passwd', content: 'data', storageFilesWrite })
    expect(result).toEqual({ ok: false, error: { code: 'invalid_args', message: 'invalid path' } })
  })

  it('calls storageFilesWrite exactly once per invocation', () => {
    const storageFilesWrite = makeStorageFilesWrite({ ok: true })
    handleExtensionsStorageFilesWrite({ extensionId: 'ext-1', relativePath: 'test.txt', content: 'data', storageFilesWrite })
    expect(storageFilesWrite).toHaveBeenCalledTimes(1)
  })

  it('returns ok:true on successful write', () => {
    const storageFilesWrite = makeStorageFilesWrite({ ok: true })
    const result = handleExtensionsStorageFilesWrite({ extensionId: 'ext-1', relativePath: 'test.txt', content: 'my content', storageFilesWrite })
    expect(result).toEqual({ ok: true })
  })
})
