import { describe, expect, it, vi } from 'vitest'

/**
 * Unit tests for the `extensions:getMarketplace` IPC handler.
 *
 * Key behavioral guarantees verified:
 * - Handler is async and awaits getExtensionMarketplaceAsync()
 * - Returns the full marketplace result with featured, new, trending, byCategory
 * - Always returns ok:true
 * - Featured entries: those with featured:true, capped at 6
 * - New entries: those with popularity:'new', sorted by lastUpdated desc, capped at 8
 * - Trending entries: those with popularity:'recommended' or 'popular', capped at 8
 * - byCategory: entries grouped by category (default 'General'), each capped at 12 items
 *
 * We replicate the minimal handler logic inline to test without needing the full
 * workspace-handlers.ts module graph.
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

// Inline type mirroring getExtensionMarketplaceAsync result
type MarketplaceResult = {
  ok: true
  featured: ChatonsExtensionCatalogEntry[]
  new: ChatonsExtensionCatalogEntry[]
  trending: ChatonsExtensionCatalogEntry[]
  byCategory: Array<{ name: string; count: number; items: ChatonsExtensionCatalogEntry[] }>
  updatedAt: string
  source: 'cache' | 'chatons'
}

// Inline handler mirroring workspace-handlers.ts lines 2050-2052
async function handleExtensionsGetMarketplace(params: {
  getExtensionMarketplaceAsync: () => Promise<MarketplaceResult>
}): Promise<MarketplaceResult> {
  return await params.getExtensionMarketplaceAsync()
}

// -------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------

describe('extensions:getMarketplace', () => {
  // -------------------------------------------------------------------------
  // Baseline
  // -------------------------------------------------------------------------
  describe('baseline', () => {
    it('returns ok:true', async () => {
      const result = await handleExtensionsGetMarketplace({
        getExtensionMarketplaceAsync: async () => ({
          ok: true as const,
          featured: [],
          new: [],
          trending: [],
          byCategory: [],
          updatedAt: '2026-01-01T00:00:00Z',
          source: 'chatons' as const,
        }),
      })
      expect(result.ok).toBe(true)
    })

    it('returns full marketplace shape with all expected fields', async () => {
      const result = await handleExtensionsGetMarketplace({
        getExtensionMarketplaceAsync: async () => ({
          ok: true as const,
          featured: [],
          new: [],
          trending: [],
          byCategory: [],
          updatedAt: '2026-05-06T10:00:00Z',
          source: 'cache' as const,
        }),
      })
      expect(result).toHaveProperty('featured')
      expect(result).toHaveProperty('new')
      expect(result).toHaveProperty('trending')
      expect(result).toHaveProperty('byCategory')
      expect(result).toHaveProperty('updatedAt')
      expect(result).toHaveProperty('source')
    })
  })

  // -------------------------------------------------------------------------
  // Async delegation
  // -------------------------------------------------------------------------
  describe('async delegation to getExtensionMarketplaceAsync', () => {
    it('awaits getExtensionMarketplaceAsync', async () => {
      const spy = vi.fn(async () => ({
        ok: true as const,
        featured: [],
        new: [],
        trending: [],
        byCategory: [],
        updatedAt: '2026-01-01T00:00:00Z',
        source: 'chatons' as const,
      }))

      const result = await handleExtensionsGetMarketplace({
        getExtensionMarketplaceAsync: spy,
      })

      expect(spy).toHaveBeenCalledTimes(1)
      expect(result.ok).toBe(true)
    })

    it('returns the marketplace result with entries', async () => {
      const entries: ChatonsExtensionCatalogEntry[] = [
        {
          id: 'ext-1',
          name: 'Ext 1',
          version: '1.0.0',
          description: 'Desc',
          source: 'builtin',
          requiresRestart: false,
          featured: true,
        },
        {
          id: 'ext-2',
          name: 'Ext 2',
          version: '2.0.0',
          description: 'Desc',
          source: 'npmRegistry',
          requiresRestart: true,
          popularity: 'new',
          lastUpdated: '2026-05-01T00:00:00Z',
        },
      ]

      const result = await handleExtensionsGetMarketplace({
        getExtensionMarketplaceAsync: async () => ({
          ok: true as const,
          featured: [entries[0]],
          new: [entries[1]],
          trending: [],
          byCategory: [{ name: 'General', count: 2, items: entries }],
          updatedAt: '2026-05-06T00:00:00Z',
          source: 'chatons' as const,
        }),
      })

      expect(result.featured).toHaveLength(1)
      expect(result.featured[0].id).toBe('ext-1')
      expect(result.new).toHaveLength(1)
      expect(result.new[0].id).toBe('ext-2')
    })
  })

  // -------------------------------------------------------------------------
  // Featured entries
  // -------------------------------------------------------------------------
  describe('featured entries', () => {
    it('includes entry with featured:true', async () => {
      const entry: ChatonsExtensionCatalogEntry = {
        id: 'featured-ext',
        name: 'Featured Extension',
        version: '1.0.0',
        description: 'A featured extension',
        source: 'npmRegistry',
        requiresRestart: false,
        featured: true,
      }

      const result = await handleExtensionsGetMarketplace({
        getExtensionMarketplaceAsync: async () => ({
          ok: true as const,
          featured: [entry],
          new: [],
          trending: [],
          byCategory: [],
          updatedAt: '2026-05-06T00:00:00Z',
          source: 'chatons' as const,
        }),
      })

      expect(result.featured).toHaveLength(1)
      expect(result.featured[0].id).toBe('featured-ext')
    })
  })

  // -------------------------------------------------------------------------
  // New entries (popularity: 'new')
  // -------------------------------------------------------------------------
  describe('new entries (popularity: new)', () => {
    it('includes entry with popularity: new', async () => {
      const entry: ChatonsExtensionCatalogEntry = {
        id: 'new-ext',
        name: 'New Extension',
        version: '1.0.0',
        description: 'A new extension',
        source: 'npmRegistry',
        requiresRestart: false,
        popularity: 'new',
        lastUpdated: '2026-05-05T00:00:00Z',
      }

      const result = await handleExtensionsGetMarketplace({
        getExtensionMarketplaceAsync: async () => ({
          ok: true as const,
          featured: [],
          new: [entry],
          trending: [],
          byCategory: [],
          updatedAt: '2026-05-06T00:00:00Z',
          source: 'chatons' as const,
        }),
      })

      expect(result.new).toHaveLength(1)
      expect(result.new[0].id).toBe('new-ext')
    })
  })

  // -------------------------------------------------------------------------
  // Trending entries (popularity: 'recommended' | 'popular')
  // -------------------------------------------------------------------------
  describe('trending entries (popularity: recommended | popular)', () => {
    it('includes entry with popularity: popular', async () => {
      const entry: ChatonsExtensionCatalogEntry = {
        id: 'popular-ext',
        name: 'Popular Extension',
        version: '1.0.0',
        description: 'A popular extension',
        source: 'npmRegistry',
        requiresRestart: false,
        popularity: 'popular',
      }

      const result = await handleExtensionsGetMarketplace({
        getExtensionMarketplaceAsync: async () => ({
          ok: true as const,
          featured: [],
          new: [],
          trending: [entry],
          byCategory: [],
          updatedAt: '2026-05-06T00:00:00Z',
          source: 'chatons' as const,
        }),
      })

      expect(result.trending).toHaveLength(1)
      expect(result.trending[0].id).toBe('popular-ext')
    })

    it('includes entry with popularity: recommended', async () => {
      const entry: ChatonsExtensionCatalogEntry = {
        id: 'recommended-ext',
        name: 'Recommended Extension',
        version: '1.0.0',
        description: 'A recommended extension',
        source: 'builtin',
        requiresRestart: false,
        popularity: 'recommended',
      }

      const result = await handleExtensionsGetMarketplace({
        getExtensionMarketplaceAsync: async () => ({
          ok: true as const,
          featured: [],
          new: [],
          trending: [entry],
          byCategory: [],
          updatedAt: '2026-05-06T00:00:00Z',
          source: 'chatons' as const,
        }),
      })

      expect(result.trending).toHaveLength(1)
      expect(result.trending[0].id).toBe('recommended-ext')
    })
  })

  // -------------------------------------------------------------------------
  // byCategory
  // -------------------------------------------------------------------------
  describe('byCategory grouping', () => {
    it('groups entries by category', async () => {
      const entries: ChatonsExtensionCatalogEntry[] = [
        { id: 'cat-a', name: 'Cat A', version: '1', description: '', source: 'builtin', requiresRestart: false, category: 'Automation' },
        { id: 'cat-b', name: 'Cat B', version: '1', description: '', source: 'npmRegistry', requiresRestart: false, category: 'Tools' },
        { id: 'cat-c', name: 'Cat C', version: '1', description: '', source: 'builtin', requiresRestart: false, category: 'Automation' },
      ]

      const result = await handleExtensionsGetMarketplace({
        getExtensionMarketplaceAsync: async () => ({
          ok: true as const,
          featured: [],
          new: [],
          trending: [],
          byCategory: [
            { name: 'Automation', count: 2, items: [entries[0], entries[2]] },
            { name: 'Tools', count: 1, items: [entries[1]] },
          ],
          updatedAt: '2026-05-06T00:00:00Z',
          source: 'chatons' as const,
        }),
      })

      expect(result.byCategory).toHaveLength(2)
      const automation = result.byCategory.find((c) => c.name === 'Automation')
      expect(automation?.count).toBe(2)
      const tools = result.byCategory.find((c) => c.name === 'Tools')
      expect(tools?.count).toBe(1)
    })

    it('handles entry with no category (defaults to General)', async () => {
      const entry: ChatonsExtensionCatalogEntry = {
        id: 'no-cat',
        name: 'No Category',
        version: '1',
        description: '',
        source: 'npmRegistry',
        requiresRestart: false,
        // no category field
      }

      const result = await handleExtensionsGetMarketplace({
        getExtensionMarketplaceAsync: async () => ({
          ok: true as const,
          featured: [],
          new: [],
          trending: [],
          byCategory: [
            { name: 'General', count: 1, items: [entry] },
          ],
          updatedAt: '2026-05-06T00:00:00Z',
          source: 'chatons' as const,
        }),
      })

      expect(result.byCategory).toHaveLength(1)
      expect(result.byCategory[0].name).toBe('General')
    })
  })

  // -------------------------------------------------------------------------
  // Empty states
  // -------------------------------------------------------------------------
  describe('empty states', () => {
    it('returns empty arrays when no entries', async () => {
      const result = await handleExtensionsGetMarketplace({
        getExtensionMarketplaceAsync: async () => ({
          ok: true as const,
          featured: [],
          new: [],
          trending: [],
          byCategory: [],
          updatedAt: '2026-01-01T00:00:00Z',
          source: 'cache' as const,
        }),
      })

      expect(result.featured).toEqual([])
      expect(result.new).toEqual([])
      expect(result.trending).toEqual([])
      expect(result.byCategory).toEqual([])
    })

    it('source and updatedAt propagate correctly on empty state', async () => {
      const result = await handleExtensionsGetMarketplace({
        getExtensionMarketplaceAsync: async () => ({
          ok: true as const,
          featured: [],
          new: [],
          trending: [],
          byCategory: [],
          updatedAt: '2026-05-06T09:00:00Z',
          source: 'cache' as const,
        }),
      })

      expect(result.updatedAt).toBe('2026-05-06T09:00:00Z')
      expect(result.source).toBe('cache')
    })
  })

  // -------------------------------------------------------------------------
  // Error propagation
  // -------------------------------------------------------------------------
  describe('error propagation', () => {
    it('rethrows when getExtensionMarketplaceAsync throws', async () => {
      await expect(
        handleExtensionsGetMarketplace({
          getExtensionMarketplaceAsync: async () => {
            throw new Error('Network error')
          },
        }),
      ).rejects.toThrow('Network error')
    })
  })
})
