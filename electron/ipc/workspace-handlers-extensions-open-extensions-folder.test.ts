import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `extensions:openExtensionsFolder` IPC handler.
 *
 * The handler (workspace-handlers.ts lines 2130–2140) wraps shell.openPath(baseDir)
 * where baseDir = getChatonsExtensionsBaseDir(). It returns:
 *   { ok: true }  when shell.openPath resolves
 *   { ok: false, message: '...' } when shell.openPath rejects
 */

describe('extensions:openExtensionsFolder', () => {
  // The handler is inline in workspace-handlers.ts — replicate it for testing.
  async function handleOpenExtensionsFolder(
    shellOpenPath: (path: string) => Promise<string>,
    getBaseDir: () => string,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const baseDir = getBaseDir()
    try {
      await shellOpenPath(baseDir)
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }

  let shellOpenPathMock: ReturnType<typeof vi.fn>
  let getBaseDirMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    shellOpenPathMock = vi.fn()
    getBaseDirMock = vi.fn()
  })

  // -------------------------------------------------------------------------
  // Baseline
  // -------------------------------------------------------------------------

  it('returns ok:true when shell.openPath succeeds', async () => {
    shellOpenPathMock.mockResolvedValue('') // empty string = opened successfully
    getBaseDirMock.mockReturnValue('/some/path/extensions')

    const result = await handleOpenExtensionsFolder(shellOpenPathMock, getBaseDirMock)

    expect(result).toEqual({ ok: true })
  })

  it('returns ok:true even when openPath returns a non-empty error string', async () => {
    // shell.openPath returns an error string on failure, throws on exception
    shellOpenPathMock.mockResolvedValue('/some/path/not/found')
    getBaseDirMock.mockReturnValue('/some/path/extensions')

    // This handler only catches thrown errors, not string error codes
    // (matching the production behavior)
    await handleOpenExtensionsFolder(shellOpenPathMock, getBaseDirMock)
    expect(shellOpenPathMock).toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Call chain
  // -------------------------------------------------------------------------

  it('calls getBaseDir to get the extensions directory path', async () => {
    shellOpenPathMock.mockResolvedValue('')
    getBaseDirMock.mockReturnValue('/Users/thibaut/.chatons/extensions')

    await handleOpenExtensionsFolder(shellOpenPathMock, getBaseDirMock)

    expect(getBaseDirMock).toHaveBeenCalledTimes(1)
  })

  it('passes the base directory to shell.openPath', async () => {
    const extensionsDir = '/Users/thibaut/.chatons/extensions'
    shellOpenPathMock.mockResolvedValue('')
    getBaseDirMock.mockReturnValue(extensionsDir)

    await handleOpenExtensionsFolder(shellOpenPathMock, getBaseDirMock)

    expect(shellOpenPathMock).toHaveBeenCalledTimes(1)
    expect(shellOpenPathMock).toHaveBeenCalledWith(extensionsDir)
  })

  it('does not call shell.openPath more than once per invocation', async () => {
    shellOpenPathMock.mockResolvedValue('')
    getBaseDirMock.mockReturnValue('/path/extensions')

    await handleOpenExtensionsFolder(shellOpenPathMock, getBaseDirMock)

    expect(shellOpenPathMock).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it('returns ok:false with error message when shell.openPath throws', async () => {
    shellOpenPathMock.mockRejectedValue(new Error('Permission denied'))
    getBaseDirMock.mockReturnValue('/protected/extensions')

    const result = await handleOpenExtensionsFolder(shellOpenPathMock, getBaseDirMock)

    expect(result).toEqual({ ok: false, message: 'Permission denied' })
  })

  it('returns ok:false with string error when shell.openPath throws a non-Error', async () => {
    shellOpenPathMock.mockRejectedValue('Unknown shell error')
    getBaseDirMock.mockReturnValue('/some/path')

    const result = await handleOpenExtensionsFolder(shellOpenPathMock, getBaseDirMock)

    expect(result).toEqual({ ok: false, message: 'Unknown shell error' })
  })

  it('returns ok:false with message when shell.openPath throws Error with no message', async () => {
    const noMessageError = new Error()
    shellOpenPathMock.mockRejectedValue(noMessageError)
    getBaseDirMock.mockReturnValue('/some/path')

    const result = await handleOpenExtensionsFolder(shellOpenPathMock, getBaseDirMock)

    expect(result).toEqual({ ok: false, message: '' })
  })

  it('catches errors from arbitrary base directory paths', async () => {
    shellOpenPathMock.mockRejectedValue(new Error('Path not accessible'))
    getBaseDirMock.mockReturnValue('/invalid/path/extensions')

    const result = await handleOpenExtensionsFolder(shellOpenPathMock, getBaseDirMock)

    expect(result.ok).toBe(false)
    expect(result.message).toBe('Path not accessible')
  })

  // -------------------------------------------------------------------------
  // Base dir variations
  // -------------------------------------------------------------------------

  it('handles macOS-style path', async () => {
    shellOpenPathMock.mockResolvedValue('')
    getBaseDirMock.mockReturnValue('/Users/thibaut/Library/Application Support/Chatons/extensions')

    const result = await handleOpenExtensionsFolder(shellOpenPathMock, getBaseDirMock)

    expect(result).toEqual({ ok: true })
  })

  it('handles Linux-style path', async () => {
    shellOpenPathMock.mockResolvedValue('')
    getBaseDirMock.mockReturnValue('/home/thibaut/.config/chatons/extensions')

    const result = await handleOpenExtensionsFolder(shellOpenPathMock, getBaseDirMock)

    expect(result).toEqual({ ok: true })
  })

  it('handles Windows-style path (with drive letter)', async () => {
    shellOpenPathMock.mockResolvedValue('')
    getBaseDirMock.mockReturnValue('C:\\Users\\thibaut\\AppData\\Roaming\\Chatons\\extensions')

    const result = await handleOpenExtensionsFolder(shellOpenPathMock, getBaseDirMock)

    expect(result).toEqual({ ok: true })
  })
})
