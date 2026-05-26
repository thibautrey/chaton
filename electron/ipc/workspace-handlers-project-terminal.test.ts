import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `workspace:readProjectCommandTerminal` and
 * `workspace:stopProjectCommandTerminal` IPC handlers.
 *
 * workspace:readProjectCommandTerminal
 * - Returns `run_not_found` when runId is not in projectCommandRuns Map
 * - Returns ok:true with run metadata + filtered events (seq > afterSeq)
 * - Does NOT call any deps when run not found
 * - Filters events by seq number
 * - Includes all run metadata fields in response
 *
 * workspace:stopProjectCommandTerminal
 * - Returns `run_not_found` when runId is not in projectCommandRuns Map
 * - Returns ok:true and sets run status to 'stopped' when run is found
 * - Sets endedAt timestamp when run is found
 * - Appends 'stopped by user' meta event to run
 * - Kills the child process with SIGTERM
 * - Escalates to SIGKILL when the child ignores SIGTERM
 * - Gracefully ignores kill failures (already exited process)
 * - Removes runId from projectCommandRuns Map
 * - Does NOT touch run status or endedAt if already stopped
 * - Does NOT attempt to kill if no process exists
 *
 * We replicate the minimal handler logic inline to test without needing the full
 * workspace-handlers.ts module (which requires complex dep setup).
 */

describe('workspace:readProjectCommandTerminal', () => {
  // -------------------------------------------------------------------------
  // Types mirroring those used by the real handler
  // -------------------------------------------------------------------------
  type Result =
    | { ok: true; run: object; events: object[] }
    | { ok: false; reason: 'run_not_found' }

  interface RunEvent {
    seq: number
    type: 'stdout' | 'stderr' | 'meta'
    text: string
    ts: string
  }

  interface ProjectTerminalRun {
    id: string
    conversationId: string
    commandId: string
    title: string
    commandLabel: string
    commandPreview: string
    cwd: string
    status: 'running' | 'exited' | 'failed' | 'stopped'
    exitCode: number | null
    startedAt: string
    endedAt: string | null
    nextSeq: number
    events: RunEvent[]
    process: object | null
  }

  // -------------------------------------------------------------------------
  // Inline handler — mirrors workspace-handlers.ts lines 3485–3510.
  // -------------------------------------------------------------------------
  function readProjectCommandTerminal(params: {
    projectCommandRuns: Map<string, ProjectTerminalRun>
    runId: string
    afterSeq?: number
  }): Result {
    const run = params.projectCommandRuns.get(params.runId)
    if (!run) {
      return { ok: false, reason: 'run_not_found' }
    }
    return {
      ok: true,
      run: {
        id: run.id,
        title: run.title,
        commandLabel: run.commandLabel,
        commandPreview: run.commandPreview,
        status: run.status,
        exitCode: run.exitCode,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
      },
      events: run.events.filter((event: RunEvent) => event.seq > (params.afterSeq ?? 0)),
    }
  }

  // -------------------------------------------------------------------------
  // Tests
  // -------------------------------------------------------------------------

  it('returns run_not_found when runId is not in projectCommandRuns Map', () => {
    const runs = new Map<string, ProjectTerminalRun>()
    const result = readProjectCommandTerminal({ projectCommandRuns: runs, runId: 'nonexistent' })
    expect(result).toEqual({ ok: false, reason: 'run_not_found' })
  })

  it('returns ok:true with run metadata when run is found', () => {
    const runs = new Map<string, ProjectTerminalRun>()
    runs.set('run-123', {
      id: 'run-123',
      conversationId: 'conv-1',
      commandId: 'git-status',
      title: 'git status · abc123',
      commandLabel: 'git status',
      commandPreview: 'git status',
      cwd: '/tmp/repo',
      status: 'running',
      exitCode: null,
      startedAt: '2026-01-01T00:00:00Z',
      endedAt: null,
      nextSeq: 1,
      events: [],
      process: {},
    })

    const result = readProjectCommandTerminal({ projectCommandRuns: runs, runId: 'run-123' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.run).toEqual({
        id: 'run-123',
        title: 'git status · abc123',
        commandLabel: 'git status',
        commandPreview: 'git status',
        status: 'running',
        exitCode: null,
        startedAt: '2026-01-01T00:00:00Z',
        endedAt: null,
      })
      expect(result.events).toEqual([])
    }
  })

  it('filters events by seq number', () => {
    const runs = new Map<string, ProjectTerminalRun>()
    const now = '2026-01-01T00:00:00Z'
    runs.set('run-123', {
      id: 'run-123',
      conversationId: 'conv-1',
      commandId: 'build',
      title: 'npm run build',
      commandLabel: 'build',
      commandPreview: 'npm run build',
      cwd: '/tmp/repo',
      status: 'running',
      exitCode: null,
      startedAt: now,
      endedAt: null,
      nextSeq: 5,
      events: [
        { seq: 1, type: 'meta', text: '$ npm run build\n', ts: now },
        { seq: 2, type: 'stdout', text: 'Compiling...\n', ts: now },
        { seq: 3, type: 'stderr', text: 'Warning: ...\n', ts: now },
        { seq: 4, type: 'stdout', text: 'Done.\n', ts: now },
      ],
      process: {},
    })

    const result = readProjectCommandTerminal({
      projectCommandRuns: runs,
      runId: 'run-123',
      afterSeq: 2,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.events).toHaveLength(2)
      expect(result.events.map((e: RunEvent) => e.seq)).toEqual([3, 4])
    }
  })

  it('returns all events when afterSeq is 0 (default)', () => {
    const runs = new Map<string, ProjectTerminalRun>()
    const now = '2026-01-01T00:00:00Z'
    runs.set('run-123', {
      id: 'run-123',
      conversationId: 'conv-1',
      commandId: 'test',
      title: 'Test',
      commandLabel: 'test',
      commandPreview: 'npm test',
      cwd: '/tmp/repo',
      status: 'exited',
      exitCode: 0,
      startedAt: now,
      endedAt: now,
      nextSeq: 3,
      events: [
        { seq: 1, type: 'meta', text: '$ npm test\n', ts: now },
        { seq: 2, type: 'stdout', text: 'PASS\n', ts: now },
      ],
      process: {},
    })

    const result = readProjectCommandTerminal({ projectCommandRuns: runs, runId: 'run-123' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.events).toHaveLength(2)
    }
  })

  it('returns empty events array when all events are filtered out', () => {
    const runs = new Map<string, ProjectTerminalRun>()
    const now = '2026-01-01T00:00:00Z'
    runs.set('run-123', {
      id: 'run-123',
      conversationId: 'conv-1',
      commandId: 'ls',
      title: 'ls',
      commandLabel: 'ls',
      commandPreview: 'ls -la',
      cwd: '/tmp/repo',
      status: 'exited',
      exitCode: 0,
      startedAt: now,
      endedAt: now,
      nextSeq: 3,
      events: [
        { seq: 1, type: 'meta', text: '$ ls -la\n', ts: now },
        { seq: 2, type: 'stdout', text: 'total 4\n', ts: now },
      ],
      process: {},
    })

    const result = readProjectCommandTerminal({
      projectCommandRuns: runs,
      runId: 'run-123',
      afterSeq: 100,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.events).toHaveLength(0)
    }
  })

  it('returns run with non-null exitCode and endedAt when exited', () => {
    const runs = new Map<string, ProjectTerminalRun>()
    const start = '2026-01-01T00:00:00Z'
    const end = '2026-01-01T00:00:05Z'
    runs.set('run-123', {
      id: 'run-123',
      conversationId: 'conv-1',
      commandId: 'echo',
      title: 'echo hello',
      commandLabel: 'echo hello',
      commandPreview: 'echo hello',
      cwd: '/tmp',
      status: 'exited',
      exitCode: 0,
      startedAt: start,
      endedAt: end,
      nextSeq: 2,
      events: [],
      process: null,
    })

    const result = readProjectCommandTerminal({ projectCommandRuns: runs, runId: 'run-123' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.run).toMatchObject({
        status: 'exited',
        exitCode: 0,
        startedAt: start,
        endedAt: end,
      })
    }
  })

  it('returns run with failed status', () => {
    const runs = new Map<string, ProjectTerminalRun>()
    runs.set('run-456', {
      id: 'run-456',
      conversationId: 'conv-2',
      commandId: 'fail',
      title: 'fail',
      commandLabel: 'fail',
      commandPreview: 'exit 1',
      cwd: '/tmp',
      status: 'failed',
      exitCode: 1,
      startedAt: '2026-01-01T00:00:00Z',
      endedAt: '2026-01-01T00:00:01Z',
      nextSeq: 2,
      events: [],
      process: null,
    })

    const result = readProjectCommandTerminal({ projectCommandRuns: runs, runId: 'run-456' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.run).toMatchObject({ status: 'failed', exitCode: 1 })
    }
  })
})

// =============================================================================
// workspace:stopProjectCommandTerminal
// =============================================================================

describe('workspace:stopProjectCommandTerminal', () => {
  // -------------------------------------------------------------------------
  // Types mirroring those used by the real handler
  // -------------------------------------------------------------------------
  type Result =
    | {
        ok: true
        run: {
          id: string
          status: 'running' | 'exited' | 'failed' | 'stopped'
          endedAt: string | null
        }
        events: RunEvent[]
      }
    | { ok: false; reason: 'run_not_found' }

  interface RunEvent {
    seq: number
    type: 'stdout' | 'stderr' | 'meta'
    text: string
    ts: string
  }

  interface MockProcess {
    exitCode?: number | null
    signalCode?: string | null
    kill: (signal: string) => void
    once?: (event: string, listener: () => void) => void
  }

  interface ProjectTerminalRun {
    id: string
    conversationId: string
    commandId: string
    status: 'running' | 'exited' | 'failed' | 'stopped'
    endedAt: string | null
    events: RunEvent[]
    process: MockProcess | null
  }

  // -------------------------------------------------------------------------
  const FORCE_KILL_AFTER_MS = 1_500

  function hasExited(process: MockProcess): boolean {
    return process.exitCode !== null && process.exitCode !== undefined
      || process.signalCode !== null && process.signalCode !== undefined
  }

  function terminateProjectTerminalProcess(process: MockProcess | null) {
    if (!process || hasExited(process)) return
    try {
      process.kill('SIGTERM')
    } catch {
      return
    }
    const forceTimer = setTimeout(() => {
      if (!hasExited(process)) {
        try {
          process.kill('SIGKILL')
        } catch {
          // Process may have exited between the check and signal.
        }
      }
    }, FORCE_KILL_AFTER_MS)
    process.once?.('exit', () => clearTimeout(forceTimer))
  }

  // Inline handler — mirrors workspace-handlers.ts lines 3508–3540.
  // -------------------------------------------------------------------------
  function stopProjectCommandTerminal(params: {
    projectCommandRuns: Map<string, ProjectTerminalRun>
    runId: string
    appendProjectCommandRunEvent: (run: ProjectTerminalRun, type: string, text: string) => void
  }): Result {
    const run = params.projectCommandRuns.get(params.runId)
    if (!run) {
      return { ok: false, reason: 'run_not_found' }
    }
    if (run.process && run.status === 'running') {
      run.status = 'stopped'
      run.endedAt = new Date().toISOString()
      params.appendProjectCommandRunEvent(
        run,
        'meta',
        '\nProcess stopped by user.\n',
      )
      terminateProjectTerminalProcess(run.process)
    }
    const stoppedRun = {
      id: run.id,
      status: run.status,
      endedAt: run.endedAt,
    }
    const events = run.events.slice()
    params.projectCommandRuns.delete(params.runId)
    return { ok: true, run: stoppedRun, events }
  }

  // -------------------------------------------------------------------------
  // Tests
  // -------------------------------------------------------------------------

  it('returns run_not_found when runId is not in projectCommandRuns Map', () => {
    const runs = new Map<string, ProjectTerminalRun>()
    const appendFn = vi.fn()
    const result = stopProjectCommandTerminal({
      projectCommandRuns: runs,
      runId: 'nonexistent',
      appendProjectCommandRunEvent: appendFn,
    })
    expect(result).toEqual({ ok: false, reason: 'run_not_found' })
    expect(appendFn).not.toHaveBeenCalled()
  })

  it('sets run status to stopped when run is found and running', () => {
    const runs = new Map<string, ProjectTerminalRun>()
    let storedStatus: string = 'running'
    let storedEndedAt: string | null = null
    const run: ProjectTerminalRun = {
      id: 'run-123',
      conversationId: 'conv-1',
      commandId: 'build',
      status: 'running',
      endedAt: null,
      events: [],
      process: {
        kill: vi.fn(),
      },
    }
    // Make the stored run track status changes
    Object.defineProperty(run, 'status', {
      get: () => storedStatus,
      set: (v) => { storedStatus = v },
    })
    Object.defineProperty(run, 'endedAt', {
      get: () => storedEndedAt,
      set: (v) => { storedEndedAt = v },
    })

    runs.set('run-123', run)

    const appendFn = vi.fn()
    const result = stopProjectCommandTerminal({
      projectCommandRuns: runs,
      runId: 'run-123',
      appendProjectCommandRunEvent: appendFn,
    })

    expect(result.ok).toBe(true)
    expect(storedStatus).toBe('stopped')
    expect(storedEndedAt).not.toBeNull()
    if (result.ok) {
      expect(result.run.status).toBe('stopped')
      expect(result.run.endedAt).toBe(storedEndedAt)
      expect(result.events).toEqual(run.events)
    }
    expect(appendFn).toHaveBeenCalledOnce()
    expect(appendFn).toHaveBeenCalledWith(run, 'meta', '\nProcess stopped by user.\n')
  })

  it('returns the final stopped snapshot before removing the run from the Map', () => {
    const runs = new Map<string, ProjectTerminalRun>()
    const run: ProjectTerminalRun = {
      id: 'run-123',
      conversationId: 'conv-1',
      commandId: 'serve',
      status: 'running',
      endedAt: null,
      events: [
        { seq: 1, type: 'meta', text: '$ npm run dev\n', ts: '2026-01-01T00:00:00Z' },
      ],
      process: { kill: vi.fn() },
    }
    runs.set('run-123', run)
    const appendFn = vi.fn((target: ProjectTerminalRun, type: 'stdout' | 'stderr' | 'meta', text: string) => {
      target.events.push({ seq: target.events.length + 1, type, text, ts: '2026-01-01T00:00:01Z' })
    })

    const result = stopProjectCommandTerminal({
      projectCommandRuns: runs,
      runId: 'run-123',
      appendProjectCommandRunEvent: appendFn,
    })

    expect(runs.has('run-123')).toBe(false)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.run).toMatchObject({ id: 'run-123', status: 'stopped' })
      expect(result.run.endedAt).not.toBeNull()
      expect(result.events.map((event) => event.text)).toEqual([
        '$ npm run dev\n',
        '\nProcess stopped by user.\n',
      ])
    }
  })

  it('kills the child process with SIGTERM', () => {
    const runs = new Map<string, ProjectTerminalRun>()
    let storedStatus: string = 'running'
    const mockKill = vi.fn()
    const run: ProjectTerminalRun = {
      id: 'run-123',
      conversationId: 'conv-1',
      commandId: 'serve',
      status: 'running',
      endedAt: null,
      events: [],
      process: {
        kill: mockKill,
      },
    }
    Object.defineProperty(run, 'status', {
      get: () => storedStatus,
      set: (v) => { storedStatus = v },
    })

    runs.set('run-123', run)

    const result = stopProjectCommandTerminal({
      projectCommandRuns: runs,
      runId: 'run-123',
      appendProjectCommandRunEvent: vi.fn(),
    })

    expect(result.ok).toBe(true)
    expect(mockKill).toHaveBeenCalledWith('SIGTERM')
  })

  it('escalates to SIGKILL when the child ignores SIGTERM', () => {
    vi.useFakeTimers()
    try {
      const runs = new Map<string, ProjectTerminalRun>()
      let storedStatus: string = 'running'
      const mockKill = vi.fn()
      const run: ProjectTerminalRun = {
        id: 'run-123',
        conversationId: 'conv-1',
        commandId: 'serve',
        status: 'running',
        endedAt: null,
        events: [],
        process: {
          exitCode: null,
          signalCode: null,
          kill: mockKill,
          once: vi.fn(),
        },
      }
      Object.defineProperty(run, 'status', {
        get: () => storedStatus,
        set: (v) => { storedStatus = v },
      })

      runs.set('run-123', run)

      const result = stopProjectCommandTerminal({
        projectCommandRuns: runs,
        runId: 'run-123',
        appendProjectCommandRunEvent: vi.fn(),
      })

      expect(result.ok).toBe(true)
      expect(mockKill).toHaveBeenCalledWith('SIGTERM')
      vi.advanceTimersByTime(FORCE_KILL_AFTER_MS)
      expect(mockKill).toHaveBeenCalledWith('SIGKILL')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not escalate when the child exits before the force timer fires', () => {
    vi.useFakeTimers()
    try {
      const runs = new Map<string, ProjectTerminalRun>()
      let storedStatus: string = 'running'
      let exitListener: (() => void) | undefined
      const mockKill = vi.fn()
      const run: ProjectTerminalRun = {
        id: 'run-123',
        conversationId: 'conv-1',
        commandId: 'serve',
        status: 'running',
        endedAt: null,
        events: [],
        process: {
          exitCode: null,
          signalCode: null,
          kill: mockKill,
          once: vi.fn((event: string, listener: () => void) => {
            if (event === 'exit') exitListener = listener
          }),
        },
      }
      Object.defineProperty(run, 'status', {
        get: () => storedStatus,
        set: (v) => { storedStatus = v },
      })

      runs.set('run-123', run)

      stopProjectCommandTerminal({
        projectCommandRuns: runs,
        runId: 'run-123',
        appendProjectCommandRunEvent: vi.fn(),
      })

      expect(mockKill).toHaveBeenCalledWith('SIGTERM')
      run.process!.exitCode = 0
      exitListener?.()
      vi.advanceTimersByTime(FORCE_KILL_AFTER_MS)
      expect(mockKill).not.toHaveBeenCalledWith('SIGKILL')
    } finally {
      vi.useRealTimers()
    }
  })

  it('gracefully ignores kill failures (process already exited)', () => {
    const runs = new Map<string, ProjectTerminalRun>()
    let storedStatus: string = 'running'
    const run: ProjectTerminalRun = {
      id: 'run-123',
      conversationId: 'conv-1',
      commandId: 'test',
      status: 'running',
      endedAt: null,
      events: [],
      process: {
        kill: vi.fn(() => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }) }),
      },
    }
    Object.defineProperty(run, 'status', {
      get: () => storedStatus,
      set: (v) => { storedStatus = v },
    })

    runs.set('run-123', run)

    const result = stopProjectCommandTerminal({
      projectCommandRuns: runs,
      runId: 'run-123',
      appendProjectCommandRunEvent: vi.fn(),
    })

    // Must NOT throw — kill failures are silently ignored
    expect(result.ok).toBe(true)
    expect(storedStatus).toBe('stopped')
  })

  it('removes runId from projectCommandRuns Map', () => {
    const runs = new Map<string, ProjectTerminalRun>()
    let storedStatus: string = 'running'
    const run: ProjectTerminalRun = {
      id: 'run-123',
      conversationId: 'conv-1',
      commandId: 'build',
      status: 'running',
      endedAt: null,
      events: [],
      process: {
        kill: vi.fn(),
      },
    }
    Object.defineProperty(run, 'status', {
      get: () => storedStatus,
      set: (v) => { storedStatus = v },
    })

    runs.set('run-123', run)

    stopProjectCommandTerminal({
      projectCommandRuns: runs,
      runId: 'run-123',
      appendProjectCommandRunEvent: vi.fn(),
    })

    expect(runs.has('run-123')).toBe(false)
  })

  it('does NOT attempt to kill or update if run status is not running', () => {
    const runs = new Map<string, ProjectTerminalRun>()
    const run: ProjectTerminalRun = {
      id: 'run-123',
      conversationId: 'conv-1',
      commandId: 'test',
      status: 'exited',
      endedAt: '2026-01-01T00:00:05Z',
      events: [],
      process: {
        kill: vi.fn(),
      },
    }
    runs.set('run-123', run)

    const appendFn = vi.fn()
    const result = stopProjectCommandTerminal({
      projectCommandRuns: runs,
      runId: 'run-123',
      appendProjectCommandRunEvent: appendFn,
    })

    expect(result.ok).toBe(true)
    // Process already exited — should not kill or append
    expect(run.process?.kill).not.toHaveBeenCalled()
    expect(appendFn).not.toHaveBeenCalled()
    // Status and endedAt should be preserved
    expect(run.status).toBe('exited')
    expect(run.endedAt).toBe('2026-01-01T00:00:05Z')
  })

  it('does NOT attempt to kill if run has no process (null)', () => {
    const runs = new Map<string, ProjectTerminalRun>()
    const run: ProjectTerminalRun = {
      id: 'run-123',
      conversationId: 'conv-1',
      commandId: 'echo',
      status: 'running',
      endedAt: null,
      events: [],
      process: null,
    }
    runs.set('run-123', run)

    const appendFn = vi.fn()
    const result = stopProjectCommandTerminal({
      projectCommandRuns: runs,
      runId: 'run-123',
      appendProjectCommandRunEvent: appendFn,
    })

    expect(result.ok).toBe(true)
    // Status remains 'running' because the condition `run.process && run.status === 'running'`
    // short-circuits on the null process — no status update, no event appended
    expect(run.status).toBe('running')
    expect(appendFn).not.toHaveBeenCalled()
  })

  it('removes run from Map even when status is not running', () => {
    const runs = new Map<string, ProjectTerminalRun>()
    const run: ProjectTerminalRun = {
      id: 'run-123',
      conversationId: 'conv-1',
      commandId: 'test',
      status: 'exited',
      endedAt: '2026-01-01T00:00:05Z',
      events: [],
      process: null,
    }
    runs.set('run-123', run)

    const result = stopProjectCommandTerminal({
      projectCommandRuns: runs,
      runId: 'run-123',
      appendProjectCommandRunEvent: vi.fn(),
    })

    expect(result.ok).toBe(true)
    expect(runs.has('run-123')).toBe(false)
  })
})
