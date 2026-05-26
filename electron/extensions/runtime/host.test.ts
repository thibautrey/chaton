import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runtimeState } from './state.js'
import type { ExtensionManifest } from './types.js'

const getDbMock = vi.fn(() => ({ db: true }))
const listConversationsMock = vi.fn(() => [])
const listProjectsMock = vi.fn(() => [])
const findProjectByIdMock = vi.fn()
const extensionKvGetMock = vi.fn()
const extensionKvSetMock = vi.fn()

vi.mock('electron', () => ({
  default: { BrowserWindow: { getAllWindows: () => browserWindowsMock() } },
}))

const browserWindowsMock = vi.fn(() => [] as unknown[])

vi.mock('../../db/index.js', () => ({
  getDb: getDbMock,
}))

vi.mock('../../db/repos/conversations.js', () => ({
  listConversations: listConversationsMock,
}))

vi.mock('../../db/repos/projects.js', () => ({
  findProjectById: findProjectByIdMock,
  listProjects: listProjectsMock,
}))

vi.mock('../../db/repos/extension-kv.js', () => ({
  extensionKvGet: extensionKvGetMock,
  extensionKvSet: extensionKvSetMock,
}))

const manifest = (id: string, capabilities: ExtensionManifest['capabilities']): ExtensionManifest => ({
  id,
  name: id,
  version: '1.0.0',
  capabilities,
})

function resetRuntimeState() {
  runtimeState.manifests.clear()
  runtimeState.extensionRoots.clear()
  runtimeState.subscriptions.clear()
  runtimeState.capabilityUsage.clear()
  runtimeState.serverProcesses.clear()
  runtimeState.serverStatus.clear()
  runtimeState.channelStatus.clear()
}

describe('extension host calls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    browserWindowsMock.mockReturnValue([])
    resetRuntimeState()
    delete (globalThis as Record<string, unknown>).__chatonsChannelBridge
  })

  it('requires host.conversations.write before ingesting channel messages', async () => {
    const { createHostCall } = await import('./host.js')
    const ingestExternalMessage = vi.fn()
    ;(globalThis as Record<string, unknown>).__chatonsChannelBridge = { ingestExternalMessage }
    runtimeState.manifests.set('@chaton/channel', manifest('@chaton/channel', []))

    const hostCall = createHostCall(() => ({
      ok: true,
      event: { topic: 'noop', payload: null, publishedAt: new Date(0).toISOString() },
    }))

    const result = await Promise.resolve(hostCall('@chaton/channel', 'channels.ingestMessage', {
      conversationId: 'conversation-1',
      message: 'hello',
    }))

    expect(result).toEqual({
      ok: false,
      error: { code: 'unauthorized', message: 'Extension @chaton/channel missing capability host.conversations.write' },
    })
    expect(ingestExternalMessage).not.toHaveBeenCalled()
    expect(runtimeState.capabilityUsage.size).toBe(0)
  })

  it('normalizes ingest message ids before calling the channel bridge', async () => {
    const { createHostCall } = await import('./host.js')
    const ingestExternalMessage = vi.fn().mockResolvedValue({ ok: true, reply: 'ok' })
    ;(globalThis as Record<string, unknown>).__chatonsChannelBridge = { ingestExternalMessage }
    runtimeState.manifests.set('@chaton/channel', manifest('@chaton/channel', ['host.conversations.write']))

    const hostCall = createHostCall(() => ({
      ok: true,
      event: { topic: 'noop', payload: null, publishedAt: new Date(0).toISOString() },
    }))

    const result = await Promise.resolve(hostCall('@chaton/channel', 'channels.ingestMessage', {
      conversationId: ' conversation-1 ',
      idempotencyKey: ' idem-1 ',
      message: 'hello',
      metadata: { source: 'test' },
    }))

    expect(result).toEqual({ ok: true, data: { reply: 'ok' } })
    expect(ingestExternalMessage).toHaveBeenCalledWith({
      extensionId: '@chaton/channel',
      conversationId: 'conversation-1',
      message: 'hello',
      idempotencyKey: 'idem-1',
      metadata: { source: 'test' },
    })
  })

  it('requires host.conversations.write before reading channel status', async () => {
    const { createHostCall } = await import('./host.js')
    runtimeState.channelStatus.set('@chaton/channel', {
      configured: true,
      connected: true,
      updatedAt: new Date(0).toISOString(),
    })
    runtimeState.manifests.set('@chaton/channel', manifest('@chaton/channel', []))

    const hostCall = createHostCall(() => ({
      ok: true,
      event: { topic: 'noop', payload: null, publishedAt: new Date(0).toISOString() },
    }))

    expect(hostCall('@chaton/channel', 'channels.getStatus')).toEqual({
      ok: false,
      error: { code: 'unauthorized', message: 'Extension @chaton/channel missing capability host.conversations.write' },
    })
  })

  it('rejects malformed host conversation and project ids before bridge or db access', async () => {
    const { createHostCall } = await import('./host.js')
    const ingestExternalMessage = vi.fn()
    ;(globalThis as Record<string, unknown>).__chatonsChannelBridge = { ingestExternalMessage }
    runtimeState.manifests.set('@chaton/channel', manifest('@chaton/channel', ['host.conversations.write', 'host.conversations.read', 'host.projects.read']))

    const hostCall = createHostCall(() => ({
      ok: true,
      event: { topic: 'noop', payload: null, publishedAt: new Date(0).toISOString() },
    }))

    expect(hostCall('@chaton/channel', 'channels.ingestMessage', { conversationId: 'bad id', message: 'hello' })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'conversationId can only contain letters, numbers, dots, underscores, colons and hyphens' },
    })
    expect(hostCall('@chaton/channel', 'conversations.getMessages', { conversationId: 'bad id' })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'conversationId can only contain letters, numbers, dots, underscores, colons and hyphens' },
    })
    expect(hostCall('@chaton/channel', 'projects.get', { projectId: 'bad id' })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'projectId can only contain letters, numbers, dots, underscores, colons and hyphens' },
    })
    expect(ingestExternalMessage).not.toHaveBeenCalled()
    expect(getDbMock).not.toHaveBeenCalled()
  })

  it('requires ui.mainView before opening extension main views', async () => {
    const { createHostCall } = await import('./host.js')
    runtimeState.manifests.set('@chaton/viewer', {
      ...manifest('@chaton/viewer', []),
      ui: { mainViews: [{ viewId: 'viewer.main', title: 'Viewer', webviewUrl: 'chaton-extension://@chaton/viewer/index.html' }] },
    })

    const hostCall = createHostCall(() => ({
      ok: true,
      event: { topic: 'noop', payload: null, publishedAt: new Date(0).toISOString() },
    }))

    expect(hostCall('@chaton/viewer', 'open.mainView', { viewId: 'viewer.main' })).toEqual({
      ok: false,
      error: { code: 'unauthorized', message: 'Extension @chaton/viewer missing capability ui.mainView' },
    })
  })

  it('opens only main views declared by the calling extension manifest', async () => {
    const { createHostCall } = await import('./host.js')
    const send = vi.fn()
    browserWindowsMock.mockReturnValue([
      {
        isDestroyed: () => false,
        webContents: { isDestroyed: () => false, send },
      },
    ])
    runtimeState.manifests.set('@chaton/viewer', {
      ...manifest('@chaton/viewer', ['ui.mainView']),
      ui: { mainViews: [{ viewId: 'viewer.main', title: 'Viewer', webviewUrl: 'chaton-extension://@chaton/viewer/index.html' }] },
    })
    runtimeState.manifests.set('@chaton/other', {
      ...manifest('@chaton/other', ['ui.mainView']),
      ui: { mainViews: [{ viewId: 'other.main', title: 'Other', webviewUrl: 'chaton-extension://@chaton/other/index.html' }] },
    })

    const hostCall = createHostCall(() => ({
      ok: true,
      event: { topic: 'noop', payload: null, publishedAt: new Date(0).toISOString() },
    }))

    expect(hostCall('@chaton/viewer', 'open.mainView', { viewId: 'other.main' })).toEqual({
      ok: false,
      error: { code: 'not_found', message: 'main view not found for extension: other.main' },
    })
    expect(send).not.toHaveBeenCalled()

    expect(hostCall('@chaton/viewer', 'open.mainView', { viewId: ' viewer.main ' })).toEqual({ ok: true })
    expect(send).toHaveBeenCalledWith('extensions:openMainView', { extensionId: '@chaton/viewer', viewId: 'viewer.main' })
  })

  it('sanitizes notification links before sending them to the renderer', async () => {
    const { createHostCall } = await import('./host.js')
    const send = vi.fn()
    browserWindowsMock.mockReturnValue([
      {
        isDestroyed: () => false,
        webContents: { isDestroyed: () => false, send },
      },
    ])
    runtimeState.manifests.set('@chaton/notifier', manifest('@chaton/notifier', ['host.notifications']))

    const hostCall = createHostCall(() => ({
      ok: true,
      event: { topic: 'noop', payload: null, publishedAt: new Date(0).toISOString() },
    }))

    expect(hostCall('@chaton/notifier', 'notifications.notify', {
      title: 'Bad URL',
      link: { type: 'url', href: 'javascript:alert(1)', label: 'bad' },
    })).toEqual({ ok: true })
    expect(send).toHaveBeenLastCalledWith('extension:notification', {
      title: 'Bad URL',
      body: '',
      link: undefined,
      meta: undefined,
    })

    expect(hostCall('@chaton/notifier', 'notifications.notify', {
      title: 'Bad deeplink',
      link: { type: 'deeplink', href: 'unknown:abc', label: 'bad' },
    })).toEqual({ ok: true })
    expect(send).toHaveBeenLastCalledWith('extension:notification', {
      title: 'Bad deeplink',
      body: '',
      link: undefined,
      meta: undefined,
    })

    expect(hostCall('@chaton/notifier', 'notifications.notify', {
      title: 'Good URL',
      link: { type: 'url', href: ' https://example.com/path ', label: ' Open docs ' },
    })).toEqual({ ok: true })
    expect(send).toHaveBeenLastCalledWith('extension:notification', {
      title: 'Good URL',
      body: '',
      link: { type: 'url', href: 'https://example.com/path', label: 'Open docs' },
      meta: undefined,
    })

    expect(hostCall('@chaton/notifier', 'notifications.notify', {
      title: 'Good deeplink',
      link: { type: 'deeplink', href: ' conversation:abc-123 ', label: 'Open' },
    })).toEqual({ ok: true })
    expect(send).toHaveBeenLastCalledWith('extension:notification', {
      title: 'Good deeplink',
      body: '',
      link: { type: 'deeplink', href: 'conversation:abc-123', label: 'Open' },
      meta: undefined,
    })
  })
})
