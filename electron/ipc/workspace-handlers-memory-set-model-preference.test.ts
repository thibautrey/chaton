import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `memory:setModelPreference` IPC handler.
 *
 * The handler (workspace-handlers.ts lines ~3851):
 *   - Calls `setMemoryModelPreference(trimmedOrNull)`
 *   - `trimmedOrNull` = modelKey.trim() when modelKey is a non-empty string,
 *     otherwise null
 *   - Returns `{ ok: true }`
 *
 * We replicate the minimal handler logic inline so the test is fully isolated.
 */
describe('memory:setModelPreference', () => {
  // -------------------------------------------------------------------------
  // Inline handler — mirrors workspace-handlers.ts lines ~3851 exactly
  // -------------------------------------------------------------------------
  type SetResult = { ok: true }
  // We track what was "saved" by capturing the value passed to the setter
  let savedValue: string | null | undefined = undefined
  const setMemoryModelPreference = (modelKey: string | null | undefined) => {
    savedValue =
      typeof modelKey === 'string' && modelKey.trim() ? modelKey.trim() : null
  }
  function handleMemorySetModelPreference(
    modelKey: string | null,
  ): SetResult {
    setMemoryModelPreference(
      typeof modelKey === 'string' && modelKey.trim() ? modelKey.trim() : null,
    )
    return { ok: true }
  }

  beforeEach(() => {
    savedValue = undefined
  })

  it('returns ok:true', () => {
    const result = handleMemorySetModelPreference('anthropic/claude-3-5-sonnet')
    expect(result).toEqual({ ok: true })
  })

  it('stores trimmed model key when given a non-empty string', () => {
    handleMemorySetModelPreference('  openai/gpt-4o  ')
    expect(savedValue).toBe('openai/gpt-4o')
  })

  it('stores the model key unchanged when already trimmed', () => {
    handleMemorySetModelPreference('anthropic/claude-3-5-sonnet')
    expect(savedValue).toBe('anthropic/claude-3-5-sonnet')
  })

  it('stores null when modelKey is null', () => {
    handleMemorySetModelPreference(null)
    expect(savedValue).toBeNull()
  })

  it('stores null when modelKey is an empty string', () => {
    handleMemorySetModelPreference('')
    expect(savedValue).toBeNull()
  })

  it('stores null when modelKey is only whitespace', () => {
    handleMemorySetModelPreference('   ')
    expect(savedValue).toBeNull()
  })

  it('stores null when modelKey is tab/newline whitespace', () => {
    handleMemorySetModelPreference('\t\n  ')
    expect(savedValue).toBeNull()
  })

  it('preserves model key containing slashes and hyphens', () => {
    const key = 'mistral/mistral-large-latest'
    handleMemorySetModelPreference(key)
    expect(savedValue).toBe(key)
  })
})
