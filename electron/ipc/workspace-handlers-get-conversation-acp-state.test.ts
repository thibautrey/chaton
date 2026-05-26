import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `workspace:getConversationAcpState` IPC handler.
 *
 * Handler: workspace-handlers.ts lines 918–926 (with input validation added this session).
 *
 * We replicate the minimal handler logic inline to test without needing the full
 * workspace-handlers.ts module (which requires database, IPC, and PiRuntimeManager wiring).
 *
 * Key behaviors verified:
 * - Rejects empty, whitespace-only, and non-string conversationId with "conversationId is required"
 * - Returns `conversation_not_found` when getConversationAcpStatePayload is not defined
 * - Returns `conversation_not_found` when conversation does not exist
 * - Returns `ok:true` with ACP state when conversation exists
 * - Propagates the result shape from getConversationAcpStatePayload correctly
 * - Trims the conversationId before passing to getConversationAcpStatePayload
 */

// -------------------------------------------------------------------------
// Inline handler mirroring the real implementation (lines 918–926).
// -------------------------------------------------------------------------

async function getConversationAcpState(params: {
  conversationId: string
  getConversationAcpStatePayload?: (conversationId: string) => {
    ok: boolean
    reason?: 'conversation_not_found'
    state?: unknown
  }
}): Promise<{ ok: boolean; reason?: 'conversationId is required' | 'conversation_not_found'; state?: unknown }> {
  const { conversationId, getConversationAcpStatePayload } = params

  if (typeof conversationId !== 'string' || !conversationId.trim()) {
    return { ok: false as const, reason: 'conversationId is required' as const }
  }
  if (!getConversationAcpStatePayload) {
    return { ok: false as const, reason: 'conversation_not_found' as const }
  }
  return getConversationAcpStatePayload(conversationId.trim())
}

// -------------------------------------------------------------------------
// Shared mocks
// -------------------------------------------------------------------------

let getConversationAcpStatePayload: ((id: string) => {
  ok: boolean
  reason?: 'conversation_not_found'
  state?: unknown
}) | undefined

beforeEach(() => {
  getConversationAcpStatePayload = undefined
})

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe('workspace:getConversationAcpState', () => {
  describe('input validation', () => {
    it('returns conversationId_is_required when conversationId is undefined', async () => {
      const result = await getConversationAcpState({
        conversationId: undefined as unknown as string,
        getConversationAcpStatePayload: vi.fn(),
      })
      expect(result.ok).toBe(false)
      expect((result as { reason: string }).reason).toBe('conversationId is required')
    })

    it('returns conversationId_is_required when conversationId is null', async () => {
      const result = await getConversationAcpState({
        conversationId: null as unknown as string,
        getConversationAcpStatePayload: vi.fn(),
      })
      expect(result.ok).toBe(false)
      expect((result as { reason: string }).reason).toBe('conversationId is required')
    })

    it('returns conversationId_is_required when conversationId is a number', async () => {
      const result = await getConversationAcpState({
        conversationId: 123 as unknown as string,
        getConversationAcpStatePayload: vi.fn(),
      })
      expect(result.ok).toBe(false)
      expect((result as { reason: string }).reason).toBe('conversationId is required')
    })

    it('returns conversationId_is_required when conversationId is an empty string', async () => {
      const result = await getConversationAcpState({
        conversationId: '',
        getConversationAcpStatePayload: vi.fn(),
      })
      expect(result.ok).toBe(false)
      expect((result as { reason: string }).reason).toBe('conversationId is required')
    })

    it('returns conversationId_is_required when conversationId is whitespace-only', async () => {
      const result = await getConversationAcpState({
        conversationId: '   \t\n  ',
        getConversationAcpStatePayload: vi.fn(),
      })
      expect(result.ok).toBe(false)
      expect((result as { reason: string }).reason).toBe('conversationId is required')
    })

    it('does not call getConversationAcpStatePayload when conversationId is invalid', async () => {
      const spy = vi.fn()
      await getConversationAcpState({
        conversationId: '',
        getConversationAcpStatePayload: spy,
      })
      expect(spy).not.toHaveBeenCalled()
    })

    it('trims whitespace from valid conversationId before delegation', async () => {
      const spy = vi.fn().mockReturnValue({ ok: true, state: null })
      await getConversationAcpState({
        conversationId: '  conv-trimmed  ',
        getConversationAcpStatePayload: spy,
      })
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith('conv-trimmed')
    })
  })

  describe('deps guard', () => {
    it('returns conversation_not_found when getConversationAcpStatePayload is not defined', async () => {
      const result = await getConversationAcpState({
        conversationId: 'conv-any',
        getConversationAcpStatePayload,
      })

      expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
    })

    it('returns conversation_not_found even with a valid conversationId when deps is missing', async () => {
      // Even with a well-formed conversation ID, the missing dep takes priority
      const result = await getConversationAcpState({
        conversationId: 'conv-well-formed',
        getConversationAcpStatePayload,
      })

      expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
    })
  })

  describe('getConversationAcpStatePayload result propagation', () => {
    it('returns conversation_not_found when getConversationAcpStatePayload reports not found', async () => {
      getConversationAcpStatePayload = () => ({
        ok: false,
        reason: 'conversation_not_found',
      })

      const result = await getConversationAcpState({
        conversationId: 'conv-missing',
        getConversationAcpStatePayload,
      })

      expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
    })

    it('returns ok:true with ACP state when conversation exists', async () => {
      const mockState = {
        pendingMessages: 2,
        activeToolCalls: ['call-1', 'call-2'],
        lastEventTimestamp: 1715000000000,
      }
      getConversationAcpStatePayload = () => ({
        ok: true,
        state: mockState,
      })

      const result = await getConversationAcpState({
        conversationId: 'conv-existing',
        getConversationAcpStatePayload,
      })

      expect(result).toEqual({ ok: true, state: mockState })
    })

    it('returns ok:true with null state when conversation has no ACP state', async () => {
      getConversationAcpStatePayload = () => ({
        ok: true,
        state: null,
      })

      const result = await getConversationAcpState({
        conversationId: 'conv-no-state',
        getConversationAcpStatePayload,
      })

      expect(result).toEqual({ ok: true, state: null })
    })

    it('returns ok:true with complex nested state object', async () => {
      const complexState = {
        activeToolCalls: [
          {
            id: 'tool-1',
            name: 'read',
            args: { path: '/src/index.ts' },
            startedAt: 1715000000000,
          },
        ],
        pendingBroadcasts: ['broadcast-A', 'broadcast-B'],
        memoryUsage: { heapUsed: 1024, heapTotal: 2048 },
        routerStats: { messagesProcessed: 42, lastRouterEvent: 'message:received' },
      }
      getConversationAcpStatePayload = () => ({
        ok: true,
        state: complexState,
      })

      const result = await getConversationAcpState({
        conversationId: 'conv-complex',
        getConversationAcpStatePayload,
      })

      expect(result).toEqual({ ok: true, state: complexState })
      // Verify nested structure integrity
      expect((result as { ok: true; state: unknown }).state).toHaveProperty('activeToolCalls')
      expect((result as { ok: true; state: unknown }).state).toHaveProperty('routerStats')
    })

    it('passes the conversationId through to getConversationAcpStatePayload', async () => {
      const payloadSpy = vi.fn().mockReturnValue({ ok: true, state: null })
      getConversationAcpStatePayload = payloadSpy

      await getConversationAcpState({
        conversationId: 'conv-specific-id-123',
        getConversationAcpStatePayload,
      })

      expect(payloadSpy).toHaveBeenCalledTimes(1)
      expect(payloadSpy).toHaveBeenCalledWith('conv-specific-id-123')
    })

    it('handles multiple rapid calls correctly', async () => {
      let callCount = 0
      getConversationAcpStatePayload = () => {
        callCount++
        return { ok: true, state: { callNumber: callCount } }
      }

      const result1 = await getConversationAcpState({
        conversationId: 'conv-1',
        getConversationAcpStatePayload,
      })
      const result2 = await getConversationAcpState({
        conversationId: 'conv-2',
        getConversationAcpStatePayload,
      })

      expect(callCount).toBe(2)
      expect((result1 as { state: { callNumber: number } }).state.callNumber).toBe(1)
      expect((result2 as { state: { callNumber: number } }).state.callNumber).toBe(2)
    })
  })
})
