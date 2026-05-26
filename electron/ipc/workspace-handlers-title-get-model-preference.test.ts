import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `title:getModelPreference` IPC handler.
 *
 * The handler (workspace-handlers.ts lines 3861–3863):
 *   - Calls `getTitleModelPreference()` from workspace-title.ts
 *   - Returns `{ ok: true, modelKey: <result> }` where result is `string | null`
 *
 * `getTitleModelPreference()` (workspace-title.ts line 37):
 *   - Reads from SQLite app_settings table using `TITLE_MODEL_SETTINGS_KEY`
 *   - Returns the stored value or null if not set
 *
 * We replicate the minimal handler logic inline so the test is fully isolated
 * from the database and IPC wiring.
 */

describe('title:getModelPreference', () => {
  // -------------------------------------------------------------------------
  // Inline handler — mirrors workspace-handlers.ts lines 3861–3863 exactly
  // -------------------------------------------------------------------------
  function handleTitleGetModelPreference(
    getTitleModelPreference: () => string | null,
  ): { ok: true; modelKey: string | null } {
    return {
      ok: true as const,
      modelKey: getTitleModelPreference(),
    }
  }

  // -------------------------------------------------------------------------
  // Passthrough contract
  // -------------------------------------------------------------------------

  it('calls getTitleModelPreference with no arguments', () => {
    const getTitleModelPreference = vi.fn().mockReturnValue(null)
    handleTitleGetModelPreference(getTitleModelPreference)
    expect(getTitleModelPreference).toHaveBeenCalledTimes(1)
    expect(getTitleModelPreference).toHaveBeenCalledWith()
  })

  it('returns { ok: true } regardless of the stored model key', () => {
    const result1 = handleTitleGetModelPreference(() => 'openai/gpt-4o')
    expect(result1.ok).toBe(true)

    const result2 = handleTitleGetModelPreference(() => null)
    expect(result2.ok).toBe(true)
  })

  it('does not call getTitleModelPreference more than once per invocation', () => {
    const getTitleModelPreference = vi.fn().mockReturnValue(null)
    handleTitleGetModelPreference(getTitleModelPreference)
    expect(getTitleModelPreference).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // modelKey passthrough
  // -------------------------------------------------------------------------

  it('returns the stored model key unchanged', () => {
    const result = handleTitleGetModelPreference(() => 'anthropic/claude-3-5-sonnet')
    expect(result.modelKey).toBe('anthropic/claude-3-5-sonnet')
  })

  it('returns the full provider/model key with slashes', () => {
    const result = handleTitleGetModelPreference(() => 'google/gemini-2.5-pro')
    expect(result.modelKey).toBe('google/gemini-2.5-pro')
  })

  it('returns null when no model is configured', () => {
    const result = handleTitleGetModelPreference(() => null)
    expect(result.modelKey).toBeNull()
  })

  // -------------------------------------------------------------------------
  // Result shape
  // -------------------------------------------------------------------------

  it('result modelKey field is the same reference as returned by getTitleModelPreference', () => {
    const mockKey = 'openai/gpt-4o-mini'
    const getTitleModelPreference = vi.fn().mockReturnValue(mockKey)
    const result = handleTitleGetModelPreference(getTitleModelPreference)
    expect(result.modelKey).toBe(mockKey)
  })

  it('result structure matches { ok: true, modelKey: string | null }', () => {
    const result = handleTitleGetModelPreference(() => 'test/model')
    expect(result).toEqual({ ok: true, modelKey: 'test/model' })
  })
})
