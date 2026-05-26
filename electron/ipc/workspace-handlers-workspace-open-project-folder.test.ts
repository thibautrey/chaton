import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `workspace:openProjectFolder` IPC handler.
 *
 * The handler:
 * 1. Validates projectId at the IPC boundary — rejects non-string and empty strings
 * 2. Returns `projectId is required` for invalid input
 * 3. Returns `project_not_found` when no project exists in the DB
 * 4. Returns an error when the project is a cloud project (no local folder)
 * 5. Returns an error when the project path does not exist on disk
 * 6. Calls shell.openPath and returns `ok: true` on success
 * 7. Catches and surfaces shell.openPath errors gracefully
 *
 * We replicate the handler logic inline so tests run without the full workspace
 * module graph (no database, IPC wiring, or shell wiring required).
 */

describe('workspace:openProjectFolder handler', () => {
  // -------------------------------------------------------------------------
  // Types mirroring the real handler (lines 2768–2801)
  // -------------------------------------------------------------------------
  type Result =
    | { ok: true }
    | { ok: false; reason?: string; message?: string }

  interface Project {
    id: string
    location: 'local' | 'cloud'
    repo_path: string | null
  }

  // -------------------------------------------------------------------------
  // Inline handler — mirrors workspace-handlers.ts lines 2768–2801.
  // -------------------------------------------------------------------------
  async function openProjectFolder(params: {
    projectId: unknown
    findProjectById: (projectId: string) => Project | null
    shellOpenPath: (path: string) => Promise<string>
    fsExistsSync: (path: string) => boolean
  }): Promise<Result> {
    const { projectId, findProjectById, shellOpenPath, fsExistsSync } = params

    if (typeof projectId !== 'string' || !projectId.trim()) {
      return { ok: false, reason: 'projectId is required' }
    }
    const trimmedId = projectId.trim()

    const project = findProjectById(trimmedId)
    if (!project) {
      return { ok: false, reason: 'project_not_found' }
    }

    try {
      if (project.location === 'cloud' || !project.repo_path) {
        return {
          ok: false,
          message: 'Cloud projects do not expose a local folder on this desktop.',
        }
      }
      if (!fsExistsSync(project.repo_path)) {
        return {
          ok: false,
          message: `Project path does not exist: ${project.repo_path}`,
        }
      }
      await shellOpenPath(project.repo_path)
      return { ok: true }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      return {
        ok: false,
        message: `Failed to open path: ${errorMessage}`,
      }
    }
  }

  // -------------------------------------------------------------------------
  // Shared mock implementations
  // -------------------------------------------------------------------------
  const mockFindProjectById = vi.fn()
  const mockShellOpenPath = vi.fn()
  const mockFsExistsSync = vi.fn()

  function makeParams(projectId: unknown) {
    return {
      projectId,
      findProjectById: mockFindProjectById,
      shellOpenPath: mockShellOpenPath,
      fsExistsSync: mockFsExistsSync,
    }
  }

  // -------------------------------------------------------------------------
  // IPC-level projectId validation
  // -------------------------------------------------------------------------
  describe('IPC-level projectId validation', () => {
    it('rejects undefined', async () => {
      const result = await openProjectFolder(makeParams(undefined))
      expect(result).toEqual({ ok: false, reason: 'projectId is required' })
    })

    it('rejects null', async () => {
      const result = await openProjectFolder(makeParams(null))
      expect(result).toEqual({ ok: false, reason: 'projectId is required' })
    })

    it('rejects number', async () => {
      const result = await openProjectFolder(makeParams(42))
      expect(result).toEqual({ ok: false, reason: 'projectId is required' })
    })

    it('rejects object', async () => {
      const result = await openProjectFolder(makeParams({ id: 'proj-1' }))
      expect(result).toEqual({ ok: false, reason: 'projectId is required' })
    })

    it('rejects array', async () => {
      const result = await openProjectFolder(makeParams(['proj-1']))
      expect(result).toEqual({ ok: false, reason: 'projectId is required' })
    })

    it('rejects empty string', async () => {
      const result = await openProjectFolder(makeParams(''))
      expect(result).toEqual({ ok: false, reason: 'projectId is required' })
    })

    it('rejects whitespace-only string', async () => {
      const result = await openProjectFolder(makeParams('   \t\n  '))
      expect(result).toEqual({ ok: false, reason: 'projectId is required' })
    })

    it('accepts valid non-empty string', async () => {
      mockFindProjectById.mockReturnValue(null) // handled by DB lookup below
      const result = await openProjectFolder(makeParams('proj-123'))
      // findProjectById will be called with trimmed value
      expect(mockFindProjectById).toHaveBeenCalledWith('proj-123')
      void result // DB returns null → project_not_found (tested separately)
    })

    it('trims whitespace from projectId before DB lookup', async () => {
      mockFindProjectById.mockReturnValue(null)
      await openProjectFolder(makeParams('  proj-abc  '))
      expect(mockFindProjectById).toHaveBeenCalledWith('proj-abc')
    })

    it('validation fires before findProjectById is called', async () => {
      mockFindProjectById.mockReset()
      mockFindProjectById.mockReturnValue(null)
      await openProjectFolder(makeParams(undefined))
      expect(mockFindProjectById).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // DB lookup
  // -------------------------------------------------------------------------
  describe('DB lookup', () => {
    it('returns project_not_found when findProjectById returns null', async () => {
      mockFindProjectById.mockReturnValue(null)
      const result = await openProjectFolder(makeParams('proj-nonexistent'))
      expect(result).toEqual({ ok: false, reason: 'project_not_found' })
      expect(mockFindProjectById).toHaveBeenCalledWith('proj-nonexistent')
    })
  })

  // -------------------------------------------------------------------------
  // Cloud project (no local folder)
  // -------------------------------------------------------------------------
  describe('cloud project', () => {
    it('returns error when project location is cloud', async () => {
      mockFindProjectById.mockReturnValue({
        id: 'proj-cloud',
        location: 'cloud',
        repo_path: null,
      })
      const result = await openProjectFolder(makeParams('proj-cloud'))
      expect(result).toEqual({
        ok: false,
        message: 'Cloud projects do not expose a local folder on this desktop.',
      })
      // shell.openPath should not be called for cloud projects
      expect(mockShellOpenPath).not.toHaveBeenCalled()
    })

    it('returns error when repo_path is null even for local project', async () => {
      mockFindProjectById.mockReturnValue({
        id: 'proj-no-path',
        location: 'local',
        repo_path: null,
      })
      const result = await openProjectFolder(makeParams('proj-no-path'))
      expect(result).toEqual({
        ok: false,
        message: 'Cloud projects do not expose a local folder on this desktop.',
      })
    })
  })

  // -------------------------------------------------------------------------
  // Path existence check
  // -------------------------------------------------------------------------
  describe('path existence check', () => {
    it('returns error when repo_path does not exist on disk', async () => {
      mockFindProjectById.mockReturnValue({
        id: 'proj-missing',
        location: 'local',
        repo_path: '/nonexistent/path',
      })
      mockFsExistsSync.mockReturnValue(false)
      const result = await openProjectFolder(makeParams('proj-missing'))
      expect(result).toEqual({
        ok: false,
        message: 'Project path does not exist: /nonexistent/path',
      })
      expect(mockFsExistsSync).toHaveBeenCalledWith('/nonexistent/path')
      expect(mockShellOpenPath).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Happy path — shell.openPath
  // -------------------------------------------------------------------------
  describe('happy path', () => {
    it('returns ok: true when path exists and shell.openPath succeeds', async () => {
      mockFindProjectById.mockReturnValue({
        id: 'proj-good',
        location: 'local',
        repo_path: '/Users/thibaut/projects/my-project',
      })
      mockFsExistsSync.mockReturnValue(true)
      mockShellOpenPath.mockResolvedValue('')
      const result = await openProjectFolder(makeParams('proj-good'))
      expect(result).toEqual({ ok: true })
      expect(mockShellOpenPath).toHaveBeenCalledWith('/Users/thibaut/projects/my-project')
    })

    it('passes trimmed projectId to findProjectById', async () => {
      mockFindProjectById.mockReturnValue({
        id: 'proj-trimmed',
        location: 'local',
        repo_path: '/valid/path',
      })
      mockFsExistsSync.mockReturnValue(true)
      mockShellOpenPath.mockResolvedValue('')
      await openProjectFolder(makeParams('  proj-trimmed  '))
      expect(mockFindProjectById).toHaveBeenCalledWith('proj-trimmed')
    })
  })

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------
  describe('shell.openPath error handling', () => {
    it('catches and surfaces shell.openPath errors gracefully', async () => {
      mockFindProjectById.mockReturnValue({
        id: 'proj-error',
        location: 'local',
        repo_path: '/valid/path',
      })
      mockFsExistsSync.mockReturnValue(true)
      const error = new Error('Permission denied')
      mockShellOpenPath.mockRejectedValue(error)
      const result = await openProjectFolder(makeParams('proj-error'))
      expect(result).toEqual({
        ok: false,
        message: 'Failed to open path: Permission denied',
      })
    })

    it('handles non-Error rejections from shell.openPath', async () => {
      mockFindProjectById.mockReturnValue({
        id: 'proj-string-error',
        location: 'local',
        repo_path: '/valid/path',
      })
      mockFsExistsSync.mockReturnValue(true)
      mockShellOpenPath.mockRejectedValue('Something went wrong')
      const result = await openProjectFolder(makeParams('proj-string-error'))
      expect(result).toEqual({
        ok: false,
        message: 'Failed to open path: Something went wrong',
      })
    })
  })
})
