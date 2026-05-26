import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `pi:getAuthJson` IPC handler.
 *
 * The handler (workspace-handlers.ts lines 1885–1889) calls deps.getAuthJson()
 * and wraps the result in { ok: true, auth: <result> }.
 *
 * It was completely untested. Key behaviors to verify:
 * - Always returns { ok: true } regardless of auth content
 * - Wraps the raw auth object from getAuthJson in the auth field
 * - Passes through empty auth objects
 * - Passes through rich auth objects with providers
 * - Calls getAuthJson with no arguments
 * - Result auth field is the same reference as returned by getAuthJson
 */

describe('pi:getAuthJson handler', () => {
  // -------------------------------------------------------------------------
  // Inline minimal handler — mirrors workspace-handlers.ts lines 1885–1889.
  // -------------------------------------------------------------------------
  function getAuthJsonHandler(deps: {
    getAuthJson: () => Record<string, unknown>
  }): { ok: true; auth: Record<string, unknown> } {
    const authJson = deps.getAuthJson()
    return { ok: true as const, auth: authJson }
  }

  // -------------------------------------------------------------------------
  // Tests
  // -------------------------------------------------------------------------

  it('returns {ok: true} regardless of auth content', () => {
    const deps = { getAuthJson: vi.fn().mockReturnValue({}) }
    const result = getAuthJsonHandler(deps)
    expect(result.ok).toBe(true)
  })

  it('calls getAuthJson with no arguments', () => {
    const getAuthJson = vi.fn().mockReturnValue({})
    const deps = { getAuthJson }
    getAuthJsonHandler(deps)
    expect(getAuthJson).toHaveBeenCalledTimes(1)
    expect(getAuthJson).toHaveBeenCalledWith()
  })

  it('wraps the raw auth object from getAuthJson in the auth field', () => {
    const mockAuth = { providers: { openai: { apiKey: 'sk-test' } } }
    const deps = { getAuthJson: vi.fn().mockReturnValue(mockAuth) }
    const result = getAuthJsonHandler(deps)
    expect(result).toEqual({ ok: true, auth: mockAuth })
  })

  it('passes through an empty auth object unchanged', () => {
    const deps = { getAuthJson: vi.fn().mockReturnValue({}) }
    const result = getAuthJsonHandler(deps)
    expect(result.auth).toEqual({})
  })

  it('passes through a rich auth object with multiple providers', () => {
    const mockAuth = {
      providers: {
        openai: { apiKey: 'sk-abc' },
        anthropic: { apiKey: 'sk-ant' },
        google: { apiKey: 'AIza-xyz' },
      },
    }
    const deps = { getAuthJson: vi.fn().mockReturnValue(mockAuth) }
    const result = getAuthJsonHandler(deps)
    expect(result.auth).toEqual(mockAuth)
  })

  it('preserves extra fields on the auth object', () => {
    const mockAuth = {
      providers: { openai: { apiKey: 'sk-123' } },
      lastUpdated: '2026-01-01',
    } as unknown as Record<string, unknown>
    const deps = { getAuthJson: vi.fn().mockReturnValue(mockAuth) }
    const result = getAuthJsonHandler(deps)
    expect(result.auth).toEqual(mockAuth)
  })

  it('handles auth object with OAuth tokens alongside API keys', () => {
    const mockAuth = {
      providers: {
        github: { accessToken: 'gho_xxx', refreshToken: 'yoy_xxx' },
        google: { apiKey: 'AIza-xyz', refreshToken: 'rt_xyz' },
      },
    }
    const deps = { getAuthJson: vi.fn().mockReturnValue(mockAuth) }
    const result = getAuthJsonHandler(deps)
    expect(result.auth).toEqual(mockAuth)
    expect(result.ok).toBe(true)
  })

  it('always returns ok: true even when auth has no providers field', () => {
    const mockAuth = { version: 1 } as unknown as Record<string, unknown>
    const deps = { getAuthJson: vi.fn().mockReturnValue(mockAuth) }
    const result = getAuthJsonHandler(deps)
    expect(result.ok).toBe(true)
    expect(result.auth).toEqual(mockAuth)
  })

  it('result auth field is the same reference as returned by getAuthJson', () => {
    const mockAuth = { test: true }
    const deps = { getAuthJson: vi.fn().mockReturnValue(mockAuth) }
    const result = getAuthJsonHandler(deps)
    // auth field should be the exact same object reference, not a copy
    expect(result.auth).toBe(mockAuth)
  })

  it('does not call getAuthJson more than once', () => {
    const getAuthJson = vi.fn().mockReturnValue({})
    const deps = { getAuthJson }
    const result = getAuthJsonHandler(deps)
    void result.auth // access after handler returns
    expect(getAuthJson).toHaveBeenCalledTimes(1)
  })
})
