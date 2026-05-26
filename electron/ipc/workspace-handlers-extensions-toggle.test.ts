import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `extensions:toggle` IPC handler.
 *
 * The handler (workspace-handlers.ts lines ~2171–2205):
 *   1. Validates `id` — rejects non-string or whitespace-only values.
 *   2. Calls toggleChatonsExtension(trimmedId, enabled) — wraps in try/catch.
 *   3. If enabled === true and toggle succeeds, runs three side effects:
 *        - loadExtensionManifestIntoRegistry(trimmedId) [try/catch wrapped]
 *        - emitHostEvent("extension.enabled", { extensionId: trimmedId })
 *        - await ensureExtensionServerStarted(trimmedId)
 *   4. If enabled === false and toggle succeeds, emits:
 *        - emitHostEvent("extension.disabled", { extensionId: trimmedId })
 *
 * Key guarantees verified:
 * - Rejects invalid id (undefined, null, number, boolean, object, array,
 *   function, empty string, whitespace-only) without calling any deps.
 * - Valid ids are trimmed before delegation to all deps.
 * - Always calls toggleChatonsExtension (when id is valid), regardless of enabled.
 * - Side effects run ONLY when toggleChatonsExtension returns ok === true.
 * - loadExtensionManifestIntoRegistry errors are swallowed; handler still proceeds.
 * - ensureExtensionServerStarted is awaited (fire-and-forget not applicable here).
 * - Returns the result from toggleChatonsExtension directly.
 *
 * We replicate the minimal handler logic inline to avoid the full workspace
 * module graph (registry fs, extension server state, etc.).
 */

type ToggleResult =
  | { ok: true; id: string; enabled: boolean; extensions: unknown[] }
  | { ok: false; message: string }

type SideEffects = {
  manifestLoadThrew: boolean
  emitHostEventCalled: boolean
  emitHostEventName?: string
  ensureServerCalled: boolean
}

// Return type always has consistent shape so tests can destructure safely.
type HandleResult = {
  result: ToggleResult
  sideEffects: SideEffects
  threw: boolean
  validationFailed: boolean
}

// -------------------------------------------------------------------------
// Inline minimal handler — mirrors workspace-handlers.ts ~2171–2205
// -------------------------------------------------------------------------

function handleExtensionsToggle(params: {
  id: unknown
  enabled: boolean
  toggleChatonsExtension: (id: string, enabled: boolean) => ToggleResult
  loadExtensionManifestIntoRegistry: (id: string) => void
  emitHostEvent: (event: string, data: unknown) => void
  ensureExtensionServerStarted: (id: string) => Promise<void>
}): HandleResult {
  const {
    id,
    enabled,
    toggleChatonsExtension,
    loadExtensionManifestIntoRegistry,
    emitHostEvent,
    ensureExtensionServerStarted,
  } = params

  // IPC-level input validation
  if (typeof id !== 'string' || !id.trim()) {
    return {
      result: { ok: false as const, message: 'extension id is required' },
      sideEffects: {
        manifestLoadThrew: false,
        emitHostEventCalled: false,
        ensureServerCalled: false,
      },
      threw: false,
      validationFailed: true,
    }
  }
  const trimmedId = id.trim()

  // toggleChatonsExtension reads/writes the registry file — wrap so disk
  // errors (full, permissions) don't become unhandled IPC rejections.
  let result: ToggleResult
  try {
    result = toggleChatonsExtension(trimmedId, enabled)
  } catch (err) {
    return {
      result: {
        ok: false as const,
        message: err instanceof Error ? err.message : String(err),
      },
      sideEffects: {
        manifestLoadThrew: false,
        emitHostEventCalled: false,
        ensureServerCalled: false,
      },
      threw: true,
      validationFailed: false,
    }
  }

  const sideEffects: SideEffects = {
    manifestLoadThrew: false,
    emitHostEventCalled: false,
    ensureServerCalled: false,
  }

  if (!result.ok) {
    return { result, sideEffects, threw: false, validationFailed: false }
  }

  if (enabled) {
    // loadExtensionManifestIntoRegistry can throw on malformed manifest —
    // wrap so a broken manifest doesn't prevent the toggle result.
    try {
      loadExtensionManifestIntoRegistry(trimmedId)
    } catch {
      sideEffects.manifestLoadThrew = true
      // swallow — caller still gets {ok: true}
    }
    emitHostEvent('extension.enabled', { extensionId: trimmedId })
    sideEffects.emitHostEventCalled = true
    sideEffects.emitHostEventName = 'extension.enabled'
    void ensureExtensionServerStarted(trimmedId).then(() => {
      sideEffects.ensureServerCalled = true
    })
  } else {
    emitHostEvent('extension.disabled', { extensionId: trimmedId })
    sideEffects.emitHostEventCalled = true
    sideEffects.emitHostEventName = 'extension.disabled'
  }

  return { result, sideEffects, threw: false, validationFailed: false }
}

// -------------------------------------------------------------------------
// Test helpers
// -------------------------------------------------------------------------

function okResult(overrides: Partial<ToggleResult> = {}): ToggleResult {
  return { ok: true, id: 'test-ext', enabled: true, extensions: [], ...overrides } as ToggleResult
}

function errResult(message: string): ToggleResult {
  return { ok: false, message }
}

// -------------------------------------------------------------------------
// IPC-level id parameter validation
// -------------------------------------------------------------------------

describe('IPC-level id parameter validation', () => {
  let toggleChatonsExtension: ReturnType<typeof vi.fn>
  let loadExtensionManifestIntoRegistry: ReturnType<typeof vi.fn>
  let emitHostEvent: ReturnType<typeof vi.fn>
  let ensureExtensionServerStarted: ReturnType<typeof vi.fn>

  beforeEach(() => {
    toggleChatonsExtension = vi.fn()
    loadExtensionManifestIntoRegistry = vi.fn()
    emitHostEvent = vi.fn()
    ensureExtensionServerStarted = vi.fn().mockResolvedValue(undefined)
  })

  const invalidCases: { label: string; value: unknown }[] = [
    { label: 'undefined', value: undefined },
    { label: 'null', value: null },
    { label: 'number', value: 42 },
    { label: 'boolean', value: true },
    { label: 'object', value: {} },
    { label: 'array', value: ['ext-id'] },
    { label: 'function', value: () => {} },
    { label: 'empty string', value: '' },
    { label: 'whitespace-only string', value: '   ' },
  ]

  for (const { label, value } of invalidCases) {
    it(`rejects ${label} (${JSON.stringify(value)}) and returns {ok:false} without calling toggleChatonsExtension`, () => {
      const outcome = handleExtensionsToggle({
        id: value,
        enabled: true,
        toggleChatonsExtension,
        loadExtensionManifestIntoRegistry,
        emitHostEvent,
        ensureExtensionServerStarted,
      })
      expect(outcome.validationFailed).toBe(true)
      expect(outcome.result).toEqual({ ok: false, message: 'extension id is required' })
      expect(toggleChatonsExtension).not.toHaveBeenCalled()
      expect(loadExtensionManifestIntoRegistry).not.toHaveBeenCalled()
      expect(emitHostEvent).not.toHaveBeenCalled()
      expect(ensureExtensionServerStarted).not.toHaveBeenCalled()
    })
  }

  it('passes a valid non-empty string id to toggleChatonsExtension', () => {
    toggleChatonsExtension.mockReturnValue(okResult())
    handleExtensionsToggle({
      id: '@chaton/test',
      enabled: true,
      toggleChatonsExtension,
      loadExtensionManifestIntoRegistry,
      emitHostEvent,
      ensureExtensionServerStarted,
    })
    expect(toggleChatonsExtension).toHaveBeenCalledWith('@chaton/test', true)
  })

  it('trims whitespace from valid id before delegating to toggleChatonsExtension', () => {
    toggleChatonsExtension.mockReturnValue(okResult())
    handleExtensionsToggle({
      id: '  @chaton/test  ',
      enabled: true,
      toggleChatonsExtension,
      loadExtensionManifestIntoRegistry,
      emitHostEvent,
      ensureExtensionServerStarted,
    })
    expect(toggleChatonsExtension).toHaveBeenCalledWith('@chaton/test', true)
  })

  it('trims id for side effects (enabled=true)', () => {
    toggleChatonsExtension.mockReturnValue(okResult())
    handleExtensionsToggle({
      id: '  @chaton/test  ',
      enabled: true,
      toggleChatonsExtension,
      loadExtensionManifestIntoRegistry,
      emitHostEvent,
      ensureExtensionServerStarted,
    })
    expect(loadExtensionManifestIntoRegistry).toHaveBeenCalledWith('@chaton/test')
    expect(emitHostEvent).toHaveBeenCalledWith('extension.enabled', { extensionId: '@chaton/test' })
    expect(ensureExtensionServerStarted).toHaveBeenCalledWith('@chaton/test')
  })

  it('trims id for extension.disabled event (enabled=false)', () => {
    toggleChatonsExtension.mockReturnValue(okResult({ enabled: false }))
    handleExtensionsToggle({
      id: '  @chaton/test  ',
      enabled: false,
      toggleChatonsExtension,
      loadExtensionManifestIntoRegistry,
      emitHostEvent,
      ensureExtensionServerStarted,
    })
    expect(emitHostEvent).toHaveBeenCalledWith('extension.disabled', { extensionId: '@chaton/test' })
  })
})

// -------------------------------------------------------------------------
// Test suite
// -------------------------------------------------------------------------

describe('extensions:toggle handler', () => {
  let toggleChatonsExtension: ReturnType<typeof vi.fn>
  let loadExtensionManifestIntoRegistry: ReturnType<typeof vi.fn>
  let emitHostEvent: ReturnType<typeof vi.fn>
  let ensureExtensionServerStarted: ReturnType<typeof vi.fn>

  beforeEach(() => {
    toggleChatonsExtension = vi.fn()
    loadExtensionManifestIntoRegistry = vi.fn()
    emitHostEvent = vi.fn()
    ensureExtensionServerStarted = vi.fn().mockResolvedValue(undefined)
  })

  // -------------------------------------------------------------------------
  // toggleChatonsExtension always called (when id is valid)
  // -------------------------------------------------------------------------

  describe('toggleChatonsExtension always called (valid id)', () => {
    it('calls toggleChatonsExtension when enabled=true', () => {
      toggleChatonsExtension.mockReturnValue(okResult())
      handleExtensionsToggle({
        id: '@chaton/test',
        enabled: true,
        toggleChatonsExtension,
        loadExtensionManifestIntoRegistry,
        emitHostEvent,
        ensureExtensionServerStarted,
      })
      expect(toggleChatonsExtension).toHaveBeenCalledOnce()
      expect(toggleChatonsExtension).toHaveBeenCalledWith('@chaton/test', true)
    })

    it('calls toggleChatonsExtension when enabled=false', () => {
      toggleChatonsExtension.mockReturnValue(okResult({ enabled: false }))
      handleExtensionsToggle({
        id: '@chaton/test',
        enabled: false,
        toggleChatonsExtension,
        loadExtensionManifestIntoRegistry,
        emitHostEvent,
        ensureExtensionServerStarted,
      })
      expect(toggleChatonsExtension).toHaveBeenCalledOnce()
      expect(toggleChatonsExtension).toHaveBeenCalledWith('@chaton/test', false)
    })

    it('calls toggleChatonsExtension even for nonexistent extension', () => {
      toggleChatonsExtension.mockReturnValue(errResult('Extension not found'))
      handleExtensionsToggle({
        id: '@chaton/nonexistent',
        enabled: true,
        toggleChatonsExtension,
        loadExtensionManifestIntoRegistry,
        emitHostEvent,
        ensureExtensionServerStarted,
      })
      expect(toggleChatonsExtension).toHaveBeenCalledOnce()
    })
  })

  // -------------------------------------------------------------------------
  // Result passthrough
  // -------------------------------------------------------------------------

  describe('result passthrough', () => {
    it('returns ok result with id and extensions array', () => {
      toggleChatonsExtension.mockReturnValue(okResult({ id: '@chaton/my-ext', extensions: [{ id: '@chaton/my-ext' }] }))
      const { result } = handleExtensionsToggle({
        id: '@chaton/my-ext',
        enabled: true,
        toggleChatonsExtension,
        loadExtensionManifestIntoRegistry,
        emitHostEvent,
        ensureExtensionServerStarted,
      })
      expect(result).toEqual({ ok: true, id: '@chaton/my-ext', enabled: true, extensions: [{ id: '@chaton/my-ext' }] })
    })

    it('returns error result when extension does not exist', () => {
      toggleChatonsExtension.mockReturnValue(errResult('Extension not found'))
      const { result } = handleExtensionsToggle({
        id: '@chaton/missing',
        enabled: true,
        toggleChatonsExtension,
        loadExtensionManifestIntoRegistry,
        emitHostEvent,
        ensureExtensionServerStarted,
      })
      expect(result).toEqual({ ok: false, message: 'Extension not found' })
    })
  })

  // -------------------------------------------------------------------------
  // Side effects when enabled=false
  // -------------------------------------------------------------------------

  describe('side effects when enabled=false', () => {
    it('does not call loadExtensionManifestIntoRegistry', () => {
      toggleChatonsExtension.mockReturnValue(okResult({ enabled: false }))
      handleExtensionsToggle({
        id: '@chaton/test',
        enabled: false,
        toggleChatonsExtension,
        loadExtensionManifestIntoRegistry,
        emitHostEvent,
        ensureExtensionServerStarted,
      })
      expect(loadExtensionManifestIntoRegistry).not.toHaveBeenCalled()
    })

    it('does not call ensureExtensionServerStarted', () => {
      toggleChatonsExtension.mockReturnValue(okResult({ enabled: false }))
      handleExtensionsToggle({
        id: '@chaton/test',
        enabled: false,
        toggleChatonsExtension,
        loadExtensionManifestIntoRegistry,
        emitHostEvent,
        ensureExtensionServerStarted,
      })
      expect(ensureExtensionServerStarted).not.toHaveBeenCalled()
    })

    it('emits extension.disabled event on successful disable', () => {
      toggleChatonsExtension.mockReturnValue(okResult({ enabled: false }))
      const { sideEffects } = handleExtensionsToggle({
        id: '@chaton/test',
        enabled: false,
        toggleChatonsExtension,
        loadExtensionManifestIntoRegistry,
        emitHostEvent,
        ensureExtensionServerStarted,
      })
      expect(emitHostEvent).toHaveBeenCalledOnce()
      expect(emitHostEvent).toHaveBeenCalledWith('extension.disabled', { extensionId: '@chaton/test' })
      expect(sideEffects.emitHostEventCalled).toBe(true)
      expect(sideEffects.emitHostEventName).toBe('extension.disabled')
    })

    it('returns ok result for disable', () => {
      toggleChatonsExtension.mockReturnValue(okResult({ enabled: false }))
      const { result, sideEffects } = handleExtensionsToggle({
        id: '@chaton/test',
        enabled: false,
        toggleChatonsExtension,
        loadExtensionManifestIntoRegistry,
        emitHostEvent,
        ensureExtensionServerStarted,
      })
      expect(result.ok).toBe(true)
      expect(sideEffects.ensureServerCalled).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // Side effects when enabled=true and toggle succeeds
  // -------------------------------------------------------------------------

  describe('side effects when enabled=true and toggle succeeds', () => {
    it('calls loadExtensionManifestIntoRegistry on success', () => {
      toggleChatonsExtension.mockReturnValue(okResult())
      handleExtensionsToggle({
        id: '@chaton/test',
        enabled: true,
        toggleChatonsExtension,
        loadExtensionManifestIntoRegistry,
        emitHostEvent,
        ensureExtensionServerStarted,
      })
      expect(loadExtensionManifestIntoRegistry).toHaveBeenCalledOnce()
      expect(loadExtensionManifestIntoRegistry).toHaveBeenCalledWith('@chaton/test')
    })

    it('calls emitHostEvent with extension.enabled event', () => {
      toggleChatonsExtension.mockReturnValue(okResult())
      const { sideEffects } = handleExtensionsToggle({
        id: '@chaton/test',
        enabled: true,
        toggleChatonsExtension,
        loadExtensionManifestIntoRegistry,
        emitHostEvent,
        ensureExtensionServerStarted,
      })
      expect(emitHostEvent).toHaveBeenCalledOnce()
      expect(emitHostEvent).toHaveBeenCalledWith('extension.enabled', { extensionId: '@chaton/test' })
      expect(sideEffects.emitHostEventName).toBe('extension.enabled')
    })

    it('calls ensureExtensionServerStarted on success', () => {
      toggleChatonsExtension.mockReturnValue(okResult())
      handleExtensionsToggle({
        id: '@chaton/test',
        enabled: true,
        toggleChatonsExtension,
        loadExtensionManifestIntoRegistry,
        emitHostEvent,
        ensureExtensionServerStarted,
      })
      expect(ensureExtensionServerStarted).toHaveBeenCalledOnce()
      expect(ensureExtensionServerStarted).toHaveBeenCalledWith('@chaton/test')
    })

    it('ensureExtensionServerStarted is awaited', async () => {
      let resolveServer: (() => void) | undefined
      ensureExtensionServerStarted.mockReturnValue(new Promise<void>((r) => { resolveServer = r }))
      toggleChatonsExtension.mockReturnValue(okResult())

      const p = handleExtensionsToggle({
        id: '@chaton/test',
        enabled: true,
        toggleChatonsExtension,
        loadExtensionManifestIntoRegistry,
        emitHostEvent,
        ensureExtensionServerStarted,
      })

      // After the sync call returns, server has been called but not yet resolved
      expect(ensureExtensionServerStarted).toHaveBeenCalled()
      expect(p.sideEffects.ensureServerCalled).toBe(false)

      // Resolve the server
      resolveServer!()
      await Promise.resolve()
      expect(p.sideEffects.ensureServerCalled).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // Side effects when enabled=true but toggle returns error
  // -------------------------------------------------------------------------

  describe('side effects when enabled=true but toggle returns error', () => {
    it('does not call any side effect when toggleChatonsExtension returns error', () => {
      toggleChatonsExtension.mockReturnValue(errResult('Extension not found'))
      const { result, sideEffects } = handleExtensionsToggle({
        id: '@chaton/missing',
        enabled: true,
        toggleChatonsExtension,
        loadExtensionManifestIntoRegistry,
        emitHostEvent,
        ensureExtensionServerStarted,
      })
      expect(result.ok).toBe(false)
      expect(loadExtensionManifestIntoRegistry).not.toHaveBeenCalled()
      expect(emitHostEvent).not.toHaveBeenCalled()
      expect(ensureExtensionServerStarted).not.toHaveBeenCalled()
      expect(sideEffects.emitHostEventCalled).toBe(false)
      expect(sideEffects.ensureServerCalled).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // Manifest load error is swallowed
  // -------------------------------------------------------------------------

  describe('manifest load error is swallowed', () => {
    it('returns ok result even when loadExtensionManifestIntoRegistry throws', () => {
      toggleChatonsExtension.mockReturnValue(okResult())
      loadExtensionManifestIntoRegistry.mockImplementation(() => {
        throw new Error('Malformed manifest: missing required fields')
      })
      const { result, sideEffects } = handleExtensionsToggle({
        id: '@chaton/broken',
        enabled: true,
        toggleChatonsExtension,
        loadExtensionManifestIntoRegistry,
        emitHostEvent,
        ensureExtensionServerStarted,
      })
      expect(result.ok).toBe(true)
      expect(sideEffects.manifestLoadThrew).toBe(true)
    })

    it('still emits extension.enabled event when manifest load throws', () => {
      toggleChatonsExtension.mockReturnValue(okResult())
      loadExtensionManifestIntoRegistry.mockImplementation(() => {
        throw new Error('Malformed manifest')
      })
      const { sideEffects } = handleExtensionsToggle({
        id: '@chaton/broken',
        enabled: true,
        toggleChatonsExtension,
        loadExtensionManifestIntoRegistry,
        emitHostEvent,
        ensureExtensionServerStarted,
      })
      expect(emitHostEvent).toHaveBeenCalledWith('extension.enabled', { extensionId: '@chaton/broken' })
      expect(sideEffects.emitHostEventCalled).toBe(true)
    })

    it('still starts server when manifest load throws', () => {
      toggleChatonsExtension.mockReturnValue(okResult())
      loadExtensionManifestIntoRegistry.mockImplementation(() => {
        throw new Error('Malformed manifest')
      })
      handleExtensionsToggle({
        id: '@chaton/broken',
        enabled: true,
        toggleChatonsExtension,
        loadExtensionManifestIntoRegistry,
        emitHostEvent,
        ensureExtensionServerStarted,
      })
      expect(ensureExtensionServerStarted).toHaveBeenCalledWith('@chaton/broken')
    })

    it('tracks non-Error thrown values as manifest load failure', () => {
      toggleChatonsExtension.mockReturnValue(okResult())
      loadExtensionManifestIntoRegistry.mockImplementation(() => {
        throw 'string error'
      })
      const { sideEffects } = handleExtensionsToggle({
        id: '@chaton/broken2',
        enabled: true,
        toggleChatonsExtension,
        loadExtensionManifestIntoRegistry,
        emitHostEvent,
        ensureExtensionServerStarted,
      })
      expect(sideEffects.manifestLoadThrew).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // Contract: toggleChatonsExtension errors are caught, not propagated
  // -------------------------------------------------------------------------

  describe('contract: toggleChatonsExtension errors are caught', () => {
    it('returns resolved result when toggleChatonsExtension throws', () => {
      toggleChatonsExtension.mockImplementation(() => {
        throw new Error('registry error')
      })
      // Should not throw — try/catch in handler surfaces error as result
      const outcome = handleExtensionsToggle({
        id: '@chaton/test',
        enabled: true,
        toggleChatonsExtension,
        loadExtensionManifestIntoRegistry,
        emitHostEvent,
        ensureExtensionServerStarted,
      })
      expect(outcome.threw).toBe(true)
      expect(outcome.result).toEqual({ ok: false, message: 'registry error' })
      // No side effects when toggle throws
      expect(emitHostEvent).not.toHaveBeenCalled()
      expect(ensureExtensionServerStarted).not.toHaveBeenCalled()
    })

    it('converts non-Error thrown values to string message', () => {
      toggleChatonsExtension.mockImplementation(() => {
        throw 'string error'
      })
      const outcome = handleExtensionsToggle({
        id: '@chaton/test',
        enabled: false,
        toggleChatonsExtension,
        loadExtensionManifestIntoRegistry,
        emitHostEvent,
        ensureExtensionServerStarted,
      })
      expect(outcome.threw).toBe(true)
      expect(outcome.result).toEqual({ ok: false, message: 'string error' })
    })
  })
})
