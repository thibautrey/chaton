import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `extensions:call` IPC handler.
 *
 * Handler (workspace-handlers.ts lines ~2361–2401):
 *   ipcMain.handle("extensions:call",
 *     (_event, callerExtensionId, extensionId, apiName, versionRange, payload) => {
 *       if (typeof callerExtensionId !== "string" || !callerExtensionId.trim()) {
 *         return { ok: false, error: { code: "bad_request", message: "callerExtensionId is required" } };
 *       }
 *       if (typeof extensionId !== "string" || !extensionId.trim()) {
 *         return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
 *       }
 *       if (typeof apiName !== "string" || !apiName.trim()) {
 *         return { ok: false, error: { code: "bad_request", message: "apiName is required" } };
 *       }
 *       if (typeof versionRange !== "string" || !versionRange.trim()) {
 *         return { ok: false, error: { code: "bad_request", message: "versionRange is required" } };
 *       }
 *       return extensionsCall(callerExtensionId.trim(), extensionId.trim(),
 *                             apiName.trim(), versionRange.trim(), payload);
 *     });
 *
 * Validation coverage:
 * - callerExtensionId must be a non-empty string (trimmed)
 * - extensionId must be a non-empty string (trimmed)
 * - apiName must be a non-empty string (trimmed)
 * - versionRange must be a non-empty string (trimmed)
 * - payload is passed through as-is
 * - All four string params are trimmed before being passed to extensionsCall
 */

type ExtensionHostCallResult =
  | { ok: true; result: unknown }
  | { ok: false; error: { code: string; message: string } }

type HandlerResult =
  | { ok: true; result: unknown }
  | { ok: false; error: { code: string; message: string } }

// Inline handler mirrors workspace-handlers.ts lines 2361–2401
function handleExtensionsCall(params: {
  callerExtensionId: unknown
  extensionId: unknown
  apiName: unknown
  versionRange: unknown
  payload?: unknown
  extensionsCall: (
    callerExtensionId: string,
    extensionId: string,
    apiName: string,
    versionRange: string,
    payload?: unknown,
  ) => ExtensionHostCallResult
}): HandlerResult {
  const { callerExtensionId, extensionId, apiName, versionRange, payload, extensionsCall } = params

  if (typeof callerExtensionId !== 'string' || !callerExtensionId.trim()) {
    return {
      ok: false as const,
      error: { code: 'bad_request' as const, message: 'callerExtensionId is required' },
    }
  }
  if (typeof extensionId !== 'string' || !extensionId.trim()) {
    return {
      ok: false as const,
      error: { code: 'bad_request' as const, message: 'extensionId is required' },
    }
  }
  if (typeof apiName !== 'string' || !apiName.trim()) {
    return {
      ok: false as const,
      error: { code: 'bad_request' as const, message: 'apiName is required' },
    }
  }
  if (typeof versionRange !== 'string' || !versionRange.trim()) {
    return {
      ok: false as const,
      error: { code: 'bad_request' as const, message: 'versionRange is required' },
    }
  }
  return extensionsCall(
    callerExtensionId.trim(),
    extensionId.trim(),
    apiName.trim(),
    versionRange.trim(),
    payload,
  )
}

describe('extensions:call', () => {
  // -------------------------------------------------------------------------
  // Shared mock factory
  // -------------------------------------------------------------------------
  const makeExtensionsCall = (
    result: ExtensionHostCallResult = { ok: true, result: { value: 42 } },
  ) =>
    vi
      .fn<
        [string, string, string, string, unknown?],
        ExtensionHostCallResult
      >()
      .mockReturnValue(result)

  // -------------------------------------------------------------------------
  // callerExtensionId validation
  // -------------------------------------------------------------------------

  it('returns error when callerExtensionId is null', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: null,
      extensionId: 'target-ext',
      apiName: 'browser.open',
      versionRange: '^1.0.0',
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'callerExtensionId is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  it('returns error when callerExtensionId is undefined', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: undefined,
      extensionId: 'target-ext',
      apiName: 'browser.open',
      versionRange: '^1.0.0',
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'callerExtensionId is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  it('returns error when callerExtensionId is a number', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: 1,
      extensionId: 'target-ext',
      apiName: 'browser.open',
      versionRange: '^1.0.0',
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'callerExtensionId is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  it('returns error when callerExtensionId is an object', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: { id: 'caller' },
      extensionId: 'target-ext',
      apiName: 'browser.open',
      versionRange: '^1.0.0',
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'callerExtensionId is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  it('returns error when callerExtensionId is an empty string', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: '',
      extensionId: 'target-ext',
      apiName: 'browser.open',
      versionRange: '^1.0.0',
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'callerExtensionId is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  it('returns error when callerExtensionId is whitespace-only', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: '   ',
      extensionId: 'target-ext',
      apiName: 'browser.open',
      versionRange: '^1.0.0',
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'callerExtensionId is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // extensionId validation
  // -------------------------------------------------------------------------

  it('returns error when extensionId is null', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: 'caller-ext',
      extensionId: null,
      apiName: 'browser.open',
      versionRange: '^1.0.0',
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'extensionId is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is undefined', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: 'caller-ext',
      extensionId: undefined,
      apiName: 'browser.open',
      versionRange: '^1.0.0',
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'extensionId is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is a number', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: 'caller-ext',
      extensionId: 99,
      apiName: 'browser.open',
      versionRange: '^1.0.0',
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'extensionId is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is an empty string', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: 'caller-ext',
      extensionId: '',
      apiName: 'browser.open',
      versionRange: '^1.0.0',
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'extensionId is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is whitespace-only', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: 'caller-ext',
      extensionId: '\t\n',
      apiName: 'browser.open',
      versionRange: '^1.0.0',
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'extensionId is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // apiName validation
  // -------------------------------------------------------------------------

  it('returns error when apiName is null', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: 'caller-ext',
      extensionId: 'target-ext',
      apiName: null,
      versionRange: '^1.0.0',
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'apiName is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  it('returns error when apiName is undefined', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: 'caller-ext',
      extensionId: 'target-ext',
      apiName: undefined,
      versionRange: '^1.0.0',
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'apiName is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  it('returns error when apiName is a number', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: 'caller-ext',
      extensionId: 'target-ext',
      apiName: 123,
      versionRange: '^1.0.0',
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'apiName is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  it('returns error when apiName is an empty string', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: 'caller-ext',
      extensionId: 'target-ext',
      apiName: '',
      versionRange: '^1.0.0',
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'apiName is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  it('returns error when apiName is whitespace-only', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: 'caller-ext',
      extensionId: 'target-ext',
      apiName: '   ',
      versionRange: '^1.0.0',
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'apiName is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // versionRange validation
  // -------------------------------------------------------------------------

  it('returns error when versionRange is null', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: 'caller-ext',
      extensionId: 'target-ext',
      apiName: 'browser.open',
      versionRange: null,
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'versionRange is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  it('returns error when versionRange is undefined', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: 'caller-ext',
      extensionId: 'target-ext',
      apiName: 'browser.open',
      versionRange: undefined,
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'versionRange is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  it('returns error when versionRange is a number', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: 'caller-ext',
      extensionId: 'target-ext',
      apiName: 'browser.open',
      versionRange: 2,
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'versionRange is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  it('returns error when versionRange is an empty string', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: 'caller-ext',
      extensionId: 'target-ext',
      apiName: 'browser.open',
      versionRange: '',
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'versionRange is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  it('returns error when versionRange is whitespace-only', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: 'caller-ext',
      extensionId: 'target-ext',
      apiName: 'browser.open',
      versionRange: '  \t  ',
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'versionRange is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Validation order: first failing check wins
  // -------------------------------------------------------------------------

  it('checks callerExtensionId first — returns its error when all four are invalid', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: '',
      extensionId: '',
      apiName: '',
      versionRange: '',
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'callerExtensionId is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  it('checks extensionId second — returns its error when callerExtensionId is valid', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: 'caller-ext',
      extensionId: '',
      apiName: '',
      versionRange: '',
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'extensionId is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  it('checks apiName third — returns its error when callerExtensionId and extensionId are valid', () => {
    const ec = makeExtensionsCall()
    const result = handleExtensionsCall({
      callerExtensionId: 'caller-ext',
      extensionId: 'target-ext',
      apiName: '',
      versionRange: '',
      extensionsCall: ec,
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_request', message: 'apiName is required' },
    })
    expect(ec).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // happy path: trims values and passes payload through
  // -------------------------------------------------------------------------

  it('trims all four string params before passing to extensionsCall', () => {
    const ec = makeExtensionsCall()
    handleExtensionsCall({
      callerExtensionId: '  caller  ',
      extensionId: '  target  ',
      apiName: '  browser.open  ',
      versionRange: '  ^1.0.0  ',
      extensionsCall: ec,
    })
    expect(ec).toHaveBeenCalledOnce()
    expect(ec).toHaveBeenCalledWith('caller', 'target', 'browser.open', '^1.0.0', undefined)
  })

  it('passes payload through to extensionsCall', () => {
    const ec = makeExtensionsCall()
    const payload = { url: 'https://example.com' }
    handleExtensionsCall({
      callerExtensionId: 'caller',
      extensionId: 'target',
      apiName: 'browser.open',
      versionRange: '^1.0.0',
      payload,
      extensionsCall: ec,
    })
    expect(ec).toHaveBeenCalledOnce()
    expect(ec).toHaveBeenCalledWith('caller', 'target', 'browser.open', '^1.0.0', payload)
  })

  it('returns extensionsCall success result directly', () => {
    const success = { ok: true as const, result: { opened: true } }
    const ec = makeExtensionsCall(success)
    const result = handleExtensionsCall({
      callerExtensionId: 'caller',
      extensionId: 'target',
      apiName: 'browser.open',
      versionRange: '^1.0.0',
      extensionsCall: ec,
    })
    expect(result).toEqual(success)
  })

  it('returns extensionsCall error result directly', () => {
    const error = { ok: false as const, error: { code: 'not_found', message: 'API not found' } }
    const ec = makeExtensionsCall(error)
    const result = handleExtensionsCall({
      callerExtensionId: 'caller',
      extensionId: 'target',
      apiName: 'browser.open',
      versionRange: '^1.0.0',
      extensionsCall: ec,
    })
    expect(result).toEqual(error)
  })

  it('does not call extensionsCall more than once per invocation', () => {
    const ec = makeExtensionsCall({ ok: true, result: null })
    handleExtensionsCall({
      callerExtensionId: 'c',
      extensionId: 't',
      apiName: 'x',
      versionRange: 'y',
      extensionsCall: ec,
    })
    expect(ec).toHaveBeenCalledTimes(1)
  })
})
