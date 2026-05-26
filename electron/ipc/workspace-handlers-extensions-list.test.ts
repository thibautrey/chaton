import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Unit tests for the `extensions:list` IPC handler.
 *
 * Key behavioral guarantees verified:
 * - Returns `{ok: true}` regardless of whether extensions exist
 * - Passes the extensions array from listChatonsExtensions to enrichExtensionsWithRuntimeFields
 * - Returns enriched extensions (manifest fields merged in, installed: true, etc.)
 * - Preserves the `ok` field from listChatonsExtensions result
 * - Empty extensions array is handled gracefully (no crash, returns empty enriched array)
 *
 * We replicate the minimal handler logic inline to test without needing the full
 * workspace-handlers.ts module (which requires database, IPC, and extension-manager wiring).
 */

type ChatonsExtensionRegistryEntry = {
  id: string
  name: string
  version: string
  description: string
  enabled: boolean
  installSource: 'builtin' | 'localPath' | 'git'
  health: 'ok' | 'warning' | 'error'
  lastRunAt?: string
  lastRunStatus?: 'ok' | 'error'
  lastError?: string
  config?: Record<string, unknown>
  capabilitiesDeclared?: string[]
  capabilitiesUsed?: string[]
  healthDetails?: Record<string, unknown>
  apiContracts?: Record<string, unknown>
  manifestDigest?: string | null
  installed?: boolean
  npmPublishedVersion?: string | null
}

// Inline function mirroring enrichExtensionsWithRuntimeFields (registry.ts lines 290–314)
function enrichExtensionsWithRuntimeFields(
  entries: ChatonsExtensionRegistryEntry[],
  runtimeState: {
    manifests: Map<string, Record<string, unknown>>
    capabilityUsage: Map<string, Set<string>>
    subscriptions: Map<string, { extensionId: string; topic: string }>
    started: boolean
  },
): ChatonsExtensionRegistryEntry[] {
  return entries.map((entry) => {
    const manifest = runtimeState.manifests.get(entry.id) ?? null
    const manifestName =
      typeof manifest?.name === 'string' ? manifest.name.trim() : ''
    const icon =
      typeof manifest?.icon === 'string' && manifest.icon.trim()
        ? manifest.icon.trim()
        : undefined
    return {
      ...entry,
      name: manifestName || entry.name,
      config: {
        ...(entry.config ?? {}),
        ...(manifest?.kind === 'channel' ? { kind: 'channel' } : {}),
        ...(icon ? { icon } : {}),
      },
      capabilitiesDeclared: (manifest?.capabilities as string[] | undefined) ?? [],
      capabilitiesUsed: Array.from(
        runtimeState.capabilityUsage.get(entry.id) ?? new Set(),
      ),
      healthDetails: {
        runtimeStarted: runtimeState.started,
        subscriptions: Array.from(runtimeState.subscriptions.values()).filter(
          (s) => s.extensionId === entry.id,
        ).length,
      },
      apiContracts: (manifest?.apis as { exposes?: Array<{ id: string }>; consumes?: Array<{ id: string }> } | undefined) ?? { exposes: [], consumes: [] },
      installed: true,
    }
  })
}

// Inline handler mirroring workspace-handlers.ts lines 2042–2047
function handleExtensionsList(params: {
  listChatonsExtensions: () => { ok: true; extensions: ChatonsExtensionRegistryEntry[] }
  enrichExtensionsWithRuntimeFields: (
    entries: ChatonsExtensionRegistryEntry[],
  ) => ChatonsExtensionRegistryEntry[]
}): { ok: true; extensions: ChatonsExtensionRegistryEntry[] } {
  const result = params.listChatonsExtensions()
  return {
    ...result,
    extensions: params.enrichExtensionsWithRuntimeFields(result.extensions),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extensions:list', () => {
  // -------------------------------------------------------------------------
  // Baseline / ok field propagation
  // -------------------------------------------------------------------------

  describe('baseline', () => {
    it('returns {ok: true}', () => {
      const result = handleExtensionsList({
        listChatonsExtensions: () => ({ ok: true, extensions: [] }),
        enrichExtensionsWithRuntimeFields: (entries) => entries,
      })
      expect(result).toEqual({ ok: true, extensions: [] })
      expect(result.ok).toBe(true)
    })

    it('preserves the ok field from listChatonsExtensions result', () => {
      const result = handleExtensionsList({
        listChatonsExtensions: () => ({ ok: true, extensions: [] }),
        enrichExtensionsWithRuntimeFields: (entries) => entries,
      })
      // The handler spreads listChatonsExtensions result, so ok:true propagates
      expect('ok' in result).toBe(true)
      expect(result.ok).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // Delegation: listChatonsExtensions called with no args
  // -------------------------------------------------------------------------

  describe('delegation to listChatonsExtensions', () => {
    it('calls listChatonsExtensions with no arguments', () => {
      const listSpy = vi.fn(() => ({ ok: true, extensions: [] }))
      handleExtensionsList({
        listChatonsExtensions: listSpy,
        enrichExtensionsWithRuntimeFields: (entries) => entries,
      })
      expect(listSpy).toHaveBeenCalledTimes(1)
      expect(listSpy).toHaveBeenCalledWith() // no args
    })

    it('passes the returned extensions array to enrichExtensionsWithRuntimeFields', () => {
      const entries: ChatonsExtensionRegistryEntry[] = [
        { id: 'ext-a', name: 'A', version: '1', description: '', enabled: true, installSource: 'builtin', health: 'ok' },
        { id: 'ext-b', name: 'B', version: '2', description: '', enabled: false, installSource: 'localPath', health: 'ok' },
      ]
      const enrichSpy = vi.fn((e: ChatonsExtensionRegistryEntry[]) => e)
      const result = handleExtensionsList({
        listChatonsExtensions: () => ({ ok: true, extensions: entries }),
        enrichExtensionsWithRuntimeFields: enrichSpy,
      })
      expect(enrichSpy).toHaveBeenCalledTimes(1)
      expect(enrichSpy).toHaveBeenCalledWith(entries)
      expect(result.extensions).toBe(entries) // identity since spy returned same
    })
  })

  // -------------------------------------------------------------------------
  // Empty extensions array
  // -------------------------------------------------------------------------

  describe('empty extensions array', () => {
    it('handles empty extensions gracefully', () => {
      const result = handleExtensionsList({
        listChatonsExtensions: () => ({ ok: true, extensions: [] }),
        enrichExtensionsWithRuntimeFields: (entries) => entries.map((e) => ({ ...e, installed: true })),
      })
      expect(result.ok).toBe(true)
      expect(result.extensions).toEqual([])
    })

    it('empty array is passed through and enriched (installed: true added)', () => {
      const result = handleExtensionsList({
        listChatonsExtensions: () => ({ ok: true, extensions: [] }),
        enrichExtensionsWithRuntimeFields: (entries) =>
          entries.map((e) => ({ ...e, installed: true })),
      })
      // enricher adds installed: true — empty list stays empty
      expect(result.extensions).toHaveLength(0)
    })
  })

  // -------------------------------------------------------------------------
  // Extension enrichment — installed flag
  // -------------------------------------------------------------------------

  describe('extension enrichment — installed flag', () => {
    it('sets installed: true on enriched entries', () => {
      const entry: ChatonsExtensionRegistryEntry = {
        id: 'ext-test',
        name: 'Test',
        version: '1.0.0',
        description: 'A test extension',
        enabled: true,
        installSource: 'builtin',
        health: 'ok',
      }

      // Use a passthrough enricher that just adds installed: true
      const result = handleExtensionsList({
        listChatonsExtensions: () => ({ ok: true, extensions: [entry] }),
        enrichExtensionsWithRuntimeFields: (entries) =>
          entries.map((e) => ({ ...e, installed: true })),
      })

      expect(result.extensions).toHaveLength(1)
      expect(result.extensions[0].installed).toBe(true)
    })

    it('preserves entry fields (id, name, version, enabled, etc.) in enriched result', () => {
      const entry: ChatonsExtensionRegistryEntry = {
        id: 'ext-preserve',
        name: 'Preserve Me',
        version: '2.1.0',
        description: 'Keep all fields',
        enabled: false,
        installSource: 'git',
        health: 'warning',
        lastRunAt: '2026-01-01T00:00:00Z',
        lastError: 'previous failure',
      }

      // Passthrough enricher — verifies handler passes fields through without dropping any
      const result = handleExtensionsList({
        listChatonsExtensions: () => ({ ok: true, extensions: [entry] }),
        enrichExtensionsWithRuntimeFields: (entries) => entries.map((e) => ({ ...e, installed: true })),
      })

      const enriched = result.extensions[0]
      expect(enriched.id).toBe('ext-preserve')
      expect(enriched.name).toBe('Preserve Me')
      expect(enriched.version).toBe('2.1.0')
      expect(enriched.description).toBe('Keep all fields')
      expect(enriched.enabled).toBe(false)
      expect(enriched.installSource).toBe('git')
      expect(enriched.health).toBe('warning')
      expect(enriched.lastRunAt).toBe('2026-01-01T00:00:00Z')
      expect(enriched.lastError).toBe('previous failure')
    })
  })

  // -------------------------------------------------------------------------
  // Extension enrichment — manifest name override
  // -------------------------------------------------------------------------

  describe('extension enrichment — manifest name override', () => {
    it('overrides name with manifest name when manifest provides one', () => {
      const runtimeState = {
        manifests: new Map([['ext-manifest-name', { name: 'Manifest Display Name' }]]),
        capabilityUsage: new Map<string, Set<string>>(),
        subscriptions: new Map<string, { extensionId: string; topic: string }>(),
        started: true,
      }

      const entry: ChatonsExtensionRegistryEntry = {
        id: 'ext-manifest-name',
        name: 'Registry Name',
        version: '1',
        description: '',
        enabled: true,
        installSource: 'builtin',
        health: 'ok',
      }

      const result = handleExtensionsList({
        listChatonsExtensions: () => ({ ok: true, extensions: [entry] }),
        enrichExtensionsWithRuntimeFields: (entries) =>
          enrichExtensionsWithRuntimeFields(entries, runtimeState),
      })

      expect(result.extensions[0].name).toBe('Manifest Display Name')
    })

    it('keeps registry name when manifest has no name field', () => {
      const runtimeState = {
        manifests: new Map([['ext-no-name', { id: 'ext-no-name', version: '1.0.0' }]]),
        capabilityUsage: new Map<string, Set<string>>(),
        subscriptions: new Map<string, { extensionId: string; topic: string }>(),
        started: true,
      }

      const entry: ChatonsExtensionRegistryEntry = {
        id: 'ext-no-name',
        name: 'Registry Name Stays',
        version: '1',
        description: '',
        enabled: true,
        installSource: 'builtin',
        health: 'ok',
      }

      const result = handleExtensionsList({
        listChatonsExtensions: () => ({ ok: true, extensions: [entry] }),
        enrichExtensionsWithRuntimeFields: (entries) =>
          enrichExtensionsWithRuntimeFields(entries, runtimeState),
      })

      expect(result.extensions[0].name).toBe('Registry Name Stays')
    })

    it('trims whitespace from manifest name before using it', () => {
      const runtimeState = {
        manifests: new Map([['ext-trim', { name: '  Trimmed Name  ' }]]),
        capabilityUsage: new Map<string, Set<string>>(),
        subscriptions: new Map<string, { extensionId: string; topic: string }>(),
        started: true,
      }

      const entry: ChatonsExtensionRegistryEntry = {
        id: 'ext-trim',
        name: 'Original',
        version: '1',
        description: '',
        enabled: true,
        installSource: 'builtin',
        health: 'ok',
      }

      const result = handleExtensionsList({
        listChatonsExtensions: () => ({ ok: true, extensions: [entry] }),
        enrichExtensionsWithRuntimeFields: (entries) =>
          enrichExtensionsWithRuntimeFields(entries, runtimeState),
      })

      expect(result.extensions[0].name).toBe('Trimmed Name')
    })
  })

  // -------------------------------------------------------------------------
  // Extension enrichment — manifest kind=channel
  // -------------------------------------------------------------------------

  describe('extension enrichment — kind: channel', () => {
    it('adds kind: channel to config when manifest declares it', () => {
      const runtimeState = {
        manifests: new Map([['ext-channel', { kind: 'channel' }]]),
        capabilityUsage: new Map<string, Set<string>>(),
        subscriptions: new Map<string, { extensionId: string; topic: string }>(),
        started: true,
      }

      const entry: ChatonsExtensionRegistryEntry = {
        id: 'ext-channel',
        name: 'Channel Ext',
        version: '1',
        description: '',
        enabled: true,
        installSource: 'builtin',
        health: 'ok',
        config: {},
      }

      const result = handleExtensionsList({
        listChatonsExtensions: () => ({ ok: true, extensions: [entry] }),
        enrichExtensionsWithRuntimeFields: (entries) =>
          enrichExtensionsWithRuntimeFields(entries, runtimeState),
      })

      expect(result.extensions[0].config).toHaveProperty('kind', 'channel')
    })

    it('does NOT add kind when manifest does not declare it', () => {
      const runtimeState = {
        manifests: new Map([['ext-normal', { id: 'ext-normal' }]]),
        capabilityUsage: new Map<string, Set<string>>(),
        subscriptions: new Map<string, { extensionId: string; topic: string }>(),
        started: true,
      }

      const entry: ChatonsExtensionRegistryEntry = {
        id: 'ext-normal',
        name: 'Normal Ext',
        version: '1',
        description: '',
        enabled: true,
        installSource: 'builtin',
        health: 'ok',
        config: {},
      }

      const result = handleExtensionsList({
        listChatonsExtensions: () => ({ ok: true, extensions: [entry] }),
        enrichExtensionsWithRuntimeFields: (entries) =>
          enrichExtensionsWithRuntimeFields(entries, runtimeState),
      })

      expect(result.extensions[0].config).not.toHaveProperty('kind')
    })
  })

  // -------------------------------------------------------------------------
  // Extension enrichment — capabilities
  // -------------------------------------------------------------------------

  describe('extension enrichment — capabilities', () => {
    it('sets capabilitiesDeclared from manifest', () => {
      const runtimeState = {
        manifests: new Map([['ext-caps', { capabilities: ['read', 'write'] }]]),
        capabilityUsage: new Map<string, Set<string>>(),
        subscriptions: new Map<string, { extensionId: string; topic: string }>(),
        started: true,
      }

      const entry: ChatonsExtensionRegistryEntry = {
        id: 'ext-caps',
        name: 'Caps Ext',
        version: '1',
        description: '',
        enabled: true,
        installSource: 'builtin',
        health: 'ok',
      }

      const result = handleExtensionsList({
        listChatonsExtensions: () => ({ ok: true, extensions: [entry] }),
        enrichExtensionsWithRuntimeFields: (entries) =>
          enrichExtensionsWithRuntimeFields(entries, runtimeState),
      })

      expect(result.extensions[0].capabilitiesDeclared).toEqual(['read', 'write'])
    })

    it('sets capabilitiesUsed from runtimeState capabilityUsage map', () => {
      const runtimeState = {
        manifests: new Map([['ext-used', {}]]),
        capabilityUsage: new Map<string, Set<string>>([
          ['ext-used', new Set(['bash', 'read'])],
        ]),
        subscriptions: new Map<string, { extensionId: string; topic: string }>(),
        started: true,
      }

      const entry: ChatonsExtensionRegistryEntry = {
        id: 'ext-used',
        name: 'Used Ext',
        version: '1',
        description: '',
        enabled: true,
        installSource: 'builtin',
        health: 'ok',
      }

      const result = handleExtensionsList({
        listChatonsExtensions: () => ({ ok: true, extensions: [entry] }),
        enrichExtensionsWithRuntimeFields: (entries) =>
          enrichExtensionsWithRuntimeFields(entries, runtimeState),
      })

      expect(result.extensions[0].capabilitiesUsed).toEqual(['bash', 'read'])
    })

    it('capabilitiesUsed is empty array when no usage recorded', () => {
      const runtimeState = {
        manifests: new Map([['ext-no-use', {}]]),
        capabilityUsage: new Map<string, Set<string>>(),
        subscriptions: new Map<string, { extensionId: string; topic: string }>(),
        started: true,
      }

      const entry: ChatonsExtensionRegistryEntry = {
        id: 'ext-no-use',
        name: 'No Use Ext',
        version: '1',
        description: '',
        enabled: true,
        installSource: 'builtin',
        health: 'ok',
      }

      const result = handleExtensionsList({
        listChatonsExtensions: () => ({ ok: true, extensions: [entry] }),
        enrichExtensionsWithRuntimeFields: (entries) =>
          enrichExtensionsWithRuntimeFields(entries, runtimeState),
      })

      expect(result.extensions[0].capabilitiesUsed).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // Extension enrichment — healthDetails
  // -------------------------------------------------------------------------

  describe('extension enrichment — healthDetails', () => {
    it('sets healthDetails.runtimeStarted from runtimeState.started', () => {
      const runtimeState = {
        manifests: new Map(),
        capabilityUsage: new Map<string, Set<string>>(),
        subscriptions: new Map<string, { extensionId: string; topic: string }>(),
        started: true,
      }

      const entry: ChatonsExtensionRegistryEntry = {
        id: 'ext-hd',
        name: 'HD Ext',
        version: '1',
        description: '',
        enabled: true,
        installSource: 'builtin',
        health: 'ok',
      }

      const result = handleExtensionsList({
        listChatonsExtensions: () => ({ ok: true, extensions: [entry] }),
        enrichExtensionsWithRuntimeFields: (entries) =>
          enrichExtensionsWithRuntimeFields(entries, runtimeState),
      })

      expect(result.extensions[0].healthDetails).toHaveProperty('runtimeStarted', true)
    })

    it('healthDetails.subscriptions counts matching subscriptions for this extension', () => {
      const runtimeState = {
        manifests: new Map(),
        capabilityUsage: new Map<string, Set<string>>(),
        subscriptions: new Map<string, { extensionId: string; topic: string }>([
          ['sub-1', { extensionId: 'ext-multi-sub', topic: 'onMessage' }],
          ['sub-2', { extensionId: 'ext-multi-sub', topic: 'onInstall' }],
          ['sub-3', { extensionId: 'ext-other', topic: 'onMessage' }],
        ]),
        started: false,
      }

      const entry: ChatonsExtensionRegistryEntry = {
        id: 'ext-multi-sub',
        name: 'Multi Sub',
        version: '1',
        description: '',
        enabled: true,
        installSource: 'builtin',
        health: 'ok',
      }

      const result = handleExtensionsList({
        listChatonsExtensions: () => ({ ok: true, extensions: [entry] }),
        enrichExtensionsWithRuntimeFields: (entries) =>
          enrichExtensionsWithRuntimeFields(entries, runtimeState),
      })

      expect(result.extensions[0].healthDetails).toHaveProperty('subscriptions', 2)
    })
  })

  // -------------------------------------------------------------------------
  // Extension enrichment — apiContracts
  // -------------------------------------------------------------------------

  describe('extension enrichment — apiContracts', () => {
    it('sets apiContracts from manifest', () => {
      const runtimeState = {
        manifests: new Map([['ext-apis', { apis: { exposes: [{ id: 'my-api' }], consumes: [{ id: 'other-api' }] } }]]),
        capabilityUsage: new Map<string, Set<string>>(),
        subscriptions: new Map<string, { extensionId: string; topic: string }>(),
        started: true,
      }

      const entry: ChatonsExtensionRegistryEntry = {
        id: 'ext-apis',
        name: 'APIs Ext',
        version: '1',
        description: '',
        enabled: true,
        installSource: 'builtin',
        health: 'ok',
      }

      const result = handleExtensionsList({
        listChatonsExtensions: () => ({ ok: true, extensions: [entry] }),
        enrichExtensionsWithRuntimeFields: (entries) =>
          enrichExtensionsWithRuntimeFields(entries, runtimeState),
      })

      expect(result.extensions[0].apiContracts).toEqual({ exposes: [{ id: 'my-api' }], consumes: [{ id: 'other-api' }] })
    })

    it('defaults apiContracts to {exposes: [], consumes: []} when no manifest apis', () => {
      const runtimeState = {
        manifests: new Map([['ext-no-apis', {}]]),
        capabilityUsage: new Map<string, Set<string>>(),
        subscriptions: new Map<string, { extensionId: string; topic: string }>(),
        started: true,
      }

      const entry: ChatonsExtensionRegistryEntry = {
        id: 'ext-no-apis',
        name: 'No APIs',
        version: '1',
        description: '',
        enabled: true,
        installSource: 'builtin',
        health: 'ok',
      }

      const result = handleExtensionsList({
        listChatonsExtensions: () => ({ ok: true, extensions: [entry] }),
        enrichExtensionsWithRuntimeFields: (entries) =>
          enrichExtensionsWithRuntimeFields(entries, runtimeState),
      })

      expect(result.extensions[0].apiContracts).toEqual({ exposes: [], consumes: [] })
    })
  })

  // -------------------------------------------------------------------------
  // Multiple extensions
  // -------------------------------------------------------------------------

  describe('multiple extensions', () => {
    it('enriches all extensions independently', () => {
      const runtimeState = {
        manifests: new Map([
          ['ext-a', { name: 'A Manifest' }],
          ['ext-b', { kind: 'channel' }],
        ]),
        capabilityUsage: new Map<string, Set<string>>([
          ['ext-a', new Set(['read'])],
        ]),
        subscriptions: new Map<string, { extensionId: string; topic: string }>(),
        started: true,
      }

      const entries: ChatonsExtensionRegistryEntry[] = [
        { id: 'ext-a', name: 'A Registry', version: '1', description: '', enabled: true, installSource: 'builtin', health: 'ok' },
        { id: 'ext-b', name: 'B Registry', version: '2', description: '', enabled: false, installSource: 'git', health: 'warning' },
      ]

      const result = handleExtensionsList({
        listChatonsExtensions: () => ({ ok: true, extensions: entries }),
        enrichExtensionsWithRuntimeFields: (ents) =>
          enrichExtensionsWithRuntimeFields(ents, runtimeState),
      })

      expect(result.extensions).toHaveLength(2)
      expect(result.extensions[0].name).toBe('A Manifest')
      expect(result.extensions[0].capabilitiesUsed).toEqual(['read'])
      expect(result.extensions[1].name).toBe('B Registry')
      expect(result.extensions[1].config).toHaveProperty('kind', 'channel')
    })
  })

  // -------------------------------------------------------------------------
  // Error propagation
  // -------------------------------------------------------------------------

  describe('error propagation', () => {
    it('rethrows when enrichExtensionsWithRuntimeFields throws', () => {
      const boom = new Error('enrich failed')
      expect(() =>
        handleExtensionsList({
          listChatonsExtensions: () => ({ ok: true, extensions: [] }),
          enrichExtensionsWithRuntimeFields: () => { throw boom },
        }),
      ).toThrow('enrich failed')
    })

    it('rethrows when listChatonsExtensions throws', () => {
      const boom = new Error('registry read failed')
      expect(() =>
        handleExtensionsList({
          listChatonsExtensions: () => { throw boom },
          enrichExtensionsWithRuntimeFields: (entries) => entries,
        }),
      ).toThrow('registry read failed')
    })
  })
})
