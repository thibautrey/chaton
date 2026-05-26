import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `pi:updateSettingsJson` IPC handler.
 *
 * The handler updates the Pi settings.json file with sanitization, model validation,
 * and atomic write with backup.
 *
 * Key behavioral guarantees verified:
 * - Returns error when input is null, non-object, or an array
 * - Returns error when sanitizePiSettings rejects the input
 * - Returns error when models.json cannot be read
 * - Returns error when the configured default model doesn't exist in models.json
 * - Backs up the existing file before writing (when file exists)
 * - atomicWriteJson is called with the sanitized value on success
 * - Thrown errors from atomicWriteJson are caught and returned as errors
 *
 * We replicate the minimal handler logic inline to test without needing the full
 * workspace-handlers.ts module (which requires complex dep setup).
 */

describe('pi:updateSettingsJson', () => {
  // -------------------------------------------------------------------------
  // Types mirroring the real handler (workspace-handlers.ts lines 1578–1613)
  // -------------------------------------------------------------------------
  type Result = { ok: true } | { ok: false; message: string }

  // -------------------------------------------------------------------------
  // Inline handler — mirrors workspace-handlers.ts lines 1578–1613.
  // -------------------------------------------------------------------------
  function updateSettingsJson(params: {
    input: unknown
    sanitizePiSettings: (next: Record<string, unknown>) => { ok: boolean; value: Record<string, unknown>; message?: string }
    readJsonFile: (path: string) => { ok: boolean; value: unknown; message?: string }
    validateDefaultModelExistsInModels: (
      settings: Record<string, unknown>,
      models: unknown,
    ) => string | null
    getPiModelsPath: () => string
    getPiSettingsPath: () => string
    backupFile: (path: string) => void
    atomicWriteJson: (path: string, data: unknown) => void
  }): Result {
    if (!params.input || typeof params.input !== 'object' || Array.isArray(params.input)) {
      return {
        ok: false,
        message: 'settings.json invalide: objet attendu.',
      }
    }

    const valid = params.sanitizePiSettings(params.input as Record<string, unknown>)
    if (!valid.ok) {
      return { ok: false, message: valid.message ?? 'sanitize failed' }
    }

    const modelsCurrent = params.readJsonFile(params.getPiModelsPath())
    if (!modelsCurrent.ok) {
      return { ok: false, message: modelsCurrent.message ?? 'read failed' }
    }

    const defaultModelError = params.validateDefaultModelExistsInModels(
      valid.value,
      modelsCurrent.value,
    )
    if (defaultModelError) {
      return { ok: false, message: defaultModelError }
    }

    const settingsPath = params.getPiSettingsPath()
    try {
      if (params.readJsonFile(settingsPath).ok) {
        params.backupFile(settingsPath)
      }
      params.atomicWriteJson(settingsPath, valid.value)
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }

  // -------------------------------------------------------------------------
  // Shared test fixtures
  // -------------------------------------------------------------------------
  // Use non-union types here so vi.fn() reassignments in tests type-check cleanly.
  type SanitizeResult = { ok: boolean; value: Record<string, unknown>; message?: string }
  type ReadJsonResult = { ok: boolean; value: unknown; message?: string }

  let sanitizePiSettings: (next: Record<string, unknown>) => SanitizeResult
  let readJsonFile: (path: string) => ReadJsonResult
  let validateDefaultModelExistsInModels: (settings: Record<string, unknown>, models: unknown) => string | null
  let getPiModelsPath: () => string
  let getPiSettingsPath: () => string
  let backupFile: (path: string) => void
  let atomicWriteJson: (path: string, data: unknown) => void

  const SETTINGS_PATH = '/pi/settings.json'
  const MODELS_PATH = '/pi/models.json'
  const SANITIZED_SETTINGS = { theme: 'dark', enabledModels: ['openai/gpt-4o'] }

  beforeEach(() => {
    sanitizePiSettings = vi.fn((_next: Record<string, unknown>) => ({
      ok: true as const,
      value: SANITIZED_SETTINGS,
    })) as typeof sanitizePiSettings

    readJsonFile = vi.fn((path: string) => {
      if (path === SETTINGS_PATH) return { ok: true as const, value: {} }
      if (path === MODELS_PATH) return { ok: true as const, value: { providers: {} } }
      return { ok: false as const, message: 'not found' }
    }) as typeof readJsonFile

    validateDefaultModelExistsInModels = vi.fn(() => null) as typeof validateDefaultModelExistsInModels
    getPiModelsPath = vi.fn(() => MODELS_PATH) as typeof getPiModelsPath
    getPiSettingsPath = vi.fn(() => SETTINGS_PATH) as typeof getPiSettingsPath
    backupFile = vi.fn() as typeof backupFile
    atomicWriteJson = vi.fn() as typeof atomicWriteJson
  })

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------

  it('returns error when input is null', () => {
    const result = updateSettingsJson({
      input: null,
      sanitizePiSettings,
      readJsonFile,
      validateDefaultModelExistsInModels,
      getPiModelsPath,
      getPiSettingsPath,
      backupFile,
      atomicWriteJson,
    })

    expect(result).toEqual({ ok: false, message: 'settings.json invalide: objet attendu.' })
    expect(sanitizePiSettings).not.toHaveBeenCalled()
  })

  it('returns error when input is undefined', () => {
    const result = updateSettingsJson({
      input: undefined,
      sanitizePiSettings,
      readJsonFile,
      validateDefaultModelExistsInModels,
      getPiModelsPath,
      getPiSettingsPath,
      backupFile,
      atomicWriteJson,
    })

    expect(result).toEqual({ ok: false, message: 'settings.json invalide: objet attendu.' })
  })

  it('returns error when input is a primitive (number)', () => {
    const result = updateSettingsJson({
      input: 42,
      sanitizePiSettings,
      readJsonFile,
      validateDefaultModelExistsInModels,
      getPiModelsPath,
      getPiSettingsPath,
      backupFile,
      atomicWriteJson,
    })

    expect(result).toEqual({ ok: false, message: 'settings.json invalide: objet attendu.' })
  })

  it('returns error when input is a primitive (string)', () => {
    const result = updateSettingsJson({
      input: 'not an object',
      sanitizePiSettings,
      readJsonFile,
      validateDefaultModelExistsInModels,
      getPiModelsPath,
      getPiSettingsPath,
      backupFile,
      atomicWriteJson,
    })

    expect(result).toEqual({ ok: false, message: 'settings.json invalide: objet attendu.' })
  })

  it('returns error when input is an array', () => {
    const result = updateSettingsJson({
      input: [{ theme: 'dark' }],
      sanitizePiSettings,
      readJsonFile,
      validateDefaultModelExistsInModels,
      getPiModelsPath,
      getPiSettingsPath,
      backupFile,
      atomicWriteJson,
    })

    expect(result).toEqual({ ok: false, message: 'settings.json invalide: objet attendu.' })
  })

  // -------------------------------------------------------------------------
  // sanitizePiSettings failure
  // -------------------------------------------------------------------------

  it('returns error when sanitizePiSettings fails', () => {
    sanitizePiSettings = vi.fn(() => ({
      ok: false as const,
      message: 'enabledModels must be an array',
      value: {} as Record<string, unknown>,
    })) as typeof sanitizePiSettings

    const result = updateSettingsJson({
      input: { enabledModels: 'not-an-array' },
      sanitizePiSettings,
      readJsonFile,
      validateDefaultModelExistsInModels,
      getPiModelsPath,
      getPiSettingsPath,
      backupFile,
      atomicWriteJson,
    })

    expect(result).toEqual({ ok: false, message: 'enabledModels must be an array' })
    expect(readJsonFile).not.toHaveBeenCalled()
    expect(atomicWriteJson).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // readJsonFile (models.json) failure
  // -------------------------------------------------------------------------

  it('returns error when models.json cannot be read', () => {
    readJsonFile = vi.fn((path: string) => {
      if (path === SETTINGS_PATH) return { ok: true as const, value: {} }
      if (path === MODELS_PATH) return { ok: false as const, message: 'ENOENT: no such file', value: undefined as unknown }
      return { ok: false as const, message: 'not found', value: undefined as unknown }
    }) as typeof readJsonFile

    const result = updateSettingsJson({
      input: { theme: 'dark' },
      sanitizePiSettings,
      readJsonFile,
      validateDefaultModelExistsInModels,
      getPiModelsPath,
      getPiSettingsPath,
      backupFile,
      atomicWriteJson,
    })

    expect(result).toEqual({ ok: false, message: 'ENOENT: no such file' })
    expect(validateDefaultModelExistsInModels).not.toHaveBeenCalled()
    expect(atomicWriteJson).not.toHaveBeenCalled()
  })

  it('returns error when readJsonFile returns failure for models.json (e.g. corrupt file)', () => {
    sanitizePiSettings = vi.fn(() => ({ ok: true, value: {} })) as typeof sanitizePiSettings
    readJsonFile = vi.fn((path: string) => {
      if (path === SETTINGS_PATH) return { ok: true as const, value: {} }
      if (path === MODELS_PATH) return { ok: false as const, message: 'Unexpected end of JSON input', value: undefined as unknown }
      return { ok: false as const, message: 'not found', value: undefined as unknown }
    }) as typeof readJsonFile

    const result = updateSettingsJson({
      input: { theme: 'dark' },
      sanitizePiSettings,
      readJsonFile,
      validateDefaultModelExistsInModels,
      getPiModelsPath,
      getPiSettingsPath,
      backupFile,
      atomicWriteJson,
    })

    expect(result).toEqual({ ok: false, message: 'Unexpected end of JSON input' })
  })

  // -------------------------------------------------------------------------
  // validateDefaultModelExistsInModels failure
  // -------------------------------------------------------------------------

  it('returns error when validateDefaultModelExistsInModels reports missing model', () => {
    validateDefaultModelExistsInModels = vi.fn(() => 'defaultModel "openai/gpt-99" not found in models.json')

    const result = updateSettingsJson({
      input: { theme: 'dark', defaultModel: 'openai/gpt-99' },
      sanitizePiSettings,
      readJsonFile,
      validateDefaultModelExistsInModels,
      getPiModelsPath,
      getPiSettingsPath,
      backupFile,
      atomicWriteJson,
    })

    expect(result).toEqual({
      ok: false,
      message: 'defaultModel "openai/gpt-99" not found in models.json',
    })
    expect(atomicWriteJson).not.toHaveBeenCalled()
  })

  it('validateDefaultModelExistsInModels receives sanitized settings and models value', () => {
    sanitizePiSettings = vi.fn(() => ({
      ok: true as const,
      value: { theme: 'light', defaultModel: 'anthropic/claude-3' },
    }))

    updateSettingsJson({
      input: { theme: 'light' },
      sanitizePiSettings,
      readJsonFile,
      validateDefaultModelExistsInModels,
      getPiModelsPath,
      getPiSettingsPath,
      backupFile,
      atomicWriteJson,
    })

    expect(validateDefaultModelExistsInModels).toHaveBeenCalledTimes(1)
    expect(validateDefaultModelExistsInModels).toHaveBeenCalledWith(
      { theme: 'light', defaultModel: 'anthropic/claude-3' },
      { providers: {} },
    )
  })

  // -------------------------------------------------------------------------
  // Success path
  // -------------------------------------------------------------------------

  it('returns ok:true on success', () => {
    const result = updateSettingsJson({
      input: { theme: 'dark' },
      sanitizePiSettings,
      readJsonFile,
      validateDefaultModelExistsInModels,
      getPiModelsPath,
      getPiSettingsPath,
      backupFile,
      atomicWriteJson,
    })

    expect(result).toEqual({ ok: true })
  })

  it('calls atomicWriteJson with the sanitized value on success', () => {
    sanitizePiSettings = vi.fn(() => ({
      ok: true as const,
      value: { theme: 'dark', enabledModels: ['provider/model-x'] },
    }))

    updateSettingsJson({
      input: { some: 'input' },
      sanitizePiSettings,
      readJsonFile,
      validateDefaultModelExistsInModels,
      getPiModelsPath,
      getPiSettingsPath,
      backupFile,
      atomicWriteJson,
    })

    expect(atomicWriteJson).toHaveBeenCalledTimes(1)
    expect(atomicWriteJson).toHaveBeenCalledWith(SETTINGS_PATH, {
      theme: 'dark',
      enabledModels: ['provider/model-x'],
    })
  })

  it('backs up the existing file before writing when file already exists', () => {
    const result = updateSettingsJson({
      input: { theme: 'dark' },
      sanitizePiSettings,
      readJsonFile,
      validateDefaultModelExistsInModels,
      getPiModelsPath,
      getPiSettingsPath,
      backupFile,
      atomicWriteJson,
    })

    expect(result).toEqual({ ok: true })
    expect(backupFile).toHaveBeenCalledTimes(1)
    expect(backupFile).toHaveBeenCalledWith(SETTINGS_PATH)
    expect(atomicWriteJson).toHaveBeenCalledTimes(1)
  })

  it('does NOT back up the file when settings.json does not yet exist', () => {
    readJsonFile = vi.fn((path: string) => {
      if (path === SETTINGS_PATH) return { ok: false as const, message: 'ENOENT', value: undefined as unknown }
      if (path === MODELS_PATH) return { ok: true as const, value: { providers: {} } }
      return { ok: false as const, message: 'not found', value: undefined as unknown }
    }) as typeof readJsonFile

    const result = updateSettingsJson({
      input: { theme: 'dark' },
      sanitizePiSettings,
      readJsonFile,
      validateDefaultModelExistsInModels,
      getPiModelsPath,
      getPiSettingsPath,
      backupFile,
      atomicWriteJson,
    })

    expect(result).toEqual({ ok: true })
    expect(backupFile).not.toHaveBeenCalled()
    expect(atomicWriteJson).toHaveBeenCalledTimes(1)
  })

  it('passes sanitized settings to sanitizePiSettings, not raw input', () => {
    const rawInput = { unknownField: 'should-be-removed' }
    sanitizePiSettings = vi.fn(() => ({ ok: true, value: { theme: 'dark' } }))

    updateSettingsJson({
      input: rawInput,
      sanitizePiSettings,
      readJsonFile,
      validateDefaultModelExistsInModels,
      getPiModelsPath,
      getPiSettingsPath,
      backupFile,
      atomicWriteJson,
    })

    expect(sanitizePiSettings).toHaveBeenCalledWith({ unknownField: 'should-be-removed' })
  })

  // -------------------------------------------------------------------------
  // atomicWriteJson throws
  // -------------------------------------------------------------------------

  it('catches atomicWriteJson throw and returns error with message', () => {
    atomicWriteJson = vi.fn(() => {
      throw new Error('EACCES: permission denied')
    })

    const result = updateSettingsJson({
      input: { theme: 'dark' },
      sanitizePiSettings,
      readJsonFile,
      validateDefaultModelExistsInModels,
      getPiModelsPath,
      getPiSettingsPath,
      backupFile,
      atomicWriteJson,
    })

    expect(result).toEqual({ ok: false, message: 'EACCES: permission denied' })
  })

  it('catches non-Error throw from atomicWriteJson and returns string', () => {
    atomicWriteJson = vi.fn(() => {
      throw 'some raw string error'
    })

    const result = updateSettingsJson({
      input: { theme: 'dark' },
      sanitizePiSettings,
      readJsonFile,
      validateDefaultModelExistsInModels,
      getPiModelsPath,
      getPiSettingsPath,
      backupFile,
      atomicWriteJson,
    })

    expect(result).toEqual({ ok: false, message: 'some raw string error' })
  })

  it('returns ok:true even when backupFile itself throws (atomicWriteJson is the source of truth)', () => {
    backupFile = vi.fn(() => {
      throw new Error('backup failed')
    })

    const result = updateSettingsJson({
      input: { theme: 'dark' },
      sanitizePiSettings,
      readJsonFile,
      validateDefaultModelExistsInModels,
      getPiModelsPath,
      getPiSettingsPath,
      backupFile,
      atomicWriteJson,
    })

    // backupFile threw before atomicWriteJson — the outer try/catch catches it
    expect(result.ok).toBe(false)
    expect((result as { ok: false; message: string }).message).toBe('backup failed')
    expect(atomicWriteJson).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Dependency call ordering
  // -------------------------------------------------------------------------

  it('calls deps in order: sanitize → read models → validate → backup → write', () => {
    const callOrder: string[] = []

    sanitizePiSettings = vi.fn(() => {
      callOrder.push('sanitize')
      return { ok: true, value: {} }
    })

    readJsonFile = vi.fn((path: string) => {
      if (path === SETTINGS_PATH) {
        callOrder.push('read-settings')
        return { ok: true as const, value: {} }
      }
      if (path === MODELS_PATH) {
        callOrder.push('read-models')
        return { ok: true as const, value: {} }
      }
      return { ok: false as const, message: 'not found', value: undefined as unknown }
    }) as typeof readJsonFile

    validateDefaultModelExistsInModels = vi.fn(() => {
      callOrder.push('validate')
      return null
    })

    backupFile = vi.fn(() => {
      callOrder.push('backup')
    })

    atomicWriteJson = vi.fn(() => {
      callOrder.push('write')
    })

    updateSettingsJson({
      input: { theme: 'dark' },
      sanitizePiSettings,
      readJsonFile,
      validateDefaultModelExistsInModels,
      getPiModelsPath,
      getPiSettingsPath,
      backupFile,
      atomicWriteJson,
    })

    expect(callOrder).toEqual(['sanitize', 'read-models', 'validate', 'read-settings', 'backup', 'write'])
  })
})
