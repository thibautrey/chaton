import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `extensions:events:publish` IPC handler.
 *
 * The handler validates extensionId and topic before delegating to
 * publishExtensionEvent(extensionId.trim(), topic.trim(), payload, meta):
 *   1. Rejects non-string or empty extensionId
 *   2. Rejects non-string or empty topic
 *   3. Trims extensionId and topic before delegation
 *   4. Passes payload and meta through unchanged
 */

type ExtensionHostCallResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: { code: string; message: string } }

function handleExtensionsEventsPublish(params: {
  publishExtensionEvent: (
    extensionId: string,
    topic: string,
    payload: unknown,
    meta?: { idempotencyKey?: string },
  ) => ExtensionHostCallResult
}, extensionId: unknown, topic: unknown, payload: unknown, meta?: { idempotencyKey?: string }): ExtensionHostCallResult {
  if (typeof extensionId !== "string" || !extensionId.trim()) {
    return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
  }
  if (typeof topic !== "string" || !topic.trim()) {
    return { ok: false, error: { code: "bad_request", message: "topic is required" } };
  }
  return params.publishExtensionEvent(extensionId.trim(), topic.trim(), payload, meta);
}

describe('extensions:events:publish — extensionId validation', () => {
  let publishExtensionEventMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    publishExtensionEventMock = vi.fn()
  })

  it('returns {ok:false} when extensionId is undefined', () => {
    const result = handleExtensionsEventsPublish(
      { publishExtensionEvent: publishExtensionEventMock },
      undefined, 'topic', null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(publishExtensionEventMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is null', () => {
    const result = handleExtensionsEventsPublish(
      { publishExtensionEvent: publishExtensionEventMock },
      null, 'topic', null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(publishExtensionEventMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is a number', () => {
    const result = handleExtensionsEventsPublish(
      { publishExtensionEvent: publishExtensionEventMock },
      42 as unknown as string, 'topic', null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(publishExtensionEventMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is an object', () => {
    const result = handleExtensionsEventsPublish(
      { publishExtensionEvent: publishExtensionEventMock },
      { id: 'ext1' } as unknown as string, 'topic', null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(publishExtensionEventMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is empty string', () => {
    const result = handleExtensionsEventsPublish(
      { publishExtensionEvent: publishExtensionEventMock },
      '', 'topic', null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(publishExtensionEventMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is whitespace-only', () => {
    const result = handleExtensionsEventsPublish(
      { publishExtensionEvent: publishExtensionEventMock },
      '  \t\n', 'topic', null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(publishExtensionEventMock).not.toHaveBeenCalled()
  })
})

describe('extensions:events:publish — topic validation', () => {
  let publishExtensionEventMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    publishExtensionEventMock = vi.fn()
  })

  it('returns {ok:false} when topic is undefined', () => {
    const result = handleExtensionsEventsPublish(
      { publishExtensionEvent: publishExtensionEventMock },
      'ext1', undefined, null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(publishExtensionEventMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when topic is null', () => {
    const result = handleExtensionsEventsPublish(
      { publishExtensionEvent: publishExtensionEventMock },
      'ext1', null, null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(publishExtensionEventMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when topic is a number', () => {
    const result = handleExtensionsEventsPublish(
      { publishExtensionEvent: publishExtensionEventMock },
      'ext1', 99 as unknown as string, null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(publishExtensionEventMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when topic is an object', () => {
    const result = handleExtensionsEventsPublish(
      { publishExtensionEvent: publishExtensionEventMock },
      'ext1', { topic: 'foo' } as unknown as string, null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(publishExtensionEventMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when topic is empty string', () => {
    const result = handleExtensionsEventsPublish(
      { publishExtensionEvent: publishExtensionEventMock },
      'ext1', '', null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(publishExtensionEventMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when topic is whitespace-only', () => {
    const result = handleExtensionsEventsPublish(
      { publishExtensionEvent: publishExtensionEventMock },
      'ext1', '  \t\n', null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(publishExtensionEventMock).not.toHaveBeenCalled()
  })
})

describe('extensions:events:publish — delegation', () => {
  let publishExtensionEventMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    publishExtensionEventMock = vi.fn().mockReturnValue({ ok: true, data: { messageId: 'msg-1' } })
  })

  it('delegates with trimmed extensionId and topic', () => {
    handleExtensionsEventsPublish(
      { publishExtensionEvent: publishExtensionEventMock },
      '  ext-id  ', '  my-topic  ', { foo: 'bar' }, { idempotencyKey: 'key-1' },
    )
    expect(publishExtensionEventMock).toHaveBeenCalledWith(
      'ext-id', 'my-topic', { foo: 'bar' }, { idempotencyKey: 'key-1' },
    )
  })

  it('passes payload through unchanged even when complex', () => {
    const complexPayload = { nested: { arr: [1, 2, 3] }, fn: () => {} }
    handleExtensionsEventsPublish(
      { publishExtensionEvent: publishExtensionEventMock },
      'ext1', 'topic1', complexPayload,
    )
    expect(publishExtensionEventMock).toHaveBeenCalledWith(
      'ext1', 'topic1', complexPayload, undefined,
    )
  })

  it('passes non-object meta through for runtime validation', () => {
    handleExtensionsEventsPublish(
      { publishExtensionEvent: publishExtensionEventMock },
      'ext1', 'topic1', { ok: true }, 'bad-meta' as unknown as { idempotencyKey?: string },
    )
    expect(publishExtensionEventMock).toHaveBeenCalledWith(
      'ext1', 'topic1', { ok: true }, 'bad-meta',
    )
  })

  it('passes through the result from publishExtensionEvent unchanged', () => {
    const successResult = { ok: true, data: { messageId: 'msg-abc', deduplicated: false } }
    publishExtensionEventMock.mockReturnValue(successResult)
    const result = handleExtensionsEventsPublish(
      { publishExtensionEvent: publishExtensionEventMock },
      'ext1', 'topic1', null,
    )
    expect(result).toBe(successResult)
  })

  it('passes through error result from publishExtensionEvent unchanged', () => {
    const errorResult = { ok: false, error: { code: 'unauthorized', message: 'Missing events.publish capability' } }
    publishExtensionEventMock.mockReturnValue(errorResult)
    const result = handleExtensionsEventsPublish(
      { publishExtensionEvent: publishExtensionEventMock },
      'ext1', 'topic1', null,
    )
    expect(result).toBe(errorResult)
  })

  it('calls publishExtensionEvent exactly once per valid invocation', () => {
    handleExtensionsEventsPublish(
      { publishExtensionEvent: publishExtensionEventMock },
      'ext1', 'topic1', null,
    )
    expect(publishExtensionEventMock).toHaveBeenCalledTimes(1)
  })
})
