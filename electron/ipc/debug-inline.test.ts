import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type FsState = { files: Map<string, string>; exists: Set<string> }
const { fsState } = vi.hoisted<{ fsState: FsState }>(() => ({
  fsState: { files: new Map<string, string>(), exists: new Set<string>() },
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    readFileSync: vi.fn((path: unknown, _encoding?: unknown) => {
      const p = String(path)
      if (p.includes('settings.json') || p.includes('models.json')) {
        if (!fsState.files.has(p)) throw new Error('ENOENT')
        return fsState.files.get(p)!
      }
      return actual.readFileSync(p, _encoding as BufferEncoding)
    }),
    existsSync: vi.fn((path: unknown) => {
      const p = String(path)
      if (p.includes('settings.json') || p.includes('models.json')) {
        return fsState.exists.has(p)
      }
      return actual.existsSync(p)
    }),
  }
})

function getPiConfigSnapshot(): unknown {
  const settingsPath = '/mock/pi/agent/settings.json'
  const modelsPath = '/mock/pi/agent/models.json'
  
  const modelsResult = (() => {
    if (!fsState.exists.has(modelsPath)) return { ok: false, message: `Missing: ${modelsPath}` }
    try {
      const raw = fsState.files.get(modelsPath)!
      return { ok: true, value: JSON.parse(raw) }
    } catch (e) {
      return { ok: false, message: `Parse error: ${e instanceof Error ? e.message : String(e)}` }
    }
  })()
  
  return { models: modelsResult.ok ? modelsResult.value : null, errors: modelsResult.ok ? [] : [modelsResult.message] }
}

const MODELS_PATH = '/mock/pi/agent/models.json'

function setFile(path: string, content: unknown) {
  fsState.exists.add(path)
  fsState.files.set(path, JSON.stringify(content))
}

beforeEach(() => {
  fsState.files.clear()
  fsState.exists.clear()
})
afterEach(() => {
  fsState.files.clear()
  fsState.exists.clear()
})

describe('debug', () => {
  it('should parse valid JSON', () => {
    setFile(MODELS_PATH, { providers: {} })
    const result = getPiConfigSnapshot() as { models: unknown; errors: string[] }
    expect(result.models).toEqual({ providers: {} })
  })
  
  it('should fail on invalid JSON', () => {
    fsState.exists.add(MODELS_PATH)
    fsState.files.set(MODELS_PATH, '{ invalid json')
    const result = getPiConfigSnapshot() as { models: unknown; errors: string[] }
    expect(result.models).toBeNull()
    expect(result.errors).toHaveLength(1)
  })
})
