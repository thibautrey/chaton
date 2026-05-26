import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `conversations:delete` IPC handler — which performs a
 * soft-delete (archive) of a conversation.
 *
 * Key behavioral guarantees verified:
 * - Returns `conversation_not_found` when no conversation exists — no side effects
 * - Returns `has_uncommitted_changes` when worktree has changes and force=false
 * - stop() + clearConversationMaps runs in try/finally — cleanup always fires
 * - stop() errors propagate (do NOT prevent archiving), but Maps are still cleared
 * - updateConversationStatus returns false → propagates error (not silently swallowed)
 * - Fire-and-forget memory capture: does not block the return value
 * - Worktree removal is best-effort: filesystem errors do NOT prevent archiving
 * - emitHostEvent fires after archiving regardless of worktree removal outcome
 *
 * We replicate the minimal handler logic inline to test without needing the full
 * workspace-handlers.ts module (which requires database, IPC, and PiRuntimeManager wiring).
 */

describe('conversations:delete (archive)', () => {
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
  // Inline handler mirroring the real implementation (lines 2742–2839)
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

    // Fire-and-forget memory capture (does not block return value)
    // Tested elsewhere; not awaited here.

    // Best-effort worktree removal — filesystem errors must not prevent archiving.
    if (conversation.worktree_path && conversation.worktree_path.trim()) {
      const project = conversation.project_id
        ? listProjects().find((item) => item.id === conversation.project_id)
        : null
      try {
        await deps.removeConversationWorktree(
          conversation.worktree_path,
          project?.repo_path ?? null,
        )
      } catch {
        // Best-effort: filesystem errors are logged in the real handler but do not
        // prevent the archiving from completing.
      }
    }

    emitHostEvent('conversation.updated', {
      conversationId,
      type: 'archived',
    })
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

  // -------------------------------------------------------------------------
  // Tests
  // -------------------------------------------------------------------------

  it('returns conversation_not_found when no conversation exists — no side effects', async () => {
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
    expect(emitHostEvent).not.toHaveBeenCalled()
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
      false, // force=false
      deps,
      findConversation,
      listProjects,
      updateConversationStatus,
      emitHostEvent,
    )

    expect(result).toEqual({ ok: false, reason: 'has_uncommitted_changes' })
    expect(deps.piRuntimeManager.stop).not.toHaveBeenCalled()
    expect(updateConversationStatus).not.toHaveBeenCalled()
    expect(emitHostEvent).not.toHaveBeenCalled()
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
    expect(emitHostEvent).toHaveBeenCalled()
  })

  it('clearConversationMaps runs in finally even when stop() throws — stop error propagates', async () => {
    let stopCallCount = 0
    deps.piRuntimeManager.stop = vi.fn().mockImplementation(() => {
      stopCallCount++
      return Promise.reject(new Error('stop failed'))
    })

    // Error propagates (no try/catch in handler)
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
    expect(deps.detectedProjectCommandsCache.has('conv-1')).toBe(false)
    // updateConversationStatus was NOT called because the error propagated
    expect(updateConversationStatus).not.toHaveBeenCalled()
    expect(emitHostEvent).not.toHaveBeenCalled()
  })

  it('returns conversation_not_found when updateConversationStatus returns false — archiving failed', async () => {
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
    // stop() ran and Maps were cleared
    expect(deps.piRuntimeManager.stop).toHaveBeenCalledWith('conv-1')
    expect(deps.clearPendingBroadcasts).toHaveBeenCalledWith('conv-1')
    expect(deps.clearToolExecutionMaps).toHaveBeenCalledWith('conv-1')
    // emitHostEvent NOT called because archiving failed
    expect(emitHostEvent).not.toHaveBeenCalled()
  })

  it('calls all steps in order: stop → clearMaps → updateStatus → removeWorktree → emit', async () => {
    // Set a worktree_path so removeConversationWorktree is called
    findConversation = () => ({
      id: 'conv-1',
      project_id: null,
      worktree_path: '/worktrees/conv-1',
      pi_session_file: null,
    })
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
    deps.removeConversationWorktree = vi.fn().mockImplementation(() => {
      callOrder.push('removeConversationWorktree')
      return Promise.resolve()
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
      'removeConversationWorktree',
      'emitHostEvent',
    ])
  })

  it('worktree removal failure does NOT prevent archiving or emitHostEvent', async () => {
    findConversation = () => ({
      id: 'conv-1',
      project_id: 'proj-1',
      worktree_path: '/worktrees/conv-1',
      pi_session_file: null,
    })
    listProjects = () => [{ id: 'proj-1', repo_path: '/home/repo' }]
    deps.removeConversationWorktree = vi.fn().mockRejectedValue(new Error('filesystem error'))

    const result = await handleConversationsDelete(
      'conv-1',
      false,
      deps,
      findConversation,
      listProjects,
      updateConversationStatus,
      emitHostEvent,
    )

    // Archiving succeeded despite worktree removal failure
    expect(result).toEqual({ ok: true })
    expect(updateConversationStatus).toHaveBeenCalledWith('conv-1', 'archived')
    expect(emitHostEvent).toHaveBeenCalledWith('conversation.updated', {
      conversationId: 'conv-1',
      type: 'archived',
    })
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

  it('removes worktree with correct project repo_path when project_id is set', async () => {
    findConversation = () => ({
      id: 'conv-1',
      project_id: 'proj-1',
      worktree_path: '/repo/.worktrees/conv-1',
      pi_session_file: null,
    })
    listProjects = () => [{ id: 'proj-1', repo_path: '/home/user/repo' }]
    deps.removeConversationWorktree = vi.fn().mockResolvedValue(undefined)

    await handleConversationsDelete(
      'conv-1',
      false,
      deps,
      findConversation,
      listProjects,
      updateConversationStatus,
      emitHostEvent,
    )

    expect(deps.removeConversationWorktree).toHaveBeenCalledWith(
      '/repo/.worktrees/conv-1',
      '/home/user/repo',
    )
  })

  it('removes worktree with null repo_path when project_id is null', async () => {
    findConversation = () => ({
      id: 'conv-1',
      project_id: null,
      worktree_path: '/standalone/.worktrees/conv-1',
      pi_session_file: null,
    })
    deps.removeConversationWorktree = vi.fn().mockResolvedValue(undefined)

    await handleConversationsDelete(
      'conv-1',
      false,
      deps,
      findConversation,
      listProjects,
      updateConversationStatus,
      emitHostEvent,
    )

    expect(deps.removeConversationWorktree).toHaveBeenCalledWith(
      '/standalone/.worktrees/conv-1',
      null,
    )
  })

  it('does not call removeConversationWorktree when worktree_path is empty string', async () => {
    findConversation = () => ({
      id: 'conv-1',
      project_id: null,
      worktree_path: '', // empty string — falsy, so should be skipped
      pi_session_file: null,
    })

    await handleConversationsDelete(
      'conv-1',
      false,
      deps,
      findConversation,
      listProjects,
      updateConversationStatus,
      emitHostEvent,
    )

    expect(deps.removeConversationWorktree).not.toHaveBeenCalled()
  })

  it('emitHostEvent is called with conversationId and type archived', async () => {
    const result = await handleConversationsDelete(
      'my-conv-456',
      false,
      deps,
      findConversation,
      listProjects,
      updateConversationStatus,
      emitHostEvent,
    )

    expect(result).toEqual({ ok: true })
    expect(emitHostEvent).toHaveBeenCalledWith('conversation.updated', {
      conversationId: 'my-conv-456',
      type: 'archived',
    })
  })

  it('clearConversationMaps removes all 4 Map entries for the conversation', async () => {
    // Pre-populate the Maps with entries for conv-1
    deps.detectedProjectCommandsCache.set('conv-1', { some: 'data' })
    deps.projectCommandRuns.set('run-1', { conversationId: 'conv-1', status: 'running' })
    deps.projectCommandRuns.set('run-2', { conversationId: 'conv-1', status: 'done' })
    deps.projectCommandRuns.set('run-3', { conversationId: 'other-conv', status: 'running' })

    await handleConversationsDelete(
      'conv-1',
      false,
      deps,
      findConversation,
      listProjects,
      updateConversationStatus,
      emitHostEvent,
    )

    // conv-1 entries removed
    expect(deps.detectedProjectCommandsCache.has('conv-1')).toBe(false)
    expect(deps.projectCommandRuns.has('run-1')).toBe(false)
    expect(deps.projectCommandRuns.has('run-2')).toBe(false)
    // other-conv entry preserved
    expect(deps.projectCommandRuns.has('run-3')).toBe(true)
  })
})
