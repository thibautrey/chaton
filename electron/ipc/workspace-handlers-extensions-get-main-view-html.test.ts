import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `extensions:getMainViewHtml` IPC handler.
 *
 * Handler (workspace-handlers.ts lines 2150–2155):
 * 1. Validates viewId is a non-empty string
 * 2. Delegates to getExtensionMainViewHtml(viewId.trim())
 *
 * We replicate the minimal handler logic inline to test the branching
 * without requiring the full workspace-handlers.ts module (database, IPC,
 * and extension runtime wiring).
 */

type OkResult = { ok: true; html: string; baseUrl: string }
type ErrResult = { ok: false; message: string }
type MainViewResult = OkResult | ErrResult

// Inline minimal handler — mirrors workspace-handlers.ts lines 2150–2155.
function getMainViewHtmlHandler(
  getExtensionMainViewHtml: (viewId: string) => MainViewResult,
  viewId: unknown,
): MainViewResult {
  if (typeof viewId !== 'string' || !viewId.trim()) {
    return { ok: false as const, message: 'viewId is required' }
  }
  return getExtensionMainViewHtml(viewId.trim())
}

function okResult(html = '<html></html>', baseUrl = 'chaton-extension://test/'): OkResult {
  return { ok: true, html, baseUrl }
}

function errResult(message: string): ErrResult {
  return { ok: false, message }
}

// -------------------------------------------------------------------------
// Test suite
// -------------------------------------------------------------------------

describe('extensions:getMainViewHtml handler', () => {
  describe('input validation', () => {
    it('returns error for null viewId', () => {
      const getExtensionMainViewHtml = vi.fn()
      const result = getMainViewHtmlHandler(getExtensionMainViewHtml, null)
      expect(result).toEqual({ ok: false, message: 'viewId is required' })
      expect(getExtensionMainViewHtml).not.toHaveBeenCalled()
    })

    it('returns error for undefined viewId', () => {
      const getExtensionMainViewHtml = vi.fn()
      const result = getMainViewHtmlHandler(getExtensionMainViewHtml, undefined)
      expect(result).toEqual({ ok: false, message: 'viewId is required' })
      expect(getExtensionMainViewHtml).not.toHaveBeenCalled()
    })

    it('returns error for number viewId', () => {
      const getExtensionMainViewHtml = vi.fn()
      const result = getMainViewHtmlHandler(getExtensionMainViewHtml, 42)
      expect(result).toEqual({ ok: false, message: 'viewId is required' })
      expect(getExtensionMainViewHtml).not.toHaveBeenCalled()
    })

    it('returns error for object viewId', () => {
      const getExtensionMainViewHtml = vi.fn()
      const result = getMainViewHtmlHandler(getExtensionMainViewHtml, { id: 'x' })
      expect(result).toEqual({ ok: false, message: 'viewId is required' })
      expect(getExtensionMainViewHtml).not.toHaveBeenCalled()
    })

    it('returns error for empty string viewId', () => {
      const getExtensionMainViewHtml = vi.fn()
      const result = getMainViewHtmlHandler(getExtensionMainViewHtml, '')
      expect(result).toEqual({ ok: false, message: 'viewId is required' })
      expect(getExtensionMainViewHtml).not.toHaveBeenCalled()
    })

    it('returns error for whitespace-only viewId', () => {
      const getExtensionMainViewHtml = vi.fn()
      const result = getMainViewHtmlHandler(getExtensionMainViewHtml, '   \t\n')
      expect(result).toEqual({ ok: false, message: 'viewId is required' })
      expect(getExtensionMainViewHtml).not.toHaveBeenCalled()
    })
  })

  describe('delegation to getExtensionMainViewHtml', () => {
    it('trims whitespace from viewId before delegation', () => {
      const getExtensionMainViewHtml = vi.fn<[string], MainViewResult>()
        .mockReturnValue(okResult())
      const result = getMainViewHtmlHandler(getExtensionMainViewHtml, '  my-view  ')
      expect(getExtensionMainViewHtml).toHaveBeenCalledOnce()
      expect(getExtensionMainViewHtml).toHaveBeenCalledWith('my-view')
      expect(result).toEqual(okResult())
    })

    it('passes through ok result unchanged', () => {
      const getExtensionMainViewHtml = vi.fn<[string], MainViewResult>()
        .mockReturnValue(okResult('<body>hello</body>', 'chaton-extension://my-ext/'))
      const result = getMainViewHtmlHandler(getExtensionMainViewHtml, 'my-view')
      expect(result).toEqual({
        ok: true,
        html: '<body>hello</body>',
        baseUrl: 'chaton-extension://my-ext/',
      })
    })

    it('passes through error result unchanged', () => {
      const getExtensionMainViewHtml = vi.fn<[string], MainViewResult>()
        .mockReturnValue(errResult('main view not found: my-view'))
      const result = getMainViewHtmlHandler(getExtensionMainViewHtml, 'my-view')
      expect(result).toEqual({ ok: false, message: 'main view not found: my-view' })
    })

    it('passes through unsupported webviewUrl error', () => {
      const getExtensionMainViewHtml = vi.fn<[string], MainViewResult>()
        .mockReturnValue(errResult('unsupported webviewUrl: https://evil.com'))
      const result = getMainViewHtmlHandler(getExtensionMainViewHtml, 'my-view')
      expect(result).toEqual({ ok: false, message: 'unsupported webviewUrl: https://evil.com' })
    })

    it('passes through view file not found error', () => {
      const getExtensionMainViewHtml = vi.fn<[string], MainViewResult>()
        .mockReturnValue(errResult('view file not found: /some/path/index.html'))
      const result = getMainViewHtmlHandler(getExtensionMainViewHtml, 'my-view')
      expect(result).toEqual({ ok: false, message: 'view file not found: /some/path/index.html' })
    })
  })

  describe('type safety of return shape', () => {
    it('returns {ok: true} for valid view with html', () => {
      const getExtensionMainViewHtml = vi.fn<[string], MainViewResult>()
        .mockReturnValue(okResult('<html><body>test</body></html>', 'chaton-extension://ext/views/'))
      const result = getMainViewHtmlHandler(getExtensionMainViewHtml, 'valid-view')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.html).toBe('<html><body>test</body></html>')
        expect(result.baseUrl).toBe('chaton-extension://ext/views/')
      }
    })

    it('returns {ok: false, message: string} for invalid viewId', () => {
      const getExtensionMainViewHtml = vi.fn()
      const result = getMainViewHtmlHandler(getExtensionMainViewHtml, '')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(typeof result.message).toBe('string')
        expect(result.message).toBe('viewId is required')
      }
    })

    it('returns {ok: false, message: string} when getExtensionMainViewHtml fails', () => {
      const getExtensionMainViewHtml = vi.fn<[string], MainViewResult>()
        .mockReturnValue(errResult('view not found: unknown'))
      const result = getMainViewHtmlHandler(getExtensionMainViewHtml, 'unknown')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(typeof result.message).toBe('string')
      }
    })
  })
})
