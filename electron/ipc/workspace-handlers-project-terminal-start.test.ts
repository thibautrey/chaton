import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `workspace:startProjectCommandTerminal` IPC handler.
 *
 * The handler is replicated inline (same approach as the sibling test files) to
 * avoid needing the full workspace-handlers.ts module which requires heavy dep setup.
 *
 * The inline handler mirrors electron/ipc/workspace-handlers.ts lines 3314–3497
 * INCLUDING the spawn try/catch fix applied in this session.
 *
 * Coverage:
 * - conversation_not_found guard
 * - project_not_found guard
 * - access_denied guard (requires "open" access_mode)
 * - getConversationProjectRepoPath failure propagates
 * - buildDetectedProjectCommands failure propagates
 * - command_not_found guard
 * - already_running guard
 * - Spawn synchronous throw → structured spawn_failed response (THE FIX)
 * - Success: run added to Map, meta event appended, listeners attached
 * - Custom commands saved to DB
 */

// =============================================================================
// Types mirroring the real handler
// =============================================================================

interface RunEvent {
  seq: number
  type: 'stdout' | 'stderr' | 'meta'
  text: string
  ts: string
}

interface MockProcess {
  stdout?: { on: (event: string, cb: (chunk: Buffer) => void) => void }
  stderr?: { on: (event: string, cb: (chunk: Buffer) => void) => void }
  on: (event: string, cb: (code: number | null) => void) => void
  kill: (signal: string) => void
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
  process: MockProcess
}

interface HandlerParams {
  conversationId: string
  commandId: string
  customCommandText?: string
  conversation: { id: string; project_id: string | null; access_mode: string } | null
  repoResult: { ok: boolean; repoPath?: string; reason?: string }
  detectedResult: { ok: boolean; commands?: { id: string; label: string; command: string; args: string[]; cwd?: string }[] }
  savedCustomCommands: { id: string; command_text: string }[]
  projectCommandRuns: Map<string, ProjectTerminalRun>
  spawnFn: () => MockProcess | never
  saveCommand: (projectId: string, text: string) => void
  appendEvent: (run: ProjectTerminalRun, type: string, text: string) => void
}

// =============================================================================
// Inline handler — mirrors workspace-handlers.ts lines 3314–3497
// with the spawn try/catch fix applied
// =============================================================================

function startProjectCommandTerminal(p: HandlerParams) {
  // Conversation guard
  if (!p.conversation) {
    return { ok: false, reason: 'conversation_not_found' }
  }

  // Project guard
  if (!p.conversation.project_id) {
    return { ok: false, reason: 'project_not_found' }
  }

  // Access mode guard
  if (p.conversation.access_mode !== 'open') {
    return {
      ok: false,
      reason: 'access_denied',
      message: 'Host command execution requires open access mode',
    }
  }

  // Repo path
  if (!p.repoResult.ok) {
    return p.repoResult as { ok: false; reason: string }
  }

  // Detect commands
  if (!p.detectedResult.ok) {
    return p.detectedResult as { ok: false }
  }

  // Find target
  const customTarget = p.commandId.startsWith('custom:')
    ? p.savedCustomCommands.find((c) => c.id === p.commandId.slice('custom:'.length))
    : null
  const target =
    (p.detectedResult.commands ?? []).find((c) => c.id === p.commandId) ??
    (customTarget
      ? {
          id: p.commandId,
          label: customTarget.command_text,
          command: customTarget.command_text,
          args: [] as string[],
          source: 'custom-history' as const,
          cwd: p.repoResult.repoPath,
          isCustom: true,
          commandText: customTarget.command_text,
        }
      : p.commandId === 'custom:new' && p.customCommandText?.trim()
        ? {
            id: p.commandId,
            label: p.customCommandText.trim(),
            command: p.customCommandText.trim(),
            args: [] as string[],
            source: 'custom-input' as const,
            cwd: p.repoResult.repoPath,
            isCustom: true,
            commandText: p.customCommandText.trim(),
          }
        : null)

  if (!target) {
    return { ok: false, reason: 'command_not_found' }
  }

  // Already-running guard
  const alreadyRunning = Array.from(p.projectCommandRuns.values()).some(
    (run) => run.conversationId === p.conversationId && run.commandId === p.commandId && run.status === 'running',
  )
  if (alreadyRunning) {
    return { ok: false, reason: 'already_running' }
  }

  // Spawn + setup — THE FIX: wrapped in try/catch to handle synchronous throws
  try {
    const runId = 'test-' + Math.random().toString(36).slice(2)
    const startedAt = new Date().toISOString()
    const runCwd = target.cwd ?? (p.repoResult.repoPath ?? '/tmp')
    const commandPreview = target.isCustom
      ? (target.commandText ?? target.label)
      : [target.command, ...target.args].join(' ')

    const child: MockProcess = p.spawnFn()

    const run: ProjectTerminalRun = {
      id: runId,
      conversationId: p.conversationId,
      commandId: p.commandId,
      title: `${target.label} · ${runId.slice(0, 6)}`,
      commandLabel: target.label,
      commandPreview,
      cwd: runCwd,
      status: 'running',
      exitCode: null,
      startedAt,
      endedAt: null,
      nextSeq: 1,
      events: [],
      process: child,
    }
    p.projectCommandRuns.set(runId, run)

    if (target.isCustom && p.conversation.project_id) {
      p.saveCommand(p.conversation.project_id, target.commandText ?? target.label)
    }
    p.appendEvent(run, 'meta', `$ ${commandPreview}\n`)

    child.stdout?.on('data', (chunk: Buffer) => {
      p.appendEvent(run, 'stdout', String(chunk))
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      p.appendEvent(run, 'stderr', String(chunk))
    })

    return { ok: true, runId, startedAt }
  } catch (err: unknown) {
    return {
      ok: false,
      reason: 'spawn_failed',
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

// =============================================================================
// Tests — guards
// =============================================================================

const BASE = (): HandlerParams => ({
  conversationId: 'conv-1',
  commandId: 'node:npm:build',
  customCommandText: undefined,
  conversation: { id: 'conv-1', project_id: 'proj-1', access_mode: 'open' },
  repoResult: { ok: true, repoPath: '/tmp/repo' },
  detectedResult: {
    ok: true,
    commands: [{ id: 'node:npm:build', label: 'npm run build', command: 'npm', args: ['run', 'build'] }],
  },
  savedCustomCommands: [],
  projectCommandRuns: new Map(),
  spawnFn: () => ({ on: vi.fn(), kill: vi.fn(), stdout: { on: vi.fn() }, stderr: { on: vi.fn() } }) as MockProcess,
  saveCommand: vi.fn(),
  appendEvent: vi.fn(),
})

describe('workspace:startProjectCommandTerminal — guards', () => {
  it('returns conversation_not_found when conversation is null', () => {
    const p = BASE()
    p.conversation = null
    const result = startProjectCommandTerminal(p)
    expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
  })

  it('returns project_not_found when project_id is null', () => {
    const p = BASE()
    p.conversation = { id: 'conv-1', project_id: null, access_mode: 'open' }
    const result = startProjectCommandTerminal(p)
    expect(result).toEqual({ ok: false, reason: 'project_not_found' })
  })

  it('returns access_denied when access_mode is secure', () => {
    const p = BASE()
    p.conversation = { id: 'conv-1', project_id: 'proj-1', access_mode: 'secure' }
    const result = startProjectCommandTerminal(p)
    expect(result).toEqual({
      ok: false,
      reason: 'access_denied',
      message: 'Host command execution requires open access mode',
    })
  })

  it('returns access_denied when access_mode is empty', () => {
    const p = BASE()
    p.conversation = { id: 'conv-1', project_id: 'proj-1', access_mode: '' }
    const result = startProjectCommandTerminal(p)
    expect(result).toEqual({
      ok: false,
      reason: 'access_denied',
      message: 'Host command execution requires open access mode',
    })
  })

  it('propagates getConversationProjectRepoPath failure', () => {
    const p = BASE()
    p.repoResult = { ok: false, reason: 'not_git_repo' }
    const result = startProjectCommandTerminal(p)
    expect(result).toEqual({ ok: false, reason: 'not_git_repo' })
  })

  it('propagates buildDetectedProjectCommands failure', () => {
    const p = BASE()
    p.detectedResult = { ok: false }
    const result = startProjectCommandTerminal(p)
    expect(result).toEqual({ ok: false })
  })

  it('returns command_not_found for unrecognized commandId', () => {
    const p = BASE()
    p.commandId = 'node:npm:does-not-exist'
    p.savedCustomCommands = []
    const result = startProjectCommandTerminal(p)
    expect(result).toEqual({ ok: false, reason: 'command_not_found' })
  })

  it('returns command_not_found for custom:new with empty text', () => {
    const p = BASE()
    p.commandId = 'custom:new'
    p.customCommandText = ''
    const result = startProjectCommandTerminal(p)
    expect(result).toEqual({ ok: false, reason: 'command_not_found' })
  })

  it('returns command_not_found for custom:new with whitespace-only text', () => {
    const p = BASE()
    p.commandId = 'custom:new'
    p.customCommandText = '   '
    const result = startProjectCommandTerminal(p)
    expect(result).toEqual({ ok: false, reason: 'command_not_found' })
  })

  it('returns already_running when identical run is in Map with status running', () => {
    const p = BASE()
    const existing: ProjectTerminalRun = {
      id: 'existing', conversationId: 'conv-1', commandId: 'node:npm:build',
      title: 'npm run build', commandLabel: 'npm run build', commandPreview: 'npm run build',
      cwd: '/tmp', status: 'running', exitCode: null, startedAt: new Date().toISOString(),
      endedAt: null, nextSeq: 1, events: [],
      process: { on: vi.fn(), kill: vi.fn() } as MockProcess,
    }
    p.projectCommandRuns.set('existing', existing)
    const result = startProjectCommandTerminal(p)
    expect(result).toEqual({ ok: false, reason: 'already_running' })
  })
})

// =============================================================================
// Tests — spawn error handling (THE FIX)
// =============================================================================

describe('workspace:startProjectCommandTerminal — spawn error handling', () => {
  it('returns spawn_failed when spawn() throws with Error', () => {
    const p = BASE()
    p.spawnFn = () => { throw new Error('ENOENT: no such file or directory') }
    const result = startProjectCommandTerminal(p)
    expect(result).toEqual({
      ok: false,
      reason: 'spawn_failed',
      message: 'ENOENT: no such file or directory',
    })
  })

  it('returns spawn_failed with string coercion for non-Error throws', () => {
    const p = BASE()
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    p.spawnFn = () => { throw 'spawn failed: permission denied' }
    const result = startProjectCommandTerminal(p)
    expect(result).toEqual({
      ok: false,
      reason: 'spawn_failed',
      message: 'spawn failed: permission denied',
    })
  })

  it('Map stays clean when spawn throws (no orphaned entries)', () => {
    const p = BASE()
    p.spawnFn = () => { throw new Error('bad cwd') }
    startProjectCommandTerminal(p)
    expect(p.projectCommandRuns.size).toBe(0)
  })
})

// =============================================================================
// Tests — success path
// =============================================================================

describe('workspace:startProjectCommandTerminal — success', () => {
  it('returns ok:true with runId and startedAt', () => {
    const p = BASE()
    const result = startProjectCommandTerminal(p)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.runId).toBeDefined()
      expect(result.startedAt).toBeDefined()
    }
  })

  it('run is added to projectCommandRuns Map', () => {
    const p = BASE()
    startProjectCommandTerminal(p)
    expect(p.projectCommandRuns.size).toBe(1)
    const run = Array.from(p.projectCommandRuns.values())[0]
    expect(run.conversationId).toBe('conv-1')
    expect(run.commandId).toBe('node:npm:build')
    expect(run.status).toBe('running')
  })

  it('appends meta event with command preview', () => {
    const events: { type: string; text: string }[] = []
    const p = BASE()
    p.appendEvent = (run, type, text) => events.push({ type, text })
    startProjectCommandTerminal(p)
    expect(events).toContainEqual({ type: 'meta', text: '$ npm run build\n' })
  })

  it('attaches stdout and stderr listeners', () => {
    const stdoutOn = vi.fn()
    const stderrOn = vi.fn()
    const p = BASE()
    p.spawnFn = () => ({ on: vi.fn(), kill: vi.fn(), stdout: { on: stdoutOn }, stderr: { on: stderrOn } }) as MockProcess
    startProjectCommandTerminal(p)
    expect(stdoutOn).toHaveBeenCalledWith('data', expect.any(Function))
    expect(stderrOn).toHaveBeenCalledWith('data', expect.any(Function))
  })
})

// =============================================================================
// Tests — custom commands
// =============================================================================

describe('workspace:startProjectTerminal — custom commands', () => {
  it('saves to DB when command is custom history', () => {
    const saves: [string, string][] = []
    const p = BASE()
    p.commandId = 'custom:my-script'
    p.detectedResult = { ok: true, commands: [] }
    p.savedCustomCommands = [{ id: 'my-script', command_text: 'echo hello' }]
    p.saveCommand = (pid, txt) => saves.push([pid, txt])
    startProjectCommandTerminal(p)
    expect(saves).toContainEqual(['proj-1', 'echo hello'])
  })

  it('does NOT save to DB for detected commands', () => {
    const saves: [string, string][] = []
    const p = BASE()
    p.saveCommand = (pid, txt) => saves.push([pid, txt])
    startProjectCommandTerminal(p)
    expect(saves).toHaveLength(0)
  })

  it('custom:new with explicit text spawns with correct preview', () => {
    const events: { type: string; text: string }[] = []
    const p = BASE()
    p.commandId = 'custom:new'
    p.customCommandText = 'ls -la'
    p.detectedResult = { ok: true, commands: [] }
    p.savedCustomCommands = []
    p.appendEvent = (run, type, text) => events.push({ type, text })
    const result = startProjectCommandTerminal(p)
    expect(result).toEqual(expect.objectContaining({ ok: true }))
    expect(events).toContainEqual({ type: 'meta', text: '$ ls -la\n' })
  })
})
