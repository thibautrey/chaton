import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const testRoot = path.join(os.tmpdir(), 'chaton-manager-id-validation-test')

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

describe('extension manager id validation', () => {
  beforeEach(() => {
    vi.resetModules()
    fs.rmSync(testRoot, { recursive: true, force: true })
  })

  it('rejects traversal ids before installing extensions', async () => {
    const { installChatonsExtension } = await import('./manager.js')

    const result = installChatonsExtension('../outside')

    expect(result).toEqual({ ok: false, message: 'Invalid extension id' })
    expect(fs.existsSync(path.join(testRoot, 'extensions'))).toBe(false)
  })

  it('rejects traversal ids before reading install state', async () => {
    const { getChatonsExtensionInstallState } = await import('./manager.js')

    const result = getChatonsExtensionInstallState('../outside')
    expect(result).toEqual({ ok: false, message: 'Invalid extension id' })
  })

  it('rejects traversal ids before cancelling installs', async () => {
    const { cancelChatonsExtensionInstall } = await import('./manager.js')

    const result = cancelChatonsExtensionInstall('../outside')
    expect(result).toEqual({ ok: false, message: 'Invalid extension id' })
  })

  it('rejects traversal ids before toggling registry entries', async () => {
    const { toggleChatonsExtension } = await import('./manager.js')

    const result = toggleChatonsExtension('../outside', true)
    expect(result).toEqual({ ok: false, message: 'Invalid extension id' })
    expect(fs.existsSync(path.join(testRoot, 'extensions', 'registry.json'))).toBe(false)
  })

  it('rejects traversal ids before updating extensions', async () => {
    const { updateChatonsExtension } = await import('./manager.js')

    const result = updateChatonsExtension('../outside')
    expect(result).toEqual({ ok: false, message: 'Invalid extension id' })
    expect(fs.existsSync(path.join(testRoot, 'extensions', 'registry.json'))).toBe(false)
  })

  it('rejects traversal ids before publishing extensions', async () => {
    const { publishChatonsExtension } = await import('./manager.js')

    const result = publishChatonsExtension('../outside')
    expect(result).toEqual({ ok: false, message: 'Invalid extension id' })
    expect(fs.existsSync(path.join(testRoot, 'extensions', 'registry.json'))).toBe(false)
  })
})
