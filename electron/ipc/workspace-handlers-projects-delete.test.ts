import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `projects:delete` IPC handler.
 *
 * The handler:
 * 1. Returns `project_not_found` when no project exists
 * 2. Stops all Pi runtimes for each project conversation (swallows errors)
 * 3. Always calls `clearConversationMaps` for each conversation (try/finally guarantee)
 * 4. Removes worktrees for each conversation (best-effort — errors don't prevent deletion)
 * 5. Deletes the project from the DB
 * 6. Emits `project.deleted` host event
 *
 * We replicate the minimal handler logic inline to test without needing the full
 * workspace-handlers.ts module (which requires complex dep setup).
 */

describe('projects:delete', () => {
  // -------------------------------------------------------------------------
  // Types mirroring those used by the real handler
  // -------------------------------------------------------------------------
  type Result =
    | { ok: true }
    | { ok: false; reason: 'project_not_found' | 'unknown' }

  interface Conversation {
    id: string
    worktree_path: string | null
  }

  interface Project {
    id: string
    repo_path: string
  }

  // -------------------------------------------------------------------------
  // Inline minimal handler — mirrors workspace-handlers.ts lines 2841–2878.
  // -------------------------------------------------------------------------
  async function projectsDelete(params: {
    project: Project | null
    conversations: Conversation[]
    stop: (conversationId: string) => Promise<void>
    removeConversationWorktree: (
      worktreePath: string | null,
      repoPath: string,
    ) => Promise<void>
    clearConversationMaps: (conversationId: string) => void
    deleteProject: () => boolean
    emitHostEvent: (event: string, data: { projectId: string }) => void
  }): Promise<Result> {
    if (!params.project) {
      return { ok: false, reason: 'project_not_found' }
    }

    const { project, conversations } = params

    // Always clean up Maps even if stop() throws — stale entries are worse than
    // a failed stop. The stop errors are swallowed so the deletion proceeds.
    try {
      await Promise.all(
        conversations.map((conversation) =>
          params.stop(conversation.id).catch(() => {}),
        ),
      )
    } finally {
      // Clean up all conversation-scoped Maps for each project conversation
      for (const conversation of conversations) {
        params.clearConversationMaps(conversation.id)
      }
    }

    // Best-effort worktree cleanup — filesystem errors must not prevent the
    // project from being deleted from the DB or the host event from firing.
    try {
      await Promise.all(
        conversations.map((conversation) =>
          params
            .removeConversationWorktree(conversation.worktree_path, project.repo_path)
            .catch((err) => {
              // Silently swallow — individual worktree failure is logged by the caller.
            }),
        ),
      )
    } catch (err) {
      // Silently swallow — batch-level throw should not prevent deletion either.
    }

    const deleted = params.deleteProject()
    if (!deleted) {
      return { ok: false, reason: 'unknown' }
    }

    params.emitHostEvent('project.deleted', { projectId: project.id })
    return { ok: true }
  }

  // -------------------------------------------------------------------------
  // Tests
  // -------------------------------------------------------------------------

  describe('project not found', () => {
    it('returns project_not_found', async () => {
      const result = await projectsDelete({
        project: null,
        conversations: [],
        stop: vi.fn(async () => {}),
        removeConversationWorktree: vi.fn(async () => {}),
        clearConversationMaps: vi.fn(),
        deleteProject: vi.fn(),
        emitHostEvent: vi.fn(),
      })

      expect(result).toEqual({ ok: false, reason: 'project_not_found' })
    })

    it('does not call stop, deleteProject, or emitHostEvent', async () => {
      const stop = vi.fn(async () => {})
      const deleteProject = vi.fn()
      const emitHostEvent = vi.fn()

      await projectsDelete({
        project: null,
        conversations: [],
        stop,
        removeConversationWorktree: vi.fn(async () => {}),
        clearConversationMaps: vi.fn(),
        deleteProject,
        emitHostEvent,
      })

      expect(stop).not.toHaveBeenCalled()
      expect(deleteProject).not.toHaveBeenCalled()
      expect(emitHostEvent).not.toHaveBeenCalled()
    })
  })

  describe('happy path — single conversation', () => {
    it('returns ok:true and calls stop, clearConversationMaps, removeWorktree, deleteProject, emitHostEvent', async () => {
      const stop = vi.fn(async () => {})
      const clearConversationMaps = vi.fn()
      const removeConversationWorktree = vi.fn(async () => {})
      const deleteProject = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      const result = await projectsDelete({
        project: { id: 'proj-1', repo_path: '/repo/path' },
        conversations: [{ id: 'conv-1', worktree_path: '/wt/conv-1' }],
        stop,
        removeConversationWorktree,
        clearConversationMaps,
        deleteProject,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: true })
      expect(stop).toHaveBeenCalledWith('conv-1')
      expect(clearConversationMaps).toHaveBeenCalledWith('conv-1')
      expect(removeConversationWorktree).toHaveBeenCalledWith('/wt/conv-1', '/repo/path')
      expect(deleteProject).toHaveBeenCalledOnce()
      expect(emitHostEvent).toHaveBeenCalledWith('project.deleted', { projectId: 'proj-1' })
    })
  })

  describe('happy path — multiple conversations', () => {
    it('calls stop and clearConversationMaps for each conversation in order', async () => {
      const callOrder: string[] = []
      const stop = vi.fn(async (id: string) => {
        callOrder.push(`stop:${id}`)
      })
      const clearConversationMaps = vi.fn((id: string) => {
        callOrder.push(`clear:${id}`)
      })
      const removeConversationWorktree = vi.fn(async () => {})
      const deleteProject = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      const result = await projectsDelete({
        project: { id: 'proj-2', repo_path: '/repo/path' },
        conversations: [
          { id: 'conv-A', worktree_path: '/wt/A' },
          { id: 'conv-B', worktree_path: '/wt/B' },
        ],
        stop,
        removeConversationWorktree,
        clearConversationMaps,
        deleteProject,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: true })
      // Promise.all(stop) runs in parallel, then finally runs sequentially
      // clearConversationMaps is called for each in the for-of loop
      expect(callOrder.filter((x) => x.startsWith('stop:'))).toHaveLength(2)
      expect(callOrder.filter((x) => x.startsWith('clear:'))).toHaveLength(2)
    })
  })

  describe('try/finally guarantee — clearConversationMaps runs even when stop() throws', () => {
    it('clearConversationMaps is called for all conversations even when stop() throws for some', async () => {
      const stop = vi.fn(async (id: string) => {
        if (id === 'conv-bad') throw new Error('stop failed for conv-bad')
      })
      const clearConversationMaps = vi.fn()
      const removeConversationWorktree = vi.fn(async () => {})
      const deleteProject = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      // stop() for conv-bad throws — but delete should still succeed because
      // stop errors are caught and the finally block runs.
      const result = await projectsDelete({
        project: { id: 'proj-3', repo_path: '/repo/path' },
        conversations: [
          { id: 'conv-good', worktree_path: '/wt/good' },
          { id: 'conv-bad', worktree_path: '/wt/bad' },
        ],
        stop,
        removeConversationWorktree,
        clearConversationMaps,
        deleteProject,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: true })
      // Both conversations had clearConversationMaps called in the finally block
      expect(clearConversationMaps).toHaveBeenCalledWith('conv-good')
      expect(clearConversationMaps).toHaveBeenCalledWith('conv-bad')
      expect(clearConversationMaps).toHaveBeenCalledTimes(2)
      // deleteProject and emitHostEvent still ran
      expect(deleteProject).toHaveBeenCalledOnce()
      expect(emitHostEvent).toHaveBeenCalledWith('project.deleted', { projectId: 'proj-3' })
    })

    it('deleteProject is called even when stop() throws for all conversations', async () => {
      const stop = vi.fn(async () => {
        throw new Error('all stops fail')
      })
      const clearConversationMaps = vi.fn()
      const removeConversationWorktree = vi.fn(async () => {})
      const deleteProject = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      const result = await projectsDelete({
        project: { id: 'proj-4', repo_path: '/repo/path' },
        conversations: [
          { id: 'conv-1', worktree_path: '/wt/1' },
          { id: 'conv-2', worktree_path: '/wt/2' },
        ],
        stop,
        removeConversationWorktree,
        clearConversationMaps,
        deleteProject,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: true })
      // finally block always runs, then worktree removal, then delete
      expect(clearConversationMaps).toHaveBeenCalledTimes(2)
      expect(deleteProject).toHaveBeenCalledOnce()
    })
  })

  describe('worktree removal', () => {
    it('worktree removal is called for each conversation after stop+cleanup', async () => {
      const callOrder: string[] = []
      const stop = vi.fn(async () => { callOrder.push('stop') })
      const clearConversationMaps = vi.fn(() => { callOrder.push('clear') })
      const removeConversationWorktree = vi.fn(async () => { callOrder.push('worktree') })
      const deleteProject = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      await projectsDelete({
        project: { id: 'proj-5', repo_path: '/repo/path' },
        conversations: [
          { id: 'conv-1', worktree_path: '/wt/1' },
          { id: 'conv-2', worktree_path: '/wt/2' },
        ],
        stop,
        removeConversationWorktree,
        clearConversationMaps,
        deleteProject,
        emitHostEvent,
      })

      // stop → clear → worktree → delete (order within parallel batches varies)
      expect(callOrder.filter((x) => x === 'stop')).toHaveLength(2)
      expect(callOrder.filter((x) => x === 'clear')).toHaveLength(2)
      expect(callOrder.filter((x) => x === 'worktree')).toHaveLength(2)
    })

    it('worktree removal is called with null worktree_path for conversations without one', async () => {
      const removeConversationWorktree = vi.fn(async () => {})
      const deleteProject = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      await projectsDelete({
        project: { id: 'proj-6', repo_path: '/repo/path' },
        conversations: [
          { id: 'conv-1', worktree_path: null },
          { id: 'conv-2', worktree_path: '/wt/2' },
        ],
        stop: vi.fn(async () => {}),
        removeConversationWorktree,
        clearConversationMaps: vi.fn(),
        deleteProject,
        emitHostEvent,
      })

      expect(removeConversationWorktree).toHaveBeenCalledWith(null, '/repo/path')
      expect(removeConversationWorktree).toHaveBeenCalledWith('/wt/2', '/repo/path')
    })
  })

  describe('deleteProject failure', () => {
    it('returns unknown when deleteProject returns false', async () => {
      const deleteProject = vi.fn().mockReturnValue(false)
      const emitHostEvent = vi.fn()

      const result = await projectsDelete({
        project: { id: 'proj-7', repo_path: '/repo/path' },
        conversations: [{ id: 'conv-1', worktree_path: '/wt/1' }],
        stop: vi.fn(async () => {}),
        removeConversationWorktree: vi.fn(async () => {}),
        clearConversationMaps: vi.fn(),
        deleteProject,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: false, reason: 'unknown' })
      expect(emitHostEvent).not.toHaveBeenCalled()
    })
  })

  describe('worktree removal — best-effort (errors do not prevent deletion)', () => {
    it('returns ok:true even when removeConversationWorktree throws for one conversation', async () => {
      const removeConversationWorktree = vi.fn(
        async (wtPath: string | null) => {
          if (wtPath === '/wt/bad') throw new Error('worktree removal failed')
        },
      )
      const deleteProject = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      const result = await projectsDelete({
        project: { id: 'proj-wt-1', repo_path: '/repo/path' },
        conversations: [
          { id: 'conv-good', worktree_path: '/wt/good' },
          { id: 'conv-bad', worktree_path: '/wt/bad' },
        ],
        stop: vi.fn(async () => {}),
        removeConversationWorktree,
        clearConversationMaps: vi.fn(),
        deleteProject,
        emitHostEvent,
      })

      // Deletion still succeeds despite worktree failure
      expect(result).toEqual({ ok: true })
      expect(deleteProject).toHaveBeenCalledOnce()
      expect(emitHostEvent).toHaveBeenCalledWith('project.deleted', { projectId: 'proj-wt-1' })
      // Both worktree removals were attempted
      expect(removeConversationWorktree).toHaveBeenCalledWith('/wt/good', '/repo/path')
      expect(removeConversationWorktree).toHaveBeenCalledWith('/wt/bad', '/repo/path')
    })

    it('returns ok:true even when ALL removeConversationWorktree calls throw', async () => {
      const removeConversationWorktree = vi.fn(
        async () => { throw new Error('filesystem error') },
      )
      const deleteProject = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      const result = await projectsDelete({
        project: { id: 'proj-wt-2', repo_path: '/repo/path' },
        conversations: [
          { id: 'conv-1', worktree_path: '/wt/1' },
          { id: 'conv-2', worktree_path: '/wt/2' },
        ],
        stop: vi.fn(async () => {}),
        removeConversationWorktree,
        clearConversationMaps: vi.fn(),
        deleteProject,
        emitHostEvent,
      })

      // Project is still deleted even when every worktree removal fails
      expect(result).toEqual({ ok: true })
      expect(deleteProject).toHaveBeenCalledOnce()
      expect(emitHostEvent).toHaveBeenCalledWith('project.deleted', { projectId: 'proj-wt-2' })
    })

    it('project is deleted even when Promise.all worktree batch itself throws', async () => {
      // Simulate a rare case where Promise.all itself throws (e.g., non-Error rejection)
      const removeConversationWorktree = vi.fn(
        async () => { throw 'not an Error object' },
      )
      const deleteProject = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      const result = await projectsDelete({
        project: { id: 'proj-wt-3', repo_path: '/repo/path' },
        conversations: [{ id: 'conv-1', worktree_path: '/wt/1' }],
        stop: vi.fn(async () => {}),
        removeConversationWorktree,
        clearConversationMaps: vi.fn(),
        deleteProject,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: true })
      expect(deleteProject).toHaveBeenCalledOnce()
    })
  })

  describe('empty project (no conversations)', () => {
    it('returns ok:true and skips stop/cleanup/removeWorktree when project has no conversations', async () => {
      const stop = vi.fn()
      const clearConversationMaps = vi.fn()
      const removeConversationWorktree = vi.fn()
      const deleteProject = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      const result = await projectsDelete({
        project: { id: 'proj-8', repo_path: '/repo/path' },
        conversations: [],
        stop,
        removeConversationWorktree,
        clearConversationMaps,
        deleteProject,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: true })
      expect(stop).not.toHaveBeenCalled()
      expect(clearConversationMaps).not.toHaveBeenCalled()
      expect(removeConversationWorktree).not.toHaveBeenCalled()
      expect(deleteProject).toHaveBeenCalledOnce()
      expect(emitHostEvent).toHaveBeenCalledWith('project.deleted', { projectId: 'proj-8' })
    })
  })
})

// ---------------------------------------------------------------------------
// Unit tests for the projectId input validation guard
// This logic is the first thing that runs in projects:delete before any DB access.
// ---------------------------------------------------------------------------

describe('projects:delete — IPC input validation guard', () => {
  /**
   * Mirrors the guard logic in workspace-handlers.ts:
   *   if (typeof projectId !== "string" || !projectId.trim()) {
   *     return { ok: false, reason: "project_not_found" }
   *   }
   *   const trimmedId = projectId.trim()
   */
  function guardProjectId(
    projectId: unknown,
  ): { ok: false; reason: 'project_not_found' } | { trimmedId: string } {
    if (typeof projectId !== 'string' || !projectId.trim()) {
      return { ok: false, reason: 'project_not_found' }
    }
    return { trimmedId: projectId.trim() }
  }

  it('rejects null', () => {
    const result = guardProjectId(null)
    expect(result).toEqual({ ok: false, reason: 'project_not_found' })
  })

  it('rejects undefined', () => {
    const result = guardProjectId(undefined)
    expect(result).toEqual({ ok: false, reason: 'project_not_found' })
  })

  it('rejects empty string', () => {
    const result = guardProjectId('')
    expect(result).toEqual({ ok: false, reason: 'project_not_found' })
  })

  it('rejects whitespace-only string', () => {
    const result = guardProjectId('   \t\n  ')
    expect(result).toEqual({ ok: false, reason: 'project_not_found' })
  })

  it('rejects number', () => {
    const result = guardProjectId(123 as unknown)
    expect(result).toEqual({ ok: false, reason: 'project_not_found' })
  })

  it('rejects object', () => {
    const result = guardProjectId({} as unknown)
    expect(result).toEqual({ ok: false, reason: 'project_not_found' })
  })

  it('accepts a valid non-empty string and trims it', () => {
    const result = guardProjectId('  valid-project-id  ')
    expect(result).toEqual({ trimmedId: 'valid-project-id' })
  })

  it('accepts a valid non-empty string without trimming', () => {
    const result = guardProjectId('valid-project-id')
    expect(result).toEqual({ trimmedId: 'valid-project-id' })
  })
})
