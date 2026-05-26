import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `conversations:enableWorktree` IPC handler.
 *
 * Handler logic:
 * 1. Returns `conversation_not_found` when no conversation
 * 2. Returns `project_not_found` when conversation has no project_id
 * 3. Returns `project_not_found` when project not in DB
 * 4. Returns `project_not_found` with message for cloud projects or missing repo_path
 * 5. Idempotent: returns success if worktree_path is already set and is a valid git repo
 * 6. Creates worktree via ensureConversationWorktree (swallows errors → returns null → "unknown")
 * 7. On success: updates DB, broadcasts conversation.updated to all windows, emits host event
 *
 * We replicate the minimal handler logic inline to test without needing the full
 * workspace-handlers.ts module (which requires complex dep setup).
 */

describe('conversations:enableWorktree', () => {
  // -------------------------------------------------------------------------
  // Types mirroring those used by the real handler
  // -------------------------------------------------------------------------
  type Result =
    | { ok: true; conversation: unknown }
    | { ok: false; reason: 'conversation_not_found' | 'project_not_found' | 'unknown'; message?: string }

  interface Conversation {
    id: string
    project_id: string | null
    worktree_path: string | null
  }

  interface Project {
    id: string
    location: 'local' | 'cloud'
    repo_path: string | null
  }

  interface MockDeps {
    isGitRepo: (path: string) => Promise<boolean>
    ensureConversationWorktree: (
      repoPath: string,
      conversationId: string,
    ) => Promise<string>
    saveConversationPiRuntime: (db: unknown, conversationId: string, data: { worktreePath: string }) => void
    mapConversation: (conv: Conversation) => unknown
  }

  // -------------------------------------------------------------------------
  // Inline handler mirroring the real implementation
  // -------------------------------------------------------------------------
  async function handleEnableWorktree(
    conversationId: string,
    deps: MockDeps,
    findConversation: (id: string) => Conversation | null,
    listProjects: () => Project[],
    BrowserWindow: {
      getAllWindows: () => { isDestroyed: () => boolean; webContents: { isDestroyed: () => boolean; send: (channel: string, data: unknown) => void } }[]
    },
    emitHostEvent: (name: string, data: Record<string, unknown>) => void,
  ): Promise<Result> {
    const db = {} // unused in these tests
    const conversation = findConversation(conversationId)
    if (!conversation) {
      return { ok: false as const, reason: 'conversation_not_found' as const }
    }
    if (!conversation.project_id) {
      return { ok: false as const, reason: 'project_not_found' as const }
    }

    const project = listProjects().find(
      (item) => item.id === conversation.project_id,
    )
    if (!project) {
      return { ok: false as const, reason: 'project_not_found' as const }
    }
    if (project.location === 'cloud' || !project.repo_path) {
      return {
        ok: false as const,
        reason: 'project_not_found' as const,
        message: project.location === 'cloud'
          ? 'Worktrees are not available for cloud projects.'
          : 'Project has no repository path.',
      }
    }

    if (
      conversation.worktree_path &&
      conversation.worktree_path.trim().length > 0 &&
      (await deps.isGitRepo(conversation.worktree_path))
    ) {
      return {
        ok: true as const,
        conversation: deps.mapConversation(conversation),
      }
    }

    const worktreePath = await deps
      .ensureConversationWorktree(project.repo_path, conversationId)
      .catch(() => null)
    if (!worktreePath) {
      return { ok: false as const, reason: 'unknown' as const }
    }

    // Guard DB writes and reads: if either throws, surface the error gracefully
    // so the renderer always gets a typed response (not an unhandled rejection).
    let updatedConversation: Conversation | null
    try {
      deps.saveConversationPiRuntime(db, conversationId, { worktreePath })
      updatedConversation = findConversation(conversationId)
    } catch {
      return { ok: false as const, reason: 'unknown' as const }
    }
    if (!updatedConversation) {
      return { ok: false as const, reason: 'unknown' as const }
    }
    const payload = {
      conversationId,
      updatedAt: new Date().toISOString(),
      worktreePath,
    }
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      const webContents = win.webContents
      if (webContents.isDestroyed()) continue
      webContents.send('workspace:conversationUpdated', payload)
    }
    emitHostEvent('conversation.updated', {
      conversationId,
      type: 'worktree_enabled',
    })
    return {
      ok: true as const,
      conversation: deps.mapConversation(updatedConversation),
    }
  }

  // -------------------------------------------------------------------------
  // Shared mocks
  // -------------------------------------------------------------------------
  let deps: MockDeps
  let findConversation: () => Conversation | null
  let listProjects: () => Project[]
  let BrowserWindow: {
    getAllWindows: () => { isDestroyed: () => boolean; webContents: { isDestroyed: () => boolean; send: (channel: string, data: unknown) => void } }[]
  }
  let emitHostEvent: (name: string, data: Record<string, unknown>) => void

  beforeEach(() => {
    deps = {
      isGitRepo: vi.fn().mockResolvedValue(false),
      ensureConversationWorktree: vi.fn().mockResolvedValue('/path/to/worktree'),
      saveConversationPiRuntime: vi.fn(),
      mapConversation: vi.fn().mockReturnValue({ id: 'conv-1', project_id: 'proj-1', worktree_path: '/path/to/worktree' }),
    }
    findConversation = () => ({
      id: 'conv-1',
      project_id: 'proj-1',
      worktree_path: null,
    })
    listProjects = () => [{
      id: 'proj-1',
      location: 'local' as const,
      repo_path: '/repo/main',
    }]
    BrowserWindow = {
      getAllWindows: () => [{
        isDestroyed: () => false,
        webContents: { isDestroyed: () => false, send: vi.fn() },
      }],
    }
    emitHostEvent = vi.fn()
  })

  // -------------------------------------------------------------------------
  // Conversation guard
  // -------------------------------------------------------------------------
  it('returns conversation_not_found when no conversation exists', async () => {
    findConversation = () => null

    const result = await handleEnableWorktree(
      'missing-conv',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
  })

  // -------------------------------------------------------------------------
  // Project guard
  // -------------------------------------------------------------------------
  it('returns project_not_found when conversation has no project_id', async () => {
    findConversation = () => ({ id: 'conv-1', project_id: null, worktree_path: null })

    const result = await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(result).toEqual({ ok: false, reason: 'project_not_found' })
  })

  it('returns project_not_found when project is not in the database', async () => {
    listProjects = () => []

    const result = await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(result).toEqual({ ok: false, reason: 'project_not_found' })
  })

  it('returns project_not_found with cloud message for cloud projects', async () => {
    listProjects = () => [{
      id: 'proj-1',
      location: 'cloud' as const,
      repo_path: '/cloud/repo',
    }]

    const result = await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(result).toEqual({
      ok: false,
      reason: 'project_not_found',
      message: 'Worktrees are not available for cloud projects.',
    })
  })

  it('returns project_not_found with message when repo_path is null', async () => {
    listProjects = () => [{
      id: 'proj-1',
      location: 'local' as const,
      repo_path: null,
    }]

    const result = await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(result).toEqual({
      ok: false,
      reason: 'project_not_found',
      message: 'Project has no repository path.',
    })
  })

  // -------------------------------------------------------------------------
  // Idempotent: existing valid worktree
  // -------------------------------------------------------------------------
  it('returns ok:true with existing worktree when isGitRepo returns true', async () => {
    deps.isGitRepo = vi.fn().mockResolvedValue(true)
    findConversation = () => ({
      id: 'conv-1',
      project_id: 'proj-1',
      worktree_path: '/existing/worktree',
    })

    const result = await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    const conv: Conversation = { id: 'conv-1', project_id: 'proj-1', worktree_path: '/existing/worktree' }
    expect(result).toEqual({
      ok: true,
      conversation: deps.mapConversation(conv),
    })
  })

  it('does NOT call ensureConversationWorktree when worktree already exists and is valid', async () => {
    deps.isGitRepo = vi.fn().mockResolvedValue(true)
    findConversation = () => ({
      id: 'conv-1',
      project_id: 'proj-1',
      worktree_path: '/existing/worktree',
    })

    await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(deps.ensureConversationWorktree).not.toHaveBeenCalled()
  })

  it('does NOT call saveConversationPiRuntime when worktree already exists and is valid', async () => {
    deps.isGitRepo = vi.fn().mockResolvedValue(true)
    findConversation = () => ({
      id: 'conv-1',
      project_id: 'proj-1',
      worktree_path: '/existing/worktree',
    })

    await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(deps.saveConversationPiRuntime).not.toHaveBeenCalled()
  })

  it('does NOT broadcast when worktree already exists and is valid', async () => {
    deps.isGitRepo = vi.fn().mockResolvedValue(true)
    findConversation = () => ({
      id: 'conv-1',
      project_id: 'proj-1',
      worktree_path: '/existing/worktree',
    })
    const send = vi.fn()
    BrowserWindow = {
      getAllWindows: () => [{
        isDestroyed: () => false,
        webContents: { isDestroyed: () => false, send },
      }],
    }

    await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(send).not.toHaveBeenCalled()
  })

  it('does NOT emit host event when worktree already exists and is valid', async () => {
    deps.isGitRepo = vi.fn().mockResolvedValue(true)
    findConversation = () => ({
      id: 'conv-1',
      project_id: 'proj-1',
      worktree_path: '/existing/worktree',
    })

    await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(emitHostEvent).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Idempotent: empty worktree path
  // -------------------------------------------------------------------------
  it('calls ensureConversationWorktree when worktree_path is empty string', async () => {
    findConversation = () => ({
      id: 'conv-1',
      project_id: 'proj-1',
      worktree_path: '',
    })

    await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(deps.ensureConversationWorktree).toHaveBeenCalledWith('/repo/main', 'conv-1')
  })

  it('calls ensureConversationWorktree when worktree_path is whitespace-only', async () => {
    findConversation = () => ({
      id: 'conv-1',
      project_id: 'proj-1',
      worktree_path: '   ',
    })

    await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(deps.ensureConversationWorktree).toHaveBeenCalledWith('/repo/main', 'conv-1')
  })

  // -------------------------------------------------------------------------
  // Idempotent: non-git directory
  // -------------------------------------------------------------------------
  it('calls ensureConversationWorktree when worktree_path exists but is not a git repo', async () => {
    deps.isGitRepo = vi.fn().mockResolvedValue(false)
    findConversation = () => ({
      id: 'conv-1',
      project_id: 'proj-1',
      worktree_path: '/dead/worktree',
    })

    await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(deps.ensureConversationWorktree).toHaveBeenCalledWith('/repo/main', 'conv-1')
  })

  // -------------------------------------------------------------------------
  // Creation failure
  // -------------------------------------------------------------------------
  it('returns unknown when ensureConversationWorktree throws', async () => {
    deps.ensureConversationWorktree = vi.fn().mockRejectedValue(new Error('git error'))

    const result = await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(result).toEqual({ ok: false, reason: 'unknown' })
  })

  it('returns unknown when ensureConversationWorktree returns null via catch', async () => {
    deps.ensureConversationWorktree = vi.fn().mockResolvedValue(null as unknown as string)

    const result = await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(result).toEqual({ ok: false, reason: 'unknown' })
  })

  it('does NOT saveConversationPiRuntime when worktree creation fails', async () => {
    deps.ensureConversationWorktree = vi.fn().mockRejectedValue(new Error('failed'))

    await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(deps.saveConversationPiRuntime).not.toHaveBeenCalled()
  })

  it('does NOT broadcast when worktree creation fails', async () => {
    deps.ensureConversationWorktree = vi.fn().mockRejectedValue(new Error('failed'))
    const send = vi.fn()
    BrowserWindow = {
      getAllWindows: () => [{
        isDestroyed: () => false,
        webContents: { isDestroyed: () => false, send },
      }],
    }

    await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(send).not.toHaveBeenCalled()
  })

  it('does NOT emit host event when worktree creation fails', async () => {
    deps.ensureConversationWorktree = vi.fn().mockRejectedValue(new Error('failed'))

    await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(emitHostEvent).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Creation failure: conversation disappears from DB after save
  // -------------------------------------------------------------------------
  it('returns unknown when conversation disappears from DB after save', async () => {
    deps.ensureConversationWorktree = vi.fn().mockResolvedValue('/new/worktree')
    // First call returns the conversation, second call (after save) returns null
    let callCount = 0
    findConversation = () => {
      callCount++
      if (callCount === 1) {
        return { id: 'conv-1', project_id: 'proj-1', worktree_path: null }
      }
      return null
    }

    const result = await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(result).toEqual({ ok: false, reason: 'unknown' })
  })

  // -------------------------------------------------------------------------
  // Success path
  // -------------------------------------------------------------------------
  it('calls ensureConversationWorktree with repo_path and conversationId on success path', async () => {
    deps.ensureConversationWorktree = vi.fn().mockResolvedValue('/repo/main/.worktrees/conv-1')

    await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(deps.ensureConversationWorktree).toHaveBeenCalledWith('/repo/main', 'conv-1')
  })

  it('calls saveConversationPiRuntime with correct args', async () => {
    deps.ensureConversationWorktree = vi.fn().mockResolvedValue('/new/path')

    await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(deps.saveConversationPiRuntime).toHaveBeenCalledWith(
      expect.anything(),
      'conv-1',
      { worktreePath: '/new/path' },
    )
  })

  it('returns ok:true with mapped conversation on success', async () => {
    deps.ensureConversationWorktree = vi.fn().mockResolvedValue('/new/path')
    const updatedConv = { id: 'conv-1', project_id: 'proj-1', worktree_path: '/new/path' }
    let callCount = 0
    findConversation = () => {
      callCount++
      if (callCount === 1) return { id: 'conv-1', project_id: 'proj-1', worktree_path: null }
      return updatedConv
    }
    deps.mapConversation = vi.fn().mockReturnValue(updatedConv)

    const result = await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(result).toEqual({ ok: true, conversation: updatedConv })
  })

  // -------------------------------------------------------------------------
  // Broadcast
  // -------------------------------------------------------------------------
  it('broadcasts workspace:conversationUpdated to all non-destroyed windows', async () => {
    deps.ensureConversationWorktree = vi.fn().mockResolvedValue('/new/path')
    const send1 = vi.fn()
    const send2 = vi.fn()
    BrowserWindow = {
      getAllWindows: () => [
        { isDestroyed: () => false, webContents: { isDestroyed: () => false, send: send1 } },
        { isDestroyed: () => false, webContents: { isDestroyed: () => false, send: send2 } },
      ],
    }

    await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(send1).toHaveBeenCalledOnce()
    expect(send2).toHaveBeenCalledOnce()
    const payload1 = send1.mock.calls[0]
    expect(payload1[0]).toBe('workspace:conversationUpdated')
    expect(payload1[1]).toMatchObject({ conversationId: 'conv-1', worktreePath: '/new/path' })
  })

  it('skips destroyed BrowserWindow instances', async () => {
    deps.ensureConversationWorktree = vi.fn().mockResolvedValue('/new/path')
    const send = vi.fn()
    BrowserWindow = {
      getAllWindows: () => [
        { isDestroyed: () => true, webContents: { isDestroyed: () => false, send: vi.fn() } },
        { isDestroyed: () => false, webContents: { isDestroyed: () => false, send } },
      ],
    }

    await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(send).toHaveBeenCalledOnce()
  })

  it('skips windows with destroyed webContents', async () => {
    deps.ensureConversationWorktree = vi.fn().mockResolvedValue('/new/path')
    const send = vi.fn()
    BrowserWindow = {
      getAllWindows: () => [
        { isDestroyed: () => false, webContents: { isDestroyed: () => true, send: vi.fn() } },
        { isDestroyed: () => false, webContents: { isDestroyed: () => false, send } },
      ],
    }

    await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(send).toHaveBeenCalledOnce()
  })

  // -------------------------------------------------------------------------
  // Host event
  // -------------------------------------------------------------------------
  it('emits conversation.updated host event with worktree_enabled type', async () => {
    deps.ensureConversationWorktree = vi.fn().mockResolvedValue('/new/path')

    await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(emitHostEvent).toHaveBeenCalledWith('conversation.updated', {
      conversationId: 'conv-1',
      type: 'worktree_enabled',
    })
  })

  it('emits host event exactly once on success', async () => {
    deps.ensureConversationWorktree = vi.fn().mockResolvedValue('/new/path')

    await handleEnableWorktree(
      'conv-1',
      deps,
      findConversation,
      listProjects,
      BrowserWindow,
      emitHostEvent,
    )

    expect(emitHostEvent).toHaveBeenCalledTimes(1)
  })

  // ---------------------------------------------------------------------------
  // Error handling — DB persistence step
  // saveConversationPiRuntime and findConversationById can throw (SQLite errors,
  // disk full, corruption). The try/catch wrapper ensures the renderer always gets
  // a typed response rather than an unhandled IPC rejection.
  // ---------------------------------------------------------------------------

  describe('conversations:enableWorktree — persistence error handling', () => {
    beforeEach(() => {
      // ensureConversationWorktree succeeds so we reach the persistence step
      deps.ensureConversationWorktree = vi.fn().mockResolvedValue('/new/worktree')
      findConversation = () => ({
        id: 'conv-1',
        project_id: 'proj-1',
        worktree_path: null,
      })
    })

    it('returns unknown when saveConversationPiRuntime throws', async () => {
      deps.saveConversationPiRuntime = vi.fn().mockImplementation(() => {
        throw new Error('SQLITE_CANTOPEN: disk I/O error')
      })

      const result = await handleEnableWorktree(
        'conv-1',
        deps,
        findConversation,
        listProjects,
        BrowserWindow,
        emitHostEvent,
      )

      expect(result).toEqual({ ok: false, reason: 'unknown' })
    })

    it('returns unknown when saveConversationPiRuntime throws a non-Error value', async () => {
      deps.saveConversationPiRuntime = vi.fn().mockImplementation(() => {
        throw { code: 'EIO' }
      })

      const result = await handleEnableWorktree(
        'conv-1',
        deps,
        findConversation,
        listProjects,
        BrowserWindow,
        emitHostEvent,
      )

      expect(result).toEqual({ ok: false, reason: 'unknown' })
    })

    it('does not call findConversation the second time when saveConversationPiRuntime throws', async () => {
      // Track calls to detect which findConversationById invocation fires
      const findConvCalls: unknown[][] = []
      const findConvSpy = vi.fn().mockImplementation((...args: unknown[]) => {
        findConvCalls.push(args)
        // First call: returns a valid conversation (gets past the initial null check)
        // Second call: returns null (would be inside try block after saveConversationPiRuntime throws)
        return findConvCalls.length === 1
          ? { id: 'conv-1', project_id: 'proj-1', worktree_path: null }
          : null
      })
      deps.saveConversationPiRuntime = vi.fn().mockImplementation(() => {
        throw new Error('disk full')
      })

      const result = await handleEnableWorktree(
        'conv-1',
        deps,
        findConvSpy,
        listProjects,
        BrowserWindow,
        emitHostEvent,
      )

      // saveConversationPiRuntime threw → returns { ok: false, reason: 'unknown' }
      expect(result).toEqual({ ok: false, reason: 'unknown' })
      // First findConversationById WAS called (initial lookup at line 3017)
      expect(findConvCalls.length).toBeGreaterThanOrEqual(1)
      // Second findConversationById (inside try block after saveConversationPiRuntime) was NOT called
      // because the throw stops try-block execution before reaching it
      expect(findConvCalls.length).toBe(1)
    })

    it('does not emit host event when saveConversationPiRuntime throws', async () => {
      deps.saveConversationPiRuntime = vi.fn().mockImplementation(() => {
        throw new Error('corruption')
      })

      await handleEnableWorktree(
        'conv-1',
        deps,
        findConversation,
        listProjects,
        BrowserWindow,
        emitHostEvent,
      )

      expect(emitHostEvent).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // IPC-level conversationId validation
  // The IPC boundary in workspace-handlers.ts rejects non-string and
  // empty/whitespace conversationId before any DB calls. These tests verify
  // the validation logic directly, matching the pattern added in the prior
  // session's security hardening pass.
  // ---------------------------------------------------------------------------

  describe('conversations:enableWorktree — IPC-level conversationId validation', () => {
    function validateEnableWorktreeInput(
      conversationId: unknown,
    ): { ok: true } | { ok: false; reason: string } {
      if (typeof conversationId !== 'string' || !conversationId.trim()) {
        return { ok: false, reason: 'conversationId is required' }
      }
      return { ok: true }
    }

    describe('rejects invalid types', () => {
      const invalidTypes: unknown[] = [
        undefined,
        null,
        42,
        true,
        { id: 'x' },
        ['id'],
        () => {},
      ]

      invalidTypes.forEach((value) => {
        it(`rejects ${JSON.stringify(value)}`, () => {
          const result = validateEnableWorktreeInput(value)
          expect(result).toEqual({ ok: false, reason: 'conversationId is required' })
        })
      })
    })

    describe('rejects empty and whitespace-only strings', () => {
      it('rejects empty string', () => {
        const result = validateEnableWorktreeInput('')
        expect(result).toEqual({ ok: false, reason: 'conversationId is required' })
      })

      it('rejects whitespace-only string', () => {
        const result = validateEnableWorktreeInput('   \n\t')
        expect(result).toEqual({ ok: false, reason: 'conversationId is required' })
      })
    })

    describe('accepts valid non-empty strings', () => {
      it('accepts valid conversationId', () => {
        const result = validateEnableWorktreeInput('conv-123')
        expect(result).toEqual({ ok: true })
      })

      it('accepts valid conversationId with surrounding whitespace (trimmed)', () => {
        // The validation passes for whitespace-prefixed strings because trim()
        // returns a non-empty value; the trimmed result is what gets used.
        const result = validateEnableWorktreeInput('  conv-456  ')
        expect(result).toEqual({ ok: true })
      })
    })
  })
})
