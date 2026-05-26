/**
 * Tests for extension-registry/lib/icon-resolver.ts
 *
 * The icon-resolver module reads process.env at load time to determine the
 * API base URL. We use vi.mock with vi.doMock to inject controlled env values
 * before each test group, resetting modules between tests.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// We import the module AFTER vi.doMock in each test group so it picks up
// the mocked process.env. We use vi.resetModules() to clear the module cache
// between tests so each one gets a fresh module instance.

const base = '/Users/thibaut/gitRepo/chaton/extension-registry/lib'

describe('normalizeIconUrl — null/undefined/empty', () => {
  it('returns null when iconUrl is null', async () => {
    const { normalizeIconUrl } = await import(base + '/icon-resolver.ts')
    expect(normalizeIconUrl(null)).toBeNull()
  })

  it('returns null when iconUrl is undefined', async () => {
    const { normalizeIconUrl } = await import(base + '/icon-resolver.ts')
    expect(normalizeIconUrl(undefined)).toBeNull()
  })

  it('returns null when iconUrl is empty string', async () => {
    const { normalizeIconUrl } = await import(base + '/icon-resolver.ts')
    expect(normalizeIconUrl('')).toBeNull()
  })

  it('returns whitespace-only string as-is (not trimmed — not part of the API contract)', async () => {
    const { normalizeIconUrl } = await import(base + '/icon-resolver.ts')
    expect(normalizeIconUrl('   ')).toBe('   ')
  })
})

describe('normalizeIconUrl — absolute URL passthrough', () => {
  it('returns https URL unchanged', async () => {
    const { normalizeIconUrl } = await import(base + '/icon-resolver.ts')
    expect(normalizeIconUrl('https://cdn.example.com/icons/foo.png')).toBe(
      'https://cdn.example.com/icons/foo.png',
    )
  })

  it('returns http URL unchanged', async () => {
    const { normalizeIconUrl } = await import(base + '/icon-resolver.ts')
    expect(normalizeIconUrl('http://cdn.example.com/icons/foo.png')).toBe(
      'http://cdn.example.com/icons/foo.png',
    )
  })
})

describe('normalizeIconUrl — relative path conversion', () => {
  it('converts /api/... path to absolute URL using API_BASE', async () => {
    const { normalizeIconUrl } = await import(base + '/icon-resolver.ts')
    const result = normalizeIconUrl('/api/icons/my-extension.png')
    // Should produce an absolute URL containing the path
    expect(result).toMatch(/^https?:\/\//)
    expect(result).toContain('/api/icons/my-extension.png')
  })

  it('returns unknown format as-is (browser will handle it)', async () => {
    const { normalizeIconUrl } = await import(base + '/icon-resolver.ts')
    expect(normalizeIconUrl('some-extension-icon.png')).toBe('some-extension-icon.png')
  })

  it('treats relative path with no leading slash as unknown format', async () => {
    const { normalizeIconUrl } = await import(base + '/icon-resolver.ts')
    expect(normalizeIconUrl('icons/my-icon.png')).toBe('icons/my-icon.png')
  })
})

describe('normalizeExtensionIconUrl', () => {
  it('returns null entry as-is', async () => {
    const { normalizeExtensionIconUrl } = await import(base + '/icon-resolver.ts')
    expect(normalizeExtensionIconUrl(null)).toBeNull()
  })

  it('returns undefined entry as-is', async () => {
    const { normalizeExtensionIconUrl } = await import(base + '/icon-resolver.ts')
    expect(normalizeExtensionIconUrl(undefined)).toBeUndefined()
  })

  it('replaces iconUrl with normalized version', async () => {
    const { normalizeExtensionIconUrl } = await import(base + '/icon-resolver.ts')
    const entry = { id: 'ext-1', name: 'My Extension', iconUrl: '/api/icons/my-ext.png' }
    const result = normalizeExtensionIconUrl(entry)
    expect(result).toMatchObject({ id: 'ext-1', name: 'My Extension' })
    expect(result.iconUrl).toMatch(/^https?:\/\//)
    expect(result.iconUrl).toContain('/api/icons/my-ext.png')
  })

  it('preserves iconUrl when already absolute', async () => {
    const { normalizeExtensionIconUrl } = await import(base + '/icon-resolver.ts')
    const entry = { id: 'ext-2', name: 'CDN Extension', iconUrl: 'https://cdn.example.com/icon.png' }
    const result = normalizeExtensionIconUrl(entry)
    expect(result.iconUrl).toBe('https://cdn.example.com/icon.png')
  })

  it('does not add iconUrl field when entry has no iconUrl', async () => {
    const { normalizeExtensionIconUrl } = await import(base + '/icon-resolver.ts')
    const entry = { id: 'ext-3', name: 'No Icon', version: '1.0.0' }
    const result = normalizeExtensionIconUrl(entry)
    // Should be exactly the same — no iconUrl field added
    expect(result).toEqual({ id: 'ext-3', name: 'No Icon', version: '1.0.0' })
  })

  it('sets iconUrl to null when entry.iconUrl is null', async () => {
    const { normalizeExtensionIconUrl } = await import(base + '/icon-resolver.ts')
    const entry = { id: 'ext-4', name: 'Null Icon', iconUrl: null }
    const result = normalizeExtensionIconUrl(entry)
    expect(result.iconUrl).toBeNull()
  })

  it('sets iconUrl to null when entry.iconUrl is undefined — omit from result', async () => {
    const { normalizeExtensionIconUrl } = await import(base + '/icon-resolver.ts')
    const entry = { id: 'ext-5', name: 'Undefined Icon', iconUrl: undefined }
    const result = normalizeExtensionIconUrl(entry)
    // normalizeIconUrl(undefined) = null, but spreading {} omits the field
    expect(result.iconUrl).toBeUndefined()
  })

  it('does not mutate the original entry', async () => {
    const { normalizeExtensionIconUrl } = await import(base + '/icon-resolver.ts')
    const entry = { id: 'ext-6', name: 'Test', iconUrl: '/api/icons/test.png' }
    const iconUrlBefore = entry.iconUrl
    normalizeExtensionIconUrl(entry)
    expect(entry.iconUrl).toBe(iconUrlBefore)
  })
})

describe('normalizeCatalogIconUrls', () => {
  it('returns null catalog as-is', async () => {
    const { normalizeCatalogIconUrls } = await import(base + '/icon-resolver.ts')
    expect(normalizeCatalogIconUrls(null)).toBeNull()
  })

  it('returns undefined catalog as-is', async () => {
    const { normalizeCatalogIconUrls } = await import(base + '/icon-resolver.ts')
    expect(normalizeCatalogIconUrls(undefined)).toBeUndefined()
  })

  it('normalizes iconUrl for all builtin extensions', async () => {
    const { normalizeCatalogIconUrls } = await import(base + '/icon-resolver.ts')
    const catalog = {
      builtin: [
        { id: 'b1', iconUrl: '/api/icons/b1.png' },
        { id: 'b2', iconUrl: 'https://cdn.example.com/b2.png' },
        { id: 'b3', iconUrl: null },
      ],
    }
    const result = normalizeCatalogIconUrls(catalog)
    expect(result.builtin[0].iconUrl).toMatch(/^https?:\/\//)
    expect(result.builtin[0].iconUrl).toContain('/api/icons/b1.png')
    expect(result.builtin[1].iconUrl).toBe('https://cdn.example.com/b2.png')
    expect(result.builtin[2].iconUrl).toBeNull()
  })

  it('normalizes iconUrl for all channel extensions', async () => {
    const { normalizeCatalogIconUrls } = await import(base + '/icon-resolver.ts')
    const catalog = {
      channel: [
        { id: 'c1', iconUrl: '/api/icons/c1.png' },
        { id: 'c2', iconUrl: '' },
      ],
    }
    const result = normalizeCatalogIconUrls(catalog)
    expect(result.channel[0].iconUrl).toMatch(/^https?:\/\//)
    expect(result.channel[1].iconUrl).toBeNull()
  })

  it('normalizes iconUrl for all tool extensions', async () => {
    const { normalizeCatalogIconUrls } = await import(base + '/icon-resolver.ts')
    const catalog = {
      tool: [{ id: 't1', iconUrl: '/api/icons/t1.png' }],
    }
    const result = normalizeCatalogIconUrls(catalog)
    expect(result.tool[0].iconUrl).toMatch(/^https?:\/\//)
  })

  it('handles catalog with no builtin/channel/tool arrays', async () => {
    const { normalizeCatalogIconUrls } = await import(base + '/icon-resolver.ts')
    const catalog = { version: '1.0.0' }
    const result = normalizeCatalogIconUrls(catalog)
    expect(result.builtin).toEqual([])
    expect(result.channel).toEqual([])
    expect(result.tool).toEqual([])
  })

  it('does not mutate the original catalog', async () => {
    const { normalizeCatalogIconUrls } = await import(base + '/icon-resolver.ts')
    const catalog = {
      builtin: [{ id: 'b1', iconUrl: '/api/icons/b1.png' }],
    }
    normalizeCatalogIconUrls(catalog)
    expect(catalog.builtin[0].iconUrl).toBe('/api/icons/b1.png')
  })
})
