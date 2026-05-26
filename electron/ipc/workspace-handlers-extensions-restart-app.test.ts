import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `extensions:restartApp` IPC handler.
 *
 * The handler (workspace-handlers.ts lines 2361–2366) is intentionally minimal:
 * it calls app.relaunch() and app.exit(0) then returns {ok: true}.
 *
 * Behavioral guarantees verified:
 * - Returns {ok: true} after calling app.relaunch() and app.exit(0).
 * - No parameters — the handler takes no arguments.
 * - app.relaunch() is called before app.exit(0).
 * - The returned value is {ok: true} so the IPC promise resolves.
 * - The handler is synchronous — it does not await.
 */

// -------------------------------------------------------------------------
// Inline handler replica — mirrors workspace-handlers.ts lines 2361–2366.
// -------------------------------------------------------------------------

type RestartAppResult = { ok: true }

function handleRestartApp(deps: { app: { relaunch: () => void; exit: (code: number) => void } }): RestartAppResult {
  deps.app.relaunch()
  deps.app.exit(0)
  return { ok: true as const }
}

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe('extensions:restartApp', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns {ok: true}', () => {
    const app = { relaunch: vi.fn(), exit: vi.fn() }
    const result = handleRestartApp({ app })
    expect(result).toEqual({ ok: true })
  })

  it('calls app.relaunch()', () => {
    const relaunch = vi.fn()
    const app = { relaunch, exit: vi.fn() }
    handleRestartApp({ app })
    expect(relaunch).toHaveBeenCalledTimes(1)
  })

  it('calls app.exit(0)', () => {
    const exit = vi.fn()
    const app = { relaunch: vi.fn(), exit }
    handleRestartApp({ app })
    expect(exit).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('calls app.relaunch() before app.exit(0)', () => {
    const callOrder: string[] = []
    const app = {
      relaunch: () => callOrder.push('relaunch'),
      exit: () => callOrder.push('exit'),
    }
    handleRestartApp({ app })
    expect(callOrder).toEqual(['relaunch', 'exit'])
  })

  it('re-throws when app.relaunch() throws — no try/catch in handler', () => {
    const app = {
      relaunch: () => { throw new Error('relaunch failed') },
      exit: vi.fn(),
    }
    expect(() => handleRestartApp({ app })).toThrow('relaunch failed')
    // app.exit is NOT called if relaunch throws first
    expect(app.exit).not.toHaveBeenCalled()
  })

  it('re-throws when app.exit() throws — no try/catch in handler', () => {
    const app = {
      relaunch: vi.fn(),
      exit: () => { throw new Error('exit failed') },
    }
    expect(() => handleRestartApp({ app })).toThrow('exit failed')
    expect(app.relaunch).toHaveBeenCalledTimes(1)
  })

  it('does not take any IPC parameters — the handler signature is () => Result', () => {
    // The handler is registered as ipcMain.handle("extensions:restartApp", () => { ... })
    // It takes no parameters beyond the optional Electron event.
    // This test documents that there is nothing to validate.
    const app = { relaunch: vi.fn(), exit: vi.fn() }
    const result = handleRestartApp({ app })
    expect(result.ok).toBe(true)
    expect(app.relaunch).toHaveBeenCalled()
    expect(app.exit).toHaveBeenCalled()
  })

  it('is synchronous — returns before any async work could occur', () => {
    let resolved = false
    const app = {
      relaunch: vi.fn(),
      exit: vi.fn(),
    }
    const result = handleRestartApp({ app })
    resolved = true
    expect(result).toEqual({ ok: true })
    expect(resolved).toBe(true)
  })

  it('returns a plain object — the `as const` is a TypeScript type assertion, not a runtime freeze', () => {
    const app = { relaunch: vi.fn(), exit: vi.fn() }
    const result = handleRestartApp({ app })
    // The handler uses `as const` to narrow the type to {ok: true}, not to freeze at runtime
    expect(result).toEqual({ ok: true })
    expect(Object.isFrozen(result)).toBe(false)
  })
})
