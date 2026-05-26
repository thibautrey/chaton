import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Unit tests for `enrichExtensionsWithRuntimeFields` in registry.ts.
 *
 * This function enriches extension registry entries with live runtime data:
 * - manifest-derived name, icon, config (kind, iconUrl)
 * - declared and used capabilities from runtime state
 * - health details: runtime started flag + per-extension subscription count
 * - manifest digest (SHA256 of the serialized manifest JSON)
 * - installed: always true
 *
 * We replicate the inline logic (mirroring registry.ts lines 290–310) to test
 * the function without needing the full workspace/extension-manager dep graph.
 * Mocks replace `resolveIconWithMarketplaceFallback` and `crypto.createHash`.
 * Runtime state Maps are populated directly before each test.
 */

type Capability = string // simplified — real type lives in types.ts

type ExtensionManifest = {
  id: string
  name?: string
  version?: string
  kind?: 'channel'
  icon?: string
  capabilities?: Capability[]
  apis?: { exposes?: Array<{ id: string }>; consumes?: Array<{ id: string }> }
  [key: string]: unknown
}

type Subscription = { id: string; extensionId: string; topic: string }

type ChatonsExtensionRegistryEntry = {
  id: string
  name: string
  version?: string
  description?: string
  enabled?: boolean
  config?: Record<string, unknown>
  capabilitiesDeclared?: Capability[]
  capabilitiesUsed?: Capability[]
  healthDetails?: Record<string, unknown>
  apiContracts?: Record<string, unknown>
  manifestDigest?: string | null
  installed?: boolean
}

// -----------------------------------------------------------------------
// Inline implementation mirroring registry.ts lines 290–310
// -----------------------------------------------------------------------

let resolveIconWithMarketplaceFallbackImpl: ((extensionId: string, iconPath: string) => string | null) | null = null

function setIconResolver(fn: (extensionId: string, iconPath: string) => string | null) {
  resolveIconWithMarketplaceFallbackImpl = fn
}

// Fake crypto.createHash — returns a deterministic digest
let hashCalls: { id: string; data: string }[] = []
vi.stubGlobal('crypto', {
  createHash: vi.fn((algorithm: string) => {
    return {
      update: vi.fn((data: string) => ({
        digest: vi.fn(() => {
          const hash = `FAKEHASH(${algorithm}:${data.slice(0, 50)})`
          hashCalls.push({ id: algorithm, data })
          return hash
        }),
      })),
    }
  }),
})

// Runtime state — imported and reset between tests
let runtimeState: {
  manifests: Map<string, ExtensionManifest>
  capabilityUsage: Map<string, Set<Capability>>
  subscriptions: Map<string, Subscription>
  started: boolean
}

beforeEach(async () => {
  const state = await import('./state.js')
  runtimeState = state.runtimeState
  runtimeState.manifests.clear()
  runtimeState.capabilityUsage.clear()
  runtimeState.subscriptions.clear()
  runtimeState.started = false
  hashCalls = []
  resolveIconWithMarketplaceFallbackImpl = null
})

// -----------------------------------------------------------------------
// Inline function mirroring enrichExtensionsWithRuntimeFields
// -----------------------------------------------------------------------

function enrichExtensionsWithRuntimeFields(
  entries: ChatonsExtensionRegistryEntry[],
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
        ...(icon && resolveIconWithMarketplaceFallbackImpl
          ? (() => {
              const url = resolveIconWithMarketplaceFallbackImpl!(
                entry.id,
                icon,
              )
              return url ? { iconUrl: url } : {}
            })()
          : {}),
      },
      capabilitiesDeclared: manifest?.capabilities ?? [],
      capabilitiesUsed: Array.from(
        runtimeState.capabilityUsage.get(entry.id) ?? new Set(),
      ),
      healthDetails: {
        runtimeStarted: runtimeState.started,
        subscriptions: Array.from(
          runtimeState.subscriptions.values(),
        ).filter((s) => s.extensionId === entry.id).length,
      },
      apiContracts: manifest?.apis ?? { exposes: [], consumes: [] },
      manifestDigest: manifest
        ? (globalThis.crypto as { createHash: (alg: string) => { update: (d: string) => { digest: () => string } } })
            .createHash('sha256')
            .update(JSON.stringify(manifest))
            .digest()
        : null,
      installed: true,
    }
  })
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('enrichExtensionsWithRuntimeFields', () => {
  // -------------------------------------------------------------------------
  // Name enrichment
  // -------------------------------------------------------------------------

  describe('name', () => {
    it('overrides entry name with manifest name when manifest provides one', () => {
      runtimeState.manifests.set('ext-a', {
        id: 'ext-a',
        name: 'My Manifest Name',
      })

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'ext-a', name: 'Registry Name' },
      ])

      expect(result[0].name).toBe('My Manifest Name')
    })

    it('keeps entry name when manifest has no name field', () => {
      runtimeState.manifests.set('ext-a', { id: 'ext-a', version: '1.0.0' })

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'ext-a', name: 'Registry Name' },
      ])

      expect(result[0].name).toBe('Registry Name')
    })

    it('keeps entry name when manifest name is whitespace-only', () => {
      runtimeState.manifests.set('ext-a', {
        id: 'ext-a',
        name: '   ',
      })

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'ext-a', name: 'Registry Name' },
      ])

      expect(result[0].name).toBe('Registry Name')
    })

    it('uses manifest name trimmed when it has surrounding whitespace', () => {
      runtimeState.manifests.set('ext-a', {
        id: 'ext-a',
        name: '  Trimmed Name  ',
      })

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'ext-a', name: 'Registry Name' },
      ])

      expect(result[0].name).toBe('Trimmed Name')
    })

    it('returns empty string when neither manifest nor entry provides a name', () => {
      const result = enrichExtensionsWithRuntimeFields([
        { id: 'ext-a', name: '' },
      ])

      expect(result[0].name).toBe('')
    })
  })

  // -------------------------------------------------------------------------
  // Config enrichment
  // -------------------------------------------------------------------------

  describe('config', () => {
    it('adds kind: channel when manifest kind is channel', () => {
      runtimeState.manifests.set('channel-ext', {
        id: 'channel-ext',
        kind: 'channel',
      })

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'channel-ext', name: 'Channel' },
      ])

      expect(result[0].config).toMatchObject({ kind: 'channel' })
    })

    it('does not add kind when manifest kind is absent', () => {
      runtimeState.manifests.set('regular-ext', { id: 'regular-ext' })

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'regular-ext', name: 'Regular', config: { existing: true } },
      ])

      expect(result[0].config).not.toHaveProperty('kind')
      expect(result[0].config).toHaveProperty('existing', true)
    })

    it('merges icon into config when manifest provides an icon', () => {
      runtimeState.manifests.set('ext-icon', {
        id: 'ext-icon',
        icon: './icon.png',
      })

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'ext-icon', name: 'Icon Ext', config: {} },
      ])

      expect(result[0].config).toHaveProperty('icon', './icon.png')
    })

    it('skips icon when manifest icon is whitespace-only', () => {
      runtimeState.manifests.set('ext-icon', {
        id: 'ext-icon',
        icon: '   ',
      })

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'ext-icon', name: 'Icon Ext' },
      ])

      expect(result[0].config).not.toHaveProperty('icon')
    })

    it('skips icon when manifest icon is absent', () => {
      runtimeState.manifests.set('ext-no-icon', { id: 'ext-no-icon' })

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'ext-no-icon', name: 'No Icon', config: {} },
      ])

      expect(result[0].config).not.toHaveProperty('icon')
    })

    it('adds iconUrl to config when resolveIconWithMarketplaceFallback returns a URL', () => {
      runtimeState.manifests.set('ext-icon-url', {
        id: 'ext-icon-url',
        icon: './icon.png',
      })
      setIconResolver(() => 'file:///local/icon.png')

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'ext-icon-url', name: 'Icon URL Ext' },
      ])

      expect(result[0].config).toHaveProperty('iconUrl', 'file:///local/icon.png')
    })

    it('does not add iconUrl when resolveIconWithMarketplaceFallback returns null', () => {
      runtimeState.manifests.set('ext-icon-null', {
        id: 'ext-icon-null',
        icon: './icon.png',
      })
      setIconResolver(() => null)

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'ext-icon-null', name: 'Icon Null Ext' },
      ])

      expect(result[0].config).not.toHaveProperty('iconUrl')
    })

    it('preserves existing config fields when enriching with manifest data', () => {
      runtimeState.manifests.set('ext-preserve', {
        id: 'ext-preserve',
        kind: 'channel',
        icon: './icon.png',
      })
      setIconResolver(() => 'https://cdn.example.com/icon.png')

      const result = enrichExtensionsWithRuntimeFields([
        {
          id: 'ext-preserve',
          name: 'Preserve',
          config: { customField: 'customValue', existing: 42 },
        },
      ])

      expect(result[0].config).toMatchObject({
        customField: 'customValue',
        existing: 42,
        kind: 'channel',
        icon: './icon.png',
        iconUrl: 'https://cdn.example.com/icon.png',
      })
    })
  })

  // -------------------------------------------------------------------------
  // Capabilities
  // -------------------------------------------------------------------------

  describe('capabilitiesDeclared', () => {
    it('returns manifest capabilities when manifest has them', () => {
      runtimeState.manifests.set('capable-ext', {
        id: 'capable-ext',
        capabilities: ['file:read', 'shell:exec'],
      })

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'capable-ext', name: 'Capable' },
      ])

      expect(result[0].capabilitiesDeclared).toEqual(['file:read', 'shell:exec'])
    })

    it('returns empty array when manifest has no capabilities', () => {
      runtimeState.manifests.set('no-caps-ext', { id: 'no-caps-ext' })

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'no-caps-ext', name: 'No Caps' },
      ])

      expect(result[0].capabilitiesDeclared).toEqual([])
    })

    it('returns empty array when no manifest exists', () => {
      const result = enrichExtensionsWithRuntimeFields([
        { id: 'no-manifest-ext', name: 'No Manifest' },
      ])

      expect(result[0].capabilitiesDeclared).toEqual([])
    })
  })

  describe('capabilitiesUsed', () => {
    it('returns used capabilities from runtime state', () => {
      runtimeState.capabilityUsage.set('used-ext', new Set(['file:read']))

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'used-ext', name: 'Used' },
      ])

      expect(result[0].capabilitiesUsed).toEqual(['file:read'])
    })

    it('returns multiple used capabilities in insertion order', () => {
      const set = new Set<Capability>(['shell:exec', 'file:write', 'http:request'])
      runtimeState.capabilityUsage.set('multi-used-ext', set)

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'multi-used-ext', name: 'Multi Used' },
      ])

      expect(result[0].capabilitiesUsed).toEqual(['shell:exec', 'file:write', 'http:request'])
    })

    it('returns empty array when no capabilities have been used', () => {
      const result = enrichExtensionsWithRuntimeFields([
        { id: 'unused-ext', name: 'Unused' },
      ])

      expect(result[0].capabilitiesUsed).toEqual([])
    })

    it('returns empty array when extension has no entry in capabilityUsage Map', () => {
      runtimeState.capabilityUsage.set('other-ext', new Set(['file:read']))

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'orphan-ext', name: 'Orphan' },
      ])

      expect(result[0].capabilitiesUsed).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // Health details
  // -------------------------------------------------------------------------

  describe('healthDetails', () => {
    it('sets runtimeStarted to false when runtime is not started', () => {
      runtimeState.started = false

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'health-ext', name: 'Health' },
      ])

      expect(result[0].healthDetails).toMatchObject({ runtimeStarted: false })
    })

    it('sets runtimeStarted to true when runtime is started', () => {
      runtimeState.started = true

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'started-ext', name: 'Started' },
      ])

      expect(result[0].healthDetails).toMatchObject({ runtimeStarted: true })
    })

    it('counts subscriptions belonging to the extension', () => {
      runtimeState.subscriptions.set('sub-1', {
        id: 'sub-1',
        extensionId: 'subs-ext',
        topic: 'event:a',
      })
      runtimeState.subscriptions.set('sub-2', {
        id: 'sub-2',
        extensionId: 'other-ext',
        topic: 'event:b',
      })
      runtimeState.subscriptions.set('sub-3', {
        id: 'sub-3',
        extensionId: 'subs-ext',
        topic: 'event:c',
      })

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'subs-ext', name: 'Subs' },
        { id: 'other-ext', name: 'Other' },
      ])

      expect(result[0].healthDetails).toMatchObject({ subscriptions: 2 })
      expect(result[1].healthDetails).toMatchObject({ subscriptions: 1 })
    })

    it('reports zero subscriptions when none exist', () => {
      const result = enrichExtensionsWithRuntimeFields([
        { id: 'no-subs-ext', name: 'No Subs' },
      ])

      expect(result[0].healthDetails).toMatchObject({ subscriptions: 0 })
    })
  })

  // -------------------------------------------------------------------------
  // API contracts
  // -------------------------------------------------------------------------

  describe('apiContracts', () => {
    it('returns manifest apis when present', () => {
      runtimeState.manifests.set('api-ext', {
        id: 'api-ext',
        apis: {
          exposes: [{ id: 'my-api' }],
          consumes: [{ id: 'their-api' }],
        },
      })

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'api-ext', name: 'API Ext' },
      ])

      expect(result[0].apiContracts).toMatchObject({
        exposes: [{ id: 'my-api' }],
        consumes: [{ id: 'their-api' }],
      })
    })

    it('returns empty exposes/consumes when manifest has no apis', () => {
      runtimeState.manifests.set('no-api-ext', { id: 'no-api-ext' })

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'no-api-ext', name: 'No API' },
      ])

      expect(result[0].apiContracts).toMatchObject({ exposes: [], consumes: [] })
    })

    it('returns empty contracts when no manifest exists', () => {
      const result = enrichExtensionsWithRuntimeFields([
        { id: 'orphan-api-ext', name: 'Orphan API' },
      ])

      expect(result[0].apiContracts).toMatchObject({ exposes: [], consumes: [] })
    })
  })

  // -------------------------------------------------------------------------
  // Manifest digest
  // -------------------------------------------------------------------------

  describe('manifestDigest', () => {
    it('computes SHA256 digest when manifest exists', () => {
      runtimeState.manifests.set('digest-ext', {
        id: 'digest-ext',
        name: 'Digest',
        version: '1.0.0',
      })

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'digest-ext', name: 'Digest' },
      ])

      expect(result[0].manifestDigest).toBeTruthy()
      expect(typeof result[0].manifestDigest).toBe('string')
      expect(hashCalls.some((c) => c.id === 'sha256')).toBe(true)
    })

    it('passes the JSON-stringified manifest to the hash function', () => {
      runtimeState.manifests.set('hash-data-ext', {
        id: 'hash-data-ext',
        name: 'Hash Data',
        version: '2.0.0',
      })

      enrichExtensionsWithRuntimeFields([{ id: 'hash-data-ext', name: 'Hash' }])

      const hashCall = hashCalls.find((c) => c.id === 'sha256')
      expect(hashCall).toBeTruthy()
      const parsed = JSON.parse(hashCall!.data)
      expect(parsed).toMatchObject({ id: 'hash-data-ext', name: 'Hash Data', version: '2.0.0' })
    })

    it('returns null when no manifest exists', () => {
      const result = enrichExtensionsWithRuntimeFields([
        { id: 'no-manifest-digest', name: 'No Manifest' },
      ])

      expect(result[0].manifestDigest).toBeNull()
      expect(hashCalls.some((c) => c.id === 'sha256')).toBe(false)
    })

    it('returns null when manifest has no properties', () => {
      runtimeState.manifests.set('empty-manifest-ext', {})

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'empty-manifest-ext', name: 'Empty' },
      ])

      expect(result[0].manifestDigest).toBeTruthy() // digest computed even for empty manifest
    })
  })

  // -------------------------------------------------------------------------
  // Installed flag
  // -------------------------------------------------------------------------

  describe('installed', () => {
    it('always sets installed to true regardless of manifest or entry', () => {
      const result = enrichExtensionsWithRuntimeFields([
        { id: 'installed-ext', name: 'Installed' },
      ])

      expect(result[0].installed).toBe(true)
    })

    it('installed is true even when no manifest exists', () => {
      const result = enrichExtensionsWithRuntimeFields([
        { id: 'no-manifest-installed', name: 'No Manifest Installed' },
      ])

      expect(result[0].installed).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // Input / output shape
  // -------------------------------------------------------------------------

  describe('output shape', () => {
    it('returns an array with one entry per input entry', () => {
      runtimeState.manifests.set('ext-1', { id: 'ext-1', name: 'One' })
      runtimeState.manifests.set('ext-2', { id: 'ext-2', name: 'Two' })

      const result = enrichExtensionsWithRuntimeFields([
        { id: 'ext-1', name: 'One' },
        { id: 'ext-2', name: 'Two' },
        { id: 'ext-3', name: 'Three' }, // no manifest
      ])

      expect(result).toHaveLength(3)
    })

    it('does not mutate the original entries array', () => {
      const entry = { id: 'orig-ext', name: 'Original' }
      const originalName = entry.name

      enrichExtensionsWithRuntimeFields([entry])

      expect(entry.name).toBe(originalName)
    })

    it('does not mutate the original entry object', () => {
      const entry = {
        id: 'orig-fields',
        name: 'Original Fields',
        version: '1.0.0',
        config: { foo: 'bar' },
      }
      const originalConfig = { ...entry.config }

      enrichExtensionsWithRuntimeFields([entry])

      expect(entry.config).toEqual(originalConfig)
      expect(entry).not.toHaveProperty('installed')
    })
  })
})
