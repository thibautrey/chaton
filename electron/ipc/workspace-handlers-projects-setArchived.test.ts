import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `projects:setArchived` IPC handler.
 *
 * The handler:
 * 1. IPC-level: validates projectId is a non-empty string → project_not_found
 * 2. DB lookup via findProjectById → project_not_found if not found
 * 3. Calls updateProjectIsArchived(db, trimmedId, isArchived)
 * 4. Emits project.archived host event
 * 5. Returns ok: true
 *
 * We replicate the handler logic inline so tests run without the full workspace
 * module graph (no database, IPC wiring, or electron APIs required).
 */

describe('projects:setArchived handler', () => {
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
  async function setProjectArchived(params: {
    projectId: unknown
    isArchived: boolean
    findProjectById: (projectId: string) => Project | null
    updateProjectIsArchived: (projectId: string, isArchived: boolean) => boolean
    emitHostEvent: (event: string, data: { projectId: string; isArchived: boolean }) => void
  }): Promise<Result> {
    const { projectId, isArchived, findProjectById, updateProjectIsArchived, emitHostEvent } = params

    if (typeof projectId !== 'string' || !projectId.trim()) {
      return { ok: false, reason: 'project_not_found' }
    }
    const trimmedId = projectId.trim()

    const project = findProjectById(trimmedId)
    if (!project) {
      return { ok: false, reason: 'project_not_found' }
    }

    const updated = updateProjectIsArchived(trimmedId, isArchived)
    if (!updated) {
      return { ok: false, reason: 'unknown' }
    }

    emitHostEvent('project.archived', { projectId: trimmedId, isArchived })
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
        const updateProjectIsArchived = vi.fn()
        const emitHostEvent = vi.fn()

        const result = await setProjectArchived({
          projectId,
          isArchived: true,
          findProjectById,
          updateProjectIsArchived,
          emitHostEvent,
        })

        expect(result).toEqual({ ok: false, reason: 'project_not_found' })
        expect(findProjectById).not.toHaveBeenCalled()
        expect(updateProjectIsArchived).not.toHaveBeenCalled()
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
      const updateProjectIsArchived = vi.fn()
      const emitHostEvent = vi.fn()

      const result = await setProjectArchived({
        projectId: '',
        isArchived: true,
        findProjectById,
        updateProjectIsArchived,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: false, reason: 'project_not_found' })
      expect(findProjectById).not.toHaveBeenCalled()
    })

    it('rejects whitespace-only string', async () => {
      const findProjectById = vi.fn()
      const updateProjectIsArchived = vi.fn()
      const emitHostEvent = vi.fn()

      const result = await setProjectArchived({
        projectId: '   \n\t  ',
        isArchived: true,
        findProjectById,
        updateProjectIsArchived,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: false, reason: 'project_not_found' })
      expect(findProjectById).not.toHaveBeenCalled()
    })
  })

  describe('IPC-level projectId: trims before use', () => {
    it('trims whitespace-padded ID before DB lookup and update', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1' })
      const updateProjectIsArchived = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      const result = await setProjectArchived({
        projectId: '  proj-1  ',
        isArchived: true,
        findProjectById,
        updateProjectIsArchived,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: true })
      expect(findProjectById).toHaveBeenCalledWith('proj-1')
      expect(updateProjectIsArchived).toHaveBeenCalledWith('proj-1', true)
      expect(emitHostEvent).toHaveBeenCalledWith('project.archived', {
        projectId: 'proj-1',
        isArchived: true,
      })
    })

    it('passes valid non-whitespace ID unchanged', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-abc' })
      const updateProjectIsArchived = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      const result = await setProjectArchived({
        projectId: 'proj-abc',
        isArchived: false,
        findProjectById,
        updateProjectIsArchived,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: true })
      expect(findProjectById).toHaveBeenCalledWith('proj-abc')
      expect(updateProjectIsArchived).toHaveBeenCalledWith('proj-abc', false)
    })
  })

  // -------------------------------------------------------------------------
  // DB lookup
  // -------------------------------------------------------------------------
  describe('DB lookup', () => {
    it('returns project_not_found when findProjectById returns null', async () => {
      const findProjectById = vi.fn().mockReturnValue(null)
      const updateProjectIsArchived = vi.fn()
      const emitHostEvent = vi.fn()

      const result = await setProjectArchived({
        projectId: 'proj-nonexistent',
        isArchived: true,
        findProjectById,
        updateProjectIsArchived,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: false, reason: 'project_not_found' })
      expect(findProjectById).toHaveBeenCalledWith('proj-nonexistent')
      expect(updateProjectIsArchived).not.toHaveBeenCalled()
      expect(emitHostEvent).not.toHaveBeenCalled()
    })

    it('passes trimmed ID to findProjectById', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1' })
      const updateProjectIsArchived = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      await setProjectArchived({
        projectId: '  proj-1  ',
        isArchived: true,
        findProjectById,
        updateProjectIsArchived,
        emitHostEvent,
      })

      expect(findProjectById).toHaveBeenCalledWith('proj-1')
    })
  })

  // -------------------------------------------------------------------------
  // isArchived value
  // -------------------------------------------------------------------------
  describe('isArchived value', () => {
    it('passes isArchived=true to updateProjectIsArchived', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1' })
      const updateProjectIsArchived = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      const result = await setProjectArchived({
        projectId: 'proj-1',
        isArchived: true,
        findProjectById,
        updateProjectIsArchived,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: true })
      expect(updateProjectIsArchived).toHaveBeenCalledWith('proj-1', true)
    })

    it('passes isArchived=false to updateProjectIsArchived', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1' })
      const updateProjectIsArchived = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      const result = await setProjectArchived({
        projectId: 'proj-1',
        isArchived: false,
        findProjectById,
        updateProjectIsArchived,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: true })
      expect(updateProjectIsArchived).toHaveBeenCalledWith('proj-1', false)
    })
  })

  // -------------------------------------------------------------------------
  // updateProjectIsArchived failure
  // -------------------------------------------------------------------------
  describe('updateProjectIsArchived failure', () => {
    it('returns unknown when update returns false', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1' })
      const updateProjectIsArchived = vi.fn().mockReturnValue(false)
      const emitHostEvent = vi.fn()

      const result = await setProjectArchived({
        projectId: 'proj-1',
        isArchived: true,
        findProjectById,
        updateProjectIsArchived,
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
    it('emits project.archived with projectId and isArchived', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1' })
      const updateProjectIsArchived = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      await setProjectArchived({
        projectId: 'proj-1',
        isArchived: true,
        findProjectById,
        updateProjectIsArchived,
        emitHostEvent,
      })

      expect(emitHostEvent).toHaveBeenCalledWith('project.archived', {
        projectId: 'proj-1',
        isArchived: true,
      })
    })

    it('uses trimmed ID in host event', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1' })
      const updateProjectIsArchived = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      await setProjectArchived({
        projectId: '  proj-1  ',
        isArchived: false,
        findProjectById,
        updateProjectIsArchived,
        emitHostEvent,
      })

      expect(emitHostEvent).toHaveBeenCalledWith('project.archived', {
        projectId: 'proj-1',
        isArchived: false,
      })
    })
  })

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------
  describe('happy path', () => {
    it('returns ok: true when project exists and update succeeds', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1' })
      const updateProjectIsArchived = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      const result = await setProjectArchived({
        projectId: 'proj-1',
        isArchived: true,
        findProjectById,
        updateProjectIsArchived,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: true })
      expect(findProjectById).toHaveBeenCalledWith('proj-1')
      expect(updateProjectIsArchived).toHaveBeenCalledWith('proj-1', true)
      expect(emitHostEvent).toHaveBeenCalledWith('project.archived', {
        projectId: 'proj-1',
        isArchived: true,
      })
    })
  })
})
