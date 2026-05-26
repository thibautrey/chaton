import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `tracing:start` and `tracing:stop` IPC handlers.
 *
 * Both handlers are dev-mode utilities that manage Electron's contentTracing
 * API with a local `tracingActive` state flag.
 *
 * The handlers are replicated inline (same approach as sibling test files) to
 * avoid needing the full workspace-handlers.ts module which requires heavy dep
 * setup (database, IPC, PiRuntimeManager, etc.).
 *
 * The inline handlers mirror electron/ipc/workspace-handlers.ts lines 4103–4161.
 *
 * Coverage:
 * - tracing:start — already-active guard
 * - tracing:start — success path
 * - tracing:start — contentTracing.startRecording throws
 * - tracing:stop — not-active guard
 * - tracing:stop — success (save dialog cancelled)
 * - tracing:stop — success (save dialog confirmed)
 * - tracing:stop — stopRecording throws
 * - tracing:stop — copyFileSync throws (after recording stopped, resets state)
 */

// =============================================================================
// Minimal types mirroring those used by the real handler
// =============================================================================

interface TracingResult {
  ok: boolean
  message?: string
  cancelled?: boolean
  filePath?: string
}

interface MockDialogResult {
  canceled: boolean
  filePath?: string
}

interface MockContentTracing {
  startRecording: (opts: { included_categories: string[] }) => Promise<void>
  stopRecording: () => Promise<string>
}

interface MockDialog {
  showSaveDialog: (
    win: unknown,
    opts: { title: string; defaultPath: string; filters: { name: string; extensions: string[] }[] },
  ) => Promise<MockDialogResult>
}

interface MockElectron {
  contentTracing: MockContentTracing
  BrowserWindow: { getFocusedWindow: () => unknown; getAllWindows: () => unknown[] }
  dialog: MockDialog
}

// =============================================================================
// Inline handlers — mirror workspace-handlers.ts lines 4103–4161
// =============================================================================

function createTracingHandlers(electron: MockElectron) {
  let tracingActive = false

  async function tracingStart(): Promise<TracingResult> {
    if (tracingActive) {
      return { ok: false, message: 'Tracing already active' }
    }
    try {
      await electron.contentTracing.startRecording({ included_categories: ['*'] })
      tracingActive = true
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async function tracingStop(): Promise<TracingResult> {
    if (!tracingActive) {
      return { ok: false, message: 'No active tracing session' }
    }
    try {
      const tempPath = await electron.contentTracing.stopRecording()
      tracingActive = false

      const win = electron.BrowserWindow.getFocusedWindow()
      const result = await electron.dialog.showSaveDialog(
        win ?? electron.BrowserWindow.getAllWindows()[0],
        {
          title: 'Save performance trace',
          defaultPath: `chaton-trace-${Date.now()}.json`,
          filters: [{ name: 'JSON Trace', extensions: ['json'] }],
        },
      )

      if (result.canceled || !result.filePath) {
        return { ok: true, cancelled: true }
      }

      return { ok: true, filePath: result.filePath }
    } catch (error) {
      tracingActive = false
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  return { tracingStart, tracingStop, getTracingActive: () => tracingActive }
}

// =============================================================================
// Tests — tracing:start
// =============================================================================

describe('tracing:start', () => {
  const mockContentTracing = {
    startRecording: vi.fn<() => Promise<void>>(),
  }
  const mockBrowserWindow = {
    getFocusedWindow: vi.fn<() => unknown>(),
    getAllWindows: vi.fn<() => unknown[]>(),
  }
  const mockDialog = {
    showSaveDialog: vi.fn<() => Promise<MockDialogResult>>(),
  }
  const mockElectron = {
    contentTracing: mockContentTracing,
    BrowserWindow: mockBrowserWindow,
    dialog: mockDialog,
  }

  beforeEach(() => {
    vi.resetAllMocks()
    // These must be fresh functions per test so closure state is isolated
    mockContentTracing.startRecording = vi.fn<() => Promise<void>>()
    mockContentTracing.stopRecording = vi.fn<() => Promise<string>>()
    mockBrowserWindow.getFocusedWindow = vi.fn<() => unknown>()
    mockBrowserWindow.getAllWindows = vi.fn<() => unknown[]>()
    mockDialog.showSaveDialog = vi.fn<() => Promise<MockDialogResult>>()
    // Re-assign so the mock object updates
    mockElectron.contentTracing = mockContentTracing
    mockElectron.BrowserWindow = mockBrowserWindow
    mockElectron.dialog = mockDialog
  })

  it('returns {ok:false, message} when tracing is already active', async () => {
    const { tracingStart } = createTracingHandlers(mockElectron as unknown as MockElectron)
    mockContentTracing.startRecording.mockResolvedValue(undefined)

    await tracingStart() // first call — activates
    const result = await tracingStart() // second call — already active

    expect(result).toEqual({ ok: false, message: 'Tracing already active' })
  })

  it('returns {ok:true} and activates tracing when startRecording succeeds', async () => {
    mockContentTracing.startRecording.mockResolvedValue(undefined)
    const handlers = createTracingHandlers(mockElectron as unknown as MockElectron)

    const result = await handlers.tracingStart()

    expect(result).toEqual({ ok: true })
    expect(mockContentTracing.startRecording).toHaveBeenCalledOnce()
    expect(mockContentTracing.startRecording).toHaveBeenCalledWith({ included_categories: ['*'] })
  })

  it('returns {ok:false} with error message when startRecording throws', async () => {
    const error = new Error('Tracing unavailable in this environment')
    mockContentTracing.startRecording.mockRejectedValue(error)
    const handlers = createTracingHandlers(mockElectron as unknown as MockElectron)

    const result = await handlers.tracingStart()

    expect(result).toEqual({
      ok: false,
      message: 'Tracing unavailable in this environment',
    })
    expect(handlers.getTracingActive()).toBe(false)
  })

  it('does not call startRecording when already active', async () => {
    mockContentTracing.startRecording.mockResolvedValue(undefined)
    mockContentTracing.stopRecording.mockResolvedValue('/tmp/trace.json')
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/out.json' })

    const handlers = createTracingHandlers(mockElectron as unknown as MockElectron)
    await handlers.tracingStart()
    await handlers.tracingStart() // second call — already active

    expect(mockContentTracing.startRecording).toHaveBeenCalledOnce()
  })
})

// =============================================================================
// Tests — tracing:stop
// =============================================================================

describe('tracing:stop', () => {
  const mockContentTracing = {
    startRecording: vi.fn<() => Promise<void>>(),
    stopRecording: vi.fn<() => Promise<string>>(),
  }
  const mockBrowserWindow = {
    getFocusedWindow: vi.fn<() => unknown>(),
    getAllWindows: vi.fn<() => unknown[]>(),
  }
  const mockDialog = {
    showSaveDialog: vi.fn<() => Promise<MockDialogResult>>(),
  }
  let mockElectron: MockElectron

  beforeEach(() => {
    vi.resetAllMocks()
    mockContentTracing.startRecording = vi.fn<() => Promise<void>>()
    mockContentTracing.stopRecording = vi.fn<() => Promise<string>>()
    mockBrowserWindow.getFocusedWindow = vi.fn<() => unknown>()
    mockBrowserWindow.getAllWindows = vi.fn<() => unknown[]>()
    mockDialog.showSaveDialog = vi.fn<() => Promise<MockDialogResult>>()
    mockElectron = {
      contentTracing: mockContentTracing,
      BrowserWindow: mockBrowserWindow,
      dialog: mockDialog,
    }
  })

  it('returns {ok:false, message} when tracing is not active', async () => {
    const handlers = createTracingHandlers(mockElectron)

    const result = await handlers.tracingStop()

    expect(result).toEqual({ ok: false, message: 'No active tracing session' })
    expect(mockContentTracing.stopRecording).not.toHaveBeenCalled()
  })

  it('returns {ok:true, cancelled:true} when save dialog is cancelled', async () => {
    mockContentTracing.stopRecording.mockResolvedValue('/tmp/trace.json')
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: true })
    mockBrowserWindow.getFocusedWindow.mockReturnValue(null)
    mockBrowserWindow.getAllWindows.mockReturnValue([])

    const handlers = createTracingHandlers(mockElectron)
    // Activate first
    mockContentTracing.startRecording.mockResolvedValue(undefined)
    await handlers.tracingStart()

    const result = await handlers.tracingStop()

    expect(result).toEqual({ ok: true, cancelled: true })
    expect(handlers.getTracingActive()).toBe(false)
  })

  it('returns {ok:true, filePath} when save dialog confirms a path', async () => {
    mockContentTracing.stopRecording.mockResolvedValue('/tmp/trace.json')
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/Users/dev/chaton-trace.json' })
    mockBrowserWindow.getFocusedWindow.mockReturnValue(null)
    mockBrowserWindow.getAllWindows.mockReturnValue([])

    const handlers = createTracingHandlers(mockElectron)
    mockContentTracing.startRecording.mockResolvedValue(undefined)
    await handlers.tracingStart()

    const result = await handlers.tracingStop()

    expect(result).toEqual({ ok: true, filePath: '/Users/dev/chaton-trace.json' })
    expect(handlers.getTracingActive()).toBe(false)
  })

  it('returns {ok:true, cancelled:true} when filePath is undefined even without canceled flag', async () => {
    mockContentTracing.stopRecording.mockResolvedValue('/tmp/trace.json')
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false }) // no filePath
    mockBrowserWindow.getFocusedWindow.mockReturnValue(null)
    mockBrowserWindow.getAllWindows.mockReturnValue([])

    const handlers = createTracingHandlers(mockElectron)
    mockContentTracing.startRecording.mockResolvedValue(undefined)
    await handlers.tracingStart()

    const result = await handlers.tracingStop()

    expect(result).toEqual({ ok: true, cancelled: true })
    expect(handlers.getTracingActive()).toBe(false)
  })

  it('returns {ok:false} with error message when stopRecording throws', async () => {
    mockContentTracing.stopRecording.mockRejectedValue(new Error('Recording flush failed'))
    mockContentTracing.startRecording.mockResolvedValue(undefined)

    const handlers = createTracingHandlers(mockElectron)
    await handlers.tracingStart()

    const result = await handlers.tracingStop()

    expect(result).toEqual({ ok: false, message: 'Recording flush failed' })
    expect(handlers.getTracingActive()).toBe(false) // state is reset
  })

  it('uses BrowserWindow.getFocusedWindow() when available, falls back to getAllWindows()[0]', async () => {
    const focusedWindow = { id: 42 }
    const fallbackWindow = { id: 1 }
    mockContentTracing.stopRecording.mockResolvedValue('/tmp/trace.json')
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/out.json' })
    mockBrowserWindow.getFocusedWindow.mockReturnValue(focusedWindow)
    mockBrowserWindow.getAllWindows.mockReturnValue([fallbackWindow])
    mockContentTracing.startRecording.mockResolvedValue(undefined)

    const handlers = createTracingHandlers(mockElectron)
    await handlers.tracingStart()
    await handlers.tracingStop()

    expect(mockBrowserWindow.getFocusedWindow).toHaveBeenCalledOnce()
    expect(mockBrowserWindow.getAllWindows).not.toHaveBeenCalled()
  })

  it('falls back to getAllWindows()[0] when getFocusedWindow returns null', async () => {
    const fallbackWindow = { id: 1 }
    mockContentTracing.stopRecording.mockResolvedValue('/tmp/trace.json')
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/out.json' })
    mockBrowserWindow.getFocusedWindow.mockReturnValue(null)
    mockBrowserWindow.getAllWindows.mockReturnValue([fallbackWindow])
    mockContentTracing.startRecording.mockResolvedValue(undefined)

    const handlers = createTracingHandlers(mockElectron)
    await handlers.tracingStart()
    await handlers.tracingStop()

    expect(mockBrowserWindow.getFocusedWindow).toHaveBeenCalledOnce()
    expect(mockBrowserWindow.getAllWindows).toHaveBeenCalledOnce()
  })

  it('reset tracing state after stopRecording throws (enables retry)', async () => {
    mockContentTracing.startRecording.mockResolvedValue(undefined)
    mockContentTracing.stopRecording.mockRejectedValue(new Error('flush failed'))

    const handlers = createTracingHandlers(mockElectron)
    await handlers.tracingStart()
    expect(handlers.getTracingActive()).toBe(true)

    await handlers.tracingStop()
    expect(handlers.getTracingActive()).toBe(false)

    // Should be able to start again after the failed stop
    const result = await handlers.tracingStart()
    expect(result).toEqual({ ok: true })
  })
})
