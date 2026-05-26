import { beforeEach, describe, expect, it, vi } from 'vitest'

const hostCallInternalMock = vi.fn()
const callExtensionHandlerMock = vi.fn()
const hasExtensionHandlerMock = vi.fn()
const terminateAllWorkersMock = vi.fn()
const getWorkerStatsMock = vi.fn()
const configureRegistryRuntimeMock = vi.fn()
const setMarketplaceIconUrlLookupMock = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  default: { BrowserWindow: { getAllWindows: () => [] } },
}))

vi.mock('../db/index.js', () => ({
  getDb: () => ({ db: true }),
}))

vi.mock('../db/repos/extension-queue.js', () => ({
  listQueueMessages: () => [],
}))

vi.mock('../db/repos/extension-kv.js', () => ({
  extensionKvGet: () => null,
  extensionKvSet: vi.fn(),
}))

vi.mock('../db/repos/projects.js', () => ({
  findProjectById: vi.fn(),
  listProjects: () => [],
}))

vi.mock('../db/repos/conversations.js', () => ({
  listConversations: () => [],
}))

vi.mock('./runtime/host.js', () => ({
  createHostCall: () => hostCallInternalMock,
  builtinAutomationNotify: vi.fn(),
}))

vi.mock('./runtime/automation.js', () => ({
  createAutomationRuntime: () => ({
    extensionsCallAutomation: vi.fn(),
    initializeCronTasks: vi.fn(),
    runAutomationOnEvent: vi.fn(),
    runExtensionsQueueWorkerCycle: vi.fn(),
    shutdownCronScheduler: vi.fn(),
  }),
}))

vi.mock('./runtime/automation-pi-bridge.js', () => ({
  createPiInstructionExecutor: () => vi.fn(),
}))

vi.mock('./runtime/browser.js', () => ({
  browserBack: vi.fn(),
  browserClick: vi.fn(),
  browserClose: vi.fn(),
  browserForward: vi.fn(),
  browserList: vi.fn(),
  browserNavigate: vi.fn(),
  browserOpen: vi.fn(),
  browserPress: vi.fn(),
  browserReload: vi.fn(),
  browserSnapshot: vi.fn(),
  browserType: vi.fn(),
  browserWait: vi.fn(),
  closeAllBrowserSessions: vi.fn(),
}))

vi.mock('./runtime/memory.js', () => ({
  memoryDelete: vi.fn(),
  memoryGet: vi.fn(),
  memoryList: vi.fn(),
  memoryMarkUsed: vi.fn(),
  memorySearch: vi.fn(),
  memoryStats: vi.fn(),
  memoryUpdate: vi.fn(),
  memoryUpsert: vi.fn(),
}))

vi.mock('./runtime/memory-lifecycle.js', () => ({
  flushQueuedMemoryCaptures: vi.fn(() => Promise.resolve()),
  startMemoryCleanupScheduler: vi.fn(),
  stopMemoryCleanupScheduler: vi.fn(),
}))

vi.mock('./runtime/projects.js', () => ({
  chatonsGetHiddenProjects: vi.fn(),
  chatonsGetProject: vi.fn(),
  chatonsGetProjectConversations: vi.fn(),
  chatonsGetVisibleProjects: vi.fn(),
  chatonsListProjects: vi.fn(),
  chatonsUpdateProjectVisibility: vi.fn(),
}))

vi.mock('./runtime/registry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./runtime/registry.js')>()
  return {
    ...actual,
    configureRegistryRuntime: configureRegistryRuntimeMock,
    initializeExtensionsRuntime: vi.fn(),
    getExtensionRuntimeHealth: () => ({ ok: true }),
    listExtensionManifests: () => [],
    listRegisteredExtensionUi: () => [],
  }
})

vi.mock('./runtime/manifest.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./runtime/manifest.js')>()
  return {
    ...actual,
    setMarketplaceIconUrlLookup: setMarketplaceIconUrlLookupMock,
  }
})

vi.mock('./runtime/sandbox.js', () => ({
  callExtensionHandler: callExtensionHandlerMock,
  hasExtensionHandler: hasExtensionHandlerMock,
  terminateAllWorkers: terminateAllWorkersMock,
  getWorkerStats: getWorkerStatsMock,
}))

vi.mock('./manager.js', () => ({
  checkForExtensionUpdates: vi.fn(() => ({ ok: true, updates: [] })),
  getChatonsExtensionLogs: vi.fn(() => ({ ok: true, content: '' })),
  installChatonsExtension: vi.fn(() => ({ ok: true, started: false, state: {} })),
  listChatonsExtensionCatalog: vi.fn(() => ({ ok: true, entries: [], source: 'cache', updatedAt: new Date(0).toISOString() })),
  listChatonsExtensions: vi.fn(() => ({ ok: true, extensions: [] })),
  lookupMarketplaceIconUrl: vi.fn(() => null),
  removeChatonsExtension: vi.fn(() => ({ ok: true, id: 'ext' })),
  toggleChatonsExtension: vi.fn(() => ({ ok: true, enabled: true })),
  updateChatonsExtension: vi.fn(() => ({ ok: true, state: {} })),
}))

describe('extension runtime boundary validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes subscribeExtension ids topics and scoped options before storing runtime state', async () => {
    const { runtimeState } = await import('./runtime/state.js')
    const { subscribeExtension } = await import('./runtime.js')
    runtimeState.manifests.set('@chaton/subscriber', {
      id: '@chaton/subscriber',
      name: 'Subscriber',
      version: '1.0.0',
      capabilities: ['events.subscribe'],
    })

    const result = subscribeExtension(' @chaton/subscriber ', ' conversation.message.received ', {
      conversationId: ' conversation-1 ',
      projectId: ' project-1 ',
    })

    expect(result.ok).toBe(true)
    const subscription = Array.from(runtimeState.subscriptions.values())[0]
    expect(subscription).toMatchObject({
      extensionId: '@chaton/subscriber',
      topic: 'conversation.message.received',
      options: { conversationId: 'conversation-1', projectId: 'project-1' },
    })
  })

  it('rejects invalid subscribeExtension values before capability tracking', async () => {
    const { runtimeState } = await import('./runtime/state.js')
    const { subscribeExtension } = await import('./runtime.js')
    runtimeState.capabilityUsage.clear()
    runtimeState.subscriptions.clear()

    expect(subscribeExtension('../outside', 'conversation.created')).toEqual({ ok: false, message: 'invalid extensionId' })
    expect(subscribeExtension('@chaton/subscriber', 'bad topic')).toEqual({
      ok: false,
      message: 'topic can only contain letters, numbers, dots, underscores, colons and hyphens',
    })
    expect(runtimeState.subscriptions.size).toBe(0)
    expect(runtimeState.capabilityUsage.size).toBe(0)
  })

  it('validates hostCall ids and methods before delegating', async () => {
    const { hostCall } = await import('./runtime.js')
    hostCallInternalMock.mockReturnValue({ ok: true })

    expect(hostCall('../outside', 'notifications.notify')).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'invalid extensionId' },
    })
    expect(hostCall('@chaton/automation', 'bad method')).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'apiName can only contain letters, numbers, dots, underscores, colons and hyphens' },
    })

    expect(hostCall(' @chaton/automation ', ' notifications.notify ', { title: 'A' })).toEqual({ ok: true })
    expect(hostCallInternalMock).toHaveBeenCalledTimes(1)
    expect(hostCallInternalMock).toHaveBeenCalledWith('@chaton/automation', 'notifications.notify', { title: 'A' })
  })

  it('validates extensionsCall ids api names version ranges and context before handlers', async () => {
    const { extensionsCall } = await import('./runtime.js')

    expect(extensionsCall('../outside', '@chaton/memory', 'memory.search', '^1.0.0', {})).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'invalid extensionId' },
    })
    expect(extensionsCall('@chaton/caller', '@chaton/memory', 'bad api', '^1.0.0', {})).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'apiName can only contain letters, numbers, dots, underscores, colons and hyphens' },
    })
    expect(extensionsCall('@chaton/caller', '@chaton/memory', 'memory.search', 'bad/range', {})).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'versionRange contains unsupported characters' },
    })
    expect(extensionsCall('@chaton/caller', '@chaton/unknown', 'custom.api', '^1.0.0', {}, { conversationId: 'bad conversation' })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'conversationId can only contain letters, numbers, dots, underscores, colons and hyphens' },
    })
    expect(callExtensionHandlerMock).not.toHaveBeenCalled()
  })
})
