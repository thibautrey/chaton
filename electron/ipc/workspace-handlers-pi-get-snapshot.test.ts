import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  warnSpy.mockRestore()
})

/**
 * Unit tests for the `pi:getSnapshot` IPC handler.
 *
 * The handler (workspace-handlers.ts lines 4367–4397) has five paths:
 * 1. Conversation not found → { status: "error", state: null, messages: [] }
 * 2. Cloud runtime, getCloudRuntimeSnapshot succeeds → passthrough result
 * 3. Cloud runtime, getCloudRuntimeSnapshot throws → returns safe error response
 * 4. Local runtime, piRuntimeManager.getSnapshot succeeds → passthrough result
 * 5. Local runtime, piRuntimeManager.getSnapshot throws → returns safe error response
 *
 * Paths 3 and 5 were added to prevent unhandled IPC rejections from reaching the
 * renderer. We replicate the handler logic inline to test the branching and error
 * safety outcomes without needing the full workspace-handlers.ts module.
 */

describe('pi:getSnapshot handler branching', () => {
  // -------------------------------------------------------------------------
  // Minimal types mirroring those used by the real handler
  // -------------------------------------------------------------------------
  interface Conversation {
    id: string
    runtime_location: 'local' | 'cloud'
    [key: string]: unknown
  }
  interface PiSnapshot {
    state: unknown
    messages: unknown[]
  }
  interface GetSnapshotResult {
    status: 'ok'
    state: unknown
    messages: unknown[]
  }
  interface GetSnapshotError {
    status: 'error'
    state: null
    messages: unknown[]
  }

  // -------------------------------------------------------------------------
  // Inline minimal handler — mirrors workspace-handlers.ts lines 4367–4397.
  // Key additions vs old handler: try/catch around both cloud and local paths
  // to prevent unhandled IPC rejections from reaching the renderer.
  // -------------------------------------------------------------------------
  async function getSnapshotHandler(
    db: { findConversationById: (db: unknown, id: string) => Conversation | null },
    deps: { piRuntimeManager: { getSnapshot: (id: string) => Promise<GetSnapshotResult> } },
    getCloudRuntimeSnapshot: (id: string) => Promise<GetSnapshotResult>,
    conversationId: string,
  ): Promise<GetSnapshotResult | { status: 'error'; state: null; messages: [] }> {
    const conversation = db.findConversationById(db, conversationId)
    if (!conversation) {
      return { status: 'error', state: null, messages: [] }
    }
    if (conversation.runtime_location === 'cloud') {
      // Cloud path: getCloudRuntimeSnapshot can throw (network, 404, etc.).
      // `return await` is required so the rejection propagates INTO the try/catch.
      try {
        return await getCloudRuntimeSnapshot(conversationId) as GetSnapshotResult
      } catch (err) {
        console.warn('[pi:getSnapshot] getCloudRuntimeSnapshot threw unexpectedly:', err)
        return { status: 'error', state: null, messages: [] }
      }
    }
    // Local path: piRuntimeManager.getSnapshot can also throw (session bad state, DB).
    // Same `return await` pattern is critical here too.
    try {
      return await deps.piRuntimeManager.getSnapshot(conversationId) as GetSnapshotResult
    } catch (err) {
      console.warn('[pi:getSnapshot] piRuntimeManager.getSnapshot threw unexpectedly:', err)
      return { status: 'error', state: null, messages: [] }
    }
  }

  // -------------------------------------------------------------------------
  // Tests: conversation not found
  // -------------------------------------------------------------------------

  it('returns error status with null state and empty messages when conversation does not exist', async () => {
    const db = { findConversationById: vi.fn<[_unknown, string], Conversation | null>().mockReturnValue(null) }
    const deps = { piRuntimeManager: { getSnapshot: vi.fn() } }
    const getCloudRuntimeSnapshot = vi.fn()

    const result = await getSnapshotHandler(db, deps, getCloudRuntimeSnapshot, 'nonexistent-conv')

    expect(result).toEqual({ status: 'error', state: null, messages: [] })
    expect(db.findConversationById).toHaveBeenCalledOnce()
    expect(deps.piRuntimeManager.getSnapshot).not.toHaveBeenCalled()
    expect(getCloudRuntimeSnapshot).not.toHaveBeenCalled()
  })

  it('returns error when findConversationById returns null even with a valid-looking id', async () => {
    const db = { findConversationById: vi.fn<[_unknown, string], Conversation | null>().mockReturnValue(null) }
    const deps = { piRuntimeManager: { getSnapshot: vi.fn() } }
    const getCloudRuntimeSnapshot = vi.fn()

    // Same id that would exist in a real DB
    const result = await getSnapshotHandler(db, deps, getCloudRuntimeSnapshot, 'conv-12345')

    expect(result).toEqual({ status: 'error', state: null, messages: [] })
  })

  // -------------------------------------------------------------------------
  // Tests: cloud runtime path
  // -------------------------------------------------------------------------

  it('calls getCloudRuntimeSnapshot when conversation runtime_location is cloud', async () => {
    const conversation: Conversation = { id: 'conv-cloud-1', runtime_location: 'cloud' }
    const db = { findConversationById: vi.fn<[_unknown, string], Conversation | null>().mockReturnValue(conversation) }
    const deps = { piRuntimeManager: { getSnapshot: vi.fn() } }
    const cloudSnapshot: GetSnapshotResult = {
      status: 'ok',
      state: { mode: 'cloud', connected: true },
      messages: [{ id: 'msg-1', role: 'assistant', content: 'Hello' }],
    }
    const getCloudRuntimeSnapshot = vi.fn<[string], Promise<GetSnapshotResult>>().mockResolvedValue(cloudSnapshot)

    const result = await getSnapshotHandler(db, deps, getCloudRuntimeSnapshot, 'conv-cloud-1')

    expect(result).toEqual(cloudSnapshot)
    expect(db.findConversationById).toHaveBeenCalledOnce()
    expect(getCloudRuntimeSnapshot).toHaveBeenCalledOnce()
    expect(getCloudRuntimeSnapshot).toHaveBeenCalledWith('conv-cloud-1')
    expect(deps.piRuntimeManager.getSnapshot).not.toHaveBeenCalled()
  })

  it('does not call local getSnapshot when conversation is cloud', async () => {
    const conversation: Conversation = { id: 'conv-cloud-2', runtime_location: 'cloud' }
    const db = { findConversationById: vi.fn<[_unknown, string], Conversation | null>().mockReturnValue(conversation) }
    const deps = { piRuntimeManager: { getSnapshot: vi.fn() } }
    const getCloudRuntimeSnapshot = vi.fn<[string], Promise<GetSnapshotResult>>().mockResolvedValue({
      status: 'ok',
      state: null,
      messages: [],
    })

    await getSnapshotHandler(db, deps, getCloudRuntimeSnapshot, 'conv-cloud-2')

    expect(deps.piRuntimeManager.getSnapshot).not.toHaveBeenCalled()
  })

  it('passes conversationId to getCloudRuntimeSnapshot even with whitespace in id', async () => {
    const conversation: Conversation = { id: 'conv with spaces', runtime_location: 'cloud' }
    const db = { findConversationById: vi.fn<[_unknown, string], Conversation | null>().mockReturnValue(conversation) }
    const deps = { piRuntimeManager: { getSnapshot: vi.fn() } }
    const getCloudRuntimeSnapshot = vi.fn<[string], Promise<GetSnapshotResult>>().mockResolvedValue({
      status: 'ok',
      state: null,
      messages: [],
    })

    await getSnapshotHandler(db, deps, getCloudRuntimeSnapshot, 'conv with spaces')

    expect(getCloudRuntimeSnapshot).toHaveBeenCalledWith('conv with spaces')
  })

  // -------------------------------------------------------------------------
  // Tests: local runtime path
  // -------------------------------------------------------------------------

  it('calls local getSnapshot when conversation runtime_location is local', async () => {
    const conversation: Conversation = { id: 'conv-local-1', runtime_location: 'local' }
    const db = { findConversationById: vi.fn<[_unknown, string], Conversation | null>().mockReturnValue(conversation) }
    const localSnapshot: GetSnapshotResult = {
      status: 'ok',
      state: { mode: 'local', projectPath: '/path/to/project' },
      messages: [{ id: 'msg-1', role: 'user', content: 'Hello' }],
    }
    const deps = {
      piRuntimeManager: {
        getSnapshot: vi.fn<[string], Promise<GetSnapshotResult>>().mockResolvedValue(localSnapshot),
      },
    }
    const getCloudRuntimeSnapshot = vi.fn()

    const result = await getSnapshotHandler(db, deps, getCloudRuntimeSnapshot, 'conv-local-1')

    expect(result).toEqual(localSnapshot)
    expect(db.findConversationById).toHaveBeenCalledOnce()
    expect(deps.piRuntimeManager.getSnapshot).toHaveBeenCalledOnce()
    expect(deps.piRuntimeManager.getSnapshot).toHaveBeenCalledWith('conv-local-1')
    expect(getCloudRuntimeSnapshot).not.toHaveBeenCalled()
  })

  it('does not call cloud getCloudRuntimeSnapshot when conversation is local', async () => {
    const conversation: Conversation = { id: 'conv-local-2', runtime_location: 'local' }
    const db = { findConversationById: vi.fn<[_unknown, string], Conversation | null>().mockReturnValue(conversation) }
    const deps = {
      piRuntimeManager: {
        getSnapshot: vi.fn<[string], Promise<GetSnapshotResult>>().mockResolvedValue({
          status: 'ok',
          state: null,
          messages: [],
        }),
      },
    }
    const getCloudRuntimeSnapshot = vi.fn()

    await getSnapshotHandler(db, deps, getCloudRuntimeSnapshot, 'conv-local-2')

    expect(getCloudRuntimeSnapshot).not.toHaveBeenCalled()
  })

  it('passes conversationId correctly to local getSnapshot', async () => {
    const conversation: Conversation = { id: 'conv-local-exact-id', runtime_location: 'local' }
    const db = { findConversationById: vi.fn<[_unknown, string], Conversation | null>().mockReturnValue(conversation) }
    const deps = {
      piRuntimeManager: {
        getSnapshot: vi.fn<[string], Promise<GetSnapshotResult>>().mockResolvedValue({
          status: 'ok',
          state: null,
          messages: [],
        }),
      },
    }
    const getCloudRuntimeSnapshot = vi.fn()

    await getSnapshotHandler(db, deps, getCloudRuntimeSnapshot, 'conv-local-exact-id')

    expect(deps.piRuntimeManager.getSnapshot).toHaveBeenCalledWith('conv-local-exact-id')
  })

  // -------------------------------------------------------------------------
  // Tests: error result returned from delegates (already existed)
  // -------------------------------------------------------------------------

  it('returns cloud error result when getCloudRuntimeSnapshot resolves to error result', async () => {
    const conversation: Conversation = { id: 'conv-cloud-error', runtime_location: 'cloud' }
    const db = { findConversationById: vi.fn<[_unknown, string], Conversation | null>().mockReturnValue(conversation) }
    const deps = { piRuntimeManager: { getSnapshot: vi.fn() } }
    const errorResult: GetSnapshotError = {
      status: 'error',
      state: null,
      messages: [],
    }
    const getCloudRuntimeSnapshot = vi.fn<[string], Promise<GetSnapshotError>>().mockResolvedValue(errorResult)

    const result = await getSnapshotHandler(db, deps, getCloudRuntimeSnapshot, 'conv-cloud-error')

    expect(result).toEqual(errorResult)
  })

  it('returns local error result when local getSnapshot resolves to error result', async () => {
    const conversation: Conversation = { id: 'conv-local-error', runtime_location: 'local' }
    const db = { findConversationById: vi.fn<[_unknown, string], Conversation | null>().mockReturnValue(conversation) }
    const errorResult: GetSnapshotError = {
      status: 'error',
      state: null,
      messages: [],
    }
    const deps = {
      piRuntimeManager: {
        getSnapshot: vi.fn<[string], Promise<GetSnapshotError>>().mockResolvedValue(errorResult),
      },
    }
    const getCloudRuntimeSnapshot = vi.fn()

    const result = await getSnapshotHandler(db, deps, getCloudRuntimeSnapshot, 'conv-local-error')

    expect(result).toEqual(errorResult)
  })

  // -------------------------------------------------------------------------
  // Tests: error thrown from delegates (new — try/catch safety paths)
  // -------------------------------------------------------------------------

  describe('cloud path — getCloudRuntimeSnapshot throws', () => {
    it('returns safe error response when getCloudRuntimeSnapshot throws an Error', async () => {
      const conversation: Conversation = { id: 'conv-cloud-throw', runtime_location: 'cloud' }
      const db = { findConversationById: vi.fn<[_unknown, string], Conversation | null>().mockReturnValue(conversation) }
      const deps = { piRuntimeManager: { getSnapshot: vi.fn() } }
      // mockRejectedValue throws synchronously — wrap in async so it returns a
      // rejected Promise, matching how a real async function would fail.
      const getCloudRuntimeSnapshot = vi.fn<[string], Promise<GetSnapshotResult>>()
        .mockImplementation(async () => { throw new Error('network timeout') })

      const result = await getSnapshotHandler(db, deps, getCloudRuntimeSnapshot, 'conv-cloud-throw')

      expect(result).toEqual({ status: 'error', state: null, messages: [] })
      expect(warnSpy).toHaveBeenCalledWith(
        '[pi:getSnapshot] getCloudRuntimeSnapshot threw unexpectedly:',
        expect.any(Error),
      )
    })

    it('returns safe error response when getCloudRuntimeSnapshot throws a non-Error value', async () => {
      const conversation: Conversation = { id: 'conv-cloud-throw-2', runtime_location: 'cloud' }
      const db = { findConversationById: vi.fn<[_unknown, string], Conversation | null>().mockReturnValue(conversation) }
      const deps = { piRuntimeManager: { getSnapshot: vi.fn() } }
      // Simulate a network layer that throws a plain string (e.g. 'ECONNREFUSED').
      const getCloudRuntimeSnapshot = vi.fn<[string], Promise<GetSnapshotResult>>()
        .mockImplementation(async () => { throw 'ECONNREFUSED' })

      const result = await getSnapshotHandler(db, deps, getCloudRuntimeSnapshot, 'conv-cloud-throw-2')

      expect(result).toEqual({ status: 'error', state: null, messages: [] })
    })
  })

  describe('local path — piRuntimeManager.getSnapshot throws', () => {
    it('returns safe error response when local getSnapshot throws an Error', async () => {
      const conversation: Conversation = { id: 'conv-local-throw', runtime_location: 'local' }
      const db = { findConversationById: vi.fn<[_unknown, string], Conversation | null>().mockReturnValue(conversation) }
      const deps = {
        piRuntimeManager: {
          getSnapshot: vi.fn<[string], Promise<GetSnapshotResult>>()
            .mockImplementation(async () => { throw new Error('session corrupted') }),
        },
      }
      const getCloudRuntimeSnapshot = vi.fn()

      const result = await getSnapshotHandler(db, deps, getCloudRuntimeSnapshot, 'conv-local-throw')

      expect(result).toEqual({ status: 'error', state: null, messages: [] })
      expect(warnSpy).toHaveBeenCalledWith(
        '[pi:getSnapshot] piRuntimeManager.getSnapshot threw unexpectedly:',
        expect.any(Error),
      )
    })

    it('returns safe error response when local getSnapshot throws a non-Error value', async () => {
      const conversation: Conversation = { id: 'conv-local-throw-2', runtime_location: 'local' }
      const db = { findConversationById: vi.fn<[_unknown, string], Conversation | null>().mockReturnValue(conversation) }
      const deps = {
        piRuntimeManager: {
          getSnapshot: vi.fn<[string], Promise<GetSnapshotResult>>()
            .mockImplementation(async () => { throw null }),
        },
      }
      const getCloudRuntimeSnapshot = vi.fn()

      const result = await getSnapshotHandler(db, deps, getCloudRuntimeSnapshot, 'conv-local-throw-2')

      expect(result).toEqual({ status: 'error', state: null, messages: [] })
    })
  })

  // -------------------------------------------------------------------------
  // Tests: runtime_location edge cases
  // -------------------------------------------------------------------------

  it('uses cloud path for runtime_location explicitly set to cloud', async () => {
    const conversation: Conversation = { id: 'conv-explicit-cloud', runtime_location: 'cloud' }
    const db = { findConversationById: vi.fn<[_unknown, string], Conversation | null>().mockReturnValue(conversation) }
    const deps = { piRuntimeManager: { getSnapshot: vi.fn() } }
    const getCloudRuntimeSnapshot = vi.fn<[string], Promise<GetSnapshotResult>>().mockResolvedValue({
      status: 'ok',
      state: { location: 'cloud' },
      messages: [],
    })

    await getSnapshotHandler(db, deps, getCloudRuntimeSnapshot, 'conv-explicit-cloud')

    expect(getCloudRuntimeSnapshot).toHaveBeenCalled()
    expect(deps.piRuntimeManager.getSnapshot).not.toHaveBeenCalled()
  })

  it('uses local path for runtime_location explicitly set to local', async () => {
    const conversation: Conversation = { id: 'conv-explicit-local', runtime_location: 'local' }
    const db = { findConversationById: vi.fn<[_unknown, string], Conversation | null>().mockReturnValue(conversation) }
    const deps = {
      piRuntimeManager: {
        getSnapshot: vi.fn<[string], Promise<GetSnapshotResult>>().mockResolvedValue({
          status: 'ok',
          state: { location: 'local' },
          messages: [],
        }),
      },
    }
    const getCloudRuntimeSnapshot = vi.fn()

    await getSnapshotHandler(db, deps, getCloudRuntimeSnapshot, 'conv-explicit-local')

    expect(deps.piRuntimeManager.getSnapshot).toHaveBeenCalled()
    expect(getCloudRuntimeSnapshot).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Tests: conversation lookup behavior
  // -------------------------------------------------------------------------

  it('looks up conversation by the provided conversationId', async () => {
    const conversation: Conversation = { id: 'conv-lookup-1', runtime_location: 'local' }
    const db = { findConversationById: vi.fn<[_unknown, string], Conversation | null>().mockReturnValue(conversation) }
    const deps = {
      piRuntimeManager: {
        getSnapshot: vi.fn<[string], Promise<GetSnapshotResult>>().mockResolvedValue({
          status: 'ok',
          state: null,
          messages: [],
        }),
      },
    }
    const getCloudRuntimeSnapshot = vi.fn()

    await getSnapshotHandler(db, deps, getCloudRuntimeSnapshot, 'conv-lookup-1')

    expect(db.findConversationById).toHaveBeenCalledWith(db, 'conv-lookup-1')
  })

  it('returns error without calling any delegate when conversation lookup returns null', async () => {
    const db = { findConversationById: vi.fn<[_unknown, string], Conversation | null>().mockReturnValue(null) }
    const deps = { piRuntimeManager: { getSnapshot: vi.fn() } }
    const getCloudRuntimeSnapshot = vi.fn()

    const result = await getSnapshotHandler(db, deps, getCloudRuntimeSnapshot, 'ghost-conv')

    expect(result).toEqual({ status: 'error', state: null, messages: [] })
    expect(deps.piRuntimeManager.getSnapshot).not.toHaveBeenCalled()
    expect(getCloudRuntimeSnapshot).not.toHaveBeenCalled()
  })
})
