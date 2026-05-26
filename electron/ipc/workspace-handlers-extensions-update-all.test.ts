import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Unit tests for the `extensions:updateAll` IPC handler.
 *
 * The handler (workspace-handlers.ts) wraps updateAllChatonsExtensions() in a
 * try/catch so that unexpected errors (disk full, permissions, npm failures)
 * are surfaced gracefully instead of becoming unhandled IPC rejections:
 *
 *   try {
 *     return updateAllChatonsExtensions();
 *   } catch (err) {
 *     console.warn("[extensions:updateAll] threw unexpectedly:", err);
 *     return { ok: false, results: [], message: err instanceof Error ? err.message : String(err) };
 *   }
 *
 * updateAllChatonsExtensions returns:
 *   { ok: true, results: Array<{ id, success, message }> }
 *   { ok: false, message: string }
 */

// -------------------------------------------------------------------------
// Inline handler — mirrors workspace-handlers.ts try/catch wrapper
// -------------------------------------------------------------------------

type UpdateAllResult =
  | { ok: true; results: Array<{ id: string; success: boolean; message: string }> }
  | { ok: false; message: string }

function handleExtensionsUpdateAll(params: {
  updateAllChatonsExtensions: () => UpdateAllResult
}): UpdateAllResult {
  try {
    return params.updateAllChatonsExtensions()
  } catch (err: unknown) {
    console.warn('[extensions:updateAll] threw unexpectedly:', err)
    return {
      ok: false as const,
      results: [],
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

describe('extensions:updateAll', () => {
  let updateAllChatonsExtensionsMock: ReturnType<typeof vi.fn>
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    updateAllChatonsExtensionsMock = vi.fn()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  // -------------------------------------------------------------------------
  // Passthrough behavior (success)
  // -------------------------------------------------------------------------

  it('calls updateAllChatonsExtensions with no arguments', async () => {
    updateAllChatonsExtensionsMock.mockReturnValue({ ok: true, results: [] })

    handleExtensionsUpdateAll({
      updateAllChatonsExtensions: updateAllChatonsExtensionsMock,
    })

    expect(updateAllChatonsExtensionsMock).toHaveBeenCalledTimes(1)
    expect(updateAllChatonsExtensionsMock).toHaveBeenCalledWith()
  })

  it('returns the result of updateAllChatonsExtensions unchanged on success', async () => {
    const expected = { ok: true, results: [] }
    updateAllChatonsExtensionsMock.mockReturnValue(expected)

    const result = handleExtensionsUpdateAll({
      updateAllChatonsExtensions: updateAllChatonsExtensionsMock,
    })

    expect(result).toEqual(expected)
  })

  it('does not call updateAllChatonsExtensions more than once per invocation', async () => {
    updateAllChatonsExtensionsMock.mockReturnValue({ ok: true, results: [] })

    handleExtensionsUpdateAll({
      updateAllChatonsExtensions: updateAllChatonsExtensionsMock,
    })
    handleExtensionsUpdateAll({
      updateAllChatonsExtensions: updateAllChatonsExtensionsMock,
    })

    expect(updateAllChatonsExtensionsMock).toHaveBeenCalledTimes(2)
  })

  // -------------------------------------------------------------------------
  // Error handling — updateAllChatonsExtensions throws
  // -------------------------------------------------------------------------

  describe('error handling — updateAllChatonsExtensions throws', () => {
    it('returns {ok:false, results:[], message} when updateAllChatonsExtensions throws Error', () => {
      updateAllChatonsExtensionsMock.mockImplementation(() => {
        throw new Error('disk full')
      })

      const result = handleExtensionsUpdateAll({
        updateAllChatonsExtensions: updateAllChatonsExtensionsMock,
      })

      expect(result.ok).toBe(false)
      expect(result.results).toEqual([])
      expect(result.message).toBe('disk full')
      expect(warnSpy).toHaveBeenCalledWith(
        '[extensions:updateAll] threw unexpectedly:',
        expect.any(Error),
      )
    })

    it('returns {ok:false, results:[], message} when updateAllChatonsExtensions throws non-Error', () => {
      updateAllChatonsExtensionsMock.mockImplementation(() => {
        throw 'npm not installed'
      })

      const result = handleExtensionsUpdateAll({
        updateAllChatonsExtensions: updateAllChatonsExtensionsMock,
      })

      expect(result.ok).toBe(false)
      expect(result.results).toEqual([])
      expect(result.message).toBe('npm not installed')
    })

    it('returns {ok:false, results:[], message} when updateAllChatonsExtensions throws object', () => {
      const errorObj = { code: 'ENOENT', path: '/usr/local/bin/npm' }
      updateAllChatonsExtensionsMock.mockImplementation(() => {
        throw errorObj
      })

      const result = handleExtensionsUpdateAll({
        updateAllChatonsExtensions: updateAllChatonsExtensionsMock,
      })

      expect(result.ok).toBe(false)
      expect(result.results).toEqual([])
      expect(result.message).toBe('[object Object]')
    })

    it('returns {ok:false, results:[], message} when updateAllChatonsExtensions throws null', () => {
      updateAllChatonsExtensionsMock.mockImplementation(() => {
        throw null
      })

      const result = handleExtensionsUpdateAll({
        updateAllChatonsExtensions: updateAllChatonsExtensionsMock,
      })

      expect(result.ok).toBe(false)
      expect(result.results).toEqual([])
      expect(result.message).toBe('null')
    })

    it('does not re-throw when updateAllChatonsExtensions throws', () => {
      updateAllChatonsExtensionsMock.mockImplementation(() => {
        throw new Error('permission denied')
      })

      expect(() =>
        handleExtensionsUpdateAll({
          updateAllChatonsExtensions: updateAllChatonsExtensionsMock,
        }),
      ).not.toThrow()
    })

    it('returns ok:false with empty results even when updateAllChatonsExtensions partially computed results before throwing', () => {
      // Simulates a scenario where some extensions were processed then the function failed
      updateAllChatonsExtensionsMock.mockImplementation(() => {
        throw new Error('interrupted')
      })

      const result = handleExtensionsUpdateAll({
        updateAllChatonsExtensions: updateAllChatonsExtensionsMock,
      })

      // Error surface takes priority over partial results — consistent with
      // the handler's goal of preventing unhandled rejections.
      expect(result.ok).toBe(false)
      expect(result.results).toEqual([])
      expect(result.message).toBe('interrupted')
    })
  })

  // -------------------------------------------------------------------------
  // Passthrough — ok:false from updateAllChatonsExtensions itself
  // -------------------------------------------------------------------------

  it('returns ok:false unchanged when updateAllChatonsExtensions returns ok:false', () => {
    updateAllChatonsExtensionsMock.mockReturnValue({
      ok: false,
      message: 'npm command not found. Please install Node.js and npm to update extensions.',
    })

    const result = handleExtensionsUpdateAll({
      updateAllChatonsExtensions: updateAllChatonsExtensionsMock,
    })

    expect(result).toEqual({
      ok: false,
      message: 'npm command not found. Please install Node.js and npm to update extensions.',
    })
  })

  // -------------------------------------------------------------------------
  // Empty results — no extensions to update
  // -------------------------------------------------------------------------

  it('returns ok:true with empty results when no extensions need updating', () => {
    updateAllChatonsExtensionsMock.mockReturnValue({ ok: true, results: [] })

    const result = handleExtensionsUpdateAll({
      updateAllChatonsExtensions: updateAllChatonsExtensionsMock,
    })

    expect(result.ok).toBe(true)
    expect(result.results).toEqual([])
  })

  it('returns ok:true when registry has no localPath extensions', () => {
    updateAllChatonsExtensionsMock.mockReturnValue({ ok: true, results: [] })

    const result = handleExtensionsUpdateAll({
      updateAllChatonsExtensions: updateAllChatonsExtensionsMock,
    })

    expect(result).toEqual({ ok: true, results: [] })
  })

  // -------------------------------------------------------------------------
  // Mixed results
  // -------------------------------------------------------------------------

  it('returns ok:true with mixed per-extension results', () => {
    const results = [
      { id: 'ext-a', success: true, message: 'Update started' },
      { id: 'ext-b', success: false, message: 'Extension not found' },
      { id: 'ext-c', success: true, message: 'Update started' },
    ]
    updateAllChatonsExtensionsMock.mockReturnValue({ ok: true, results })

    const result = handleExtensionsUpdateAll({
      updateAllChatonsExtensions: updateAllChatonsExtensionsMock,
    })

    expect(result.ok).toBe(true)
    expect(result.results).toHaveLength(3)
    expect(result.results[0].success).toBe(true)
    expect(result.results[1].success).toBe(false)
    expect(result.results[2].success).toBe(true)
  })

  it('preserves all fields on result entries', () => {
    const results = [{ id: 'ext-1', success: true, message: 'Update started' }]
    updateAllChatonsExtensionsMock.mockReturnValue({ ok: true, results })

    const result = handleExtensionsUpdateAll({
      updateAllChatonsExtensions: updateAllChatonsExtensionsMock,
    })
    const entry = result.results[0]

    expect(entry).toHaveProperty('id')
    expect(entry).toHaveProperty('success')
    expect(entry).toHaveProperty('message')
  })

  it('handles result with multiple failed extensions', () => {
    const results = [
      { id: 'ext-fail-1', success: false, message: 'npm error' },
      { id: 'ext-fail-2', success: false, message: 'Extension not found' },
    ]
    updateAllChatonsExtensionsMock.mockReturnValue({ ok: true, results })

    const result = handleExtensionsUpdateAll({
      updateAllChatonsExtensions: updateAllChatonsExtensionsMock,
    })

    expect(result.ok).toBe(true)
    expect(result.results.every(r => !r.success)).toBe(true)
  })

  it('handles result with all successful updates', () => {
    const results = [
      { id: 'ext-1', success: true, message: 'Update started' },
      { id: 'ext-2', success: true, message: 'Update started' },
      { id: 'ext-3', success: true, message: 'Update started' },
    ]
    updateAllChatonsExtensionsMock.mockReturnValue({ ok: true, results })

    const result = handleExtensionsUpdateAll({
      updateAllChatonsExtensions: updateAllChatonsExtensionsMock,
    })

    expect(result.ok).toBe(true)
    expect(result.results.every(r => r.success)).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Async behavior (passthrough is sync)
  // -------------------------------------------------------------------------

  it('returns a defined value when updateAllChatonsExtensions is called', () => {
    updateAllChatonsExtensionsMock.mockReturnValue({ ok: true, results: [] })

    const result = handleExtensionsUpdateAll({
      updateAllChatonsExtensions: updateAllChatonsExtensionsMock,
    })

    expect(result).toBeDefined()
  })
})
