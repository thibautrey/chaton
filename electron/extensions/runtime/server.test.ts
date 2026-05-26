import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

const spawnMock = vi.fn()
const listChatonsExtensionsMock = vi.fn()
const appendExtensionLogMock = vi.fn()
let runtimeState: typeof import('./state.js').runtimeState

function createChildProcessMock() {
  const child = new EventEmitter() as EventEmitter & {
    killed: boolean
    exitCode: number | null
    pid: number
    stdout: EventEmitter
    stderr: EventEmitter
    kill: ReturnType<typeof vi.fn>
    once: EventEmitter['once']
  }
  child.killed = false
  child.exitCode = null
  child.pid = 1234
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn(() => {
    child.killed = true
    return true
  })
  return child
}

function registerTestManifest(readyTimeoutMs = 12000) {
  runtimeState.manifests.set('test.extension', {
    id: 'test.extension',
    name: 'Test Extension',
    version: '1.0.0',
    capabilities: [],
    server: {
      start: {
        command: 'node',
        args: ['server.js'],
        readyUrl: 'http://127.0.0.1:42619/health',
        readyTimeoutMs,
      },
    },
  })
}

function registerTestExtensionRoot(root: string) {
  runtimeState.extensionRoots.set('test.extension', root)
  listChatonsExtensionsMock.mockReturnValue({
    extensions: [{ id: 'test.extension', enabled: true, path: root }],
  })
}

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    spawn: spawnMock,
    default: {
      ...('default' in actual && actual.default ? actual.default : {}),
      spawn: spawnMock,
    },
  }
})

vi.mock('../manager.js', () => ({
  listChatonsExtensions: listChatonsExtensionsMock,
}))

vi.mock('./logging.js', () => ({
  appendExtensionLog: appendExtensionLogMock,
}))

// Disable concurrency: test 3 uses vi.useFakeTimers() which can leak timer
// state into parallel workers, and test 1 stubs fetch globally without cleanup.
// Running sequentially eliminates all flaky timeouts.
describe('ensureExtensionServerStarted', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.useRealTimers()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    runtimeState = (await import('./state.js')).runtimeState
    runtimeState.manifests.clear()
    runtimeState.extensionRoots.clear()
    runtimeState.serverProcesses.clear()
    runtimeState.serverStatus.clear()
    runtimeState.channelStatus.clear()
    listChatonsExtensionsMock.mockReturnValue({
      extensions: [{ id: 'test.extension', enabled: true }],
    })
  })

  it('reuses an already-live readyUrl instead of spawning a duplicate server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true })),
    )

    registerTestManifest()

    const { ensureExtensionServerStarted } = await import('./server.js')

    await ensureExtensionServerStarted('test.extension')

    expect(spawnMock).not.toHaveBeenCalled()
    expect(runtimeState.serverStatus.get('test.extension')).toMatchObject({
      ready: true,
      lastError: undefined,
    })
    expect(appendExtensionLogMock).toHaveBeenCalledWith(
      'test.extension',
      'info',
      'server.start.skipped',
      expect.objectContaining({
        reason: 'ready_url_already_live',
      }),
    )
  })

  it('deduplicates concurrent starts while readiness is being probed', async () => {
    let fetchCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        fetchCalls += 1
        await new Promise((resolve) => setTimeout(resolve, fetchCalls === 1 ? 20 : 0))
        return { ok: false }
      }),
    )
    const child = createChildProcessMock()
    spawnMock.mockReturnValue(child)
    registerTestManifest(500)

    const { ensureExtensionServerStarted } = await import('./server.js')

    const starts = Promise.all([
      ensureExtensionServerStarted('test.extension'),
      ensureExtensionServerStarted('test.extension'),
      ensureExtensionServerStarted('test.extension'),
    ])

    await starts

    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(appendExtensionLogMock).toHaveBeenCalledWith(
      'test.extension',
      'info',
      'server.start.skipped',
      expect.objectContaining({ reason: 'already_starting' }),
    )
  })

  it('aborts a hung readyUrl probe instead of waiting for fetch forever', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })),
    )
    const child = createChildProcessMock()
    spawnMock.mockReturnValue(child)
    registerTestManifest(500)

    const { ensureExtensionServerStarted } = await import('./server.js')
    const start = ensureExtensionServerStarted('test.extension')

    await vi.advanceTimersByTimeAsync(1600)
    await start

    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(runtimeState.serverStatus.get('test.extension')).toMatchObject({
      ready: false,
      lastError: expect.stringContaining('Server not ready after 500ms'),
    })
  })

  it('falls back to the extension root when cwd resolves to a sibling path with the same prefix', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false })),
    )
    const child = createChildProcessMock()
    spawnMock.mockReturnValue(child)
    const root = '/tmp/chaton-extension'
    registerTestExtensionRoot(root)
    runtimeState.manifests.set('test.extension', {
      id: 'test.extension',
      name: 'Test Extension',
      version: '1.0.0',
      capabilities: [],
      server: {
        start: {
          command: 'node',
          args: ['server.js'],
          cwd: '../chaton-extension-malicious',
        },
      },
    })

    const { ensureExtensionServerStarted } = await import('./server.js')

    await ensureExtensionServerStarted('test.extension')

    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: root }),
    )
  })

  it('rejects extension server registration for traversal extension ids', async () => {
    const { registerExtensionServer } = await import('./server.js')

    const result = registerExtensionServer({
      extensionId: '../outside',
      command: 'node',
      args: ['server.js'],
    })

    expect(result).toEqual({ ok: false, message: 'extensionId and command are required' })
    expect(runtimeState.manifests.has('../outside')).toBe(false)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('escalates explicit server stop when a child ignores SIGTERM', async () => {
    vi.useFakeTimers()
    const child = createChildProcessMock()
    child.killed = true
    child.exitCode = null
    child.kill.mockReturnValue(true)
    runtimeState.serverProcesses.set('test.extension', child)

    const { stopExtensionServer } = await import('./server.js')
    const { forceKillStoppingExtensionServers } = await import('./state.js')
    stopExtensionServer('test.extension')
    await vi.advanceTimersByTimeAsync(1500)
    forceKillStoppingExtensionServers()

    expect(child.kill).toHaveBeenNthCalledWith(1, 'SIGTERM')
    expect(child.kill).toHaveBeenNthCalledWith(2, 'SIGKILL')
    expect(runtimeState.serverProcesses.has('test.extension')).toBe(false)
  })
})
