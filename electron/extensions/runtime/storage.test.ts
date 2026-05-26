import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./constants.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./constants.js')>()
  return {
    ...actual,
    FILES_ROOT: path.join(os.tmpdir(), 'chaton-storage-test-files'),
  }
})

describe('storage files runtime path safety', () => {
  let runtimeState: typeof import('./state.js').runtimeState
  let filesRoot: string

  beforeEach(async () => {
    vi.resetModules()
    const constants = await import('./constants.js')
    filesRoot = constants.FILES_ROOT
    fs.rmSync(filesRoot, { recursive: true, force: true })
    runtimeState = (await import('./state.js')).runtimeState
    runtimeState.manifests.clear()
    runtimeState.capabilityUsage.clear()
  })

  it('writes and reads files under the normalized extension data root', async () => {
    runtimeState.manifests.set('@chaton/storage-test', {
      id: '@chaton/storage-test',
      name: 'Storage Test',
      version: '1.0.0',
      capabilities: ['storage.files'],
    })
    const { storageFilesRead, storageFilesWrite } = await import('./storage.js')

    expect(storageFilesWrite('@chaton/storage-test', 'nested/config.json', '{"ok":true}')).toEqual({ ok: true })
    expect(storageFilesRead('@chaton/storage-test', 'nested/config.json')).toEqual({ ok: true, data: '{"ok":true}' })
    expect(fs.existsSync(path.join(filesRoot, '@chaton/storage-test', 'nested', 'config.json'))).toBe(true)
  })

  it('rejects traversal extension ids before creating data directories', async () => {
    const { storageFilesWrite } = await import('./storage.js')

    const result = storageFilesWrite('../outside', 'config.json', 'bad')

    expect(result).toEqual({ ok: false, error: { code: 'invalid_args', message: 'invalid extension id' } })
    expect(fs.existsSync(path.join(filesRoot, '..', 'outside'))).toBe(false)
  })

  it('rejects parent traversal relative paths', async () => {
    runtimeState.manifests.set('storage-test', {
      id: 'storage-test',
      name: 'Storage Test',
      version: '1.0.0',
      capabilities: ['storage.files'],
    })
    const { storageFilesWrite } = await import('./storage.js')

    expect(storageFilesWrite('storage-test', '../outside.txt', 'bad')).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'invalid path' },
    })
  })

  it('rejects non-string and oversized file content before writing', async () => {
    runtimeState.manifests.set('storage-test', {
      id: 'storage-test',
      name: 'Storage Test',
      version: '1.0.0',
      capabilities: ['storage.files'],
    })
    const { storageFilesWrite } = await import('./storage.js')

    expect(storageFilesWrite('storage-test', 'config.json', { ok: true } as unknown as string)).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'content must be a string' },
    })
    expect(storageFilesWrite('storage-test', 'huge.txt', 'x'.repeat(5 * 1024 * 1024 + 1))).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'content too large' },
    })
    expect(fs.existsSync(path.join(filesRoot, 'storage-test', 'huge.txt'))).toBe(false)
  })

  it('rejects oversized files before reading them into memory', async () => {
    runtimeState.manifests.set('storage-test', {
      id: 'storage-test',
      name: 'Storage Test',
      version: '1.0.0',
      capabilities: ['storage.files'],
    })
    const { storageFilesRead } = await import('./storage.js')
    const filePath = path.join(filesRoot, 'storage-test', 'huge.txt')
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, 'x'.repeat(5 * 1024 * 1024 + 1), 'utf8')

    expect(storageFilesRead('storage-test', 'huge.txt')).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'file too large' },
    })
  })

  it('rejects symlinked storage paths before read or write escapes the data root', async () => {
    runtimeState.manifests.set('storage-test', {
      id: 'storage-test',
      name: 'Storage Test',
      version: '1.0.0',
      capabilities: ['storage.files'],
    })
    const { storageFilesRead, storageFilesWrite } = await import('./storage.js')
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chaton-storage-outside-'))
    const extensionRoot = path.join(filesRoot, 'storage-test')
    fs.mkdirSync(extensionRoot, { recursive: true })
    fs.symlinkSync(outsideDir, path.join(extensionRoot, 'linked'), 'dir')

    expect(storageFilesWrite('storage-test', 'linked/escape.txt', 'bad')).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'invalid path' },
    })
    expect(storageFilesRead('storage-test', 'linked/escape.txt')).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'invalid path' },
    })
    expect(fs.existsSync(path.join(outsideDir, 'escape.txt'))).toBe(false)
  })
})

describe('storage kv runtime validation', () => {
  const getDb = vi.fn(() => ({ db: true }))
  const extensionKvGet = vi.fn()
  const extensionKvSet = vi.fn()
  const extensionKvDelete = vi.fn()
  const extensionKvList = vi.fn()

  let runtimeState: typeof import('./state.js').runtimeState

  beforeEach(async () => {
    vi.resetModules()
    vi.doMock('../../db/index.js', () => ({ getDb }))
    vi.doMock('../../db/repos/extension-kv.js', () => ({
      extensionKvGet,
      extensionKvSet,
      extensionKvDelete,
      extensionKvList,
    }))
    getDb.mockClear()
    extensionKvGet.mockReset()
    extensionKvGet.mockReturnValue({ saved: true })
    extensionKvSet.mockReset()
    extensionKvDelete.mockReset()
    extensionKvDelete.mockReturnValue(true)
    extensionKvList.mockReset()
    extensionKvList.mockReturnValue([{ key: 'config', value: 1, updatedAt: '2026-05-26T00:00:00.000Z' }])
    runtimeState = (await import('./state.js')).runtimeState
    runtimeState.manifests.clear()
    runtimeState.capabilityUsage.clear()
    runtimeState.manifests.set('@chaton/kv-test', {
      id: '@chaton/kv-test',
      name: 'KV Test',
      version: '1.0.0',
      capabilities: ['storage.kv'],
    })
  })

  it('normalizes extension ids and keys before reading kv storage', async () => {
    const { storageKvGet } = await import('./storage.js')

    expect(storageKvGet('  @chaton/kv-test  ', '  config  ')).toEqual({ ok: true, data: { saved: true } })
    expect(getDb).toHaveBeenCalledOnce()
    expect(extensionKvGet).toHaveBeenCalledWith({ db: true }, '@chaton/kv-test', 'config')
    expect(runtimeState.capabilityUsage.get('@chaton/kv-test')?.has('storage.kv')).toBe(true)
  })

  it('rejects malformed extension ids before capability tracking or DB access', async () => {
    const { storageKvGet, storageKvListEntries } = await import('./storage.js')

    expect(storageKvGet('../outside', 'config')).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'invalid extension id' },
    })
    expect(storageKvListEntries('../outside')).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'invalid extension id' },
    })
    expect(getDb).not.toHaveBeenCalled()
    expect(runtimeState.capabilityUsage.size).toBe(0)
  })

  it('rejects empty and control-character keys before DB access', async () => {
    const { storageKvGet, storageKvDeleteEntry } = await import('./storage.js')

    expect(storageKvGet('@chaton/kv-test', '   ')).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'key is required' },
    })
    expect(storageKvDeleteEntry('@chaton/kv-test', 'bad\nkey')).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'key contains unsupported characters' },
    })
    expect(getDb).not.toHaveBeenCalled()
    expect(runtimeState.capabilityUsage.size).toBe(0)
  })

  it('rejects overlong keys before DB access', async () => {
    const { storageKvSet } = await import('./storage.js')

    expect(storageKvSet('@chaton/kv-test', 'x'.repeat(201), true)).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'key too long' },
    })
    expect(getDb).not.toHaveBeenCalled()
  })

  it('rejects unserializable and oversized values before DB access', async () => {
    const { storageKvSet } = await import('./storage.js')
    const circular: Record<string, unknown> = {}
    circular.self = circular

    expect(storageKvSet('@chaton/kv-test', 'config', circular)).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'value must be JSON serializable' },
    })
    expect(storageKvSet('@chaton/kv-test', 'config', 'x'.repeat(256 * 1024 + 1))).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'value too large' },
    })
    expect(getDb).not.toHaveBeenCalled()
  })

  it('stores valid JSON values under the normalized extension namespace', async () => {
    const { storageKvSet, storageKvDeleteEntry, storageKvListEntries } = await import('./storage.js')

    expect(storageKvSet('@chaton/kv-test', ' settings ', { enabled: true })).toEqual({ ok: true })
    expect(extensionKvSet).toHaveBeenCalledWith({ db: true }, '@chaton/kv-test', 'settings', { enabled: true })

    expect(storageKvDeleteEntry('@chaton/kv-test', ' settings ')).toEqual({ ok: true, data: { removed: true } })
    expect(extensionKvDelete).toHaveBeenCalledWith({ db: true }, '@chaton/kv-test', 'settings')

    expect(storageKvListEntries('@chaton/kv-test')).toEqual({
      ok: true,
      data: [{ key: 'config', value: 1, updatedAt: '2026-05-26T00:00:00.000Z' }],
    })
    expect(extensionKvList).toHaveBeenCalledWith({ db: true }, '@chaton/kv-test')
  })
})
