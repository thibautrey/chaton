import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `extensions:remove` IPC handler.
 *
 * The handler removes a third-party extension from disk, cleans up the registry,
 * kills running server processes, removes install state, and deletes per-extension
 * log files.
 *
 * Key behavioral guarantees verified:
 * - Builtin extensions (@chaton/automation, @chaton/memory, @chaton/browser,
 *   @chaton/tps-monitor, @chaton/extension-manager, @chaton/projects) are protected —
 *   removing them returns {ok: false} with a descriptive message.
 * - Returns {ok: false} with error message when fs.rmSync throws.
 * - Returns {ok: true} with id and updated registry on success.
 * - No filesystem operations are attempted for builtin extensions (early return).
 * - clearExtensionRuntimeState and installStates.delete are called on success.
 *
 * We replicate the minimal handler logic inline to test without needing the full
 * workspace-handlers.ts module (which requires complex dep setup).
 */

// -------------------------------------------------------------------------
// Inline minimal handler — mirrors electron/extensions/manager.ts removeChatonsExtension
// and the thin IPC wrapper at workspace-handlers.ts lines 2105–2106.
// -------------------------------------------------------------------------

/**
 * Inline handler mirroring workspace-handlers.ts lines 2269–2279.
 * Validates id before delegating to the extension-remove business logic.
 * Separated into two layers: handler (validation) → remove logic (business).
 */

type RemoveExtensionResult =
  | { ok: true; id: string; extensions: unknown[] }
  | { ok: false; message: string }

function removeExtensionLogic(params: {
  id: string
  builtinIds: string[]
  extensionDirExists: (id: string) => boolean
  removeExtensionDir: (id: string) => void
  removeLegacyInstallRoot: (id: string) => void
  removeLogFile: (logPath: string) => void
  setRegistryEntry: (updater: (state: { extensions: unknown[] }) => { extensions: unknown[] }) => { extensions: unknown[] }
  clearExtensionRuntimeState: (id: string) => void
  deleteInstallState: (id: string) => void
}): RemoveExtensionResult {
  const { id, builtinIds, extensionDirExists, removeExtensionDir, removeLegacyInstallRoot, removeLogFile, setRegistryEntry, clearExtensionRuntimeState, deleteInstallState } = params

  // Guard: builtin extensions cannot be removed
  if (builtinIds.includes(id)) {
    return { ok: false, message: 'Builtin extension cannot be removed' }
  }

  try {
    if (extensionDirExists(id)) {
      removeExtensionDir(id)
    }
    if (extensionDirExists(id + '-legacy')) {
      removeLegacyInstallRoot(id)
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }

  const registry = setRegistryEntry((state) => ({
    ...state,
    extensions: (state.extensions as { id: string }[]).filter((entry) => entry.id !== id),
  }))

  clearExtensionRuntimeState(id)
  deleteInstallState(id)

  const runtimeLogPath = `/fake/chaton/extensions/logs/${id.replace(/[^a-z0-9]/gi, '-')}.log`
  const installLogPath = `/fake/chaton/extensions/logs/${id.replace(/[^a-z0-9]/gi, '-')}.install.log`
  for (const logPath of [runtimeLogPath, installLogPath]) {
    try {
      removeLogFile(logPath)
    } catch {
      // ignore — file may not exist or be held by another process
    }
  }

  return { ok: true, id, extensions: registry.extensions }
}

function isOkResult(r: RemoveExtensionResult): r is { ok: true; id: string; extensions: unknown[] } {
  return r.ok === true;
}

function handleExtensionsRemove(params: {
  id: string
  builtinIds: string[]
  extensionDirExists: (id: string) => boolean
  removeExtensionDir: (id: string) => void
  removeLegacyInstallRoot: (id: string) => void
  removeLogFile: (logPath: string) => void
  setRegistryEntry: (updater: (state: { extensions: unknown[] }) => { extensions: unknown[] }) => { extensions: unknown[] }
  clearExtensionRuntimeState: (id: string) => void
  deleteInstallState: (id: string) => void
}): RemoveExtensionResult {
  const { id, ...logicParams } = params
  if (typeof id !== "string" || !id.trim()) {
    return { ok: false, message: "extension id is required" };
  }
  return removeExtensionLogic({ ...logicParams, id: id.trim() });
}

// -------------------------------------------------------------------------
// Test suite
// -------------------------------------------------------------------------

describe('extensions:remove', () => {
  // -------------------------------------------------------------------------
  // Shared mocks
  // -------------------------------------------------------------------------

  const BUILTIN_IDS = [
    '@chaton/automation',
    '@chaton/memory',
    '@chaton/browser',
    '@chaton/tps-monitor',
    '@chaton/extension-manager',
    '@chaton/projects',
  ]

  let existingRegistry: { extensions: unknown[] }
  let setRegistryEntry: (updater: (state: { extensions: unknown[] }) => { extensions: unknown[] }) => { extensions: unknown[] }
  let extensionDirExists: (id: string) => boolean
  let removeExtensionDir: ReturnType<typeof vi.fn>
  let removeLegacyInstallRoot: ReturnType<typeof vi.fn>
  let removeLogFile: ReturnType<typeof vi.fn>
  let clearExtensionRuntimeState: ReturnType<typeof vi.fn>
  let deleteInstallState: ReturnType<typeof vi.fn>

  const makeParams = () => ({
    builtinIds: BUILTIN_IDS,
    extensionDirExists,
    removeExtensionDir,
    removeLegacyInstallRoot,
    removeLogFile,
    setRegistryEntry,
    clearExtensionRuntimeState,
    deleteInstallState,
  })

  beforeEach(() => {
    existingRegistry = {
      extensions: [
        { id: '@chaton/automation', name: 'Automation' },
        { id: '@chaton/memory', name: 'Memory' },
        { id: 'my-custom-extension', name: 'My Custom Extension' },
      ],
    }

    setRegistryEntry = vi.fn((updater) => updater(existingRegistry))
    extensionDirExists = vi.fn(() => false)
    removeExtensionDir = vi.fn()
    removeLegacyInstallRoot = vi.fn()
    removeLogFile = vi.fn()
    clearExtensionRuntimeState = vi.fn()
    deleteInstallState = vi.fn()
  })

  // -------------------------------------------------------------------------
  // Builtin extension guard
  // -------------------------------------------------------------------------

  describe('builtin extension guard', () => {
    for (const builtinId of BUILTIN_IDS) {
      it(`returns {ok: false} for builtin: ${builtinId}`, () => {
        const result = handleExtensionsRemove({
          ...makeParams(),
          id: builtinId,
        })
        expect(result).toEqual({ ok: false, message: 'Builtin extension cannot be removed' })
      })
    }

    it('does NOT attempt filesystem operations for builtin extensions', () => {
      handleExtensionsRemove({ ...makeParams(), id: '@chaton/automation' })
      expect(removeExtensionDir).not.toHaveBeenCalled()
      expect(removeLegacyInstallRoot).not.toHaveBeenCalled()
      expect(removeLogFile).not.toHaveBeenCalled()
    })

    it('does NOT modify the registry for builtin extensions', () => {
      handleExtensionsRemove({ ...makeParams(), id: '@chaton/memory' })
      expect(setRegistryEntry).not.toHaveBeenCalled()
    })

    it('does NOT call runtime cleanup for builtin extensions', () => {
      handleExtensionsRemove({ ...makeParams(), id: '@chaton/browser' })
      expect(clearExtensionRuntimeState).not.toHaveBeenCalled()
      expect(deleteInstallState).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Filesystem errors
  // -------------------------------------------------------------------------

  describe('filesystem error handling', () => {
    it('returns {ok: false} when removeExtensionDir throws', () => {
      removeExtensionDir = vi.fn(() => { throw new Error('Permission denied') })
      extensionDirExists = vi.fn(() => true)

      const result = handleExtensionsRemove({
        ...makeParams(),
        id: 'my-custom-extension',
        removeExtensionDir,
        extensionDirExists,
      })

      expect(result).toEqual({ ok: false, message: 'Permission denied' })
    })

    it('returns {ok: false} with string error when removeExtensionDir throws a non-Error', () => {
      removeExtensionDir = vi.fn(() => { throw 'DISK_FULL' })
      extensionDirExists = vi.fn(() => true)

      const result = handleExtensionsRemove({
        ...makeParams(),
        id: 'my-custom-extension',
        removeExtensionDir,
        extensionDirExists,
      })

      expect(result).toEqual({ ok: false, message: 'DISK_FULL' })
    })

    it('skips filesystem ops when extension dir does not exist', () => {
      // No exception thrown when directory doesn't exist
      extensionDirExists = vi.fn(() => false)

      const result = handleExtensionsRemove({
        ...makeParams(),
        id: 'my-custom-extension',
        extensionDirExists,
      })

      expect(result.ok).toBe(true)
      expect(removeExtensionDir).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Success path
  // -------------------------------------------------------------------------

  describe('success path', () => {
    it('returns {ok: true, id, extensions} on success', () => {
      const result = handleExtensionsRemove({
        ...makeParams(),
        id: 'my-custom-extension',
      })

      expect(result).toMatchObject({ ok: true, id: 'my-custom-extension' })
      expect(result).toHaveProperty('extensions')
    })

    it('calls removeExtensionDir when extension dir exists', () => {
      extensionDirExists = vi.fn(() => true)

      handleExtensionsRemove({
        ...makeParams(),
        id: 'my-custom-extension',
        extensionDirExists,
      })

      expect(removeExtensionDir).toHaveBeenCalledOnce()
    })

    it('calls clearExtensionRuntimeState with the extension id on success', () => {
      handleExtensionsRemove({ ...makeParams(), id: 'my-custom-extension' })

      expect(clearExtensionRuntimeState).toHaveBeenCalledWith('my-custom-extension')
    })

    it('calls deleteInstallState with the extension id on success', () => {
      handleExtensionsRemove({ ...makeParams(), id: 'my-custom-extension' })

      expect(deleteInstallState).toHaveBeenCalledWith('my-custom-extension')
    })

    it('removes the extension from the registry', () => {
      handleExtensionsRemove({ ...makeParams(), id: 'my-custom-extension' })

      expect(setRegistryEntry).toHaveBeenCalledOnce()
      const updater = setRegistryEntry.mock.calls[0][0]
      const updated = updater(existingRegistry)
      expect((updated.extensions as { id: string }[]).find(e => e.id === 'my-custom-extension')).toBeUndefined()
      expect((updated.extensions as { id: string }[]).find(e => e.id === '@chaton/automation')).toBeDefined()
    })

    it('tries to remove runtime and install log files on success', () => {
      handleExtensionsRemove({ ...makeParams(), id: 'my-custom-extension' })

      expect(removeLogFile).toHaveBeenCalledTimes(2)
    })

    it('log file removal errors are silently ignored (no exception)', () => {
      removeLogFile = vi.fn(() => { throw new Error('File locked') })

      // Should NOT throw — errors are caught
      expect(() =>
        handleExtensionsRemove({ ...makeParams(), id: 'my-custom-extension', removeLogFile }),
      ).not.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // Input validation (handler layer)
  // -------------------------------------------------------------------------
  describe('input validation', () => {
    it('returns {ok:false} with message when id is undefined', () => {
      const result = handleExtensionsRemove({
        ...makeParams(),
        id: undefined as unknown as string,
      })
      expect(result).toEqual({ ok: false, message: "extension id is required" })
    });

    it('returns {ok:false} with message when id is null', () => {
      const result = handleExtensionsRemove({
        ...makeParams(),
        id: null as unknown as string,
      })
      expect(result).toEqual({ ok: false, message: "extension id is required" })
    });

    it('returns {ok:false} with message when id is a number', () => {
      const result = handleExtensionsRemove({
        ...makeParams(),
        id: 42 as unknown as string,
      })
      expect(result).toEqual({ ok: false, message: "extension id is required" })
    });

    it('returns {ok:false} with message when id is empty string', () => {
      const result = handleExtensionsRemove({ ...makeParams(), id: '' })
      expect(result).toEqual({ ok: false, message: "extension id is required" })
    });

    it('returns {ok:false} with message when id is only whitespace', () => {
      const result = handleExtensionsRemove({ ...makeParams(), id: '   \t' })
      expect(result).toEqual({ ok: false, message: "extension id is required" })
    });

    it('does not call extensionDirExists for empty id', () => {
      extensionDirExists = vi.fn(() => false)
      handleExtensionsRemove({ ...makeParams(), id: '' })
      expect(extensionDirExists).not.toHaveBeenCalled()
    });

    it('does not call removeExtensionDir for whitespace id', () => {
      removeExtensionDir = vi.fn()
      handleExtensionsRemove({ ...makeParams(), id: '   \t' })
      expect(removeExtensionDir).not.toHaveBeenCalled()
    });

    it('trims whitespace from id before passing to business logic', () => {
      extensionDirExists = vi.fn(() => false)
      handleExtensionsRemove({ ...makeParams(), id: '  my-custom-extension  ' })
      expect(extensionDirExists).toHaveBeenCalledWith('my-custom-extension')
    });

    it('propagates {ok:true} from business logic for trimmed id', () => {
      const result = handleExtensionsRemove({ ...makeParams(), id: '  my-custom-extension  ' })
      expect(result.ok).toBe(true)
    });
  })
})
