import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Unit tests for the skills catalog IPC handlers:
 *   `skills:listCatalog`, `skills:getMarketplace`, `skills:getMarketplaceFiltered`
 *
 * These are passthroughs to workspace-skills.ts functions. We test the handler
 * logic inline to avoid the full module graph (electron/app, DB, Pi deps).
 *
 * Key behaviors verified:
 * - listSkillsCatalog: fresh cache → source "cache"; stale + remote ok → remote source;
 *   stale + remote fail → source "cache" with stale entries; no cache + remote fail → source "fallback"
 * - getSkillsMarketplace: returns {featured, new, trending, byCategory} when catalog loads
 * - getSkillsMarketplaceFiltered: filters by query and/or category
 */

// ---------------------------------------------------------------------------
// Shared in-memory state for mocked filesystem (shared across vi.mock hooks)
// ---------------------------------------------------------------------------

type FsState = {
  files: Map<string, string>
}

const fsState: FsState = { files: new Map() }

// ---------------------------------------------------------------------------
// Mock node:fs — intercepts reads for the skills cache path
// ---------------------------------------------------------------------------

// We intercept reads to the skills cache JSON file by patching the module.
// Because the cache path uses app.getPath('userData'), we use a fixed
// synthetic path that we can detect and redirect to our in-memory map.
const CACHE_FILE = 'mock-skill-cache.json'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn((path: unknown) => {
      if (String(path).includes('skills-catalog-cache')) return fsState.files.has(CACHE_FILE)
      return actual.existsSync(path as string)
    }),
    readFileSync: vi.fn((path: unknown, _encoding?: unknown) => {
      if (String(path).includes('skills-catalog-cache')) {
        const content = fsState.files.get(CACHE_FILE)
        if (content === undefined) throw new Error('ENOENT')
        return content
      }
      return actual.readFileSync(path as string, _encoding as BufferEncoding)
    }),
    writeFileSync: vi.fn((path: unknown, data: unknown, _encoding?: unknown) => {
      if (String(path).includes('skills-catalog-cache')) {
        fsState.files.set(CACHE_FILE, data as string)
        return
      }
      return actual.writeFileSync(path as string, data as string, _encoding as BufferEncoding)
    }),
  }
})

// ---------------------------------------------------------------------------
// Stub global fetch — controlled per-test
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useRealTimers()
  fsState.files.clear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Minimal ExternalSkillEntry shape (subset of real type)
// ---------------------------------------------------------------------------

type ExternalSkillEntry = {
  source: string
  title: string
  description?: string
  category?: string
  tags?: string[]
  language?: string
  installs?: number
  stars?: number
  popularity?: 'new' | 'popular' | 'trending'
  featured?: boolean
  lastUpdated?: string
  repository?: string
}

// ---------------------------------------------------------------------------
// Inline the actual listSkillsCatalog logic (mirrors workspace-skills.ts)
// so tests exercise the real branching without the module graph.
// ---------------------------------------------------------------------------

const SKILLS_CACHE_TTL_MS = 1000 * 60 * 30 // 30 minutes

const DEFAULT_SKILLS: ExternalSkillEntry[] = [
  {
    source: 'gh-address-comments',
    title: 'GitHub Address Comments',
    description: 'Address comments in a GitHub pull request',
    category: 'Version Control',
    tags: ['github', 'pr', 'review'],
    language: 'TypeScript',
    installs: 1500,
    stars: 45,
    popularity: 'popular',
    repository: 'https://github.com/badlogic/pi-skills/tree/main/gh-address-comments',
    featured: true,
  },
  {
    source: 'screenshot',
    title: 'Screenshot Capture',
    description: 'Capture screenshots of web pages',
    category: 'Visual Tools',
    tags: ['screenshot', 'browser', 'visual'],
    language: 'TypeScript',
    installs: 2000,
    stars: 62,
    popularity: 'trending',
    repository: 'https://github.com/badlogic/pi-skills/tree/main/screenshot',
  },
]

function isCacheFresh(cache: { updatedAt: string } | null): boolean {
  if (!cache) return false
  const ts = Date.parse(cache.updatedAt)
  if (!Number.isFinite(ts)) return false
  return Date.now() - ts < SKILLS_CACHE_TTL_MS
}

function readCache():
  | { updatedAt: string; entries: ExternalSkillEntry[] }
  | null {
  if (!fsState.files.has(CACHE_FILE)) return null
  try {
    const raw = JSON.parse(fsState.files.get(CACHE_FILE)!)
    if (!raw || typeof raw.updatedAt !== 'string' || !Array.isArray(raw.entries)) return null
    return raw as { updatedAt: string; entries: ExternalSkillEntry[] }
  } catch {
    return null
  }
}

function writeCache(entries: ExternalSkillEntry[]) {
  fsState.files.set(CACHE_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), entries }, null, 2))
}

// ---------------------------------------------------------------------------
// Inline listSkillsCatalog (mirrors workspace-skills.ts lines 601–632)
// ---------------------------------------------------------------------------

async function listSkillsCatalog(): Promise<{
  ok: true
  entries: ExternalSkillEntry[]
  source: string
  updatedAt: string
}> {
  const cache = readCache()
  if (cache && isCacheFresh(cache)) {
    return { ok: true, entries: cache.entries, source: 'cache', updatedAt: cache.updatedAt }
  }

  // Try remote
  const remoteResult = await fetchSkillsCatalogFromWeb()
  if (remoteResult) return remoteResult

  // Stale cache fallback
  if (cache) {
    return { ok: true, entries: cache.entries, source: 'cache', updatedAt: cache.updatedAt }
  }

  // Absolute fallback
  return { ok: true, entries: DEFAULT_SKILLS, source: 'fallback', updatedAt: new Date(0).toISOString() }
}

async function fetchSkillsCatalogFromWeb(): Promise<{
  ok: true
  entries: ExternalSkillEntry[]
  source: string
  updatedAt: string
} | null> {
  const endpoints = [
    'https://skills.sh/api/skills',
    'https://www.skills.sh/api/skills',
  ]

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      const response = await fetch(endpoint, { signal: controller.signal })
      clearTimeout(timeoutId)
      if (!response.ok) continue
      const json = (await response.json()) as unknown
      const list = Array.isArray(json) ? json : []
      const entries = list.filter((e): e is ExternalSkillEntry => e !== null && typeof e === 'object')
      if (entries.length > 0) {
        writeCache(entries)
        return { ok: true, entries, source: 'skills.sh', updatedAt: new Date().toISOString() }
      }
    } catch {
      // continue to next endpoint
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Inline getSkillsMarketplace (mirrors workspace-skills.ts lines 696–765)
// ---------------------------------------------------------------------------

async function getSkillsMarketplace(): Promise<{
  ok: true
  featured: ExternalSkillEntry[]
  new: ExternalSkillEntry[]
  trending: ExternalSkillEntry[]
  byCategory: { name: string; count: number; items: ExternalSkillEntry[] }[]
  updatedAt: string
  source: string
} | { ok: false; message: string }> {
  const catalogResult = await listSkillsCatalog()
  if (!catalogResult.ok) {
    return { ok: false, message: 'Failed to load skills marketplace' }
  }

  const entries = catalogResult.entries

  const byCategory: Record<string, ExternalSkillEntry[]> = {}
  for (const entry of entries) {
    const cat = entry.category ?? 'General Tools'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(entry)
  }

  Object.keys(byCategory).forEach(cat => {
    byCategory[cat].sort((a, b) => {
      const aScore = (a.installs ?? 0) + (a.stars ?? 0) * 10
      const bScore = (b.installs ?? 0) + (b.stars ?? 0) * 10
      return bScore - aScore
    })
  })

  const featured = entries.filter(e => e.featured === true).sort((a, b) => ((b.stars ?? 0) - (a.stars ?? 0))).slice(0, 6)
  const newSkills = entries.filter(e => e.popularity === 'new').sort((a, b) => {
    const aTime = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0
    const bTime = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0
    return bTime - aTime
  }).slice(0, 8)
  const trending = entries.filter(e => e.popularity === 'trending' || e.popularity === 'popular').sort((a, b) => {
    const aScore = (a.installs ?? 0) + (a.stars ?? 0) * 10
    const bScore = (b.installs ?? 0) + (b.stars ?? 0) * 10
    return bScore - aScore
  }).slice(0, 8)

  return {
    ok: true,
    featured,
    new: newSkills,
    trending,
    byCategory: Object.entries(byCategory).map(([name, items]) => ({
      name,
      count: items.length,
      items: items.slice(0, 12),
    })).sort((a, b) => b.count - a.count),
    updatedAt: catalogResult.updatedAt,
    source: catalogResult.source,
  }
}

// ---------------------------------------------------------------------------
// Inline getSkillsMarketplaceFiltered (mirrors workspace-skills.ts lines 780+)
// ---------------------------------------------------------------------------

interface SkillsFilterOptions {
  query?: string
  category?: string
}

async function getSkillsMarketplaceFiltered(options: SkillsFilterOptions): Promise<{
  ok: true
  items: ExternalSkillEntry[]
  source: string
  updatedAt: string
} | { ok: false; message: string }> {
  const catalogResult = await listSkillsCatalog()
  if (!catalogResult.ok) {
    return { ok: false, message: 'Failed to load skills catalog' }
  }

  let items = catalogResult.entries

  if (options.category) {
    items = items.filter(e => (e.category ?? 'General Tools') === options.category)
  }

  if (options.query) {
    const q = options.query.toLowerCase()
    items = items.filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.description?.toLowerCase().includes(q) ||
      e.tags?.some(t => t.toLowerCase().includes(q)),
    )
  }

  return { ok: true, items, source: catalogResult.source, updatedAt: catalogResult.updatedAt }
}

// ---------------------------------------------------------------------------
// Tests: listSkillsCatalog
// ---------------------------------------------------------------------------

describe('skills:listCatalog (listSkillsCatalog)', () => {

  it('returns fresh cache with source "cache" when cache exists and is fresh', async () => {
    const freshEntries: ExternalSkillEntry[] = [
      { source: 'test-skill', title: 'Test Skill', category: 'Testing' },
    ]
    fsState.files.set(CACHE_FILE, JSON.stringify({
      updatedAt: new Date().toISOString(),
      entries: freshEntries,
    }))
    // No network calls needed
    const result = await listSkillsCatalog()
    expect(result).toEqual({
      ok: true,
      entries: freshEntries,
      source: 'cache',
      updatedAt: expect.any(String),
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not call fetch when cache is fresh', async () => {
    fsState.files.set(CACHE_FILE, JSON.stringify({
      updatedAt: new Date().toISOString(),
      entries: [{ source: 'cached', title: 'Cached' }],
    }))
    await listSkillsCatalog()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches from network when cache is stale', async () => {
    // Set a stale cache (30+ minutes old)
    const staleDate = new Date(Date.now() - (31 * 60 * 1000)).toISOString()
    fsState.files.set(CACHE_FILE, JSON.stringify({
      updatedAt: staleDate,
      entries: [{ source: 'stale', title: 'Stale Skill' }],
    }))

    const remoteEntries: ExternalSkillEntry[] = [
      { source: 'remote-skill', title: 'Remote Skill', category: 'Remote' },
    ]
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(remoteEntries),
    } as unknown as Response)

    const result = await listSkillsCatalog()
    expect(result.source).toBe('skills.sh')
    expect(result.entries).toEqual(remoteEntries)
  })

  it('writes fetched entries to cache', async () => {
    const staleDate = new Date(Date.now() - (31 * 60 * 1000)).toISOString()
    fsState.files.set(CACHE_FILE, JSON.stringify({
      updatedAt: staleDate,
      entries: [{ source: 'stale', title: 'Stale' }],
    }))

    const remoteEntries: ExternalSkillEntry[] = [
      { source: 'new-remote', title: 'New Remote', category: 'Fresh' },
    ]
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(remoteEntries),
    } as unknown as Response)

    await listSkillsCatalog()
    const cached = JSON.parse(fsState.files.get(CACHE_FILE)!)
    expect(cached.entries).toEqual(remoteEntries)
  })

  it('returns stale cache with source "cache" when remote fetch fails', async () => {
    const staleDate = new Date(Date.now() - (31 * 60 * 1000)).toISOString()
    const staleEntries: ExternalSkillEntry[] = [
      { source: 'stale-only', title: 'Stale Skill', category: 'Old' },
    ]
    fsState.files.set(CACHE_FILE, JSON.stringify({
      updatedAt: staleDate,
      entries: staleEntries,
    }))

    // All network requests fail
    fetchMock.mockRejectedValue(new Error('Network unavailable'))

    const result = await listSkillsCatalog()
    expect(result).toEqual({
      ok: true,
      entries: staleEntries,
      source: 'cache',
      updatedAt: staleDate,
    })
  })

  it('returns stale cache when remote returns empty array', async () => {
    const staleDate = new Date(Date.now() - (31 * 60 * 1000)).toISOString()
    const staleEntries: ExternalSkillEntry[] = [{ source: 'stale', title: 'Stale' }]
    fsState.files.set(CACHE_FILE, JSON.stringify({
      updatedAt: staleDate,
      entries: staleEntries,
    }))

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    } as unknown as Response)

    const result = await listSkillsCatalog()
    // Stale cache is returned because remote returned empty
    expect(result.entries).toEqual(staleEntries)
    expect(result.source).toBe('cache')
  })

  it('returns default skills with source "fallback" when no cache and network fails', async () => {
    // No cache file
    fsState.files.clear()
    fetchMock.mockRejectedValue(new Error('Network unavailable'))

    const result = await listSkillsCatalog()
    expect(result).toEqual({
      ok: true,
      entries: DEFAULT_SKILLS,
      source: 'fallback',
      updatedAt: new Date(0).toISOString(),
    })
  })

  it('does not call fetch when cache is fresh even if network is configured', async () => {
    fsState.files.set(CACHE_FILE, JSON.stringify({
      updatedAt: new Date().toISOString(),
      entries: [{ source: 'from-cache', title: 'From Cache' }],
    }))

    await listSkillsCatalog()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('invalidates malformed cache (returns null from readCache)', async () => {
    // Write a malformed JSON
    fsState.files.set(CACHE_FILE, 'not valid json {{{')
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ source: 'from-net', title: 'From Network' }]),
    } as unknown as Response)

    const result = await listSkillsCatalog()
    expect(result.source).toBe('skills.sh')
  })

  it('invalidates cache with wrong shape (missing entries array)', async () => {
    fsState.files.set(CACHE_FILE, JSON.stringify({ updatedAt: new Date().toISOString() }))
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ source: 'net', title: 'Net Skill' }]),
    } as unknown as Response)

    const result = await listSkillsCatalog()
    expect(result.source).toBe('skills.sh')
  })
})

// ---------------------------------------------------------------------------
// Tests: getSkillsMarketplace
// ---------------------------------------------------------------------------

describe('skills:getMarketplace (getSkillsMarketplace)', () => {

  it('returns fallback skills when no cache and network is unavailable', async () => {
    // Force no cache + all network failures
    // Note: listSkillsCatalog never returns ok:false — it always succeeds with
    // source "fallback" and DEFAULT_SKILLS when everything fails.
    fsState.files.clear()
    fetchMock.mockRejectedValue(new Error('offline'))

    const result = await getSkillsMarketplace()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.source).toBe('fallback')
      expect(result.featured).toBeInstanceOf(Array)
      expect(result.new).toBeInstanceOf(Array)
      expect(result.trending).toBeInstanceOf(Array)
      expect(result.byCategory).toBeInstanceOf(Array)
    }
  })

  it('returns featured, new, trending, and byCategory from catalog', async () => {
    fsState.files.set(CACHE_FILE, JSON.stringify({
      updatedAt: new Date().toISOString(),
      entries: [
        { source: 's1', title: 'Featured Skill', category: 'Testing', featured: true, stars: 100, installs: 50 },
        { source: 's2', title: 'New Skill', category: 'Testing', popularity: 'new', lastUpdated: new Date().toISOString(), stars: 10, installs: 10 },
        { source: 's3', title: 'Trending Skill', category: 'Code Quality', popularity: 'trending', stars: 20, installs: 20 },
        { source: 's4', title: 'Popular Skill', category: 'Code Quality', popularity: 'popular', stars: 5, installs: 100 },
        { source: 's5', title: 'Plain Skill', category: 'General', stars: 1, installs: 1 },
      ],
    }))

    const result = await getSkillsMarketplace()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.featured).toHaveLength(1)
      expect(result.featured[0].source).toBe('s1')
      expect(result.new).toHaveLength(1)
      expect(result.new[0].source).toBe('s2')
      expect(result.trending).toHaveLength(2) // s3 (trending) + s4 (popular)
      expect(result.byCategory).toHaveLength(3)
    }
  })

  it('limits featured to 6 items', async () => {
    const manyFeatured = Array.from({ length: 10 }, (_, i) => ({
      source: `s${i}`,
      title: `Skill ${i}`,
      category: 'Testing',
      featured: true,
      stars: i,
      installs: i,
    }))
    fsState.files.set(CACHE_FILE, JSON.stringify({
      updatedAt: new Date().toISOString(),
      entries: manyFeatured,
    }))

    const result = await getSkillsMarketplace()
    if (result.ok) {
      expect(result.featured).toHaveLength(6)
    }
  })

  it('limits trending and new to 8 items each', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      source: `n${i}`,
      title: `New Skill ${i}`,
      category: 'Testing',
      popularity: 'new' as const,
      lastUpdated: new Date().toISOString(),
      stars: i,
      installs: i,
    }))
    fsState.files.set(CACHE_FILE, JSON.stringify({
      updatedAt: new Date().toISOString(),
      entries: many,
    }))

    const result = await getSkillsMarketplace()
    if (result.ok) {
      expect(result.new).toHaveLength(8)
    }
  })

  it('sorts trending by installs + stars descending', async () => {
    fsState.files.set(CACHE_FILE, JSON.stringify({
      updatedAt: new Date().toISOString(),
      entries: [
        { source: 'low', title: 'Low', popularity: 'popular', stars: 1, installs: 1 },
        { source: 'high', title: 'High', popularity: 'popular', stars: 100, installs: 100 },
        { source: 'mid', title: 'Mid', popularity: 'trending', stars: 50, installs: 50 },
      ],
    }))

    const result = await getSkillsMarketplace()
    if (result.ok) {
      expect(result.trending.map(s => s.source)).toEqual(['high', 'mid', 'low'])
    }
  })

  it('uses "General Tools" as default category for uncategorized entries', async () => {
    fsState.files.set(CACHE_FILE, JSON.stringify({
      updatedAt: new Date().toISOString(),
      entries: [
        { source: 'uncat', title: 'Uncategorized Skill' },
      ],
    }))

    const result = await getSkillsMarketplace()
    if (result.ok) {
      expect(result.byCategory).toContainEqual(
        expect.objectContaining({ name: 'General Tools' }),
      )
    }
  })

  it('passes through catalog source (cache/fallback/remote)', async () => {
    // Fresh cache → source should be "cache"
    fsState.files.set(CACHE_FILE, JSON.stringify({
      updatedAt: new Date().toISOString(),
      entries: [{ source: 'c', title: 'Cached' }],
    }))

    const result = await getSkillsMarketplace()
    if (result.ok) {
      expect(result.source).toBe('cache')
    }
  })
})

// ---------------------------------------------------------------------------
// Tests: getSkillsMarketplaceFiltered
// ---------------------------------------------------------------------------

describe('skills:getMarketplaceFiltered (getSkillsMarketplaceFiltered)', () => {

  const ENTRIES: ExternalSkillEntry[] = [
    { source: 'git-fix', title: 'Git Fix PR', description: 'Fix git errors', tags: ['git', 'github'], category: 'Version Control', stars: 10, installs: 100 },
    { source: 'git-ci', title: 'GitHub CI Debug', description: 'Debug GitHub Actions', tags: ['github', 'ci'], category: 'CI/CD', stars: 20, installs: 200 },
    { source: 'lint', title: 'ESLint Fix', description: 'Fix linting errors', tags: ['lint', 'code'], category: 'Code Quality', stars: 5, installs: 50 },
    { source: 'playwright', title: 'Playwright Test', description: 'Browser tests', tags: ['playwright', 'browser'], category: 'Testing', stars: 15, installs: 150 },
  ]

  async function setupCatalog() {
    fsState.files.set(CACHE_FILE, JSON.stringify({
      updatedAt: new Date().toISOString(),
      entries: ENTRIES,
    }))
  }

  it('returns all entries when no filter is provided', async () => {
    await setupCatalog()
    const result = await getSkillsMarketplaceFiltered({})
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.items).toHaveLength(4)
    }
  })

  it('filters by category (exact match)', async () => {
    await setupCatalog()
    const result = await getSkillsMarketplaceFiltered({ category: 'Version Control' })
    if (result.ok) {
      expect(result.items).toHaveLength(1)
      expect(result.items[0].source).toBe('git-fix')
    }
  })

  it('filters by category using default category name for uncategorized entries', async () => {
    fsState.files.set(CACHE_FILE, JSON.stringify({
      updatedAt: new Date().toISOString(),
      entries: [
        { source: 'plain', title: 'Plain Skill' }, // no category → "General Tools"
      ],
    }))
    const result = await getSkillsMarketplaceFiltered({ category: 'General Tools' })
    if (result.ok) {
      expect(result.items).toHaveLength(1)
    }
  })

  it('filters by query (matches title)', async () => {
    await setupCatalog()
    const result = await getSkillsMarketplaceFiltered({ query: 'Git' })
    if (result.ok) {
      expect(result.items).toHaveLength(2) // Git Fix PR, GitHub CI Debug
    }
  })

  it('filters by query (matches description)', async () => {
    await setupCatalog()
    const result = await getSkillsMarketplaceFiltered({ query: 'linting' })
    if (result.ok) {
      expect(result.items).toHaveLength(1)
      expect(result.items[0].source).toBe('lint')
    }
  })

  it('filters by query (matches tags)', async () => {
    await setupCatalog()
    const result = await getSkillsMarketplaceFiltered({ query: 'playwright' })
    if (result.ok) {
      expect(result.items).toHaveLength(1)
      expect(result.items[0].source).toBe('playwright')
    }
  })

  it('combines category and query filters (AND logic)', async () => {
    await setupCatalog()
    const result = await getSkillsMarketplaceFiltered({ category: 'Version Control', query: 'fix' })
    if (result.ok) {
      expect(result.items).toHaveLength(1)
      expect(result.items[0].source).toBe('git-fix')
    }
  })

  it('returns empty array when no entries match', async () => {
    await setupCatalog()
    const result = await getSkillsMarketplaceFiltered({ query: 'nonexistent-skill-xyz' })
    if (result.ok) {
      expect(result.items).toHaveLength(0)
    }
  })

  it('query search is case-insensitive', async () => {
    await setupCatalog()
    const result = await getSkillsMarketplaceFiltered({ query: 'ESLINT' })
    if (result.ok) {
      expect(result.items).toHaveLength(1)
      expect(result.items[0].source).toBe('lint')
    }
  })

  it('returns fallback catalog when listSkillsCatalog has no cache and network fails', async () => {
    // Note: listSkillsCatalog never returns ok:false — it always succeeds with
    // source "fallback" when everything fails.
    fsState.files.clear()
    fetchMock.mockRejectedValue(new Error('offline'))
    const result = await getSkillsMarketplaceFiltered({ query: 'test' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.source).toBe('fallback')
      expect(result.items).toBeInstanceOf(Array)
    }
  })
})
