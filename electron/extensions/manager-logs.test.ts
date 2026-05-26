import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const testRoot = path.join(os.tmpdir(), 'chaton-manager-logs-test')

vi.mock('./runtime/constants.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./runtime/constants.js')>()
  return {
    ...actual,
    CHATON_BASE: testRoot,
    EXTENSIONS_DIR: path.join(testRoot, 'extensions'),
    LOGS_DIR: path.join(testRoot, 'extensions', 'logs'),
    FILES_ROOT: path.join(testRoot, 'extensions', 'data'),
  }
})

describe('extension manager log paths', () => {
  beforeEach(() => {
    vi.resetModules()
    fs.rmSync(testRoot, { recursive: true, force: true })
  })

  it('reads runtime logs written by appendExtensionLog', async () => {
    const { appendExtensionLog } = await import('./runtime/logging.js')
    const { getChatonsExtensionLogs } = await import('./manager.js')

    appendExtensionLog('@chaton/log-test', 'info', 'test.event', { ok: true })

    const result = getChatonsExtensionLogs('@chaton/log-test')

    expect(result.ok).toBe(true)
    expect(result.content).toContain('test.event')
    expect(result.content).toContain('"extensionId":"@chaton/log-test"')
  })

  it('rejects invalid ids before reading hashed log files', async () => {
    const { getChatonsExtensionLogs } = await import('./manager.js')

    const result = getChatonsExtensionLogs('../outside')

    expect(result).toEqual({ ok: false, message: 'Invalid extension id' })
    expect(fs.existsSync(path.join(testRoot, 'extensions'))).toBe(false)
  })

  it('rejects invalid ids before removing extension directories or logs', async () => {
    const { removeChatonsExtension } = await import('./manager.js')
    const outsideRoot = path.join(testRoot, 'outside')
    fs.mkdirSync(outsideRoot, { recursive: true })
    fs.writeFileSync(path.join(outsideRoot, 'sentinel.txt'), 'keep', 'utf8')

    const result = removeChatonsExtension('../outside')

    expect(result).toEqual({ ok: false, message: 'Invalid extension id' })
    expect(fs.readFileSync(path.join(outsideRoot, 'sentinel.txt'), 'utf8')).toBe('keep')
  })
})
