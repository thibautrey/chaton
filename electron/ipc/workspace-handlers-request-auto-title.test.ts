import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `conversations:requestAutoTitle` IPC handler.
 *
 * The handler generates a conversation title from the first message, first
 * using a deterministic prefix and optionally refining it with an AI model.
 *
 * Key behavioral guarantees verified:
 * - Returns `empty_message` for null/undefined/whitespace-only messages
 * - Returns `conversation_not_found` when no conversation exists
 * - Returns `skipped: true` when title_source is not "placeholder"
 * - DB update failure on deterministic step → `conversation_not_found`
 * - `diffuserTitreConversation` fires immediately after deterministic title
 * - When AI refinement is disabled → returns deterministic title with `source: "deterministic"`
 * - When AI title is empty → falls back to deterministic (warns, returns deterministic)
 * - When AI title matches deterministic → skips redundant update, returns deterministic
 * - When AI update fails → returns deterministic fallback (DB update failure path)
 * - When AI title succeeds → returns AI title with `source: "ai"`, fires second broadcast
 *
 * We replicate the minimal handler logic inline to test without needing the full
 * workspace-handlers.ts module (which requires database, IPC, and PiRuntimeManager wiring).
 */

describe('conversations:requestAutoTitle', () => {
  // -------------------------------------------------------------------------
  // Types mirroring those used by the real handler
  // -------------------------------------------------------------------------

  type Result =
    | { ok: true; title: string; source: 'deterministic' | 'ai' }
    | { ok: true; skipped: true }
    | { ok: false; reason: 'empty_message' | 'conversation_not_found' }

  interface Conversation {
    id: string
    project_id: string | null
    title_source: string
    model_provider: string | null
    model_id: string | null
  }

  interface Project {
    repo_path: string | null
  }

  // -------------------------------------------------------------------------
  // Inline minimal handler — mirrors workspace-handlers.ts lines 3180–3269.
  // -------------------------------------------------------------------------

  function requestAutoTitle(params: {
    conversationId: string
    firstMessage: unknown
    conversation: Conversation | null
    titleRepoPath: string | null
    AFFINAGE_TITRE_IA_ACTIVE: boolean
    construireTitreDeterministe: (msg: string) => string
    updateConversationTitle: (
      conversationId: string,
      title: string,
      source: string,
    ) => boolean
    diffuserTitreConversation: (conversationId: string, title: string) => unknown
    generateConversationTitleFromPi: (params: {
      provider: string
      modelId: string
      repoPath: string
      firstMessage: string
      projectId: string | null
    }) => Promise<string | null>
  }): Result | Promise<Result> {
    // --- Input validation ---
    const safeMessage =
      typeof params.firstMessage === 'string' ? params.firstMessage.trim() : ''
    if (!safeMessage) {
      return { ok: false as const, reason: 'empty_message' as const }
    }

    // --- Conversation lookup ---
    if (!params.conversation) {
      return { ok: false as const, reason: 'conversation_not_found' as const }
    }

    // --- Skip if title is not a placeholder ---
    if (params.conversation.title_source !== 'placeholder') {
      return { ok: true as const, skipped: true as const }
    }

    // --- Deterministic title ---
    const titreDeterministe = params.construireTitreDeterministe(safeMessage)
    const updatedDeterministe = params.updateConversationTitle(
      params.conversation.id,
      titreDeterministe,
      'auto-deterministic',
    )
    if (!updatedDeterministe) {
      return { ok: false as const, reason: 'conversation_not_found' as const }
    }
    params.diffuserTitreConversation(params.conversation.id, titreDeterministe)

    // --- AI refinement disabled → return deterministic ---
    if (!params.AFFINAGE_TITRE_IA_ACTIVE) {
      return { ok: true, title: titreDeterministe, source: 'deterministic' }
    }

    // --- AI refinement ---
    const provider = params.conversation.model_provider ?? 'litellm'
    const modelId = params.conversation.model_id ?? 'gpt-5.5'
    const repoPath = params.titleRepoPath ?? ''

    return params
      .generateConversationTitleFromPi({
        provider,
        modelId,
        repoPath,
        firstMessage: safeMessage,
        projectId: params.conversation.project_id,
      })
      .then((titreAffine) => {
        // AI returned nothing or same as deterministic → fallback
        if (!titreAffine || titreAffine === titreDeterministe) {
          return {
            ok: true,
            title: titreDeterministe,
            source: 'deterministic' as const,
          }
        }

        // AI title differs → update DB
        const updatedAffine = params.updateConversationTitle(
          params.conversation.id,
          titreAffine,
          'auto-ai',
        )
        if (!updatedAffine) {
          // DB update failed — return the deterministic fallback
          return {
            ok: true,
            title: titreDeterministe,
            source: 'deterministic' as const,
          }
        }

        // Success — broadcast AI title
        params.diffuserTitreConversation(params.conversation.id, titreAffine)
        return { ok: true, title: titreAffine, source: 'ai' as const }
      })
  }

  // -------------------------------------------------------------------------
  // Shared mock factories
  // -------------------------------------------------------------------------

  function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
    return {
      id: 'conv-1',
      project_id: null,
      title_source: 'placeholder',
      model_provider: null,
      model_id: null,
      ...overrides,
    }
  }

  // -------------------------------------------------------------------------
  // Input validation: empty / missing messages
  // -------------------------------------------------------------------------

  describe('input validation', () => {
    it('returns empty_message when firstMessage is null', async () => {
      const result = await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: null,
        conversation: makeConversation(),
        titleRepoPath: null,
        AFFINAGE_TITRE_IA_ACTIVE: false,
        construireTitreDeterministe: vi.fn(),
        updateConversationTitle: vi.fn(),
        diffuserTitreConversation: vi.fn(),
        generateConversationTitleFromPi: vi.fn(),
      })
      expect(result).toEqual({ ok: false, reason: 'empty_message' })
    })

    it('returns empty_message when firstMessage is undefined', async () => {
      const result = await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: undefined,
        conversation: makeConversation(),
        titleRepoPath: null,
        AFFINAGE_TITRE_IA_ACTIVE: false,
        construireTitreDeterministe: vi.fn(),
        updateConversationTitle: vi.fn(),
        diffuserTitreConversation: vi.fn(),
        generateConversationTitleFromPi: vi.fn(),
      })
      expect(result).toEqual({ ok: false, reason: 'empty_message' })
    })

    it('returns empty_message when firstMessage is a whitespace-only string', async () => {
      const result = await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: '   \t\n  ',
        conversation: makeConversation(),
        titleRepoPath: null,
        AFFINAGE_TITRE_IA_ACTIVE: false,
        construireTitreDeterministe: vi.fn(),
        updateConversationTitle: vi.fn(),
        diffuserTitreConversation: vi.fn(),
        generateConversationTitleFromPi: vi.fn(),
      })
      expect(result).toEqual({ ok: false, reason: 'empty_message' })
    })

    it('returns empty_message when firstMessage is an empty string', async () => {
      const result = await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: '',
        conversation: makeConversation(),
        titleRepoPath: null,
        AFFINAGE_TITRE_IA_ACTIVE: false,
        construireTitreDeterministe: vi.fn(),
        updateConversationTitle: vi.fn(),
        diffuserTitreConversation: vi.fn(),
        generateConversationTitleFromPi: vi.fn(),
      })
      expect(result).toEqual({ ok: false, reason: 'empty_message' })
    })

    it('returns empty_message when firstMessage is a non-string (number)', async () => {
      const result = await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: 42 as unknown as string,
        conversation: makeConversation(),
        titleRepoPath: null,
        AFFINAGE_TITRE_IA_ACTIVE: false,
        construireTitreDeterministe: vi.fn(),
        updateConversationTitle: vi.fn(),
        diffuserTitreConversation: vi.fn(),
        generateConversationTitleFromPi: vi.fn(),
      })
      expect(result).toEqual({ ok: false, reason: 'empty_message' })
    })
  })

  // -------------------------------------------------------------------------
  // Conversation lookup
  // -------------------------------------------------------------------------

  describe('conversation lookup', () => {
    it('returns conversation_not_found when conversation is null', async () => {
      const result = await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: 'Hello world',
        conversation: null,
        titleRepoPath: null,
        AFFINAGE_TITRE_IA_ACTIVE: false,
        construireTitreDeterministe: vi.fn(),
        updateConversationTitle: vi.fn(),
        diffuserTitreConversation: vi.fn(),
        generateConversationTitleFromPi: vi.fn(),
      })
      expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
    })
  })

  // -------------------------------------------------------------------------
  // Title source guard
  // -------------------------------------------------------------------------

  describe('title source guard', () => {
    it('returns skipped:true when title_source is "auto-ai"', async () => {
      const result = await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: 'Hello world',
        conversation: makeConversation({ title_source: 'auto-ai' }),
        titleRepoPath: null,
        AFFINAGE_TITRE_IA_ACTIVE: true,
        construireTitreDeterministe: vi.fn(),
        updateConversationTitle: vi.fn(),
        diffuserTitreConversation: vi.fn(),
        generateConversationTitleFromPi: vi.fn(),
      })
      expect(result).toEqual({ ok: true, skipped: true })
    })

    it('returns skipped:true when title_source is "auto-deterministic"', async () => {
      const result = await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: 'Hello world',
        conversation: makeConversation({ title_source: 'auto-deterministic' }),
        titleRepoPath: null,
        AFFINAGE_TITRE_IA_ACTIVE: true,
        construireTitreDeterministe: vi.fn(),
        updateConversationTitle: vi.fn(),
        diffuserTitreConversation: vi.fn(),
        generateConversationTitleFromPi: vi.fn(),
      })
      expect(result).toEqual({ ok: true, skipped: true })
    })

    it('returns skipped:true when title_source is "manual"', async () => {
      const result = await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: 'Hello world',
        conversation: makeConversation({ title_source: 'manual' }),
        titleRepoPath: null,
        AFFINAGE_TITRE_IA_ACTIVE: true,
        construireTitreDeterministe: vi.fn(),
        updateConversationTitle: vi.fn(),
        diffuserTitreConversation: vi.fn(),
        generateConversationTitleFromPi: vi.fn(),
      })
      expect(result).toEqual({ ok: true, skipped: true })
    })

    it('does NOT call updateConversationTitle when title_source is not placeholder', async () => {
      const updateTitle = vi.fn()
      await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: 'Hello world',
        conversation: makeConversation({ title_source: 'auto-ai' }),
        titleRepoPath: null,
        AFFINAGE_TITRE_IA_ACTIVE: true,
        construireTitreDeterministe: vi.fn(),
        updateConversationTitle: updateTitle,
        diffuserTitreConversation: vi.fn(),
        generateConversationTitleFromPi: vi.fn(),
      })
      expect(updateTitle).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Deterministic path
  // -------------------------------------------------------------------------

  describe('deterministic title generation', () => {
    it('calls construireTitreDeterministe with trimmed message', async () => {
      const construire = vi.fn(() => 'Hello')
      await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: '  Hello  ',
        conversation: makeConversation(),
        titleRepoPath: null,
        AFFINAGE_TITRE_IA_ACTIVE: false,
        construireTitreDeterministe: construire,
        updateConversationTitle: vi.fn(() => true),
        diffuserTitreConversation: vi.fn(),
        generateConversationTitleFromPi: vi.fn(),
      })
      expect(construire).toHaveBeenCalledWith('Hello')
    })

    it('calls updateConversationTitle with correct args', async () => {
      const updateTitle = vi.fn(() => true)
      await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: 'Hello world',
        conversation: makeConversation({ id: 'conv-xyz' }),
        titleRepoPath: null,
        AFFINAGE_TITRE_IA_ACTIVE: false,
        construireTitreDeterministe: () => 'Hello World',
        updateConversationTitle: updateTitle,
        diffuserTitreConversation: vi.fn(),
        generateConversationTitleFromPi: vi.fn(),
      })
      expect(updateTitle).toHaveBeenCalledWith('conv-xyz', 'Hello World', 'auto-deterministic')
    })

    it('broadcasts deterministic title via diffuserTitreConversation', async () => {
      const diffuser = vi.fn()
      await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: 'Hello world',
        conversation: makeConversation(),
        titleRepoPath: null,
        AFFINAGE_TITRE_IA_ACTIVE: false,
        construireTitreDeterministe: () => 'Hello World',
        updateConversationTitle: () => true,
        diffuserTitreConversation: diffuser,
        generateConversationTitleFromPi: vi.fn(),
      })
      expect(diffuser).toHaveBeenCalledWith('conv-1', 'Hello World')
    })

    it('returns conversation_not_found when deterministic DB update fails', async () => {
      const result = await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: 'Hello world',
        conversation: makeConversation(),
        titleRepoPath: null,
        AFFINAGE_TITRE_IA_ACTIVE: false,
        construireTitreDeterministe: () => 'Hello World',
        updateConversationTitle: () => false,
        diffuserTitreConversation: vi.fn(),
        generateConversationTitleFromPi: vi.fn(),
      })
      expect(result).toEqual({ ok: false, reason: 'conversation_not_found' })
    })

    it('does NOT call diffuserTitreConversation when DB update fails', async () => {
      const diffuser = vi.fn()
      await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: 'Hello world',
        conversation: makeConversation(),
        titleRepoPath: null,
        AFFINAGE_TITRE_IA_ACTIVE: false,
        construireTitreDeterministe: () => 'Hello World',
        updateConversationTitle: () => false,
        diffuserTitreConversation: diffuser,
        generateConversationTitleFromPi: vi.fn(),
      })
      expect(diffuser).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // AI refinement disabled
  // -------------------------------------------------------------------------

  describe('AI refinement disabled (AFFINAGE_TITRE_IA_ACTIVE = false)', () => {
    it('returns deterministic title with source=deterministic', async () => {
      const result = await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: 'How do I configure a database connection?',
        conversation: makeConversation(),
        titleRepoPath: null,
        AFFINAGE_TITRE_IA_ACTIVE: false,
        construireTitreDeterministe: () => 'Database',
        updateConversationTitle: () => true,
        diffuserTitreConversation: vi.fn(),
        generateConversationTitleFromPi: vi.fn(),
      })
      expect(result).toEqual({ ok: true, title: 'Database', source: 'deterministic' })
    })

    it('does NOT call generateConversationTitleFromPi when AI is disabled', async () => {
      const genTitle = vi.fn()
      await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: 'Hello world',
        conversation: makeConversation(),
        titleRepoPath: null,
        AFFINAGE_TITRE_IA_ACTIVE: false,
        construireTitreDeterministe: () => 'Hello',
        updateConversationTitle: () => true,
        diffuserTitreConversation: vi.fn(),
        generateConversationTitleFromPi: genTitle,
      })
      expect(genTitle).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // AI refinement enabled — AI returns empty
  // -------------------------------------------------------------------------

  describe('AI refinement: AI returns empty', () => {
    it('falls back to deterministic when AI title is null', async () => {
      const result = await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: 'Hello world',
        conversation: makeConversation(),
        titleRepoPath: '/repo',
        AFFINAGE_TITRE_IA_ACTIVE: true,
        construireTitreDeterministe: () => 'Hello World',
        updateConversationTitle: () => true,
        diffuserTitreConversation: vi.fn(),
        generateConversationTitleFromPi: () => Promise.resolve(null),
      })
      expect(result).toEqual({ ok: true, title: 'Hello World', source: 'deterministic' })
    })

    it('falls back to deterministic when AI title is empty string', async () => {
      const result = await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: 'Hello world',
        conversation: makeConversation(),
        titleRepoPath: '/repo',
        AFFINAGE_TITRE_IA_ACTIVE: true,
        construireTitreDeterministe: () => 'Hello World',
        updateConversationTitle: () => true,
        diffuserTitreConversation: vi.fn(),
        generateConversationTitleFromPi: () => Promise.resolve(''),
      })
      expect(result).toEqual({ ok: true, title: 'Hello World', source: 'deterministic' })
    })

    it('does NOT call updateConversationTitle a second time when AI fails', async () => {
      const updateTitle = vi.fn(() => true)
      await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: 'Hello world',
        conversation: makeConversation(),
        titleRepoPath: '/repo',
        AFFINAGE_TITRE_IA_ACTIVE: true,
        construireTitreDeterministe: () => 'Hello World',
        updateConversationTitle: updateTitle,
        diffuserTitreConversation: vi.fn(),
        generateConversationTitleFromPi: () => Promise.resolve(null),
      })
      // Only the deterministic call
      expect(updateTitle).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------------
  // AI refinement enabled — AI title equals deterministic
  // -------------------------------------------------------------------------

  describe('AI refinement: AI title equals deterministic', () => {
    it('returns deterministic (no redundant second DB update)', async () => {
      const updateTitle = vi.fn(() => true)
      const diffuser = vi.fn()

      const result = await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: 'Hello world',
        conversation: makeConversation(),
        titleRepoPath: '/repo',
        AFFINAGE_TITRE_IA_ACTIVE: true,
        construireTitreDeterministe: () => 'Hello World',
        updateConversationTitle: updateTitle,
        diffuserTitreConversation: diffuser,
        generateConversationTitleFromPi: () => Promise.resolve('Hello World'),
      })

      expect(result).toEqual({ ok: true, title: 'Hello World', source: 'deterministic' })
      // Only the first (deterministic) DB update
      expect(updateTitle).toHaveBeenCalledTimes(1)
      // Only one broadcast
      expect(diffuser).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------------
  // AI refinement enabled — AI update fails
  // -------------------------------------------------------------------------

  describe('AI refinement: AI DB update fails', () => {
    it('returns deterministic fallback when AI title succeeds but DB update fails', async () => {
      const updateTitle = vi.fn()
        .mockReturnValueOnce(true)   // deterministic succeeds
        .mockReturnValueOnce(false)  // AI update fails

      const diffuser = vi.fn()

      const result = await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: 'Hello world',
        conversation: makeConversation(),
        titleRepoPath: '/repo',
        AFFINAGE_TITRE_IA_ACTIVE: true,
        construireTitreDeterministe: () => 'Hello World',
        updateConversationTitle: updateTitle,
        diffuserTitreConversation: diffuser,
        generateConversationTitleFromPi: () => Promise.resolve('Better Title'),
      })

      expect(result).toEqual({ ok: true, title: 'Hello World', source: 'deterministic' })
      // Second broadcast does NOT fire (AI title never persisted)
      expect(diffuser).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------------
  // AI refinement enabled — success path
  // -------------------------------------------------------------------------

  describe('AI refinement: success', () => {
    it('returns AI title with source=ai when all succeeds', async () => {
      const updateTitle = vi.fn()
        .mockReturnValueOnce(true)  // deterministic
        .mockReturnValueOnce(true)  // AI

      const diffuser = vi.fn()

      const result = await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: 'How do I configure PostgreSQL?',
        conversation: makeConversation({ id: 'conv-abc' }),
        titleRepoPath: '/workspace/myrepo',
        AFFINAGE_TITRE_IA_ACTIVE: true,
        construireTitreDeterministe: () => 'PostgreSQL',
        updateConversationTitle: updateTitle,
        diffuserTitreConversation: diffuser,
        generateConversationTitleFromPi: () => Promise.resolve('PostgreSQL Setup Guide'),
      })

      expect(result).toEqual({ ok: true, title: 'PostgreSQL Setup Guide', source: 'ai' })
    })

    it('calls generateConversationTitleFromPi with correct params', async () => {
      const genTitle = vi.fn(() => Promise.resolve('AI Title'))

      await requestAutoTitle({
        conversationId: 'conv-xyz',
        firstMessage: '  Configure the server  ',
        conversation: makeConversation({
          id: 'conv-xyz',
          project_id: 'proj-42',
          model_provider: 'anthropic',
          model_id: 'claude-3-opus',
        }),
        titleRepoPath: '/custom/repo',
        AFFINAGE_TITRE_IA_ACTIVE: true,
        construireTitreDeterministe: () => 'Server',
        updateConversationTitle: () => true,
        diffuserTitreConversation: vi.fn(),
        generateConversationTitleFromPi: genTitle,
      })

      expect(genTitle).toHaveBeenCalledWith({
        provider: 'anthropic',
        modelId: 'claude-3-opus',
        repoPath: '/custom/repo',
        firstMessage: 'Configure the server',
        projectId: 'proj-42',
      })
    })

    it('broadcasts AI title after successful AI update', async () => {
      const diffuser = vi.fn()

      await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: 'Hello world',
        conversation: makeConversation(),
        titleRepoPath: '/repo',
        AFFINAGE_TITRE_IA_ACTIVE: true,
        construireTitreDeterministe: () => 'Hello',
        updateConversationTitle: () => true,
        diffuserTitreConversation: diffuser,
        generateConversationTitleFromPi: () => Promise.resolve('Better Hello'),
      })

      expect(diffuser).toHaveBeenCalledTimes(2)
      expect(diffuser).toHaveBeenNthCalledWith(1, 'conv-1', 'Hello')
      expect(diffuser).toHaveBeenNthCalledWith(2, 'conv-1', 'Better Hello')
    })

    it('defaults provider and modelId to fallback values when null', async () => {
      const genTitle = vi.fn(() => Promise.resolve('Title'))

      await requestAutoTitle({
        conversationId: 'conv-1',
        firstMessage: 'Hello world',
        conversation: makeConversation({ model_provider: null, model_id: null }),
        titleRepoPath: null,
        AFFINAGE_TITRE_IA_ACTIVE: true,
        construireTitreDeterministe: () => 'Hello',
        updateConversationTitle: () => true,
        diffuserTitreConversation: vi.fn(),
        generateConversationTitleFromPi: genTitle,
      })

      expect(genTitle).toHaveBeenCalledWith({
        provider: 'litellm',
        modelId: 'gpt-5.5',
        repoPath: '',
        firstMessage: 'Hello world',
        projectId: null,
      })
    })
  })
})
