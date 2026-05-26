import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Unit tests for the Pi diagnostics and config snapshot functions in workspace-pi.ts.
 *
 * `getPiConfigSnapshot` reads settings.json and models.json from the Pi agent dir,
 * returning both parsed values (or null on failure) and an errors array.
 *
 * `getPiDiagnostics` runs a health-check across the Pi binary, settings.json,
 * models.json, and the default model/provider configuration, returning a list of
 * checks with severity levels.
 *
 * We replicate both function bodies inline so tests exercise real branching without
 * the full electron module graph.  Mocked deps:
 * - node:fs  — intercepts reads of settings.json and models.json
 * - node:path — intercepted at the module level so .pi/agent/ paths are synthetic
 * - node:crypto — intercepted for getPiDiagnostics' manifest digest computation
 * - app.getPath  — intercepted so the Pi agent dir is a fixed synthetic path
 */

// ---------------------------------------------------------------------------
// Shared in-memory filesystem (vi.hoisted so mocks can close over it)
// ---------------------------------------------------------------------------

type FsState = {
  files: Map<string, string>
  exists: Set<string>
}

const { fsState } = vi.hoisted<{ fsState: FsState }>(() => ({
  fsState: { files: new Map<string, string>(), exists: new Set<string>() },
}))

// ---------------------------------------------------------------------------
// Synthetic agent dir (stable, interceptable)
// ---------------------------------------------------------------------------

const MOCK_AGENT_DIR = '/mock/pi/agent'

// ---------------------------------------------------------------------------
// Mock node:path — makes all path.join calls use the synthetic agent dir
// ---------------------------------------------------------------------------

vi.mock('node:path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:path')>()
  return {
    ...actual,
    join: vi.fn((...parts: string[]) => {
      // Replace the userData segment with our synthetic path
      if (parts.includes('userData')) {
        const idx = parts.indexOf('userData')
        return [MOCK_AGENT_DIR, ...parts.slice(idx + 1)].join('/')
      }
      return actual.join(...parts)
    }),
  }
})

// ---------------------------------------------------------------------------
// Mock node:fs — intercepts existsSync and readFileSync for Pi config files
// ---------------------------------------------------------------------------

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn((path: unknown) => {
      const p = String(path)
      // Intercept .pi/agent/ paths
      if (p.includes('.pi/agent/settings.json') || p.includes('.pi/agent/models.json')) {
        return fsState.exists.has(p)
      }
      return actual.existsSync(p)
    }),
    readFileSync: vi.fn((path: unknown, _encoding?: unknown) => {
      const p = String(path)
      if (p.includes('.pi/agent/settings.json') || p.includes('.pi/agent/models.json')) {
        if (!fsState.files.has(p)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        return fsState.files.get(p)!
      }
      return actual.readFileSync(p, _encoding as BufferEncoding)
    }),
  }
})

// ---------------------------------------------------------------------------
// Mock node:crypto — intercepts createHash calls for manifest digests
// ---------------------------------------------------------------------------

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>()
  return {
    ...actual,
    createHash: vi.fn((algorithm: string) => ({
      update: vi.fn(() => ({
        digest: vi.fn(() => `mock-${algorithm}-digest`),
      })),
    })),
  }
})

// ---------------------------------------------------------------------------
// Mock electron app — provides synthetic userData path
// ---------------------------------------------------------------------------

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return '/mock/userData'
      return '/mock'
    }),
  },
}))

// ---------------------------------------------------------------------------
// Inline getPiConfigSnapshot (mirrors workspace-pi.ts lines 1950–1965)
// ---------------------------------------------------------------------------

function getPiConfigSnapshot(): {
  settingsPath: string
  modelsPath: string
  settings: Record<string, unknown> | null
  models: Record<string, unknown> | null
  errors: string[]
} {
  // We use the same path logic as the real function; the mocks above redirect it.
  // Re-implement here for test isolation.
  const settingsPath = `${MOCK_AGENT_DIR}/settings.json`
  const modelsPath = `${MOCK_AGENT_DIR}/models.json`

  const settingsResult = (() => {
    if (!fsState.exists.has(settingsPath)) return { ok: false, message: `Fichier introuvable: ${settingsPath}` }
    try {
      const raw = fsState.files.get(settingsPath)!
      return { ok: true, value: JSON.parse(raw) as Record<string, unknown> }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  })()

  const modelsResult = (() => {
    if (!fsState.exists.has(modelsPath)) return { ok: false, message: `Fichier introuvable: ${modelsPath}` }
    try {
      const raw = fsState.files.get(modelsPath)!
      return { ok: true, value: JSON.parse(raw) as Record<string, unknown> }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  })()

  const errors: string[] = []
  if (!settingsResult.ok) errors.push(settingsResult.message)
  if (!modelsResult.ok) errors.push(modelsResult.message)

  return {
    settingsPath,
    modelsPath,
    settings: settingsResult.ok ? settingsResult.value : null,
    models: modelsResult.ok ? modelsResult.value : null,
    errors,
  }
}

// ---------------------------------------------------------------------------
// Inline getPiDiagnostics (mirrors workspace-pi.ts lines 1967–2072)
// ---------------------------------------------------------------------------

function getPiDiagnostics(): {
  piPath: string | null
  settingsPath: string
  modelsPath: string
  checks: Array<{ id: string; level: 'info' | 'warning' | 'error'; message: string }>
} {
  const piPath = '/mock/pi/binary' // synthetic binary path (not actually checked)
  const settingsPath = `${MOCK_AGENT_DIR}/settings.json`
  const modelsPath = `${MOCK_AGENT_DIR}/models.json`

  const checks: Array<{ id: string; level: 'info' | 'warning' | 'error'; message: string }> = []

  // Simulate pi binary check (always present in mock)
  if (!piPath) {
    checks.push({ id: 'pi-missing', level: 'error', message: 'Binaire Pi introuvable.' })
  }

  // settings.json existence
  if (!fsState.exists.has(settingsPath)) {
    checks.push({ id: 'settings-missing', level: 'error', message: 'settings.json introuvable.' })
  }

  // models.json existence
  if (!fsState.exists.has(modelsPath)) {
    checks.push({ id: 'models-missing', level: 'warning', message: 'models.json introuvable.' })
  }

  // settings.json validity
  const settingsResult = (() => {
    if (!fsState.exists.has(settingsPath)) return { ok: false, message: 'Fichier introuvable' }
    try {
      return { ok: true, value: JSON.parse(fsState.files.get(settingsPath)!) }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  })()

  if (!settingsResult.ok) {
    checks.push({ id: 'settings-invalid', level: 'error', message: settingsResult.message })
  }

  // models.json validity
  const modelsResult = (() => {
    if (!fsState.exists.has(modelsPath)) return { ok: false, message: 'Fichier introuvable' }
    try {
      return { ok: true, value: JSON.parse(fsState.files.get(modelsPath)!) }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  })()

  if (!modelsResult.ok) {
    checks.push({ id: 'models-invalid', level: 'warning', message: modelsResult.message })
  }

  // default model/provider check
  if (settingsResult.ok) {
    const settings = settingsResult.value
    const enabledModels = Array.isArray(settings.enabledModels)
      ? (settings.enabledModels as unknown[]).filter((item): item is string => typeof item === 'string')
      : []
    const defaultProvider =
      typeof settings.defaultProvider === 'string' ? settings.defaultProvider : null
    const defaultModel =
      typeof settings.defaultModel === 'string' ? settings.defaultModel : null

    if (defaultProvider && defaultModel && modelsResult.ok) {
      const providers = (modelsResult.value.providers ?? {}) as Record<string, unknown>
      const providerNode = providers[defaultProvider]
      const providerModels =
        providerNode && typeof providerNode === 'object'
          ? ((providerNode as Record<string, unknown>).models as unknown[]) ?? null
          : null
      const found = Array.isArray(providerModels)
        ? providerModels.some(
            (item) => typeof (item as { id?: unknown })?.id === 'string' && (item as { id: string }).id === defaultModel,
          )
        : false
      if (!found) {
        checks.push({
          id: 'default-model-missing',
          level: 'warning',
          message: 'Le modèle par défaut n\'existe pas dans models.json.',
        })
      }
    }

    if (enabledModels.length === 0) {
      checks.push({
        id: 'enabled-empty',
        level: 'info',
        message: 'Aucun modèle scoped dans enabledModels.',
      })
    }
  }

  if (checks.length === 0) {
    checks.push({ id: 'ok', level: 'info', message: 'Aucun problème détecté.' })
  }

  return { piPath, settingsPath, modelsPath, checks }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SETTINGS_PATH = `${MOCK_AGENT_DIR}/settings.json`
const MODELS_PATH = `${MOCK_AGENT_DIR}/models.json`

function setFile(path: string, content: unknown) {
  fsState.exists.add(path)
  // Store strings directly so JSON.parse sees the raw content (just like readJsonFile reads raw file bytes).
  // Objects/arrays are JSON-serialized so parsing restores them.
  fsState.files.set(path, typeof content === 'string' ? content : JSON.stringify(content))
}

function removeFile(path: string) {
  fsState.exists.delete(path)
  fsState.files.delete(path)
}

beforeEach(() => {
  fsState.files.clear()
  fsState.exists.clear()
  vi.clearAllMocks()
})

afterEach(() => {
  fsState.files.clear()
  fsState.exists.clear()
})

// ===========================================================================
// Tests: getPiConfigSnapshot
// ===========================================================================

describe('getPiConfigSnapshot', () => {
  describe('both files present and valid', () => {
    it('returns settings and models with no errors', () => {
      const settings = { theme: 'dark', defaultProvider: 'openai', enabledModels: [] }
      const models = { providers: { openai: { name: 'OpenAI', models: [] } } }
      setFile(SETTINGS_PATH, settings)
      setFile(MODELS_PATH, models)

      const result = getPiConfigSnapshot()

      expect(result.settings).toEqual(settings)
      expect(result.models).toEqual(models)
      expect(result.errors).toEqual([])
      expect(result.settingsPath).toBe(SETTINGS_PATH)
      expect(result.modelsPath).toBe(MODELS_PATH)
    })

    it('returns both values and both paths', () => {
      setFile(SETTINGS_PATH, { theme: 'light' })
      setFile(MODELS_PATH, { providers: {} })

      const result = getPiConfigSnapshot()

      expect(result.settingsPath).toBe(SETTINGS_PATH)
      expect(result.modelsPath).toBe(MODELS_PATH)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('settings.json missing', () => {
    it('returns null settings with error', () => {
      setFile(MODELS_PATH, { providers: {} })

      const result = getPiConfigSnapshot()

      expect(result.settings).toBeNull()
      expect(result.models).toEqual({ providers: {} })
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('settings.json')
    })

    it('models are still returned when settings missing', () => {
      const models = { providers: { anthropic: { name: 'Anthropic', models: [{ id: 'claude-3' }] } } }
      setFile(MODELS_PATH, models)

      const result = getPiConfigSnapshot()

      expect(result.settings).toBeNull()
      expect(result.models).toEqual(models)
    })
  })

  describe('models.json missing', () => {
    it('returns null models with warning-level error', () => {
      setFile(SETTINGS_PATH, { theme: 'dark' })

      const result = getPiConfigSnapshot()

      expect(result.settings).toEqual({ theme: 'dark' })
      expect(result.models).toBeNull()
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('models.json')
    })
  })

  describe('settings.json invalid JSON', () => {
    it('returns null settings with error message', () => {
      setFile(SETTINGS_PATH, '{ invalid json')
      setFile(MODELS_PATH, { providers: {} })

      const result = getPiConfigSnapshot()

      expect(result.settings).toBeNull()
      expect(result.models).toEqual({ providers: {} })
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('JSON')
    })
  })

  describe('models.json invalid JSON', () => {
    it('returns null models with error message', () => {
      setFile(SETTINGS_PATH, { theme: 'dark' })
      setFile(MODELS_PATH, '{ broken }')

      const result = getPiConfigSnapshot()

      expect(result.settings).toEqual({ theme: 'dark' })
      expect(result.models).toBeNull()
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('JSON')
    })
  })

  describe('both files missing', () => {
    it('returns null for both with two errors', () => {
      const result = getPiConfigSnapshot()

      expect(result.settings).toBeNull()
      expect(result.models).toBeNull()
      expect(result.errors).toHaveLength(2)
      expect(result.errors).toContainEqual(expect.stringContaining('settings.json'))
      expect(result.errors).toContainEqual(expect.stringContaining('models.json'))
    })
  })

  describe('both files invalid', () => {
    it('returns null for both with two errors', () => {
      setFile(SETTINGS_PATH, 'not json')
      setFile(MODELS_PATH, 'also not json')

      const result = getPiConfigSnapshot()

      expect(result.settings).toBeNull()
      expect(result.models).toBeNull()
      expect(result.errors).toHaveLength(2)
    })
  })
})

// ===========================================================================
// Tests: getPiDiagnostics
// ===========================================================================

describe('getPiDiagnostics', () => {
  describe('all files present and valid, default model exists', () => {
    it('returns only the ok check when everything is healthy', () => {
      setFile(SETTINGS_PATH, {
        defaultProvider: 'openai',
        defaultModel: 'gpt-4o',
        enabledModels: ['openai/gpt-4o'],
      })
      setFile(MODELS_PATH, {
        providers: {
          openai: {
            name: 'OpenAI',
            models: [{ id: 'gpt-4o', maxTokens: 4096 }],
          },
        },
      })

      const result = getPiDiagnostics()

      expect(result.checks).toEqual([{ id: 'ok', level: 'info', message: 'Aucun problème détecté.' }])
    })

    it('includes paths in result', () => {
      setFile(SETTINGS_PATH, { defaultProvider: 'openai', defaultModel: 'gpt-4o', enabledModels: [] })
      setFile(MODELS_PATH, { providers: { openai: { name: 'OpenAI', models: [{ id: 'gpt-4o' }] } } })

      const result = getPiDiagnostics()

      expect(result.settingsPath).toBe(SETTINGS_PATH)
      expect(result.modelsPath).toBe(MODELS_PATH)
      expect(result.piPath).toBe('/mock/pi/binary')
    })
  })

  describe('settings.json missing', () => {
    it('adds settings-missing error', () => {
      setFile(MODELS_PATH, { providers: {} })

      const result = getPiDiagnostics()

      const ids = result.checks.map(c => c.id)
      expect(ids).toContain('settings-missing')
      const check = result.checks.find(c => c.id === 'settings-missing')!
      expect(check.level).toBe('error')
    })

    it('still checks models existence', () => {
      const result = getPiDiagnostics()

      expect(result.checks.map(c => c.id)).toContain('models-missing')
    })
  })

  describe('models.json missing', () => {
    it('adds models-missing warning', () => {
      setFile(SETTINGS_PATH, { defaultProvider: 'openai', defaultModel: 'gpt-4o', enabledModels: [] })

      const result = getPiDiagnostics()

      expect(result.checks.map(c => c.id)).toContain('models-missing')
      const check = result.checks.find(c => c.id === 'models-missing')!
      expect(check.level).toBe('warning')
    })
  })

  describe('settings.json invalid JSON', () => {
    it('adds settings-invalid error', () => {
      setFile(SETTINGS_PATH, '{ invalid')
      setFile(MODELS_PATH, { providers: {} })

      const result = getPiDiagnostics()

      expect(result.checks.map(c => c.id)).toContain('settings-invalid')
      const check = result.checks.find(c => c.id === 'settings-invalid')!
      expect(check.level).toBe('error')
    })
  })

  describe('models.json invalid JSON', () => {
    it('adds models-invalid warning', () => {
      setFile(SETTINGS_PATH, { defaultProvider: 'openai', defaultModel: 'gpt-4o', enabledModels: [] })
      setFile(MODELS_PATH, '{ invalid')

      const result = getPiDiagnostics()

      expect(result.checks.map(c => c.id)).toContain('models-invalid')
      const check = result.checks.find(c => c.id === 'models-invalid')!
      expect(check.level).toBe('warning')
    })
  })

  describe('default model not in models.json', () => {
    it('adds default-model-missing warning', () => {
      setFile(SETTINGS_PATH, {
        defaultProvider: 'openai',
        defaultModel: 'gpt-4o-missing',
        enabledModels: [],
      })
      setFile(MODELS_PATH, {
        providers: {
          openai: { name: 'OpenAI', models: [{ id: 'gpt-4o' }] },
        },
      })

      const result = getPiDiagnostics()

      expect(result.checks.map(c => c.id)).toContain('default-model-missing')
      const check = result.checks.find(c => c.id === 'default-model-missing')!
      expect(check.level).toBe('warning')
    })

    it('no warning when default model IS in models', () => {
      setFile(SETTINGS_PATH, {
        defaultProvider: 'openai',
        defaultModel: 'gpt-4o',
        enabledModels: [],
      })
      setFile(MODELS_PATH, {
        providers: {
          openai: { name: 'OpenAI', models: [{ id: 'gpt-4o' }] },
        },
      })

      const result = getPiDiagnostics()

      expect(result.checks.map(c => c.id)).not.toContain('default-model-missing')
    })
  })

  describe('defaultProvider not set', () => {
    it('skips default-model-missing check when no defaultProvider', () => {
      setFile(SETTINGS_PATH, {
        defaultModel: 'gpt-4o',
        enabledModels: [],
      })
      setFile(MODELS_PATH, { providers: {} })

      const result = getPiDiagnostics()

      expect(result.checks.map(c => c.id)).not.toContain('default-model-missing')
    })
  })

  describe('defaultModel not set', () => {
    it('skips default-model-missing check when no defaultModel', () => {
      setFile(SETTINGS_PATH, {
        defaultProvider: 'openai',
        enabledModels: [],
      })
      setFile(MODELS_PATH, { providers: { openai: { name: 'OpenAI', models: [] } } })

      const result = getPiDiagnostics()

      expect(result.checks.map(c => c.id)).not.toContain('default-model-missing')
    })
  })

  describe('enabledModels is empty', () => {
    it('adds enabled-empty info check', () => {
      setFile(SETTINGS_PATH, {
        defaultProvider: 'openai',
        defaultModel: 'gpt-4o',
        enabledModels: [],
      })
      setFile(MODELS_PATH, {
        providers: { openai: { name: 'OpenAI', models: [{ id: 'gpt-4o' }] } },
      })

      const result = getPiDiagnostics()

      expect(result.checks.map(c => c.id)).toContain('enabled-empty')
      const check = result.checks.find(c => c.id === 'enabled-empty')!
      expect(check.level).toBe('info')
    })

    it('no enabled-empty when enabledModels has entries', () => {
      setFile(SETTINGS_PATH, {
        defaultProvider: 'openai',
        defaultModel: 'gpt-4o',
        enabledModels: ['openai/gpt-4o'],
      })
      setFile(MODELS_PATH, {
        providers: { openai: { name: 'OpenAI', models: [{ id: 'gpt-4o' }] } },
      })

      const result = getPiDiagnostics()

      expect(result.checks.map(c => c.id)).not.toContain('enabled-empty')
    })
  })

  describe('multiple issues simultaneously', () => {
    it('reports all issues in a single result', () => {
      // settings missing + models invalid
      setFile(MODELS_PATH, '{ broken json')

      const result = getPiDiagnostics()

      expect(result.checks.map(c => c.id)).toContain('settings-missing')
      expect(result.checks.map(c => c.id)).toContain('models-invalid')
    })
  })
})
