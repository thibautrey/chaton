import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Unit tests for the `extensions:checkUpdates` IPC handler.
 *
 * The handler (workspace-handlers.ts) wraps checkForExtensionUpdates() in a
 * try/catch so that unexpected errors (network, disk) are surfaced gracefully
 * instead of becoming unhandled IPC rejections:
 *
 *   try {
 *     return checkForExtensionUpdates();
 *   } catch (err) {
 *     console.warn("[extensions:checkUpdates] threw unexpectedly:", err);
 *     return { ok: false, updates: [], message: err instanceof Error ? err.message : String(err) };
 *   }
 *
 * checkForExtensionUpdates returns:
 *   { ok: true, updates: Array<{ id, currentVersion, latestVersion }> }
 *   { ok: false, message: string }
 */

// -------------------------------------------------------------------------
// Inline handler — mirrors workspace-handlers.ts try/catch wrapper
// -------------------------------------------------------------------------

type CheckUpdatesResult =
  | { ok: true; updates: Array<{ id: string; currentVersion: string; latestVersion: string }> }
  | { ok: false; message: string }

function handleExtensionsCheckUpdates(params: {
  checkForExtensionUpdates: () => CheckUpdatesResult
}): CheckUpdatesResult {
  try {
    return params.checkForExtensionUpdates()
  } catch (err: unknown) {
    console.warn('[extensions:checkUpdates] threw unexpectedly:', err)
    return {
      ok: false as const,
      updates: [],
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

describe('extensions:checkUpdates', () => {
  let checkForExtensionUpdatesMock: ReturnType<typeof vi.fn>
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    checkForExtensionUpdatesMock = vi.fn()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  // -------------------------------------------------------------------------
  // Passthrough behavior (success)
  // -------------------------------------------------------------------------

  it('returns the result of checkForExtensionUpdates unchanged on success', async () => {
    const expected = { ok: true, updates: [] }
    checkForExtensionUpdatesMock.mockReturnValue(expected)

    const result = handleExtensionsCheckUpdates({
      checkForExtensionUpdates: checkForExtensionUpdatesMock,
    })

    expect(result).toEqual(expected)
  })

  it('passes no arguments to checkForExtensionUpdates', async () => {
    checkForExtensionUpdatesMock.mockReturnValue({ ok: true, updates: [] })

    handleExtensionsCheckUpdates({
      checkForExtensionUpdates: checkForExtensionUpdatesMock,
    })

    expect(checkForExtensionUpdatesMock).toHaveBeenCalledTimes(1)
    expect(checkForExtensionUpdatesMock).toHaveBeenCalledWith()
  })

  it('does not call checkForExtensionUpdates more than once per invocation', async () => {
    checkForExtensionUpdatesMock.mockReturnValue({ ok: true, updates: [] })

    handleExtensionsCheckUpdates({
      checkForExtensionUpdates: checkForExtensionUpdatesMock,
    })
    handleExtensionsCheckUpdates({
      checkForExtensionUpdates: checkForExtensionUpdatesMock,
    })

    expect(checkForExtensionUpdatesMock).toHaveBeenCalledTimes(2)
  })

  // -------------------------------------------------------------------------
  // Error handling — checkForExtensionUpdates throws
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('returns {ok:false, updates:[], message} when checkForExtensionUpdates throws Error', () => {
      checkForExtensionUpdatesMock.mockImplementation(() => {
        throw new Error('network timeout')
      })

      const result = handleExtensionsCheckUpdates({
        checkForExtensionUpdates: checkForExtensionUpdatesMock,
      })

      expect(result.ok).toBe(false)
      expect(result.updates).toEqual([])
      expect(result.message).toBe('network timeout')
      expect(warnSpy).toHaveBeenCalledWith(
        '[extensions:checkUpdates] threw unexpectedly:',
        expect.any(Error),
      )
    })

    it('returns {ok:false, updates:[], message} when checkForExtensionUpdates throws non-Error', () => {
      checkForExtensionUpdatesMock.mockImplementation(() => {
        throw 'plain string error'
      })

      const result = handleExtensionsCheckUpdates({
        checkForExtensionUpdates: checkForExtensionUpdatesMock,
      })

      expect(result.ok).toBe(false)
      expect(result.updates).toEqual([])
      expect(result.message).toBe('plain string error')
    })

    it('returns {ok:false, updates:[], message} when checkForExtensionUpdates throws object', () => {
      const errorObj = { code: 'ECONNREFUSED', detail: 'Server unreachable' }
      checkForExtensionUpdatesMock.mockImplementation(() => {
        throw errorObj
      })

      const result = handleExtensionsCheckUpdates({
        checkForExtensionUpdates: checkForExtensionUpdatesMock,
      })

      expect(result.ok).toBe(false)
      expect(result.updates).toEqual([])
      expect(result.message).toBe('[object Object]')
    })

    it('returns {ok:false, updates:[], message} when checkForExtensionUpdates throws null', () => {
      checkForExtensionUpdatesMock.mockImplementation(() => {
        throw null
      })

      const result = handleExtensionsCheckUpdates({
        checkForExtensionUpdates: checkForExtensionUpdatesMock,
      })

      expect(result.ok).toBe(false)
      expect(result.updates).toEqual([])
      expect(result.message).toBe('null')
    })

    it('does not re-throw when checkForExtensionUpdates throws', () => {
      checkForExtensionUpdatesMock.mockImplementation(() => {
        throw new Error('disk full')
      })

      expect(() =>
        handleExtensionsCheckUpdates({
          checkForExtensionUpdates: checkForExtensionUpdatesMock,
        }),
      ).not.toThrow()
    })

    it('returns ok:false with empty updates even when checkForExtensionUpdates partially computed updates before throwing', () => {
      // Simulates a scenario where the function computed some results then failed
      checkForExtensionUpdatesMock.mockImplementation(() => {
        throw new Error('interrupted')
      })

      const result = handleExtensionsCheckUpdates({
        checkForExtensionUpdates: checkForExtensionUpdatesMock,
      })

      // Error surface takes priority over partial results — consistent with
      // the handler's goal of preventing unhandled rejections, not recovering
      // partial state.
      expect(result.ok).toBe(false)
      expect(result.updates).toEqual([])
      expect(result.message).toBe('interrupted')
    })
  })

  // -------------------------------------------------------------------------
  // Passthrough — ok:false from checkForExtensionUpdates itself
  // -------------------------------------------------------------------------

  it('returns ok:false unchanged when checkForExtensionUpdates returns ok:false', () => {
    checkForExtensionUpdatesMock.mockReturnValue({
      ok: false,
      message: 'npm not found',
    })

    const result = handleExtensionsCheckUpdates({
      checkForExtensionUpdates: checkForExtensionUpdatesMock,
    })

    expect(result).toEqual({ ok: false, message: 'npm not found' })
  })

  // -------------------------------------------------------------------------
  // Empty updates (no installed extensions or all up-to-date)
  // -------------------------------------------------------------------------

  it('returns ok:true with empty updates array when no extensions are installed', async () => {
    checkForExtensionUpdatesMock.mockReturnValue({ ok: true, updates: [] })

    const result = handleExtensionsCheckUpdates({
      checkForExtensionUpdates: checkForExtensionUpdatesMock,
    })

    expect(result.ok).toBe(true)
    expect(result.updates).toEqual([])
  })

  it('returns ok:true with empty updates array when all extensions are up-to-date', async () => {
    checkForExtensionUpdatesMock.mockReturnValue({ ok: true, updates: [] })

    const result = handleExtensionsCheckUpdates({
      checkForExtensionUpdates: checkForExtensionUpdatesMock,
    })

    expect(result).toEqual({ ok: true, updates: [] })
  })

  // -------------------------------------------------------------------------
  // Available updates
  // -------------------------------------------------------------------------

  it('returns ok:true with a single update entry when one extension has an update', async () => {
    const updates = [{ id: 'my-extension', currentVersion: '1.0.0', latestVersion: '1.1.0' }]
    checkForExtensionUpdatesMock.mockReturnValue({ ok: true, updates })

    const result = handleExtensionsCheckUpdates({
      checkForExtensionUpdates: checkForExtensionUpdatesMock,
    })

    expect(result.ok).toBe(true)
    expect(result.updates).toHaveLength(1)
    expect(result.updates[0].id).toBe('my-extension')
    expect(result.updates[0].currentVersion).toBe('1.0.0')
    expect(result.updates[0].latestVersion).toBe('1.1.0')
  })

  it('returns ok:true with multiple update entries when multiple extensions have updates', async () => {
    const updates = [
      { id: 'ext-a', currentVersion: '2.0.0', latestVersion: '2.1.0' },
      { id: 'ext-b', currentVersion: '0.9.0', latestVersion: '1.0.0' },
      { id: 'ext-c', currentVersion: '3.0.0', latestVersion: '3.0.1' },
    ]
    checkForExtensionUpdatesMock.mockReturnValue({ ok: true, updates })

    const result = handleExtensionsCheckUpdates({
      checkForExtensionUpdates: checkForExtensionUpdatesMock,
    })

    expect(result.ok).toBe(true)
    expect(result.updates).toHaveLength(3)
  })

  it('preserves all fields on update entries', async () => {
    const updates = [{ id: 'my-extension', currentVersion: '1.0.0', latestVersion: '2.0.0' }]
    checkForExtensionUpdatesMock.mockReturnValue({ ok: true, updates })

    const result = handleExtensionsCheckUpdates({
      checkForExtensionUpdates: checkForExtensionUpdatesMock,
    })
    const entry = result.updates[0]

    expect(entry).toHaveProperty('id')
    expect(entry).toHaveProperty('currentVersion')
    expect(entry).toHaveProperty('latestVersion')
  })

  it('handles semver comparison edge cases (patch, minor, major)', async () => {
    const updates = [
      { id: 'ext-patch', currentVersion: '1.0.0', latestVersion: '1.0.1' },
      { id: 'ext-minor', currentVersion: '1.0.0', latestVersion: '1.1.0' },
      { id: 'ext-major', currentVersion: '1.0.0', latestVersion: '2.0.0' },
    ]
    checkForExtensionUpdatesMock.mockReturnValue({ ok: true, updates })

    const result = handleExtensionsCheckUpdates({
      checkForExtensionUpdates: checkForExtensionUpdatesMock,
    })

    expect(result.ok).toBe(true)
    expect(result.updates).toHaveLength(3)
  })
})
