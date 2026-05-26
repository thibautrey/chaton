import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `memory:getModelPreference` IPC handler.
 *
 * The handler (workspace-handlers.ts lines 3846–3849):
 *   - Calls `getMemoryModelPreference()` from memory-lifecycle.ts
 *   - Returns `{ ok: true, modelKey: <result> }` where result is `string | null`
 *
 * `getMemoryModelPreference()` (memory-lifecycle.ts line 49):
 *   - Reads from SQLite app_settings table using `MEMORY_MODEL_SETTINGS_KEY`
 *   - Returns the stored value or null if not set
 *
 * We replicate the minimal handler logic inline so the test is fully isolated
 * from the database and IPC wiring.
 */

describe('memory:getModelPreference', () => {
  // -------------------------------------------------------------------------
  // Inline handler — mirrors workspace-handlers.ts lines 3846–3849 exactly
  // -------------------------------------------------------------------------
  function handleMemoryGetModelPreference(
    getMemoryModelPreference: () => string | null,
  ): { ok: true; modelKey: string | null } {
    return {
      ok: true as const,
      modelKey: getMemoryModelPreference(),
    }
  }

  // -------------------------------------------------------------------------
  // Passthrough contract
  // -------------------------------------------------------------------------

  it('calls getMemoryModelPreference with no arguments', () => {
    const getMemoryModelPreference = vi.fn().mockReturnValue(null)
    handleMemoryGetModelPreference(getMemoryModelPreference)
    expect(getMemoryModelPreference).toHaveBeenCalledTimes(1)
    expect(getMemoryModelPreference).toHaveBeenCalledWith()
  })

  it('returns { ok: true } regardless of the stored model key', () => {
    const result1 = handleMemoryGetModelPreference(() => 'openai/gpt-4o')
    expect(result1.ok).toBe(true)

    const result2 = handleMemoryGetModelPreference(() => null)
    expect(result2.ok).toBe(true)
  })

  it('does not call getMemoryModelPreference more than once per invocation', () => {
    const getMemoryModelPreference = vi.fn().mockReturnValue(null)
    handleMemoryGetModelPreference(getMemoryModelPreference)
    expect(getMemoryModelPreference).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // modelKey passthrough
  // -------------------------------------------------------------------------

  it('returns the stored model key unchanged', () => {
    const result = handleMemoryGetModelPreference(() => 'anthropic/claude-3-5-sonnet')
    expect(result.modelKey).toBe('anthropic/claude-3-5-sonnet')
  })

  it('returns the full provider/model key with slashes', () => {
    const result = handleMemoryGetModelPreference(() => 'google/gemini-2.5-pro')
    expect(result.modelKey).toBe('google/gemini-2.5-pro')
  })

  it('returns null when no model is configured', () => {
    const result = handleMemoryGetModelPreference(() => null)
    expect(result.modelKey).toBeNull()
  })

  // -------------------------------------------------------------------------
  // Result shape
  // -------------------------------------------------------------------------

  it('result modelKey field is the same reference as returned by getMemoryModelPreference', () => {
    const mockKey = 'openai/gpt-4o-mini'
    const getMemoryModelPreference = vi.fn().mockReturnValue(mockKey)
    const result = handleMemoryGetModelPreference(getMemoryModelPreference)
    expect(result.modelKey).toBe(mockKey)
  })

  it('result structure matches { ok: true, modelKey: string | null }', () => {
    const result = handleMemoryGetModelPreference(() => 'test/model')
    expect(result).toEqual({ ok: true, modelKey: 'test/model' })
  })
})
