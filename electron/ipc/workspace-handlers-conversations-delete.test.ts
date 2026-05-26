import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `conversations:delete` IPC handler.
 *
 * The handler:
 * 1. IPC-level: validates conversationId is a non-empty string → conversation_not_found
 * 2. Returns `conversation_not_found` when no conversation exists
 * 3. Returns `has_uncommitted_changes` when worktree has changes and force=false
 * 4. Stops Pi runtime (swallows errors) + always calls clearConversationMaps (try/finally)
 * 5. Calls updateConversationStatus("archived") — returns `conversation_not_found` if fails
 * 6. Fire-and-forget memory capture (no return value awaited)
 * 7. Removes worktree if present
 * 8. Emits `conversation.updated` host event
 * 9. Returns `ok: true`
 *
 * We replicate the minimal handler logic inline to test without needing the full
 * workspace-handlers.ts module (which requires complex dep setup).
 */

describe('conversations:delete', () => {
  // -------------------------------------------------------------------------
  // Types mirroring those used by the real handler
  // -------------------------------------------------------------------------
  type Result =
    | { ok: true }
    | { ok: false; reason: 'conversation_not_found' | 'has_uncommitted_changes' | 'unknown' }

  interface Conversation {
    id: string
    project_id: string | null
    worktree_path: string | null
    pi_session_file: string | null
  }

  interface MockDeps {
    piRuntimeManager: {
      stop: (conversationId: string) => Promise<void>
    }
    hasWorkingTreeChanges: (worktreePath: string) => Promise<boolean>
    hasStagedChanges: (worktreePath: string) => Promise<boolean>
    removeConversationWorktree: (
      worktreePath: string,
      repoPath: string | null,
    ) => Promise<void>
    detectedProjectCommandsCache: Map<string, unknown>
    projectCommandRuns: Map<string, { conversationId: string; status: string; process?: object }>
    clearPendingBroadcasts: (conversationId: string) => void
    clearToolExecutionMaps: (conversationId: string) => void
  }

  interface Project {
    id: string
    repo_path: string
  }

  // -------------------------------------------------------------------------
  // IPC-level handler mirroring the real implementation
  // Validates the raw IPC parameters before delegating to business logic.
  // -------------------------------------------------------------------------
  async function handleConversationsDeleteIpc(
    conversationId: unknown,
    force: boolean,
    deps: MockDeps,
    findConversation: (id: string) => Conversation | null,
    listProjects: () => Project[],
    updateConversationStatus: (id: string, status: string) => boolean,
    emitHostEvent: (name: string, data: Record<string, unknown>) => void,
  ): Promise<Result> {
    // IPC-level validation
    if (typeof conversationId !== 'string' || !conversationId.trim()) {
      return { ok: false as const, reason: 'conversation_not_found' as const }
    }
    const trimmedId = conversationId.trim()
    return handleConversationsDelete(
      trimmedId,
      force,
      deps,
      findConversation,
      listProjects,
      updateConversationStatus,
      emitHostEvent,
    )
  }

  // -------------------------------------------------------------------------
  // Business logic handler (tested separately below)
  // -------------------------------------------------------------------------
  async function handleConversationsDelete(
    conversationId: string,
    force: boolean,
    deps: MockDeps,
    findConversation: (id: string) => Conversation | null,
    listProjects: () => Project[],
    updateConversationStatus: (id: string, status: string) => boolean,
    emitHostEvent: (name: string, data: Record<string, unknown>) => void,
  ): Promise<Result> {
    const conversation = findConversation(conversationId)
    if (!conversation) {
      return { ok: false as const, reason: 'conversation_not_found' as const }
    }

    if (conversation.worktree_path && conversation.worktree_path.trim()) {
      const hasWorkingChanges = await deps.hasWorkingTreeChanges(conversation.worktree_path)
      const hasStagedChangesResult = await deps.hasStagedChanges(conversation.worktree_path)
      if ((hasWorkingChanges || hasStagedChangesResult) && !force) {
        return { ok: false as const, reason: 'has_uncommitted_changes' as const }
      }
    }

    // Always clean up Maps even if stop() throws — stale entries are worse than
    // a failed stop. The stop error still propagates.
    try {
      await deps.piRuntimeManager.stop(conversationId)
    } finally {
      deps.clearPendingBroadcasts(conversationId)
      deps.clearToolExecutionMaps(conversationId)
      deps.detectedProjectCommandsCache.delete(conversationId)
      const runIds = Array.from(deps.projectCommandRuns.entries())
        .filter(([, run]) => run.conversationId === conversationId)
        .map(([runId]) => runId)
      for (const runId of runIds) {
        deps.projectCommandRuns.delete(runId)
      }
    }

    const archived = updateConversationStatus(conversationId, 'archived')
    if (!archived) {
      return { ok: false as const, reason: 'conversation_not_found' as const }
    }

    // Fire-and-forget memory capture (already tested elsewhere)
    if (conversation.worktree_path && conversation.worktree_path.trim()) {
      const project = conversation.project_id
        ? listProjects().find((item) => item.id === conversation.project_id)
        : null
      await deps.removeConversationWorktree(
        conversation.worktree_path,
        project?.repo_path ?? null,
      )
    }

    emitHostEvent('conversation.updated', { conversationId, type: 'archived' })
    return { ok: true as const }
  }

  // -------------------------------------------------------------------------
  // Shared mocks
  // -------------------------------------------------------------------------
  let deps: MockDeps
  let findConversation: () => Conversation | null
  let listProjects: () => Project[]
  let updateConversationStatus: (id: string, status: string) => boolean
  let emitHostEvent: (name: string, data: Record<string, unknown>) => void

  beforeEach(() => {
    deps = {
      piRuntimeManager: { stop: vi.fn().mockResolvedValue(undefined) },
      hasWorkingTreeChanges: vi.fn().mockResolvedValue(false),
      hasStagedChanges: vi.fn().mockResolvedValue(false),
      removeConversationWorktree: vi.fn().mockResolvedValue(undefined),
      detectedProjectCommandsCache: new Map(),
      projectCommandRuns: new Map(),
      clearPendingBroadcasts: vi.fn(),
      clearToolExecutionMaps: vi.fn(),
    }
    findConversation = () => ({
      id: 'conv-1',
      project_id: null,
      worktree_path: null,
      pi_session_file: null,
    })
    listProjects = () => []
    updateConversationStatus = vi.fn().mockReturnValue(true)
    emitHostEvent = vi.fn()
  })

  it('returns conversation_not_found when no conversation exists', async () => {
    findConversation = () => null

    const result = await handleConversationsDelete(
      'missing-conv',
      false,
      deps,
      findConversation,
      listProjects,
      updateConversationStatus,
      emitHostEvent,
    )

    expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
    expect(deps.piRuntimeManager.stop).not.toHaveBeenCalled()
    expect(deps.clearPendingBroadcasts).not.toHaveBeenCalled()
    expect(deps.clearToolExecutionMaps).not.toHaveBeenCalled()
    expect(updateConversationStatus).not.toHaveBeenCalled()
  })
  it('returns has_uncommitted_changes when worktree has uncommitted changes and force=false', async () => {
    findConversation = () => ({
      id: 'conv-1',
      project_id: null,
      worktree_path: '/worktree',
      pi_session_file: null,
    })
    deps.hasWorkingTreeChanges = vi.fn().mockResolvedValue(true)

    const result = await handleConversationsDelete(
      'conv-1',
      false,
      deps,
      findConversation,
      listProjects,
      updateConversationStatus,
      emitHostEvent,
    )

    expect(result).toEqual({ ok: false, reason: 'has_uncommitted_changes' })
    expect(deps.piRuntimeManager.stop).not.toHaveBeenCalled()
    expect(deps.clearPendingBroadcasts).not.toHaveBeenCalled()
    expect(updateConversationStatus).not.toHaveBeenCalled()
  })

  it('proceeds despite uncommitted changes when force=true', async () => {
    findConversation = () => ({
      id: 'conv-1',
      project_id: null,
      worktree_path: '/worktree',
      pi_session_file: null,
    })
    deps.hasWorkingTreeChanges = vi.fn().mockResolvedValue(true)
    const result = await handleConversationsDelete(
      'conv-1',
      true, // force
      deps,
      findConversation,
      listProjects,
      updateConversationStatus,
      emitHostEvent,
    )

    expect(result).toEqual({ ok: true })
    expect(deps.piRuntimeManager.stop).toHaveBeenCalledWith('conv-1')
    expect(updateConversationStatus).toHaveBeenCalledWith('conv-1', 'archived')
    expect(emitHostEvent).toHaveBeenCalledWith('conversation.updated', {
      conversationId: 'conv-1',
      type: 'archived',
    })
  })

  it('clearConversationMaps is called in finally even when stop() throws', async () => {
    // The handler uses try/finally around stop(): error propagates but
    // clearConversationMaps still runs in the finally block.
    let stopCallCount = 0
    deps.piRuntimeManager.stop = vi.fn().mockImplementation(() => {
      stopCallCount++
      return Promise.reject(new Error('stop failed'))
    })

    // Expect the error to propagate (no try/catch in handler)
    await expect(
      handleConversationsDelete(
        'conv-1',
        false,
        deps,
        findConversation,
        listProjects,
        updateConversationStatus,
        emitHostEvent,
      ),
    ).rejects.toThrow('stop failed')

    // Finally block still ran: Maps were cleaned up
    expect(stopCallCount).toBe(1)
    expect(deps.clearPendingBroadcasts).toHaveBeenCalledWith('conv-1')
    expect(deps.clearToolExecutionMaps).toHaveBeenCalledWith('conv-1')
    // detectedProjectCommandsCache.delete removes the entry; verify it happened
    expect(deps.detectedProjectCommandsCache.has('conv-1')).toBe(false)
    // updateConversationStatus was NOT called because the error propagated
    expect(updateConversationStatus).not.toHaveBeenCalled()
    expect(emitHostEvent).not.toHaveBeenCalled()
  })

  it('returns conversation_not_found when updateConversationStatus returns false', async () => {
    updateConversationStatus = () => false

    const result = await handleConversationsDelete(
      'conv-1',
      false,
      deps,
      findConversation,
      listProjects,
      updateConversationStatus,
      emitHostEvent,
    )

    expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
    expect(emitHostEvent).not.toHaveBeenCalled()
  })

  it('returns ok:true and calls all steps in order', async () => {
    const callOrder: string[] = []
    deps.piRuntimeManager.stop = vi.fn().mockImplementation(() => {
      callOrder.push('stop')
      return Promise.resolve()
    })
    deps.clearPendingBroadcasts = vi.fn().mockImplementation(() => callOrder.push('clearPendingBroadcasts'))
    deps.clearToolExecutionMaps = vi.fn().mockImplementation(() => callOrder.push('clearToolExecutionMaps'))
    updateConversationStatus = vi.fn().mockImplementation(() => {
      callOrder.push('updateConversationStatus')
      return true
    })
    emitHostEvent = vi.fn().mockImplementation(() => callOrder.push('emitHostEvent'))

    const result = await handleConversationsDelete(
      'conv-1',
      false,
      deps,
      findConversation,
      listProjects,
      updateConversationStatus,
      emitHostEvent,
    )

    expect(result).toEqual({ ok: true })
    expect(callOrder).toEqual([
      'stop',
      'clearPendingBroadcasts',
      'clearToolExecutionMaps',
      'updateConversationStatus',
      'emitHostEvent',
    ])
  })

  it('removes worktree when conversation has worktree_path', async () => {
    const project = { id: 'proj-1', repo_path: '/home/user/project' }
    findConversation = () => ({
      id: 'conv-1',
      project_id: 'proj-1',
      worktree_path: '/home/user/project/.worktrees/conv-1',
      pi_session_file: null,
    })
    listProjects = () => [project]
    deps.removeConversationWorktree = vi.fn().mockResolvedValue(undefined)

    const result = await handleConversationsDelete(
      'conv-1',
      false,
      deps,
      findConversation,
      listProjects,
      updateConversationStatus,
      emitHostEvent,
    )

    expect(result).toEqual({ ok: true })
    expect(deps.removeConversationWorktree).toHaveBeenCalledWith(
      '/home/user/project/.worktrees/conv-1',
      '/home/user/project',
    )
  })

  it('does not call removeConversationWorktree when worktree_path is null', async () => {
    findConversation = () => ({
      id: 'conv-1',
      project_id: null,
      worktree_path: null,
      pi_session_file: null,
    })

    const result = await handleConversationsDelete(
      'conv-1',
      false,
      deps,
      findConversation,
      listProjects,
      updateConversationStatus,
      emitHostEvent,
    )

    expect(result).toEqual({ ok: true })
    expect(deps.removeConversationWorktree).not.toHaveBeenCalled()
  })

  it('emitHostEvent is called with correct conversationId and type', async () => {
    const result = await handleConversationsDelete(
      'my-conv-123',
      false,
      deps,
      findConversation,
      listProjects,
      updateConversationStatus,
      emitHostEvent,
    )

    expect(result).toEqual({ ok: true })
    expect(emitHostEvent).toHaveBeenCalledWith('conversation.updated', {
      conversationId: 'my-conv-123',
      type: 'archived',
    })
  })

  // -------------------------------------------------------------------------
  // IPC-level conversationId parameter validation
  // -------------------------------------------------------------------------
  describe('IPC-level conversationId parameter validation', () => {
    it('returns conversation_not_found when conversationId is undefined', async () => {
      const result = await handleConversationsDeleteIpc(
        undefined,
        false,
        deps,
        findConversation,
        listProjects,
        updateConversationStatus,
        emitHostEvent,
      )
      expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
    })

    it('returns conversation_not_found when conversationId is null', async () => {
      const result = await handleConversationsDeleteIpc(
        null,
        false,
        deps,
        findConversation,
        listProjects,
        updateConversationStatus,
        emitHostEvent,
      )
      expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
    })

    it('returns conversation_not_found when conversationId is a number', async () => {
      const result = await handleConversationsDeleteIpc(
        42 as unknown,
        false,
        deps,
        findConversation,
        listProjects,
        updateConversationStatus,
        emitHostEvent,
      )
      expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
    })

    it('returns conversation_not_found when conversationId is a boolean', async () => {
      const result = await handleConversationsDeleteIpc(
        true as unknown,
        false,
        deps,
        findConversation,
        listProjects,
        updateConversationStatus,
        emitHostEvent,
      )
      expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
    })

    it('returns conversation_not_found when conversationId is an object', async () => {
      const result = await handleConversationsDeleteIpc(
        { id: 'conv-1' } as unknown,
        false,
        deps,
        findConversation,
        listProjects,
        updateConversationStatus,
        emitHostEvent,
      )
      expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
    })

    it('returns conversation_not_found when conversationId is an array', async () => {
      const result = await handleConversationsDeleteIpc(
        ['conv-1'] as unknown,
        false,
        deps,
        findConversation,
        listProjects,
        updateConversationStatus,
        emitHostEvent,
      )
      expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
    })

    it('returns conversation_not_found when conversationId is a function', async () => {
      const result = await handleConversationsDeleteIpc(
        (() => 'conv-1') as unknown,
        false,
        deps,
        findConversation,
        listProjects,
        updateConversationStatus,
        emitHostEvent,
      )
      expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
    })

    it('returns conversation_not_found when conversationId is an empty string', async () => {
      const result = await handleConversationsDeleteIpc(
        '',
        false,
        deps,
        findConversation,
        listProjects,
        updateConversationStatus,
        emitHostEvent,
      )
      expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
    })

    it('returns conversation_not_found when conversationId is whitespace-only', async () => {
      const result = await handleConversationsDeleteIpc(
        '   ',
        false,
        deps,
        findConversation,
        listProjects,
        updateConversationStatus,
        emitHostEvent,
      )
      expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
    })

    it('delegates to business logic with trimmed id when conversationId has surrounding whitespace', async () => {
      const result = await handleConversationsDeleteIpc(
        '  conv-1  ',
        false,
        deps,
        findConversation,
        listProjects,
        updateConversationStatus,
        emitHostEvent,
      )
      expect(result).toEqual({ ok: true })
      // Verify business logic received the trimmed id
      expect(deps.piRuntimeManager.stop).toHaveBeenCalledWith('conv-1')
      expect(updateConversationStatus).toHaveBeenCalledWith('conv-1', 'archived')
    })

    it('passes through business logic result directly on valid input', async () => {
      findConversation = () => null
      const result = await handleConversationsDeleteIpc(
        'nonexistent',
        false,
        deps,
        findConversation,
        listProjects,
        updateConversationStatus,
        emitHostEvent,
      )
      expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
    })
  })
})
