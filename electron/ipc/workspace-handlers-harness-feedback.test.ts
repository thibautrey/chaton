import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `conversations:getHarnessFeedback` and
 * `conversations:setHarnessFeedback` IPC handlers.
 *
 * Both are core to the Meta-Harness feedback layer but had no dedicated unit tests.
 * We replicate minimal handler logic inline to test without needing the full
 * workspace-handlers.ts module (which requires database, IPC, Electron, and PiRuntimeManager wiring).
 *
 * Key behaviors verified:
 * - getHarnessFeedback: conversation_not_found guard, null vs. existing feedback
 * - setHarnessFeedback: conversation_not_found guard, enabled/userRating logic,
 *   candidate loading, upsert call, and workspace:conversationUpdated broadcast
 */

// -------------------------------------------------------------------------
// Types mirroring the real handler signatures
// -------------------------------------------------------------------------

type HarnessCandidate = {
  id: string
  workArea: string
  prompt: Record<string, unknown>
  bootstrap: Record<string, unknown>
  tools: Record<string, unknown>
  scoring: Record<string, unknown>
  description?: string
  createdAt: string
}

type FeedbackRecord = {
  conversationId: string
  harnessCandidateId: string | null
  harnessSnapshot: HarnessCandidate | null
  enabled: boolean
  userRating: -1 | 1 | null
  userFeedbackSubmittedAt: string | null
  createdAt: string
  updatedAt: string
}

type GetFeedbackResult =
  | { ok: true; feedback: FeedbackRecord | null }
  | { ok: false; reason: 'conversation_not_found' }

type SetFeedbackInput = { enabled?: boolean; userRating?: -1 | 1 | null } | null | undefined
type SetFeedbackResult =
  | { ok: true; feedback: FeedbackRecord }
  | { ok: false; reason: 'conversation_not_found' }

interface Conversation {
  id: string
}

// -------------------------------------------------------------------------
// Inline minimal handler for `conversations:getHarnessFeedback`
// Mirrors workspace-handlers.ts lines 3048–3061.
// -------------------------------------------------------------------------

function getHarnessFeedback(params: {
  conversation: Conversation | null
  getConversationHarnessFeedback: (conversationId: string) => FeedbackRecord | null
}): GetFeedbackResult {
  const { conversation, getConversationHarnessFeedback } = params
  if (!conversation) {
    return { ok: false, reason: 'conversation_not_found' }
  }
  return {
    ok: true,
    feedback: getConversationHarnessFeedback(conversation.id),
  }
}

// -------------------------------------------------------------------------
// Inline minimal handler for `conversations:setHarnessFeedback`
// Mirrors workspace-handlers.ts lines 3063–3111.
// -------------------------------------------------------------------------

function setHarnessFeedback(params: {
  conversation: Conversation | null
  getConversationHarnessFeedback: (conversationId: string) => FeedbackRecord | null
  upsertConversationHarnessFeedback: (params: {
    conversationId: string
    harnessCandidateId?: string | null
    harnessSnapshot?: HarnessCandidate | null
    enabled: boolean
    userRating?: -1 | 1 | null
    userFeedbackSubmittedAt?: string | null
  }) => FeedbackRecord
  readActiveCandidate: (agentDir: string) => string | null
  getDefaultHarnessCandidate: () => HarnessCandidate
  loadHarnessCandidate: (agentDir: string, candidateId: string) => HarnessCandidate
  appGetPath: (name: 'userData') => string
  broadcast: (conversationId: string, updatedAt: string) => void
  input: SetFeedbackInput
}): SetFeedbackResult {
  const {
    conversation,
    getConversationHarnessFeedback,
    upsertConversationHarnessFeedback,
    readActiveCandidate,
    getDefaultHarnessCandidate,
    loadHarnessCandidate,
    appGetPath,
    broadcast,
    input,
  } = params

  if (!conversation) {
    return { ok: false, reason: 'conversation_not_found' }
  }

  const existing = getConversationHarnessFeedback(conversation.id)
  const enabled = typeof input?.enabled === 'boolean' ? input.enabled : (existing?.enabled ?? false)
  const userRating = Object.prototype.hasOwnProperty.call(input ?? {}, 'userRating')
    ? (input?.userRating ?? null)
    : (existing?.userRating ?? null)

  const agentDir = appGetPath('userData') + '/.pi/agent'
  const activeCandidateId = enabled
    ? (readActiveCandidate(agentDir) ?? getDefaultHarnessCandidate().id)
    : null
  const harnessCandidate = enabled && activeCandidateId
    ? loadHarnessCandidate(agentDir, activeCandidateId)
    : null

  const feedback = upsertConversationHarnessFeedback({
    conversationId: conversation.id,
    harnessCandidateId: harnessCandidate?.id ?? null,
    harnessSnapshot: harnessCandidate,
    enabled,
    userRating,
    userFeedbackSubmittedAt: Object.prototype.hasOwnProperty.call(input ?? {}, 'userRating')
      ? new Date().toISOString()
      : (existing?.userFeedbackSubmittedAt ?? null),
  })

  broadcast(conversation.id, feedback.updatedAt)
  return { ok: true, feedback }
}

// -------------------------------------------------------------------------
// Mock factories — each test gets fresh instances
// -------------------------------------------------------------------------

function makeFeedback(overrides: Partial<FeedbackRecord> = {}): FeedbackRecord {
  const now = new Date().toISOString()
  return {
    conversationId: 'conv-1',
    harnessCandidateId: 'baseline-env',
    harnessSnapshot: { id: 'baseline-env', workArea: 'environment-bootstrap', prompt: {}, bootstrap: {}, tools: {}, scoring: {}, createdAt: now },
    enabled: false,
    userRating: null,
    userFeedbackSubmittedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeCandidate(id = 'test-candidate'): HarnessCandidate {
  return {
    id,
    workArea: 'environment-bootstrap',
    prompt: {},
    bootstrap: {},
    tools: {},
    scoring: {},
    createdAt: new Date().toISOString(),
  }
}

// -------------------------------------------------------------------------
// Tests: conversations:getHarnessFeedback
// -------------------------------------------------------------------------

describe('conversations:getHarnessFeedback', () => {
  describe('conversation not found', () => {
    it('returns conversation_not_found when no conversation exists', () => {
      const getConversationHarnessFeedback = vi.fn()
      const result = getHarnessFeedback({
        conversation: null,
        getConversationHarnessFeedback,
      })
      expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
      expect(getConversationHarnessFeedback).not.toHaveBeenCalled()
    })
  })

  describe('conversation exists', () => {
    it('returns ok:true with feedback:null when no existing feedback', () => {
      const getConversationHarnessFeedback = vi.fn().mockReturnValue(null)
      const result = getHarnessFeedback({
        conversation: { id: 'conv-1' },
        getConversationHarnessFeedback,
      })
      expect(result).toEqual({ ok: true, feedback: null })
      expect(getConversationHarnessFeedback).toHaveBeenCalledWith('conv-1')
    })

    it('returns ok:true with existing feedback record when found', () => {
      const existing = makeFeedback({ conversationId: 'conv-1', enabled: true, userRating: 1 })
      const getConversationHarnessFeedback = vi.fn().mockReturnValue(existing)
      const result = getHarnessFeedback({
        conversation: { id: 'conv-1' },
        getConversationHarnessFeedback,
      })
      expect(result).toEqual({ ok: true, feedback: existing })
      expect(getConversationHarnessFeedback).toHaveBeenCalledWith('conv-1')
    })
  })
})

// -------------------------------------------------------------------------
// Tests: conversations:setHarnessFeedback
// -------------------------------------------------------------------------

describe('conversations:setHarnessFeedback', () => {
  let getConversationHarnessFeedback: ReturnType<typeof vi.fn>
  let upsertConversationHarnessFeedback: ReturnType<typeof vi.fn>
  let readActiveCandidate: ReturnType<typeof vi.fn>
  let getDefaultHarnessCandidate: ReturnType<typeof vi.fn>
  let loadHarnessCandidate: ReturnType<typeof vi.fn>
  let appGetPath: ReturnType<typeof vi.fn>
  let broadcast: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getConversationHarnessFeedback = vi.fn().mockReturnValue(null)
    upsertConversationHarnessFeedback = vi.fn().mockImplementation(({ conversationId }) =>
      makeFeedback({ conversationId, updatedAt: new Date().toISOString() })
    )
    readActiveCandidate = vi.fn().mockReturnValue(null)
    getDefaultHarnessCandidate = vi.fn().mockReturnValue(makeCandidate('baseline-env'))
    loadHarnessCandidate = vi.fn().mockReturnValue(makeCandidate('active-candidate'))
    appGetPath = vi.fn().mockReturnValue('/fake/userdata')
    broadcast = vi.fn()
  })

  describe('conversation not found', () => {
    it('returns conversation_not_found when no conversation exists', () => {
      const result = setHarnessFeedback({
        conversation: null,
        getConversationHarnessFeedback,
        upsertConversationHarnessFeedback,
        readActiveCandidate,
        getDefaultHarnessCandidate,
        loadHarnessCandidate,
        appGetPath,
        broadcast,
        input: { enabled: true },
      })
      expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
      expect(upsertConversationHarnessFeedback).not.toHaveBeenCalled()
      expect(broadcast).not.toHaveBeenCalled()
    })
  })

  describe('enabled field', () => {
    it('sets enabled:true when input.enabled is true', () => {
      const result = setHarnessFeedback({
        conversation: { id: 'conv-1' },
        getConversationHarnessFeedback,
        upsertConversationHarnessFeedback,
        readActiveCandidate,
        getDefaultHarnessCandidate,
        loadHarnessCandidate,
        appGetPath,
        broadcast,
        input: { enabled: true },
      })
      expect(result.ok).toBe(true)
      expect(upsertConversationHarnessFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true })
      )
    })

    it('sets enabled:false when input.enabled is false', () => {
      getConversationHarnessFeedback = vi.fn().mockReturnValue(makeFeedback({ enabled: true }))
      const result = setHarnessFeedback({
        conversation: { id: 'conv-1' },
        getConversationHarnessFeedback,
        upsertConversationHarnessFeedback,
        readActiveCandidate,
        getDefaultHarnessCandidate,
        loadHarnessCandidate,
        appGetPath,
        broadcast,
        input: { enabled: false },
      })
      expect(result.ok).toBe(true)
      expect(upsertConversationHarnessFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false })
      )
    })

    it('defaults to existing.enabled when input is null', () => {
      const existing = makeFeedback({ enabled: true })
      getConversationHarnessFeedback = vi.fn().mockReturnValue(existing)
      setHarnessFeedback({
        conversation: { id: 'conv-1' },
        getConversationHarnessFeedback,
        upsertConversationHarnessFeedback,
        readActiveCandidate,
        getDefaultHarnessCandidate,
        loadHarnessCandidate,
        appGetPath,
        broadcast,
        input: null,
      })
      expect(upsertConversationHarnessFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true })
      )
    })

    it('defaults to existing.enabled when input is undefined', () => {
      const existing = makeFeedback({ enabled: false })
      getConversationHarnessFeedback = vi.fn().mockReturnValue(existing)
      setHarnessFeedback({
        conversation: { id: 'conv-1' },
        getConversationHarnessFeedback,
        upsertConversationHarnessFeedback,
        readActiveCandidate,
        getDefaultHarnessCandidate,
        loadHarnessCandidate,
        appGetPath,
        broadcast,
        input: undefined,
      })
      expect(upsertConversationHarnessFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false })
      )
    })

    it('defaults to false when no existing and input is undefined', () => {
      setHarnessFeedback({
        conversation: { id: 'conv-1' },
        getConversationHarnessFeedback,
        upsertConversationHarnessFeedback,
        readActiveCandidate,
        getDefaultHarnessCandidate,
        loadHarnessCandidate,
        appGetPath,
        broadcast,
        input: undefined,
      })
      expect(upsertConversationHarnessFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false })
      )
    })
  })

  describe('userRating field — hasOwnProperty semantics', () => {
    it('accepts userRating:1 (thumbs up)', () => {
      setHarnessFeedback({
        conversation: { id: 'conv-1' },
        getConversationHarnessFeedback,
        upsertConversationHarnessFeedback,
        readActiveCandidate,
        getDefaultHarnessCandidate,
        loadHarnessCandidate,
        appGetPath,
        broadcast,
        input: { userRating: 1 },
      })
      expect(upsertConversationHarnessFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ userRating: 1 })
      )
    })

    it('accepts userRating:-1 (thumbs down)', () => {
      setHarnessFeedback({
        conversation: { id: 'conv-1' },
        getConversationHarnessFeedback,
        upsertConversationHarnessFeedback,
        readActiveCandidate,
        getDefaultHarnessCandidate,
        loadHarnessCandidate,
        appGetPath,
        broadcast,
        input: { userRating: -1 },
      })
      expect(upsertConversationHarnessFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ userRating: -1 })
      )
    })

    it('accepts userRating:null (explicit clearing)', () => {
      const existing = makeFeedback({ userRating: 1 })
      getConversationHarnessFeedback = vi.fn().mockReturnValue(existing)
      setHarnessFeedback({
        conversation: { id: 'conv-1' },
        getConversationHarnessFeedback,
        upsertConversationHarnessFeedback,
        readActiveCandidate,
        getDefaultHarnessCandidate,
        loadHarnessCandidate,
        appGetPath,
        broadcast,
        input: { userRating: null },
      })
      // hasOwnProperty sees "userRating" so it uses input.userRating (null), not existing
      expect(upsertConversationHarnessFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ userRating: null })
      )
    })

    it('preserves existing userRating when input omits userRating', () => {
      const existing = makeFeedback({ userRating: 1 })
      getConversationHarnessFeedback = vi.fn().mockReturnValue(existing)
      setHarnessFeedback({
        conversation: { id: 'conv-1' },
        getConversationHarnessFeedback,
        upsertConversationHarnessFeedback,
        readActiveCandidate,
        getDefaultHarnessCandidate,
        loadHarnessCandidate,
        appGetPath,
        broadcast,
        input: { enabled: true }, // no userRating key
      })
      // hasOwnProperty misses "userRating" so it falls back to existing.userRating
      expect(upsertConversationHarnessFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ userRating: 1 })
      )
    })

    it('preserves existing userRating when input is null', () => {
      const existing = makeFeedback({ userRating: -1 })
      getConversationHarnessFeedback = vi.fn().mockReturnValue(existing)
      setHarnessFeedback({
        conversation: { id: 'conv-1' },
        getConversationHarnessFeedback,
        upsertConversationHarnessFeedback,
        readActiveCandidate,
        getDefaultHarnessCandidate,
        loadHarnessCandidate,
        appGetPath,
        broadcast,
        input: null,
      })
      expect(upsertConversationHarnessFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ userRating: -1 })
      )
    })
  })

  describe('userFeedbackSubmittedAt — timestamp tracking', () => {
    it('sets userFeedbackSubmittedAt when userRating is explicitly provided', () => {
      const before = new Date().toISOString()
      setHarnessFeedback({
        conversation: { id: 'conv-1' },
        getConversationHarnessFeedback,
        upsertConversationHarnessFeedback,
        readActiveCandidate,
        getDefaultHarnessCandidate,
        loadHarnessCandidate,
        appGetPath,
        broadcast,
        input: { userRating: 1 },
      })
      const after = new Date().toISOString()
      expect(upsertConversationHarnessFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          userFeedbackSubmittedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
        })
      )
      // Verify it's a fresh timestamp (not null and roughly now)
      const submittedAt = upsertConversationHarnessFeedback.mock.calls[0][0].userFeedbackSubmittedAt as string
      expect(submittedAt >= before && submittedAt <= after).toBe(true)
    })

    it('sets userFeedbackSubmittedAt when userRating is explicitly null', () => {
      setHarnessFeedback({
        conversation: { id: 'conv-1' },
        getConversationHarnessFeedback,
        upsertConversationHarnessFeedback,
        readActiveCandidate,
        getDefaultHarnessCandidate,
        loadHarnessCandidate,
        appGetPath,
        broadcast,
        input: { userRating: null },
      })
      expect(upsertConversationHarnessFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          userFeedbackSubmittedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
        })
      )
    })

    it('preserves existing userFeedbackSubmittedAt when userRating is absent', () => {
      const existingTimestamp = '2024-01-01T00:00:00.000Z'
      const existing = makeFeedback({ userRating: 1, userFeedbackSubmittedAt: existingTimestamp })
      getConversationHarnessFeedback = vi.fn().mockReturnValue(existing)
      setHarnessFeedback({
        conversation: { id: 'conv-1' },
        getConversationHarnessFeedback,
        upsertConversationHarnessFeedback,
        readActiveCandidate,
        getDefaultHarnessCandidate,
        loadHarnessCandidate,
        appGetPath,
        broadcast,
        input: { enabled: true }, // no userRating
      })
      expect(upsertConversationHarnessFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ userFeedbackSubmittedAt: existingTimestamp })
      )
    })
  })

  describe('harness candidate loading when enabled=true', () => {
    it('uses readActiveCandidate + getDefaultHarnessCandidate when no active candidate stored', () => {
      setHarnessFeedback({
        conversation: { id: 'conv-1' },
        getConversationHarnessFeedback,
        upsertConversationHarnessFeedback,
        readActiveCandidate,
        getDefaultHarnessCandidate,
        loadHarnessCandidate,
        appGetPath,
        broadcast,
        input: { enabled: true },
      })
      expect(readActiveCandidate).toHaveBeenCalledWith('/fake/userdata/.pi/agent')
      expect(getDefaultHarnessCandidate).toHaveBeenCalled()
      expect(loadHarnessCandidate).toHaveBeenCalledWith('/fake/userdata/.pi/agent', 'baseline-env')
    })

    it('uses stored activeCandidateId when readActiveCandidate returns one', () => {
      readActiveCandidate = vi.fn().mockReturnValue('stored-candidate-id')
      setHarnessFeedback({
        conversation: { id: 'conv-1' },
        getConversationHarnessFeedback,
        upsertConversationHarnessFeedback,
        readActiveCandidate,
        getDefaultHarnessCandidate,
        loadHarnessCandidate,
        appGetPath,
        broadcast,
        input: { enabled: true },
      })
      expect(getDefaultHarnessCandidate).not.toHaveBeenCalled()
      expect(loadHarnessCandidate).toHaveBeenCalledWith('/fake/userdata/.pi/agent', 'stored-candidate-id')
    })

    it('does not load harnessCandidate when enabled=false', () => {
      setHarnessFeedback({
        conversation: { id: 'conv-1' },
        getConversationHarnessFeedback,
        upsertConversationHarnessFeedback,
        readActiveCandidate,
        getDefaultHarnessCandidate,
        loadHarnessCandidate,
        appGetPath,
        broadcast,
        input: { enabled: false },
      })
      expect(readActiveCandidate).not.toHaveBeenCalled()
      expect(getDefaultHarnessCandidate).not.toHaveBeenCalled()
      expect(loadHarnessCandidate).not.toHaveBeenCalled()
    })

    it('upserts with harnessCandidateId=null and harnessSnapshot=null when enabled=false', () => {
      setHarnessFeedback({
        conversation: { id: 'conv-1' },
        getConversationHarnessFeedback,
        upsertConversationHarnessFeedback,
        readActiveCandidate,
        getDefaultHarnessCandidate,
        loadHarnessCandidate,
        appGetPath,
        broadcast,
        input: { enabled: false },
      })
      expect(upsertConversationHarnessFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ harnessCandidateId: null, harnessSnapshot: null })
      )
    })
  })

  describe('broadcast', () => {
    it('calls broadcast with correct conversationId and updatedAt', () => {
      const updatedAt = new Date().toISOString()
      upsertConversationHarnessFeedback = vi.fn().mockReturnValue(
        makeFeedback({ conversationId: 'conv-42', updatedAt })
      )
      setHarnessFeedback({
        conversation: { id: 'conv-42' },
        getConversationHarnessFeedback,
        upsertConversationHarnessFeedback,
        readActiveCandidate,
        getDefaultHarnessCandidate,
        loadHarnessCandidate,
        appGetPath,
        broadcast,
        input: { enabled: false },
      })
      expect(broadcast).toHaveBeenCalledWith('conv-42', updatedAt)
    })

    it('broadcast is called exactly once on success', () => {
      setHarnessFeedback({
        conversation: { id: 'conv-1' },
        getConversationHarnessFeedback,
        upsertConversationHarnessFeedback,
        readActiveCandidate,
        getDefaultHarnessCandidate,
        loadHarnessCandidate,
        appGetPath,
        broadcast,
        input: { enabled: true },
      })
      expect(broadcast).toHaveBeenCalledTimes(1)
    })
  })

  describe('upsert arguments — full shape', () => {
    it('passes all required fields to upsertConversationHarnessFeedback', () => {
      const existing = makeFeedback({ userRating: -1, userFeedbackSubmittedAt: '2024-01-01T00:00:00Z' })
      getConversationHarnessFeedback = vi.fn().mockReturnValue(existing)
      readActiveCandidate = vi.fn().mockReturnValue('active-cand')
      const candidate = makeCandidate('active-cand')
      loadHarnessCandidate = vi.fn().mockReturnValue(candidate)

      setHarnessFeedback({
        conversation: { id: 'conv-full' },
        getConversationHarnessFeedback,
        upsertConversationHarnessFeedback,
        readActiveCandidate,
        getDefaultHarnessCandidate,
        loadHarnessCandidate,
        appGetPath,
        broadcast,
        input: { enabled: true, userRating: 1 },
      })

      expect(upsertConversationHarnessFeedback).toHaveBeenCalledWith({
        conversationId: 'conv-full',
        harnessCandidateId: 'active-cand',
        harnessSnapshot: candidate,
        enabled: true,
        userRating: 1,
        userFeedbackSubmittedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
      })
    })
  })
})
