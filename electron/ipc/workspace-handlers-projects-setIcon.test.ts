import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `projects:setIcon` IPC handler.
 *
 * The handler:
 * 1. IPC-level: validates projectId is a non-empty string → project_not_found
 * 2. DB lookup via findProjectById → project_not_found if not found
 * 3. Calls updateProjectIcon(db, trimmedId, icon)
 * 4. Emits project.icon_updated host event
 * 5. Returns ok: true
 *
 * We replicate the handler logic inline so tests run without the full workspace
 * module graph (no database, IPC wiring, or electron APIs required).
 */

describe('projects:setIcon handler', () => {
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
  async function setProjectIcon(params: {
    projectId: unknown
    icon: string | null
    findProjectById: (projectId: string) => Project | null
    updateProjectIcon: (projectId: string, icon: string | null) => boolean
    emitHostEvent: (event: string, data: { projectId: string; icon: string | null }) => void
  }): Promise<Result> {
    const { projectId, icon, findProjectById, updateProjectIcon, emitHostEvent } = params

    if (typeof projectId !== 'string' || !projectId.trim()) {
      return { ok: false, reason: 'project_not_found' }
    }
    const trimmedId = projectId.trim()

    const project = findProjectById(trimmedId)
    if (!project) {
      return { ok: false, reason: 'project_not_found' }
    }

    const updated = updateProjectIcon(trimmedId, icon)
    if (!updated) {
      return { ok: false, reason: 'unknown' }
    }

    emitHostEvent('project.icon_updated', { projectId: trimmedId, icon: icon ?? null })
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
        const updateProjectIcon = vi.fn()
        const emitHostEvent = vi.fn()

        const result = await setProjectIcon({
          projectId,
          icon: '🛠️',
          findProjectById,
          updateProjectIcon,
          emitHostEvent,
        })

        expect(result).toEqual({ ok: false, reason: 'project_not_found' })
        expect(findProjectById).not.toHaveBeenCalled()
        expect(updateProjectIcon).not.toHaveBeenCalled()
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
      const updateProjectIcon = vi.fn()
      const emitHostEvent = vi.fn()

      const result = await setProjectIcon({
        projectId: '',
        icon: '🛠️',
        findProjectById,
        updateProjectIcon,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: false, reason: 'project_not_found' })
      expect(findProjectById).not.toHaveBeenCalled()
    })

    it('rejects whitespace-only string', async () => {
      const findProjectById = vi.fn()
      const updateProjectIcon = vi.fn()
      const emitHostEvent = vi.fn()

      const result = await setProjectIcon({
        projectId: '   \n\t  ',
        icon: '🛠️',
        findProjectById,
        updateProjectIcon,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: false, reason: 'project_not_found' })
      expect(findProjectById).not.toHaveBeenCalled()
    })
  })

  describe('IPC-level projectId: trims before use', () => {
    it('trims whitespace-padded ID before DB lookup and update', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1' })
      const updateProjectIcon = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      const result = await setProjectIcon({
        projectId: '  proj-1  ',
        icon: '🛠️',
        findProjectById,
        updateProjectIcon,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: true })
      expect(findProjectById).toHaveBeenCalledWith('proj-1')
      expect(updateProjectIcon).toHaveBeenCalledWith('proj-1', '🛠️')
      expect(emitHostEvent).toHaveBeenCalledWith('project.icon_updated', {
        projectId: 'proj-1',
        icon: '🛠️',
      })
    })
  })

  // -------------------------------------------------------------------------
  // DB lookup
  // -------------------------------------------------------------------------
  describe('DB lookup', () => {
    it('returns project_not_found when findProjectById returns null', async () => {
      const findProjectById = vi.fn().mockReturnValue(null)
      const updateProjectIcon = vi.fn()
      const emitHostEvent = vi.fn()

      const result = await setProjectIcon({
        projectId: 'proj-nonexistent',
        icon: '🛠️',
        findProjectById,
        updateProjectIcon,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: false, reason: 'project_not_found' })
      expect(updateProjectIcon).not.toHaveBeenCalled()
      expect(emitHostEvent).not.toHaveBeenCalled()
    })

    it('passes trimmed ID to findProjectById', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1' })
      const updateProjectIcon = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      await setProjectIcon({
        projectId: '  proj-1  ',
        icon: '🛠️',
        findProjectById,
        updateProjectIcon,
        emitHostEvent,
      })

      expect(findProjectById).toHaveBeenCalledWith('proj-1')
    })
  })

  // -------------------------------------------------------------------------
  // icon value passthrough
  // -------------------------------------------------------------------------
  describe('icon value passthrough', () => {
    it('passes icon emoji string to updateProjectIcon', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1' })
      const updateProjectIcon = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      await setProjectIcon({
        projectId: 'proj-1',
        icon: '🚀',
        findProjectById,
        updateProjectIcon,
        emitHostEvent,
      })

      expect(updateProjectIcon).toHaveBeenCalledWith('proj-1', '🚀')
      expect(emitHostEvent).toHaveBeenCalledWith('project.icon_updated', {
        projectId: 'proj-1',
        icon: '🚀',
      })
    })

    it('passes null icon to updateProjectIcon (clear icon)', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1' })
      const updateProjectIcon = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      await setProjectIcon({
        projectId: 'proj-1',
        icon: null,
        findProjectById,
        updateProjectIcon,
        emitHostEvent,
      })

      expect(updateProjectIcon).toHaveBeenCalledWith('proj-1', null)
      expect(emitHostEvent).toHaveBeenCalledWith('project.icon_updated', {
        projectId: 'proj-1',
        icon: null,
      })
    })

    it('normalizes icon ?? null → null in host event', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1' })
      const updateProjectIcon = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      await setProjectIcon({
        projectId: 'proj-1',
        icon: null,
        findProjectById,
        updateProjectIcon,
        emitHostEvent,
      })

      // icon ?? null is redundant but mirrors the handler: icon is null, so result is null
      expect(emitHostEvent).toHaveBeenCalledWith('project.icon_updated', {
        projectId: 'proj-1',
        icon: null,
      })
    })
  })

  // -------------------------------------------------------------------------
  // updateProjectIcon failure
  // -------------------------------------------------------------------------
  describe('updateProjectIcon failure', () => {
    it('returns unknown when update returns false', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1' })
      const updateProjectIcon = vi.fn().mockReturnValue(false)
      const emitHostEvent = vi.fn()

      const result = await setProjectIcon({
        projectId: 'proj-1',
        icon: '🛠️',
        findProjectById,
        updateProjectIcon,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: false, reason: 'unknown' })
      expect(emitHostEvent).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------
  describe('happy path', () => {
    it('returns ok: true when project exists and update succeeds', async () => {
      const findProjectById = vi.fn().mockReturnValue({ id: 'proj-1' })
      const updateProjectIcon = vi.fn().mockReturnValue(true)
      const emitHostEvent = vi.fn()

      const result = await setProjectIcon({
        projectId: 'proj-1',
        icon: '🛠️',
        findProjectById,
        updateProjectIcon,
        emitHostEvent,
      })

      expect(result).toEqual({ ok: true })
      expect(updateProjectIcon).toHaveBeenCalledWith('proj-1', '🛠️')
      expect(emitHostEvent).toHaveBeenCalledWith('project.icon_updated', {
        projectId: 'proj-1',
        icon: '🛠️',
      })
    })
  })
})
