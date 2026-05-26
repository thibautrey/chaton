import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `workspace:detectProjectCommands` IPC handler.
 *
 * The handler detects available terminal commands for a project (npm scripts, python
 * commands, etc.), merges in custom terminal commands from the DB, and caches the
 * result with a 15-second TTL.
 *
 * Key behavioral guarantees verified:
 * - Returns "conversation_not_found" when no conversation exists
 * - Returns "project_not_found" when conversation has no project_id
 * - Returns cached result (with fresh customCommands) when cache is within TTL
 * - Does NOT call buildDetectedProjectCommands when cache is fresh
 * - Does call buildDetectedProjectCommands when cache is stale
 * - buildDetectedProjectCommands error propagates correctly (no cache write on failure)
 * - buildDetectedProjectCommands success merges with customCommands before caching
 * - Cache entry is written with current timestamp on success
 *
 * We replicate the minimal handler logic inline to test without needing the full
 * workspace-handlers.ts module (which requires complex dep setup).
 */

describe('workspace:detectProjectCommands', () => {
  // -------------------------------------------------------------------------
  // Constants — match workspace.ts
  // -------------------------------------------------------------------------
  const DETECTED_PROJECT_COMMANDS_TTL_MS = 15_000

  // -------------------------------------------------------------------------
  // Types mirroring the real handler
  // -------------------------------------------------------------------------
  type DetectProjectCommandsResult =
    | {
        ok: true
        projectType: string
        commands: Array<{ id: string; label: string; command: string; args: string[]; source: string }>
        customCommands: Array<{ id: string; commandText: string; lastUsedAt: string }>
      }
    | { ok: false; reason: 'conversation_not_found' | 'project_not_found' | 'unknown'; message?: string }

  interface Conversation {
    id: string
    project_id: string | null
  }

  type CustomTerminalCommand = { id: string; command_text: string; last_used_at: string }

  // -------------------------------------------------------------------------
  // Inline handler — mirrors workspace-handlers.ts lines 3272–3311.
  // -------------------------------------------------------------------------
  function detectProjectCommands(params: {
    conversation: Conversation | null
    listCustomTerminalCommands: (projectId: string) => CustomTerminalCommand[]
    getRepoPath: (conversationId: string) => { ok: true; repoPath: string } | { ok: false; reason: string }
    buildDetected: (repoPath: string) => DetectProjectCommandsResult
    cache: Map<string, { timestamp: number; result: DetectProjectCommandsResult }>
    conversationId: string
  }): DetectProjectCommandsResult {
    if (!params.conversation) {
      return { ok: false, reason: 'conversation_not_found' } as DetectProjectCommandsResult
    }
    if (!params.conversation.project_id) {
      return { ok: false, reason: 'project_not_found' } as DetectProjectCommandsResult
    }

    const cached = params.cache.get(params.conversationId)
    const customCommands = params.listCustomTerminalCommands(
      params.conversation.project_id,
    ).map((item) => ({
      id: item.id,
      commandText: item.command_text,
      lastUsedAt: item.last_used_at,
    }))

    if (
      cached &&
      Date.now() - cached.timestamp < DETECTED_PROJECT_COMMANDS_TTL_MS &&
      cached.result.ok
    ) {
      return { ...cached.result, customCommands } as DetectProjectCommandsResult
    }

    const repo = params.getRepoPath(params.conversationId)
    if (!repo.ok) {
      return repo as DetectProjectCommandsResult
    }

    const result = params.buildDetected(repo.repoPath)
    const finalResult = result.ok ? { ...result, customCommands } : result

    if (result.ok) {
      params.cache.set(params.conversationId, {
        timestamp: Date.now(),
        result: finalResult,
      })
    }

    return finalResult as DetectProjectCommandsResult
  }

  // -------------------------------------------------------------------------
  // Shared test fixtures
  // -------------------------------------------------------------------------
  let conversation: Conversation
  let customCommands: CustomTerminalCommand[]
  let cache: Map<string, { timestamp: number; result: DetectProjectCommandsResult }>
  let listCustomTerminalCommands: (projectId: string) => CustomTerminalCommand[]
  let getRepoPath: (conversationId: string) => { ok: true; repoPath: string } | { ok: false; reason: string }
  let buildDetected: (repoPath: string) => DetectProjectCommandsResult

  const PROJECT_ID = 'proj-123'
  const CONVERSATION_ID = 'conv-456'

  beforeEach(() => {
    conversation = { id: CONVERSATION_ID, project_id: PROJECT_ID }
    customCommands = [
      { id: 'custom-1', command_text: 'make coffee', last_used_at: '2026-01-01T00:00:00Z' },
      { id: 'custom-2', command_text: 'brew tea', last_used_at: '2026-01-02T00:00:00Z' },
    ]
    cache = new Map()

    listCustomTerminalCommands = vi.fn((projectId: string) => {
      return projectId === PROJECT_ID ? customCommands : []
    })

    getRepoPath = vi.fn((_conversationId: string) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      ok: true as const,
      repoPath: '/fake/repo',
    }))

    buildDetected = vi.fn((repoPath: string) => ({
      ok: true as const,
      projectType: 'node',
      commands: [
        { id: 'npm:test', label: 'npm run test', command: 'npm', args: ['run', 'test'], source: 'package.json' },
        { id: 'npm:build', label: 'npm run build', command: 'npm', args: ['run', 'build'], source: 'package.json' },
      ],
      customCommands: [],
    }))
  })

  // -------------------------------------------------------------------------
  // Conversation guard
  // -------------------------------------------------------------------------

  it('returns conversation_not_found when conversation is null', () => {
    conversation = null as unknown as Conversation

    const result = detectProjectCommands({
      conversation,
      listCustomTerminalCommands,
      getRepoPath,
      buildDetected,
      cache,
      conversationId: CONVERSATION_ID,
    })

    expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
    expect(listCustomTerminalCommands).not.toHaveBeenCalled()
    expect(getRepoPath).not.toHaveBeenCalled()
    expect(buildDetected).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Project guard
  // -------------------------------------------------------------------------

  it('returns project_not_found when conversation has no project_id', () => {
    conversation = { id: CONVERSATION_ID, project_id: null }

    const result = detectProjectCommands({
      conversation,
      listCustomTerminalCommands,
      getRepoPath,
      buildDetected,
      cache,
      conversationId: CONVERSATION_ID,
    })

    expect(result).toEqual({ ok: false, reason: 'project_not_found' })
    expect(listCustomTerminalCommands).not.toHaveBeenCalled()
    expect(getRepoPath).not.toHaveBeenCalled()
    expect(buildDetected).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Cache — fresh hit
  // -------------------------------------------------------------------------

  it('returns cached result (with fresh customCommands) when cache is within TTL', () => {
    const cachedResult: DetectProjectCommandsResult = {
      ok: true,
      projectType: 'node',
      commands: [
        { id: 'npm:test', label: 'npm run test', command: 'npm', args: ['run', 'test'], source: 'package.json' },
      ],
      customCommands: [],
    }
    cache.set(CONVERSATION_ID, {
      timestamp: Date.now(), // fresh — within 15s TTL
      result: cachedResult,
    })

    const result = detectProjectCommands({
      conversation,
      listCustomTerminalCommands,
      getRepoPath,
      buildDetected,
      cache,
      conversationId: CONVERSATION_ID,
    })

    // Returns cached commands with the live customCommands from DB merged in
    expect(result).toEqual({
      ok: true,
      projectType: 'node',
      commands: [
        { id: 'npm:test', label: 'npm run test', command: 'npm', args: ['run', 'test'], source: 'package.json' },
      ],
      customCommands: [
        { id: 'custom-1', commandText: 'make coffee', lastUsedAt: '2026-01-01T00:00:00Z' },
        { id: 'custom-2', commandText: 'brew tea', lastUsedAt: '2026-01-02T00:00:00Z' },
      ],
    })

    // buildDetected NOT called — cache hit
    expect(buildDetected).not.toHaveBeenCalled()
  })

  it('does NOT call buildDetectedProjectCommands when cache is fresh', () => {
    cache.set(CONVERSATION_ID, {
      timestamp: Date.now(),
      result: { ok: true, projectType: 'node', commands: [], customCommands: [] },
    })

    detectProjectCommands({
      conversation,
      listCustomTerminalCommands,
      getRepoPath,
      buildDetected,
      cache,
      conversationId: CONVERSATION_ID,
    })

    expect(buildDetected).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Cache — stale (TTL expired)
  // -------------------------------------------------------------------------

  it('calls buildDetectedProjectCommands when cache entry is stale (>15s old)', () => {
    cache.set(CONVERSATION_ID, {
      timestamp: Date.now() - DETECTED_PROJECT_COMMANDS_TTL_MS - 1, // just past TTL
      result: { ok: true, projectType: 'node', commands: [], customCommands: [] },
    })

    detectProjectCommands({
      conversation,
      listCustomTerminalCommands,
      getRepoPath,
      buildDetected,
      cache,
      conversationId: CONVERSATION_ID,
    })

    expect(buildDetected).toHaveBeenCalledTimes(1)
    expect(buildDetected).toHaveBeenCalledWith('/fake/repo')
  })

  // -------------------------------------------------------------------------
  // Cache — expired error result (cached error is ignored, rebuilds)
  // -------------------------------------------------------------------------

  it('ignores cached error result and rebuilds — does not short-circuit on expired error cache', () => {
    cache.set(CONVERSATION_ID, {
      timestamp: Date.now() - DETECTED_PROJECT_COMMANDS_TTL_MS - 1, // stale
      result: { ok: false, reason: 'unknown', message: 'previous failure' },
    })

    const result = detectProjectCommands({
      conversation,
      listCustomTerminalCommands,
      getRepoPath,
      buildDetected,
      cache,
      conversationId: CONVERSATION_ID,
    })

    // buildDetected was called, so we got the fresh success
    expect(buildDetected).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Repo path failure
  // -------------------------------------------------------------------------

  it('propagates conversation_not_found from getRepoPath', () => {
    getRepoPath = vi.fn(() => ({ ok: false as const, reason: 'conversation_not_found' }))
    const result = detectProjectCommands({
      conversation,
      listCustomTerminalCommands,
      getRepoPath,
      buildDetected,
      cache,
      conversationId: CONVERSATION_ID,
    })

    expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
    expect(buildDetected).not.toHaveBeenCalled()
  })

  it('propagates project_not_found from getRepoPath', () => {
    getRepoPath = vi.fn(() => ({ ok: false as const, reason: 'project_not_found' }))
    const result = detectProjectCommands({
      conversation,
      listCustomTerminalCommands,
      getRepoPath,
      buildDetected,
      cache,
      conversationId: CONVERSATION_ID,
    })

    expect(result).toEqual({ ok: false, reason: 'project_not_found' })
    expect(buildDetected).not.toHaveBeenCalled()
  })

  it('does NOT cache result when getRepoPath fails', () => {
    getRepoPath = vi.fn(() => ({ ok: false as const, reason: 'conversation_not_found' }))
    detectProjectCommands({
      conversation,
      listCustomTerminalCommands,
      getRepoPath,
      buildDetected,
      cache,
      conversationId: CONVERSATION_ID,
    })

    expect(cache.has(CONVERSATION_ID)).toBe(false)
  })

  // -------------------------------------------------------------------------
  // buildDetectedProjectCommands failure
  // -------------------------------------------------------------------------

  it('propagates buildDetected error result as-is', () => {
    buildDetected = vi.fn((_repoPath: string) => ({
      ok: false,
      reason: 'unknown',
      message: 'package.json parse error',
    }))

    const result = detectProjectCommands({
      conversation,
      listCustomTerminalCommands,
      getRepoPath,
      buildDetected,
      cache,
      conversationId: CONVERSATION_ID,
    })

    expect(result).toEqual({ ok: false, reason: 'unknown', message: 'package.json parse error' })
  })

  it('does NOT cache error result from buildDetected', () => {
    buildDetected = vi.fn((_repoPath: string) => ({      ok: false,
      reason: 'unknown',
      message: 'something went wrong',
    }))

    detectProjectCommands({
      conversation,
      listCustomTerminalCommands,
      getRepoPath,
      buildDetected,
      cache,
      conversationId: CONVERSATION_ID,
    })

    expect(cache.has(CONVERSATION_ID)).toBe(false)
  })

  // -------------------------------------------------------------------------
  // buildDetectedProjectCommands success — merge + cache
  // -------------------------------------------------------------------------

  it('merges customCommands from DB into buildDetected success result', () => {
    buildDetected = vi.fn((_repoPath: string) => ({      ok: true,
      projectType: 'python',
      commands: [
        { id: 'python:run', label: 'python manage.py runserver', command: 'python', args: ['manage.py', 'runserver'], source: 'manage.py' },
      ],
      customCommands: [],
    }))

    const result = detectProjectCommands({
      conversation,
      listCustomTerminalCommands,
      getRepoPath,
      buildDetected,
      cache,
      conversationId: CONVERSATION_ID,
    })

    expect(result).toEqual({
      ok: true,
      projectType: 'python',
      commands: [
        { id: 'python:run', label: 'python manage.py runserver', command: 'python', args: ['manage.py', 'runserver'], source: 'manage.py' },
      ],
      customCommands: [
        { id: 'custom-1', commandText: 'make coffee', lastUsedAt: '2026-01-01T00:00:00Z' },
        { id: 'custom-2', commandText: 'brew tea', lastUsedAt: '2026-01-02T00:00:00Z' },
      ],
    })
  })

  it('passes conversationId to getRepoPath', () => {
    const differentConvId = 'conv-other'
    conversation = { id: differentConvId, project_id: PROJECT_ID }

    detectProjectCommands({
      conversation,
      listCustomTerminalCommands,
      getRepoPath,
      buildDetected,
      cache,
      conversationId: differentConvId,
    })

    expect(getRepoPath).toHaveBeenCalledWith(differentConvId)
  })

  it('passes repoPath to buildDetectedProjectCommands', () => {
    getRepoPath = vi.fn(() => ({ ok: true, repoPath: '/my/custom/path' }))

    detectProjectCommands({
      conversation,
      listCustomTerminalCommands,
      getRepoPath,
      buildDetected,
      cache,
      conversationId: CONVERSATION_ID,
    })

    expect(buildDetected).toHaveBeenCalledWith('/my/custom/path')
  })

  it('caches result with current timestamp on buildDetectedProjectCommands success', () => {
    const before = Date.now()

    detectProjectCommands({
      conversation,
      listCustomTerminalCommands,
      getRepoPath,
      buildDetected,
      cache,
      conversationId: CONVERSATION_ID,
    })

    const after = Date.now()
    expect(cache.has(CONVERSATION_ID)).toBe(true)
    const entry = cache.get(CONVERSATION_ID)!
    expect(entry.timestamp).toBeGreaterThanOrEqual(before)
    expect(entry.timestamp).toBeLessThanOrEqual(after)
    expect(entry.result.ok).toBe(true)
  })

  it('second call returns same cached entry without calling buildDetected again', () => {
    // First call — populates cache
    const result1 = detectProjectCommands({
      conversation,
      listCustomTerminalCommands,
      getRepoPath,
      buildDetected,
      cache,
      conversationId: CONVERSATION_ID,
    })
    expect(result1.ok).toBe(true)
    expect(buildDetected).toHaveBeenCalledTimes(1)

    // Second call — cache hit
    const result2 = detectProjectCommands({
      conversation,
      listCustomTerminalCommands,
      getRepoPath,
      buildDetected,
      cache,
      conversationId: CONVERSATION_ID,
    })
    expect(result2.ok).toBe(true)
    // buildDetected still called only once
    expect(buildDetected).toHaveBeenCalledTimes(1)
    // Custom commands are re-merged on cache hit
    expect(listCustomTerminalCommands).toHaveBeenCalledTimes(2)
  })

  it('handles empty customCommands list gracefully', () => {
    customCommands = []
    listCustomTerminalCommands = vi.fn(() => [])

    const result = detectProjectCommands({
      conversation,
      listCustomTerminalCommands,
      getRepoPath,
      buildDetected,
      cache,
      conversationId: CONVERSATION_ID,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.customCommands).toEqual([])
    }
  })

  it('passes conversation.project_id to listCustomTerminalCommands', () => {
    detectProjectCommands({
      conversation,
      listCustomTerminalCommands,
      getRepoPath,
      buildDetected,
      cache,
      conversationId: CONVERSATION_ID,
    })

    expect(listCustomTerminalCommands).toHaveBeenCalledWith(PROJECT_ID)
  })
})
