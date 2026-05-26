import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `sandbox:executeNodeCommand`, `sandbox:executeNpmCommand`,
 * `sandbox:executePythonCommand`, and `sandbox:executePipCommand` IPC handlers.
 *
 * All four handlers were updated in a prior session to add IPC-level input
 * validation before delegating to sandboxManager methods:
 *
 * sandbox:executeNodeCommand (workspace-handlers.ts):
 *   - command: must be a non-empty string (trim check)
 *   - args: must be an array where every element is a string
 *   - cwd (optional): if provided, must be a non-empty string
 *   - timeout (optional): if provided, must be a finite positive number
 *   - command.trim() passed to manager; cwd.trim() passed if provided
 *
 * sandbox:executeNpmCommand (workspace-handlers.ts):
 *   - args: must be an array where every element is a string
 *   - cwd (optional): if provided, must be a non-empty string
 *   - cwd.trim() passed if provided
 *
 * sandbox:executePythonCommand (workspace-handlers.ts):
 *   - args: must be an array where every element is a string
 *   - cwd (optional): if provided, must be a non-empty string
 *   - timeout (optional): if provided, must be a finite positive number
 *   - cwd.trim() passed if provided; timeout passed as-is
 *
 * sandbox:executePipCommand (workspace-handlers.ts):
 *   - args: must be an array where every element is a string
 *   - cwd (optional): if provided, must be a non-empty string
 *   - cwd.trim() passed if provided
 *
 * Approach: mock the sandbox-manager module so the dynamic import resolves to
 * a controlled sandboxManager stub. Inline handler factories replicate the
 * validation logic under test — kept in sync with workspace-handlers.ts.
 */

const mockSandboxManager = {
  executeNodeCommand: vi.fn(),
  executeNpmCommand: vi.fn(),
  executePythonCommand: vi.fn(),
  executePipCommand: vi.fn(),
}

vi.mock('../lib/sandbox/sandbox-manager.js', () => ({
  sandboxManager: mockSandboxManager,
}))

// ---------------------------------------------------------------------------
// Handler factories — replicate the handler logic under test.
// ---------------------------------------------------------------------------

function makeErrorResult(stderr: string) {
  return { success: false as const, stdout: '', stderr, exitCode: 1 }
}

/** sandbox:executeNodeCommand */
async function handleExecuteNodeCommand(
  command: unknown,
  args: unknown,
  cwd?: unknown,
  timeout?: unknown,
) {
  if (typeof command !== 'string' || !command.trim()) {
    return makeErrorResult('command must be a non-empty string')
  }
  if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) {
    return makeErrorResult('args must be an array of strings')
  }
  if (cwd !== undefined && (typeof cwd !== 'string' || !cwd.trim())) {
    return makeErrorResult('cwd must be a non-empty string')
  }
  if (
    timeout !== undefined &&
    (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout <= 0)
  ) {
    return makeErrorResult('timeout must be a positive number')
  }
  const { sandboxManager } = await import('../lib/sandbox/sandbox-manager.js')
  return sandboxManager.executeNodeCommand(
    command.trim(),
    args,
    typeof cwd === 'string' ? cwd.trim() : undefined,
    typeof timeout === 'number' ? timeout : undefined,
  )
}

/** sandbox:executeNpmCommand */
async function handleExecuteNpmCommand(args: unknown, cwd?: unknown) {
  if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) {
    return makeErrorResult('args must be an array of strings')
  }
  if (cwd !== undefined && (typeof cwd !== 'string' || !cwd.trim())) {
    return makeErrorResult('cwd must be a non-empty string')
  }
  const { sandboxManager } = await import('../lib/sandbox/sandbox-manager.js')
  return sandboxManager.executeNpmCommand(
    args,
    typeof cwd === 'string' ? cwd.trim() : undefined,
  )
}

/** sandbox:executePythonCommand */
async function handleExecutePythonCommand(
  args: unknown,
  cwd?: unknown,
  timeout?: unknown,
) {
  if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) {
    return makeErrorResult('args must be an array of strings')
  }
  if (cwd !== undefined && (typeof cwd !== 'string' || !cwd.trim())) {
    return makeErrorResult('cwd must be a non-empty string')
  }
  if (
    timeout !== undefined &&
    (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout <= 0)
  ) {
    return makeErrorResult('timeout must be a positive number')
  }
  const { sandboxManager } = await import('../lib/sandbox/sandbox-manager.js')
  return sandboxManager.executePythonCommand(
    args,
    typeof cwd === 'string' ? cwd.trim() : undefined,
    typeof timeout === 'number' ? timeout : undefined,
  )
}

/** sandbox:executePipCommand */
async function handleExecutePipCommand(args: unknown, cwd?: unknown) {
  if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) {
    return makeErrorResult('args must be an array of strings')
  }
  if (cwd !== undefined && (typeof cwd !== 'string' || !cwd.trim())) {
    return makeErrorResult('cwd must be a non-empty string')
  }
  const { sandboxManager } = await import('../lib/sandbox/sandbox-manager.js')
  return sandboxManager.executePipCommand(
    args,
    typeof cwd === 'string' ? cwd.trim() : undefined,
  )
}

// ---------------------------------------------------------------------------
// sandbox:executeNodeCommand
// ---------------------------------------------------------------------------

describe('sandbox:executeNodeCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSandboxManager.executeNodeCommand.mockResolvedValue({
      success: true,
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    })
  })

  // ── command validation ─────────────────────────────────────────────────────

  describe('command — invalid types', () => {
    for (const command of [undefined, null, 42, true, { cmd: 'x' }, ['node']]) {
      it(`rejects command=${JSON.stringify(command)} (invalid type)`, async () => {
        const result = await handleExecuteNodeCommand(command, [], undefined, undefined)
        expect(result).toEqual(makeErrorResult('command must be a non-empty string'))
        expect(mockSandboxManager.executeNodeCommand).not.toHaveBeenCalled()
      })
    }
  })

  describe('command — empty / whitespace-only', () => {
    for (const command of ['', '   ', '\t', '\n']) {
      it(`rejects command=${JSON.stringify(command)}`, async () => {
        const result = await handleExecuteNodeCommand(command, [], undefined, undefined)
        expect(result).toEqual(makeErrorResult('command must be a non-empty string'))
        expect(mockSandboxManager.executeNodeCommand).not.toHaveBeenCalled()
      })
    }
  })

  // ── args validation ───────────────────────────────────────────────────────

  describe('args — invalid types', () => {
    for (const args of [undefined, null, 42, true, 'node', { args: [] }]) {
      it(`rejects args=${JSON.stringify(args)} (invalid type)`, async () => {
        const result = await handleExecuteNodeCommand('node', args, undefined, undefined)
        expect(result).toEqual(makeErrorResult('args must be an array of strings'))
        expect(mockSandboxManager.executeNodeCommand).not.toHaveBeenCalled()
      })
    }
  })

  describe('args — array with non-string elements', () => {
    for (const args of [[42], [true], [null], [undefined], ['ok', 42, 'ok']]) {
      it(`rejects args=${JSON.stringify(args)} (mixed array)`, async () => {
        const result = await handleExecuteNodeCommand('node', args, undefined, undefined)
        expect(result).toEqual(makeErrorResult('args must be an array of strings'))
        expect(mockSandboxManager.executeNodeCommand).not.toHaveBeenCalled()
      })
    }
  })

  // ── cwd validation ────────────────────────────────────────────────────────

  describe('cwd — invalid types', () => {
    for (const cwd of [42, true, { cwd: '/dir' }, ['/dir']]) {
      it(`rejects cwd=${JSON.stringify(cwd)} (invalid type)`, async () => {
        const result = await handleExecuteNodeCommand('node', [], cwd, undefined)
        expect(result).toEqual(makeErrorResult('cwd must be a non-empty string'))
        expect(mockSandboxManager.executeNodeCommand).not.toHaveBeenCalled()
      })
    }
  })

  describe('cwd — empty / whitespace-only', () => {
    for (const cwd of ['', '   ']) {
      it(`rejects cwd=${JSON.stringify(cwd)}`, async () => {
        const result = await handleExecuteNodeCommand('node', [], cwd, undefined)
        expect(result).toEqual(makeErrorResult('cwd must be a non-empty string'))
        expect(mockSandboxManager.executeNodeCommand).not.toHaveBeenCalled()
      })
    }
  })

  // cwd=undefined is valid (omitted) — tested in happy path

  // ── timeout validation ───────────────────────────────────────────────────

  describe('timeout — invalid types / out-of-range', () => {
    // Note: undefined is VALID (omitted — defaults are manager's responsibility).
    // Note: 42 is VALID (positive finite number).
    for (const timeout of [true, '30', null, 0, -1, NaN, Infinity]) {
      const label = typeof timeout === 'number' ? String(timeout) : JSON.stringify(timeout)
      it(`rejects timeout=${label}`, async () => {
        const result = await handleExecuteNodeCommand('node', [], undefined, timeout)
        expect(result).toEqual(makeErrorResult('timeout must be a positive number'))
        expect(mockSandboxManager.executeNodeCommand).not.toHaveBeenCalled()
      })
    }
  })

  it('accepts timeout=undefined (omitted)', async () => {
    await handleExecuteNodeCommand('node', [], undefined, undefined)
    expect(mockSandboxManager.executeNodeCommand).toHaveBeenCalledTimes(1)
  })

  it('accepts timeout=42 (positive integer)', async () => {
    await handleExecuteNodeCommand('node', [], undefined, 42)
    expect(mockSandboxManager.executeNodeCommand).toHaveBeenCalledTimes(1)
  })

  // timeout=undefined is valid (omitted) — tested in happy path

  // ── happy path — delegation ─────────────────────────────────────────────

  it('trims command before delegation', async () => {
    await handleExecuteNodeCommand('  node  ', ['-v'], undefined, undefined)
    expect(mockSandboxManager.executeNodeCommand).toHaveBeenCalledTimes(1)
    expect(mockSandboxManager.executeNodeCommand).toHaveBeenCalledWith(
      'node',
      ['-v'],
      undefined,
      undefined,
    )
  })

  it('passes trimmed cwd when provided', async () => {
    await handleExecuteNodeCommand('node', ['-v'], '  /workspace  ', undefined)
    expect(mockSandboxManager.executeNodeCommand).toHaveBeenCalledTimes(1)
    expect(mockSandboxManager.executeNodeCommand).toHaveBeenCalledWith(
      'node',
      ['-v'],
      '/workspace',
      undefined,
    )
  })

  it('passes timeout as-is when provided', async () => {
    await handleExecuteNodeCommand('node', ['-v'], undefined, 60_000)
    expect(mockSandboxManager.executeNodeCommand).toHaveBeenCalledTimes(1)
    expect(mockSandboxManager.executeNodeCommand).toHaveBeenCalledWith(
      'node',
      ['-v'],
      undefined,
      60_000,
    )
  })

  it('passes all params correctly', async () => {
    await handleExecuteNodeCommand('  node  ', ['-v'], '  /home  ', 30_000)
    expect(mockSandboxManager.executeNodeCommand).toHaveBeenCalledWith(
      'node',
      ['-v'],
      '/home',
      30_000,
    )
  })

  it('passes success result through', async () => {
    const success = { success: true, stdout: 'output', stderr: '', exitCode: 0 }
    mockSandboxManager.executeNodeCommand.mockResolvedValue(success)
    const result = await handleExecuteNodeCommand('node', ['--version'])
    expect(result).toBe(success)
  })

  it('passes failure result through', async () => {
    const failure = { success: false, stdout: '', stderr: 'ENOENT', exitCode: 127 }
    mockSandboxManager.executeNodeCommand.mockResolvedValue(failure)
    const result = await handleExecuteNodeCommand('node', ['--bad-flag'])
    expect(result).toBe(failure)
  })

  it('validation errors short-circuit before any delegation', async () => {
    // Multiple validation failures — first one wins
    const result = await handleExecuteNodeCommand(
      '', // invalid
      [], // would be valid
      42, // would be invalid
      -1, // would be invalid
    )
    expect(result).toEqual(makeErrorResult('command must be a non-empty string'))
    expect(mockSandboxManager.executeNodeCommand).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// sandbox:executeNpmCommand
// ---------------------------------------------------------------------------

describe('sandbox:executeNpmCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSandboxManager.executeNpmCommand.mockResolvedValue({
      success: true,
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    })
  })

  describe('args — invalid types', () => {
    for (const args of [undefined, null, 42, true, 'install', { args: [] }]) {
      it(`rejects args=${JSON.stringify(args)} (invalid type)`, async () => {
        const result = await handleExecuteNpmCommand(args, undefined)
        expect(result).toEqual(makeErrorResult('args must be an array of strings'))
        expect(mockSandboxManager.executeNpmCommand).not.toHaveBeenCalled()
      })
    }
  })

  describe('args — array with non-string elements', () => {
    for (const args of [[42], [true], ['install', 42]]) {
      it(`rejects args=${JSON.stringify(args)}`, async () => {
        const result = await handleExecuteNpmCommand(args, undefined)
        expect(result).toEqual(makeErrorResult('args must be an array of strings'))
        expect(mockSandboxManager.executeNpmCommand).not.toHaveBeenCalled()
      })
    }
  })

  describe('cwd — invalid types', () => {
    for (const cwd of [42, true, { cwd: '/dir' }, ['/dir']]) {
      it(`rejects cwd=${JSON.stringify(cwd)} (invalid type)`, async () => {
        const result = await handleExecuteNpmCommand(['install'], cwd)
        expect(result).toEqual(makeErrorResult('cwd must be a non-empty string'))
        expect(mockSandboxManager.executeNpmCommand).not.toHaveBeenCalled()
      })
    }
  })

  describe('cwd — empty / whitespace-only', () => {
    for (const cwd of ['', '   ']) {
      it(`rejects cwd=${JSON.stringify(cwd)}`, async () => {
        const result = await handleExecuteNpmCommand(['install'], cwd)
        expect(result).toEqual(makeErrorResult('cwd must be a non-empty string'))
        expect(mockSandboxManager.executeNpmCommand).not.toHaveBeenCalled()
      })
    }
  })

  it('trims cwd before delegation', async () => {
    await handleExecuteNpmCommand(['install'], '  /workspace  ')
    expect(mockSandboxManager.executeNpmCommand).toHaveBeenCalledTimes(1)
    expect(mockSandboxManager.executeNpmCommand).toHaveBeenCalledWith(
      ['install'],
      '/workspace',
    )
  })

  it('omits cwd when undefined', async () => {
    await handleExecuteNpmCommand(['install'])
    expect(mockSandboxManager.executeNpmCommand).toHaveBeenCalledWith(
      ['install'],
      undefined,
    )
  })

  it('passes result through', async () => {
    const result = { success: true, stdout: 'packages added', stderr: '', exitCode: 0 }
    mockSandboxManager.executeNpmCommand.mockResolvedValue(result)
    expect(await handleExecuteNpmCommand(['install'])).toBe(result)
  })

  it('args validation short-circuits before cwd validation', async () => {
    const r = await handleExecuteNpmCommand(42, '')
    expect(r).toEqual(makeErrorResult('args must be an array of strings'))
    expect(mockSandboxManager.executeNpmCommand).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// sandbox:executePythonCommand
// ---------------------------------------------------------------------------

describe('sandbox:executePythonCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSandboxManager.executePythonCommand.mockResolvedValue({
      success: true,
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    })
  })

  describe('args — invalid types', () => {
    for (const args of [undefined, null, 42, true, '-c', { args: [] }]) {
      it(`rejects args=${JSON.stringify(args)} (invalid type)`, async () => {
        const result = await handleExecutePythonCommand(args, undefined, undefined)
        expect(result).toEqual(makeErrorResult('args must be an array of strings'))
        expect(mockSandboxManager.executePythonCommand).not.toHaveBeenCalled()
      })
    }
  })

  describe('args — array with non-string elements', () => {
    for (const args of [[42], [true], ['-c', 42]]) {
      it(`rejects args=${JSON.stringify(args)}`, async () => {
        const result = await handleExecutePythonCommand(args, undefined, undefined)
        expect(result).toEqual(makeErrorResult('args must be an array of strings'))
        expect(mockSandboxManager.executePythonCommand).not.toHaveBeenCalled()
      })
    }
  })

  describe('cwd — invalid types', () => {
    for (const cwd of [42, true, { cwd: '/dir' }, ['/dir']]) {
      it(`rejects cwd=${JSON.stringify(cwd)} (invalid type)`, async () => {
        const result = await handleExecutePythonCommand(['-c', 'x'], cwd, undefined)
        expect(result).toEqual(makeErrorResult('cwd must be a non-empty string'))
        expect(mockSandboxManager.executePythonCommand).not.toHaveBeenCalled()
      })
    }
  })

  describe('cwd — empty / whitespace-only', () => {
    for (const cwd of ['', '   ']) {
      it(`rejects cwd=${JSON.stringify(cwd)}`, async () => {
        const result = await handleExecutePythonCommand(['-c', 'x'], cwd, undefined)
        expect(result).toEqual(makeErrorResult('cwd must be a non-empty string'))
        expect(mockSandboxManager.executePythonCommand).not.toHaveBeenCalled()
      })
    }
  })

  describe('timeout — invalid types / out-of-range', () => {
    // Note: undefined is VALID (omitted). Note: 42 is VALID (positive number).
    for (const timeout of [true, '30', null, 0, -1, NaN, Infinity]) {
      const label = typeof timeout === 'number' ? String(timeout) : JSON.stringify(timeout)
      it(`rejects timeout=${label}`, async () => {
        const result = await handleExecutePythonCommand(['-c', 'x'], undefined, timeout)
        expect(result).toEqual(makeErrorResult('timeout must be a positive number'))
        expect(mockSandboxManager.executePythonCommand).not.toHaveBeenCalled()
      })
    }
  })

  it('accepts timeout=undefined (omitted)', async () => {
    await handleExecutePythonCommand(['-c', 'x'], undefined, undefined)
    expect(mockSandboxManager.executePythonCommand).toHaveBeenCalledTimes(1)
  })

  it('accepts timeout=42 (positive integer)', async () => {
    await handleExecutePythonCommand(['-c', 'x'], undefined, 42)
    expect(mockSandboxManager.executePythonCommand).toHaveBeenCalledTimes(1)
  })

  it('trims cwd and passes timeout as-is', async () => {
    await handleExecutePythonCommand(['-c', 'print(1)'], '  /project  ', 30_000)
    expect(mockSandboxManager.executePythonCommand).toHaveBeenCalledWith(
      ['-c', 'print(1)'],
      '/project',
      30_000,
    )
  })

  it('omits optional params when undefined', async () => {
    await handleExecutePythonCommand(['--version'])
    expect(mockSandboxManager.executePythonCommand).toHaveBeenCalledWith(
      ['--version'],
      undefined,
      undefined,
    )
  })

  it('passes result through', async () => {
    const result = { success: true, stdout: '3.12.0', stderr: '', exitCode: 0 }
    mockSandboxManager.executePythonCommand.mockResolvedValue(result)
    expect(await handleExecutePythonCommand(['--version'])).toBe(result)
  })

  it('first validation failure short-circuits', async () => {
    const r = await handleExecutePythonCommand(42, '', -1)
    expect(r).toEqual(makeErrorResult('args must be an array of strings'))
    expect(mockSandboxManager.executePythonCommand).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// sandbox:executePipCommand
// ---------------------------------------------------------------------------

describe('sandbox:executePipCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSandboxManager.executePipCommand.mockResolvedValue({
      success: true,
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    })
  })

  describe('args — invalid types', () => {
    for (const args of [undefined, null, 42, true, 'install', { args: [] }]) {
      it(`rejects args=${JSON.stringify(args)} (invalid type)`, async () => {
        const result = await handleExecutePipCommand(args, undefined)
        expect(result).toEqual(makeErrorResult('args must be an array of strings'))
        expect(mockSandboxManager.executePipCommand).not.toHaveBeenCalled()
      })
    }
  })

  describe('args — array with non-string elements', () => {
    for (const args of [[42], [true], ['install', 42]]) {
      it(`rejects args=${JSON.stringify(args)}`, async () => {
        const result = await handleExecutePipCommand(args, undefined)
        expect(result).toEqual(makeErrorResult('args must be an array of strings'))
        expect(mockSandboxManager.executePipCommand).not.toHaveBeenCalled()
      })
    }
  })

  describe('cwd — invalid types', () => {
    for (const cwd of [42, true, { cwd: '/dir' }, ['/dir']]) {
      it(`rejects cwd=${JSON.stringify(cwd)} (invalid type)`, async () => {
        const result = await handleExecutePipCommand(['install', 'requests'], cwd)
        expect(result).toEqual(makeErrorResult('cwd must be a non-empty string'))
        expect(mockSandboxManager.executePipCommand).not.toHaveBeenCalled()
      })
    }
  })

  describe('cwd — empty / whitespace-only', () => {
    for (const cwd of ['', '   ']) {
      it(`rejects cwd=${JSON.stringify(cwd)}`, async () => {
        const result = await handleExecutePipCommand(['install', 'requests'], cwd)
        expect(result).toEqual(makeErrorResult('cwd must be a non-empty string'))
        expect(mockSandboxManager.executePipCommand).not.toHaveBeenCalled()
      })
    }
  })

  it('trims cwd before delegation', async () => {
    await handleExecutePipCommand(['install', 'requests'], '  /venv  ')
    expect(mockSandboxManager.executePipCommand).toHaveBeenCalledTimes(1)
    expect(mockSandboxManager.executePipCommand).toHaveBeenCalledWith(
      ['install', 'requests'],
      '/venv',
    )
  })

  it('omits cwd when undefined', async () => {
    await handleExecutePipCommand(['install', 'requests'])
    expect(mockSandboxManager.executePipCommand).toHaveBeenCalledWith(
      ['install', 'requests'],
      undefined,
    )
  })

  it('passes result through', async () => {
    const result = { success: true, stdout: 'Installed packages', stderr: '', exitCode: 0 }
    mockSandboxManager.executePipCommand.mockResolvedValue(result)
    expect(await handleExecutePipCommand(['list'])).toBe(result)
  })

  it('args validation short-circuits before cwd validation', async () => {
    const r = await handleExecutePipCommand(42, '')
    expect(r).toEqual(makeErrorResult('args must be an array of strings'))
    expect(mockSandboxManager.executePipCommand).not.toHaveBeenCalled()
  })
})
