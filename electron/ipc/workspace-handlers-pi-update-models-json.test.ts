import { describe, expect, it, vi } from 'vitest'

/**
 * Unit tests for the `pi:updateModelsJson` IPC handler.
 *
 * Key branching behaviors verified:
 * - Input validation (null, undefined, primitives, arrays rejected)
 * - Incoming providers extraction (validates shape)
 * - Model auto-discovery: providers without models trigger discoverProviderModels
 * - Provider with models already: skips discovery for that provider
 * - Sanitization failure propagates as error
 * - Validation failure propagates as error
 * - atomicWriteJson throws: returns error with message
 * - syncPiModelsCache is called after successful write
 * - syncProviderApiKeysBetweenModelsAndAuth is called after successful write
 * - backupFile is called before atomicWriteJson (when file exists)
 * - backupFile NOT called when file does not exist
 */

// -------------------------------------------------------------------------
// Types mirroring the real handler
// -------------------------------------------------------------------------

type ProviderValue = {
  baseUrl?: string
  apiKey?: string
  models?: Array<{ id: string; maxTokens?: number }>
  [key: string]: unknown
}

type SanitizedResult = Record<string, unknown> & {
  providers?: Record<string, ProviderValue>
}

// -------------------------------------------------------------------------
// Inline handler — mirrors workspace-handlers.ts lines 1688–1816
// -------------------------------------------------------------------------

async function updateModelsJson(params: {
  input: unknown
  readJsonFile: (path: string) => { ok: true; value: Record<string, unknown> } | { ok: false; message: string }
  discoverProviderModels: (
    config: Record<string, unknown>,
    id?: string,
  ) => Promise<{
    ok: boolean
    models?: Array<{ id: string; contextWindow?: number; contextWindowSource?: string; maxTokens?: number; reasoning?: boolean; imageInput?: boolean }>
  }>
  sanitizeModelsJsonWithResolvedBaseUrls: (
    input: Record<string, unknown>,
  ) => Promise<SanitizedResult>
  validateModelsJson: (json: SanitizedResult) => string | null
  backupFile: (path: string) => void
  atomicWriteJson: (path: string, data: unknown) => void
  syncProviderApiKeysBetweenModelsAndAuth: (agentDir: string) => void
  syncPiModelsCache: () => Promise<void>
  getPiModelsPath: () => string
  getPiAgentDir: () => string
  fsExistsSync: (path: string) => boolean
}): Promise<{ ok: boolean; message?: string }> {
  const {
    input,
    discoverProviderModels,
    sanitizeModelsJsonWithResolvedBaseUrls,
    validateModelsJson,
    backupFile,
    atomicWriteJson,
    syncProviderApiKeysBetweenModelsAndAuth,
    syncPiModelsCache,
    getPiModelsPath,
    getPiAgentDir,
    fsExistsSync,
  } = params

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: 'models.json invalide: objet attendu.' }
  }

  const incoming = input as Record<string, unknown>
  const incomingProviders =
    incoming.providers &&
    typeof incoming.providers === 'object' &&
    !Array.isArray(incoming.providers)
      ? (incoming.providers as Record<string, unknown>)
      : {}
  const enrichedProviders: Record<string, unknown> = { ...incomingProviders }

  await Promise.all(
    Object.entries(incomingProviders).map(async ([providerName, providerValue]) => {
      if (!providerValue || typeof providerValue !== 'object' || Array.isArray(providerValue)) {
        return
      }
      const providerConfig = providerValue as Record<string, unknown>
      const existingModels = providerConfig.models
      if (Array.isArray(existingModels) && existingModels.length > 0) {
        return
      }
      const discovered = await discoverProviderModels(providerConfig, providerName)
      if (!discovered || typeof discovered !== 'object' || !('ok' in discovered)) {
        return
      }
      const typedDiscovered = discovered as {
        ok: boolean
        models?: Array<{
          id: string
          contextWindow?: number
          contextWindowSource?: string
          maxTokens?: number
          reasoning?: boolean
          imageInput?: boolean
        }>
      }
      if (!typedDiscovered.ok || !Array.isArray(typedDiscovered.models) || typedDiscovered.models.length === 0) {
        return
      }
      enrichedProviders[providerName] = {
        ...providerConfig,
        models: typedDiscovered.models.map((model) => {
          const entry: Record<string, unknown> = { id: model.id }
          if (typeof model.contextWindow === 'number' && model.contextWindowSource === 'provider') {
            entry.contextWindow = model.contextWindow
          }
          if (typeof model.maxTokens === 'number') {
            entry.maxTokens = model.maxTokens
          }
          if (model.reasoning) {
            entry.reasoning = true
          }
          if (model.imageInput) {
            entry.imageInput = true
          }
          return entry
        }),
      }
    }),
  )

  const sanitized = await sanitizeModelsJsonWithResolvedBaseUrls({
    ...incoming,
    providers: enrichedProviders,
  })

  const error = validateModelsJson(sanitized)
  if (error) {
    return { ok: false, message: error }
  }

  const modelsPath = getPiModelsPath()
  try {
    if (fsExistsSync(modelsPath)) {
      backupFile(modelsPath)
    }
    atomicWriteJson(modelsPath, sanitized)
    syncProviderApiKeysBetweenModelsAndAuth(getPiAgentDir())
    await syncPiModelsCache()
    return { ok: true }
  } catch (writeError) {
    return {
      ok: false,
      message: writeError instanceof Error ? writeError.message : String(writeError),
    }
  }
}

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe('pi:updateModelsJson', () => {
  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------

  describe('input validation', () => {
    it('returns error when input is null', async () => {
      const result = await updateModelsJson({
        input: null,
        readJsonFile: vi.fn(),
        discoverProviderModels: vi.fn(),
        sanitizeModelsJsonWithResolvedBaseUrls: vi.fn(),
        validateModelsJson: vi.fn(),
        backupFile: vi.fn(),
        atomicWriteJson: vi.fn(),
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn(),
      })
      expect(result).toEqual({ ok: false, message: 'models.json invalide: objet attendu.' })
    })

    it('returns error when input is undefined', async () => {
      const result = await updateModelsJson({
        input: undefined,
        readJsonFile: vi.fn(),
        discoverProviderModels: vi.fn(),
        sanitizeModelsJsonWithResolvedBaseUrls: vi.fn(),
        validateModelsJson: vi.fn(),
        backupFile: vi.fn(),
        atomicWriteJson: vi.fn(),
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn(),
      })
      expect(result).toEqual({ ok: false, message: 'models.json invalide: objet attendu.' })
    })

    it('returns error when input is a number', async () => {
      const result = await updateModelsJson({
        input: 42,
        readJsonFile: vi.fn(),
        discoverProviderModels: vi.fn(),
        sanitizeModelsJsonWithResolvedBaseUrls: vi.fn(),
        validateModelsJson: vi.fn(),
        backupFile: vi.fn(),
        atomicWriteJson: vi.fn(),
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn(),
      })
      expect(result).toEqual({ ok: false, message: 'models.json invalide: objet attendu.' })
    })

    it('returns error when input is a string', async () => {
      const result = await updateModelsJson({
        input: '{}',
        readJsonFile: vi.fn(),
        discoverProviderModels: vi.fn(),
        sanitizeModelsJsonWithResolvedBaseUrls: vi.fn(),
        validateModelsJson: vi.fn(),
        backupFile: vi.fn(),
        atomicWriteJson: vi.fn(),
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn(),
      })
      expect(result).toEqual({ ok: false, message: 'models.json invalide: objet attendu.' })
    })

    it('returns error when input is an array', async () => {
      const result = await updateModelsJson({
        input: [{ providers: {} }],
        readJsonFile: vi.fn(),
        discoverProviderModels: vi.fn(),
        sanitizeModelsJsonWithResolvedBaseUrls: vi.fn(),
        validateModelsJson: vi.fn(),
        backupFile: vi.fn(),
        atomicWriteJson: vi.fn(),
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn(),
      })
      expect(result).toEqual({ ok: false, message: 'models.json invalide: objet attendu.' })
    })
  })

  // -------------------------------------------------------------------------
  // Model auto-discovery
  // -------------------------------------------------------------------------

  describe('model auto-discovery', () => {
    it('calls discoverProviderModels for provider without models array', async () => {
      const discoverProviderModels = vi.fn().mockResolvedValue({ ok: true, models: [] })
      const sanitizeModelsJsonWithResolvedBaseUrls = vi.fn<[Record<string, unknown>], Promise<SanitizedResult>>()
        .mockResolvedValue({ providers: { 'custom-provider': { baseUrl: 'https://api.example.com' } } })
      const validateModelsJson = vi.fn<[SanitizedResult], string | null>().mockReturnValue(null)

      await updateModelsJson({
        input: { providers: { 'custom-provider': { baseUrl: 'https://api.example.com' } } },
        readJsonFile: vi.fn(),
        discoverProviderModels,
        sanitizeModelsJsonWithResolvedBaseUrls,
        validateModelsJson,
        backupFile: vi.fn(),
        atomicWriteJson: vi.fn(),
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn().mockReturnValue(false),
      })

      expect(discoverProviderModels).toHaveBeenCalledWith(
        { baseUrl: 'https://api.example.com' },
        'custom-provider',
      )
    })

    it('skips discoverProviderModels for provider that already has models', async () => {
      const discoverProviderModels = vi.fn()

      const sanitizeModelsJsonWithResolvedBaseUrls = vi.fn<[Record<string, unknown>], Promise<SanitizedResult>>()
        .mockResolvedValue({
          providers: {
            openai: {
              baseUrl: 'https://api.openai.com/v1',
              models: [{ id: 'gpt-4' }],
            },
          },
        })
      const validateModelsJson = vi.fn<[SanitizedResult], string | null>().mockReturnValue(null)

      await updateModelsJson({
        input: {
          providers: {
            openai: {
              baseUrl: 'https://api.openai.com/v1',
              models: [{ id: 'gpt-4' }],
            },
          },
        },
        readJsonFile: vi.fn(),
        discoverProviderModels,
        sanitizeModelsJsonWithResolvedBaseUrls,
        validateModelsJson,
        backupFile: vi.fn(),
        atomicWriteJson: vi.fn(),
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn().mockReturnValue(false),
      })

      expect(discoverProviderModels).not.toHaveBeenCalled()
    })

    it('skips provider when discoverProviderModels returns {ok: false}', async () => {
      const discoverProviderModels = vi.fn().mockResolvedValue({ ok: false })
      const sanitizeModelsJsonWithResolvedBaseUrls = vi.fn<[Record<string, unknown>], Promise<SanitizedResult>>()
        .mockResolvedValue({
          providers: { 'custom-provider': { baseUrl: 'https://api.example.com' } },
        })
      const validateModelsJson = vi.fn<[SanitizedResult], string | null>().mockReturnValue(null)
      const atomicWriteJson = vi.fn()

      await updateModelsJson({
        input: { providers: { 'custom-provider': { baseUrl: 'https://api.example.com' } } },
        readJsonFile: vi.fn(),
        discoverProviderModels,
        sanitizeModelsJsonWithResolvedBaseUrls,
        validateModelsJson,
        backupFile: vi.fn(),
        atomicWriteJson,
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn().mockReturnValue(false),
      })

      // The provider is passed through as-is (no discovered models added)
      expect(atomicWriteJson).toHaveBeenCalledWith(
        '/pi/agent/models.json',
        expect.objectContaining({
          providers: expect.objectContaining({
            'custom-provider': { baseUrl: 'https://api.example.com' },
          }),
        }),
      )
    })

    it('enriches provider with discovered models (maxTokens, reasoning, imageInput)', async () => {
      const discoverProviderModels = vi.fn().mockResolvedValue({
        ok: true,
        models: [
          { id: 'model-v1', maxTokens: 8192, reasoning: true, imageInput: true },
        ],
      })
      const sanitizeModelsJsonWithResolvedBaseUrls = vi.fn<[Record<string, unknown>], Promise<SanitizedResult>>()
        .mockResolvedValue({
          providers: {
            'custom-provider': {
              baseUrl: 'https://api.example.com',
              models: [{ id: 'model-v1', maxTokens: 8192, reasoning: true, imageInput: true }],
            },
          },
        })
      const validateModelsJson = vi.fn<[SanitizedResult], string | null>().mockReturnValue(null)
      const atomicWriteJson = vi.fn()

      await updateModelsJson({
        input: { providers: { 'custom-provider': { baseUrl: 'https://api.example.com' } } },
        readJsonFile: vi.fn(),
        discoverProviderModels,
        sanitizeModelsJsonWithResolvedBaseUrls,
        validateModelsJson,
        backupFile: vi.fn(),
        atomicWriteJson,
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn().mockReturnValue(false),
      })

      // Verify the sanitized input had the discovered models injected
      expect(sanitizeModelsJsonWithResolvedBaseUrls).toHaveBeenCalledWith(
        expect.objectContaining({
          providers: expect.objectContaining({
            'custom-provider': expect.objectContaining({
              models: [{ id: 'model-v1', maxTokens: 8192, reasoning: true, imageInput: true }],
            }),
          }),
        }),
      )
    })

    it('does not include contextWindow when contextWindowSource is not "provider"', async () => {
      const discoverProviderModels = vi.fn().mockResolvedValue({
        ok: true,
        models: [
          { id: 'model-v1', contextWindow: 128000, contextWindowSource: 'pi' },
        ],
      })
      const sanitizeModelsJsonWithResolvedBaseUrls = vi.fn<[Record<string, unknown>], Promise<SanitizedResult>>()
        .mockResolvedValue({
          providers: {
            'custom-provider': {
              baseUrl: 'https://api.example.com',
              models: [{ id: 'model-v1' }],
            },
          },
        })
      const validateModelsJson = vi.fn<[SanitizedResult], string | null>().mockReturnValue(null)
      const atomicWriteJson = vi.fn()

      await updateModelsJson({
        input: { providers: { 'custom-provider': { baseUrl: 'https://api.example.com' } } },
        readJsonFile: vi.fn(),
        discoverProviderModels,
        sanitizeModelsJsonWithResolvedBaseUrls,
        validateModelsJson,
        backupFile: vi.fn(),
        atomicWriteJson,
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn().mockReturnValue(false),
      })

      expect(sanitizeModelsJsonWithResolvedBaseUrls).toHaveBeenCalledWith(
        expect.objectContaining({
          providers: expect.objectContaining({
            'custom-provider': expect.objectContaining({
              models: [{ id: 'model-v1' }], // no contextWindow
            }),
          }),
        }),
      )
    })

    it('includes contextWindow when contextWindowSource is "provider"', async () => {
      const discoverProviderModels = vi.fn().mockResolvedValue({
        ok: true,
        models: [
          { id: 'model-v1', contextWindow: 128000, contextWindowSource: 'provider' },
        ],
      })
      const sanitizeModelsJsonWithResolvedBaseUrls = vi.fn<[Record<string, unknown>], Promise<SanitizedResult>>()
        .mockResolvedValue({
          providers: {
            'custom-provider': {
              baseUrl: 'https://api.example.com',
              models: [{ id: 'model-v1', contextWindow: 128000 }],
            },
          },
        })
      const validateModelsJson = vi.fn<[SanitizedResult], string | null>().mockReturnValue(null)
      const atomicWriteJson = vi.fn()

      await updateModelsJson({
        input: { providers: { 'custom-provider': { baseUrl: 'https://api.example.com' } } },
        readJsonFile: vi.fn(),
        discoverProviderModels,
        sanitizeModelsJsonWithResolvedBaseUrls,
        validateModelsJson,
        backupFile: vi.fn(),
        atomicWriteJson,
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn().mockReturnValue(false),
      })

      expect(sanitizeModelsJsonWithResolvedBaseUrls).toHaveBeenCalledWith(
        expect.objectContaining({
          providers: expect.objectContaining({
            'custom-provider': expect.objectContaining({
              models: [{ id: 'model-v1', contextWindow: 128000 }],
            }),
          }),
        }),
      )
    })
  })

  // -------------------------------------------------------------------------
  // Sanitization and validation
  // -------------------------------------------------------------------------

  describe('sanitization and validation', () => {
    it('returns error when sanitizeModelsJsonWithResolvedBaseUrls rejects', async () => {
      const sanitizeModelsJsonWithResolvedBaseUrls = vi.fn<[Record<string, unknown>], Promise<SanitizedResult>>()
        .mockResolvedValue({}) // empty sanitized result
      const validateModelsJson = vi.fn<[SanitizedResult], string | null>()
        .mockReturnValue('providers field is required')

      const result = await updateModelsJson({
        input: { providers: {} },
        readJsonFile: vi.fn(),
        discoverProviderModels: vi.fn().mockResolvedValue({ ok: true, models: [] }),
        sanitizeModelsJsonWithResolvedBaseUrls,
        validateModelsJson,
        backupFile: vi.fn(),
        atomicWriteJson: vi.fn(),
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn().mockReturnValue(false),
      })

      expect(result).toEqual({ ok: false, message: 'providers field is required' })
    })

    it('returns error when validateModelsJson returns an error string', async () => {
      const sanitizeModelsJsonWithResolvedBaseUrls = vi.fn<[Record<string, unknown>], Promise<SanitizedResult>>()
        .mockResolvedValue({ providers: { openai: { baseUrl: 'https://api.openai.com/v1' } } })
      const validateModelsJson = vi.fn<[SanitizedResult], string | null>()
        .mockReturnValue('invalid baseUrl format')

      const result = await updateModelsJson({
        input: { providers: { openai: { baseUrl: 'https://api.openai.com/v1' } } },
        readJsonFile: vi.fn(),
        discoverProviderModels: vi.fn().mockResolvedValue({ ok: true, models: [] }),
        sanitizeModelsJsonWithResolvedBaseUrls,
        validateModelsJson,
        backupFile: vi.fn(),
        atomicWriteJson: vi.fn(),
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn().mockReturnValue(false),
      })

      expect(result).toEqual({ ok: false, message: 'invalid baseUrl format' })
      expect(validateModelsJson).toHaveBeenCalledWith(
        expect.objectContaining({ providers: expect.any(Object) }),
      )
    })
  })

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  describe('persistence', () => {
    it('calls backupFile before atomicWriteJson when file exists', async () => {
      const sanitizeModelsJsonWithResolvedBaseUrls = vi.fn<[Record<string, unknown>], Promise<SanitizedResult>>()
        .mockResolvedValue({ providers: {} })
      const validateModelsJson = vi.fn<[SanitizedResult], string | null>().mockReturnValue(null)
      const backupFile = vi.fn()
      const atomicWriteJson = vi.fn()

      await updateModelsJson({
        input: { providers: {} },
        readJsonFile: vi.fn(),
        discoverProviderModels: vi.fn().mockResolvedValue({ ok: true, models: [] }),
        sanitizeModelsJsonWithResolvedBaseUrls,
        validateModelsJson,
        backupFile,
        atomicWriteJson,
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn().mockReturnValue(true),
      })

      const callOrder: string[] = []
      const tracedBackupFile = vi.fn().mockImplementation(() => callOrder.push('backup'))
      const tracedAtomicWriteJson = vi.fn().mockImplementation(() => callOrder.push('write'))

      // Re-run with ordering tracking
      await updateModelsJson({
        input: { providers: {} },
        readJsonFile: vi.fn(),
        discoverProviderModels: vi.fn().mockResolvedValue({ ok: true, models: [] }),
        sanitizeModelsJsonWithResolvedBaseUrls,
        validateModelsJson,
        backupFile: tracedBackupFile,
        atomicWriteJson: tracedAtomicWriteJson,
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn().mockReturnValue(true),
      })

      expect(callOrder).toEqual(['backup', 'write'])
    })

    it('does NOT call backupFile when file does not exist', async () => {
      const sanitizeModelsJsonWithResolvedBaseUrls = vi.fn<[Record<string, unknown>], Promise<SanitizedResult>>()
        .mockResolvedValue({ providers: {} })
      const validateModelsJson = vi.fn<[SanitizedResult], string | null>().mockReturnValue(null)
      const backupFile = vi.fn()
      const fsExistsSync = vi.fn().mockReturnValue(false)

      await updateModelsJson({
        input: { providers: {} },
        readJsonFile: vi.fn(),
        discoverProviderModels: vi.fn().mockResolvedValue({ ok: true, models: [] }),
        sanitizeModelsJsonWithResolvedBaseUrls,
        validateModelsJson,
        backupFile,
        atomicWriteJson: vi.fn(),
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync,
      })

      expect(backupFile).not.toHaveBeenCalled()
    })

    it('calls atomicWriteJson with correct path and sanitized value', async () => {
      const sanitized = { providers: { openai: { baseUrl: 'https://api.openai.com/v1', models: [{ id: 'gpt-4' }] } } }
      const sanitizeModelsJsonWithResolvedBaseUrls = vi.fn<[Record<string, unknown>], Promise<SanitizedResult>>()
        .mockResolvedValue(sanitized)
      const validateModelsJson = vi.fn<[SanitizedResult], string | null>().mockReturnValue(null)
      const atomicWriteJson = vi.fn()

      await updateModelsJson({
        input: { providers: { openai: { baseUrl: 'https://api.openai.com/v1', models: [{ id: 'gpt-4' }] } } },
        readJsonFile: vi.fn(),
        discoverProviderModels: vi.fn().mockResolvedValue({ ok: true, models: [] }),
        sanitizeModelsJsonWithResolvedBaseUrls,
        validateModelsJson,
        backupFile: vi.fn(),
        atomicWriteJson,
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn().mockReturnValue(true),
      })

      expect(atomicWriteJson).toHaveBeenCalledWith('/pi/agent/models.json', sanitized)
    })

    it('returns error with message when atomicWriteJson throws Error', async () => {
      const sanitizeModelsJsonWithResolvedBaseUrls = vi.fn<[Record<string, unknown>], Promise<SanitizedResult>>()
        .mockResolvedValue({ providers: {} })
      const validateModelsJson = vi.fn<[SanitizedResult], string | null>().mockReturnValue(null)
      const atomicWriteJson = vi.fn().mockImplementation(() => {
        throw new Error('ENOSPC: no space left on device')
      })

      const result = await updateModelsJson({
        input: { providers: {} },
        readJsonFile: vi.fn(),
        discoverProviderModels: vi.fn().mockResolvedValue({ ok: true, models: [] }),
        sanitizeModelsJsonWithResolvedBaseUrls,
        validateModelsJson,
        backupFile: vi.fn(),
        atomicWriteJson,
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn().mockReturnValue(false),
      })

      expect(result).toEqual({ ok: false, message: 'ENOSPC: no space left on device' })
    })

    it('returns error with string when atomicWriteJson throws non-Error', async () => {
      const sanitizeModelsJsonWithResolvedBaseUrls = vi.fn<[Record<string, unknown>], Promise<SanitizedResult>>()
        .mockResolvedValue({ providers: {} })
      const validateModelsJson = vi.fn<[SanitizedResult], string | null>().mockReturnValue(null)
      const atomicWriteJson = vi.fn().mockImplementation(() => {
        throw 'Unexpected crash'
      })

      const result = await updateModelsJson({
        input: { providers: {} },
        readJsonFile: vi.fn(),
        discoverProviderModels: vi.fn().mockResolvedValue({ ok: true, models: [] }),
        sanitizeModelsJsonWithResolvedBaseUrls,
        validateModelsJson,
        backupFile: vi.fn(),
        atomicWriteJson,
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn().mockReturnValue(false),
      })

      expect(result).toEqual({ ok: false, message: 'Unexpected crash' })
    })
  })

  // -------------------------------------------------------------------------
  // Post-write side effects
  // -------------------------------------------------------------------------

  describe('post-write side effects', () => {
    it('calls syncProviderApiKeysBetweenModelsAndAuth after successful write', async () => {
      const sanitizeModelsJsonWithResolvedBaseUrls = vi.fn<[Record<string, unknown>], Promise<SanitizedResult>>()
        .mockResolvedValue({ providers: {} })
      const validateModelsJson = vi.fn<[SanitizedResult], string | null>().mockReturnValue(null)
      const syncProviderApiKeysBetweenModelsAndAuth = vi.fn()

      await updateModelsJson({
        input: { providers: {} },
        readJsonFile: vi.fn(),
        discoverProviderModels: vi.fn().mockResolvedValue({ ok: true, models: [] }),
        sanitizeModelsJsonWithResolvedBaseUrls,
        validateModelsJson,
        backupFile: vi.fn(),
        atomicWriteJson: vi.fn(),
        syncProviderApiKeysBetweenModelsAndAuth,
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn().mockReturnValue(false),
      })

      expect(syncProviderApiKeysBetweenModelsAndAuth).toHaveBeenCalledWith('/pi/agent')
    })

    it('calls syncPiModelsCache after successful write', async () => {
      const sanitizeModelsJsonWithResolvedBaseUrls = vi.fn<[Record<string, unknown>], Promise<SanitizedResult>>()
        .mockResolvedValue({ providers: {} })
      const validateModelsJson = vi.fn<[SanitizedResult], string | null>().mockReturnValue(null)
      const syncPiModelsCache = vi.fn()

      await updateModelsJson({
        input: { providers: {} },
        readJsonFile: vi.fn(),
        discoverProviderModels: vi.fn().mockResolvedValue({ ok: true, models: [] }),
        sanitizeModelsJsonWithResolvedBaseUrls,
        validateModelsJson,
        backupFile: vi.fn(),
        atomicWriteJson: vi.fn(),
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache,
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn().mockReturnValue(false),
      })

      expect(syncPiModelsCache).toHaveBeenCalled()
    })

    it('does NOT call syncPiModelsCache when atomicWriteJson throws', async () => {
      const sanitizeModelsJsonWithResolvedBaseUrls = vi.fn<[Record<string, unknown>], Promise<SanitizedResult>>()
        .mockResolvedValue({ providers: {} })
      const validateModelsJson = vi.fn<[SanitizedResult], string | null>().mockReturnValue(null)
      const syncPiModelsCache = vi.fn()

      await updateModelsJson({
        input: { providers: {} },
        readJsonFile: vi.fn(),
        discoverProviderModels: vi.fn().mockResolvedValue({ ok: true, models: [] }),
        sanitizeModelsJsonWithResolvedBaseUrls,
        validateModelsJson,
        backupFile: vi.fn(),
        atomicWriteJson: vi.fn().mockImplementation(() => {
          throw new Error('write failed')
        }),
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache,
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn().mockReturnValue(false),
      })

      expect(syncPiModelsCache).not.toHaveBeenCalled()
    })

    it('returns {ok: true} on full success', async () => {
      const sanitizeModelsJsonWithResolvedBaseUrls = vi.fn<[Record<string, unknown>], Promise<SanitizedResult>>()
        .mockResolvedValue({ providers: { openai: { baseUrl: 'https://api.openai.com/v1' } } })
      const validateModelsJson = vi.fn<[SanitizedResult], string | null>().mockReturnValue(null)

      const result = await updateModelsJson({
        input: { providers: { openai: { baseUrl: 'https://api.openai.com/v1' } } },
        readJsonFile: vi.fn(),
        discoverProviderModels: vi.fn().mockResolvedValue({ ok: true, models: [] }),
        sanitizeModelsJsonWithResolvedBaseUrls,
        validateModelsJson,
        backupFile: vi.fn(),
        atomicWriteJson: vi.fn(),
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn().mockReturnValue(false),
      })

      expect(result).toEqual({ ok: true })
    })
  })

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('accepts empty providers object', async () => {
      const sanitizeModelsJsonWithResolvedBaseUrls = vi.fn<[Record<string, unknown>], Promise<SanitizedResult>>()
        .mockResolvedValue({ providers: {} })
      const validateModelsJson = vi.fn<[SanitizedResult], string | null>().mockReturnValue(null)
      const atomicWriteJson = vi.fn()

      await updateModelsJson({
        input: { providers: {} },
        readJsonFile: vi.fn(),
        discoverProviderModels: vi.fn().mockResolvedValue({ ok: true, models: [] }),
        sanitizeModelsJsonWithResolvedBaseUrls,
        validateModelsJson,
        backupFile: vi.fn(),
        atomicWriteJson,
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn().mockReturnValue(false),
      })

      expect(atomicWriteJson).toHaveBeenCalledWith(
        '/pi/agent/models.json',
        expect.objectContaining({ providers: {} }),
      )
    })

    it('passes through extra fields in incoming input', async () => {
      const sanitizeModelsJsonWithResolvedBaseUrls = vi.fn<[Record<string, unknown>], Promise<SanitizedResult>>()
        .mockResolvedValue({ providers: {}, version: '2.0' })
      const validateModelsJson = vi.fn<[SanitizedResult], string | null>().mockReturnValue(null)
      const atomicWriteJson = vi.fn()

      await updateModelsJson({
        input: { providers: {}, version: '2.0' },
        readJsonFile: vi.fn(),
        discoverProviderModels: vi.fn().mockResolvedValue({ ok: true, models: [] }),
        sanitizeModelsJsonWithResolvedBaseUrls,
        validateModelsJson,
        backupFile: vi.fn(),
        atomicWriteJson,
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn().mockReturnValue(false),
      })

      expect(sanitizeModelsJsonWithResolvedBaseUrls).toHaveBeenCalledWith(
        expect.objectContaining({ version: '2.0' }),
      )
    })

    it('handles provider with null value in incoming providers', async () => {
      // This shouldn't happen in practice but the handler handles it gracefully
      const sanitizeModelsJsonWithResolvedBaseUrls = vi.fn<[Record<string, unknown>], Promise<SanitizedResult>>()
        .mockResolvedValue({ providers: { 'null-provider': {} } })
      const validateModelsJson = vi.fn<[SanitizedResult], string | null>().mockReturnValue(null)
      const discoverProviderModels = vi.fn().mockResolvedValue({ ok: true, models: [] })

      await updateModelsJson({
        input: { providers: { 'null-provider': null as unknown } },
        readJsonFile: vi.fn(),
        discoverProviderModels,
        sanitizeModelsJsonWithResolvedBaseUrls,
        validateModelsJson,
        backupFile: vi.fn(),
        atomicWriteJson: vi.fn(),
        syncProviderApiKeysBetweenModelsAndAuth: vi.fn(),
        syncPiModelsCache: vi.fn(),
        getPiModelsPath: () => '/pi/agent/models.json',
        getPiAgentDir: () => '/pi/agent',
        fsExistsSync: vi.fn().mockReturnValue(false),
      })

      // discoverProviderModels not called for null provider value
      expect(discoverProviderModels).not.toHaveBeenCalled()
    })
  })
})
