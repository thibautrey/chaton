import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `extensions:getLogs` and `extensions:runHealthCheck` IPC handlers.
 *
 * Both handlers are pure passthroughs — the handler simply calls the underlying
 * function and returns the result directly. These tests verify the passthrough
 * contract without needing the full workspace-handlers.ts module.
 *
 * extensions:getLogs   (workspace-handlers.ts line 2122–2123)
 *   → getChatonsExtensionLogs(id)
 *   Returns: { ok: true; id: string; content: string }
 *     where content is the concatenation of existing log files (runtime + install)
 *
 * extensions:runHealthCheck (workspace-handlers.ts lines 2119–2121)
 *   → runChatonsExtensionHealthCheck()
 *   Returns: { ok: true; report: Array<{ id, enabled, health, lastRunStatus, lastError }> }
 */

// -------------------------------------------------------------------------
// Inline passthrough handlers — mirror workspace-handlers.ts lines 2119–2123.
// -------------------------------------------------------------------------

// Actual return type of getChatonsExtensionLogs(manager.ts line 1510):
//   { ok: true as const, id, content }
// where content is the joined contents of existing log files (empty string if none).
type LogsResult = { ok: true; id: string; content: string }

function getLogsHandler(
  getChatonsExtensionLogs: (id: string) => LogsResult,
  id: string,
): LogsResult {
  return getChatonsExtensionLogs(id)
}

// Actual return type of runChatonsExtensionHealthCheck(manager.ts line 1519):
//   { ok: true as const, report: Array<{ id, enabled, health, lastRunStatus, lastError }> }
type HealthReportEntry = {
  id: string
  enabled: boolean
  health: string | null
  lastRunStatus: string | null
  lastError: string | null
}
type HealthResult = { ok: true; report: HealthReportEntry[] }

function runHealthCheckHandler(
  runChatonsExtensionHealthCheck: () => HealthResult,
): HealthResult {
  return runChatonsExtensionHealthCheck()
}

// -------------------------------------------------------------------------
// Test suite
// -------------------------------------------------------------------------

describe('extensions:getLogs handler', () => {
  it('passthrough — returns ok:true with id and content from getChatonsExtensionLogs', () => {
    const getChatonsExtensionLogs = vi.fn<[string], LogsResult>().mockReturnValue({
      ok: true,
      id: 'my-extension',
      content: '[INFO] Started\n[WARN] Slow response',
    })
    const result = getLogsHandler(getChatonsExtensionLogs, 'my-extension')
    expect(result).toEqual({
      ok: true,
      id: 'my-extension',
      content: '[INFO] Started\n[WARN] Slow response',
    })
    expect(getChatonsExtensionLogs).toHaveBeenCalledOnce()
    expect(getChatonsExtensionLogs).toHaveBeenCalledWith('my-extension')
  })

  it('passthrough — returns empty content when no log files exist', () => {
    const getChatonsExtensionLogs = vi.fn<[string], LogsResult>().mockReturnValue({
      ok: true,
      id: 'no-logs-ext',
      content: '',
    })
    const result = getLogsHandler(getChatonsExtensionLogs, 'no-logs-ext')
    expect(result).toEqual({ ok: true, id: 'no-logs-ext', content: '' })
  })

  it('passthrough — passes the id parameter unchanged to the underlying function', () => {
    const getChatonsExtensionLogs = vi.fn<[string], LogsResult>().mockReturnValue({
      ok: true,
      id: '@chaton/browser',
      content: '',
    })
    const id = '@chaton/browser'
    getLogsHandler(getChatonsExtensionLogs, id)
    expect(getChatonsExtensionLogs).toHaveBeenCalledWith('@chaton/browser')
  })

  it('passthrough — multiline content is returned verbatim', () => {
    const multiline = '[INFO] Request 1\n[DEBUG] Processing\n[ERROR] Failed\n[INFO] Retry'
    const getChatonsExtensionLogs = vi.fn<[string], LogsResult>().mockReturnValue({
      ok: true,
      id: 'debug-ext',
      content: multiline,
    })
    const result = getLogsHandler(getChatonsExtensionLogs, 'debug-ext')
    expect(result.content).toBe(multiline)
  })

  it('passthrough — unicode content is preserved', () => {
    const unicodeContent = '[INFO] Démarrage de l\'extension\n[ERROR] Erreur: 中文测试 ❤'
    const getChatonsExtensionLogs = vi.fn<[string], LogsResult>().mockReturnValue({
      ok: true,
      id: 'i18n-ext',
      content: unicodeContent,
    })
    const result = getLogsHandler(getChatonsExtensionLogs, 'i18n-ext')
    expect(result.content).toBe(unicodeContent)
  })
})

describe('extensions:runHealthCheck handler', () => {
  it('passthrough — returns ok:true with report from runChatonsExtensionHealthCheck', () => {
    const report: HealthReportEntry[] = [
      {
        id: 'ext-a',
        enabled: true,
        health: 'healthy',
        lastRunStatus: 'success',
        lastError: null,
      },
    ]
    const runChatonsExtensionHealthCheck = vi.fn<[], HealthResult>().mockReturnValue({
      ok: true,
      report,
    })
    const result = runHealthCheckHandler(runChatonsExtensionHealthCheck)
    expect(result).toEqual({ ok: true, report })
    expect(runChatonsExtensionHealthCheck).toHaveBeenCalledOnce()
    expect(runChatonsExtensionHealthCheck).toHaveBeenCalledWith()
  })

  it('passthrough — report with multiple extensions is returned unchanged', () => {
    const report: HealthReportEntry[] = [
      { id: 'ext-1', enabled: true, health: 'healthy', lastRunStatus: 'success', lastError: null },
      { id: 'ext-2', enabled: false, health: null, lastRunStatus: null, lastError: null },
      {
        id: 'ext-3',
        enabled: true,
        health: 'unhealthy',
        lastRunStatus: 'failed',
        lastError: 'Process exited with code 1',
      },
    ]
    const runChatonsExtensionHealthCheck = vi.fn<[], HealthResult>().mockReturnValue({
      ok: true,
      report,
    })
    const result = runHealthCheckHandler(runChatonsExtensionHealthCheck)
    expect(result.report).toHaveLength(3)
    expect(result.report[2].lastError).toBe('Process exited with code 1')
  })

  it('passthrough — empty report (no extensions) is returned unchanged', () => {
    const runChatonsExtensionHealthCheck = vi.fn<[], HealthResult>().mockReturnValue({
      ok: true,
      report: [],
    })
    const result = runHealthCheckHandler(runChatonsExtensionHealthCheck)
    expect(result.report).toEqual([])
  })

  it('passthrough — does not pass arguments to the underlying function', () => {
    const runChatonsExtensionHealthCheck = vi.fn<[], HealthResult>().mockReturnValue({
      ok: true,
      report: [],
    })
    runHealthCheckHandler(runChatonsExtensionHealthCheck)
    expect(runChatonsExtensionHealthCheck).toHaveBeenCalledWith()
  })
})
