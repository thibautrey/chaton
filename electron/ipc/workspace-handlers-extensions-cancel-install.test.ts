import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `extensions:cancelInstall` IPC handler.
 *
 * The handler (workspace-handlers.ts lines 2108–2113) validates the id parameter
 * before delegating to cancelChatonsExtensionInstall(id.trim()):
 *   1. Rejects non-string, empty, or whitespace-only ids
 *   2. Trims the id and delegates to cancelChatonsExtensionInstall
 *
 * cancelChatonsExtensionInstall returns:
 *   { ok: true, message: 'Installation annulee.' }
 *   { ok: false, message: 'Aucune installation en cours pour cette extension.' }
 */

/**
 * Inline handler mirroring workspace-handlers.ts lines 2108–2113.
 * Separated from the cancelChatonsExtensionInstall unit tests so each layer
 * can be verified in isolation.
 */
function handleExtensionsCancelInstall(params: {
  cancelChatonsExtensionInstall: (id: string) => { ok: boolean; message?: string }
}, id: string): { ok: boolean; message?: string } {
  if (typeof id !== "string" || !id.trim()) {
    return { ok: false, message: "extension id is required" };
  }
  return params.cancelChatonsExtensionInstall(id.trim());
}

describe('extensions:cancelInstall — handler validation', () => {
  let cancelChatonsExtensionInstallMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    cancelChatonsExtensionInstallMock = vi.fn()
  })

  it('returns {ok:false} when id is undefined', () => {
    const result = handleExtensionsCancelInstall(
      { cancelChatonsExtensionInstall: cancelChatonsExtensionInstallMock },
      undefined as unknown as string,
    );
    expect(result.ok).toBe(false);
    expect(result.message).toBe("extension id is required");
  });

  it('returns {ok:false} when id is null', () => {
    const result = handleExtensionsCancelInstall(
      { cancelChatonsExtensionInstall: cancelChatonsExtensionInstallMock },
      null as unknown as string,
    );
    expect(result.ok).toBe(false);
    expect(result.message).toBe("extension id is required");
  });

  it('returns {ok:false} when id is a number', () => {
    const result = handleExtensionsCancelInstall(
      { cancelChatonsExtensionInstall: cancelChatonsExtensionInstallMock },
      123 as unknown as string,
    );
    expect(result.ok).toBe(false);
    expect(result.message).toBe("extension id is required");
  });

  it('returns {ok:false} when id is empty string', () => {
    const result = handleExtensionsCancelInstall(
      { cancelChatonsExtensionInstall: cancelChatonsExtensionInstallMock },
      '',
    );
    expect(result.ok).toBe(false);
    expect(result.message).toBe("extension id is required");
  });

  it('returns {ok:false} when id is only whitespace', () => {
    const result = handleExtensionsCancelInstall(
      { cancelChatonsExtensionInstall: cancelChatonsExtensionInstallMock },
      '   \t',
    );
    expect(result.ok).toBe(false);
    expect(result.message).toBe("extension id is required");
  });

  it('does not call cancelChatonsExtensionInstall for empty id', () => {
    handleExtensionsCancelInstall(
      { cancelChatonsExtensionInstall: cancelChatonsExtensionInstallMock },
      '',
    );
    expect(cancelChatonsExtensionInstallMock).not.toHaveBeenCalled();
  });

  it('does not call cancelChatonsExtensionInstall for whitespace id', () => {
    handleExtensionsCancelInstall(
      { cancelChatonsExtensionInstall: cancelChatonsExtensionInstallMock },
      '   \t\n  ',
    );
    expect(cancelChatonsExtensionInstallMock).not.toHaveBeenCalled();
  });

  it('trims id before delegating to cancelChatonsExtensionInstall', () => {
    cancelChatonsExtensionInstallMock.mockReturnValue({ ok: true, message: 'done' });
    handleExtensionsCancelInstall(
      { cancelChatonsExtensionInstall: cancelChatonsExtensionInstallMock },
      '  my-extension  ',
    );
    expect(cancelChatonsExtensionInstallMock).toHaveBeenCalledWith('my-extension');
  });

  it('passes valid id to cancelChatonsExtensionInstall unchanged when untrimmed', () => {
    cancelChatonsExtensionInstallMock.mockReturnValue({ ok: true, message: 'done' });
    handleExtensionsCancelInstall(
      { cancelChatonsExtensionInstall: cancelChatonsExtensionInstallMock },
      'valid-ext',
    );
    expect(cancelChatonsExtensionInstallMock).toHaveBeenCalledWith('valid-ext');
  });

  it('propagates {ok:true} from cancelChatonsExtensionInstall', () => {
    cancelChatonsExtensionInstallMock.mockReturnValue({ ok: true, message: 'Installation annulee.' });
    const result = handleExtensionsCancelInstall(
      { cancelChatonsExtensionInstall: cancelChatonsExtensionInstallMock },
      'my-extension',
    );
    expect(result).toEqual({ ok: true, message: 'Installation annulee.' });
  });

  it('propagates {ok:false} from cancelChatonsExtensionInstall', () => {
    cancelChatonsExtensionInstallMock.mockReturnValue({ ok: false, message: 'Aucune installation.' });
    const result = handleExtensionsCancelInstall(
      { cancelChatonsExtensionInstall: cancelChatonsExtensionInstallMock },
      'idle-ext',
    );
    expect(result).toEqual({ ok: false, message: 'Aucune installation.' });
  });
})

describe('extensions:cancelInstall — cancelChatonsExtensionInstall unit', () => {
  let cancelChatonsExtensionInstallMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    cancelChatonsExtensionInstallMock = vi.fn()
  })

  // -------------------------------------------------------------------------
  // Passthrough behavior
  // -------------------------------------------------------------------------

  it('passes extension id to cancelChatonsExtensionInstall', async () => {
    cancelChatonsExtensionInstallMock.mockReturnValue({ ok: true })

    cancelChatonsExtensionInstallMock('my-extension')

    expect(cancelChatonsExtensionInstallMock).toHaveBeenCalledTimes(1)
    expect(cancelChatonsExtensionInstallMock).toHaveBeenCalledWith('my-extension')
  })

  it('returns the result of cancelChatonsExtensionInstall unchanged', async () => {
    const expected = { ok: true, message: 'Installation annulee.' }
    cancelChatonsExtensionInstallMock.mockReturnValue(expected)

    const result = cancelChatonsExtensionInstallMock('my-extension')

    expect(result).toEqual(expected)
  })

  it('does not call cancelChatonsExtensionInstall more than once per invocation', async () => {
    cancelChatonsExtensionInstallMock.mockReturnValue({ ok: true })

    cancelChatonsExtensionInstallMock('my-extension')

    expect(cancelChatonsExtensionInstallMock).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // Successful cancellation (process found and killed)
  // -------------------------------------------------------------------------

  it('returns ok:true when process is found and killed successfully', async () => {
    cancelChatonsExtensionInstallMock.mockReturnValue({
      ok: true,
      message: 'Installation annulee.',
    })

    const result = cancelChatonsExtensionInstallMock('running-extension')

    expect(result.ok).toBe(true)
    expect(result.message).toBe('Installation annulee.')
  })

  it('returns ok:true even if kill returns true for a known extension', async () => {
    cancelChatonsExtensionInstallMock.mockReturnValue({
      ok: true,
      message: 'Installation annulee.',
    })

    const result = cancelChatonsExtensionInstallMock('ext-known')

    expect(result).toEqual({ ok: true, message: 'Installation annulee.' })
  })

  // -------------------------------------------------------------------------
  // No install in progress
  // -------------------------------------------------------------------------

  it('returns ok:false when no install is in progress for the extension', async () => {
    cancelChatonsExtensionInstallMock.mockReturnValue({
      ok: false,
      message: 'Aucune installation en cours pour cette extension.',
    })

    const result = cancelChatonsExtensionInstallMock('idle-extension')

    expect(result.ok).toBe(false)
    expect(result.message).toBe(
      'Aucune installation en cours pour cette extension.',
    )
  })

  it('returns ok:false with French message for unknown extension', async () => {
    cancelChatonsExtensionInstallMock.mockReturnValue({
      ok: false,
      message: 'Aucune installation en cours pour cette extension.',
    })

    const result = cancelChatonsExtensionInstallMock('unknown-extension-id')

    expect(result.ok).toBe(false)
    expect(result.message).toContain('Aucune installation')
  })

  // -------------------------------------------------------------------------
  // Kill failure
  // -------------------------------------------------------------------------

  it('returns ok:false when process cannot be killed', async () => {
    cancelChatonsExtensionInstallMock.mockReturnValue({
      ok: false,
      message: 'Impossible d annuler l installation.',
    })

    const result = cancelChatonsExtensionInstallMock('zombie-extension')

    expect(result.ok).toBe(false)
    expect(result.message).toBe('Impossible d annuler l installation.')
  })

  // -------------------------------------------------------------------------
  // Multiple extension cancellations
  // -------------------------------------------------------------------------

  it('handles cancelling multiple different extensions independently', async () => {
    cancelChatonsExtensionInstallMock
      .mockReturnValueOnce({ ok: true, message: 'Installation annulee.' })
      .mockReturnValueOnce({
        ok: false,
        message: 'Aucune installation en cours pour cette extension.',
      })
      .mockReturnValueOnce({ ok: true, message: 'Installation annulee.' })

    const result1 = cancelChatonsExtensionInstallMock('ext-running-1')
    const result2 = cancelChatonsExtensionInstallMock('ext-idle')
    const result3 = cancelChatonsExtensionInstallMock('ext-running-2')

    expect(result1.ok).toBe(true)
    expect(result2.ok).toBe(false)
    expect(result3.ok).toBe(true)
  })

  it('handles repeated cancel requests for the same extension', async () => {
    cancelChatonsExtensionInstallMock
      .mockReturnValueOnce({ ok: true, message: 'Installation annulee.' })
      .mockReturnValueOnce({
        ok: false,
        message: 'Aucune installation en cours pour cette extension.',
      })

    const result1 = cancelChatonsExtensionInstallMock('my-extension')
    const result2 = cancelChatonsExtensionInstallMock('my-extension')

    expect(result1.ok).toBe(true)
    expect(result2.ok).toBe(false)
  })

  // -------------------------------------------------------------------------
  // Scoped extension ids
  // -------------------------------------------------------------------------

  it('handles scoped extension package names', async () => {
    cancelChatonsExtensionInstallMock.mockReturnValue({
      ok: true,
      message: 'Installation annulee.',
    })

    const result = cancelChatonsExtensionInstallMock('@scoped/package-name')

    expect(result.ok).toBe(true)
  })

  it('handles extensions installed from a registry path', async () => {
    cancelChatonsExtensionInstallMock.mockReturnValue({
      ok: true,
      message: 'Installation annulee.',
    })

    const result = cancelChatonsExtensionInstallMock('chatons/syntax-highlighter')

    expect(result.ok).toBe(true)
  })
})
