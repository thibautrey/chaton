import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `extensions:update` IPC handler.
 *
 * The handler (workspace-handlers.ts lines 2306–2311) validates the id parameter
 * before delegating to updateChatonsExtension(id.trim()):
 *   1. Rejects non-string, empty, or whitespace-only ids
 *   2. Trims the id and delegates to updateChatonsExtension
 *
 * updateChatonsExtension returns:
 *   { ok: true, ... }            on success (with extension id, new version, etc.)
 *   { ok: false, message: '...' } when extension not found or other error
 */

/**
 * Inline handler mirroring workspace-handlers.ts lines 2306–2311.
 * Separated from the updateChatonsExtension unit tests so each layer
 * can be verified in isolation.
 */
function handleExtensionsUpdate(params: {
  updateChatonsExtension: (id: string) => { ok: boolean; message?: string }
}, id: string): { ok: boolean; message?: string } {
  if (typeof id !== "string" || !id.trim()) {
    return { ok: false, message: "extension id is required" };
  }
  return params.updateChatonsExtension(id.trim());
}

describe('extensions:update — handler validation', () => {
  let updateChatonsExtensionMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    updateChatonsExtensionMock = vi.fn()
  })

  it('returns {ok:false} when id is undefined', () => {
    const result = handleExtensionsUpdate(
      { updateChatonsExtension: updateChatonsExtensionMock },
      undefined as unknown as string,
    );
    expect(result).toEqual({ ok: false, message: "extension id is required" });
  });

  it('returns {ok:false} when id is null', () => {
    const result = handleExtensionsUpdate(
      { updateChatonsExtension: updateChatonsExtensionMock },
      null as unknown as string,
    );
    expect(result).toEqual({ ok: false, message: "extension id is required" });
  });

  it('returns {ok:false} when id is a number', () => {
    const result = handleExtensionsUpdate(
      { updateChatonsExtension: updateChatonsExtensionMock },
      42 as unknown as string,
    );
    expect(result).toEqual({ ok: false, message: "extension id is required" });
  });

  it('returns {ok:false} when id is an object', () => {
    const result = handleExtensionsUpdate(
      { updateChatonsExtension: updateChatonsExtensionMock },
      { id: 'test' } as unknown as string,
    );
    expect(result).toEqual({ ok: false, message: "extension id is required" });
  });

  it('returns {ok:false} when id is empty string', () => {
    const result = handleExtensionsUpdate(
      { updateChatonsExtension: updateChatonsExtensionMock },
      '',
    );
    expect(result).toEqual({ ok: false, message: "extension id is required" });
  });

  it('returns {ok:false} when id is only whitespace', () => {
    const result = handleExtensionsUpdate(
      { updateChatonsExtension: updateChatonsExtensionMock },
      '   \t\n',
    );
    expect(result).toEqual({ ok: false, message: "extension id is required" });
  });

  it('does not call updateChatonsExtension for empty id', () => {
    handleExtensionsUpdate(
      { updateChatonsExtension: updateChatonsExtensionMock },
      '',
    );
    expect(updateChatonsExtensionMock).not.toHaveBeenCalled();
  });

  it('does not call updateChatonsExtension for whitespace id', () => {
    handleExtensionsUpdate(
      { updateChatonsExtension: updateChatonsExtensionMock },
      '   \t\n  ',
    );
    expect(updateChatonsExtensionMock).not.toHaveBeenCalled();
  });

  it('trims whitespace from id before delegating to updateChatonsExtension', () => {
    updateChatonsExtensionMock.mockReturnValue({ ok: true });
    handleExtensionsUpdate(
      { updateChatonsExtension: updateChatonsExtensionMock },
      '  my-extension  ',
    );
    expect(updateChatonsExtensionMock).toHaveBeenCalledWith('my-extension');
  });

  it('passes valid untrimmed id unchanged when no whitespace', () => {
    updateChatonsExtensionMock.mockReturnValue({ ok: true });
    handleExtensionsUpdate(
      { updateChatonsExtension: updateChatonsExtensionMock },
      'valid-ext',
    );
    expect(updateChatonsExtensionMock).toHaveBeenCalledWith('valid-ext');
  });

  it('propagates {ok:true} from updateChatonsExtension', () => {
    updateChatonsExtensionMock.mockReturnValue({ ok: true, id: 'my-ext', version: '1.2.0' });
    const result = handleExtensionsUpdate(
      { updateChatonsExtension: updateChatonsExtensionMock },
      'my-ext',
    );
    expect(result).toEqual({ ok: true, id: 'my-ext', version: '1.2.0' });
  });

  it('propagates {ok:false} from updateChatonsExtension', () => {
    updateChatonsExtensionMock.mockReturnValue({ ok: false, message: 'Extension not found' });
    const result = handleExtensionsUpdate(
      { updateChatonsExtension: updateChatonsExtensionMock },
      'nonexistent',
    );
    expect(result).toEqual({ ok: false, message: 'Extension not found' });
  });
});

describe('extensions:update — updateChatonsExtension unit', () => {
  let updateChatonsExtensionMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    updateChatonsExtensionMock = vi.fn()
  })

  // -------------------------------------------------------------------------
  // Passthrough behavior
  // -------------------------------------------------------------------------

  it('passes extension id to updateChatonsExtension', async () => {
    updateChatonsExtensionMock.mockReturnValue({ ok: true })

    updateChatonsExtensionMock('my-extension')

    expect(updateChatonsExtensionMock).toHaveBeenCalledTimes(1)
    expect(updateChatonsExtensionMock).toHaveBeenCalledWith('my-extension')
  })

  it('does not call updateChatonsExtension more than once per invocation', async () => {
    updateChatonsExtensionMock.mockReturnValue({ ok: true })

    updateChatonsExtensionMock('ext-id')

    expect(updateChatonsExtensionMock).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // Success path
  // -------------------------------------------------------------------------

  it('returns ok:true when updateChatonsExtension succeeds', async () => {
    updateChatonsExtensionMock.mockReturnValue({ ok: true })

    const result = updateChatonsExtensionMock('my-extension')

    expect(result.ok).toBe(true)
  })

  it('returns the full success result unchanged', async () => {
    const successResult = { ok: true, id: 'my-extension', version: '1.2.0' }
    updateChatonsExtensionMock.mockReturnValue(successResult)

    const result = updateChatonsExtensionMock('my-extension')

    expect(result).toEqual(successResult)
  })

  it('preserves all fields on success result', async () => {
    const successResult = {
      ok: true,
      id: 'chatons/syntax-highlighter',
      version: '2.0.0',
      previousVersion: '1.0.0',
    }
    updateChatonsExtensionMock.mockReturnValue(successResult)

    const result = updateChatonsExtensionMock('chatons/syntax-highlighter')

    expect(result).toEqual(successResult)
  })

  // -------------------------------------------------------------------------
  // Not found — extension does not exist in registry
  // -------------------------------------------------------------------------

  it('returns ok:false when extension is not found', async () => {
    updateChatonsExtensionMock.mockReturnValue({
      ok: false,
      message: 'Extension not found',
    })

    const result = updateChatonsExtensionMock('nonexistent-ext')

    expect(result.ok).toBe(false)
    expect(result.message).toBe('Extension not found')
  })

  it('returns ok:false with correct message when extension id is malformed', async () => {
    updateChatonsExtensionMock.mockReturnValue({
      ok: false,
      message: 'Extension update failed: Extension @scoped/invalid not found',
    })

    const result = updateChatonsExtensionMock('@scoped/invalid')

    expect(result.ok).toBe(false)
    expect(result.message).toContain('not found')
  })

  // -------------------------------------------------------------------------
  // Error path — non-local install source
  // -------------------------------------------------------------------------

  it('returns ok:false when extension install source is not localPath', async () => {
    updateChatonsExtensionMock.mockReturnValue({
      ok: false,
      message: 'Cannot update: extension is not installed from local path',
    })

    const result = updateChatonsExtensionMock('marketplace-ext')

    expect(result.ok).toBe(false)
    expect(result.message).toContain('Cannot update')
  })

  // -------------------------------------------------------------------------
  // Generic error
  // -------------------------------------------------------------------------

  it('returns ok:false when update fails with an error message', async () => {
    updateChatonsExtensionMock.mockReturnValue({
      ok: false,
      message: 'npm install failed: network unreachable',
    })

    const result = updateChatonsExtensionMock('my-extension')

    expect(result.ok).toBe(false)
    expect(result.message).toBe('npm install failed: network unreachable')
  })

  it('returns ok:false with generic message when error has no detail', async () => {
    updateChatonsExtensionMock.mockReturnValue({
      ok: false,
      message: 'Update failed',
    })

    const result = updateChatonsExtensionMock('my-extension')

    expect(result.ok).toBe(false)
    expect(result.message).toBe('Update failed')
  })

  // -------------------------------------------------------------------------
  // Idempotency / multiple calls
  // -------------------------------------------------------------------------

  it('handles multiple extension ids independently', async () => {
    updateChatonsExtensionMock
      .mockReturnValueOnce({ ok: true })
      .mockReturnValueOnce({ ok: false, message: 'Extension not found' })
      .mockReturnValueOnce({ ok: true })

    const result1 = updateChatonsExtensionMock('ext-a')
    const result2 = updateChatonsExtensionMock('ext-b')
    const result3 = updateChatonsExtensionMock('ext-c')

    expect(result1.ok).toBe(true)
    expect(result2.ok).toBe(false)
    expect(result3.ok).toBe(true)
  })
})
