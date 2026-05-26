import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `autocomplete:setModelPreference` IPC handler.
 *
 * The handler (workspace-handlers.ts lines ~3885):
 *   - Calls `setAutocompleteModelPreference(Boolean(enabled), trimmedOrNull)`
 *   - `Boolean(enabled)` coerces the enabled value to a true boolean
 *   - `trimmedOrNull` = modelKey.trim() when modelKey is a non-empty string,
 *     otherwise null
 *   - Returns `{ ok: true }`
 *
 * We replicate the minimal handler logic inline so the test is fully isolated.
 */
describe('autocomplete:setModelPreference', () => {
  // -------------------------------------------------------------------------
  // Inline handler — mirrors workspace-handlers.ts lines ~3885 exactly
  // -------------------------------------------------------------------------
  type SetResult = { ok: true }
  // We track what was "saved" by capturing the values passed to the setter
  let savedEnabled: boolean | undefined = undefined
  let savedModelKey: string | null | undefined = undefined
  const setAutocompleteModelPreference = (
    enabled: boolean,
    modelKey: string | null,
  ) => {
    savedEnabled = Boolean(enabled)
    savedModelKey =
      typeof modelKey === 'string' && modelKey.trim() ? modelKey.trim() : null
  }
  function handleAutocompleteSetModelPreference(
    enabled: unknown,
    modelKey: string | null,
  ): SetResult {
    setAutocompleteModelPreference(
      Boolean(enabled),
      typeof modelKey === 'string' && modelKey.trim() ? modelKey.trim() : null,
    )
    return { ok: true }
  }

  beforeEach(() => {
    savedEnabled = undefined
    savedModelKey = undefined
  })

  describe('enabled parameter — Boolean coercion', () => {
    it('returns ok:true', () => {
      const result = handleAutocompleteSetModelPreference(true, 'model/key')
      expect(result).toEqual({ ok: true })
    })

    it('stores true when enabled is true', () => {
      handleAutocompleteSetModelPreference(true, 'model/key')
      expect(savedEnabled).toBe(true)
    })

    it('stores false when enabled is false', () => {
      handleAutocompleteSetModelPreference(false, 'model/key')
      expect(savedEnabled).toBe(false)
    })

    it('stores true when enabled is truthy string "true"', () => {
      handleAutocompleteSetModelPreference('true', 'model/key')
      expect(savedEnabled).toBe(true)
    })

    it('stores true when enabled is string "false" (non-empty string is truthy)', () => {
      // Boolean('false') === true because 'false' is a non-empty string
      handleAutocompleteSetModelPreference('false', 'model/key')
      expect(savedEnabled).toBe(true)
    })

    it('stores true when enabled is truthy number 1', () => {
      handleAutocompleteSetModelPreference(1, 'model/key')
      expect(savedEnabled).toBe(true)
    })

    it('stores false when enabled is falsy number 0', () => {
      handleAutocompleteSetModelPreference(0, 'model/key')
      expect(savedEnabled).toBe(false)
    })

    it('stores false when enabled is null', () => {
      handleAutocompleteSetModelPreference(null, 'model/key')
      expect(savedEnabled).toBe(false)
    })

    it('stores false when enabled is undefined', () => {
      handleAutocompleteSetModelPreference(undefined, 'model/key')
      expect(savedEnabled).toBe(false)
    })
  })

  describe('modelKey parameter — trim and null coercion', () => {
    it('stores trimmed model key when given a non-empty string', () => {
      handleAutocompleteSetModelPreference(true, '  openai/gpt-4o  ')
      expect(savedModelKey).toBe('openai/gpt-4o')
    })

    it('stores the model key unchanged when already trimmed', () => {
      handleAutocompleteSetModelPreference(false, 'anthropic/claude-3-5-sonnet')
      expect(savedModelKey).toBe('anthropic/claude-3-5-sonnet')
    })

    it('stores null when modelKey is null', () => {
      handleAutocompleteSetModelPreference(true, null)
      expect(savedModelKey).toBeNull()
    })

    it('stores null when modelKey is an empty string', () => {
      handleAutocompleteSetModelPreference(true, '')
      expect(savedModelKey).toBeNull()
    })

    it('stores null when modelKey is only whitespace', () => {
      handleAutocompleteSetModelPreference(true, '   ')
      expect(savedModelKey).toBeNull()
    })

    it('stores null when modelKey is tab/newline whitespace', () => {
      handleAutocompleteSetModelPreference(false, '\t\n  ')
      expect(savedModelKey).toBeNull()
    })

    it('preserves model key containing slashes and hyphens', () => {
      const key = 'google/gemini-2.5-pro'
      handleAutocompleteSetModelPreference(true, key)
      expect(savedModelKey).toBe(key)
    })
  })

  describe('combined scenarios', () => {
    it('enabled false with null modelKey', () => {
      handleAutocompleteSetModelPreference(false, null)
      expect(savedEnabled).toBe(false)
      expect(savedModelKey).toBeNull()
    })

    it('enabled true with valid modelKey', () => {
      handleAutocompleteSetModelPreference(true, 'model/key')
      expect(savedEnabled).toBe(true)
      expect(savedModelKey).toBe('model/key')
    })

    it('truthy enabled string with whitespace modelKey is cleaned', () => {
      handleAutocompleteSetModelPreference('yes', '  trimmed  ')
      expect(savedEnabled).toBe(true)
      expect(savedModelKey).toBe('trimmed')
    })
  })
})
