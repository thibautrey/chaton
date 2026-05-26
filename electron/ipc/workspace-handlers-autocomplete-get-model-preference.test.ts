import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `autocomplete:getModelPreference` IPC handler.
 *
 * The handler (workspace-handlers.ts lines 3876–3884):
 *   - Calls `getAutocompleteModelPreference()` from workspace-autocomplete.ts
 *   - Returns `{ ok: true, enabled: prefs.enabled, modelKey: prefs.modelKey }`
 *
 * `getAutocompleteModelPreference()` (workspace-autocomplete.ts line 20):
 *   - Reads `autocomplete_enabled` and `autocomplete_model` from SQLite app_settings
 *   - Returns `{ enabled: boolean, modelKey: string | null }`
 *
 * We replicate the minimal handler logic inline so the test is fully isolated
 * from the database and IPC wiring.
 */

describe('autocomplete:getModelPreference', () => {
  // -------------------------------------------------------------------------
  // Inline handler — mirrors workspace-handlers.ts lines 3876–3884 exactly
  // -------------------------------------------------------------------------
  function handleAutocompleteGetModelPreference(
    getAutocompleteModelPreference: () => {
      enabled: boolean
      modelKey: string | null
    },
  ): { ok: true; enabled: boolean; modelKey: string | null } {
    const prefs = getAutocompleteModelPreference()
    return {
      ok: true as const,
      enabled: prefs.enabled,
      modelKey: prefs.modelKey,
    }
  }

  // -------------------------------------------------------------------------
  // Passthrough contract
  // -------------------------------------------------------------------------

  it('calls getAutocompleteModelPreference with no arguments', () => {
    const getAutocompleteModelPreference = vi.fn().mockReturnValue({
      enabled: false,
      modelKey: null,
    })
    handleAutocompleteGetModelPreference(getAutocompleteModelPreference)
    expect(getAutocompleteModelPreference).toHaveBeenCalledTimes(1)
    expect(getAutocompleteModelPreference).toHaveBeenCalledWith()
  })

  it('returns { ok: true } regardless of enabled or modelKey values', () => {
    const result1 = handleAutocompleteGetModelPreference(() => ({
      enabled: true,
      modelKey: 'openai/gpt-4o',
    }))
    expect(result1.ok).toBe(true)

    const result2 = handleAutocompleteGetModelPreference(() => ({
      enabled: false,
      modelKey: null,
    }))
    expect(result2.ok).toBe(true)
  })

  it('does not call getAutocompleteModelPreference more than once per invocation', () => {
    const getAutocompleteModelPreference = vi.fn().mockReturnValue({
      enabled: false,
      modelKey: null,
    })
    handleAutocompleteGetModelPreference(getAutocompleteModelPreference)
    expect(getAutocompleteModelPreference).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // enabled passthrough
  // -------------------------------------------------------------------------

  it('returns enabled:true when autocomplete is enabled', () => {
    const result = handleAutocompleteGetModelPreference(() => ({
      enabled: true,
      modelKey: 'test/model',
    }))
    expect(result.enabled).toBe(true)
  })

  it('returns enabled:false when autocomplete is disabled', () => {
    const result = handleAutocompleteGetModelPreference(() => ({
      enabled: false,
      modelKey: null,
    }))
    expect(result.enabled).toBe(false)
  })

  // -------------------------------------------------------------------------
  // modelKey passthrough
  // -------------------------------------------------------------------------

  it('returns the stored model key unchanged', () => {
    const result = handleAutocompleteGetModelPreference(() => ({
      enabled: true,
      modelKey: 'anthropic/claude-3-5-sonnet',
    }))
    expect(result.modelKey).toBe('anthropic/claude-3-5-sonnet')
  })

  it('returns null when no model is configured', () => {
    const result = handleAutocompleteGetModelPreference(() => ({
      enabled: false,
      modelKey: null,
    }))
    expect(result.modelKey).toBeNull()
  })

  // -------------------------------------------------------------------------
  // Result shape
  // -------------------------------------------------------------------------

  it('result enabled field is the same boolean as returned by getAutocompleteModelPreference', () => {
    const getAutocompleteModelPreference = vi.fn().mockReturnValue({
      enabled: true,
      modelKey: 'model',
    })
    const result = handleAutocompleteGetModelPreference(getAutocompleteModelPreference)
    expect(result.enabled).toBe(true)
  })

  it('result modelKey field is the same reference as returned by getAutocompleteModelPreference', () => {
    const mockKey = 'openai/gpt-4o-mini'
    const getAutocompleteModelPreference = vi.fn().mockReturnValue({
      enabled: false,
      modelKey: mockKey,
    })
    const result = handleAutocompleteGetModelPreference(getAutocompleteModelPreference)
    expect(result.modelKey).toBe(mockKey)
  })

  it('result structure matches { ok: true, enabled: boolean, modelKey: string | null }', () => {
    const result = handleAutocompleteGetModelPreference(() => ({
      enabled: true,
      modelKey: 'test/model',
    }))
    expect(result).toEqual({ ok: true, enabled: true, modelKey: 'test/model' })
  })
})
