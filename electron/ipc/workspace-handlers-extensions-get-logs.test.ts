import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `extensions:getLogs` IPC handler.
 *
 * Handler (workspace-handlers.ts lines ~2153–2159):
 *   ipcMain.handle("extensions:getLogs", (_event, id: string) => {
 *     if (typeof id !== "string" || !id.trim()) {
 *       return { ok: false as const, message: "extension id is required" };
 *     }
 *     return getChatonsExtensionLogs(id.trim());
 *   });
 *
 * Without the guard, an empty/whitespace string or non-string id passed from
 * IPC would reach getChatonsExtensionLogs, which calls extensionLogFileSafeId.
 * The log basename helper now returns a non-empty hashed filename, but the
 * handler must still reject empty ids before the manager reads extension logs.
 *
 * Also, getChatonsExtensionLogs returns { ok: true, id, content } directly —
 * the handler has no try/catch, so a malformed id reaching the underlying fs
 * calls would surface as unhandled IPC rejections.
 */

type LogsResult = { ok: true; id: string; content: string }

function handleGetLogs(params: {
  id: unknown
  getChatonsExtensionLogs: (id: string) => LogsResult
}): LogsResult {
  const { id, getChatonsExtensionLogs } = params
  if (typeof id !== 'string' || !id.trim()) {
    return { ok: false as const, message: 'extension id is required' } as never
  }
  return getChatonsExtensionLogs(id.trim())
}

describe('handleGetLogs', () => {
  const makeDeps = (overrides?: Partial<{ getChatonsExtensionLogs: (id: string) => LogsResult }>) => ({
    getChatonsExtensionLogs: vi.fn<(id: string) => LogsResult>().mockReturnValue({ ok: true, id: 'stub', content: 'log output' }),
    ...overrides,
  })

  // --- validation: returns error for non-string id ---

  it('returns error when id is null', () => {
    const deps = makeDeps()
    const result = handleGetLogs({ id: null, ...deps })
    expect(result).toEqual({ ok: false, message: 'extension id is required' })
    expect(deps.getChatonsExtensionLogs).not.toHaveBeenCalled()
  })

  it('returns error when id is undefined', () => {
    const deps = makeDeps()
    const result = handleGetLogs({ id: undefined, ...deps })
    expect(result).toEqual({ ok: false, message: 'extension id is required' })
    expect(deps.getChatonsExtensionLogs).not.toHaveBeenCalled()
  })

  it('returns error when id is a number', () => {
    const deps = makeDeps()
    const result = handleGetLogs({ id: 123, ...deps })
    expect(result).toEqual({ ok: false, message: 'extension id is required' })
    expect(deps.getChatonsExtensionLogs).not.toHaveBeenCalled()
  })

  it('returns error when id is an object', () => {
    const deps = makeDeps()
    const result = handleGetLogs({ id: { id: 'test' }, ...deps })
    expect(result).toEqual({ ok: false, message: 'extension id is required' })
    expect(deps.getChatonsExtensionLogs).not.toHaveBeenCalled()
  })

  it('returns error when id is an array', () => {
    const deps = makeDeps()
    const result = handleGetLogs({ id: ['ext-a', 'ext-b'], ...deps })
    expect(result).toEqual({ ok: false, message: 'extension id is required' })
    expect(deps.getChatonsExtensionLogs).not.toHaveBeenCalled()
  })

  it('returns error when id is a boolean', () => {
    const deps = makeDeps()
    const result = handleGetLogs({ id: true, ...deps })
    expect(result).toEqual({ ok: false, message: 'extension id is required' })
    expect(deps.getChatonsExtensionLogs).not.toHaveBeenCalled()
  })

  // --- validation: returns error for empty/whitespace id ---

  it('returns error when id is an empty string', () => {
    const deps = makeDeps()
    const result = handleGetLogs({ id: '', ...deps })
    expect(result).toEqual({ ok: false, message: 'extension id is required' })
    expect(deps.getChatonsExtensionLogs).not.toHaveBeenCalled()
  })

  it('returns error when id is whitespace-only', () => {
    const deps = makeDeps()
    const result = handleGetLogs({ id: '    ', ...deps })
    expect(result).toEqual({ ok: false, message: 'extension id is required' })
    expect(deps.getChatonsExtensionLogs).not.toHaveBeenCalled()
  })

  it('returns error when id is only newlines and tabs', () => {
    const deps = makeDeps()
    const result = handleGetLogs({ id: '\n\t  ', ...deps })
    expect(result).toEqual({ ok: false, message: 'extension id is required' })
    expect(deps.getChatonsExtensionLogs).not.toHaveBeenCalled()
  })

  // --- happy path: delegates with trimmed id ---

  it('delegates to getChatonsExtensionLogs with the trimmed id', () => {
    const getChatonsExtensionLogs = vi.fn<(id: string) => LogsResult>().mockReturnValue({ ok: true, id: 'my-extension', content: 'runtime log\ninstall log' })
    const deps = makeDeps({ getChatonsExtensionLogs })
    handleGetLogs({ id: '  my-extension  ', ...deps })
    expect(getChatonsExtensionLogs).toHaveBeenCalledOnce()
    expect(getChatonsExtensionLogs).toHaveBeenCalledWith('my-extension')
  })

  it('returns getChatonsExtensionLogs result unchanged (with content)', () => {
    const deps = makeDeps({ getChatonsExtensionLogs: vi.fn().mockReturnValue({ ok: true, id: 'ext-1', content: 'INFO: started\nWARN: slow response' }) })
    const result = handleGetLogs({ id: 'ext-1', ...deps })
    expect(result).toEqual({ ok: true, id: 'ext-1', content: 'INFO: started\nWARN: slow response' })
  })

  it('returns getChatonsExtensionLogs result unchanged (empty content)', () => {
    const deps = makeDeps({ getChatonsExtensionLogs: vi.fn().mockReturnValue({ ok: true, id: 'fresh-ext', content: '' }) })
    const result = handleGetLogs({ id: 'fresh-ext', ...deps })
    expect(result).toEqual({ ok: true, id: 'fresh-ext', content: '' })
  })

  it('does not call getChatonsExtensionLogs more than once per invocation', () => {
    const getChatonsExtensionLogs = vi.fn<(id: string) => LogsResult>().mockReturnValue({ ok: true, id: 'ext', content: 'log' })
    const deps = makeDeps({ getChatonsExtensionLogs })
    handleGetLogs({ id: 'ext', ...deps })
    expect(getChatonsExtensionLogs).toHaveBeenCalledTimes(1)
  })
})
