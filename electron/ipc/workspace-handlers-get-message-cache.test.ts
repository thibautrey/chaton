import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `conversations:getMessageCache` IPC handler.
 *
 * Handler: workspace-handlers.ts lines 3114–3177
 * We replicate minimal handler logic inline to test without needing the full
 * workspace-handlers.ts module (which requires database, IPC, Electron, and PiRuntimeManager wiring).
 *
 * Key behaviors verified:
 * - Returns empty array when no conversation exists
 * - Local-only conversation: skips cloud logic, returns local cache
 * - Cloud conversation with no matching instance: skips cloud logic, returns local cache
 * - Cloud conversation with instance but no access_token: skips cloud logic, returns local cache
 * - Cloud conversation with valid token + fresh session + successful fetch:
 *     replaces local cache with cloud messages and returns them
 * - Cloud conversation: ensureFreshCloudSession returning false falls through to local cache
 * - Cloud conversation: cloud fetch throwing falls through to local cache
 * - Local cache rows with unparseable payload_json are filtered out
 * - Returned messages are the parsed payload_json objects from local cache
 */

type MessagePayload = { id: string; role: string; content: string }

interface Conversation {
  id: string
  project_id: string | null
  runtime_location: 'local' | 'cloud'
}

interface Project {
  id: string
  cloud_instance_id: string | null
}

interface CloudInstance {
  id: string
  base_url: string
  access_token: string | null
}

interface MessageCacheRow {
  conversation_id: string
  message_id: string
  payload_json: string
}

// -------------------------------------------------------------------------
// Inline handler mirroring the real implementation (lines 3114–3177).
// -------------------------------------------------------------------------

async function getMessageCache(params: {
  conversationId: string
  findConversation: (id: string) => Conversation | null
  findProjectById: (id: string) => Project | null
  findCloudInstanceById: (id: string) => CloudInstance | null
  ensureFreshCloudSession: (instanceId: string) => Promise<boolean>
  getAuthJson: (url: string, token: string) => Promise<{
    conversationId: string
    messages: Array<{ id: string; role: string; timestamp: number; content: string }>
  }>
  replaceConversationMessagesCache: (
    conversationId: string,
    messages: Array<{ id: string; role: string; payloadJson: string }>,
  ) => void
  listConversationMessagesCache: (conversationId: string) => MessageCacheRow[]
}): Promise<MessagePayload[]> {
  const { conversationId, findConversation, findProjectById, findCloudInstanceById,
    ensureFreshCloudSession, getAuthJson, replaceConversationMessagesCache,
    listConversationMessagesCache } = params

  const conversation = findConversation(conversationId)

  if (conversation?.runtime_location === 'cloud' && conversation.project_id) {
    const project = findProjectById(conversation.project_id)
    const instance = project?.cloud_instance_id
      ? findCloudInstanceById(project.cloud_instance_id)
      : null

    if (instance?.access_token) {
      try {
        if (!(await ensureFreshCloudSession(instance.id))) {
          throw new Error('Cloud session expired')
        }
        const freshInstance = findCloudInstanceById(instance.id) ?? instance
        const response = await getAuthJson(
          `/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
          freshInstance.access_token!,
        )

        replaceConversationMessagesCache(
          conversationId,
          response.messages.map((message) => ({
            id: message.id,
            role: message.role,
            payloadJson: JSON.stringify(message),
          })),
        )
      } catch {
        // Fall through to local cache if remote fetch fails.
      }
    }
  }

  const rows = listConversationMessagesCache(conversationId)
  return rows
    .map((row) => {
      try {
        return JSON.parse(row.payload_json)
      } catch {
        return null
      }
    })
    .filter((item) => item !== null) as MessagePayload[]
}

// -------------------------------------------------------------------------
// Shared mocks
// -------------------------------------------------------------------------

let findConversation: (id: string) => Conversation | null
let findProjectById: (id: string) => Project | null
let findCloudInstanceById: (id: string) => CloudInstance | null
let ensureFreshCloudSession: (instanceId: string) => Promise<boolean>
let getAuthJson: (url: string, token: string) => Promise<{
  conversationId: string
  messages: Array<{ id: string; role: string; timestamp: number; content: string }>
}>
let replaceConversationMessagesCache: (
  conversationId: string,
  messages: Array<{ id: string; role: string; payloadJson: string }>,
) => void
let listConversationMessagesCache: (conversationId: string) => MessageCacheRow[]

beforeEach(() => {
  findConversation = vi.fn()
  findProjectById = vi.fn()
  findCloudInstanceById = vi.fn()
  ensureFreshCloudSession = vi.fn().mockResolvedValue(true)
  getAuthJson = vi.fn()
  replaceConversationMessagesCache = vi.fn()
  listConversationMessagesCache = vi.fn().mockReturnValue([])
})

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe('conversations:getMessageCache', () => {
  describe('conversation not found', () => {
    it('returns empty array when conversation does not exist', async () => {
      findConversation = () => null
      // The real handler calls listConversationMessagesCache unconditionally after
      // the conversation guard, even when no conversation is found.
      listConversationMessagesCache = vi.fn().mockReturnValue([])

      const result = await getMessageCache({
        conversationId: 'missing',
        findConversation,
        findProjectById,
        findCloudInstanceById,
        ensureFreshCloudSession,
        getAuthJson,
        replaceConversationMessagesCache,
        listConversationMessagesCache,
      })

      expect(result).toEqual([])
    })
  })

  describe('local-only conversation', () => {
    it('skips cloud logic and returns local cache', async () => {
      findConversation = () => ({
        id: 'conv-local',
        project_id: 'proj-1',
        runtime_location: 'local',
      })
      const localMessages = [
        { conversation_id: 'conv-local', message_id: 'm1', payload_json: JSON.stringify({ id: 'm1', role: 'user', content: 'hello' }) },
        { conversation_id: 'conv-local', message_id: 'm2', payload_json: JSON.stringify({ id: 'm2', role: 'assistant', content: 'hi there' }) },
      ]
      listConversationMessagesCache = () => localMessages

      const result = await getMessageCache({
        conversationId: 'conv-local',
        findConversation,
        findProjectById,
        findCloudInstanceById,
        ensureFreshCloudSession,
        getAuthJson,
        replaceConversationMessagesCache,
        listConversationMessagesCache,
      })

      expect(result).toEqual([
        { id: 'm1', role: 'user', content: 'hello' },
        { id: 'm2', role: 'assistant', content: 'hi there' },
      ])
      expect(ensureFreshCloudSession).not.toHaveBeenCalled()
      expect(getAuthJson).not.toHaveBeenCalled()
      expect(replaceConversationMessagesCache).not.toHaveBeenCalled()
    })
  })

  describe('cloud conversation — no project or instance', () => {
    it('returns local cache when conversation has no project_id', async () => {
      findConversation = () => ({
        id: 'conv-cloud',
        project_id: null,
        runtime_location: 'cloud',
      })
      const localMessages = [
        { conversation_id: 'conv-cloud', message_id: 'm1', payload_json: JSON.stringify({ id: 'm1', role: 'user', content: 'cached' }) },
      ]
      listConversationMessagesCache = () => localMessages

      const result = await getMessageCache({
        conversationId: 'conv-cloud',
        findConversation,
        findProjectById,
        findCloudInstanceById,
        ensureFreshCloudSession,
        getAuthJson,
        replaceConversationMessagesCache,
        listConversationMessagesCache,
      })

      expect(result).toEqual([{ id: 'm1', role: 'user', content: 'cached' }])
      expect(ensureFreshCloudSession).not.toHaveBeenCalled()
    })

    it('returns local cache when project has no cloud_instance_id', async () => {
      findConversation = () => ({
        id: 'conv-cloud',
        project_id: 'proj-1',
        runtime_location: 'cloud',
      })
      findProjectById = () => ({ id: 'proj-1', cloud_instance_id: null })
      const localMessages = [
        { conversation_id: 'conv-cloud', message_id: 'm1', payload_json: JSON.stringify({ id: 'm1', role: 'user', content: 'cached' }) },
      ]
      listConversationMessagesCache = () => localMessages

      const result = await getMessageCache({
        conversationId: 'conv-cloud',
        findConversation,
        findProjectById,
        findCloudInstanceById,
        ensureFreshCloudSession,
        getAuthJson,
        replaceConversationMessagesCache,
        listConversationMessagesCache,
      })

      expect(result).toEqual([{ id: 'm1', role: 'user', content: 'cached' }])
      expect(ensureFreshCloudSession).not.toHaveBeenCalled()
    })

    it('returns local cache when cloud instance has no access_token', async () => {
      findConversation = () => ({
        id: 'conv-cloud',
        project_id: 'proj-1',
        runtime_location: 'cloud',
      })
      findProjectById = () => ({ id: 'proj-1', cloud_instance_id: 'inst-1' })
      findCloudInstanceById = () => ({ id: 'inst-1', base_url: 'https://cloud.example.com', access_token: null })
      const localMessages = [
        { conversation_id: 'conv-cloud', message_id: 'm1', payload_json: JSON.stringify({ id: 'm1', role: 'user', content: 'cached' }) },
      ]
      listConversationMessagesCache = () => localMessages

      const result = await getMessageCache({
        conversationId: 'conv-cloud',
        findConversation,
        findProjectById,
        findCloudInstanceById,
        ensureFreshCloudSession,
        getAuthJson,
        replaceConversationMessagesCache,
        listConversationMessagesCache,
      })

      expect(result).toEqual([{ id: 'm1', role: 'user', content: 'cached' }])
      expect(ensureFreshCloudSession).not.toHaveBeenCalled()
      expect(getAuthJson).not.toHaveBeenCalled()
    })
  })

  describe('cloud conversation — cloud fetch path', () => {
    it('replaces local cache with cloud messages and returns them on successful fetch', async () => {
      findConversation = () => ({
        id: 'conv-cloud',
        project_id: 'proj-1',
        runtime_location: 'cloud',
      })
      findProjectById = () => ({ id: 'proj-1', cloud_instance_id: 'inst-1' })
      findCloudInstanceById = () => ({ id: 'inst-1', base_url: 'https://cloud.example.com', access_token: 'tok-abc' })
      ensureFreshCloudSession = vi.fn().mockResolvedValue(true)
      getAuthJson = vi.fn().mockResolvedValue({
        conversationId: 'conv-cloud',
        messages: [
          { id: 'cm1', role: 'user', timestamp: 1234567890, content: 'cloud msg 1' },
          { id: 'cm2', role: 'assistant', timestamp: 1234567891, content: 'cloud reply' },
        ],
      })

      // Track what replaceConversationMessagesCache is called with; on the next
      // listConversationMessagesCache call (the re-read after replacement), return those rows.
      let replacedRows: MessageCacheRow[] = []
      replaceConversationMessagesCache = vi.fn().mockImplementation((_cid, msgs) => {
        replacedRows = msgs.map((m) => ({
          conversation_id: 'conv-cloud',
          message_id: m.id,
          payload_json: m.payloadJson,
        }))
      })
      listConversationMessagesCache = vi.fn().mockImplementation(() => replacedRows)

      const result = await getMessageCache({
        conversationId: 'conv-cloud',
        findConversation,
        findProjectById,
        findCloudInstanceById,
        ensureFreshCloudSession,
        getAuthJson,
        replaceConversationMessagesCache,
        listConversationMessagesCache,
      })

      expect(result).toEqual([
        { id: 'cm1', role: 'user', timestamp: 1234567890, content: 'cloud msg 1' },
        { id: 'cm2', role: 'assistant', timestamp: 1234567891, content: 'cloud reply' },
      ])
      expect(ensureFreshCloudSession).toHaveBeenCalledWith('inst-1')
      expect(getAuthJson).toHaveBeenCalledWith(
        '/v1/conversations/conv-cloud/messages',
        'tok-abc',
      )
      expect(replaceConversationMessagesCache).toHaveBeenCalledWith(
        'conv-cloud',
        [
          { id: 'cm1', role: 'user', payloadJson: JSON.stringify({ id: 'cm1', role: 'user', timestamp: 1234567890, content: 'cloud msg 1' }) },
          { id: 'cm2', role: 'assistant', payloadJson: JSON.stringify({ id: 'cm2', role: 'assistant', timestamp: 1234567891, content: 'cloud reply' }) },
        ],
      )
    })

    it('falls through to local cache when ensureFreshCloudSession returns false', async () => {
      findConversation = () => ({
        id: 'conv-cloud',
        project_id: 'proj-1',
        runtime_location: 'cloud',
      })
      findProjectById = () => ({ id: 'proj-1', cloud_instance_id: 'inst-1' })
      findCloudInstanceById = () => ({ id: 'inst-1', base_url: 'https://cloud.example.com', access_token: 'tok-abc' })
      ensureFreshCloudSession = vi.fn().mockResolvedValue(false)
      const localMessages = [
        { conversation_id: 'conv-cloud', message_id: 'm1', payload_json: JSON.stringify({ id: 'm1', role: 'user', content: 'local fallback' }) },
      ]
      listConversationMessagesCache = vi.fn().mockReturnValue(localMessages)

      const result = await getMessageCache({
        conversationId: 'conv-cloud',
        findConversation,
        findProjectById,
        findCloudInstanceById,
        ensureFreshCloudSession,
        getAuthJson,
        replaceConversationMessagesCache,
        listConversationMessagesCache,
      })

      expect(result).toEqual([{ id: 'm1', role: 'user', content: 'local fallback' }])
      expect(getAuthJson).not.toHaveBeenCalled()
      expect(replaceConversationMessagesCache).not.toHaveBeenCalled()
    })

    it('falls through to local cache when cloud fetch throws', async () => {
      findConversation = () => ({
        id: 'conv-cloud',
        project_id: 'proj-1',
        runtime_location: 'cloud',
      })
      findProjectById = () => ({ id: 'proj-1', cloud_instance_id: 'inst-1' })
      findCloudInstanceById = () => ({ id: 'inst-1', base_url: 'https://cloud.example.com', access_token: 'tok-abc' })
      ensureFreshCloudSession = vi.fn().mockResolvedValue(true)
      getAuthJson = vi.fn().mockRejectedValue(new Error('Network error'))
      const localMessages = [
        { conversation_id: 'conv-cloud', message_id: 'm1', payload_json: JSON.stringify({ id: 'm1', role: 'user', content: 'local fallback' }) },
      ]
      listConversationMessagesCache = vi.fn().mockReturnValue(localMessages)

      const result = await getMessageCache({
        conversationId: 'conv-cloud',
        findConversation,
        findProjectById,
        findCloudInstanceById,
        ensureFreshCloudSession,
        getAuthJson,
        replaceConversationMessagesCache,
        listConversationMessagesCache,
      })

      expect(result).toEqual([{ id: 'm1', role: 'user', content: 'local fallback' }])
      expect(replaceConversationMessagesCache).not.toHaveBeenCalled()
    })
  })

  describe('local cache parsing and filtering', () => {
    it('filters out rows with unparseable payload_json', async () => {
      findConversation = () => ({
        id: 'conv-1',
        project_id: null,
        runtime_location: 'local',
      })
      listConversationMessagesCache = () => [
        { conversation_id: 'conv-1', message_id: 'm1', payload_json: JSON.stringify({ id: 'm1', role: 'user', content: 'valid' }) },
        { conversation_id: 'conv-1', message_id: 'm2', payload_json: 'not valid json {{{' },
        { conversation_id: 'conv-1', message_id: 'm3', payload_json: JSON.stringify({ id: 'm3', role: 'assistant', content: 'also valid' }) },
      ]

      const result = await getMessageCache({
        conversationId: 'conv-1',
        findConversation,
        findProjectById,
        findCloudInstanceById,
        ensureFreshCloudSession,
        getAuthJson,
        replaceConversationMessagesCache,
        listConversationMessagesCache,
      })

      expect(result).toEqual([
        { id: 'm1', role: 'user', content: 'valid' },
        { id: 'm3', role: 'assistant', content: 'also valid' },
      ])
    })

    it('returns empty array when all rows have unparseable payload_json', async () => {
      findConversation = () => ({
        id: 'conv-1',
        project_id: null,
        runtime_location: 'local',
      })
      listConversationMessagesCache = () => [
        { conversation_id: 'conv-1', message_id: 'm1', payload_json: 'broken json' },
        { conversation_id: 'conv-1', message_id: 'm2', payload_json: '' },
      ]

      const result = await getMessageCache({
        conversationId: 'conv-1',
        findConversation,
        findProjectById,
        findCloudInstanceById,
        ensureFreshCloudSession,
        getAuthJson,
        replaceConversationMessagesCache,
        listConversationMessagesCache,
      })

      expect(result).toEqual([])
    })
  })
})
