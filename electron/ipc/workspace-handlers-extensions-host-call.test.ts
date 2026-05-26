import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `extensions:hostCall` IPC handler.
 *
 * Handler (workspace-handlers.ts lines ~2338–2357):
 *   ipcMain.handle("extensions:hostCall", (_event, extensionId, method, params?) => {
 *     if (typeof extensionId !== "string" || !extensionId.trim()) {
 *       return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
 *     }
 *     if (typeof method !== "string" || !method.trim()) {
 *       return { ok: false, error: { code: "bad_request", message: "method is required" } };
 *     }
 *     return hostCall(extensionId.trim(), method.trim(), params);
 *   });
 *
 * Validation coverage:
 * - extensionId must be a non-empty string (trimmed)
 * - method must be a non-empty string (trimmed)
 * - params is optional and passed through as-is (hostCall handles its own validation)
 * - Trimmed values are passed to hostCall
 */

type ExtensionHostCallResult =
  | { ok: true; result: unknown }
  | { ok: false; error: { code: string; message: string } }

type HandlerResult =
  | { ok: true; result: unknown }
  | { ok: false; error: { code: string; message: string } }

// Inline handler mirrors workspace-handlers.ts lines 2338–2357
function handleExtensionsHostCall(params: {
  extensionId: unknown
  method: unknown
  params?: Record<string, unknown>
  hostCall: (
    extensionId: string,
    method: string,
    params?: Record<string, unknown>,
  ) => ExtensionHostCallResult
}): HandlerResult {
  const { extensionId, method, params: reqParams, hostCall } = params

  if (typeof extensionId !== 'string' || !extensionId.trim()) {
    return {
      ok: false as const,
      error: { code: 'bad_request' as const, message: 'extensionId is required' },
    }
  }
  if (typeof method !== 'string' || !method.trim()) {
    return {
      ok: false as const,
      error: { code: 'bad_request' as const, message: 'method is required' },
    }
  }
  return hostCall(extensionId.trim(), method.trim(), reqParams)
}

describe('extensions:hostCall', () => {
  // -------------------------------------------------------------------------
  // Shared mock
  // -------------------------------------------------------------------------
  const makeHostCall = (
    result: ExtensionHostCallResult = { ok: true, result: { value: 42 } },
  ) => vi.fn<[string, string, Record<string, unknown>?], ExtensionHostCallResult>().mockReturnValue(result)

  // -------------------------------------------------------------------------
  // extensionId validation
  // -------------------------------------------------------------------------

  it('returns error when extensionId is null', () => {
    const hostCall = makeHostCall()
    const result = handleExtensionsHostCall({
      extensionId: null,
      method: 'getValue',
      hostCall,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'extensionId is required' },
    })
    expect(hostCall).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is undefined', () => {
    const hostCall = makeHostCall()
    const result = handleExtensionsHostCall({
      extensionId: undefined,
      method: 'getValue',
      hostCall,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'extensionId is required' },
    })
    expect(hostCall).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is a number', () => {
    const hostCall = makeHostCall()
    const result = handleExtensionsHostCall({
      extensionId: 99,
      method: 'getValue',
      hostCall,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'extensionId is required' },
    })
    expect(hostCall).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is an object', () => {
    const hostCall = makeHostCall()
    const result = handleExtensionsHostCall({
      extensionId: { id: 'test' },
      method: 'getValue',
      hostCall,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'extensionId is required' },
    })
    expect(hostCall).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is an array', () => {
    const hostCall = makeHostCall()
    const result = handleExtensionsHostCall({
      extensionId: ['a', 'b'],
      method: 'getValue',
      hostCall,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'extensionId is required' },
    })
    expect(hostCall).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is a boolean', () => {
    const hostCall = makeHostCall()
    const result = handleExtensionsHostCall({
      extensionId: true,
      method: 'getValue',
      hostCall,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'extensionId is required' },
    })
    expect(hostCall).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is an empty string', () => {
    const hostCall = makeHostCall()
    const result = handleExtensionsHostCall({
      extensionId: '',
      method: 'getValue',
      hostCall,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'extensionId is required' },
    })
    expect(hostCall).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is whitespace-only', () => {
    const hostCall = makeHostCall()
    const result = handleExtensionsHostCall({
      extensionId: '     ',
      method: 'getValue',
      hostCall,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'extensionId is required' },
    })
    expect(hostCall).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is only whitespace characters', () => {
    const hostCall = makeHostCall()
    const result = handleExtensionsHostCall({
      extensionId: '\t\n  ',
      method: 'getValue',
      hostCall,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'extensionId is required' },
    })
    expect(hostCall).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // method validation
  // -------------------------------------------------------------------------

  it('returns error when method is null', () => {
    const hostCall = makeHostCall()
    const result = handleExtensionsHostCall({
      extensionId: 'my-ext',
      method: null,
      hostCall,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'method is required' },
    })
    expect(hostCall).not.toHaveBeenCalled()
  })

  it('returns error when method is undefined', () => {
    const hostCall = makeHostCall()
    const result = handleExtensionsHostCall({
      extensionId: 'my-ext',
      method: undefined,
      hostCall,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'method is required' },
    })
    expect(hostCall).not.toHaveBeenCalled()
  })

  it('returns error when method is a number', () => {
    const hostCall = makeHostCall()
    const result = handleExtensionsHostCall({
      extensionId: 'my-ext',
      method: 42,
      hostCall,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'method is required' },
    })
    expect(hostCall).not.toHaveBeenCalled()
  })

  it('returns error when method is an object', () => {
    const hostCall = makeHostCall()
    const result = handleExtensionsHostCall({
      extensionId: 'my-ext',
      method: { fn: 'getValue' },
      hostCall,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'method is required' },
    })
    expect(hostCall).not.toHaveBeenCalled()
  })

  it('returns error when method is an empty string', () => {
    const hostCall = makeHostCall()
    const result = handleExtensionsHostCall({
      extensionId: 'my-ext',
      method: '',
      hostCall,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'method is required' },
    })
    expect(hostCall).not.toHaveBeenCalled()
  })

  it('returns error when method is whitespace-only', () => {
    const hostCall = makeHostCall()
    const result = handleExtensionsHostCall({
      extensionId: 'my-ext',
      method: '   ',
      hostCall,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'method is required' },
    })
    expect(hostCall).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // happy path: trims values before delegating
  // -------------------------------------------------------------------------

  it('trims extensionId and method before passing to hostCall', () => {
    const hostCall = makeHostCall({ ok: true, result: { value: 1 } })
    handleExtensionsHostCall({
      extensionId: '  my-ext  ',
      method: '  getValue  ',
      hostCall,
    })
    expect(hostCall).toHaveBeenCalledOnce()
    expect(hostCall).toHaveBeenCalledWith('my-ext', 'getValue', undefined)
  })

  it('passes params through to hostCall', () => {
    const hostCall = makeHostCall({ ok: true, result: { value: 1 } })
    const params = { key: 'value', count: 5 }
    handleExtensionsHostCall({
      extensionId: 'my-ext',
      method: 'getValue',
      params,
      hostCall,
    })
    expect(hostCall).toHaveBeenCalledOnce()
    expect(hostCall).toHaveBeenCalledWith('my-ext', 'getValue', params)
  })

  it('returns hostCall success result directly', () => {
    const successResult = { ok: true as const, result: { data: 'hello' } }
    const hostCall = makeHostCall(successResult)
    const result = handleExtensionsHostCall({
      extensionId: 'my-ext',
      method: 'getValue',
      hostCall,
    })
    expect(result).toEqual(successResult)
  })

  it('returns hostCall error result directly', () => {
    const errorResult = {
      ok: false as const,
      error: { code: 'not_found', message: 'Method not found' },
    }
    const hostCall = makeHostCall(errorResult)
    const result = handleExtensionsHostCall({
      extensionId: 'my-ext',
      method: 'getValue',
      hostCall,
    })
    expect(result).toEqual(errorResult)
  })

  it('does not call hostCall more than once per invocation', () => {
    const hostCall = makeHostCall({ ok: true, result: null })
    handleExtensionsHostCall({ extensionId: 'x', method: 'y', hostCall })
    expect(hostCall).toHaveBeenCalledTimes(1)
  })

  it('validates extensionId before method — returns extensionId error when both are invalid', () => {
    const hostCall = makeHostCall()
    const result = handleExtensionsHostCall({
      extensionId: '',
      method: '',
      hostCall,
    })
    // extensionId check fires first
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'extensionId is required' },
    })
    expect(hostCall).not.toHaveBeenCalled()
  })
})
