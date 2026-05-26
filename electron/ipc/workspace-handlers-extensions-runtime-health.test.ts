import { describe, expect, it, vi } from 'vitest'

/**
 * Unit tests for the `extensions:runtime:health` IPC handler.
 *
 * Handler (workspace-handlers.ts lines 2270–2272):
 *   ipcMain.handle("extensions:runtime:health", () =>
 *     getExtensionRuntimeHealth(),
 *   );
 *
 * This is a pure passthrough — the handler calls getExtensionRuntimeHealth()
 * and returns the result directly. The real implementation (runtime.ts) returns
 * { ok, started, manifests, subscriptions, deadLetters, sandboxedWorkers }.
 * These tests verify the passthrough contract without needing the full
 * workspace-handlers.ts module graph (runtime state, DB, Pi deps).
 */

// -------------------------------------------------------------------------
// Inline passthrough handler — mirrors workspace-handlers.ts lines 2270–2272
// -------------------------------------------------------------------------

type RuntimeHealthResult = {
  ok: true
  started: boolean
  manifests: number
  subscriptions: number
  deadLetters?: number
  sandboxedWorkers?: unknown
}

function runtimeHealthHandler(
  getExtensionRuntimeHealth: () => RuntimeHealthResult,
): RuntimeHealthResult {
  return getExtensionRuntimeHealth()
}

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe('extensions:runtime:health', () => {
  it('passthrough — returns full result from getExtensionRuntimeHealth', () => {
    const getExtensionRuntimeHealth = vi.fn<[], RuntimeHealthResult>().mockReturnValue({
      ok: true,
      started: true,
      manifests: 3,
      subscriptions: 2,
      deadLetters: 0,
      sandboxedWorkers: { active: 0, total: 0 },
    })
    const result = runtimeHealthHandler(getExtensionRuntimeHealth)
    expect(result).toEqual({
      ok: true,
      started: true,
      manifests: 3,
      subscriptions: 2,
      deadLetters: 0,
      sandboxedWorkers: { active: 0, total: 0 },
    })
    expect(getExtensionRuntimeHealth).toHaveBeenCalledOnce()
    expect(getExtensionRuntimeHealth).toHaveBeenCalledWith()
  })

  it('passthrough — returns ok:true with started: false (not yet started)', () => {
    const getExtensionRuntimeHealth = vi.fn<[], RuntimeHealthResult>().mockReturnValue({
      ok: true,
      started: false,
      manifests: 0,
      subscriptions: 0,
    })
    const result = runtimeHealthHandler(getExtensionRuntimeHealth)
    expect(result).toEqual({ ok: true, started: false, manifests: 0, subscriptions: 0 })
    expect(getExtensionRuntimeHealth).toHaveBeenCalledOnce()
  })

  it('passthrough — returns with all fields when runtime is healthy', () => {
    const getExtensionRuntimeHealth = vi.fn<[], RuntimeHealthResult>().mockReturnValue({
      ok: true,
      started: true,
      manifests: 7,
      subscriptions: 5,
      deadLetters: 1,
      sandboxedWorkers: { active: 2, total: 2 },
    })
    const result = runtimeHealthHandler(getExtensionRuntimeHealth)
    expect(result.ok).toBe(true)
    expect(result.started).toBe(true)
    expect(result.manifests).toBe(7)
    expect(result.subscriptions).toBe(5)
    expect(result.deadLetters).toBe(1)
    expect(result.sandboxedWorkers).toEqual({ active: 2, total: 2 })
  })

  it('passthrough — calls with zero arguments (no params accepted)', () => {
    const getExtensionRuntimeHealth = vi.fn<[], RuntimeHealthResult>().mockReturnValue({
      ok: true,
      started: false,
      manifests: 0,
      subscriptions: 0,
    })
    runtimeHealthHandler(getExtensionRuntimeHealth)
    // Verify no arguments were passed
    expect(getExtensionRuntimeHealth).toHaveBeenCalledWith()
  })

  it('passthrough — empty/zero state still returns ok:true', () => {
    const getExtensionRuntimeHealth = vi.fn<[], RuntimeHealthResult>().mockReturnValue({
      ok: true,
      started: false,
      manifests: 0,
      subscriptions: 0,
    })
    const result = runtimeHealthHandler(getExtensionRuntimeHealth)
    expect(result.ok).toBe(true)
    expect(result.started).toBe(false)
    expect(result.manifests).toBe(0)
    expect(result.subscriptions).toBe(0)
  })
})
