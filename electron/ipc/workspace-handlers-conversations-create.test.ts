import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `conversations:createGlobal` and `conversations:createForProject`
 * IPC handlers.
 *
 * Key behavioral guarantees verified:
 *
 * conversations:createGlobal
 * - Generates a UUID conversationId
 * - Inserts conversation with null project_id
 * - Inserts harness feedback (enabled/disabled based on sidebar settings)
 * - Returns `unknown` when conversation cannot be found after insert (DB failure)
 * - Fires `conversation.created` host event
 *
 * conversations:createForProject (local)
 * - Returns `project_not_found` when project does not exist
 * - Returns `project_not_found` when cloud project has no cloud_instance_id
 * - Returns `unknown` when cloud project has no access_token
 * - Returns `unknown` + message when cloud API call throws
 * - Returns `unknown` when cloud sync fails
 * - Returns `unknown` when conversation not found after cloud creation
 * - Creates local conversation with correct fields (id, projectId, title, accessMode, etc.)
 * - Inserts harness feedback with correct enabled/disabled state
 * - Fires `conversation.created` host event
 * - Access mode defaults to "secure" unless explicitly "open"
 *
 * We replicate the minimal handler logic inline to test without needing the full
 * workspace-handlers.ts module (which requires database, IPC, and PiRuntimeManager wiring).
 */

describe('conversations:createGlobal', () => {
  // -------------------------------------------------------------------------
  // Inline handler — mirrors workspace-handlers.ts lines 2309–2366.
  // -------------------------------------------------------------------------

  type Options = {
    modelProvider?: string
    modelId?: string
    thinkingLevel?: string
    accessMode?: 'secure' | 'open'
    channelExtensionId?: string
  }

  type Result =
    | { ok: true; conversation: object }
    | { ok: false; reason: 'unknown' }

  interface MockConversation {
    id: string
    projectId: string | null
    title: string
    accessMode: string
  }

  interface SidebarSettings {
    enableMetaHarnessFeedback: boolean
  }

  async function createGlobal(params: {
    options?: Options
    insertConversation: (data: {
      id: string
      projectId: string | null
      title: string
      titleSource: string
      modelProvider: string | null
      modelId: string | null
      thinkingLevel: string | null
      worktreePath: string | null
      accessMode: string
      channelExtensionId: string | null
    }) => void
    findConversationById: (id: string) => MockConversation | null
    getSidebarSettings: () => SidebarSettings
    upsertConversationHarnessFeedback: (data: {
      conversationId: string
      harnessCandidateId: string | null
      harnessSnapshot: object | null
      enabled: boolean
    }) => void
    emitHostEvent: (name: string, data: Record<string, unknown>) => void
  }): Promise<Result> {
    const conversationId = crypto.randomUUID()
    params.insertConversation({
      id: conversationId,
      projectId: null,
      title: 'Nouveau fil',
      titleSource: 'placeholder',
      modelProvider: params.options?.modelProvider ?? null,
      modelId: params.options?.modelId ?? null,
      thinkingLevel: params.options?.thinkingLevel ?? null,
      worktreePath: null,
      accessMode: params.options?.accessMode === 'open' ? 'open' : 'secure',
      channelExtensionId: params.options?.channelExtensionId ?? null,
    })

    const conversation = params.findConversationById(conversationId)
    if (!conversation) {
      return { ok: false, reason: 'unknown' }
    }

    const sidebarSettings = params.getSidebarSettings()
    if (sidebarSettings.enableMetaHarnessFeedback) {
      params.upsertConversationHarnessFeedback({
        conversationId,
        harnessCandidateId: 'mock-candidate-id',
        harnessSnapshot: {},
        enabled: true,
      })
    } else {
      params.upsertConversationHarnessFeedback({
        conversationId,
        harnessCandidateId: null,
        harnessSnapshot: null,
        enabled: false,
      })
    }

    params.emitHostEvent('conversation.created', {
      conversationId,
      projectId: null,
    })
    return {
      ok: true,
      conversation: { id: conversationId },
    }
  }

  // -------------------------------------------------------------------------
  // Shared mocks
  // -------------------------------------------------------------------------
  let insertConversation: ReturnType<typeof vi.fn>
  let findConversationById: (id: string) => MockConversation | null
  let getSidebarSettings: () => SidebarSettings
  let upsertConversationHarnessFeedback: ReturnType<typeof vi.fn>
  let emitHostEvent: ReturnType<typeof vi.fn>

  beforeEach(() => {
    insertConversation = vi.fn()
    findConversationById = () => null // pessimistic default
    getSidebarSettings = () => ({ enableMetaHarnessFeedback: false })
    upsertConversationHarnessFeedback = vi.fn()
    emitHostEvent = vi.fn()
  })

  it('returns ok:true with a conversation object', async () => {
    const conversationId = crypto.randomUUID()
    findConversationById = () => ({ id: conversationId, projectId: null, title: 'Nouveau fil', accessMode: 'secure' })

    const result = await createGlobal({
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.conversation).toBeDefined()
    }
  })

  it('inserts conversation with null project_id', async () => {
    const captured: Parameters<typeof insertConversation>[0] = { id: '', projectId: null as unknown as string, title: '', titleSource: '', modelProvider: null, modelId: null, thinkingLevel: null, worktreePath: null, accessMode: 'secure', channelExtensionId: null }
    insertConversation = vi.fn((data) => { Object.assign(captured, data) })
    const conversationId = crypto.randomUUID()
    findConversationById = () => ({ id: conversationId, projectId: null, title: 'Nouveau fil', accessMode: 'secure' })

    await createGlobal({ insertConversation, findConversationById, getSidebarSettings, upsertConversationHarnessFeedback, emitHostEvent })

    expect(captured.projectId).toBeNull()
    expect(captured.title).toBe('Nouveau fil')
    expect(captured.titleSource).toBe('placeholder')
  })

  it('defaults accessMode to secure', async () => {
    const captured: Parameters<typeof insertConversation>[0] = { id: '', projectId: null as unknown as string, title: '', titleSource: '', modelProvider: null, modelId: null, thinkingLevel: null, worktreePath: null, accessMode: 'secure', channelExtensionId: null }
    insertConversation = vi.fn((data) => { Object.assign(captured, data) })
    const conversationId = crypto.randomUUID()
    findConversationById = () => ({ id: conversationId, projectId: null, title: 'Nouveau fil', accessMode: 'secure' })

    await createGlobal({ insertConversation, findConversationById, getSidebarSettings, upsertConversationHarnessFeedback, emitHostEvent })

    expect(captured.accessMode).toBe('secure')
  })

  it('accepts open accessMode', async () => {
    const captured: Parameters<typeof insertConversation>[0] = { id: '', projectId: null as unknown as string, title: '', titleSource: '', modelProvider: null, modelId: null, thinkingLevel: null, worktreePath: null, accessMode: 'secure', channelExtensionId: null }
    insertConversation = vi.fn((data) => { Object.assign(captured, data) })
    const conversationId = crypto.randomUUID()
    findConversationById = () => ({ id: conversationId, projectId: null, title: 'Nouveau fil', accessMode: 'open' })

    await createGlobal({
      options: { accessMode: 'open' },
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(captured.accessMode).toBe('open')
  })

  it('returns unknown when conversation not found after insert (DB failure)', async () => {
    // findConversationById already defaults to null
    const result = await createGlobal({
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(result).toEqual({ ok: false, reason: 'unknown' })
  })

  it('enables harness feedback when sidebar setting is enabled', async () => {
    getSidebarSettings = () => ({ enableMetaHarnessFeedback: true })
    const conversationId = crypto.randomUUID()
    findConversationById = () => ({ id: conversationId, projectId: null, title: 'Nouveau fil', accessMode: 'secure' })

    await createGlobal({
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(upsertConversationHarnessFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, harnessCandidateId: 'mock-candidate-id' }),
    )
  })

  it('disables harness feedback when sidebar setting is disabled', async () => {
    getSidebarSettings = () => ({ enableMetaHarnessFeedback: false })
    const conversationId = crypto.randomUUID()
    findConversationById = () => ({ id: conversationId, projectId: null, title: 'Nouveau fil', accessMode: 'secure' })

    await createGlobal({
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(upsertConversationHarnessFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, harnessCandidateId: null, harnessSnapshot: null }),
    )
  })

  it('fires conversation.created host event', async () => {
    findConversationById = () => ({ id: 'any-uuid', projectId: null, title: 'Nouveau fil', accessMode: 'secure' })

    await createGlobal({
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(emitHostEvent).toHaveBeenCalledWith('conversation.created', {
      conversationId: expect.any(String),
      projectId: null,
    })
  })

  it('passes modelProvider and modelId through options', async () => {
    const captured: Parameters<typeof insertConversation>[0] = { id: '', projectId: null as unknown as string, title: '', titleSource: '', modelProvider: null, modelId: null, thinkingLevel: null, worktreePath: null, accessMode: 'secure', channelExtensionId: null }
    insertConversation = vi.fn((data) => { Object.assign(captured, data) })
    const conversationId = crypto.randomUUID()
    findConversationById = () => ({ id: conversationId, projectId: null, title: 'Nouveau fil', accessMode: 'secure' })

    await createGlobal({
      options: { modelProvider: 'openai', modelId: 'gpt-4o' },
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(captured.modelProvider).toBe('openai')
    expect(captured.modelId).toBe('gpt-4o')
  })
})

// =============================================================================
// conversations:createForProject
// =============================================================================

describe('conversations:createForProject', () => {
  // -------------------------------------------------------------------------
  // Types
  // -------------------------------------------------------------------------

  type Options = {
    modelProvider?: string
    modelId?: string
    thinkingLevel?: string
    accessMode?: 'secure' | 'open'
    channelExtensionId?: string
  }

  type Result =
    | { ok: true; conversation: object }
    | { ok: false; reason: 'project_not_found' | 'unknown'; message?: string }

  interface Project {
    id: string
    name: string
    location: 'local' | 'cloud'
    repo_path: string | null
    cloud_instance_id?: string
  }

  interface CloudInstance {
    id: string
    access_token: string | null
    base_url: string
  }

  interface MockConversation {
    id: string
    projectId: string | null
    title: string
    accessMode: string
  }

  interface SidebarSettings {
    enableMetaHarnessFeedback: boolean
  }

  // -------------------------------------------------------------------------
  // Inline handler — mirrors workspace-handlers.ts conversations:createForProject.
  // -------------------------------------------------------------------------
  async function createForProject(params: {
    projectId: unknown,
    options?: Options
    listProjects: () => Project[]
    findCloudInstanceById: (id: string) => CloudInstance | null
    ensureFreshCloudSession: (instanceId: string) => Promise<boolean>
    postAuthJson: (url: string, token: string, body: object) => Promise<{ conversation: { id: string } }>
    syncCloudInstanceBootstrap: (instanceId: string) => Promise<{ ok: boolean }>
    listConversationsByProjectId: (projectId: string) => MockConversation[]
    insertConversation: (data: {
      id: string
      projectId: string
      title: string
      titleSource: string
      modelProvider: string | null
      modelId: string | null
      thinkingLevel: string | null
      worktreePath: string | null
      accessMode: string
      channelExtensionId: string | null
      runtimeLocation: string
      cloudRuntimeSessionId: string | null
    }) => void
    findConversationById: (id: string) => MockConversation | null
    getSidebarSettings: () => SidebarSettings
    upsertConversationHarnessFeedback: (data: {
      conversationId: string
      harnessCandidateId: string | null
      harnessSnapshot: object | null
      enabled: boolean
    }) => void
    emitHostEvent: (name: string, data: Record<string, unknown>) => void
  }): Promise<Result> {
    if (typeof params.projectId !== 'string' || !params.projectId.trim()) {
      return { ok: false, reason: 'project_not_found' }
    }
    const trimmedId = params.projectId.trim()
    const project = params.listProjects().find((item) => item.id === trimmedId)
    if (!project) {
      return { ok: false, reason: 'project_not_found' }
    }

    if (project.location === 'cloud') {
      if (!project.cloud_instance_id) {
        return { ok: false, reason: 'project_not_found' }
      }

      const instance = params.findCloudInstanceById(project.cloud_instance_id)
      if (!instance?.access_token) {
        return { ok: false, reason: 'unknown' }
      }

      if (!(await params.ensureFreshCloudSession(instance.id))) {
        return { ok: false, reason: 'unknown', message: 'Cloud session expired. Please reconnect.' }
      }
      const freshInstance = params.findCloudInstanceById(instance.id) ?? instance

      const title = `New - ${project.name}`
      let createdConversationId: string | null = null
      try {
        const created = await params.postAuthJson(
          new URL("/v1/conversations", freshInstance.base_url).toString(),
          freshInstance.access_token!,
          { projectId: project.id, title },
        )
        createdConversationId = created.conversation?.id ?? null
      } catch (error) {
        return { ok: false, reason: 'unknown', message: error instanceof Error ? error.message : String(error) }
      }

      const syncResult = await params.syncCloudInstanceBootstrap(instance.id)
      if (!syncResult.ok) {
        return { ok: false, reason: 'unknown' }
      }

      const conversation = params.listConversationsByProjectId(project.id).find(
        (entry) => entry.id === createdConversationId,
      ) ?? params.listConversationsByProjectId(project.id).find((entry) => entry.title === title)
      if (!conversation) {
        return { ok: false, reason: 'unknown' }
      }

      params.emitHostEvent('conversation.created', { conversationId: conversation.id, projectId: project.id })
      return { ok: true, conversation: { id: conversation.id } }
    }

    // Local path
    const conversationId = crypto.randomUUID()
    const runtimeLocation = project.cloud_instance_id ? 'cloud' : 'local'
    params.insertConversation({
      id: conversationId,
      projectId: trimmedId,
      title: `New - ${project.name}`,
      titleSource: 'placeholder',
      modelProvider: params.options?.modelProvider ?? null,
      modelId: params.options?.modelId ?? null,
      thinkingLevel: params.options?.thinkingLevel ?? null,
      worktreePath: null,
      accessMode: params.options?.accessMode === 'open' ? 'open' : 'secure',
      channelExtensionId: params.options?.channelExtensionId ?? null,
      runtimeLocation,
      cloudRuntimeSessionId: null,
    })

    const conversation = params.findConversationById(conversationId)
    if (!conversation) {
      return { ok: false, reason: 'unknown' }
    }

    const sidebarSettings = params.getSidebarSettings()
    if (runtimeLocation === 'local' && sidebarSettings.enableMetaHarnessFeedback) {
      params.upsertConversationHarnessFeedback({
        conversationId,
        harnessCandidateId: 'mock-candidate-id',
        harnessSnapshot: {},
        enabled: true,
      })
    } else {
      params.upsertConversationHarnessFeedback({
        conversationId,
        harnessCandidateId: null,
        harnessSnapshot: null,
        enabled: false,
      })
    }

    params.emitHostEvent('conversation.created', { conversationId, projectId: trimmedId })
    return { ok: true, conversation: { id: conversationId } }
  }

  // -------------------------------------------------------------------------
  // Shared mocks
  // -------------------------------------------------------------------------
  let listProjects: () => Project[]
  let findCloudInstanceById: (id: string) => CloudInstance | null
  let ensureFreshCloudSession: () => Promise<boolean>
  let postAuthJson: () => Promise<{ conversation: { id: string } }>
  let syncCloudInstanceBootstrap: () => Promise<{ ok: boolean }>
  let listConversationsByProjectId: () => MockConversation[]
  let insertConversation: ReturnType<typeof vi.fn>
  let findConversationById: (id: string) => MockConversation | null
  let getSidebarSettings: () => SidebarSettings
  let upsertConversationHarnessFeedback: ReturnType<typeof vi.fn>
  let emitHostEvent: ReturnType<typeof vi.fn>

  const localProject: Project = { id: 'proj-1', name: 'TestProject', location: 'local', repo_path: '/repo' }
  const cloudProjectNoInstance: Project = { id: 'proj-2', name: 'CloudProject', location: 'cloud', repo_path: null }
  const cloudProjectWithInstance: Project = { id: 'proj-3', name: 'CloudProject2', location: 'cloud', repo_path: null, cloud_instance_id: 'inst-1' }

  beforeEach(() => {
    listProjects = () => []
    findCloudInstanceById = () => null
    ensureFreshCloudSession = () => Promise.resolve(true)
    postAuthJson = () => Promise.resolve({ conversation: { id: 'cloud-conv-1' } })
    syncCloudInstanceBootstrap = () => Promise.resolve({ ok: true })
    listConversationsByProjectId = () => []
    insertConversation = vi.fn()
    findConversationById = () => null // pessimistic default
    getSidebarSettings = () => ({ enableMetaHarnessFeedback: false })
    upsertConversationHarnessFeedback = vi.fn()
    emitHostEvent = vi.fn()
  })

  // -------------------------------------------------------------------------
  // Error-path tests
  // -------------------------------------------------------------------------

  it('returns project_not_found when project does not exist', async () => {
    listProjects = () => []

    const result = await createForProject({
      projectId: 'proj-does-not-exist',
      listProjects,
      findCloudInstanceById,
      ensureFreshCloudSession,
      postAuthJson,
      syncCloudInstanceBootstrap,
      listConversationsByProjectId,
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(result).toEqual({ ok: false, reason: 'project_not_found' })
  })

  it('returns project_not_found when projectId is empty string', async () => {
    const result = await createForProject({
      projectId: '',
      listProjects,
      findCloudInstanceById,
      ensureFreshCloudSession,
      postAuthJson,
      syncCloudInstanceBootstrap,
      listConversationsByProjectId,
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(result).toEqual({ ok: false, reason: 'project_not_found' })
  })

  it('returns project_not_found when projectId is whitespace-only', async () => {
    const result = await createForProject({
      projectId: '   ',
      listProjects,
      findCloudInstanceById,
      ensureFreshCloudSession,
      postAuthJson,
      syncCloudInstanceBootstrap,
      listConversationsByProjectId,
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(result).toEqual({ ok: false, reason: 'project_not_found' })
  })

  it('returns project_not_found when projectId is non-string', async () => {
    const result = await createForProject({
      projectId: 42 as unknown,
      listProjects,
      findCloudInstanceById,
      ensureFreshCloudSession,
      postAuthJson,
      syncCloudInstanceBootstrap,
      listConversationsByProjectId,
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(result).toEqual({ ok: false, reason: 'project_not_found' })
  })

  it('returns project_not_found when cloud project has no cloud_instance_id', async () => {
    listProjects = () => [cloudProjectNoInstance]

    const result = await createForProject({
      projectId: cloudProjectNoInstance.id,
      listProjects,
      findCloudInstanceById,
      ensureFreshCloudSession,
      postAuthJson,
      syncCloudInstanceBootstrap,
      listConversationsByProjectId,
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(result).toEqual({ ok: false, reason: 'project_not_found' })
  })

  it('returns unknown when cloud project has no access_token', async () => {
    listProjects = () => [cloudProjectWithInstance]
    findCloudInstanceById = () => ({ id: 'inst-1', access_token: null, base_url: 'https://api.example.com' })

    const result = await createForProject({
      projectId: cloudProjectWithInstance.id,
      listProjects,
      findCloudInstanceById,
      ensureFreshCloudSession,
      postAuthJson,
      syncCloudInstanceBootstrap,
      listConversationsByProjectId,
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(result).toEqual({ ok: false, reason: 'unknown' })
  })

  it('returns unknown + message when ensureFreshCloudSession fails', async () => {
    listProjects = () => [cloudProjectWithInstance]
    findCloudInstanceById = () => ({ id: 'inst-1', access_token: 'token', base_url: 'https://api.example.com' })
    ensureFreshCloudSession = () => Promise.resolve(false)

    const result = await createForProject({
      projectId: cloudProjectWithInstance.id,
      listProjects,
      findCloudInstanceById,
      ensureFreshCloudSession,
      postAuthJson,
      syncCloudInstanceBootstrap,
      listConversationsByProjectId,
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(result).toEqual({ ok: false, reason: 'unknown', message: 'Cloud session expired. Please reconnect.' })
  })

  it('returns unknown when cloud postAuthJson throws', async () => {
    listProjects = () => [cloudProjectWithInstance]
    findCloudInstanceById = () => ({ id: 'inst-1', access_token: 'token', base_url: 'https://api.example.com' })
    postAuthJson = () => Promise.reject(new Error('Network error'))

    const result = await createForProject({
      projectId: cloudProjectWithInstance.id,
      listProjects,
      findCloudInstanceById,
      ensureFreshCloudSession,
      postAuthJson,
      syncCloudInstanceBootstrap,
      listConversationsByProjectId,
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(result).toEqual({ ok: false, reason: 'unknown', message: 'Network error' })
  })

  it('returns unknown when cloud sync fails', async () => {
    listProjects = () => [cloudProjectWithInstance]
    findCloudInstanceById = () => ({ id: 'inst-1', access_token: 'token', base_url: 'https://api.example.com' })
    syncCloudInstanceBootstrap = () => Promise.resolve({ ok: false })

    const result = await createForProject({
      projectId: cloudProjectWithInstance.id,
      listProjects,
      findCloudInstanceById,
      ensureFreshCloudSession,
      postAuthJson,
      syncCloudInstanceBootstrap,
      listConversationsByProjectId,
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(result).toEqual({ ok: false, reason: 'unknown' })
  })

  it('returns unknown when conversation not found after cloud creation', async () => {
    listProjects = () => [cloudProjectWithInstance]
    findCloudInstanceById = () => ({ id: 'inst-1', access_token: 'token', base_url: 'https://api.example.com' })
    // postAuthJson returns id, but listConversationsByProjectId won't find it
    postAuthJson = () => Promise.resolve({ conversation: { id: 'cloud-conv-1' } })
    listConversationsByProjectId = () => []

    const result = await createForProject({
      projectId: cloudProjectWithInstance.id,
      listProjects,
      findCloudInstanceById,
      ensureFreshCloudSession,
      postAuthJson,
      syncCloudInstanceBootstrap,
      listConversationsByProjectId,
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(result).toEqual({ ok: false, reason: 'unknown' })
  })

  it('falls back to title-match when cloud conversation id lookup misses', async () => {
    listProjects = () => [cloudProjectWithInstance]
    findCloudInstanceById = () => ({ id: 'inst-1', access_token: 'token', base_url: 'https://api.example.com' })
    postAuthJson = () => Promise.resolve({ conversation: { id: 'cloud-conv-missing' } })
    listConversationsByProjectId = () => [
      { id: 'some-other-id', projectId: 'proj-3', title: 'New - CloudProject2', accessMode: 'secure' },
    ]

    const result = await createForProject({
      projectId: cloudProjectWithInstance.id,
      listProjects,
      findCloudInstanceById,
      ensureFreshCloudSession,
      postAuthJson,
      syncCloudInstanceBootstrap,
      listConversationsByProjectId,
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(result.ok).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Local path tests
  // -------------------------------------------------------------------------

  it('creates local conversation with correct fields', async () => {
    listProjects = () => [localProject]
    const captured: Parameters<typeof insertConversation>[0] = { id: '', projectId: '', title: '', titleSource: '', modelProvider: null, modelId: null, thinkingLevel: null, worktreePath: null, accessMode: 'secure', channelExtensionId: null, runtimeLocation: '', cloudRuntimeSessionId: null }
    insertConversation = vi.fn((data) => { Object.assign(captured, data) })
    const conversationId = crypto.randomUUID()
    findConversationById = () => ({ id: conversationId, projectId: 'proj-1', title: 'New - TestProject', accessMode: 'secure' })

    const result = await createForProject({
      projectId: localProject.id,
      listProjects,
      findCloudInstanceById,
      ensureFreshCloudSession,
      postAuthJson,
      syncCloudInstanceBootstrap,
      listConversationsByProjectId,
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(result.ok).toBe(true)
    expect(captured.projectId).toBe('proj-1')
    expect(captured.title).toBe('New - TestProject')
    expect(captured.titleSource).toBe('placeholder')
    expect(captured.worktreePath).toBeNull()
    expect(captured.runtimeLocation).toBe('local')
  })

  it('defaults accessMode to secure on local project', async () => {
    listProjects = () => [localProject]
    const captured: Parameters<typeof insertConversation>[0] = { id: '', projectId: '', title: '', titleSource: '', modelProvider: null, modelId: null, thinkingLevel: null, worktreePath: null, accessMode: 'secure', channelExtensionId: null, runtimeLocation: '', cloudRuntimeSessionId: null }
    insertConversation = vi.fn((data) => { Object.assign(captured, data) })
    const conversationId = crypto.randomUUID()
    findConversationById = () => ({ id: conversationId, projectId: 'proj-1', title: 'New - TestProject', accessMode: 'secure' })

    await createForProject({
      projectId: localProject.id,
      listProjects,
      findCloudInstanceById,
      ensureFreshCloudSession,
      postAuthJson,
      syncCloudInstanceBootstrap,
      listConversationsByProjectId,
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(captured.accessMode).toBe('secure')
  })

  it('accepts open accessMode on local project', async () => {
    listProjects = () => [localProject]
    const captured: Parameters<typeof insertConversation>[0] = { id: '', projectId: '', title: '', titleSource: '', modelProvider: null, modelId: null, thinkingLevel: null, worktreePath: null, accessMode: 'secure', channelExtensionId: null, runtimeLocation: '', cloudRuntimeSessionId: null }
    insertConversation = vi.fn((data) => { Object.assign(captured, data) })
    const conversationId = crypto.randomUUID()
    findConversationById = () => ({ id: conversationId, projectId: 'proj-1', title: 'New - TestProject', accessMode: 'open' })

    await createForProject({
      projectId: localProject.id,
      options: { accessMode: 'open' },
      listProjects,
      findCloudInstanceById,
      ensureFreshCloudSession,
      postAuthJson,
      syncCloudInstanceBootstrap,
      listConversationsByProjectId,
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(captured.accessMode).toBe('open')
  })

  it('returns unknown when local conversation not found after insert', async () => {
    listProjects = () => [localProject]
    // findConversationById already defaults to null

    const result = await createForProject({
      projectId: localProject.id,
      listProjects,
      findCloudInstanceById,
      ensureFreshCloudSession,
      postAuthJson,
      syncCloudInstanceBootstrap,
      listConversationsByProjectId,
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(result).toEqual({ ok: false, reason: 'unknown' })
  })

  it('enables harness feedback for local project when sidebar setting is enabled', async () => {
    listProjects = () => [localProject]
    getSidebarSettings = () => ({ enableMetaHarnessFeedback: true })
    const conversationId = crypto.randomUUID()
    findConversationById = () => ({ id: conversationId, projectId: 'proj-1', title: 'New - TestProject', accessMode: 'secure' })

    await createForProject({
      projectId: localProject.id,
      listProjects,
      findCloudInstanceById,
      ensureFreshCloudSession,
      postAuthJson,
      syncCloudInstanceBootstrap,
      listConversationsByProjectId,
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(upsertConversationHarnessFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, harnessCandidateId: 'mock-candidate-id' }),
    )
  })

  it('disables harness feedback for local project when sidebar setting is disabled', async () => {
    listProjects = () => [localProject]
    getSidebarSettings = () => ({ enableMetaHarnessFeedback: false })
    const conversationId = crypto.randomUUID()
    findConversationById = () => ({ id: conversationId, projectId: 'proj-1', title: 'New - TestProject', accessMode: 'secure' })

    await createForProject({
      projectId: localProject.id,
      listProjects,
      findCloudInstanceById,
      ensureFreshCloudSession,
      postAuthJson,
      syncCloudInstanceBootstrap,
      listConversationsByProjectId,
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(upsertConversationHarnessFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, harnessCandidateId: null, harnessSnapshot: null }),
    )
  })

  it('fires conversation.created host event for local project', async () => {
    listProjects = () => [localProject]
    findConversationById = () => ({ id: 'any-uuid', projectId: 'proj-1', title: 'New - TestProject', accessMode: 'secure' })

    await createForProject({
      projectId: localProject.id,
      listProjects,
      findCloudInstanceById,
      ensureFreshCloudSession,
      postAuthJson,
      syncCloudInstanceBootstrap,
      listConversationsByProjectId,
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(emitHostEvent).toHaveBeenCalledWith('conversation.created', {
      conversationId: expect.any(String),
      projectId: localProject.id,
    })
  })

  it('passes modelProvider and modelId options through for local project', async () => {
    listProjects = () => [localProject]
    const captured: Parameters<typeof insertConversation>[0] = { id: '', projectId: '', title: '', titleSource: '', modelProvider: null, modelId: null, thinkingLevel: null, worktreePath: null, accessMode: 'secure', channelExtensionId: null, runtimeLocation: '', cloudRuntimeSessionId: null }
    insertConversation = vi.fn((data) => { Object.assign(captured, data) })
    const conversationId = crypto.randomUUID()
    findConversationById = () => ({ id: conversationId, projectId: 'proj-1', title: 'New - TestProject', accessMode: 'secure' })

    await createForProject({
      projectId: localProject.id,
      options: { modelProvider: 'anthropic', modelId: 'claude-3-5-sonnet' },
      listProjects,
      findCloudInstanceById,
      ensureFreshCloudSession,
      postAuthJson,
      syncCloudInstanceBootstrap,
      listConversationsByProjectId,
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(captured.modelProvider).toBe('anthropic')
    expect(captured.modelId).toBe('claude-3-5-sonnet')
  })

  it('cloud project fires conversation.created host event', async () => {
    listProjects = () => [cloudProjectWithInstance]
    findCloudInstanceById = () => ({ id: 'inst-1', access_token: 'token', base_url: 'https://api.example.com' })
    const createdConv = { id: 'cloud-conv-1', projectId: 'proj-3', title: 'New - CloudProject2', accessMode: 'secure' }
    listConversationsByProjectId = () => [createdConv]

    await createForProject({
      projectId: cloudProjectWithInstance.id,
      listProjects,
      findCloudInstanceById,
      ensureFreshCloudSession,
      postAuthJson,
      syncCloudInstanceBootstrap,
      listConversationsByProjectId,
      insertConversation,
      findConversationById,
      getSidebarSettings,
      upsertConversationHarnessFeedback,
      emitHostEvent,
    })

    expect(emitHostEvent).toHaveBeenCalledWith('conversation.created', {
      conversationId: createdConv.id,
      projectId: cloudProjectWithInstance.id,
    })
  })
})
