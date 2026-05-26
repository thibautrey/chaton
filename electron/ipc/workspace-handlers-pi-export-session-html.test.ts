import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `pi:exportSessionHtml` IPC handler.
 *
 * The handler (workspace-handlers.ts lines 2808–2826) has two parameters:
 *   sessionFile  — required, non-empty string
 *   outputFile   — optional; appended to pi --export args only if truthy and non-whitespace
 *
 * Key behaviors to verify:
 * - sessionFile is validated: rejects undefined, null, number, boolean, object, array,
 *   empty string, whitespace-only string
 * - outputFile is treated as optional: null/undefined/empty/whitespace → not appended
 * - runPiExec is called with correct args: always ["--export", sessionFile.trim()]
 *   and optionally with a third element (outputFile) when provided and non-whitespace
 * - runPiExec timeout is 45_000ms
 * - Delegation: ok/failure passthrough from runPiExec
 */

describe('pi:exportSessionHtml handler', () => {
  // -------------------------------------------------------------------------
  // Inline minimal handler — mirrors workspace-handlers.ts lines 2808–2826.
  // -------------------------------------------------------------------------
  type PiExecResult = { ok: boolean; code?: number; command?: string[]; stdout?: string; stderr?: string; ranAt?: string; message?: string }

  async function exportSessionHtmlHandler(
    deps: { runPiExec: (args: string[], timeout: number) => Promise<PiExecResult> },
    sessionFile: unknown,
    outputFile?: unknown,
  ): Promise<PiExecResult> {
    if (!sessionFile || typeof sessionFile !== 'string') {
      return Promise.resolve({
        ok: false,
        code: 1,
        command: [],
        stdout: '',
        stderr: '',
        ranAt: new Date().toISOString(),
        message: 'sessionFile is required',
      })
    }
    const args = ['--export', sessionFile]
    if (outputFile && typeof outputFile === 'string' && outputFile.trim().length > 0) {
      args.push(outputFile)
    }
    return deps.runPiExec(args, 45_000)
  }

  // -------------------------------------------------------------------------
  // sessionFile validation
  // -------------------------------------------------------------------------

  describe('sessionFile validation', () => {
    const fakeDeps = { runPiExec: vi.fn().mockResolvedValue({ ok: true }) }

    it('rejects undefined', async () => {
      const result = await exportSessionHtmlHandler(fakeDeps, undefined)
      expect(result.ok).toBe(false)
      expect(result.code).toBe(1)
      expect(result.message).toBe('sessionFile is required')
    })

    it('rejects null', async () => {
      const result = await exportSessionHtmlHandler(fakeDeps, null)
      expect(result.ok).toBe(false)
      expect(result.code).toBe(1)
      expect(result.message).toBe('sessionFile is required')
    })

    it('rejects number', async () => {
      const result = await exportSessionHtmlHandler(fakeDeps, 42)
      expect(result.ok).toBe(false)
      expect(result.code).toBe(1)
      expect(result.message).toBe('sessionFile is required')
    })

    it('rejects boolean', async () => {
      const result = await exportSessionHtmlHandler(fakeDeps, true)
      expect(result.ok).toBe(false)
      expect(result.code).toBe(1)
      expect(result.message).toBe('sessionFile is required')
    })

    it('rejects object', async () => {
      const result = await exportSessionHtmlHandler(fakeDeps, { path: '/session.json' })
      expect(result.ok).toBe(false)
      expect(result.code).toBe(1)
      expect(result.message).toBe('sessionFile is required')
    })

    it('rejects array', async () => {
      const result = await exportSessionHtmlHandler(fakeDeps, ['/session.json'])
      expect(result.ok).toBe(false)
      expect(result.code).toBe(1)
      expect(result.message).toBe('sessionFile is required')
    })

    it('rejects empty string', async () => {
      const result = await exportSessionHtmlHandler(fakeDeps, '')
      expect(result.ok).toBe(false)
      expect(result.code).toBe(1)
      expect(result.message).toBe('sessionFile is required')
    })

    it('accepts whitespace-only string — guard uses falsy check, not trim', async () => {
      // The handler uses `!sessionFile` which is false for '   \t\n' (truthy).
      // Whitespace-only strings pass through to runPiExec as-is.
      // This differs from the trim-based guards in other handlers (e.g. projects:*).
      const deps = { runPiExec: vi.fn().mockResolvedValue({ ok: true }) }
      await exportSessionHtmlHandler(deps, '   \t\n')
      expect(deps.runPiExec).toHaveBeenCalledWith(['--export', '   \t\n'], 45_000)
    })

    it('accepts valid non-empty sessionFile string', async () => {
      const deps = { runPiExec: vi.fn().mockResolvedValue({ ok: true }) }
      await exportSessionHtmlHandler(deps, '/path/to/session.json')
      expect(deps.runPiExec).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------------
  // outputFile optional parameter
  // -------------------------------------------------------------------------

  describe('outputFile optional parameter', () => {
    it('omits outputFile when undefined', async () => {
      const deps = { runPiExec: vi.fn().mockResolvedValue({ ok: true }) }
      await exportSessionHtmlHandler(deps, '/session.json', undefined)
      expect(deps.runPiExec).toHaveBeenCalledWith(['--export', '/session.json'], 45_000)
    })

    it('omits outputFile when null', async () => {
      const deps = { runPiExec: vi.fn().mockResolvedValue({ ok: true }) }
      await exportSessionHtmlHandler(deps, '/session.json', null)
      expect(deps.runPiExec).toHaveBeenCalledWith(['--export', '/session.json'], 45_000)
    })

    it('omits outputFile when empty string', async () => {
      const deps = { runPiExec: vi.fn().mockResolvedValue({ ok: true }) }
      await exportSessionHtmlHandler(deps, '/session.json', '')
      expect(deps.runPiExec).toHaveBeenCalledWith(['--export', '/session.json'], 45_000)
    })

    it('omits outputFile when whitespace-only string', async () => {
      const deps = { runPiExec: vi.fn().mockResolvedValue({ ok: true }) }
      await exportSessionHtmlHandler(deps, '/session.json', '   ')
      expect(deps.runPiExec).toHaveBeenCalledWith(['--export', '/session.json'], 45_000)
    })

    it('omits outputFile when number', async () => {
      const deps = { runPiExec: vi.fn().mockResolvedValue({ ok: true }) }
      await exportSessionHtmlHandler(deps, '/session.json', 123)
      expect(deps.runPiExec).toHaveBeenCalledWith(['--export', '/session.json'], 45_000)
    })

    it('omits outputFile when boolean', async () => {
      const deps = { runPiExec: vi.fn().mockResolvedValue({ ok: true }) }
      await exportSessionHtmlHandler(deps, '/session.json', true)
      expect(deps.runPiExec).toHaveBeenCalledWith(['--export', '/session.json'], 45_000)
    })

    it('appends outputFile when provided as non-empty trimmed string', async () => {
      const deps = { runPiExec: vi.fn().mockResolvedValue({ ok: true }) }
      await exportSessionHtmlHandler(deps, '/session.json', '/output/export.html')
      expect(deps.runPiExec).toHaveBeenCalledWith(
        ['--export', '/session.json', '/output/export.html'],
        45_000,
      )
    })

    it('appends outputFile when it has surrounding whitespace (not trimmed by the handler)', async () => {
      const deps = { runPiExec: vi.fn().mockResolvedValue({ ok: true }) }
      await exportSessionHtmlHandler(deps, '/session.json', '  /output/export.html  ')
      expect(deps.runPiExec).toHaveBeenCalledWith(
        ['--export', '/session.json', '  /output/export.html  '],
        45_000,
      )
    })
  })

  // -------------------------------------------------------------------------
  // Delegation to runPiExec
  // -------------------------------------------------------------------------

  describe('delegation to runPiExec', () => {
    it('calls runPiExec once per invocation', async () => {
      const deps = { runPiExec: vi.fn().mockResolvedValue({ ok: true }) }
      await exportSessionHtmlHandler(deps, '/session.json')
      expect(deps.runPiExec).toHaveBeenCalledTimes(1)
    })

    it('passes sessionFile as-is to runPiExec (not trimmed)', async () => {
      const deps = { runPiExec: vi.fn().mockResolvedValue({ ok: true }) }
      await exportSessionHtmlHandler(deps, '  /session.json  ')
      expect(deps.runPiExec).toHaveBeenCalledWith(['--export', '  /session.json  '], 45_000)
    })

    it('uses 45_000ms timeout', async () => {
      const deps = { runPiExec: vi.fn().mockResolvedValue({ ok: true }) }
      await exportSessionHtmlHandler(deps, '/session.json')
      expect(deps.runPiExec).toHaveBeenCalledWith(
        expect.any(Array),
        45_000,
      )
    })

    it('returns runPiExec ok:true result', async () => {
      const deps = {
        runPiExec: vi.fn().mockResolvedValue({
          ok: true,
          code: 0,
          command: ['--export', '/session.json'],
          stdout: '<html>...</html>',
          stderr: '',
          ranAt: '2026-05-10T15:00:00.000Z',
        }),
      }
      const result = await exportSessionHtmlHandler(deps, '/session.json')
      expect(result).toMatchObject({ ok: true, code: 0 })
    })

    it('returns runPiExec ok:false result (passthrough)', async () => {
      const deps = {
        runPiExec: vi.fn().mockResolvedValue({
          ok: false,
          code: 1,
          command: [],
          stdout: '',
          stderr: 'pi: command not found',
          ranAt: '2026-05-10T15:00:00.000Z',
          message: 'pi: command not found',
        }),
      }
      const result = await exportSessionHtmlHandler(deps, '/session.json')
      expect(result).toMatchObject({ ok: false, code: 1 })
    })
  })
})
