import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `projects:setHidden` IPC handler.
 *
 * The handler:
 * 1. IPC-level: validates projectId is a non-empty string → project_not_found
 * 2. DB lookup via findProjectById → project_not_found if not found
 * 3. Calls updateProjectIsHidden(db, trimmedId, isHidden)
 * 4. Emits project.visibility_changed host event
 * 5. Returns ok: true
 *
 * We replicate the handler logic inline so tests run without the full workspace
 * module graph (no database, IPC wiring, or electron APIs required).
 */

describe('projects:setHidden handler', () => {
  // -------------------------------------------------------------------------
  // Types mirroring the real handler (workspace-handlers.ts)
  // -------------------------------------------------------------------------
  type Result =
    | { ok: true }
    | { ok: false; reason: 'project_not_found' | 'unknown' }

  interface Project {
    id: string
  }

  // -------------------------------------------------------------------------
  // Inline handler — mirrors workspace-handlers.ts
  // -------------------------------------------------------------------------
  async function setProjectHidden(params: {
    projectId: unknown
    isHidden: boolean
    findProjectById: (projectId: string) => Project | null
    updateProjectIsHidden: (projectId: string, isHidden: boolean) => boolean
    emitHostEvent: (event: string, data: { projectId: string; isHidden: boolean }) => void
  }): Promise<Result> {
    const { projectId, isHidden, findProjectById, updateProjectIsHidden, emitHostEvent } = params

    if (typeof projectId !== 'string' || !projectId.trim()) {
      return { ok: false, reason: 'project_not_found' }
    }
    const trimmedId = projectId.trim()

    const project = findProjectById(trimmedId)
    if (!project) {
      return { ok: false, reason: 'project_not_found' }
    }

    const updated = updateProjectIsHidden(trimmedId, isHidden)
    if (!updated) {
      return { ok: false, reason: 'unknown' }
    }

    emitHostEvent('project.visibility_changed', { projectId: trimmedId, isHidden })
    return { ok: true }
  }

  // -------------------------------------------------------------------------
  // Validation: rejects invalid projectId types
  // -------------------------------------------------------------------------
  describe('IPC-level projectId validation', () => {
    const itRejectsInvalidProjectId = (
      label: string,
      projectId: unknown,
    ) => {
      it(`rejects ${label} with project_not_found`, async () => {
        const findProjectById = vi.fn()
        const updateProjectIsHidden = vi.fn()
        const emitHostEvent = vi.fn()

        const result = await setProjectHidden({
          projectId,
          isHidden: true,
          findProjectById,
          updateProjectIsHidden,
          emitHostEvent,
        })

        expect(result).toEqual({ ok: false, reason: 'project_not_found' })
        expect(findProjectById).not.toHaveBeenCalled()
        expect(updateProjectIsHidden).not.toHaveBeenCalled()
        expect(emitHostEvent).not.toHaveBeenCalled()
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
      const updateProjectIsHidden = vi.fn()
      const emitHostEvent = vi.fn()

      const result = await setProjectHidden({
        projectId: '',
        isHidden: true,
        findProjectById,
        updateProjectIsHidden,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: false, reason: 'project_not_found' })
      expect(findProjectById).not.toHaveBeenCalled()
    })

    it('rejects whitespace-only string', async () => {
      const findProjectById = vi.fn()
      const updateProjectIsHidden = vi.fn()
      const emitHostEvent = vi.fn()

      const result = await setProjectHidden({
        projectId: '   \n\t  ',
        isHidden: true,
        findProjectById,
        updateProjectIsHidden,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: false, reason: 'project_not_found' })
      expect(findProjectById).not.toHaveBeenCalled()
    })
  })

  describe('IPC-level projectId: trims before use', () => {
    it('trims whitespace-padded ID before DB lookup and update', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1' })
      const updateProjectIsHidden = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      const result = await setProjectHidden({
        projectId: '  proj-1  ',
        isHidden: true,
        findProjectById,
        updateProjectIsHidden,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: true })
      expect(findProjectById).toHaveBeenCalledWith('proj-1')
      expect(updateProjectIsHidden).toHaveBeenCalledWith('proj-1', true)
      expect(emitHostEvent).toHaveBeenCalledWith('project.visibility_changed', {
        projectId: 'proj-1',
        isHidden: true,
      })
    })
  })

  // -------------------------------------------------------------------------
  // DB lookup
  // -------------------------------------------------------------------------
  describe('DB lookup', () => {
    it('returns project_not_found when findProjectById returns null', async () => {
      const findProjectById = vi.fn().mockReturnValue(null)
      const updateProjectIsHidden = vi.fn()
      const emitHostEvent = vi.fn()

      const result = await setProjectHidden({
        projectId: 'proj-nonexistent',
        isHidden: true,
        findProjectById,
        updateProjectIsHidden,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: false, reason: 'project_not_found' })
      expect(updateProjectIsHidden).not.toHaveBeenCalled()
      expect(emitHostEvent).not.toHaveBeenCalled()
    })

    it('passes trimmed ID to findProjectById', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1' })
      const updateProjectIsHidden = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      await setProjectHidden({
        projectId: '  proj-1  ',
        isHidden: true,
        findProjectById,
        updateProjectIsHidden,
        emitHostEvent,
      })

      expect(findProjectById).toHaveBeenCalledWith('proj-1')
    })
  })

  // -------------------------------------------------------------------------
  // isHidden value
  // -------------------------------------------------------------------------
  describe('isHidden value', () => {
    it('passes isHidden=true to updateProjectIsHidden', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1' })
      const updateProjectIsHidden = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      await setProjectHidden({
        projectId: 'proj-1',
        isHidden: true,
        findProjectById,
        updateProjectIsHidden,
        emitHostEvent,
      })

      expect(updateProjectIsHidden).toHaveBeenCalledWith('proj-1', true)
    })

    it('passes isHidden=false to updateProjectIsHidden', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1' })
      const updateProjectIsHidden = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      await setProjectHidden({
        projectId: 'proj-1',
        isHidden: false,
        findProjectById,
        updateProjectIsHidden,
        emitHostEvent,
      })

      expect(updateProjectIsHidden).toHaveBeenCalledWith('proj-1', false)
    })
  })

  // -------------------------------------------------------------------------
  // updateProjectIsHidden failure
  // -------------------------------------------------------------------------
  describe('updateProjectIsHidden failure', () => {
    it('returns unknown when update returns false', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1' })
      const updateProjectIsHidden = vi.fn().mockReturnValue(false)
      const emitHostEvent = vi.fn()

      const result = await setProjectHidden({
        projectId: 'proj-1',
        isHidden: true,
        findProjectById,
        updateProjectIsHidden,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: false, reason: 'unknown' })
      expect(emitHostEvent).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Host event
  // -------------------------------------------------------------------------
  describe('host event', () => {
    it('emits project.visibility_changed with projectId and isHidden', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1' })
      const updateProjectIsHidden = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      await setProjectHidden({
        projectId: 'proj-1',
        isHidden: true,
        findProjectById,
        updateProjectIsHidden,
        emitHostEvent,
      })

      expect(emitHostEvent).toHaveBeenCalledWith('project.visibility_changed', {
        projectId: 'proj-1',
        isHidden: true,
      })
    })

    it('uses trimmed ID in host event', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1' })
      const updateProjectIsHidden = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      await setProjectHidden({
        projectId: '  proj-1  ',
        isHidden: false,
        findProjectById,
        updateProjectIsHidden,
        emitHostEvent,
      })

      expect(emitHostEvent).toHaveBeenCalledWith('project.visibility_changed', {
        projectId: 'proj-1',
        isHidden: false,
      })
    })
  })

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------
  describe('happy path', () => {
    it('returns ok: true when project exists and update succeeds', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1' })
      const updateProjectIsHidden = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      const result = await setProjectHidden({
        projectId: 'proj-1',
        isHidden: true,
        findProjectById,
        updateProjectIsHidden,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: true })
      expect(updateProjectIsHidden).toHaveBeenCalledWith('proj-1', true)
      expect(emitHostEvent).toHaveBeenCalledWith('project.visibility_changed', {
        projectId: 'proj-1',
        isHidden: true,
      })
    })
  })
})
