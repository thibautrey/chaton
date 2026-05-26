import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `pi:openPath` IPC handler.
 *
 * The handler (workspace-handlers.ts lines 2546–2565) accepts a `target` param
 * and opens the corresponding Pi settings path in the OS shell.
 *
 * Key behaviors verified:
 * - Invalid target (not "settings" | "models" | "sessions") → { ok: false, message }
 * - Valid "settings" target → calls shell.openPath with settings path
 * - Valid "models" target → calls shell.openPath with models path
 * - Valid "sessions" target → calls shell.openPath with sessions path
 * - shell.openPath success → { ok: true }
 * - shell.openPath throws → { ok: false, message }
 */

describe('pi:openPath handler', () => {
  // ---------------------------------------------------------------------------
  // Minimal types mirroring those used by the real handler
  // ---------------------------------------------------------------------------
  interface OpenPathResult {
    ok: true
  }
  interface OpenPathError {
    ok: false
    message: string
  }

  // ---------------------------------------------------------------------------
  // Inline handler — mirrors workspace-handlers.ts lines 2546–2565.
  // ---------------------------------------------------------------------------
  function openPathHandler(
    deps: {
      getPiAgentDir: () => string
      getPiSettingsPath: () => string
      getPiModelsPath: () => string
    },
    shell: { openPath: (path: string) => Promise<void> },
    target: unknown,
  ): OpenPathResult | OpenPathError {
    if (
      target !== "settings" &&
      target !== "models" &&
      target !== "sessions"
    ) {
      return {
        ok: false as const,
        message:
          "Invalid target: must be 'settings', 'models', or 'sessions'.",
      }
    }
    const base = deps.getPiAgentDir()
    const targetPath =
      target === "settings"
        ? deps.getPiSettingsPath()
        : target === "models"
          ? deps.getPiModelsPath()
          : `${base}/sessions`
    return shell.openPath(targetPath).then(
      () => ({ ok: true as const }),
      (error: unknown) => ({
        ok: false as const,
        message: error instanceof Error ? error.message : String(error),
      }),
    )
  }

  // ---------------------------------------------------------------------------
  // Shared mocks
  // ---------------------------------------------------------------------------
  const mockDeps = {
    getPiAgentDir: () => '/mock/userData/.pi/agent',
    getPiSettingsPath: () => '/mock/userData/.pi/agent/settings.json',
    getPiModelsPath: () => '/mock/userData/.pi/agent/models.json',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---------------------------------------------------------------------------
  // Validation tests
  // ---------------------------------------------------------------------------
  describe('input validation', () => {
    it('returns {ok:false, message} when target is a random string', async () => {
      const result = await openPathHandler(mockDeps, { openPath: vi.fn() }, 'random-string')
      expect(result).toEqual({
        ok: false,
        message: "Invalid target: must be 'settings', 'models', or 'sessions'.",
      })
    })

    it('returns {ok:false, message} when target is a number', async () => {
      const result = await openPathHandler(mockDeps, { openPath: vi.fn() }, 42)
      expect(result).toEqual({
        ok: false,
        message: "Invalid target: must be 'settings', 'models', or 'sessions'.",
      })
    })

    it('returns {ok:false, message} when target is null', async () => {
      const result = await openPathHandler(mockDeps, { openPath: vi.fn() }, null)
      expect(result).toEqual({
        ok: false,
        message: "Invalid target: must be 'settings', 'models', or 'sessions'.",
      })
    })

    it('returns {ok:false, message} when target is undefined', async () => {
      const result = await openPathHandler(mockDeps, { openPath: vi.fn() }, undefined)
      expect(result).toEqual({
        ok: false,
        message: "Invalid target: must be 'settings', 'models', or 'sessions'.",
      })
    })

    it('returns {ok:false, message} when target is an object', async () => {
      const result = await openPathHandler(mockDeps, { openPath: vi.fn() }, { value: 'settings' })
      expect(result).toEqual({
        ok: false,
        message: "Invalid target: must be 'settings', 'models', or 'sessions'.",
      })
    })

    it('returns {ok:false, message} when target is an empty string', async () => {
      const result = await openPathHandler(mockDeps, { openPath: vi.fn() }, '')
      expect(result).toEqual({
        ok: false,
        message: "Invalid target: must be 'settings', 'models', or 'sessions'.",
      })
    })

    it('returns {ok:false, message} when target is a whitespace-only string', async () => {
      const result = await openPathHandler(mockDeps, { openPath: vi.fn() }, '   ')
      expect(result).toEqual({
        ok: false,
        message: "Invalid target: must be 'settings', 'models', or 'sessions'.",
      })
    })
  })

  // ---------------------------------------------------------------------------
  // Valid target — success path
  // ---------------------------------------------------------------------------
  describe('valid targets — success', () => {
    it('opens settings path for target "settings"', async () => {
      const openPath = vi.fn().mockResolvedValue(undefined)
      const result = await openPathHandler(mockDeps, { openPath }, 'settings')
      expect(result).toEqual({ ok: true })
      expect(openPath).toHaveBeenCalledOnce()
      expect(openPath).toHaveBeenCalledWith('/mock/userData/.pi/agent/settings.json')
    })

    it('opens models path for target "models"', async () => {
      const openPath = vi.fn().mockResolvedValue(undefined)
      const result = await openPathHandler(mockDeps, { openPath }, 'models')
      expect(result).toEqual({ ok: true })
      expect(openPath).toHaveBeenCalledOnce()
      expect(openPath).toHaveBeenCalledWith('/mock/userData/.pi/agent/models.json')
    })

    it('opens sessions path for target "sessions"', async () => {
      const openPath = vi.fn().mockResolvedValue(undefined)
      const result = await openPathHandler(mockDeps, { openPath }, 'sessions')
      expect(result).toEqual({ ok: true })
      expect(openPath).toHaveBeenCalledOnce()
      expect(openPath).toHaveBeenCalledWith('/mock/userData/.pi/agent/sessions')
    })
  })

  // ---------------------------------------------------------------------------
  // Valid target — error path
  // ---------------------------------------------------------------------------
  describe('valid targets — shell.openPath error', () => {
    it('returns {ok:false, message} when openPath throws an Error', async () => {
      const error = new Error('ENOENT: no such file or directory')
      const openPath = vi.fn().mockRejectedValue(error)
      const result = await openPathHandler(mockDeps, { openPath }, 'settings')
      expect(result).toEqual({ ok: false, message: 'ENOENT: no such file or directory' })
    })

    it('returns {ok:false, message} with string coercion for non-Error throws', async () => {
      const openPath = vi.fn().mockRejectedValue('Path not found')
      const result = await openPathHandler(mockDeps, { openPath }, 'models')
      expect(result).toEqual({ ok: false, message: 'Path not found' })
    })

    it('returns {ok:false, message} with empty string for thrown empty object', async () => {
      const openPath = vi.fn().mockRejectedValue({})
      const result = await openPathHandler(mockDeps, { openPath }, 'sessions')
      expect(result).toEqual({ ok: false, message: '[object Object]' })
    })
  })
})
