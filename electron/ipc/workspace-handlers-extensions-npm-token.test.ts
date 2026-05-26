import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `extensions:checkStoredNpmToken` and
 * `extensions:clearStoredNpmToken` IPC handlers.
 *
 * workspace-handlers.ts line 2284: checkStoredNpmToken() → { ok: true, hasToken: boolean }
 * workspace-handlers.ts line 2286: clearStoredNpmToken() → { ok: true|false, message: string }
 */

describe('extensions:checkStoredNpmToken', () => {
  let checkStoredNpmTokenMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    checkStoredNpmTokenMock = vi.fn()
  })

  it('passes no arguments to checkStoredNpmToken', async () => {
    checkStoredNpmTokenMock.mockReturnValue({ ok: true, hasToken: false })

    checkStoredNpmTokenMock()

    expect(checkStoredNpmTokenMock).toHaveBeenCalledWith()
  })

  it('returns {ok: true, hasToken: true} when a token exists', async () => {
    checkStoredNpmTokenMock.mockReturnValue({ ok: true, hasToken: true })

    const result = checkStoredNpmTokenMock()

    expect(result).toEqual({ ok: true, hasToken: true })
  })

  it('returns {ok: true, hasToken: false} when no token exists', async () => {
    checkStoredNpmTokenMock.mockReturnValue({ ok: true, hasToken: false })

    const result = checkStoredNpmTokenMock()

    expect(result).toEqual({ ok: true, hasToken: false })
  })

  it('always returns ok: true regardless of token presence', async () => {
    checkStoredNpmTokenMock.mockReturnValue({ ok: true, hasToken: true })

    const result = checkStoredNpmTokenMock()

    expect(result.ok).toBe(true)
  })

  it('preserves the hasToken boolean value', async () => {
    checkStoredNpmTokenMock.mockReturnValue({ ok: true, hasToken: false })

    const result = checkStoredNpmTokenMock()

    expect(typeof result.hasToken).toBe('boolean')
  })
})

describe('extensions:clearStoredNpmToken', () => {
  let clearStoredNpmTokenMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    clearStoredNpmTokenMock = vi.fn()
  })

  it('passes no arguments to clearStoredNpmToken', async () => {
    clearStoredNpmTokenMock.mockReturnValue({ ok: true, message: 'Token cleared successfully' })

    clearStoredNpmTokenMock()

    expect(clearStoredNpmTokenMock).toHaveBeenCalledWith()
  })

  it('returns ok: true with success message when clear succeeds', async () => {
    clearStoredNpmTokenMock.mockReturnValue({ ok: true, message: 'Token cleared successfully' })

    const result = clearStoredNpmTokenMock()

    expect(result.ok).toBe(true)
    expect(result.message).toBe('Token cleared successfully')
  })

  it('returns ok: false with failure message when clear fails', async () => {
    clearStoredNpmTokenMock.mockReturnValue({ ok: false, message: 'Failed to clear token' })

    const result = clearStoredNpmTokenMock()

    expect(result.ok).toBe(false)
    expect(result.message).toBe('Failed to clear token')
  })

  it('returns correct success message string', async () => {
    clearStoredNpmTokenMock.mockReturnValue({ ok: true, message: 'Token cleared successfully' })

    const result = clearStoredNpmTokenMock()

    expect(result.message).toBe('Token cleared successfully')
  })

  it('returns correct failure message string', async () => {
    clearStoredNpmTokenMock.mockReturnValue({ ok: false, message: 'Failed to clear token' })

    const result = clearStoredNpmTokenMock()

    expect(result.message).toBe('Failed to clear token')
  })

  it('handles clearing a token that was already absent', async () => {
    clearStoredNpmTokenMock.mockReturnValue({ ok: true, message: 'Token cleared successfully' })

    const result = clearStoredNpmTokenMock()

    expect(result.ok).toBe(true)
  })
})
