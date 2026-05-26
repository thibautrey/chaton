import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `extensions:events:subscribe` IPC handler.
 *
 * The handler validates extensionId and topic before delegating to
 * subscribeExtension(extensionId.trim(), topic.trim(), options):
 *   1. Rejects non-string or empty extensionId
 *   2. Rejects non-string or empty topic
 *   3. Trims extensionId and topic before delegation
 *   4. Passes options through unchanged
 */

type SubscribeResult =
  | { ok: true; subscriptionId: string }
  | { ok: false; message: string }

function handleExtensionsEventsSubscribe(params: {
  subscribeExtension: (
    extensionId: string,
    topic: string,
    options?: { projectId?: string; conversationId?: string },
  ) => SubscribeResult
}, extensionId: unknown, topic: unknown, options?: { projectId?: string; conversationId?: string }): { ok: false; error: { code: string; message: string } } | SubscribeResult {
  if (typeof extensionId !== "string" || !extensionId.trim()) {
    return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
  }
  if (typeof topic !== "string" || !topic.trim()) {
    return { ok: false, error: { code: "bad_request", message: "topic is required" } };
  }
  return params.subscribeExtension(extensionId.trim(), topic.trim(), options);
}

describe('extensions:events:subscribe — extensionId validation', () => {
  let subscribeExtensionMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    subscribeExtensionMock = vi.fn()
  })

  it('returns {ok:false} when extensionId is undefined', () => {
    const result = handleExtensionsEventsSubscribe(
      { subscribeExtension: subscribeExtensionMock },
      undefined, 'topic',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(subscribeExtensionMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is null', () => {
    const result = handleExtensionsEventsSubscribe(
      { subscribeExtension: subscribeExtensionMock },
      null, 'topic',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(subscribeExtensionMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is a number', () => {
    const result = handleExtensionsEventsSubscribe(
      { subscribeExtension: subscribeExtensionMock },
      42 as unknown as string, 'topic',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(subscribeExtensionMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is an object', () => {
    const result = handleExtensionsEventsSubscribe(
      { subscribeExtension: subscribeExtensionMock },
      { id: 'ext1' } as unknown as string, 'topic',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(subscribeExtensionMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is empty string', () => {
    const result = handleExtensionsEventsSubscribe(
      { subscribeExtension: subscribeExtensionMock },
      '', 'topic',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(subscribeExtensionMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is whitespace-only', () => {
    const result = handleExtensionsEventsSubscribe(
      { subscribeExtension: subscribeExtensionMock },
      '  \t\n', 'topic',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(subscribeExtensionMock).not.toHaveBeenCalled()
  })

  it('returns extensionId error (not topic error) when extensionId is invalid type', () => {
    const result = handleExtensionsEventsSubscribe(
      { subscribeExtension: subscribeExtensionMock },
      42 as unknown as string, 'topic',
    )
    // extensionId check fires first — topic is a valid non-empty string so it passes
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(subscribeExtensionMock).not.toHaveBeenCalled()
  })
})

describe('extensions:events:subscribe — topic validation', () => {
  let subscribeExtensionMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    subscribeExtensionMock = vi.fn()
  })

  it('returns {ok:false} when topic is undefined', () => {
    const result = handleExtensionsEventsSubscribe(
      { subscribeExtension: subscribeExtensionMock },
      'ext1', undefined,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(subscribeExtensionMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when topic is null', () => {
    const result = handleExtensionsEventsSubscribe(
      { subscribeExtension: subscribeExtensionMock },
      'ext1', null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(subscribeExtensionMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when topic is a number', () => {
    const result = handleExtensionsEventsSubscribe(
      { subscribeExtension: subscribeExtensionMock },
      'ext1', 99 as unknown as string,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(subscribeExtensionMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when topic is an object', () => {
    const result = handleExtensionsEventsSubscribe(
      { subscribeExtension: subscribeExtensionMock },
      'ext1', { topic: 'foo' } as unknown as string,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(subscribeExtensionMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when topic is empty string', () => {
    const result = handleExtensionsEventsSubscribe(
      { subscribeExtension: subscribeExtensionMock },
      'ext1', '',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(subscribeExtensionMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when topic is whitespace-only', () => {
    const result = handleExtensionsEventsSubscribe(
      { subscribeExtension: subscribeExtensionMock },
      'ext1', '  \t\n',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(subscribeExtensionMock).not.toHaveBeenCalled()
  })
})

describe('extensions:events:subscribe — delegation', () => {
  let subscribeExtensionMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    subscribeExtensionMock = vi.fn().mockReturnValue({ ok: true, subscriptionId: 'sub-abc' })
  })

  it('delegates with trimmed extensionId and topic', () => {
    handleExtensionsEventsSubscribe(
      { subscribeExtension: subscribeExtensionMock },
      '  ext-id  ', '  my-topic  ',
    )
    expect(subscribeExtensionMock).toHaveBeenCalledWith(
      'ext-id', 'my-topic', undefined,
    )
  })

  it('passes options through unchanged', () => {
    const opts = { projectId: 'proj-1', conversationId: 'conv-1' }
    handleExtensionsEventsSubscribe(
      { subscribeExtension: subscribeExtensionMock },
      'ext1', 'topic1', opts,
    )
    expect(subscribeExtensionMock).toHaveBeenCalledWith(
      'ext1', 'topic1', opts,
    )
  })

  it('passes through success result from subscribeExtension unchanged', () => {
    const successResult = { ok: true, subscriptionId: 'sub-xyz' }
    subscribeExtensionMock.mockReturnValue(successResult)
    const result = handleExtensionsEventsSubscribe(
      { subscribeExtension: subscribeExtensionMock },
      'ext1', 'topic1',
    )
    expect(result).toBe(successResult)
  })

  it('passes through capability-denied result from subscribeExtension unchanged', () => {
    const deniedResult = { ok: false, message: 'Extension ext1 missing capability events.subscribe' }
    subscribeExtensionMock.mockReturnValue(deniedResult)
    const result = handleExtensionsEventsSubscribe(
      { subscribeExtension: subscribeExtensionMock },
      'ext1', 'topic1',
    )
    expect(result).toBe(deniedResult)
  })

  it('calls subscribeExtension exactly once per valid invocation', () => {
    handleExtensionsEventsSubscribe(
      { subscribeExtension: subscribeExtensionMock },
      'ext1', 'topic1',
    )
    expect(subscribeExtensionMock).toHaveBeenCalledTimes(1)
  })

  it('rejects when both extensionId and topic are invalid type (extensionId check fires first)', () => {
    // With extensionId = 42 (number) and topic = '' (empty string):
    // - extensionId fails typeof === "string" check → returns extensionId error
    const result = handleExtensionsEventsSubscribe(
      { subscribeExtension: subscribeExtensionMock },
      42 as unknown as string, '',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(subscribeExtensionMock).not.toHaveBeenCalled()
  })
})
