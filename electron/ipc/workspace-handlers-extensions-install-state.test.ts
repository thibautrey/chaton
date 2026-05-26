import { describe, expect, it, vi } from 'vitest'

/**
 * Unit tests for the `extensions:installState` IPC handler.
 *
 * Key behavioral guarantees verified:
 * - Handler rejects non-string or empty/whitespace id with {ok:false, message}
 * - Handler trims the id before passing to getChatonsExtensionInstallState
 * - Returns the install state: { ok: true, state: { id, status, ... } }
 * - Returns idle status for unknown extensions (no install state recorded yet)
 * - Propagates the full state object when one exists
 * - Handles various status values: idle, running, done, error, cancelled
 *
 * We replicate the minimal handler logic inline to test without needing the full
 * workspace-handlers.ts module graph (install state Maps are internal).
 */

type ChatonsExtensionInstallState = {
  id: string
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled'
  startedAt?: string
  finishedAt?: string
  message?: string
  pid?: number
}

type InstallStateResult = {
  ok: true
  state: ChatonsExtensionInstallState
}

// Inline handler mirroring workspace-handlers.ts lines 2101–2106
function handleExtensionsInstallState(params: {
  getChatonsExtensionInstallState: (id: string) => InstallStateResult
}, id: string): InstallStateResult | { ok: false; message: string } {
  if (typeof id !== "string" || !id.trim()) {
    return { ok: false as const, message: "extension id is required" };
  }
  return params.getChatonsExtensionInstallState(id.trim());
}

// Type guard: narrows to InstallStateResult when caller has verified ok=true
function isOk(result: InstallStateResult | { ok: false; message: string }): result is InstallStateResult {
  return result.ok === true;
}

// -------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------

describe('extensions:installState', () => {
  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------
  describe('input validation', () => {
    it('returns {ok:false} with message when id is undefined', () => {
      const result = handleExtensionsInstallState({
        getChatonsExtensionInstallState: () => ({ ok: true, state: { id: '', status: 'idle' } }),
      }, undefined as unknown as string);
      expect(result.ok).toBe(false);
      expect(result.message).toBe("extension id is required");
    });

    it('returns {ok:false} with message when id is null', () => {
      const result = handleExtensionsInstallState({
        getChatonsExtensionInstallState: () => ({ ok: true, state: { id: '', status: 'idle' } }),
      }, null as unknown as string);
      expect(result.ok).toBe(false);
      expect(result.message).toBe("extension id is required");
    });

    it('returns {ok:false} with message when id is a number', () => {
      const result = handleExtensionsInstallState({
        getChatonsExtensionInstallState: () => ({ ok: true, state: { id: '', status: 'idle' } }),
      }, 123 as unknown as string);
      expect(result.ok).toBe(false);
      expect(result.message).toBe("extension id is required");
    });

    it('returns {ok:false} with message when id is an object', () => {
      const result = handleExtensionsInstallState({
        getChatonsExtensionInstallState: () => ({ ok: true, state: { id: '', status: 'idle' } }),
      }, { id: 'test' } as unknown as string);
      expect(result.ok).toBe(false);
      expect(result.message).toBe("extension id is required");
    });

    it('returns {ok:false} with message when id is an empty string', () => {
      const result = handleExtensionsInstallState({
        getChatonsExtensionInstallState: () => ({ ok: true, state: { id: '', status: 'idle' } }),
      }, '');
      expect(result.ok).toBe(false);
      expect(result.message).toBe("extension id is required");
    });

    it('returns {ok:false} with message when id is only whitespace', () => {
      const result = handleExtensionsInstallState({
        getChatonsExtensionInstallState: () => ({ ok: true, state: { id: '', status: 'idle' } }),
      }, '   ');
      expect(result.ok).toBe(false);
      expect(result.message).toBe("extension id is required");
    });

    it('does not call getChatonsExtensionInstallState when id is empty', () => {
      const spy = vi.fn(() => ({ ok: true, state: { id: '', status: 'idle' } }));
      handleExtensionsInstallState({ getChatonsExtensionInstallState: spy }, '');
      expect(spy).not.toHaveBeenCalled();
    });

    it('does not call getChatonsExtensionInstallState when id is whitespace', () => {
      const spy = vi.fn(() => ({ ok: true, state: { id: '', status: 'idle' } }));
      handleExtensionsInstallState({ getChatonsExtensionInstallState: spy }, '  \t\n  ');
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Baseline
  // -------------------------------------------------------------------------
  describe('baseline', () => {
    it('returns ok:true', () => {
      const result = handleExtensionsInstallState({
        getChatonsExtensionInstallState: (id) => ({
          ok: true as const,
          state: { id, status: 'idle' as const },
        }),
      }, 'ext-test')
      expect(result.ok).toBe(true)
    })

    it('returns a state object with id and status', () => {
      const result = handleExtensionsInstallState({
        getChatonsExtensionInstallState: (id) => ({
          ok: true as const,
          state: { id, status: 'idle' as const },
        }),
      }, 'ext-abc')
      if (!isOk(result)) { expect.fail('expected ok result'); return; }
      expect(result.state).toBeDefined()
      expect(result.state.id).toBe('ext-abc')
      expect(result.state.status).toBe('idle')
    })
  })

  // -------------------------------------------------------------------------
  // Delegation
  // -------------------------------------------------------------------------
  describe('delegation to getChatonsExtensionInstallState', () => {
    it('passes the trimmed id parameter to getChatonsExtensionInstallState', () => {
      const spy = vi.fn((id: string) => ({
        ok: true as const,
        state: { id, status: 'idle' as const },
      }))
      handleExtensionsInstallState(
        { getChatonsExtensionInstallState: spy },
        'ext-delegation-test',
      )
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith('ext-delegation-test')
    })

    it('trims leading/trailing whitespace before delegation', () => {
      const spy = vi.fn((id: string) => ({
        ok: true as const,
        state: { id, status: 'idle' as const },
      }))
      handleExtensionsInstallState(
        { getChatonsExtensionInstallState: spy },
        '  ext-trimmed  ',
      )
      expect(spy).toHaveBeenCalledWith('ext-trimmed')
    });

    it('passes arbitrary extension ids correctly', () => {
      const spy = vi.fn((id: string) => ({
        ok: true as const,
        state: { id, status: 'idle' as const },
      }))

      const ids = ['@chaton/linear', 'builtin-automation', 'local-ext-123']
      for (const id of ids) {
        handleExtensionsInstallState(
          { getChatonsExtensionInstallState: spy },
          id,
        )
      }

      expect(spy).toHaveBeenCalledTimes(3)
      expect(spy).toHaveBeenNthCalledWith(1, '@chaton/linear')
      expect(spy).toHaveBeenNthCalledWith(2, 'builtin-automation')
      expect(spy).toHaveBeenNthCalledWith(3, 'local-ext-123')
    })
  })

  // -------------------------------------------------------------------------
  // Idle state (unknown extension)
  // -------------------------------------------------------------------------
  describe('idle state (unknown extension)', () => {
    it('returns status: idle for unknown extension', () => {
      const result = handleExtensionsInstallState({
        getChatonsExtensionInstallState: (id) => ({
          ok: true as const,
          state: { id, status: 'idle' as const },
        }),
      }, 'unknown-ext')
      if (!isOk(result)) { expect.fail('expected ok result'); return; }
      expect(result.state.status).toBe('idle')
    })

    it('idle state still includes the extension id', () => {
      const result = handleExtensionsInstallState({
        getChatonsExtensionInstallState: (id) => ({
          ok: true as const,
          state: { id, status: 'idle' as const },
        }),
      }, 'my-unknown-ext')
      if (!isOk(result)) { expect.fail('expected ok result'); return; }
      expect(result.state.id).toBe('my-unknown-ext')
    })
  })

  // -------------------------------------------------------------------------
  // Running state
  // -------------------------------------------------------------------------
  describe('running state', () => {
    it('returns status: running when install is in progress', () => {
      const result = handleExtensionsInstallState({
        getChatonsExtensionInstallState: (id) => ({
          ok: true as const,
          state: {
            id,
            status: 'running' as const,
            startedAt: '2026-05-06T10:00:00Z',
            pid: 12345,
          },
        }),
      }, 'ext-running')
      if (!isOk(result)) { expect.fail('expected ok result'); return; }
      expect(result.state.status).toBe('running')
      expect(result.state.startedAt).toBe('2026-05-06T10:00:00Z')
      expect(result.state.pid).toBe(12345)
    })
  })

  // -------------------------------------------------------------------------
  // Done state
  // -------------------------------------------------------------------------
  describe('done state', () => {
    it('returns status: done on successful install', () => {
      const result = handleExtensionsInstallState({
        getChatonsExtensionInstallState: (id) => ({
          ok: true as const,
          state: {
            id,
            status: 'done' as const,
            startedAt: '2026-05-06T10:00:00Z',
            finishedAt: '2026-05-06T10:01:30Z',
            message: 'Extension integree activee.',
          },
        }),
      }, 'ext-done')
      if (!isOk(result)) { expect.fail('expected ok result'); return; }
      expect(result.state.status).toBe('done')
      expect(result.state.message).toBe('Extension integree activee.')
      expect(result.state.finishedAt).toBeDefined()
    })
  })

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------
  describe('error state', () => {
    it('returns status: error on install failure', () => {
      const result = handleExtensionsInstallState({
        getChatonsExtensionInstallState: (id) => ({
          ok: true as const,
          state: {
            id,
            status: 'error' as const,
            startedAt: '2026-05-06T10:00:00Z',
            finishedAt: '2026-05-06T10:00:05Z',
            message: 'npm install failed',
          },
        }),
      }, 'ext-error')
      if (!isOk(result)) { expect.fail('expected ok result'); return; }
      expect(result.state.status).toBe('error')
      expect(result.state.message).toBe('npm install failed')
    })

    it('error state can include no message', () => {
      const result = handleExtensionsInstallState({
        getChatonsExtensionInstallState: (id) => ({
          ok: true as const,
          state: {
            id,
            status: 'error' as const,
            finishedAt: '2026-05-06T10:00:05Z',
          },
        }),
      }, 'ext-error-no-msg')
      if (!isOk(result)) { expect.fail('expected ok result'); return; }
      expect(result.state.status).toBe('error')
      expect(result.state.message).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // Cancelled state
  // -------------------------------------------------------------------------
  describe('cancelled state', () => {
    it('returns status: cancelled when user cancels install', () => {
      const result = handleExtensionsInstallState({
        getChatonsExtensionInstallState: (id) => ({
          ok: true as const,
          state: {
            id,
            status: 'cancelled' as const,
            startedAt: '2026-05-06T10:00:00Z',
            finishedAt: '2026-05-06T10:00:10Z',
            message: 'Installation annulee par utilisateur.',
          },
        }),
      }, 'ext-cancelled')
      if (!isOk(result)) { expect.fail('expected ok result'); return; }
      expect(result.state.status).toBe('cancelled')
      expect(result.state.message).toBe('Installation annulee par utilisateur.')
    })
  })

  // -------------------------------------------------------------------------
  // Full state preservation
  // -------------------------------------------------------------------------
  describe('full state field preservation', () => {
    it('preserves all fields from a rich install state', () => {
      const richState: ChatonsExtensionInstallState = {
        id: 'rich-ext',
        status: 'done',
        startedAt: '2026-05-06T10:00:00Z',
        finishedAt: '2026-05-06T10:02:00Z',
        message: 'Installation reussie.',
        pid: 54321,
      }

      const result = handleExtensionsInstallState({
        getChatonsExtensionInstallState: (id) => ({
          ok: true as const,
          state: richState,
        }),
      }, 'rich-ext')
      if (!isOk(result)) { expect.fail('expected ok result'); return; }
      expect(result.state.id).toBe('rich-ext')
      expect(result.state.status).toBe('done')
      expect(result.state.startedAt).toBe('2026-05-06T10:00:00Z')
      expect(result.state.finishedAt).toBe('2026-05-06T10:02:00Z')
      expect(result.state.message).toBe('Installation reussie.')
      expect(result.state.pid).toBe(54321)
    })
  })
})
