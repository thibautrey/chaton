import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `projects:scanImages` IPC handler.
 *
 * The handler:
 * 1. IPC-level: validates projectId is a non-empty string → project_not_found
 * 2. DB lookup via findProjectById → project_not_found if no project or no repo_path
 * 3. Scans the repo_path directory recursively for image files (maxDepth=3, maxResults=60)
 * 4. Returns { ok: true, images }
 *
 * We replicate the handler logic inline so tests run without the full workspace
 * module graph (no database, IPC wiring, or fs required).
 */

describe('projects:scanImages handler', () => {
  // -------------------------------------------------------------------------
  // Types mirroring the real handler (workspace-handlers.ts)
  // -------------------------------------------------------------------------
  type Result =
    | { ok: true; images: string[] }
    | { ok: false; reason: 'project_not_found'; images: [] }

  interface Project {
    id: string
    repo_path: string | null
  }

  // -------------------------------------------------------------------------
  // Inline handler — mirrors workspace-handlers.ts (lines ~3496–3531)
  // -------------------------------------------------------------------------
  async function scanProjectImages(params: {
    projectId: unknown
    findProjectById: (projectId: string) => Project | null
    fsReadDirSync: (dirPath: string, opts: { withFileTypes: true }) => { name: string; isDirectory: () => boolean; isFile: () => boolean }[]
  }): Promise<Result> {
    const { projectId, findProjectById, fsReadDirSync } = params

    if (typeof projectId !== 'string' || !projectId.trim()) {
      return { ok: false, reason: 'project_not_found', images: [] }
    }
    const trimmedId = projectId.trim()

    const db = {} as any // not used in this handler's logic
    const project = findProjectById(trimmedId)
    if (!project) {
      return { ok: false, reason: 'project_not_found', images: [] }
    }

    const repoPath = project.repo_path
    if (!repoPath) {
      return { ok: false, reason: 'project_not_found', images: [] }
    }

    const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico'])
    const images: string[] = []
    const maxDepth = 3
    const maxResults = 60

    function scanDir(dirPath: string, depth: number) {
      if (depth > maxDepth || images.length >= maxResults) return
      try {
        const entries = fsReadDirSync(dirPath, { withFileTypes: true })
        for (const entry of entries) {
          if (images.length >= maxResults) break
          // Skip hidden dirs / node_modules / .git
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
          const fullPath = `${dirPath}/${entry.name}`
          if (entry.isDirectory()) {
            scanDir(fullPath, depth + 1)
          } else if (entry.isFile()) {
            const ext = fullPath.slice(fullPath.lastIndexOf('.')).toLowerCase()
            if (imageExtensions.has(ext)) {
              images.push(fullPath)
            }
          }
        }
      } catch {
        // Permission errors, etc.
      }
    }

    scanDir(repoPath, 0)
    return { ok: true, images }
  }

  // -------------------------------------------------------------------------
  // Validation: rejects invalid projectId types
  // -------------------------------------------------------------------------
  describe('IPC-level projectId validation', () => {
    const itRejectsInvalidProjectId = (
      label: string,
      projectId: unknown,
    ) => {
      it(`rejects ${label} with project_not_found and empty images`, async () => {
        const findProjectById = vi.fn()
        const fsReadDirSync = vi.fn()

        const result = await scanProjectImages({
          projectId,
          findProjectById,
          fsReadDirSync,
        })

        expect(result).toEqual({ ok: false, reason: 'project_not_found', images: [] })
        expect(findProjectById).not.toHaveBeenCalled()
        expect(fsReadDirSync).not.toHaveBeenCalled()
      })
    }

    itRejectsInvalidProjectId('undefined', undefined)
    itRejectsInvalidProjectId('null', null)
    itRejectsInvalidProjectId('number', 42)
    itRejectsInvalidProjectId('boolean', true)
    itRejectsInvalidProjectId('object', { id: 'proj-1' })
    itRejectsInvalidProjectId('array', ['proj-1'])
    itRejectsInvalidProjectId('function', vi.fn())
  })

  describe('IPC-level projectId: rejects empty and whitespace strings', () => {
    it('rejects empty string', async () => {
      const findProjectById = vi.fn()
      const fsReadDirSync = vi.fn()

      const result = await scanProjectImages({
        projectId: '',
        findProjectById,
        fsReadDirSync,
      })

      expect(result).toEqual({ ok: false, reason: 'project_not_found', images: [] })
      expect(findProjectById).not.toHaveBeenCalled()
    })

    it('rejects whitespace-only string', async () => {
      const findProjectById = vi.fn()
      const fsReadDirSync = vi.fn()

      const result = await scanProjectImages({
        projectId: '   \n\t  ',
        findProjectById,
        fsReadDirSync,
      })

      expect(result).toEqual({ ok: false, reason: 'project_not_found', images: [] })
      expect(findProjectById).not.toHaveBeenCalled()
    })
  })

  describe('IPC-level projectId: trims before use', () => {
    it('trims whitespace-padded ID before DB lookup', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1', repo_path: '/repo' })
      const fsReadDirSync = vi.fn().mockReturnValue([])

      const result = await scanProjectImages({
        projectId: '  proj-1  ',
        findProjectById,
        fsReadDirSync,
      })

      expect(result.ok).toBe(true)
      expect(findProjectById).toHaveBeenCalledWith('proj-1')
    })
  })

  // -------------------------------------------------------------------------
  // DB lookup
  // -------------------------------------------------------------------------
  describe('DB lookup', () => {
    it('returns project_not_found when findProjectById returns null', async () => {
      const findProjectById = vi.fn().mockReturnValue(null)
      const fsReadDirSync = vi.fn()

      const result = await scanProjectImages({
        projectId: 'proj-nonexistent',
        findProjectById,
        fsReadDirSync,
      })

      expect(result).toEqual({ ok: false, reason: 'project_not_found', images: [] })
      expect(fsReadDirSync).not.toHaveBeenCalled()
    })

    it('returns project_not_found when repo_path is null', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1', repo_path: null })
      const fsReadDirSync = vi.fn()

      const result = await scanProjectImages({
        projectId: 'proj-1',
        findProjectById,
        fsReadDirSync,
      })

      expect(result).toEqual({ ok: false, reason: 'project_not_found', images: [] })
      expect(fsReadDirSync).not.toHaveBeenCalled()
    })

    it('scans when project has a repo_path', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1', repo_path: '/repo' })
      const fsReadDirSync = vi.fn().mockReturnValue([])

      const result = await scanProjectImages({
        projectId: 'proj-1',
        findProjectById,
        fsReadDirSync,
      })

      expect(result.ok).toBe(true)
      expect(fsReadDirSync).toHaveBeenCalledWith('/repo', { withFileTypes: true })
    })
  })

  // -------------------------------------------------------------------------
  // Image scanning
  // -------------------------------------------------------------------------
  describe('image scanning', () => {
    it('finds image files with correct extensions', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1', repo_path: '/repo' })
      const fsReadDirSync = vi.fn()
        .mockReturnValueOnce([
          { name: 'logo.png', isDirectory: () => false, isFile: () => true },
          { name: 'photo.jpg', isDirectory: () => false, isFile: () => true },
          { name: 'data.json', isDirectory: () => false, isFile: () => true },
          { name: 'frame.svg', isDirectory: () => false, isFile: () => true },
        ])
        .mockReturnValue([])

      const result = await scanProjectImages({
        projectId: 'proj-1',
        findProjectById,
        fsReadDirSync,
      })

      expect(result).toEqual({
        ok: true,
        images: ['/repo/logo.png', '/repo/photo.jpg', '/repo/frame.svg'],
      })
    })

    it('skips hidden directories and node_modules', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1', repo_path: '/repo' })
      const fsReadDirSync = vi.fn().mockReturnValueOnce([
        { name: '.hidden', isDirectory: () => true, isFile: () => false },
        { name: 'node_modules', isDirectory: () => true, isFile: () => false },
        { name: 'public', isDirectory: () => true, isFile: () => false },
      ])

      const result = await scanProjectImages({
        projectId: 'proj-1',
        findProjectById,
        fsReadDirSync,
      })

      expect(result.ok).toBe(true)
      // Should have recursed into 'public' but not '.hidden' or 'node_modules'
      // The public dir scan returns [] in our mock
      expect(fsReadDirSync).toHaveBeenCalledTimes(2) // root + public dir
    })

    it('limits results to maxResults (60)', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1', repo_path: '/repo' })
      // Return 70 image files
      const entries = Array.from({ length: 70 }, (_, i) => ({
        name: `img${i}.png`,
        isDirectory: () => false,
        isFile: () => true,
      }))
      const fsReadDirSync = vi.fn().mockReturnValue(entries)

      const result = await scanProjectImages({
        projectId: 'proj-1',
        findProjectById,
        fsReadDirSync,
      })

      expect(result.ok).toBe(true)
      expect(result.images).toHaveLength(60)
    })

    it('handles fs errors gracefully (permission denied)', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1', repo_path: '/repo' })
      const fsReadDirSync = vi.fn().mockImplementation(() => {
        throw new Error('EACCES: permission denied')
      })

      const result = await scanProjectImages({
        projectId: 'proj-1',
        findProjectById,
        fsReadDirSync,
      })

      expect(result).toEqual({ ok: true, images: [] })
    })

    it('scans nested directories up to maxDepth', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1', repo_path: '/repo' })
      const callLog: string[] = []
      const fsReadDirSync = vi.fn().mockImplementation((dirPath: string) => {
        callLog.push(dirPath)
        if (dirPath === '/repo') {
          return [{ name: 'sub1', isDirectory: () => true, isFile: () => false }]
        }
        if (dirPath === '/repo/sub1') {
          return [{ name: 'sub2', isDirectory: () => true, isFile: () => false }]
        }
        if (dirPath === '/repo/sub1/sub2') {
          return [{ name: 'sub3', isDirectory: () => true, isFile: () => false }]
        }
        // sub3 is at depth=3, should not be recursed into (maxDepth=3 means depth > 3 returns)
        return []
      })

      const result = await scanProjectImages({
        projectId: 'proj-1',
        findProjectById,
        fsReadDirSync,
      })

      expect(result.ok).toBe(true)
      // /repo (depth 0) → sub1 (depth 1) → sub2 (depth 2) → sub3 (depth 3, not recursed)
      // Wait: maxDepth=3 means depth > maxDepth returns, so scanDir starts at depth=0.
      // /repo: depth=0 → recurses into sub1
      // /repo/sub1: depth=1 → recurses into sub2
      // /repo/sub1/sub2: depth=2 → recurses into sub3
      // /repo/sub1/sub2/sub3: depth=3 → depth > maxDepth? 3 > 3 = false → scans! (depth == maxDepth is OK)
      // /repo/sub1/sub2/sub3: scanDir called with depth=3, since 3 > 3 is false, it scans. Then calls sub4 at depth=4 → 4 > 3 = true, stops.
      // Actually looking at the handler code: `if (depth > maxDepth || images.length >= maxResults) return`
      // So maxDepth=3 means depth must be > 3 to stop. Starting at depth 0, we go 0,1,2,3 — 3 levels deep. At depth=3 we scan but don't recurse further (since 3+1=4 > 3).
      // So we should see scans at depth 0, 1, 2, 3 — 4 levels.
      expect(callLog).toEqual([
        '/repo',
        '/repo/sub1',
        '/repo/sub1/sub2',
        '/repo/sub1/sub2/sub3', // depth=3: depth > 3 is false, so scans but doesn't recurse deeper
      ])
    })
  })

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------
  describe('happy path', () => {
    it('returns ok: true with empty array when no images found', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1', repo_path: '/repo' })
      const fsReadDirSync = vi.fn().mockReturnValue([
        { name: 'index.ts', isDirectory: () => false, isFile: () => true },
        { name: 'package.json', isDirectory: () => false, isFile: () => true },
      ])

      const result = await scanProjectImages({
        projectId: 'proj-1',
        findProjectById,
        fsReadDirSync,
      })

      expect(result).toEqual({ ok: true, images: [] })
    })
  })
})
