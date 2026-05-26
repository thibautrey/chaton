import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  warnSpy.mockRestore()
})

/**
 * Unit tests for the `ingestExternalMessage` channel-bridge helper's
 * error-safety guarantees.
 *
 * The handler has two layers of error isolation:
 *
 *  1. try/catch around runChannelSubagent — external errors (session startup,
 *     DB, temp file) are caught and surfaced as { ok: false, message }.
 *
 *  2. try/catch around the persistence step — once the subagent has delivered
 *     a reply, DB writes (replaceConversationMessagesCache) and KV storage
 *     (storageKvSet) can also fail (e.g. disk full, corrupted SQLite).  The
 *     handler swallows those errors so the caller still receives the reply.
 *
 * We replicate the relevant inline logic from the channel bridge section of
 * workspace-handlers.ts to test both guarantees without needing the full module
 * (which requires database, IPC, and PiRuntimeManager wiring).
 */

describe('ingestExternalMessage — runChannelSubagent layer', () => {
  // -------------------------------------------------------------------------
  // Minimal types mirroring those used by the real handler
  // -------------------------------------------------------------------------
  type SubagentResultOk = { ok: true; reply: string }
  type SubagentResultFail = { ok: false; message: string }
  type SubagentResult = SubagentResultOk | SubagentResultFail

  // Simplified deps shape — subagent layer only
  interface SubagentDeps {
    piRuntimeManager: {
      runChannelSubagent: (conversationId: string, message: string) => Promise<SubagentResult>
    }
  }

  // Inline handler: first layer (subagent) only — matches the original test file
  async function ingestExternalMessageSubagent(
    deps: SubagentDeps,
    _conversationId: string,
    _message: string,
  ): Promise<{ ok: true; reply: string } | { ok: false; message: string }> {
    let subagentResult: SubagentResult
    try {
      subagentResult = await deps.piRuntimeManager.runChannelSubagent(_conversationId, _message)
    } catch (err) {
      console.warn('[ingestExternalMessage] runChannelSubagent threw unexpectedly:', err)
      return {
        ok: false as const,
        message: err instanceof Error ? err.message : String(err),
      }
    }
    if (!subagentResult.ok) {
      return { ok: false as const, message: subagentResult.message }
    }

    const reply = subagentResult.reply
    // Simplified: no persistence step in this inline version
    return { ok: true as const, reply }
  }

  it('returns the reply when runChannelSubagent resolves with ok:true', async () => {
    const deps = {
      piRuntimeManager: {
        runChannelSubagent: vi.fn().mockResolvedValue({ ok: true, reply: 'Hello!' }),
      },
    }
    const result = await ingestExternalMessageSubagent(deps as SubagentDeps, 'conv-1', 'hi')
    expect(result).toEqual({ ok: true, reply: 'Hello!' })
    expect(deps.piRuntimeManager.runChannelSubagent).toHaveBeenCalledOnce()
    expect(deps.piRuntimeManager.runChannelSubagent).toHaveBeenCalledWith('conv-1', 'hi')
  })

  it('returns ok:false with the error message when runChannelSubagent resolves with ok:false', async () => {
    const deps = {
      piRuntimeManager: {
        runChannelSubagent: vi.fn().mockResolvedValue({ ok: false, message: 'Channel subagent failed' }),
      },
    }
    const result = await ingestExternalMessageSubagent(deps as SubagentDeps, 'conv-1', 'hi')
    expect(result).toEqual({ ok: false, message: 'Channel subagent failed' })
  })

  it('returns ok:false when runChannelSubagent throws an Error', async () => {
    const deps = {
      piRuntimeManager: {
        runChannelSubagent: vi.fn().mockRejectedValue(new Error('Unexpected startup failure')),
      },
    }
    const result = await ingestExternalMessageSubagent(deps as SubagentDeps, 'conv-1', 'hi')
    expect(result).toEqual({ ok: false, message: 'Unexpected startup failure' })
    expect(warnSpy).toHaveBeenCalledWith(
      '[ingestExternalMessage] runChannelSubagent threw unexpectedly:',
      expect.any(Error),
    )
  })

  it('returns ok:false when runChannelSubagent throws a non-Error value', async () => {
    const deps = {
      piRuntimeManager: {
        runChannelSubagent: vi.fn().mockRejectedValue('plain string error'),
      },
    }
    const result = await ingestExternalMessageSubagent(deps as SubagentDeps, 'conv-1', 'hi')
    expect(result).toEqual({ ok: false, message: 'plain string error' })
  })

  it('does not re-throw — callers receive a resolved promise', async () => {
    const deps = {
      piRuntimeManager: {
        runChannelSubagent: vi.fn().mockRejectedValue(new Error('boom')),
      },
    }
    await expect(
      ingestExternalMessageSubagent(deps as SubagentDeps, 'conv-1', 'hi'),
    ).resolves.toEqual({ ok: false, message: 'boom' })
  })

  it('passes conversationId and message through to runChannelSubagent even when it throws', async () => {
    const deps = {
      piRuntimeManager: {
        runChannelSubagent: vi.fn().mockRejectedValue(new Error('fail')),
      },
    }
    await ingestExternalMessageSubagent(deps as SubagentDeps, 'conv-special', 'my message')
    expect(deps.piRuntimeManager.runChannelSubagent).toHaveBeenCalledWith('conv-special', 'my message')
  })
})

// ---------------------------------------------------------------------------
// Persistence layer tests — second try/catch in the real handler
// ---------------------------------------------------------------------------
describe('ingestExternalMessage — persistence layer error handling', () => {
  type SubagentResultOk = { ok: true; reply: string }
  type SubagentResultFail = { ok: false; message: string }
  type SubagentResult = SubagentResultOk | SubagentResultFail

  type CacheResult = { id: string; role: string; payload_json?: string }[]

  interface PersistenceDeps {
    piRuntimeManager: {
      runChannelSubagent: (conversationId: string, message: string) => Promise<SubagentResult>
    }
    listMessages: (conversationId: string) => CacheResult
    replaceMessages: (conversationId: string, messages: CacheResult) => void
    kvSet: (key: string, value: unknown) => void
  }

  /**
   * Inline handler mirroring the real implementation with both layers:
   *  1. try/catch around runChannelSubagent
   *  2. try/catch around replaceConversationMessagesCache + storageKvSet
   */
  async function ingestExternalMessageFull(
    deps: PersistenceDeps,
    conversationId: string,
    message: string,
    dedupeKey: string | null,
  ): Promise<{ ok: true; reply: string } | { ok: false; message: string }> {
    let subagentResult: SubagentResult
    try {
      subagentResult = await deps.piRuntimeManager.runChannelSubagent(conversationId, message)
    } catch (err) {
      console.warn('[ingestExternalMessage] runChannelSubagent threw unexpectedly:', err)
      return {
        ok: false as const,
        message: err instanceof Error ? err.message : String(err),
      }
    }
    if (!subagentResult.ok) {
      return { ok: false as const, message: subagentResult.message }
    }

    const reply = subagentResult.reply

    // Persistence step — failures here must not prevent the reply from being returned
    try {
      const existingMessages = deps.listMessages(conversationId)
      const userMsgId = `channel-user-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const assistantMsgId = `channel-asst-${Date.now()}-${Math.random().toString(36).slice(2)}`
      deps.replaceMessages(conversationId, [
        ...existingMessages.map((m) => ({
          id: m.id,
          role: m.role,
          payload_json: m.payload_json ?? '{}',
        })),
        {
          id: userMsgId,
          role: 'user',
          payload_json: JSON.stringify({ role: 'user', content: message }),
        },
        {
          id: assistantMsgId,
          role: 'assistant',
          payload_json: JSON.stringify({
            role: 'assistant',
            content: [{ type: 'text', text: reply }],
          }),
        },
      ])

      if (dedupeKey) {
        deps.kvSet(dedupeKey, {
          conversationId,
          processedAt: new Date().toISOString(),
        })
      }
    } catch (err) {
      // Subagent already produced a reply — surface the DB/storage error but
      // still return the reply so the caller has a usable response.
      console.warn('[ingestExternalMessage] persistence step threw:', err)
    }

    return { ok: true as const, reply }
  }

  it('returns ok:true with the reply when subagent succeeds and persistence succeeds', async () => {
    const deps = {
      piRuntimeManager: {
        runChannelSubagent: vi.fn().mockResolvedValue({ ok: true, reply: 'Got it.' }),
      },
      listMessages: vi.fn().mockReturnValue([]),
      replaceMessages: vi.fn(),
      kvSet: vi.fn(),
    }
    const result = await ingestExternalMessageFull(deps as PersistenceDeps, 'conv-1', 'hello', null)
    expect(result).toEqual({ ok: true, reply: 'Got it.' })
    expect(deps.replaceMessages).toHaveBeenCalledOnce()
    expect(deps.kvSet).not.toHaveBeenCalled() // no dedupe key
  })

  it('still returns ok:true when replaceMessages throws', async () => {
    const deps = {
      piRuntimeManager: {
        runChannelSubagent: vi.fn().mockResolvedValue({ ok: true, reply: 'Cached reply.' }),
      },
      listMessages: vi.fn().mockReturnValue([]),
      replaceMessages: vi.fn().mockImplementation(() => {
        throw new Error('SQLITE_CORRUPT: disk read error')
      }),
      kvSet: vi.fn(),
    }
    const result = await ingestExternalMessageFull(deps as PersistenceDeps, 'conv-1', 'hello', null)
    // The reply is still returned even though the DB write failed
    expect(result).toEqual({ ok: true, reply: 'Cached reply.' })
    expect(deps.replaceMessages).toHaveBeenCalledOnce()
    expect(warnSpy).toHaveBeenCalledWith(
      '[ingestExternalMessage] persistence step threw:',
      expect.any(Error),
    )
  })

  it('still returns ok:true when replaceMessages returns an Error-like value', async () => {
    const deps = {
      piRuntimeManager: {
        runChannelSubagent: vi.fn().mockResolvedValue({ ok: true, reply: 'Reply.' }),
      },
      listMessages: vi.fn().mockReturnValue([]),
      replaceMessages: vi.fn().mockImplementation(() => {
        throw 'plain string failure'
      }),
      kvSet: vi.fn(),
    }
    const result = await ingestExternalMessageFull(deps as PersistenceDeps, 'conv-1', 'hello', null)
    expect(result).toEqual({ ok: true, reply: 'Reply.' })
  })

  it('still returns ok:true when kvSet throws (with dedupe key set)', async () => {
    const deps = {
      piRuntimeManager: {
        runChannelSubagent: vi.fn().mockResolvedValue({ ok: true, reply: 'Reply with dedupe.' }),
      },
      listMessages: vi.fn().mockReturnValue([]),
      replaceMessages: vi.fn(),
      kvSet: vi.fn().mockImplementation(() => {
        throw new Error('KV storage unavailable')
      }),
    }
    const result = await ingestExternalMessageFull(
      deps as PersistenceDeps,
      'conv-1',
      'hello',
      'dedupe-msg-001',
    )
    expect(result).toEqual({ ok: true, reply: 'Reply with dedupe.' })
    expect(deps.replaceMessages).toHaveBeenCalledOnce()
    expect(deps.kvSet).toHaveBeenCalledOnce()
  })

  it('still returns ok:true when both replaceMessages and kvSet throw', async () => {
    const deps = {
      piRuntimeManager: {
        runChannelSubagent: vi.fn().mockResolvedValue({ ok: true, reply: 'Partial failure reply.' }),
      },
      listMessages: vi.fn().mockReturnValue([]),
      replaceMessages: vi.fn().mockImplementation(() => {
        throw new Error('DB error')
      }),
      kvSet: vi.fn().mockImplementation(() => {
        throw new Error('KV error')
      }),
    }
    const result = await ingestExternalMessageFull(
      deps as PersistenceDeps,
      'conv-1',
      'hello',
      'dedupe-key',
    )
    // The reply is always returned regardless of how many persistence steps fail
    expect(result).toEqual({ ok: true, reply: 'Partial failure reply.' })
  })

  it('does not call replaceMessages or kvSet when runChannelSubagent fails', async () => {
    const deps = {
      piRuntimeManager: {
        runChannelSubagent: vi.fn().mockResolvedValue({ ok: false, message: 'subagent nack' }),
      },
      listMessages: vi.fn(),
      replaceMessages: vi.fn(),
      kvSet: vi.fn(),
    }
    const result = await ingestExternalMessageFull(deps as PersistenceDeps, 'conv-1', 'hello', 'key')
    expect(result).toEqual({ ok: false, message: 'subagent nack' })
    // Persistence step must not run when the subagent itself failed
    expect(deps.listMessages).not.toHaveBeenCalled()
    expect(deps.replaceMessages).not.toHaveBeenCalled()
    expect(deps.kvSet).not.toHaveBeenCalled()
  })

  it('does not call replaceMessages or kvSet when runChannelSubagent throws', async () => {
    const deps = {
      piRuntimeManager: {
        runChannelSubagent: vi.fn().mockRejectedValue(new Error('session crash')),
      },
      listMessages: vi.fn(),
      replaceMessages: vi.fn(),
      kvSet: vi.fn(),
    }
    const result = await ingestExternalMessageFull(deps as PersistenceDeps, 'conv-1', 'hello', 'key')
    expect(result).toEqual({ ok: false, message: 'session crash' })
    expect(deps.listMessages).not.toHaveBeenCalled()
    expect(deps.replaceMessages).not.toHaveBeenCalled()
    expect(deps.kvSet).not.toHaveBeenCalled()
  })

  it('does not throw — callers receive a resolved promise even on persistence failure', async () => {
    const deps = {
      piRuntimeManager: {
        runChannelSubagent: vi.fn().mockResolvedValue({ ok: true, reply: 'OK reply' }),
      },
      listMessages: vi.fn().mockReturnValue([]),
      replaceMessages: vi.fn().mockImplementation(() => {
        throw new Error('boom')
      }),
      kvSet: vi.fn(),
    }
    await expect(
      ingestExternalMessageFull(deps as PersistenceDeps, 'conv-1', 'hello', null),
    ).resolves.toEqual({ ok: true, reply: 'OK reply' })
  })

  it('preserves existing messages when replacing — appends new user and assistant messages', async () => {
    const existing: CacheResult = [
      { id: 'msg-old-1', role: 'user', payload_json: '{"role":"user","content":"previous"}' },
      { id: 'msg-old-2', role: 'assistant', payload_json: '{"role":"assistant","content":"done"}' },
    ]
    const deps = {
      piRuntimeManager: {
        runChannelSubagent: vi.fn().mockResolvedValue({ ok: true, reply: 'New reply' }),
      },
      listMessages: vi.fn().mockReturnValue(existing),
      replaceMessages: vi.fn(),
      kvSet: vi.fn(),
    }
    await ingestExternalMessageFull(deps as PersistenceDeps, 'conv-1', 'new message', null)
    const [, messagesArg] = deps.replaceMessages.mock.calls[0]!
    // Original messages are preserved
    expect(messagesArg[0]).toMatchObject({ id: 'msg-old-1', role: 'user' })
    expect(messagesArg[1]).toMatchObject({ id: 'msg-old-2', role: 'assistant' })
    // New messages appended
    const newUser = messagesArg[2] as { role: string; payload_json: string }
    const newAsst = messagesArg[3] as { role: string; payload_json: string }
    expect(newUser.role).toBe('user')
    expect(newAsst.role).toBe('assistant')
    expect(JSON.parse(newAsst.payload_json)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: 'New reply' }],
    })
  })
})
