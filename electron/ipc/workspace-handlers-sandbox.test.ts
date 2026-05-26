import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Unit tests for the `sandbox:checkNodeAvailability` and `sandbox:cleanup` IPC handlers.
 *
 * sandbox:checkNodeAvailability (workspace-handlers.ts):
 *   Dynamically imports sandboxManager from sandbox-manager.js and delegates to
 *   sandboxManager.checkNodeAvailability(). All errors (dynamic import, manager
 *   method) are caught and returned as { available: false, error: string } so
 *   the renderer never sees an unhandled IPC rejection.
 *
 *   checkNodeAvailability returns:
 *     { available: true, version?: string } on success
 *     { available: false, error: string } on any error
 *
 * sandbox:cleanup (workspace-handlers.ts lines 4092–4107):
 *   Dynamically imports sandboxManager from sandbox-manager.js and calls
 *   sandboxManager.cleanup() inside a defensive try/catch.
 *   Errors are logged and swallowed so the handler always returns { success: true }.
 *
 *   cleanup returns: { success: true }
 *
 * Approach: mock the sandbox-manager module so the dynamic import resolves to
 * a controlled sandboxManager stub.
 */

const mockSandboxManager = {
  checkNodeAvailability: vi.fn(),
  checkPythonAvailability: vi.fn(),
  cleanup: vi.fn(),
  executeCommand: vi.fn(),
  executePipCommand: vi.fn(),
}

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  warnSpy.mockRestore()
})

vi.mock('../lib/sandbox/sandbox-manager.js', () => ({
  sandboxManager: mockSandboxManager,
}))

// ---------------------------------------------------------------------------
// Handler factories — replicate the handler logic under test.
// Keeping these in sync with workspace-handlers.ts.
// ---------------------------------------------------------------------------

/**
 * Mirrors sandbox:checkNodeAvailability in workspace-handlers.ts.
 * All errors (dynamic import failure, manager method throw) are caught and
 * returned as { available: false, error: string } so the renderer never gets
 * an unhandled IPC rejection.
 */
async function handleCheckNodeAvailability() {
  try {
    const { sandboxManager } = await import('../lib/sandbox/sandbox-manager.js')
    return await sandboxManager.checkNodeAvailability()
  } catch (err) {
    console.warn('[sandbox:checkNodeAvailability] failed:', err)
    return {
      available: false as const,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function handleCleanup() {
  try {
    const { sandboxManager } = await import('../lib/sandbox/sandbox-manager.js')
    sandboxManager.cleanup()
  } catch (error) {
    console.warn('[sandbox:cleanup] Unexpected error during cleanup:', error)
  }
  return { success: true }
}

/**
 * Mirrors sandbox:checkPythonAvailability in workspace-handlers.ts.
 * - Validates cwd: if provided, must be a non-empty string (whitespace trimmed).
 * - All errors (dynamic import failure, manager method throw) are caught and
 *   returned as { available: false, error: string } so the renderer never gets
 *   an unhandled IPC rejection.
 */
async function handleCheckPythonAvailability(cwd?: unknown) {
  if (cwd !== undefined && (typeof cwd !== 'string' || !cwd.trim())) {
    return { available: false as const, error: 'cwd must be a non-empty string' }
  }
  try {
    const { sandboxManager } = await import('../lib/sandbox/sandbox-manager.js')
    return await sandboxManager.checkPythonAvailability(
      cwd !== undefined ? (cwd as string).trim() : undefined,
    )
  } catch (err) {
    console.warn('[sandbox:checkPythonAvailability] failed:', err)
    return {
      available: false as const,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ---------------------------------------------------------------------------
// sandbox:checkNodeAvailability
// ---------------------------------------------------------------------------

describe('sandbox:checkNodeAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates to sandboxManager.checkNodeAvailability()', async () => {
    mockSandboxManager.checkNodeAvailability.mockResolvedValue({
      available: true,
      version: 'v20.0.0',
    })

    const result = await handleCheckNodeAvailability()

    expect(mockSandboxManager.checkNodeAvailability).toHaveBeenCalledTimes(1)
    expect(mockSandboxManager.checkNodeAvailability).toHaveBeenCalledWith()
    expect(result).toEqual({ available: true, version: 'v20.0.0' })
  })

  it('returns { available: true, version } when Node is present', async () => {
    mockSandboxManager.checkNodeAvailability.mockResolvedValue({
      available: true,
      version: 'v22.0.0',
    })

    const result = await handleCheckNodeAvailability()

    expect(result.available).toBe(true)
    if (result.available) {
      expect((result as { version: string }).version).toBe('v22.0.0')
    }
  })

  it('returns { available: false } when Node is absent', async () => {
    mockSandboxManager.checkNodeAvailability.mockResolvedValue({
      available: false,
    })

    const result = await handleCheckNodeAvailability()

    expect(result.available).toBe(false)
    expect(result).not.toHaveProperty('version')
  })

  it('propagates the returned object fields unchanged', async () => {
    const full = { available: true, version: 'v21.0.0' } as const
    mockSandboxManager.checkNodeAvailability.mockResolvedValue(full)

    const result = await handleCheckNodeAvailability()

    expect(result).toBe(full)
  })

  it('does not call checkNodeAvailability more than once per invocation', async () => {
    mockSandboxManager.checkNodeAvailability.mockResolvedValue({
      available: false,
    })

    await handleCheckNodeAvailability()

    expect(mockSandboxManager.checkNodeAvailability).toHaveBeenCalledTimes(1)
  })

  it('does not call other sandboxManager methods during checkNodeAvailability', async () => {
    mockSandboxManager.checkNodeAvailability.mockResolvedValue({
      available: true,
    })
    mockSandboxManager.cleanup.mockResolvedValue(undefined)
    mockSandboxManager.executeCommand.mockResolvedValue({ success: false })

    await handleCheckNodeAvailability()

    expect(mockSandboxManager.cleanup).not.toHaveBeenCalled()
    expect(mockSandboxManager.executeCommand).not.toHaveBeenCalled()
    expect(mockSandboxManager.checkPythonAvailability).not.toHaveBeenCalled()
  })

  it('returns { available: false, error } when checkNodeAvailability throws', async () => {
    mockSandboxManager.checkNodeAvailability.mockRejectedValue(
      new Error('Sandbox unavailable'),
    )

    const result = await handleCheckNodeAvailability()

    expect(result.available).toBe(false)
    const errorResult = result as { available: false; error: string }
    expect(errorResult.error).toBe('Sandbox unavailable')
    expect(warnSpy).toHaveBeenCalledWith(
      '[sandbox:checkNodeAvailability] failed:',
      expect.any(Error),
    )
  })

  it('returns { available: false, error: string } for non-Error throws', async () => {
    mockSandboxManager.checkNodeAvailability.mockRejectedValue('connection refused')

    const result = await handleCheckNodeAvailability()

    expect(result.available).toBe(false)
    const errorResult = result as { available: false; error: string }
    expect(typeof errorResult.error).toBe('string')
    expect(errorResult.error).toBe('connection refused')
  })

  it('never re-throws — renderer always gets a safe typed response', async () => {
    mockSandboxManager.checkNodeAvailability.mockRejectedValue(
      new Error('Module not found'),
    )

    // If the handler correctly wraps in try/catch, this must not throw.
    await expect(handleCheckNodeAvailability()).resolves.toMatchObject({
      available: false,
      error: 'Module not found',
    })
  })
})

// ---------------------------------------------------------------------------
// sandbox:cleanup
// ---------------------------------------------------------------------------

describe('sandbox:cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls sandboxManager.cleanup() once', async () => {
    mockSandboxManager.cleanup.mockReturnValue(undefined)

    await handleCleanup()

    expect(mockSandboxManager.cleanup).toHaveBeenCalledTimes(1)
  })

  it('calls sandboxManager.cleanup() with no arguments', async () => {
    mockSandboxManager.cleanup.mockReturnValue(undefined)

    await handleCleanup()

    expect(mockSandboxManager.cleanup).toHaveBeenCalledWith()
  })

  it('returns { success: true } regardless of cleanup return value', async () => {
    mockSandboxManager.cleanup.mockReturnValue(undefined)

    const result = await handleCleanup()

    expect(result).toEqual({ success: true })
  })

  it('still returns { success: true } when cleanup is a no-op (undefined)', async () => {
    mockSandboxManager.cleanup.mockReturnValue(undefined)

    const result = await handleCleanup()

    expect(result).toEqual({ success: true })
  })

  it('does not call other sandboxManager methods during cleanup', async () => {
    mockSandboxManager.cleanup.mockReturnValue(undefined)
    mockSandboxManager.checkNodeAvailability.mockResolvedValue({
      available: true,
    })
    mockSandboxManager.executeCommand.mockResolvedValue({ success: false })

    await handleCleanup()

    expect(mockSandboxManager.checkNodeAvailability).not.toHaveBeenCalled()
    expect(mockSandboxManager.executeCommand).not.toHaveBeenCalled()
    expect(mockSandboxManager.checkPythonAvailability).not.toHaveBeenCalled()
  })

  it('does not call cleanup more than once per invocation', async () => {
    mockSandboxManager.cleanup.mockReturnValue(undefined)

    await handleCleanup()

    expect(mockSandboxManager.cleanup).toHaveBeenCalledTimes(1)
  })

  it('returns { success: true } after cleanup throws (defensive try/catch)', async () => {
    mockSandboxManager.cleanup.mockImplementation(() => {
      throw new Error('Cleanup failed')
    })

    // The handler wraps cleanup in a defensive try/catch, so even when
    // sandboxManager.cleanup() throws synchronously, the handler swallows
    // the error, logs a warning, and returns { success: true }.
    const result = await handleCleanup()
    expect(result).toEqual({ success: true })
    expect(warnSpy).toHaveBeenCalledWith(
      '[sandbox:cleanup] Unexpected error during cleanup:',
      expect.any(Error),
    )
  })
})

// ---------------------------------------------------------------------------
// sandbox:checkPythonAvailability
// ---------------------------------------------------------------------------

describe('sandbox:checkPythonAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --- cwd validation ---

  describe('rejects invalid cwd types', () => {
    for (const value of [42, true, {}, [], () => {}]) {
      it(`rejects cwd=${JSON.stringify(value)}`, async () => {
        const result = await handleCheckPythonAvailability(value)
        expect(result.available).toBe(false)
        expect((result as { available: false; error: string }).error).toBe('cwd must be a non-empty string')
        expect(mockSandboxManager.checkPythonAvailability).not.toHaveBeenCalled()
      })
    }
  })

  describe('rejects empty and whitespace-only cwd', () => {
    for (const cwd of ['', '   ', '\t', '\n']) {
      it(`rejects cwd=${JSON.stringify(cwd)}`, async () => {
        const result = await handleCheckPythonAvailability(cwd)
        expect(result.available).toBe(false)
        expect((result as { available: false; error: string }).error).toBe('cwd must be a non-empty string')
        expect(mockSandboxManager.checkPythonAvailability).not.toHaveBeenCalled()
      })
    }
  })

  describe('cwd is optional — undefined omits it from delegation', () => {
    it('does not pass cwd when argument is undefined', async () => {
      mockSandboxManager.checkPythonAvailability.mockResolvedValue({
        available: true,
        version: '3.11.0',
      })

      const result = await handleCheckPythonAvailability(undefined)

      expect(result.available).toBe(true)
      expect(mockSandboxManager.checkPythonAvailability).toHaveBeenCalledTimes(1)
      expect(mockSandboxManager.checkPythonAvailability).toHaveBeenCalledWith(undefined)
    })
  })

  // --- delegation ---

  describe('delegates to sandboxManager.checkPythonAvailability()', () => {
    it('passes trimmed cwd when provided', async () => {
      mockSandboxManager.checkPythonAvailability.mockResolvedValue({
        available: true,
        version: '3.10.0',
      })

      await handleCheckPythonAvailability('  /path/to/project  ')

      expect(mockSandboxManager.checkPythonAvailability).toHaveBeenCalledTimes(1)
      expect(mockSandboxManager.checkPythonAvailability).toHaveBeenCalledWith(
        '/path/to/project',
      )
    })

    it('does not call other sandboxManager methods', async () => {
      mockSandboxManager.checkPythonAvailability.mockResolvedValue({
        available: true,
      })
      mockSandboxManager.checkNodeAvailability.mockResolvedValue({
        available: true,
      })
      mockSandboxManager.cleanup.mockReturnValue(undefined)

      await handleCheckPythonAvailability()

      expect(mockSandboxManager.checkNodeAvailability).not.toHaveBeenCalled()
      expect(mockSandboxManager.cleanup).not.toHaveBeenCalled()
    })

    it('does not call checkPythonAvailability more than once per invocation', async () => {
      mockSandboxManager.checkPythonAvailability.mockResolvedValue({
        available: false,
      })

      await handleCheckPythonAvailability('/some/path')

      expect(mockSandboxManager.checkPythonAvailability).toHaveBeenCalledTimes(1)
    })
  })

  // --- success path ---

  describe('success: available=true', () => {
    it('returns available=true with version when Python is present', async () => {
      mockSandboxManager.checkPythonAvailability.mockResolvedValue({
        available: true,
        version: '3.12.0',
      })

      const result = await handleCheckPythonAvailability()

      expect(result.available).toBe(true)
      const success = result as { available: true; version: string }
      expect(success.version).toBe('3.12.0')
    })
  })

  // --- unavailable path ---

  describe('unavailable: available=false', () => {
    it('returns available=false when Python is not found', async () => {
      mockSandboxManager.checkPythonAvailability.mockResolvedValue({
        available: false,
      })

      const result = await handleCheckPythonAvailability('/no-python')

      expect(result.available).toBe(false)
      expect(result).not.toHaveProperty('error')
    })
  })

  // --- error handling ---

  describe('error handling: try/catch wrapper', () => {
    it('returns { available: false, error } when manager throws Error', async () => {
      mockSandboxManager.checkPythonAvailability.mockRejectedValue(
        new Error('Python not found in PATH'),
      )

      const result = await handleCheckPythonAvailability()

      expect(result.available).toBe(false)
      const errorResult = result as { available: false; error: string }
      expect(errorResult.error).toBe('Python not found in PATH')
      expect(warnSpy).toHaveBeenCalledWith(
        '[sandbox:checkPythonAvailability] failed:',
        expect.any(Error),
      )
    })

    it('returns { available: false, error: string } for non-Error rejections', async () => {
      mockSandboxManager.checkPythonAvailability.mockRejectedValue(
        'connection refused',
      )

      const result = await handleCheckPythonAvailability()

      expect(result.available).toBe(false)
      const errorResult = result as { available: false; error: string }
      expect(typeof errorResult.error).toBe('string')
      expect(errorResult.error).toBe('connection refused')
    })

    it('never re-throws — renderer always gets a safe typed response', async () => {
      mockSandboxManager.checkPythonAvailability.mockRejectedValue(
        new Error('Module not found'),
      )

      await expect(handleCheckPythonAvailability()).resolves.toMatchObject({
        available: false,
        error: 'Module not found',
      })
    })
  })
})
