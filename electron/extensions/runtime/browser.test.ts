import { beforeEach, describe, expect, it, vi } from 'vitest'

type MockWindow = {
  webContents: {
    executeJavaScript: ReturnType<typeof vi.fn>
    setUserAgent: ReturnType<typeof vi.fn>
    getURL: ReturnType<typeof vi.fn>
    getTitle?: ReturnType<typeof vi.fn>
    navigationHistory: {
      canGoBack: ReturnType<typeof vi.fn>
      canGoForward: ReturnType<typeof vi.fn>
      goBack: ReturnType<typeof vi.fn>
      goForward: ReturnType<typeof vi.fn>
    }
    reload: ReturnType<typeof vi.fn>
    once: ReturnType<typeof vi.fn>
    removeListener: ReturnType<typeof vi.fn>
  }
  loadURL: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  getTitle: ReturnType<typeof vi.fn>
}

const browserWindows: MockWindow[] = []
const BrowserWindowMock = vi.fn(function BrowserWindow(options: Record<string, unknown>) {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const window: MockWindow = {
    webContents: {
      executeJavaScript: vi.fn(async () => ({ ok: true })),
      setUserAgent: vi.fn(),
      getURL: vi.fn(() => 'https://example.com/'),
      navigationHistory: {
        canGoBack: vi.fn(() => false),
        canGoForward: vi.fn(() => false),
        goBack: vi.fn(),
        goForward: vi.fn(),
      },
      reload: vi.fn(),
      once: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        listeners.set(event, listener)
      }),
      removeListener: vi.fn((event: string) => {
        listeners.delete(event)
      }),
    },
    loadURL: vi.fn(async () => {
      listeners.get('did-finish-load')?.()
    }),
    on: vi.fn(),
    destroy: vi.fn(),
    getTitle: vi.fn(() => 'Example'),
  }
  browserWindows.push(window)
  return window
})

vi.mock('electron', () => ({
  default: { BrowserWindow: BrowserWindowMock },
  BrowserWindow: BrowserWindowMock,
}))

async function openValidSession() {
  const { browserOpen } = await import('./browser.js')
  const result = await browserOpen({ url: 'https://example.com/' })
  expect(result.ok).toBe(true)
  const data = result.data as { sessionId: string }
  return data.sessionId
}

describe('browser runtime validation', () => {
  beforeEach(async () => {
    const browser = await import('./browser.js')
    browser.closeAllBrowserSessions()
    BrowserWindowMock.mockClear()
    browserWindows.length = 0
  })

  it('rejects malformed browser.open dimensions before creating a window', async () => {
    const { browserOpen } = await import('./browser.js')

    await expect(browserOpen({ url: 'https://example.com/', width: 3841 })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_args' },
    })
    await expect(browserOpen({ url: 'https://example.com/', height: 239 })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_args' },
    })
    await expect(browserOpen({ url: 'https://example.com/', width: 1024.5 })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_args' },
    })

    expect(BrowserWindowMock).not.toHaveBeenCalled()
  })

  it('passes valid browser.open dimensions to Electron without clamping', async () => {
    const { browserOpen } = await import('./browser.js')

    const result = await browserOpen({ url: 'https://example.com/', width: 3840, height: 2160 })

    expect(result.ok).toBe(true)
    expect(BrowserWindowMock).toHaveBeenCalledWith(expect.objectContaining({ width: 3840, height: 2160 }))
  })

  it('rejects oversized browser.open user agents before creating a window', async () => {
    const { browserOpen } = await import('./browser.js')

    await expect(browserOpen({ url: 'https://example.com/', userAgent: 'x'.repeat(513) })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_args' },
    })

    expect(BrowserWindowMock).not.toHaveBeenCalled()
  })

  it('rejects malformed navigation payloads before session lookup semantics', async () => {
    const { browserBack, browserClose, browserForward, browserReload } = await import('./browser.js')

    await expect(browserBack(null)).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_args' },
    })
    await expect(browserForward('session-1')).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_args' },
    })
    await expect(browserReload([])).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_args' },
    })
    expect(browserClose(null)).toMatchObject({
      ok: false,
      error: { code: 'invalid_args' },
    })
  })

  it('rejects malformed browser.click timeouts before executing page JavaScript', async () => {
    const sessionId = await openValidSession()
    const window = browserWindows[0]
    const { browserClick } = await import('./browser.js')
    window.webContents.executeJavaScript.mockClear()

    await expect(browserClick({ sessionId, selector: 'button', timeoutMs: 30_001 })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_args' },
    })
    await expect(browserClick({ sessionId, selector: 'button', timeoutMs: 1.5 })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_args' },
    })

    expect(window.webContents.executeJavaScript).not.toHaveBeenCalled()
  })

  it('rejects oversized browser.click selectors before executing page JavaScript', async () => {
    const sessionId = await openValidSession()
    const window = browserWindows[0]
    const { browserClick } = await import('./browser.js')
    window.webContents.executeJavaScript.mockClear()

    await expect(browserClick({ sessionId, selector: '.'.repeat(2001) })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_args' },
    })

    expect(window.webContents.executeJavaScript).not.toHaveBeenCalled()
  })

  it('returns controlled errors for invalid browser.click selectors from the page', async () => {
    const sessionId = await openValidSession()
    const window = browserWindows[0]
    const { browserClick } = await import('./browser.js')
    window.webContents.executeJavaScript.mockResolvedValueOnce({ ok: false, message: 'invalid selector: [' })

    const result = await browserClick({ sessionId, selector: '[' })

    expect(result).toMatchObject({ ok: false, error: { code: 'not_found', message: 'invalid selector: [' } })
  })

  it('rejects oversized browser.type text before executing page JavaScript', async () => {
    const sessionId = await openValidSession()
    const window = browserWindows[0]
    const { browserType } = await import('./browser.js')
    window.webContents.executeJavaScript.mockClear()

    await expect(browserType({ sessionId, selector: 'input', text: 'x'.repeat(65_537) })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_args' },
    })

    expect(window.webContents.executeJavaScript).not.toHaveBeenCalled()
  })

  it('rejects oversized browser.press keys before executing page JavaScript', async () => {
    const sessionId = await openValidSession()
    const window = browserWindows[0]
    const { browserPress } = await import('./browser.js')
    window.webContents.executeJavaScript.mockClear()

    await expect(browserPress({ sessionId, key: 'x'.repeat(65) })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_args' },
    })

    expect(window.webContents.executeJavaScript).not.toHaveBeenCalled()
  })

  it('rejects malformed browser.wait timeouts before waiting or executing page JavaScript', async () => {
    const sessionId = await openValidSession()
    const window = browserWindows[0]
    const { browserWait } = await import('./browser.js')
    window.webContents.executeJavaScript.mockClear()

    await expect(browserWait({ sessionId, selector: '.ready', timeoutMs: Number.POSITIVE_INFINITY })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_args' },
    })
    await expect(browserWait({ sessionId, timeoutMs: -1 })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_args' },
    })

    expect(window.webContents.executeJavaScript).not.toHaveBeenCalled()
  })

  it('rejects oversized browser.wait text before executing page JavaScript', async () => {
    const sessionId = await openValidSession()
    const window = browserWindows[0]
    const { browserWait } = await import('./browser.js')
    window.webContents.executeJavaScript.mockClear()

    await expect(browserWait({ sessionId, text: 'x'.repeat(2001) })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_args' },
    })

    expect(window.webContents.executeJavaScript).not.toHaveBeenCalled()
  })

  it('rejects malformed browser.snapshot maxItems before executing page JavaScript', async () => {
    const sessionId = await openValidSession()
    const window = browserWindows[0]
    const { browserSnapshot } = await import('./browser.js')
    window.webContents.executeJavaScript.mockClear()

    await expect(browserSnapshot({ sessionId, maxItems: 201 })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_args' },
    })
    await expect(browserSnapshot({ sessionId, maxItems: 2.5 })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_args' },
    })

    expect(window.webContents.executeJavaScript).not.toHaveBeenCalled()
  })
})
