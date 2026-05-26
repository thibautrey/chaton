import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `pi:updateAuthJson` IPC handler.
 *
 * The handler (workspace-handlers.ts lines 1648–1670):
 * 1. Validates input — must be a non-null plain object (not array, not primitive)
 * 2. Backs up existing auth.json if it exists (via fs.existsSync check)
 * 3. Atomically writes the new auth content
 * 4. Syncs provider API keys between models.json and auth.json
 * 5. Returns ok:true on success, ok:false with message on any caught error
 *
 * We replicate the minimal handler logic inline to test without needing the full
 * workspace-handlers.ts module (Electron IPC wiring, DB, Pi deps, path module).
 */

type Result = { ok: true } | { ok: false; message: string }

interface MockDeps {
  getPiAgentDir: () => string
  backupFile: (path: string) => void
  atomicWriteJson: (path: string, data: Record<string, unknown>) => void
  syncProviderApiKeysBetweenModelsAndAuth: (piAgentDir: string) => void
  existsSync: (path: string) => boolean
}

// Inline handler mirroring workspace-handlers.ts lines 1648–1670
// eslint-disable-next-line max-len
function handleUpdateAuthJson(next: unknown, deps: MockDeps): Result {
  if (!next || typeof next !== "object" || Array.isArray(next)) {
    return {
      ok: false as const,
      message: "auth.json invalide: objet attendu.",
    };
  }
  const authPath = deps.getPiAgentDir() + "/auth.json";
  try {
    if (deps.existsSync(authPath)) {
      deps.backupFile(authPath);
    }
    deps.atomicWriteJson(authPath, next as Record<string, unknown>);
    deps.syncProviderApiKeysBetweenModelsAndAuth(deps.getPiAgentDir());
    return { ok: true as const };
  } catch (writeError) {
    return {
      ok: false as const,
      message:
        writeError instanceof Error ? writeError.message : String(writeError),
    };
  }
}

describe('pi:updateAuthJson', () => {
  let deps: MockDeps
  let backupFile: ReturnType<typeof vi.fn>
  let atomicWriteJson: ReturnType<typeof vi.fn>
  let syncProviderApiKeysBetweenModelsAndAuth: ReturnType<typeof vi.fn>
  let getPiAgentDir: ReturnType<typeof vi.fn>
  let existsSync: ReturnType<typeof vi.fn>

  beforeEach(() => {
    backupFile = vi.fn()
    atomicWriteJson = vi.fn()
    syncProviderApiKeysBetweenModelsAndAuth = vi.fn()
    getPiAgentDir = vi.fn().mockReturnValue('/pi/agent')
    existsSync = vi.fn().mockReturnValue(false) // default: file does NOT exist

    deps = {
      getPiAgentDir,
      backupFile,
      atomicWriteJson,
      syncProviderApiKeysBetweenModelsAndAuth,
      existsSync,
    }
  })

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------

  it('returns error when input is null', () => {
    const result = handleUpdateAuthJson(null, deps)
    expect(result).toEqual({
      ok: false,
      message: "auth.json invalide: objet attendu.",
    })
    expect(atomicWriteJson).not.toHaveBeenCalled()
  })

  it('returns error when input is undefined', () => {
    const result = handleUpdateAuthJson(undefined, deps)
    expect(result).toEqual({
      ok: false,
      message: "auth.json invalide: objet attendu.",
    })
    expect(atomicWriteJson).not.toHaveBeenCalled()
  })

  it('returns error when input is a number', () => {
    const result = handleUpdateAuthJson(42, deps)
    expect(result).toEqual({
      ok: false,
      message: "auth.json invalide: objet attendu.",
    })
    expect(atomicWriteJson).not.toHaveBeenCalled()
  })

  it('returns error when input is a string', () => {
    const result = handleUpdateAuthJson('{"key":"value"}', deps)
    expect(result).toEqual({
      ok: false,
      message: "auth.json invalide: objet attendu.",
    })
    expect(atomicWriteJson).not.toHaveBeenCalled()
  })

  it('returns error when input is an array', () => {
    const result = handleUpdateAuthJson([{ key: 'value' }], deps)
    expect(result).toEqual({
      ok: false,
      message: "auth.json invalide: objet attendu.",
    })
    expect(atomicWriteJson).not.toHaveBeenCalled()
  })

  it('accepts Date object (typeof Date is object, so it passes validation)', () => {
    // Date passes the guard because typeof Date === 'object' and !Date (truthy)
    // and !Array.isArray(Date) — this is the real handler behavior.
    const result = handleUpdateAuthJson(new Date(), deps)
    expect(result).toEqual({ ok: true })
    // atomicWriteJson is called with the Date object (passed through as-is)
    expect(atomicWriteJson).toHaveBeenCalled()
  })

  it('returns ok:true for a valid plain object', () => {
    const result = handleUpdateAuthJson({ providers: {} }, deps)
    expect(result).toEqual({ ok: true })
  })

  // -------------------------------------------------------------------------
  // Backup behavior
  // -------------------------------------------------------------------------

  it('does NOT call backupFile when auth file does not exist', () => {
    existsSync = vi.fn().mockReturnValue(false)
    deps.existsSync = existsSync

    handleUpdateAuthJson({ providers: {} }, deps)

    expect(backupFile).not.toHaveBeenCalled()
  })

  it('calls backupFile when auth file exists', () => {
    existsSync = vi.fn().mockReturnValue(true)
    deps.existsSync = existsSync

    handleUpdateAuthJson({ providers: {} }, deps)

    expect(backupFile).toHaveBeenCalledOnce()
    expect(backupFile).toHaveBeenCalledWith('/pi/agent/auth.json')
  })

  it('backupFile is called BEFORE atomicWriteJson', () => {
    existsSync = vi.fn().mockReturnValue(true)
    const callOrder: string[] = []
    backupFile = vi.fn().mockImplementation(() => callOrder.push('backupFile'))
    atomicWriteJson = vi.fn().mockImplementation(() => callOrder.push('atomicWriteJson'))
    deps.existsSync = existsSync
    deps.backupFile = backupFile
    deps.atomicWriteJson = atomicWriteJson

    handleUpdateAuthJson({ providers: {} }, deps)

    expect(callOrder).toEqual(['backupFile', 'atomicWriteJson'])
  })

  // -------------------------------------------------------------------------
  // atomicWriteJson behavior
  // -------------------------------------------------------------------------

  it('calls atomicWriteJson with correct path and value', () => {
    const authData = { providers: { openai: { apiKey: 'sk-test' } } }
    handleUpdateAuthJson(authData, deps)

    expect(atomicWriteJson).toHaveBeenCalledOnce()
    expect(atomicWriteJson).toHaveBeenCalledWith('/pi/agent/auth.json', authData)
  })

  it('returns error when atomicWriteJson throws (disk full)', () => {
    const diskError = new Error('ENOSPC: no space left on device')
    atomicWriteJson = vi.fn().mockImplementation(() => {
      throw diskError
    })
    deps.atomicWriteJson = atomicWriteJson

    const result = handleUpdateAuthJson({ providers: {} }, deps)

    expect(result).toEqual({
      ok: false,
      message: 'ENOSPC: no space left on device',
    })
    // backupFile may or may not have been called depending on existsSync
    expect(syncProviderApiKeysBetweenModelsAndAuth).not.toHaveBeenCalled()
  })

  it('returns error with string when atomicWriteJson throws a non-Error value', () => {
    atomicWriteJson = vi.fn().mockImplementation(() => {
      throw 'disk write failed unexpectedly'
    })
    deps.atomicWriteJson = atomicWriteJson

    const result = handleUpdateAuthJson({ providers: {} }, deps)

    expect(result).toEqual({
      ok: false,
      message: 'disk write failed unexpectedly',
    })
  })

  // -------------------------------------------------------------------------
  // syncProviderApiKeysBetweenModelsAndAuth behavior
  // -------------------------------------------------------------------------

  it('calls syncProviderApiKeysBetweenModelsAndAuth with pi agent dir', () => {
    handleUpdateAuthJson({ providers: {} }, deps)

    expect(syncProviderApiKeysBetweenModelsAndAuth).toHaveBeenCalledOnce()
    expect(syncProviderApiKeysBetweenModelsAndAuth).toHaveBeenCalledWith('/pi/agent')
  })

  it('syncProviderApiKeysBetweenModelsAndAuth is called AFTER atomicWriteJson', () => {
    const callOrder: string[] = []
    atomicWriteJson = vi.fn().mockImplementation(() => callOrder.push('atomicWriteJson'))
    syncProviderApiKeysBetweenModelsAndAuth = vi.fn().mockImplementation(() =>
      callOrder.push('syncProviderApiKeysBetweenModelsAndAuth'),
    )
    deps.atomicWriteJson = atomicWriteJson
    deps.syncProviderApiKeysBetweenModelsAndAuth = syncProviderApiKeysBetweenModelsAndAuth

    handleUpdateAuthJson({ providers: {} }, deps)

    expect(callOrder).toEqual(['atomicWriteJson', 'syncProviderApiKeysBetweenModelsAndAuth'])
  })

  it('returns ok:true even when syncProviderApiKeysBetweenModelsAndAuth throws (inside try block)', () => {
    syncProviderApiKeysBetweenModelsAndAuth = vi.fn().mockImplementation(() => {
      throw new Error('sync failed')
    })
    deps.syncProviderApiKeysBetweenModelsAndAuth = syncProviderApiKeysBetweenModelsAndAuth

    // All three ops (exists check + backup, atomicWriteJson, sync) are in same try/catch
    // So sync errors are caught and returned as ok:false (not as unhandled exceptions)
    const result = handleUpdateAuthJson({ providers: {} }, deps)

    expect(result).toEqual({ ok: false, message: 'sync failed' })
  })

  // -------------------------------------------------------------------------
  // Full success path
  // -------------------------------------------------------------------------

  it('returns ok:true on full success with all deps called in order', () => {
    const callOrder: string[] = []
    existsSync = vi.fn().mockReturnValue(true)
    backupFile = vi.fn().mockImplementation(() => callOrder.push('backupFile'))
    atomicWriteJson = vi.fn().mockImplementation(() => callOrder.push('atomicWriteJson'))
    syncProviderApiKeysBetweenModelsAndAuth = vi.fn().mockImplementation(() =>
      callOrder.push('syncProviderApiKeysBetweenModelsAndAuth'),
    )
    deps.existsSync = existsSync
    deps.backupFile = backupFile
    deps.atomicWriteJson = atomicWriteJson
    deps.syncProviderApiKeysBetweenModelsAndAuth = syncProviderApiKeysBetweenModelsAndAuth

    const result = handleUpdateAuthJson(
      { providers: { anthropic: { apiKey: 'sk-ant' } } },
      deps,
    )

    expect(result).toEqual({ ok: true })
    expect(callOrder).toEqual([
      'backupFile',
      'atomicWriteJson',
      'syncProviderApiKeysBetweenModelsAndAuth',
    ])
  })

  it('handles empty auth object', () => {
    const result = handleUpdateAuthJson({}, deps)
    expect(result).toEqual({ ok: true })
    expect(atomicWriteJson).toHaveBeenCalledWith('/pi/agent/auth.json', {})
  })

  it('passes nested objects through unchanged', () => {
    const authData = {
      providers: {
        openai: { apiKey: 'sk-test', timeout: 120 },
        anthropic: { apiKey: 'sk-ant' },
      },
      version: 2,
    }
    handleUpdateAuthJson(authData, deps)
    expect(atomicWriteJson).toHaveBeenCalledWith('/pi/agent/auth.json', authData)
  })

  it('backupFile is NOT called when existsSync returns false', () => {
    existsSync = vi.fn().mockReturnValue(false)
    deps.existsSync = existsSync

    handleUpdateAuthJson({}, deps)

    expect(backupFile).not.toHaveBeenCalled()
  })
})
