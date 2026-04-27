import { beforeEach, describe, expect, it, vi } from 'vitest'

const spawnMock = vi.fn()
const listChatonsExtensionsMock = vi.fn()
const appendExtensionLogMock = vi.fn()
let runtimeState: typeof import('./state.js').runtimeState

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

describe('ensureExtensionServerStarted', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
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
          readyTimeoutMs: 12000,
        },
      },
    })

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
})
