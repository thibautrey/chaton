import { beforeEach, describe, expect, it, vi } from 'vitest'

const getDbMock = vi.fn(() => ({ db: true }))
const listProjectsMock = vi.fn()
const findProjectByIdMock = vi.fn()
const updateProjectIsHiddenMock = vi.fn()
const listConversationsMock = vi.fn()
const listConversationsByProjectIdMock = vi.fn()

vi.mock('../../db/index.js', () => ({
  getDb: getDbMock,
}))

vi.mock('../../db/repos/projects.js', () => ({
  findProjectById: findProjectByIdMock,
  listProjects: listProjectsMock,
  updateProjectIsHidden: updateProjectIsHiddenMock,
}))

vi.mock('../../db/repos/conversations.js', () => ({
  listConversations: listConversationsMock,
  listConversationsByProjectId: listConversationsByProjectIdMock,
}))

const projectRow = (id: string, archived = 0) => ({
  id,
  name: id,
  repo_path: null,
  repo_name: id,
  is_archived: archived,
  is_hidden: 0,
  icon: null,
  location: 'local',
  cloud_instance_id: null,
  organization_id: null,
  organization_name: null,
  cloud_status: null,
  cloud_project_kind: null,
  cloud_workspace_capability: null,
  cloud_repository_clone_url: null,
  cloud_repository_default_branch: null,
  cloud_repository_auth_mode: null,
  created_at: '2026-05-27T00:00:00.000Z',
  updated_at: '2026-05-27T00:00:00.000Z',
})

describe('projects runtime API validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDbMock.mockReturnValue({ db: true })
    listProjectsMock.mockReturnValue([projectRow('project-a'), projectRow('project-b'), projectRow('archived', 1)])
    findProjectByIdMock.mockReturnValue(null)
    updateProjectIsHiddenMock.mockReturnValue(false)
    listConversationsMock.mockReturnValue([])
    listConversationsByProjectIdMock.mockReturnValue([])
  })

  it('rejects malformed project list limits before reading projects', async () => {
    const { chatonsListProjects } = await import('./projects.js')

    expect(chatonsListProjects({ limit: Number.NaN })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'limit must be a finite number' },
    })
    expect(chatonsListProjects({ limit: 1.5 })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'limit must be an integer' },
    })
    expect(chatonsListProjects({ limit: 0 })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'limit must be at least 1' },
    })
    expect(chatonsListProjects({ limit: 501 })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'limit must be at most 500' },
    })

    expect(getDbMock).not.toHaveBeenCalled()
    expect(listProjectsMock).not.toHaveBeenCalled()
  })

  it('applies valid project list limits after archive filtering', async () => {
    const { chatonsListProjects } = await import('./projects.js')

    expect(chatonsListProjects({ limit: 1 })).toEqual({
      ok: true,
      data: [expect.objectContaining({ id: 'project-a' })],
    })
    expect(listProjectsMock).toHaveBeenCalledWith({ db: true })
  })
})
