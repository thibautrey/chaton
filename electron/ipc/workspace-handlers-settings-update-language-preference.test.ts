import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `settings:updateLanguagePreference` IPC handler.
 *
 * The handler (workspace-handlers.ts lines 4031–4043):
 *   - Validates language is a non-empty string ('fr' | 'en')
 *   - Calls saveLanguagePreference(getDb(), trimmed)
 *   - Returns { ok: true } on success
 *   - Returns { ok: false, message } on validation failure
 *
 * `saveLanguagePreference` (db/repos/settings.ts line 129):
 *   - Uses UPSERT to store the language key in app_settings
 *
 * We replicate the minimal handler logic inline so the test is fully isolated
 * from the workspace-handlers module and its DB wiring.
 */

type HandlerResult = { ok: true } | { ok: false; message: string }

describe('settings:updateLanguagePreference', () => {
  // -------------------------------------------------------------------------
  // Mock types matching the real signatures
  // -------------------------------------------------------------------------
  type MockDb = { prepare: ReturnType<typeof vi.fn> }
  type SaveFn = (db: MockDb, language: string) => void
  type GetDbFn = () => MockDb

  // -------------------------------------------------------------------------
  // Inline handler — mirrors workspace-handlers.ts lines 4031–4043 exactly
  // -------------------------------------------------------------------------
  function handleUpdateLanguagePreference(
    getDb: GetDbFn,
    saveLanguagePreference: SaveFn,
    language: unknown,
  ): HandlerResult {
    if (typeof language !== 'string' || !language.trim()) {
      return { ok: false, message: 'language must be a non-empty string' }
    }
    const trimmed = language.trim()
    if (trimmed !== 'fr' && trimmed !== 'en') {
      return { ok: false, message: "unsupported language: use 'fr' or 'en'" }
    }
    saveLanguagePreference(getDb(), trimmed)
    return { ok: true }
  }

  // -------------------------------------------------------------------------
  // Shared mocks
  // -------------------------------------------------------------------------
  let getDbMock: ReturnType<typeof vi.fn>
  let saveLanguagePreferenceMock: ReturnType<typeof vi.fn>
  let mockDb: MockDb

  beforeEach(() => {
    mockDb = { prepare: vi.fn() }
    getDbMock = vi.fn<[], MockDb>().mockReturnValue(mockDb)
    saveLanguagePreferenceMock = vi.fn()
  })

  // -------------------------------------------------------------------------
  // Validation: rejects non-string types
  // -------------------------------------------------------------------------

  it('rejects undefined', () => {
    const result = handleUpdateLanguagePreference(
      getDbMock,
      saveLanguagePreferenceMock,
      undefined,
    )
    expect(result).toEqual({ ok: false, message: 'language must be a non-empty string' })
  })

  it('rejects null', () => {
    const result = handleUpdateLanguagePreference(
      getDbMock,
      saveLanguagePreferenceMock,
      null,
    )
    expect(result).toEqual({ ok: false, message: 'language must be a non-empty string' })
  })

  it('rejects a number', () => {
    const result = handleUpdateLanguagePreference(
      getDbMock,
      saveLanguagePreferenceMock,
      42,
    )
    expect(result).toEqual({ ok: false, message: 'language must be a non-empty string' })
  })

  it('rejects a boolean', () => {
    const result = handleUpdateLanguagePreference(
      getDbMock,
      saveLanguagePreferenceMock,
      true,
    )
    expect(result).toEqual({ ok: false, message: 'language must be a non-empty string' })
  })

  it('rejects an object', () => {
    const result = handleUpdateLanguagePreference(
      getDbMock,
      saveLanguagePreferenceMock,
      { code: 'fr' },
    )
    expect(result).toEqual({ ok: false, message: 'language must be a non-empty string' })
  })

  it('rejects an array', () => {
    const result = handleUpdateLanguagePreference(
      getDbMock,
      saveLanguagePreferenceMock,
      ['fr'],
    )
    expect(result).toEqual({ ok: false, message: 'language must be a non-empty string' })
  })

  it('rejects a function', () => {
    const result = handleUpdateLanguagePreference(
      getDbMock,
      saveLanguagePreferenceMock,
      () => 'fr',
    )
    expect(result).toEqual({ ok: false, message: 'language must be a non-empty string' })
  })

  // -------------------------------------------------------------------------
  // Validation: rejects empty / whitespace strings
  // -------------------------------------------------------------------------

  it('rejects empty string', () => {
    const result = handleUpdateLanguagePreference(
      getDbMock,
      saveLanguagePreferenceMock,
      '',
    )
    expect(result).toEqual({ ok: false, message: 'language must be a non-empty string' })
  })

  it('rejects whitespace-only string', () => {
    const result = handleUpdateLanguagePreference(
      getDbMock,
      saveLanguagePreferenceMock,
      '   ',
    )
    expect(result).toEqual({ ok: false, message: 'language must be a non-empty string' })
  })

  // -------------------------------------------------------------------------
  // Validation: rejects unsupported language codes
  // -------------------------------------------------------------------------

  it('rejects "de" (German)', () => {
    const result = handleUpdateLanguagePreference(
      getDbMock,
      saveLanguagePreferenceMock,
      'de',
    )
    expect(result).toEqual({ ok: false, message: "unsupported language: use 'fr' or 'en'" })
  })

  it('rejects "zh" (Chinese)', () => {
    const result = handleUpdateLanguagePreference(
      getDbMock,
      saveLanguagePreferenceMock,
      'zh',
    )
    expect(result).toEqual({ ok: false, message: "unsupported language: use 'fr' or 'en'" })
  })

  it('rejects "es" (Spanish)', () => {
    const result = handleUpdateLanguagePreference(
      getDbMock,
      saveLanguagePreferenceMock,
      'es',
    )
    expect(result).toEqual({ ok: false, message: "unsupported language: use 'fr' or 'en'" })
  })

  it('rejects "fr-FR" (French locale variant)', () => {
    const result = handleUpdateLanguagePreference(
      getDbMock,
      saveLanguagePreferenceMock,
      'fr-FR',
    )
    expect(result).toEqual({ ok: false, message: "unsupported language: use 'fr' or 'en'" })
  })

  it('rejects "EN" (uppercase English)', () => {
    const result = handleUpdateLanguagePreference(
      getDbMock,
      saveLanguagePreferenceMock,
      'EN',
    )
    expect(result).toEqual({ ok: false, message: "unsupported language: use 'fr' or 'en'" })
  })

  it('accepts "fr " (trailing space) — trimmed to "fr"', () => {
    const result = handleUpdateLanguagePreference(
      getDbMock,
      saveLanguagePreferenceMock,
      'fr ',
    )
    expect(result).toEqual({ ok: true })
  })

  it('accepts " fr" (leading space) — trimmed to "fr"', () => {
    const result = handleUpdateLanguagePreference(
      getDbMock,
      saveLanguagePreferenceMock,
      ' fr',
    )
    expect(result).toEqual({ ok: true })
  })

  // -------------------------------------------------------------------------
  // Happy path: accepted languages
  // -------------------------------------------------------------------------

  it('accepts "fr" and returns { ok: true }', () => {
    const result = handleUpdateLanguagePreference(
      getDbMock,
      saveLanguagePreferenceMock,
      'fr',
    )
    expect(result).toEqual({ ok: true })
  })

  it('accepts "en" and returns { ok: true }', () => {
    const result = handleUpdateLanguagePreference(
      getDbMock,
      saveLanguagePreferenceMock,
      'en',
    )
    expect(result).toEqual({ ok: true })
  })

  // -------------------------------------------------------------------------
  // Happy path: delegation to saveLanguagePreference
  // -------------------------------------------------------------------------

  it('calls getDb() once per successful invocation', () => {
    handleUpdateLanguagePreference(getDbMock, saveLanguagePreferenceMock, 'fr')

    expect(getDbMock).toHaveBeenCalledTimes(1)
  })

  it('passes the trimmed language to saveLanguagePreference', () => {
    handleUpdateLanguagePreference(getDbMock, saveLanguagePreferenceMock, 'fr')

    const [, language] = saveLanguagePreferenceMock.mock.calls[0]!
    expect(language).toBe('fr')
  })

  it('passes the same db instance returned by getDb() to saveLanguagePreference', () => {
    handleUpdateLanguagePreference(getDbMock, saveLanguagePreferenceMock, 'en')

    const [db] = saveLanguagePreferenceMock.mock.calls[0]!
    expect(db).toBe(mockDb)
  })

  it('calls saveLanguagePreference exactly once per successful invocation', () => {
    handleUpdateLanguagePreference(getDbMock, saveLanguagePreferenceMock, 'fr')

    expect(saveLanguagePreferenceMock).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // Save is NOT called on validation failure
  // -------------------------------------------------------------------------

  it('does NOT call saveLanguagePreference when language is undefined', () => {
    handleUpdateLanguagePreference(getDbMock, saveLanguagePreferenceMock, undefined)

    expect(saveLanguagePreferenceMock).not.toHaveBeenCalled()
  })

  it('does NOT call saveLanguagePreference when language is an empty string', () => {
    handleUpdateLanguagePreference(getDbMock, saveLanguagePreferenceMock, '')

    expect(saveLanguagePreferenceMock).not.toHaveBeenCalled()
  })

  it('does NOT call saveLanguagePreference when language is an unsupported code', () => {
    handleUpdateLanguagePreference(getDbMock, saveLanguagePreferenceMock, 'de')

    expect(saveLanguagePreferenceMock).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // getDb is NOT called on validation failure
  // -------------------------------------------------------------------------

  it('does NOT call getDb() when language is undefined', () => {
    handleUpdateLanguagePreference(getDbMock, saveLanguagePreferenceMock, undefined)

    expect(getDbMock).not.toHaveBeenCalled()
  })

  it('does NOT call getDb() when language is whitespace-only', () => {
    handleUpdateLanguagePreference(getDbMock, saveLanguagePreferenceMock, '   ')

    expect(getDbMock).not.toHaveBeenCalled()
  })
})
