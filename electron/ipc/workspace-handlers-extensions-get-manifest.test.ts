import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `extensions:getManifest` IPC handler.
 *
 * Handler (workspace-handlers.ts lines ~2175–2183):
 *   ipcMain.handle("extensions:getManifest", (_event, extensionId: string) => {
 *     if (typeof extensionId !== "string" || !extensionId.trim()) {
 *       return { ok: false as const, message: "extension id is required" };
 *     }
 *     return {
 *       ok: true as const,
 *       manifest: getExtensionManifest(extensionId.trim()),
 *     };
 *   });
 *
 * getExtensionManifest reads from runtimeState.manifests Map.
 * Without the guard, a non-string extensionId could cause undefined behaviour
 * when passed to the Map lookup. The guard ensures the Map always receives a
 * non-empty string.
 */

type ExtensionManifest = { id: string; name: string; version: string }

function handleGetManifest(params: {
  extensionId: unknown
  getExtensionManifest: (extensionId: string) => ExtensionManifest | null
}): { ok: true; manifest: ExtensionManifest | null } | { ok: false; message: string } {
  const { extensionId, getExtensionManifest } = params
  if (typeof extensionId !== 'string' || !extensionId.trim()) {
    return { ok: false as const, message: 'extension id is required' }
  }
  return {
    ok: true as const,
    manifest: getExtensionManifest(extensionId.trim()),
  }
}

describe('handleGetManifest', () => {
  const makeDeps = (
    overrides?: Partial<{ getExtensionManifest: (extensionId: string) => ExtensionManifest | null }>,
  ) => ({
    getExtensionManifest: vi
      .fn<(extensionId: string) => ExtensionManifest | null>()
      .mockReturnValue({ id: 'stub', name: 'Stub Extension', version: '1.0.0' }),
    ...overrides,
  })

  // --- validation: returns error for non-string extensionId ---

  it('returns error when extensionId is null', () => {
    const deps = makeDeps()
    const result = handleGetManifest({ extensionId: null, ...deps })
    expect(result).toEqual({ ok: false, message: 'extension id is required' })
    expect(deps.getExtensionManifest).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is undefined', () => {
    const deps = makeDeps()
    const result = handleGetManifest({ extensionId: undefined, ...deps })
    expect(result).toEqual({ ok: false, message: 'extension id is required' })
    expect(deps.getExtensionManifest).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is a number', () => {
    const deps = makeDeps()
    const result = handleGetManifest({ extensionId: 99, ...deps })
    expect(result).toEqual({ ok: false, message: 'extension id is required' })
    expect(deps.getExtensionManifest).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is an object', () => {
    const deps = makeDeps()
    const result = handleGetManifest({ extensionId: { id: 'test' }, ...deps })
    expect(result).toEqual({ ok: false, message: 'extension id is required' })
    expect(deps.getExtensionManifest).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is an array', () => {
    const deps = makeDeps()
    const result = handleGetManifest({ extensionId: ['a', 'b'], ...deps })
    expect(result).toEqual({ ok: false, message: 'extension id is required' })
    expect(deps.getExtensionManifest).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is a boolean', () => {
    const deps = makeDeps()
    const result = handleGetManifest({ extensionId: false, ...deps })
    expect(result).toEqual({ ok: false, message: 'extension id is required' })
    expect(deps.getExtensionManifest).not.toHaveBeenCalled()
  })

  // --- validation: returns error for empty/whitespace extensionId ---

  it('returns error when extensionId is an empty string', () => {
    const deps = makeDeps()
    const result = handleGetManifest({ extensionId: '', ...deps })
    expect(result).toEqual({ ok: false, message: 'extension id is required' })
    expect(deps.getExtensionManifest).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is whitespace-only', () => {
    const deps = makeDeps()
    const result = handleGetManifest({ extensionId: '     ', ...deps })
    expect(result).toEqual({ ok: false, message: 'extension id is required' })
    expect(deps.getExtensionManifest).not.toHaveBeenCalled()
  })

  it('returns error when extensionId is only whitespace characters', () => {
    const deps = makeDeps()
    const result = handleGetManifest({ extensionId: '\t\n  ', ...deps })
    expect(result).toEqual({ ok: false, message: 'extension id is required' })
    expect(deps.getExtensionManifest).not.toHaveBeenCalled()
  })

  // --- happy path: delegates with trimmed extensionId ---

  it('delegates to getExtensionManifest with the trimmed extensionId', () => {
    const getExtensionManifest = vi
      .fn<(extensionId: string) => ExtensionManifest | null>()
      .mockReturnValue({ id: 'my-ext', name: 'My Extension', version: '2.1.0' })
    const deps = makeDeps({ getExtensionManifest })
    handleGetManifest({ extensionId: '  my-ext  ', ...deps })
    expect(getExtensionManifest).toHaveBeenCalledOnce()
    expect(getExtensionManifest).toHaveBeenCalledWith('my-ext')
  })

  it('returns manifest when extension exists', () => {
    const manifest: ExtensionManifest = { id: 'exists', name: 'Installed Extension', version: '1.0.0' }
    const deps = makeDeps({ getExtensionManifest: vi.fn().mockReturnValue(manifest) })
    const result = handleGetManifest({ extensionId: 'exists', ...deps })
    expect(result).toEqual({ ok: true, manifest })
  })

  it('returns manifest: null when extension does not exist', () => {
    const deps = makeDeps({ getExtensionManifest: vi.fn().mockReturnValue(null) })
    const result = handleGetManifest({ extensionId: 'not-installed', ...deps })
    expect(result).toEqual({ ok: true, manifest: null })
  })

  it('does not call getExtensionManifest more than once per invocation', () => {
    const getExtensionManifest = vi
      .fn<(extensionId: string) => ExtensionManifest | null>()
      .mockReturnValue(null)
    const deps = makeDeps({ getExtensionManifest })
    handleGetManifest({ extensionId: 'ext', ...deps })
    expect(getExtensionManifest).toHaveBeenCalledTimes(1)
  })
})
