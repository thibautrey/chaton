import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `pi:startSession`, `pi:stopSession`, and `pi:getSnapshot` IPC handlers.
 *
 * These are core session lifecycle handlers. They were added after the core handlers
 * were already tested, leaving them without dedicated coverage.
 *
 * We replicate the minimal handler logic inline to test without needing the full
 * workspace-handlers.ts module (which requires complex dep setup).
 *
 * Note: `pi:startSession` cloud path includes a `BrowserWindow.getAllWindows()` broadcast
 * that sends a `pi:event` ("runtime_status: ready") to all renderer windows. This
 * behavior is included in the inline handler and tested below.
 */

// -------------------------------------------------------------------------
// Types mirroring those used by the real handler
// -------------------------------------------------------------------------

type StartResult =
  | { ok: true; runtime?: 'cloud' }
  | { ok: false; reason: string; message?: string }

type StopResult =
  | { ok: true; runtime?: 'cloud' }
  | { ok: false; reason: string }

type SnapshotResult =
  | { status: 'ok' | 'error'; state: unknown; messages: unknown[] }
  | { status: 'error'; state: null; messages: [] }

interface Conversation {
  id: string
  runtime_location: 'local' | 'cloud'
  project_id: string | null
}

interface MockWebContents {
  isDestroyed: () => boolean
  send: (channel: string, data: unknown) => void
}

interface MockBrowserWindow {
  isDestroyed: () => boolean
  webContents: MockWebContents
}

// -------------------------------------------------------------------------
// Inline minimal handler for `pi:respondExtensionUi`
// Mirrors workspace-handlers.ts lines 4343–4350.
// -------------------------------------------------------------------------

// Note: named `respondExtUi` to avoid shadowing the `respondExtensionUi` mock
// used in tests (which is passed as the `respondExtensionUi` param).
async function respondExtUi(params: {
  conversationId: string
  response: unknown
  respondExtensionUi: (conversationId: string, response: unknown) => void
}): Promise<void> {
  const { conversationId, response, respondExtensionUi } = params

  if (typeof conversationId !== 'string' || !conversationId.trim()) {
    return
  }
  return respondExtensionUi(conversationId.trim(), response)
}

// -------------------------------------------------------------------------
// Tests: pi:respondExtensionUi
// -------------------------------------------------------------------------
describe('pi:respondExtensionUi', () => {
  describe('input validation', () => {
    it('returns early when conversationId is null', async () => {
      const respondExtensionUi = vi.fn()
      await respondExtUi({
        conversationId: null as unknown as string,
        response: { type: 'text', text: 'hello' },
        respondExtensionUi,
      })
      expect(respondExtensionUi).not.toHaveBeenCalled()
    })

    it('returns early when conversationId is undefined', async () => {
      const respondExtensionUi = vi.fn()
      await respondExtUi({
        conversationId: undefined as unknown as string,
        response: { type: 'text', text: 'hello' },
        respondExtensionUi,
      })
      expect(respondExtensionUi).not.toHaveBeenCalled()
    })

    it('returns early when conversationId is empty string', async () => {
      const respondExtensionUi = vi.fn()
      await respondExtUi({
        conversationId: '',
        response: { type: 'text', text: 'hello' },
        respondExtensionUi,
      })
      expect(respondExtensionUi).not.toHaveBeenCalled()
    })

    it('returns early when conversationId is whitespace-only', async () => {
      const respondExtensionUi = vi.fn()
      await respondExtUi({
        conversationId: '   ',
        response: { type: 'text', text: 'hello' },
        respondExtensionUi,
      })
      expect(respondExtensionUi).not.toHaveBeenCalled()
    })

    it('calls respondExtensionUi with trimmed id on valid input', async () => {
      const respondExtensionUi = vi.fn()
      await respondExtUi({
        conversationId: '  conv-ext-1  ',
        response: { type: 'text', text: 'hello' },
        respondExtensionUi,
      })
      expect(respondExtensionUi).toHaveBeenCalledOnce()
      expect(respondExtensionUi).toHaveBeenCalledWith('conv-ext-1', { type: 'text', text: 'hello' })
    })

    it('passes response object through unchanged', async () => {
      const respondExtensionUi = vi.fn()
      const response = { type: 'tool_use', toolUseId: 'tool-42', content: 'result' }
      await respondExtUi({
        conversationId: 'conv-tool',
        response,
        respondExtensionUi,
      })
      expect(respondExtensionUi).toHaveBeenCalledWith('conv-tool', response)
    })
  })
})
// Mirrors workspace-handlers.ts lines 3609–3646 — INCLUDING the
// BrowserWindow.getAllWindows() broadcast that the real handler fires
// after ensureCloudRuntimeSession succeeds.
// -------------------------------------------------------------------------
async function startSession(params: {
  conversationId: string | null | undefined
  conversation: Conversation | null
  ensureCloudRuntimeSession: (conversationId: string) => Promise<
    | { ok: true; sessionId: string }
    | { ok: false; reason: string; message?: string }
  >
  piRuntimeManagerStart: (conversationId: string) => Promise<
    | { ok: true }
    | { ok: false; reason: string; message: string }
  >
  getAllBrowserWindows?: () => MockBrowserWindow[]
}): Promise<StartResult> {
  const {
    conversationId,
    conversation,
    ensureCloudRuntimeSession,
    piRuntimeManagerStart,
    getAllBrowserWindows = () => [],
  } = params

  // Input validation — mirrors workspace-handlers.ts
  if (typeof conversationId !== 'string' || !conversationId.trim()) {
    return { ok: false, reason: 'conversationId is required' }
  }

  if (!conversation) {
    return { ok: false, reason: 'conversation_not_found' }
  }

  if (conversation.runtime_location === 'cloud') {
    const ensured = await ensureCloudRuntimeSession(conversation.id)
    if (!ensured.ok) {
      return ensured
    }

    // Broadcast "cloud runtime ready" to all renderer windows so the UI
    // can react immediately without waiting for the next poll.
    for (const win of getAllBrowserWindows()) {
      if (win.isDestroyed()) continue
      const webContents = win.webContents
      if (webContents.isDestroyed()) continue
      try {
        webContents.send('pi:event', {
          conversationId: conversation.id,
          event: {
            type: 'runtime_status',
            status: 'ready',
            message: 'Cloud runtime ready',
          },
        })
      } catch {
        // Individual send failures must not prevent other windows from receiving
        // the event or the handler from returning success.
      }
    }

    return { ok: true, runtime: 'cloud' as const }
  }

  const result = await piRuntimeManagerStart(conversation.id)
  return result
}

// -------------------------------------------------------------------------
// Inline minimal handler for `pi:stopSession`
// Mirrors workspace-handlers.ts lines 3573–3620.
// -------------------------------------------------------------------------
async function stopSession(params: {
  conversationId: string | null | undefined
  conversation: Conversation | null
  project: { id: string; cloud_instance_id: string | null } | null
  cloudRuntimeSessionId: string | null
  deleteCloudRuntimeSession: (sessionId: string) => Promise<void>
  saveCloudRuntimeSessionId: (conversationId: string, sessionId: string | null) => void
  stop: (conversationId: string) => Promise<void>
  clearConversationMaps: (conversationId: string) => void
}): Promise<StopResult> {
  const { conversationId, conversation, project, cloudRuntimeSessionId, deleteCloudRuntimeSession,
    saveCloudRuntimeSessionId, stop, clearConversationMaps } = params

  // Input validation — mirrors workspace-handlers.ts
  if (typeof conversationId !== 'string' || !conversationId.trim()) {
    return { ok: false, reason: 'conversationId is required' }
  }

  if (!conversation) {
    return { ok: false, reason: 'conversation_not_found' }
  }

  if (conversation.runtime_location === 'cloud') {
    const instance = project?.cloud_instance_id ?? null
    if (instance && cloudRuntimeSessionId) {
      await deleteCloudRuntimeSession(cloudRuntimeSessionId).catch(() => undefined)
    }
    saveCloudRuntimeSessionId(conversation.id, null)
    return { ok: true, runtime: 'cloud' as const }
  }

  // Always clean up Maps even if stop() throws — stale entries are worse than
  // a failed stop. The stop error still propagates.
  try {
    await stop(conversation.id)
  } finally {
    clearConversationMaps(conversation.id)
  }

  return { ok: true }
}

// -------------------------------------------------------------------------
// Inline minimal handler for `pi:getSnapshot`
// Mirrors workspace-handlers.ts lines 3743–3753.
// -------------------------------------------------------------------------
async function getSnapshot(params: {
  conversationId: string
  conversation: Conversation | null
  getCloudSnapshot: (conversationId: string) => Promise<SnapshotResult>
  getLocalSnapshot: (conversationId: string) => Promise<SnapshotResult>
}): Promise<SnapshotResult> {
  const { conversationId, conversation, getCloudSnapshot, getLocalSnapshot } = params

  if (typeof conversationId !== 'string' || !conversationId.trim()) {
    return { status: 'error', state: null, messages: [] }
  }
  const trimmedId = conversationId.trim()

  if (!conversation) {
    return { status: 'error', state: null, messages: [] }
  }

  if (conversation.runtime_location === 'cloud') {
    return getCloudSnapshot(trimmedId)
  }

  return getLocalSnapshot(trimmedId)
}

// -------------------------------------------------------------------------
// Tests: pi:startSession
// -------------------------------------------------------------------------
describe('pi:startSession', () => {

  describe('input validation', () => {
    it('returns conversationId_required when conversationId is null', async () => {
      const result = await startSession({
        conversationId: null,
        conversation: null,
        ensureCloudRuntimeSession: vi.fn(),
        piRuntimeManagerStart: vi.fn(),
      })
      expect(result).toEqual({ ok: false, reason: 'conversationId is required' })
    })

    it('returns conversationId_required when conversationId is undefined', async () => {
      const result = await startSession({
        conversationId: undefined,
        conversation: null,
        ensureCloudRuntimeSession: vi.fn(),
        piRuntimeManagerStart: vi.fn(),
      })
      expect(result).toEqual({ ok: false, reason: 'conversationId is required' })
    })

    it('returns conversationId_required when conversationId is empty string', async () => {
      const result = await startSession({
        conversationId: '',
        conversation: null,
        ensureCloudRuntimeSession: vi.fn(),
        piRuntimeManagerStart: vi.fn(),
      })
      expect(result).toEqual({ ok: false, reason: 'conversationId is required' })
    })

    it('returns conversationId_required when conversationId is whitespace-only', async () => {
      const result = await startSession({
        conversationId: '   ',
        conversation: null,
        ensureCloudRuntimeSession: vi.fn(),
        piRuntimeManagerStart: vi.fn(),
      })
      expect(result).toEqual({ ok: false, reason: 'conversationId is required' })
    })

    it('does not call any deps when conversationId is invalid', async () => {
      const ensureCloudRuntimeSession = vi.fn()
      const piRuntimeManagerStart = vi.fn()
      await startSession({
        conversationId: '' as any,
        conversation: null,
        ensureCloudRuntimeSession,
        piRuntimeManagerStart,
      })
      expect(ensureCloudRuntimeSession).not.toHaveBeenCalled()
      expect(piRuntimeManagerStart).not.toHaveBeenCalled()
    })
  })


  describe('conversation not found', () => {
    it('returns conversation_not_found when no conversation exists', async () => {
      const result = await startSession({
        conversationId: 'conv-any',
        conversation: null,
        ensureCloudRuntimeSession: vi.fn(),
        piRuntimeManagerStart: vi.fn(),
      })

      expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
    })
  })

  describe('cloud conversation', () => {
    it('returns ok:true with runtime:cloud when ensureCloudRuntimeSession succeeds', async () => {
      const ensureCloudRuntimeSession = vi.fn().mockResolvedValue({
        ok: true,
        sessionId: 'cloud-sess-1',
      })

      const result = await startSession({
        conversationId: 'conv-cloud',
        conversation: { id: 'conv-cloud', runtime_location: 'cloud', project_id: 'proj-1' },
        ensureCloudRuntimeSession,
        piRuntimeManagerStart: vi.fn(),
      })

      expect(result).toEqual({ ok: true, runtime: 'cloud' })
      expect(ensureCloudRuntimeSession).toHaveBeenCalledWith('conv-cloud')
    })

    it('returns ensureCloudRuntimeSession failure when it fails', async () => {
      const ensureCloudRuntimeSession = vi.fn().mockResolvedValue({
        ok: false,
        reason: 'cloud_instance_not_found',
        message: 'No cloud instance configured.',
      })

      const result = await startSession({
        conversationId: 'conv-cloud-2',
        conversation: { id: 'conv-cloud-2', runtime_location: 'cloud', project_id: 'proj-1' },
        ensureCloudRuntimeSession,
        piRuntimeManagerStart: vi.fn(),
      })

      expect(result).toEqual({
        ok: false,
        reason: 'cloud_instance_not_found',
        message: 'No cloud instance configured.',
      })
    })

    it('does not call piRuntimeManager.start for cloud conversations', async () => {
      const piRuntimeManagerStart = vi.fn()

      await startSession({
        conversationId: 'conv-cloud-3',
        conversation: { id: 'conv-cloud-3', runtime_location: 'cloud', project_id: 'proj-1' },
        ensureCloudRuntimeSession: vi.fn().mockResolvedValue({ ok: true, sessionId: 'x' }),
        piRuntimeManagerStart,
      })

      expect(piRuntimeManagerStart).not.toHaveBeenCalled()
    })

    it('broadcasts pi:event to all non-destroyed windows when cloud session starts', async () => {
      const sent: Array<[string, unknown]> = []
      const win1 = {
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          send: (channel: string, data: unknown) => sent.push([channel, data]),
        },
      }
      const win2 = {
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          send: (channel: string, data: unknown) => sent.push([channel, data]),
        },
      }

      const result = await startSession({
        conversationId: 'conv-cloud-bcast',
        conversation: { id: 'conv-cloud-bcast', runtime_location: 'cloud', project_id: 'proj-1' },
        ensureCloudRuntimeSession: vi.fn().mockResolvedValue({ ok: true, sessionId: 'sess-abc' }),
        piRuntimeManagerStart: vi.fn(),
        getAllBrowserWindows: () => [win1, win2],
      })

      expect(result).toEqual({ ok: true, runtime: 'cloud' })
      expect(sent).toHaveLength(2)
      expect(sent[0]).toEqual([
        'pi:event',
        {
          conversationId: 'conv-cloud-bcast',
          event: { type: 'runtime_status', status: 'ready', message: 'Cloud runtime ready' },
        },
      ])
      expect(sent[1]).toEqual(sent[0]) // Both windows received the same event
    })

    it('skips windows where isDestroyed() returns true', async () => {
      const sent: Array<[string, unknown]> = []
      const liveWindow = {
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          send: (channel: string, data: unknown) => sent.push([channel, data]),
        },
      }
      const destroyedWindow = {
        isDestroyed: () => true,
        webContents: {
          isDestroyed: () => false,
          send: () => sent.push(['should-not-be-called', null]),
        },
      }

      await startSession({
        conversationId: 'conv-cloud-destroyed',
        conversation: { id: 'conv-cloud-destroyed', runtime_location: 'cloud', project_id: 'proj-1' },
        ensureCloudRuntimeSession: vi.fn().mockResolvedValue({ ok: true, sessionId: 'sess-xyz' }),
        piRuntimeManagerStart: vi.fn(),
        getAllBrowserWindows: () => [destroyedWindow, liveWindow],
      })

      // Only the live window received the event
      expect(sent).toHaveLength(1)
      expect((sent[0][1] as any).conversationId).toBe('conv-cloud-destroyed')
    })

    it('skips windows whose webContents.isDestroyed() returns true', async () => {
      const sent: Array<[string, unknown]> = []
      const liveWindow = {
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          send: (channel: string, data: unknown) => sent.push([channel, data]),
        },
      }
      const webContentsDestroyedWindow = {
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => true,
          send: () => sent.push(['should-not-be-called', null]),
        },
      }

      await startSession({
        conversationId: 'conv-cloud-wcdestroyed',
        conversation: { id: 'conv-cloud-wcdestroyed', runtime_location: 'cloud', project_id: 'proj-1' },
        ensureCloudRuntimeSession: vi.fn().mockResolvedValue({ ok: true, sessionId: 'sess-qrs' }),
        piRuntimeManagerStart: vi.fn(),
        getAllBrowserWindows: () => [webContentsDestroyedWindow, liveWindow],
      })

      expect(sent).toHaveLength(1)
      expect((sent[0][1] as any).conversationId).toBe('conv-cloud-wcdestroyed')
    })

    it('returns ok:true even when webContents.send throws', async () => {
      const win = {
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          send: () => { throw new Error('send failed') },
        },
      }

      const result = await startSession({
        conversationId: 'conv-cloud-sendfail',
        conversation: { id: 'conv-cloud-sendfail', runtime_location: 'cloud', project_id: 'proj-1' },
        ensureCloudRuntimeSession: vi.fn().mockResolvedValue({ ok: true, sessionId: 'sess-err' }),
        piRuntimeManagerStart: vi.fn(),
        getAllBrowserWindows: () => [win],
      })

      // Handler still returns success despite send() throwing
      expect(result).toEqual({ ok: true, runtime: 'cloud' })
    })

    it('returns ok:true even when all windows have send errors', async () => {
      const failingWin = (id: string) => ({
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          send: () => { throw new Error('connection lost') },
        },
      })

      const result = await startSession({
        conversationId: 'conv-cloud-allfail',
        conversation: { id: 'conv-cloud-allfail', runtime_location: 'cloud', project_id: 'proj-1' },
        ensureCloudRuntimeSession: vi.fn().mockResolvedValue({ ok: true, sessionId: 'sess-all' }),
        piRuntimeManagerStart: vi.fn(),
        getAllBrowserWindows: () => [failingWin('w1'), failingWin('w2')],
      })

      expect(result).toEqual({ ok: true, runtime: 'cloud' })
    })

    it('does not broadcast when ensureCloudRuntimeSession fails', async () => {
      const sent: Array<[string, unknown]> = []
      const win = {
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          send: (_channel: string, _data: unknown) => sent.push([_channel, _data]),
        },
      }

      const result = await startSession({
        conversationId: 'conv-cloud-noauth',
        conversation: { id: 'conv-cloud-noauth', runtime_location: 'cloud', project_id: 'proj-1' },
        ensureCloudRuntimeSession: vi.fn().mockResolvedValue({
          ok: false,
          reason: 'auth_required',
          message: 'Session expired.',
        }),
        piRuntimeManagerStart: vi.fn(),
        getAllBrowserWindows: () => [win],
      })

      expect(result).toEqual({ ok: false, reason: 'auth_required', message: 'Session expired.' })
      // No broadcast on failure — windows only notified when cloud runtime is truly ready
      expect(sent).toHaveLength(0)
    })

    it('does not call getAllBrowserWindows for local conversations', async () => {
      const getAllBrowserWindows = vi.fn().mockReturnValue([])

      await startSession({
        conversationId: 'conv-local-no-bcast',
        conversation: { id: 'conv-local-no-bcast', runtime_location: 'local', project_id: null },
        ensureCloudRuntimeSession: vi.fn(),
        piRuntimeManagerStart: vi.fn().mockResolvedValue({ ok: true }),
        getAllBrowserWindows,
      })

      expect(getAllBrowserWindows).not.toHaveBeenCalled()
    })
  })

  describe('local conversation', () => {
    it('returns ok:true when piRuntimeManager.start succeeds', async () => {
      const piRuntimeManagerStart = vi.fn().mockResolvedValue({ ok: true })

      const result = await startSession({
        conversationId: 'conv-local-1',
        conversation: { id: 'conv-local-1', runtime_location: 'local', project_id: null },
        ensureCloudRuntimeSession: vi.fn(),
        piRuntimeManagerStart,
      })

      expect(result).toEqual({ ok: true })
      expect(piRuntimeManagerStart).toHaveBeenCalledWith('conv-local-1')
    })

    it('returns piRuntimeManager.start failure result when it fails', async () => {
      const piRuntimeManagerStart = vi.fn().mockResolvedValue({
        ok: false,
        reason: 'runtime_start_failed',
        message: 'Could not start Pi process.',
      })

      const result = await startSession({
        conversationId: 'conv-local-2',
        conversation: { id: 'conv-local-2', runtime_location: 'local', project_id: null },
        ensureCloudRuntimeSession: vi.fn(),
        piRuntimeManagerStart,
      })

      expect(result).toEqual({
        ok: false,
        reason: 'runtime_start_failed',
        message: 'Could not start Pi process.',
      })
    })

    it('does not call ensureCloudRuntimeSession for local conversations', async () => {
      const ensureCloudRuntimeSession = vi.fn()

      await startSession({
        conversationId: 'conv-local-3',
        conversation: { id: 'conv-local-3', runtime_location: 'local', project_id: null },
        ensureCloudRuntimeSession,
        piRuntimeManagerStart: vi.fn().mockResolvedValue({ ok: true }),
      })

      expect(ensureCloudRuntimeSession).not.toHaveBeenCalled()
    })
  })
})

// -------------------------------------------------------------------------
// Tests: pi:stopSession
// -------------------------------------------------------------------------
describe('pi:stopSession', () => {

  describe('input validation', () => {
    it('returns conversationId_required when conversationId is null', async () => {
      const result = await stopSession({
        conversationId: null,
        conversation: null,
        project: null,
        cloudRuntimeSessionId: null,
        deleteCloudRuntimeSession: vi.fn(),
        saveCloudRuntimeSessionId: vi.fn(),
        stop: vi.fn(),
        clearConversationMaps: vi.fn(),
      })
      expect(result).toEqual({ ok: false, reason: 'conversationId is required' })
    })

    it('returns conversationId_required when conversationId is undefined', async () => {
      const result = await stopSession({
        conversationId: undefined,
        conversation: null,
        project: null,
        cloudRuntimeSessionId: null,
        deleteCloudRuntimeSession: vi.fn(),
        saveCloudRuntimeSessionId: vi.fn(),
        stop: vi.fn(),
        clearConversationMaps: vi.fn(),
      })
      expect(result).toEqual({ ok: false, reason: 'conversationId is required' })
    })

    it('returns conversationId_required when conversationId is empty string', async () => {
      const result = await stopSession({
        conversationId: '',
        conversation: null,
        project: null,
        cloudRuntimeSessionId: null,
        deleteCloudRuntimeSession: vi.fn(),
        saveCloudRuntimeSessionId: vi.fn(),
        stop: vi.fn(),
        clearConversationMaps: vi.fn(),
      })
      expect(result).toEqual({ ok: false, reason: 'conversationId is required' })
    })

    it('returns conversationId_required when conversationId is whitespace-only', async () => {
      const result = await stopSession({
        conversationId: '   ',
        conversation: null,
        project: null,
        cloudRuntimeSessionId: null,
        deleteCloudRuntimeSession: vi.fn(),
        saveCloudRuntimeSessionId: vi.fn(),
        stop: vi.fn(),
        clearConversationMaps: vi.fn(),
      })
      expect(result).toEqual({ ok: false, reason: 'conversationId is required' })
    })

    it('does not call any deps when conversationId is invalid', async () => {
      const deleteCloudRuntimeSession = vi.fn()
      const saveCloudRuntimeSessionId = vi.fn()
      const stop = vi.fn()
      const clearConversationMaps = vi.fn()
      await stopSession({
        conversationId: '' as any,
        conversation: null,
        project: null,
        cloudRuntimeSessionId: null,
        deleteCloudRuntimeSession,
        saveCloudRuntimeSessionId,
        stop,
        clearConversationMaps,
      })
      expect(deleteCloudRuntimeSession).not.toHaveBeenCalled()
      expect(saveCloudRuntimeSessionId).not.toHaveBeenCalled()
      expect(stop).not.toHaveBeenCalled()
      expect(clearConversationMaps).not.toHaveBeenCalled()
    })
  })


  describe('conversation not found', () => {
    it('returns conversation_not_found when no conversation exists', async () => {
      const result = await stopSession({
        conversationId: 'conv-any',
        conversation: null,
        project: null,
        cloudRuntimeSessionId: null,
        deleteCloudRuntimeSession: vi.fn(),
        saveCloudRuntimeSessionId: vi.fn(),
        stop: vi.fn(),
        clearConversationMaps: vi.fn(),
      })

      expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
    })
  })

  describe('cloud conversation', () => {
    it('deletes cloud runtime session and saves null when instance and sessionId exist', async () => {
      const deleteCloudRuntimeSession = vi.fn().mockResolvedValue(undefined)
      const saveCloudRuntimeSessionId = vi.fn()

      const result = await stopSession({
        conversationId: 'conv-cloud-s',
        conversation: { id: 'conv-cloud-s', runtime_location: 'cloud', project_id: 'proj-1' },
        project: { id: 'proj-1', cloud_instance_id: 'inst-1' },
        cloudRuntimeSessionId: 'sess-abc',
        deleteCloudRuntimeSession,
        saveCloudRuntimeSessionId,
        stop: vi.fn(),
        clearConversationMaps: vi.fn(),
      })

      expect(deleteCloudRuntimeSession).toHaveBeenCalledWith('sess-abc')
      expect(saveCloudRuntimeSessionId).toHaveBeenCalledWith('conv-cloud-s', null)
      expect(result).toEqual({ ok: true, runtime: 'cloud' })
    })

    it('skips deletion when cloudRuntimeSessionId is null', async () => {
      const deleteCloudRuntimeSession = vi.fn()
      const saveCloudRuntimeSessionId = vi.fn()

      const result = await stopSession({
        conversationId: 'conv-cloud-noid',
        conversation: { id: 'conv-cloud-noid', runtime_location: 'cloud', project_id: 'proj-1' },
        project: { id: 'proj-1', cloud_instance_id: 'inst-1' },
        cloudRuntimeSessionId: null,
        deleteCloudRuntimeSession,
        saveCloudRuntimeSessionId,
        stop: vi.fn(),
        clearConversationMaps: vi.fn(),
      })

      expect(deleteCloudRuntimeSession).not.toHaveBeenCalled()
      expect(saveCloudRuntimeSessionId).toHaveBeenCalledWith('conv-cloud-noid', null)
      expect(result).toEqual({ ok: true, runtime: 'cloud' })
    })

    it('skips deletion when project has no cloud_instance_id', async () => {
      const deleteCloudRuntimeSession = vi.fn()
      const saveCloudRuntimeSessionId = vi.fn()

      const result = await stopSession({
        conversationId: 'conv-cloud-noinst',
        conversation: { id: 'conv-cloud-noinst', runtime_location: 'cloud', project_id: 'proj-1' },
        project: { id: 'proj-1', cloud_instance_id: null },
        cloudRuntimeSessionId: 'sess-xyz',
        deleteCloudRuntimeSession,
        saveCloudRuntimeSessionId,
        stop: vi.fn(),
        clearConversationMaps: vi.fn(),
      })

      expect(deleteCloudRuntimeSession).not.toHaveBeenCalled()
      expect(saveCloudRuntimeSessionId).toHaveBeenCalledWith('conv-cloud-noinst', null)
      expect(result).toEqual({ ok: true, runtime: 'cloud' })
    })

    it('swallows deleteCloudRuntimeSession errors', async () => {
      const deleteCloudRuntimeSession = vi.fn().mockRejectedValue(new Error('network error'))
      const saveCloudRuntimeSessionId = vi.fn()

      const result = await stopSession({
        conversationId: 'conv-cloud-err',
        conversation: { id: 'conv-cloud-err', runtime_location: 'cloud', project_id: 'proj-1' },
        project: { id: 'proj-1', cloud_instance_id: 'inst-1' },
        cloudRuntimeSessionId: 'sess-err',
        deleteCloudRuntimeSession,
        saveCloudRuntimeSessionId,
        stop: vi.fn(),
        clearConversationMaps: vi.fn(),
      })

      // Still succeeds — deletion errors are swallowed
      expect(saveCloudRuntimeSessionId).toHaveBeenCalledWith('conv-cloud-err', null)
      expect(result).toEqual({ ok: true, runtime: 'cloud' })
    })
  })

  describe('local conversation', () => {
    it('calls stop and returns ok:true on success', async () => {
      const stop = vi.fn().mockResolvedValue(undefined)
      const clearConversationMaps = vi.fn()

      const result = await stopSession({
        conversationId: 'conv-local-s',
        conversation: { id: 'conv-local-s', runtime_location: 'local', project_id: null },
        project: null,
        cloudRuntimeSessionId: null,
        deleteCloudRuntimeSession: vi.fn(),
        saveCloudRuntimeSessionId: vi.fn(),
        stop,
        clearConversationMaps,
      })

      expect(stop).toHaveBeenCalledWith('conv-local-s')
      expect(result).toEqual({ ok: true })
    })

    it('clearConversationMaps runs in finally even when stop() throws', async () => {
      const stop = vi.fn().mockRejectedValue(new Error('stop failed'))
      const clearConversationMaps = vi.fn()

      // stopSession propagates the error from stop(), but clearConversationMaps
      // still runs in the finally block.
      await expect(
        stopSession({
          conversationId: 'conv-local-err',
          conversation: { id: 'conv-local-err', runtime_location: 'local', project_id: null },
          project: null,
          cloudRuntimeSessionId: null,
          deleteCloudRuntimeSession: vi.fn(),
          saveCloudRuntimeSessionId: vi.fn(),
          stop,
          clearConversationMaps,
        }),
      ).rejects.toThrow('stop failed')

      expect(clearConversationMaps).toHaveBeenCalledWith('conv-local-err')
    })

    it('clearConversationMaps is called even when stop() resolves', async () => {
      const stop = vi.fn().mockResolvedValue(undefined)
      const clearConversationMaps = vi.fn()

      await stopSession({
        conversationId: 'conv-local-ok',
        conversation: { id: 'conv-local-ok', runtime_location: 'local', project_id: null },
        project: null,
        cloudRuntimeSessionId: null,
        deleteCloudRuntimeSession: vi.fn(),
        saveCloudRuntimeSessionId: vi.fn(),
        stop,
        clearConversationMaps,
      })

      expect(clearConversationMaps).toHaveBeenCalledWith('conv-local-ok')
    })
  })
})

// -------------------------------------------------------------------------
// Tests: pi:getSnapshot
// -------------------------------------------------------------------------
describe('pi:getSnapshot', () => {
  describe('input validation', () => {
    it('returns error status when conversationId is null', async () => {
      const result = await getSnapshot({
        conversationId: null as unknown as string,
        conversation: null,
        getCloudSnapshot: vi.fn(),
        getLocalSnapshot: vi.fn(),
      })
      expect(result).toEqual({ status: 'error', state: null, messages: [] })
    })

    it('returns error status when conversationId is undefined', async () => {
      const result = await getSnapshot({
        conversationId: undefined as unknown as string,
        conversation: null,
        getCloudSnapshot: vi.fn(),
        getLocalSnapshot: vi.fn(),
      })
      expect(result).toEqual({ status: 'error', state: null, messages: [] })
    })

    it('returns error status when conversationId is empty string', async () => {
      const result = await getSnapshot({
        conversationId: '',
        conversation: null,
        getCloudSnapshot: vi.fn(),
        getLocalSnapshot: vi.fn(),
      })
      expect(result).toEqual({ status: 'error', state: null, messages: [] })
    })

    it('returns error status when conversationId is whitespace-only', async () => {
      const result = await getSnapshot({
        conversationId: '   ',
        conversation: null,
        getCloudSnapshot: vi.fn(),
        getLocalSnapshot: vi.fn(),
      })
      expect(result).toEqual({ status: 'error', state: null, messages: [] })
    })

    it('does not call any deps when conversationId is invalid', async () => {
      const getCloudSnapshot = vi.fn()
      const getLocalSnapshot = vi.fn()
      await getSnapshot({
        conversationId: '' as string,
        conversation: null,
        getCloudSnapshot,
        getLocalSnapshot,
      })
      expect(getCloudSnapshot).not.toHaveBeenCalled()
      expect(getLocalSnapshot).not.toHaveBeenCalled()
    })

    it('trims conversationId before use', async () => {
      const getCloudSnapshot = vi.fn().mockResolvedValue({
        status: 'ok',
        state: { messages: [] },
        messages: [],
      })
      await getSnapshot({
        conversationId: '  conv-cloud-trimmed  ',
        conversation: { id: 'conv-cloud-trimmed', runtime_location: 'cloud', project_id: 'proj-1' },
        getCloudSnapshot,
        getLocalSnapshot: vi.fn(),
      })
      expect(getCloudSnapshot).toHaveBeenCalledWith('conv-cloud-trimmed')
    })
  })

  describe('conversation not found', () => {
    it('returns error status with null state and empty messages', async () => {
      const result = await getSnapshot({
        conversationId: 'conv-missing',
        conversation: null,
        getCloudSnapshot: vi.fn(),
        getLocalSnapshot: vi.fn(),
      })

      expect(result).toEqual({ status: 'error', state: null, messages: [] })
    })
  })

  describe('cloud conversation', () => {
    it('delegates to getCloudSnapshot', async () => {
      const getCloudSnapshot = vi.fn().mockResolvedValue({
        status: 'ok',
        state: { messages: ['hello'] },
        messages: [],
      })

      const result = await getSnapshot({
        conversationId: 'conv-cloud-snap',
        conversation: { id: 'conv-cloud-snap', runtime_location: 'cloud', project_id: 'proj-1' },
        getCloudSnapshot,
        getLocalSnapshot: vi.fn(),
      })

      expect(getCloudSnapshot).toHaveBeenCalledWith('conv-cloud-snap')
      expect(result).toEqual({
        status: 'ok',
        state: { messages: ['hello'] },
        messages: [],
      })
    })

    it('does not call getLocalSnapshot for cloud conversations', async () => {
      const getLocalSnapshot = vi.fn()

      await getSnapshot({
        conversationId: 'conv-cloud-noloc',
        conversation: { id: 'conv-cloud-noloc', runtime_location: 'cloud', project_id: 'proj-1' },
        getCloudSnapshot: vi.fn().mockResolvedValue({ status: 'ok', state: {}, messages: [] }),
        getLocalSnapshot,
      })

      expect(getLocalSnapshot).not.toHaveBeenCalled()
    })
  })

  describe('local conversation', () => {
    it('delegates to getLocalSnapshot on success', async () => {
      const getLocalSnapshot = vi.fn().mockResolvedValue({
        status: 'ok',
        state: { turnIndex: 0 },
        messages: [{ role: 'user', content: 'hi' }],
      })

      const result = await getSnapshot({
        conversationId: 'conv-local-snap',
        conversation: { id: 'conv-local-snap', runtime_location: 'local', project_id: null },
        getCloudSnapshot: vi.fn(),
        getLocalSnapshot,
      })

      expect(getLocalSnapshot).toHaveBeenCalledWith('conv-local-snap')
      expect(result).toEqual({
        status: 'ok',
        state: { turnIndex: 0 },
        messages: [{ role: 'user', content: 'hi' }],
      })
    })

    it('does not call getCloudSnapshot for local conversations', async () => {
      const getCloudSnapshot = vi.fn()

      await getSnapshot({
        conversationId: 'conv-local-nocloud',
        conversation: { id: 'conv-local-nocloud', runtime_location: 'local', project_id: null },
        getCloudSnapshot,
        getLocalSnapshot: vi.fn().mockResolvedValue({ status: 'ok', state: {}, messages: [] }),
      })

      expect(getCloudSnapshot).not.toHaveBeenCalled()
    })
  })
})

// TEST MARKER