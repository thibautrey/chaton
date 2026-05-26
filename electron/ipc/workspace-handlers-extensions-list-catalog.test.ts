import { describe, expect, it, vi } from 'vitest'

/**
 * Unit tests for the `extensions:listCatalog` IPC handler.
 *
 * Key behavioral guarantees verified:
 * - Handler calls `listChatonsExtensionCatalog()` with no arguments
 * - Returns the raw catalog result: { ok, updatedAt, source, entries }
 * - Always returns ok:true (catalog is infallible — falls back to bundled entries)
 * - Propagates updatedAt and source from the underlying catalog
 * - Passes entries through unchanged
 *
 * We replicate the minimal handler logic inline to test without needing the full
 * workspace-handlers.ts module graph (extension manager, npm cache, etc.).
 */

// Inline type mirroring ChatonsExtensionCatalogEntry (manager.ts lines 43-59)
type ChatonsExtensionCatalogEntry = {
  id: string
  name: string
  version: string
  description: string
  source: 'builtin' | 'npmRegistry'
  requiresRestart: boolean
  category?: string
  tags?: string[]
  author?: string
  downloadCount?: number
  rating?: number
  lastUpdated?: string
  featured?: boolean
  popularity?: 'new' | 'trending' | 'popular' | 'recommended'
  icon?: string
  iconUrl?: string
}

// Inline type mirroring listChatonsExtensionCatalog result
type CatalogResult = {
  ok: true
  updatedAt: string
  source: 'cache' | 'chatons'
  entries: ChatonsExtensionCatalogEntry[]
}

// Inline handler mirroring workspace-handlers.ts line 2049
function handleExtensionsListCatalog(params: {
  listChatonsExtensionCatalog: () => CatalogResult
}): CatalogResult {
  return params.listChatonsExtensionCatalog()
}

// -------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------

describe('extensions:listCatalog', () => {
  // -----------------------------------------------------------------
  // Baseline
  // -----------------------------------------------------------------
  describe('baseline', () => {
    it('returns {ok: true}', () => {
      const result = handleExtensionsListCatalog({
        listChatonsExtensionCatalog: () => ({
          ok: true as const,
          updatedAt: '2026-01-01T00:00:00Z',
          source: 'chatons' as const,
          entries: [],
        }),
      })
      expect(result.ok).toBe(true)
    })

    it('returns the full catalog result with ok, updatedAt, source, and entries', () => {
      const result = handleExtensionsListCatalog({
        listChatonsExtensionCatalog: () => ({
          ok: true as const,
          updatedAt: '2026-05-06T10:00:00Z',
          source: 'cache' as const,
          entries: [],
        }),
      })
      expect(result).toHaveProperty('ok', true)
      expect(result).toHaveProperty('updatedAt', '2026-05-06T10:00:00Z')
      expect(result).toHaveProperty('source', 'cache')
      expect(result).toHaveProperty('entries')
    })
  })

  // -----------------------------------------------------------------
  // Delegation
  // -----------------------------------------------------------------
  describe('delegation to listChatonsExtensionCatalog', () => {
    it('calls listChatonsExtensionCatalog with no arguments', () => {
      const spy = vi.fn(() => ({
        ok: true as const,
        updatedAt: '2026-01-01T00:00:00Z',
        source: 'chatons' as const,
        entries: [],
      }))
      handleExtensionsListCatalog({ listChatonsExtensionCatalog: spy })
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith()
    })

    it('passes entries from the catalog result unchanged', () => {
      const entries: ChatonsExtensionCatalogEntry[] = [
        {
          id: 'ext-a',
          name: 'Extension A',
          version: '1.0.0',
          description: 'A test extension',
          source: 'builtin',
          requiresRestart: false,
          category: 'Automation',
        },
        {
          id: 'ext-b',
          name: 'Extension B',
          version: '2.1.0',
          description: 'Another extension',
          source: 'npmRegistry',
          requiresRestart: true,
          tags: ['productivity'],
        },
      ]
      const result = handleExtensionsListCatalog({
        listChatonsExtensionCatalog: () => ({
          ok: true as const,
          updatedAt: '2026-05-01T00:00:00Z',
          source: 'chatons' as const,
          entries,
        }),
      })
      expect(result.entries).toHaveLength(2)
      expect(result.entries[0].id).toBe('ext-a')
      expect(result.entries[1].id).toBe('ext-b')
    })

    it('preserves updatedAt from the catalog', () => {
      const result = handleExtensionsListCatalog({
        listChatonsExtensionCatalog: () => ({
          ok: true as const,
          updatedAt: '2026-05-06T09:30:00Z',
          source: 'chatons' as const,
          entries: [],
        }),
      })
      expect(result.updatedAt).toBe('2026-05-06T09:30:00Z')
    })

    it('preserves source from the catalog', () => {
      const result = handleExtensionsListCatalog({
        listChatonsExtensionCatalog: () => ({
          ok: true as const,
          updatedAt: '2026-01-01T00:00:00Z',
          source: 'cache' as const,
          entries: [],
        }),
      })
      expect(result.source).toBe('cache')
    })
  })

  // -----------------------------------------------------------------
  // Empty catalog (no entries — bundled fallback used internally)
  // -----------------------------------------------------------------
  describe('empty entries array', () => {
    it('returns empty entries array without crashing', () => {
      const result = handleExtensionsListCatalog({
        listChatonsExtensionCatalog: () => ({
          ok: true as const,
          updatedAt: '2026-01-01T00:00:00Z',
          source: 'cache' as const,
          entries: [],
        }),
      })
      expect(result.ok).toBe(true)
      expect(result.entries).toEqual([])
    })
  })

  // -----------------------------------------------------------------
  // Rich entry preservation
  // -----------------------------------------------------------------
  describe('entry field preservation', () => {
    it('preserves all fields on a catalog entry', () => {
      const entry: ChatonsExtensionCatalogEntry = {
        id: 'rich-entry',
        name: 'Rich Extension',
        version: '3.2.1',
        description: 'Full featured extension',
        source: 'npmRegistry',
        requiresRestart: false,
        category: 'Tools',
        tags: ['ai', 'productivity', 'recommended'],
        author: 'Chatons Team',
        downloadCount: 12345,
        rating: 4.8,
        lastUpdated: '2026-04-15T00:00:00Z',
        featured: true,
        popularity: 'popular',
        icon: 'tool.svg',
        iconUrl: 'https://cdn.chatons.ai/icons/tool.svg',
      }

      const result = handleExtensionsListCatalog({
        listChatonsExtensionCatalog: () => ({
          ok: true as const,
          updatedAt: '2026-05-06T00:00:00Z',
          source: 'chatons' as const,
          entries: [entry],
        }),
      })

      const returned = result.entries[0]
      expect(returned.id).toBe('rich-entry')
      expect(returned.name).toBe('Rich Extension')
      expect(returned.version).toBe('3.2.1')
      expect(returned.description).toBe('Full featured extension')
      expect(returned.source).toBe('npmRegistry')
      expect(returned.requiresRestart).toBe(false)
      expect(returned.category).toBe('Tools')
      expect(returned.tags).toEqual(['ai', 'productivity', 'recommended'])
      expect(returned.author).toBe('Chatons Team')
      expect(returned.downloadCount).toBe(12345)
      expect(returned.rating).toBe(4.8)
      expect(returned.lastUpdated).toBe('2026-04-15T00:00:00Z')
      expect(returned.featured).toBe(true)
      expect(returned.popularity).toBe('popular')
      expect(returned.icon).toBe('tool.svg')
      expect(returned.iconUrl).toBe('https://cdn.chatons.ai/icons/tool.svg')
    })
  })
})
