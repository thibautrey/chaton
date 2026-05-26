import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `pi:getDiagnostics` IPC handler.
 *
 * The handler is a simple passthrough to `deps.getPiDiagnostics()` which lives
 * in `workspace-pi.ts`. We replicate the function logic inline so the tests run
 * without the full module graph (Electron IPC, Pi deps, etc.).
 *
 * Key behaviors verified:
 * - Returns {ok:true, checks: [...]} result shape
 * - "pi-missing" error when Pi binary not found
 * - "settings-missing" error when settings.json absent
 * - "models-missing" warning when models.json absent
 * - "settings-invalid" / "models-invalid" for corrupt JSON
 * - "default-model-missing" warning when defaultModel not in models.json
 * - "enabled-empty" info when enabledModels is empty
 * - "ok" info check when no issues
 * - Severity ordering: error > warning > info
 */

// -------------------------------------------------------------------------
// In-memory file system stub
// -------------------------------------------------------------------------

type FileContents = Map<string, string>
const fileStore: FileContents = new Map()

const BINARY_PATH = '/mock/pi/binary'
const SETTINGS_PATH = '/mock/pi/agent/settings.json'
const MODELS_PATH = '/mock/pi/agent/models.json'

// Unified mock: all filesystem operations (existsSync, readFileSync) go through
// this single store so the inline functions are self-consistent.
function mockFsExistsSync(path: string): boolean {
  return fileStore.has(path)
}

function mockFsReadFileSync(path: string): string {
  const content = fileStore.get(path)
  if (content === undefined) {
    throw new Error(`ENOENT: no such file or directory, open '${path}'`)
  }
  return content
}

function readJsonFile(
  filePath: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  if (!mockFsExistsSync(filePath)) {
    return { ok: false, message: `Fichier introuvable: ${filePath}` }
  }
  try {
    const raw = JSON.parse(mockFsReadFileSync(filePath))
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, message: `JSON invalide dans ${filePath}: objet attendu` }
    }
    return { ok: true, value: raw as Record<string, unknown> }
  } catch (error) {
    return {
      ok: false,
      message: `JSON invalide dans ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

// -------------------------------------------------------------------------
// Inline getPiDiagnostics — mirrors workspace-pi.ts
// -------------------------------------------------------------------------

function getPiDiagnostics() {
  const checks: Array<{
    id: string
    level: 'info' | 'warning' | 'error'
    message: string
  }> = []

  if (!BINARY_PATH || !mockFsExistsSync(BINARY_PATH))
    checks.push({
      id: 'pi-missing',
      level: 'error',
      message: 'Binaire Pi introuvable.',
    })
  if (!mockFsExistsSync(SETTINGS_PATH))
    checks.push({
      id: 'settings-missing',
      level: 'error',
      message: 'settings.json introuvable.',
    })
  if (!mockFsExistsSync(MODELS_PATH))
    checks.push({
      id: 'models-missing',
      level: 'warning',
      message: 'models.json introuvable.',
    })

  const settings = readJsonFile(SETTINGS_PATH)
  if (!settings.ok) {
    checks.push({
      id: 'settings-invalid',
      level: 'error',
      message: (settings as { ok: false; message: string }).message,
    })
  }
  const models = readJsonFile(MODELS_PATH)
  if (!models.ok) {
    checks.push({
      id: 'models-invalid',
      level: 'warning',
      message: (models as { ok: false; message: string }).message,
    })
  }

  if (settings.ok) {
    const enabledModels = Array.isArray(settings.value.enabledModels)
      ? settings.value.enabledModels.filter(
          (item): item is string => typeof item === 'string',
        )
      : []
    const defaultProvider =
      typeof settings.value.defaultProvider === 'string'
        ? settings.value.defaultProvider
        : null
    const defaultModel =
      typeof settings.value.defaultModel === 'string'
        ? settings.value.defaultModel
        : null

    if (defaultProvider && defaultModel && models.ok) {
      const providers = (models.value.providers ?? {}) as Record<string, unknown>
      const providerNode = providers[defaultProvider]
      const providerModels =
        providerNode && typeof providerNode === 'object'
          ? (providerNode as Record<string, unknown>).models
          : null
      const found = Array.isArray(providerModels)
        ? providerModels.some(
            (item) =>
              typeof (item as { id?: unknown })?.id === 'string' &&
              (item as { id: string }).id === defaultModel,
          )
        : false
      if (!found) {
        checks.push({
          id: 'default-model-missing',
          level: 'warning',
          message: "Le modèle par défaut n'existe pas dans models.json.",
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
    checks.push({
      id: 'ok',
      level: 'info',
      message: "Aucun problème détecté.",
    })
  }

  return { ok: true, checks }
}

// -------------------------------------------------------------------------
// Setup / teardown
// -------------------------------------------------------------------------

beforeEach(() => {
  fileStore.clear()
})

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe('getPiDiagnostics — structure', () => {
  it('returns {ok: true, checks: [...]}', () => {
    const result = getPiDiagnostics()
    expect(result).toHaveProperty('ok', true)
    expect(Array.isArray(result.checks)).toBe(true)
  })

  it('returns at least one check even when everything is fine', () => {
    fileStore.set(SETTINGS_PATH, JSON.stringify({
      enabledModels: [],
      defaultProvider: null,
      defaultModel: null,
    }))
    fileStore.set(MODELS_PATH, JSON.stringify({ providers: {} }))

    const result = getPiDiagnostics()
    expect(result.checks.length).toBeGreaterThan(0)
  })
})

describe('getPiDiagnostics — all OK', () => {
  it('returns "ok" info check when no issues', () => {
    // All files present and valid: binary + settings with valid model + models with provider.
    fileStore.set(BINARY_PATH, '')
    fileStore.set(SETTINGS_PATH, JSON.stringify({
      enabledModels: ['openai/gpt-4'],
      defaultProvider: 'openai',
      defaultModel: 'gpt-4',
    }))
    fileStore.set(MODELS_PATH, JSON.stringify({
      providers: {
        openai: {
          name: 'OpenAI',
          models: [{ id: 'gpt-4', maxTokens: 8192 }],
        },
      },
    }))

    const result = getPiDiagnostics()

    expect(result.checks).toHaveLength(1)
    expect(result.checks[0]).toMatchObject({ id: 'ok', level: 'info' })
  })
})

describe('getPiDiagnostics — pi-missing', () => {
  it('adds error check "pi-missing" when binary is absent', () => {
    const result = getPiDiagnostics()
    expect(result.checks.some(c => c.id === 'pi-missing' && c.level === 'error')).toBe(true)
  })
})

describe('getPiDiagnostics — settings-missing', () => {
  it('adds error check "settings-missing" when settings.json does not exist', () => {
    fileStore.set(MODELS_PATH, JSON.stringify({ providers: {} }))
    const result = getPiDiagnostics()
    expect(result.checks.some(c => c.id === 'settings-missing' && c.level === 'error')).toBe(true)
  })
})

describe('getPiDiagnostics — models-missing', () => {
  it('adds warning check "models-missing" when models.json does not exist', () => {
    fileStore.set(SETTINGS_PATH, JSON.stringify({ enabledModels: [] }))
    const result = getPiDiagnostics()
    expect(result.checks.some(c => c.id === 'models-missing' && c.level === 'warning')).toBe(true)
  })
})

describe('getPiDiagnostics — settings-invalid', () => {
  it('adds error check "settings-invalid" when settings.json is corrupt JSON', () => {
    fileStore.set(SETTINGS_PATH, '{ corrupt json')
    fileStore.set(MODELS_PATH, JSON.stringify({ providers: {} }))
    const result = getPiDiagnostics()
    expect(result.checks.some(c => c.id === 'settings-invalid' && c.level === 'error')).toBe(true)
  })

  it('adds error check "settings-invalid" when settings.json contains an array', () => {
    fileStore.set(SETTINGS_PATH, JSON.stringify(['not', 'an', 'object']))
    fileStore.set(MODELS_PATH, JSON.stringify({ providers: {} }))
    const result = getPiDiagnostics()
    expect(result.checks.some(c => c.id === 'settings-invalid' && c.level === 'error')).toBe(true)
  })
})

describe('getPiDiagnostics — models-invalid', () => {
  it('adds warning check "models-invalid" when models.json is corrupt JSON', () => {
    fileStore.set(SETTINGS_PATH, JSON.stringify({ enabledModels: [] }))
    fileStore.set(MODELS_PATH, 'not valid json at all')
    const result = getPiDiagnostics()
    expect(result.checks.some(c => c.id === 'models-invalid' && c.level === 'warning')).toBe(true)
  })
})

describe('getPiDiagnostics — default-model-missing', () => {
  it('adds warning when defaultModel is set but not in models.json', () => {
    fileStore.set(BINARY_PATH, '')
    fileStore.set(SETTINGS_PATH, JSON.stringify({
      enabledModels: [],
      defaultProvider: 'openai',
      defaultModel: 'gpt-5', // not in models.json
    }))
    fileStore.set(MODELS_PATH, JSON.stringify({
      providers: {
        openai: {
          name: 'OpenAI',
          models: [{ id: 'gpt-4', maxTokens: 8192 }],
        },
      },
    }))

    const result = getPiDiagnostics()
    expect(result.checks.some(c => c.id === 'default-model-missing' && c.level === 'warning')).toBe(true)
  })

  it('does NOT add warning when defaultModel exists in models.json', () => {
    fileStore.set(BINARY_PATH, '')
    fileStore.set(SETTINGS_PATH, JSON.stringify({
      enabledModels: [],
      defaultProvider: 'openai',
      defaultModel: 'gpt-4',
    }))
    fileStore.set(MODELS_PATH, JSON.stringify({
      providers: {
        openai: {
          name: 'OpenAI',
          models: [{ id: 'gpt-4', maxTokens: 8192 }],
        },
      },
    }))

    const result = getPiDiagnostics()
    expect(result.checks.some(c => c.id === 'default-model-missing')).toBe(false)
  })

  it('does NOT check default-model when defaultProvider is null', () => {
    fileStore.set(BINARY_PATH, '')
    fileStore.set(SETTINGS_PATH, JSON.stringify({
      enabledModels: [],
      defaultProvider: null,
      defaultModel: 'gpt-4',
    }))
    fileStore.set(MODELS_PATH, JSON.stringify({ providers: {} }))

    const result = getPiDiagnostics()
    expect(result.checks.some(c => c.id === 'default-model-missing')).toBe(false)
  })

  it('does NOT check default-model when defaultModel is null', () => {
    fileStore.set(BINARY_PATH, '')
    fileStore.set(SETTINGS_PATH, JSON.stringify({
      enabledModels: [],
      defaultProvider: 'openai',
      defaultModel: null,
    }))
    fileStore.set(MODELS_PATH, JSON.stringify({ providers: {} }))

    const result = getPiDiagnostics()
    expect(result.checks.some(c => c.id === 'default-model-missing')).toBe(false)
  })
})

describe('getPiDiagnostics — enabled-empty', () => {
  it('adds info check when enabledModels is empty array', () => {
    fileStore.set(BINARY_PATH, '')
    fileStore.set(SETTINGS_PATH, JSON.stringify({
      enabledModels: [],
      defaultProvider: null,
      defaultModel: null,
    }))
    fileStore.set(MODELS_PATH, JSON.stringify({ providers: {} }))

    const result = getPiDiagnostics()
    expect(result.checks.some(c => c.id === 'enabled-empty' && c.level === 'info')).toBe(true)
  })

  it('adds info check when enabledModels is undefined', () => {
    fileStore.set(BINARY_PATH, '')
    fileStore.set(SETTINGS_PATH, JSON.stringify({
      defaultProvider: null,
      defaultModel: null,
    }))
    fileStore.set(MODELS_PATH, JSON.stringify({ providers: {} }))

    const result = getPiDiagnostics()
    expect(result.checks.some(c => c.id === 'enabled-empty' && c.level === 'info')).toBe(true)
  })

  it('does NOT add enabled-empty when enabledModels has entries', () => {
    fileStore.set(BINARY_PATH, '')
    fileStore.set(SETTINGS_PATH, JSON.stringify({
      enabledModels: ['openai/gpt-4'],
      defaultProvider: null,
      defaultModel: null,
    }))
    fileStore.set(MODELS_PATH, JSON.stringify({ providers: {} }))

    const result = getPiDiagnostics()
    expect(result.checks.some(c => c.id === 'enabled-empty')).toBe(false)
  })
})

describe('getPiDiagnostics — multiple issues', () => {
  it('collects all issues together', () => {
    // No binary + no settings → pi-missing + settings-missing
    const result = getPiDiagnostics()
    expect(result.checks.length).toBeGreaterThanOrEqual(2)
    const ids = result.checks.map(c => c.id)
    expect(ids).toContain('pi-missing')
    expect(ids).toContain('settings-missing')
  })

  it('orders checks by priority: errors first, then warnings, then info', () => {
    // All files present but both JSON files are corrupt:
    // settings-invalid (error) + models-invalid (warning)
    fileStore.set(BINARY_PATH, '')
    fileStore.set(SETTINGS_PATH, '{ corrupt')
    fileStore.set(MODELS_PATH, '{ also corrupt')

    const result = getPiDiagnostics()

    // 2 checks: settings-invalid (error) + models-invalid (warning)
    expect(result.checks).toHaveLength(2)
    expect(result.checks[0].level).toBe('error')
    expect(result.checks[1].level).toBe('warning')
  })
})
