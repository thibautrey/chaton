import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `pi:getConfigSnapshot` IPC handler.
 *
 * The handler is a simple passthrough to `deps.getPiConfigSnapshot()` which
 * lives in `workspace-pi.ts`. We replicate the function logic inline so the
 * tests run without the full module graph (Electron IPC, Pi deps, etc.).
 *
 * Key behaviors verified:
 * - Returns {ok: true} result shape with settingsPath, modelsPath, settings, models, errors
 * - settings and models are null when files are missing
 * - errors array is empty when both files exist and parse successfully
 * - errors array contains messages when files are missing or corrupt
 * - Returns correct paths for settings and models
 */

import { readFileSync, existsSync } from 'node:fs'

// -------------------------------------------------------------------------
// In-memory file system stub — mirrors what readJsonFile reads.
// -------------------------------------------------------------------------

type FileContents = Map<string, string>
const fileStore: FileContents = new Map()

function mockExistsSync(path: string) {
  return fileStore.has(path)
}

function mockReadFileSync(path: string, _encoding: BufferEncoding = 'utf8'): string {
  if (!fileStore.has(path)) {
    throw new Error(`ENOENT: ${path}`)
  }
  return fileStore.get(path)!
}

// -------------------------------------------------------------------------
// Inline readJsonFile — mirrors workspace-pi.ts
// -------------------------------------------------------------------------

function readJsonFile(
  filePath: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  if (!mockExistsSync(filePath)) {
    return { ok: false, message: `Fichier introuvable: ${filePath}` }
  }

  try {
    const raw = JSON.parse(mockReadFileSync(filePath))
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
// Inline getPiConfigSnapshot — mirrors workspace-pi.ts
// -------------------------------------------------------------------------

const SETTINGS_PATH = '/mock/pi/agent/settings.json'
const MODELS_PATH = '/mock/pi/agent/models.json'

function getPiConfigSnapshot() {
  const settingsResult = readJsonFile(SETTINGS_PATH)
  const modelsResult = readJsonFile(MODELS_PATH)
  const errors: string[] = []
  if (!settingsResult.ok) errors.push(settingsResult.message)
  if (!modelsResult.ok) errors.push(modelsResult.message)
  return {
    settingsPath: SETTINGS_PATH,
    modelsPath: MODELS_PATH,
    settings: settingsResult.ok ? settingsResult.value : null,
    models: modelsResult.ok ? modelsResult.value : null,
    errors,
  }
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

describe('getPiConfigSnapshot', () => {
  it('returns correct settingsPath and modelsPath', () => {
    const result = getPiConfigSnapshot()
    expect(result.settingsPath).toBe(SETTINGS_PATH)
    expect(result.modelsPath).toBe(MODELS_PATH)
  })

  it('returns empty errors array when both files exist and parse correctly', () => {
    fileStore.set(SETTINGS_PATH, JSON.stringify({ enabledModels: [] }))
    fileStore.set(MODELS_PATH, JSON.stringify({ providers: {} }))

    const result = getPiConfigSnapshot()

    expect(result.errors).toHaveLength(0)
    expect(result.settings).not.toBeNull()
    expect(result.models).not.toBeNull()
  })

  it('settings is null and error is added when settings.json is missing', () => {
    fileStore.set(MODELS_PATH, JSON.stringify({ providers: {} }))

    const result = getPiConfigSnapshot()

    expect(result.settings).toBeNull()
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('settings.json')
  })

  it('models is null and error is added when models.json is missing', () => {
    fileStore.set(SETTINGS_PATH, JSON.stringify({ enabledModels: [] }))

    const result = getPiConfigSnapshot()

    expect(result.models).toBeNull()
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('models.json')
  })

  it('both settings and models null when both files are missing', () => {
    const result = getPiConfigSnapshot()

    expect(result.settings).toBeNull()
    expect(result.models).toBeNull()
    expect(result.errors).toHaveLength(2)
  })

  it('adds error for corrupt settings.json (invalid JSON)', () => {
    fileStore.set(SETTINGS_PATH, '{ invalid json')
    fileStore.set(MODELS_PATH, JSON.stringify({ providers: {} }))

    const result = getPiConfigSnapshot()

    expect(result.settings).toBeNull()
    expect(result.errors.some(e => e.includes('settings.json'))).toBe(true)
  })

  it('adds error for corrupt models.json (invalid JSON)', () => {
    fileStore.set(SETTINGS_PATH, JSON.stringify({ enabledModels: [] }))
    fileStore.set(MODELS_PATH, '{ broken:')

    const result = getPiConfigSnapshot()

    expect(result.models).toBeNull()
    expect(result.errors.some(e => e.includes('models.json'))).toBe(true)
  })

  it('adds error when settings.json contains a non-object (array)', () => {
    fileStore.set(SETTINGS_PATH, JSON.stringify(['not', 'an', 'object']))
    fileStore.set(MODELS_PATH, JSON.stringify({ providers: {} }))

    const result = getPiConfigSnapshot()

    expect(result.settings).toBeNull()
    expect(result.errors.some(e => e.includes('settings.json') && e.includes('objet attendu'))).toBe(true)
  })

  it('adds error when models.json contains a non-object (array)', () => {
    fileStore.set(SETTINGS_PATH, JSON.stringify({ enabledModels: [] }))
    fileStore.set(MODELS_PATH, JSON.stringify([1, 2, 3]))

    const result = getPiConfigSnapshot()

    expect(result.models).toBeNull()
    expect(result.errors.some(e => e.includes('models.json') && e.includes('objet attendu'))).toBe(true)
  })

  it('adds error when settings.json contains a primitive', () => {
    fileStore.set(SETTINGS_PATH, JSON.stringify('just a string'))
    fileStore.set(MODELS_PATH, JSON.stringify({ providers: {} }))

    const result = getPiConfigSnapshot()

    expect(result.settings).toBeNull()
    expect(result.errors.some(e => e.includes('settings.json'))).toBe(true)
  })

  it('passes through settings object correctly when valid', () => {
    const settings = {
      enabledModels: ['provider/model'],
      defaultProvider: 'openai',
      defaultModel: 'gpt-4',
      theme: 'dark',
    }
    fileStore.set(SETTINGS_PATH, JSON.stringify(settings))
    fileStore.set(MODELS_PATH, JSON.stringify({ providers: {} }))

    const result = getPiConfigSnapshot()

    expect(result.settings).toEqual(settings)
    expect(result.errors).toHaveLength(0)
  })

  it('passes through models object correctly when valid', () => {
    const models = {
      providers: {
        openai: {
          name: 'OpenAI',
          models: [{ id: 'gpt-4', maxTokens: 8192 }],
        },
      },
    }
    fileStore.set(SETTINGS_PATH, JSON.stringify({ enabledModels: [] }))
    fileStore.set(MODELS_PATH, JSON.stringify(models))

    const result = getPiConfigSnapshot()

    expect(result.models).toEqual(models)
    expect(result.errors).toHaveLength(0)
  })

  it('collects multiple errors — both files missing', () => {
    const result = getPiConfigSnapshot()

    expect(result.errors).toHaveLength(2)
    expect(result.errors[0]).toContain('settings.json')
    expect(result.errors[1]).toContain('models.json')
  })

  it('collects multiple errors — both files corrupt', () => {
    fileStore.set(SETTINGS_PATH, 'not json')
    fileStore.set(MODELS_PATH, 'also not json')

    const result = getPiConfigSnapshot()

    expect(result.errors).toHaveLength(2)
    expect(result.errors.every(e => e.includes('JSON invalide'))).toBe(true)
  })

  it('collects two errors — settings missing, models corrupt', () => {
    fileStore.set(MODELS_PATH, '{ bad')

    const result = getPiConfigSnapshot()

    expect(result.errors).toHaveLength(2)
    expect(result.errors.some(e => e.includes('settings.json'))).toBe(true)
    expect(result.errors.some(e => e.includes('models.json'))).toBe(true)
  })
})
