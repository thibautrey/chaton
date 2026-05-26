import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `extensions:publish` IPC handler.
 *
 * The handler (workspace-handlers.ts):
 *   1. Validates that id is a non-empty string (trimmed)
 *   2. Wraps publishChatonsExtension in try/catch to prevent unhandled IPC rejections
 *   3. Returns {ok: false} for validation failures without calling publishChatonsExtension
 */

/**
 * Inline handler mirroring workspace-handlers.ts for extensions:publish.
 * Tests the validation guard and try/catch wrapper in isolation.
 */
function handleExtensionsPublish(params: {
  publishChatonsExtension: (id: string, npmToken?: string) => { ok: boolean; message?: string }
}, id: unknown, npmToken?: string): { ok: boolean; message?: string } {
  if (typeof id !== "string" || !id.trim()) {
    return { ok: false, message: "extension id is required" };
  }
  const trimmedId = id.trim();
  try {
    return params.publishChatonsExtension(trimmedId, npmToken);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

describe('extensions:publish — handler validation', () => {
  let publishChatonsExtensionMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    publishChatonsExtensionMock = vi.fn()
  })

  // -------------------------------------------------------------------------
  // id parameter validation
  // -------------------------------------------------------------------------

  describe('id parameter validation', () => {
    const invalidIds = [
      { id: undefined, reason: 'undefined' },
      { id: null, reason: 'null' },
      { id: 42, reason: 'number' },
      { id: true, reason: 'boolean true' },
      { id: false, reason: 'boolean false' },
      { id: {}, reason: 'plain object' },
      { id: [], reason: 'array' },
      { id: () => {}, reason: 'function' },
      { id: '', reason: 'empty string' },
      { id: '   ', reason: 'whitespace-only string' },
    ]

    for (const { id, reason } of invalidIds) {
      it(`rejects ${reason} and returns {{ok:false}} without calling publishChatonsExtension`, () => {
        const result = handleExtensionsPublish(
          { publishChatonsExtension: publishChatonsExtensionMock },
          id,
        )
        expect(result).toEqual({ ok: false, message: "extension id is required" })
        expect(publishChatonsExtensionMock).not.toHaveBeenCalled()
      })
    }

    it('accepts a valid non-empty string id', () => {
      publishChatonsExtensionMock.mockReturnValue({ ok: true })
      const result = handleExtensionsPublish(
        { publishChatonsExtension: publishChatonsExtensionMock },
        '@alice/chatons-test',
      )
      expect(result).toEqual({ ok: true })
      expect(publishChatonsExtensionMock).toHaveBeenCalledOnce()
      expect(publishChatonsExtensionMock).toHaveBeenCalledWith('@alice/chatons-test', undefined)
    })

    it('trims whitespace from valid ids before delegation', () => {
      publishChatonsExtensionMock.mockReturnValue({ ok: true })
      handleExtensionsPublish(
        { publishChatonsExtension: publishChatonsExtensionMock },
        '  @alice/chatons-test  ',
        'my-token',
      )
      expect(publishChatonsExtensionMock).toHaveBeenCalledWith('@alice/chatons-test', 'my-token')
    })
  })

  // -------------------------------------------------------------------------
  // try/catch wrapper
  // -------------------------------------------------------------------------

  describe('try/catch wrapper', () => {
    it('returns {ok:false} with error message when publishChatonsExtension throws', () => {
      publishChatonsExtensionMock.mockImplementation(() => {
        throw new Error('Disk full: cannot write manifest')
      })
      const result = handleExtensionsPublish(
        { publishChatonsExtension: publishChatonsExtensionMock },
        '@alice/chatons-test',
      )
      expect(result).toEqual({ ok: false, message: 'Disk full: cannot write manifest' })
    })

    it('returns {ok:false} with string error when publishChatonsExtension throws non-Error', () => {
      publishChatonsExtensionMock.mockImplementation(() => {
        throw 'Something went wrong'
      })
      const result = handleExtensionsPublish(
        { publishChatonsExtension: publishChatonsExtensionMock },
        '@alice/chatons-test',
      )
      expect(result).toEqual({ ok: false, message: 'Something went wrong' })
    })

    it('passes through {ok:true} when publishChatonsExtension succeeds', () => {
      publishChatonsExtensionMock.mockReturnValue({ ok: true })
      const result = handleExtensionsPublish(
        { publishChatonsExtension: publishChatonsExtensionMock },
        '@alice/chatons-test',
      )
      expect(result).toEqual({ ok: true })
    })

    it('passes through {ok:false} when publishChatonsExtension returns an error result', () => {
      publishChatonsExtensionMock.mockReturnValue({ ok: false, message: 'npm not found' })
      const result = handleExtensionsPublish(
        { publishChatonsExtension: publishChatonsExtensionMock },
        '@alice/chatons-test',
      )
      expect(result).toEqual({ ok: false, message: 'npm not found' })
    })

    it('validates id before attempting publishChatonsExtension (throws path)', () => {
      // If id is invalid, publishChatonsExtension should NOT be called even though
      // it would throw — the validation guard short-circuits first.
      publishChatonsExtensionMock.mockImplementation(() => {
        throw new Error('Should not reach here')
      })
      const result = handleExtensionsPublish(
        { publishChatonsExtension: publishChatonsExtensionMock },
        '',
      )
      expect(result).toEqual({ ok: false, message: "extension id is required" })
      expect(publishChatonsExtensionMock).not.toHaveBeenCalled()
    })
  })
})
