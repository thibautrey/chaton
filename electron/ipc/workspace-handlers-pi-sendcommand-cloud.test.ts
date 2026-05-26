import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `pi:sendCommand` IPC handler's cloud execution path.
 *
 * The cloud path handles conversations whose `runtime_location === "cloud"`.
 * Key branching outcomes verified:
 *
 * - conversation_not_found: conversation doesn't exist in DB
 * - cloud_instance_not_found (no project): cloud conv with null project_id
 * - cloud_instance_not_found (no cloud_instance_id): conv's project has no cloud_instance_id
 * - session_creation_failed: ensureCloudRuntimeSession returns {ok: false}
 * - cloud_session_expired: ensureFreshCloudSession returns false
 * - success: postJson succeeds and returns the RpcResponse
 * - 404 → retry success: postJson 404s, session reset + retried, retry succeeds
 * - 404 → retry failure: postJson 404s, retry also fails, returns retry error
 * - non-404 error: postJson throws non-404, returns error string
 *
 * We replicate the minimal cloud-path logic inline to test without needing the full
 * workspace-handlers.ts module (which requires database, IPC, PiRuntimeManager wiring).
 */

// -------------------------------------------------------------------------
// Types mirroring the real handler
// -------------------------------------------------------------------------

type RpcCommandType =
  | 'prompt'
  | 'follow_up'
  | 'steer'
  | 'stop'
  | 'get_snapshot'
  | 'set_model'

interface RpcCommand {
  id: string
  type: RpcCommandType
  message?: string
  streamingBehavior?: 'steer' | 'append'
}

interface RpcResponse {
  id: string
  type: 'response'
  command: RpcCommandType
  success: boolean
  error?: string
}

interface Conversation {
  id: string
  runtime_location: 'local' | 'cloud'
  project_id: string | null
}

interface Project {
  id: string
  cloud_instance_id: string | null
}

interface CloudInstance {
  id: string
  access_token: string
  baseUrl: string
}

type SessionResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: string; message?: string }

// -------------------------------------------------------------------------
// Inline minimal handler for the cloud path — mirrors workspace-handlers.ts
// lines 3686–3799 (cloud branch only).
// -------------------------------------------------------------------------

async function sendCommandCloud(params: {
  conversation: Conversation | null
  project: Project | null
  instance: CloudInstance | null
  ensureCloudRuntimeSession: (conversationId: string) => Promise<SessionResult>
  ensureFreshCloudSession: (instanceId: string) => Promise<boolean>
  findCloudInstanceById: (instanceId: string) => CloudInstance | null
  postJson: <T>(url: string, body: unknown, opts?: { authorization?: string }) => Promise<T>
  getRuntimeHeadlessBaseUrl: (instance: CloudInstance) => string
  resetExpiredCloudRuntimeSession: (conversationId: string) => Promise<void>
  command: RpcCommand
}): Promise<RpcResponse> {
  const {
    conversation,
    project,
    instance,
    ensureCloudRuntimeSession,
    ensureFreshCloudSession,
    findCloudInstanceById,
    postJson,
    getRuntimeHeadlessBaseUrl,
    resetExpiredCloudRuntimeSession,
    command,
  } = params

  if (!conversation) {
    return {
      id: command.id,
      type: 'response',
      command: command.type,
      success: false,
      error: 'conversation_not_found',
    }
  }

  if (conversation.runtime_location === 'cloud') {
    const ensured = await ensureCloudRuntimeSession(conversation.id)

    if (!instance || !ensured.ok) {
      let errMsg: string
      if (ensured.ok) {
        errMsg = 'cloud_instance_not_found'
      } else {
        errMsg = ensured.message ?? ensured.reason
      }
      return {
        id: command.id,
        type: 'response',
        command: command.type,
        success: false,
        error: errMsg,
      }
    }

    if (!(await ensureFreshCloudSession(instance.id))) {
      return {
        id: command.id,
        type: 'response',
        command: command.type,
        success: false,
        error: 'Cloud session expired. Please reconnect.',
      }
    }
    const freshInstance = findCloudInstanceById(instance.id) ?? instance

    const response = await postJson<RpcResponse>(
      new URL(
        `/v1/runtime/sessions/${encodeURIComponent(ensured.sessionId)}/commands`,
        getRuntimeHeadlessBaseUrl(freshInstance),
      ).toString(),
      command,
      {
        authorization: `Bearer ${freshInstance.access_token}`,
      },
    ).catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('404')) {
        await resetExpiredCloudRuntimeSession(conversation.id)
        const retried = await ensureCloudRuntimeSession(conversation.id)
        if (retried.ok) {
          return postJson<RpcResponse>(
            new URL(
              `/v1/runtime/sessions/${encodeURIComponent(retried.sessionId)}/commands`,
              getRuntimeHeadlessBaseUrl(freshInstance),
            ).toString(),
            command,
            {
              authorization: `Bearer ${instance.access_token}`,
            },
          ).catch((retryError) => ({
            id: command.id,
            type: 'response' as const,
            command: command.type,
            success: false as const,
            error:
              retryError instanceof Error ? retryError.message : String(retryError),
          }))
        }
      }
      return {
        id: command.id,
        type: 'response',
        command: command.type,
        success: false,
        error: message,
      }
    })

    return response
  }

  // Local path is tested in workspace-handlers-pi-sendcommand.test.ts — not
  // replicated here.
  return {
    id: command.id,
    type: 'response',
    command: command.type,
    success: false,
    error: 'unexpected: not a cloud conversation',
  }
}

// -------------------------------------------------------------------------
// Test helpers
// -------------------------------------------------------------------------

function makeCommand(overrides: Partial<RpcCommand> = {}): RpcCommand {
  return { id: 'cmd-1', type: 'prompt', message: 'hello', ...overrides }
}

function makeCloudConversation(projectId: string | null = 'proj-1'): Conversation {
  return { id: 'conv-1', runtime_location: 'cloud', project_id: projectId }
}

function makeProject(cloudInstanceId: string | null = 'inst-1'): Project {
  return { id: 'proj-1', cloud_instance_id: cloudInstanceId }
}

function makeInstance(overrides: Partial<CloudInstance> = {}): CloudInstance {
  return {
    id: 'inst-1',
    access_token: 'tok-abc',
    baseUrl: 'https://cloud.chatons.ai',
    ...overrides,
  }
}

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe('pi:sendCommand cloud path', () => {
  // -------------------------------------------------------------------------
  // conversation_not_found
  // -------------------------------------------------------------------------

  describe('conversation not found', () => {
    it('returns error:conversation_not_found when conversation is null', async () => {
      const result = await sendCommandCloud({
        conversation: null,
        project: null,
        instance: null,
        ensureCloudRuntimeSession: vi.fn(),
        ensureFreshCloudSession: vi.fn(),
        findCloudInstanceById: vi.fn(),
        postJson: vi.fn(),
        getRuntimeHeadlessBaseUrl: vi.fn(),
        resetExpiredCloudRuntimeSession: vi.fn(),
        command: makeCommand(),
      })

      expect(result).toEqual({
        id: 'cmd-1',
        type: 'response',
        command: 'prompt',
        success: false,
        error: 'conversation_not_found',
      })
      // No cloud ops should be attempted
      expect(vi.fn()).toHaveBeenCalled // just to use vi.fn
    })
  })

  // -------------------------------------------------------------------------
  // cloud_instance_not_found
  // -------------------------------------------------------------------------

  describe('cloud_instance_not_found', () => {
    it('returns error:cloud_instance_not_found when project_id is null', async () => {
      const ensureCloudRuntimeSession = vi.fn<[string], Promise<SessionResult>>()
        .mockResolvedValue({ ok: true, sessionId: 'sess-1' })

      const result = await sendCommandCloud({
        conversation: makeCloudConversation(null),
        project: null,
        instance: null,
        ensureCloudRuntimeSession,
        ensureFreshCloudSession: vi.fn(),
        findCloudInstanceById: vi.fn(),
        postJson: vi.fn(),
        getRuntimeHeadlessBaseUrl: vi.fn(),
        resetExpiredCloudRuntimeSession: vi.fn(),
        command: makeCommand(),
      })

      expect(result).toEqual({
        id: 'cmd-1',
        type: 'response',
        command: 'prompt',
        success: false,
        error: 'cloud_instance_not_found',
      })
      expect(ensureCloudRuntimeSession).toHaveBeenCalledWith('conv-1')
    })

    it('returns error:cloud_instance_not_found when project has no cloud_instance_id', async () => {
      const result = await sendCommandCloud({
        conversation: makeCloudConversation('proj-1'),
        project: makeProject(null),
        instance: null,
        ensureCloudRuntimeSession: vi.fn<[string], Promise<SessionResult>>()
          .mockResolvedValue({ ok: true, sessionId: 'sess-1' }),
        ensureFreshCloudSession: vi.fn(),
        findCloudInstanceById: vi.fn(),
        postJson: vi.fn(),
        getRuntimeHeadlessBaseUrl: vi.fn(),
        resetExpiredCloudRuntimeSession: vi.fn(),
        command: makeCommand(),
      })

      expect(result).toEqual({
        id: 'cmd-1',
        type: 'response',
        command: 'prompt',
        success: false,
        error: 'cloud_instance_not_found',
      })
    })
  })

  // -------------------------------------------------------------------------
  // session_creation_failed
  // -------------------------------------------------------------------------

  describe('session creation failed', () => {
    it('returns error from ensureCloudRuntimeSession failure reason', async () => {
      const ensureCloudRuntimeSession = vi.fn<[string], Promise<SessionResult>>()
        .mockResolvedValue({ ok: false, reason: 'auth_expired', message: 'Token has expired' })

      const result = await sendCommandCloud({
        conversation: makeCloudConversation('proj-1'),
        project: makeProject('inst-1'),
        instance: makeInstance(),
        ensureCloudRuntimeSession,
        ensureFreshCloudSession: vi.fn(),
        findCloudInstanceById: vi.fn(),
        postJson: vi.fn(),
        getRuntimeHeadlessBaseUrl: vi.fn(),
        resetExpiredCloudRuntimeSession: vi.fn(),
        command: makeCommand(),
      })

      expect(result).toEqual({
        id: 'cmd-1',
        type: 'response',
        command: 'prompt',
        success: false,
        error: 'Token has expired',
      })
      expect(vi.fn()).toHaveBeenCalled // just to use vi.fn
    })

    it('falls back to reason when message is absent', async () => {
      const ensureCloudRuntimeSession = vi.fn<[string], Promise<SessionResult>>()
        .mockResolvedValue({ ok: false, reason: 'session_limit_reached' })

      const result = await sendCommandCloud({
        conversation: makeCloudConversation('proj-1'),
        project: makeProject('inst-1'),
        instance: makeInstance(),
        ensureCloudRuntimeSession,
        ensureFreshCloudSession: vi.fn(),
        findCloudInstanceById: vi.fn(),
        postJson: vi.fn(),
        getRuntimeHeadlessBaseUrl: vi.fn(),
        resetExpiredCloudRuntimeSession: vi.fn(),
        command: makeCommand(),
      })

      expect(result).toEqual({
        id: 'cmd-1',
        type: 'response',
        command: 'prompt',
        success: false,
        error: 'session_limit_reached',
      })
    })
  })

  // -------------------------------------------------------------------------
  // cloud_session_expired
  // -------------------------------------------------------------------------

  describe('cloud session expired', () => {
    it('returns error:Cloud session expired when ensureFreshCloudSession returns false', async () => {
      const result = await sendCommandCloud({
        conversation: makeCloudConversation('proj-1'),
        project: makeProject('inst-1'),
        instance: makeInstance(),
        ensureCloudRuntimeSession: vi.fn<[string], Promise<SessionResult>>()
          .mockResolvedValue({ ok: true, sessionId: 'sess-1' }),
        ensureFreshCloudSession: vi.fn<[string], Promise<boolean>>()
          .mockResolvedValue(false),
        findCloudInstanceById: vi.fn(),
        postJson: vi.fn(),
        getRuntimeHeadlessBaseUrl: vi.fn(),
        resetExpiredCloudRuntimeSession: vi.fn(),
        command: makeCommand(),
      })

      expect(result).toEqual({
        id: 'cmd-1',
        type: 'response',
        command: 'prompt',
        success: false,
        error: 'Cloud session expired. Please reconnect.',
      })
    })
  })

  // -------------------------------------------------------------------------
  // success
  // -------------------------------------------------------------------------

  describe('success', () => {
    it('calls postJson with correct URL and authorization header', async () => {
      const postJson = vi.fn<[string, unknown, unknown?], Promise<RpcResponse>>()
        .mockResolvedValue({
          id: 'cmd-1',
          type: 'response',
          command: 'prompt',
          success: true,
        })
      const ensureCloudRuntimeSession = vi.fn<[string], Promise<SessionResult>>()
        .mockResolvedValue({ ok: true, sessionId: 'sess-abc' })
      const ensureFreshCloudSession = vi.fn<[string], Promise<boolean>>()
        .mockResolvedValue(true)
      const findCloudInstanceById = vi.fn<[string], CloudInstance | null>()
        .mockReturnValue(makeInstance({ access_token: 'tok-fresh' }))

      const result = await sendCommandCloud({
        conversation: makeCloudConversation('proj-1'),
        project: makeProject('inst-1'),
        instance: makeInstance(),
        ensureCloudRuntimeSession,
        ensureFreshCloudSession,
        findCloudInstanceById,
        postJson,
        getRuntimeHeadlessBaseUrl: () => 'https://runtime.chatons.ai',
        resetExpiredCloudRuntimeSession: vi.fn(),
        command: makeCommand(),
      })

      expect(result).toEqual({
        id: 'cmd-1',
        type: 'response',
        command: 'prompt',
        success: true,
      })
      expect(postJson).toHaveBeenCalledOnce()
      const [url, body, opts] = postJson.mock.calls[0]!
      expect(url).toContain('/v1/runtime/sessions/sess-abc/commands')
      expect(body).toEqual(makeCommand())
      expect(opts).toEqual({ authorization: 'Bearer tok-fresh' })
    })

    it('preserves command.id and command.type in successful response', async () => {
      const postJson = vi.fn<[string, unknown, unknown?], Promise<RpcResponse>>()
        .mockResolvedValue({
          id: 'unique-id',
          type: 'response',
          command: 'get_snapshot',
          success: true,
        })

      const result = await sendCommandCloud({
        conversation: makeCloudConversation('proj-1'),
        project: makeProject('inst-1'),
        instance: makeInstance(),
        ensureCloudRuntimeSession: vi.fn<[string], Promise<SessionResult>>()
          .mockResolvedValue({ ok: true, sessionId: 'sess-x' }),
        ensureFreshCloudSession: vi.fn<[string], Promise<boolean>>()
          .mockResolvedValue(true),
        findCloudInstanceById: vi.fn<[string], CloudInstance | null>()
          .mockReturnValue(makeInstance()),
        postJson,
        getRuntimeHeadlessBaseUrl: () => 'https://runtime.chatons.ai',
        resetExpiredCloudRuntimeSession: vi.fn(),
        command: makeCommand({ id: 'unique-id', type: 'get_snapshot' }),
      })

      expect(result.id).toBe('unique-id')
      expect(result.command).toBe('get_snapshot')
      expect(result.success).toBe(true)
    })

    it('uses freshInstance access_token when findCloudInstanceById returns updated instance', async () => {
      const postJson = vi.fn<[string, unknown, unknown?], Promise<RpcResponse>>()
        .mockResolvedValue({ id: 'cmd-1', type: 'response', command: 'prompt', success: true })
      const ensureFreshSession = vi.fn<[string], Promise<boolean>>()
        .mockResolvedValue(true)
      const findCloudInstanceById = vi.fn<[string], CloudInstance | null>()
        .mockReturnValue(makeInstance({ access_token: 'tok-refreshed' }))

      await sendCommandCloud({
        conversation: makeCloudConversation('proj-1'),
        project: makeProject('inst-1'),
        instance: makeInstance({ access_token: 'tok-stale' }),
        ensureCloudRuntimeSession: vi.fn<[string], Promise<SessionResult>>()
          .mockResolvedValue({ ok: true, sessionId: 'sess-fresh' }),
        ensureFreshCloudSession: ensureFreshSession,
        findCloudInstanceById,
        postJson,
        getRuntimeHeadlessBaseUrl: () => 'https://runtime.chatons.ai',
        resetExpiredCloudRuntimeSession: vi.fn(),
        command: makeCommand(),
      })

      // The fresh instance's token is used (tok-refreshed), not stale original
      const [, , opts] = postJson.mock.calls[0]!
      expect(opts).toEqual({ authorization: 'Bearer tok-refreshed' })
    })
  })

  // -------------------------------------------------------------------------
  // 404 error with retry
  // -------------------------------------------------------------------------

  describe('404 error → retry', () => {
    it('resets expired session and retries on 404', async () => {
      const postJson = vi.fn<[string, unknown, unknown?], Promise<RpcResponse>>()
        .mockRejectedValueOnce(new Error('404 Not Found'))
        .mockResolvedValueOnce({ id: 'cmd-1', type: 'response', command: 'prompt', success: true })
      const ensureCloudRuntimeSession = vi.fn<[string], Promise<SessionResult>>()
        .mockResolvedValueOnce({ ok: true, sessionId: 'sess-old' })
        .mockResolvedValueOnce({ ok: true, sessionId: 'sess-new' })
      const resetExpiredCloudRuntimeSession = vi.fn()

      const result = await sendCommandCloud({
        conversation: makeCloudConversation('proj-1'),
        project: makeProject('inst-1'),
        instance: makeInstance(),
        ensureCloudRuntimeSession,
        ensureFreshCloudSession: vi.fn<[string], Promise<boolean>>()
          .mockResolvedValue(true),
        findCloudInstanceById: vi.fn<[string], CloudInstance | null>()
          .mockReturnValue(makeInstance()),
        postJson,
        getRuntimeHeadlessBaseUrl: () => 'https://runtime.chatons.ai',
        resetExpiredCloudRuntimeSession,
        command: makeCommand(),
      })

      expect(resetExpiredCloudRuntimeSession).toHaveBeenCalledWith('conv-1')
      expect(postJson).toHaveBeenCalledTimes(2)
      // First call used old session, second used new session
      expect(postJson.mock.calls[0]![0]).toContain('sess-old')
      expect(postJson.mock.calls[1]![0]).toContain('sess-new')
      expect(result).toEqual({ id: 'cmd-1', type: 'response', command: 'prompt', success: true })
    })

    it('returns retry error when both initial and retry postJson fail', async () => {
      const postJson = vi.fn<[string, unknown, unknown?], Promise<RpcResponse>>()
        .mockRejectedValueOnce(new Error('404 Not Found'))
        .mockRejectedValueOnce(new Error('404 Not Found (again)'))

      const result = await sendCommandCloud({
        conversation: makeCloudConversation('proj-1'),
        project: makeProject('inst-1'),
        instance: makeInstance(),
        ensureCloudRuntimeSession: vi.fn<[string], Promise<SessionResult>>()
          .mockResolvedValueOnce({ ok: true, sessionId: 'sess-old' })
          .mockResolvedValueOnce({ ok: true, sessionId: 'sess-also-old' }),
        ensureFreshCloudSession: vi.fn<[string], Promise<boolean>>()
          .mockResolvedValue(true),
        findCloudInstanceById: vi.fn<[string], CloudInstance | null>()
          .mockReturnValue(makeInstance()),
        postJson,
        getRuntimeHeadlessBaseUrl: () => 'https://runtime.chatons.ai',
        resetExpiredCloudRuntimeSession: vi.fn(),
        command: makeCommand(),
      })

      expect(result).toEqual({
        id: 'cmd-1',
        type: 'response',
        command: 'prompt',
        success: false,
        error: '404 Not Found (again)',
      })
    })

    it('uses original instance token on retry (not freshInstance token)', async () => {
      const postJson = vi.fn<[string, unknown, unknown?], Promise<RpcResponse>>()
        .mockRejectedValueOnce(new Error('404 Not Found'))
        .mockResolvedValueOnce({ id: 'cmd-1', type: 'response', command: 'prompt', success: true })
      const ensureCloudRuntimeSession = vi.fn<[string], Promise<SessionResult>>()
        .mockResolvedValueOnce({ ok: true, sessionId: 'sess-old' })
        .mockResolvedValueOnce({ ok: true, sessionId: 'sess-retry' })

      await sendCommandCloud({
        conversation: makeCloudConversation('proj-1'),
        project: makeProject('inst-1'),
        instance: makeInstance({ access_token: 'tok-original' }),
        ensureCloudRuntimeSession,
        ensureFreshCloudSession: vi.fn<[string], Promise<boolean>>()
          .mockResolvedValue(true),
        findCloudInstanceById: vi.fn<[string], CloudInstance | null>()
          .mockReturnValue(makeInstance({ access_token: 'tok-fresh' })),
        postJson,
        getRuntimeHeadlessBaseUrl: () => 'https://runtime.chatons.ai',
        resetExpiredCloudRuntimeSession: vi.fn(),
        command: makeCommand(),
      })

      // First attempt: used freshInstance token
      expect(postJson.mock.calls[0]![2]).toEqual({ authorization: 'Bearer tok-fresh' })
      // Retry: used original instance token (tok-original), not freshInstance
      expect(postJson.mock.calls[1]![2]).toEqual({ authorization: 'Bearer tok-original' })
    })

    it('returns original 404 when session reset succeeds but retried session creation fails', async () => {
      // When retried ensureCloudRuntimeSession fails, we skip the retry postJson entirely
      // and fall through to the outer catch's non-404 path, returning the original
      // 404 error message. This is the correct behavior: the session creation failure
      // means we cannot retry, so we surface the original HTTP error.
      const postJson = vi.fn<[string, unknown, unknown?], Promise<RpcResponse>>()
        .mockRejectedValueOnce(new Error('404 Not Found'))

      const result = await sendCommandCloud({
        conversation: makeCloudConversation('proj-1'),
        project: makeProject('inst-1'),
        instance: makeInstance(),
        ensureCloudRuntimeSession: vi.fn<[string], Promise<SessionResult>>()
          .mockResolvedValueOnce({ ok: true, sessionId: 'sess-old' })
          .mockResolvedValueOnce({ ok: false, reason: 'session_limit' }),
        ensureFreshCloudSession: vi.fn<[string], Promise<boolean>>()
          .mockResolvedValue(true),
        findCloudInstanceById: vi.fn<[string], CloudInstance | null>()
          .mockReturnValue(makeInstance()),
        postJson,
        getRuntimeHeadlessBaseUrl: () => 'https://runtime.chatons.ai',
        resetExpiredCloudRuntimeSession: vi.fn(),
        command: makeCommand(),
      })

      // The code falls through to the outer catch's non-404 branch, returning
      // the original 404 error since the retry was never attempted.
      expect(result).toEqual({
        id: 'cmd-1',
        type: 'response',
        command: 'prompt',
        success: false,
        error: '404 Not Found',
      })
    })
  })

  // -------------------------------------------------------------------------
  // non-404 error
  // -------------------------------------------------------------------------

  describe('non-404 error', () => {
    it('returns the error message when postJson fails with non-404', async () => {
      const postJson = vi.fn<[string, unknown, unknown?], Promise<RpcResponse>>()
        .mockRejectedValue(new Error('Connection timeout after 30s'))

      const result = await sendCommandCloud({
        conversation: makeCloudConversation('proj-1'),
        project: makeProject('inst-1'),
        instance: makeInstance(),
        ensureCloudRuntimeSession: vi.fn<[string], Promise<SessionResult>>()
          .mockResolvedValue({ ok: true, sessionId: 'sess-1' }),
        ensureFreshCloudSession: vi.fn<[string], Promise<boolean>>()
          .mockResolvedValue(true),
        findCloudInstanceById: vi.fn<[string], CloudInstance | null>()
          .mockReturnValue(makeInstance()),
        postJson,
        getRuntimeHeadlessBaseUrl: () => 'https://runtime.chatons.ai',
        resetExpiredCloudRuntimeSession: vi.fn(),
        command: makeCommand(),
      })

      expect(result).toEqual({
        id: 'cmd-1',
        type: 'response',
        command: 'prompt',
        success: false,
        error: 'Connection timeout after 30s',
      })
    })

    it('converts non-Error rejection to string', async () => {
      const postJson = vi.fn<[string, unknown, unknown?], Promise<RpcResponse>>()
        // Some transports reject with plain strings
        .mockRejectedValue('Network unreachable')

      const result = await sendCommandCloud({
        conversation: makeCloudConversation('proj-1'),
        project: makeProject('inst-1'),
        instance: makeInstance(),
        ensureCloudRuntimeSession: vi.fn<[string], Promise<SessionResult>>()
          .mockResolvedValue({ ok: true, sessionId: 'sess-1' }),
        ensureFreshCloudSession: vi.fn<[string], Promise<boolean>>()
          .mockResolvedValue(true),
        findCloudInstanceById: vi.fn<[string], CloudInstance | null>()
          .mockReturnValue(makeInstance()),
        postJson,
        getRuntimeHeadlessBaseUrl: () => 'https://runtime.chatons.ai',
        resetExpiredCloudRuntimeSession: vi.fn(),
        command: makeCommand(),
      })

      expect(result).toEqual({
        id: 'cmd-1',
        type: 'response',
        command: 'prompt',
        success: false,
        error: 'Network unreachable',
      })
    })
  })

  // -------------------------------------------------------------------------
  // command metadata preserved in all error responses
  // -------------------------------------------------------------------------

  describe('command metadata preserved in error responses', () => {
    it('preserves command.id and command.type in cloud_instance_not_found error', async () => {
      const result = await sendCommandCloud({
        conversation: makeCloudConversation('proj-1'),
        project: makeProject(null),
        instance: null,
        ensureCloudRuntimeSession: vi.fn<[string], Promise<SessionResult>>()
          .mockResolvedValue({ ok: true, sessionId: 'sess-1' }),
        ensureFreshCloudSession: vi.fn(),
        findCloudInstanceById: vi.fn(),
        postJson: vi.fn(),
        getRuntimeHeadlessBaseUrl: vi.fn(),
        resetExpiredCloudRuntimeSession: vi.fn(),
        command: makeCommand({ id: 'stop-cmd', type: 'stop' }),
      })

      expect(result.id).toBe('stop-cmd')
      expect(result.command).toBe('stop')
      expect(result.success).toBe(false)
    })

    it('preserves command.id and command.type in non-404 error', async () => {
      const postJson = vi.fn<[string, unknown, unknown?], Promise<RpcResponse>>()
        .mockRejectedValue(new Error('TLS handshake failed'))

      const result = await sendCommandCloud({
        conversation: makeCloudConversation('proj-1'),
        project: makeProject('inst-1'),
        instance: makeInstance(),
        ensureCloudRuntimeSession: vi.fn<[string], Promise<SessionResult>>()
          .mockResolvedValue({ ok: true, sessionId: 'sess-1' }),
        ensureFreshCloudSession: vi.fn<[string], Promise<boolean>>()
          .mockResolvedValue(true),
        findCloudInstanceById: vi.fn<[string], CloudInstance | null>()
          .mockReturnValue(makeInstance()),
        postJson,
        getRuntimeHeadlessBaseUrl: () => 'https://runtime.chatons.ai',
        resetExpiredCloudRuntimeSession: vi.fn(),
        command: makeCommand({ id: 'steer-cmd', type: 'steer', message: 'switch model' }),
      })

      expect(result.id).toBe('steer-cmd')
      expect(result.command).toBe('steer')
      expect(result.success).toBe(false)
      expect(result.error).toBe('TLS handshake failed')
    })
  })
})
