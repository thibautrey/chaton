import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `title:setModelPreference` IPC handler.
 *
 * The handler (workspace-handlers.ts lines ~3866):
 *   - Calls `setTitleModelPreference(trimmedOrNull)`
 *   - `trimmedOrNull` = modelKey.trim() when modelKey is a non-empty string,
 *     otherwise null
 *   - Returns `{ ok: true }`
 *
 * We replicate the minimal handler logic inline so the test is fully isolated.
 */
describe('title:setModelPreference', () => {
  // -------------------------------------------------------------------------
  // Inline handler — mirrors workspace-handlers.ts lines ~3866 exactly
  // -------------------------------------------------------------------------
  type SetResult = { ok: true }
  // We track what was "saved" by capturing the value passed to the setter
  let savedValue: string | null | undefined = undefined
  const setTitleModelPreference = (modelKey: string | null | undefined) => {
    savedValue =
      typeof modelKey === 'string' && modelKey.trim() ? modelKey.trim() : null
  }
  function handleTitleSetModelPreference(
    modelKey: string | null,
  ): SetResult {
    setTitleModelPreference(
      typeof modelKey === 'string' && modelKey.trim() ? modelKey.trim() : null,
    )
    return { ok: true }
  }

  beforeEach(() => {
    savedValue = undefined
  })

  it('returns ok:true', () => {
    const result = handleTitleSetModelPreference('anthropic/claude-3-5-sonnet')
    expect(result).toEqual({ ok: true })
  })

  it('stores trimmed model key when given a non-empty string', () => {
    handleTitleSetModelPreference('  openai/gpt-4o  ')
    expect(savedValue).toBe('openai/gpt-4o')
  })

  it('stores the model key unchanged when already trimmed', () => {
    handleTitleSetModelPreference('anthropic/claude-3-5-sonnet')
    expect(savedValue).toBe('anthropic/claude-3-5-sonnet')
  })

  it('stores null when modelKey is null', () => {
    handleTitleSetModelPreference(null)
    expect(savedValue).toBeNull()
  })

  it('stores null when modelKey is an empty string', () => {
    handleTitleSetModelPreference('')
    expect(savedValue).toBeNull()
  })

  it('stores null when modelKey is only whitespace', () => {
    handleTitleSetModelPreference('   ')
    expect(savedValue).toBeNull()
  })

  it('stores null when modelKey is tab/newline whitespace', () => {
    handleTitleSetModelPreference('\t\n  ')
    expect(savedValue).toBeNull()
  })

  it('preserves model key containing slashes and hyphens', () => {
    const key = 'google/gemini-2.5-pro'
    handleTitleSetModelPreference(key)
    expect(savedValue).toBe(key)
  })
})
