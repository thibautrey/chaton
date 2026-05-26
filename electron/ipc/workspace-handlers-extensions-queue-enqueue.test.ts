import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `extensions:queue:enqueue` IPC handler.
 *
 * The handler validates extensionId and topic before delegating to
 * queueEnqueue(extensionId.trim(), topic.trim(), payload, opts):
 *   1. Rejects non-string or empty extensionId
 *   2. Rejects non-string or empty topic
 *   3. Trims extensionId and topic before delegation
 *   4. Passes payload and opts through unchanged
 */

type ExtensionHostCallResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: { code: string; message: string } }

function handleExtensionsQueueEnqueue(params: {
  queueEnqueue: (
    extensionId: string,
    topic: string,
    payload: unknown,
    opts?: { idempotencyKey?: string; availableAt?: string },
  ) => ExtensionHostCallResult
}, extensionId: unknown, topic: unknown, payload: unknown, opts?: { idempotencyKey?: string; availableAt?: string }): ExtensionHostCallResult {
  if (typeof extensionId !== "string" || !extensionId.trim()) {
    return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
  }
  if (typeof topic !== "string" || !topic.trim()) {
    return { ok: false, error: { code: "bad_request", message: "topic is required" } };
  }
  return params.queueEnqueue(extensionId.trim(), topic.trim(), payload, opts);
}

describe('extensions:queue:enqueue — extensionId validation', () => {
  let queueEnqueueMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    queueEnqueueMock = vi.fn()
  })

  it('returns {ok:false} when extensionId is undefined', () => {
    const result = handleExtensionsQueueEnqueue(
      { queueEnqueue: queueEnqueueMock },
      undefined, 'topic', null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueEnqueueMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is null', () => {
    const result = handleExtensionsQueueEnqueue(
      { queueEnqueue: queueEnqueueMock },
      null, 'topic', null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueEnqueueMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is a number', () => {
    const result = handleExtensionsQueueEnqueue(
      { queueEnqueue: queueEnqueueMock },
      123 as unknown as string, 'topic', null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueEnqueueMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is an object', () => {
    const result = handleExtensionsQueueEnqueue(
      { queueEnqueue: queueEnqueueMock },
      { id: 'ext1' } as unknown as string, 'topic', null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueEnqueueMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is empty string', () => {
    const result = handleExtensionsQueueEnqueue(
      { queueEnqueue: queueEnqueueMock },
      '', 'topic', null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueEnqueueMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is whitespace-only', () => {
    const result = handleExtensionsQueueEnqueue(
      { queueEnqueue: queueEnqueueMock },
      '  \t\n', 'topic', null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueEnqueueMock).not.toHaveBeenCalled()
  })
})

describe('extensions:queue:enqueue — topic validation', () => {
  let queueEnqueueMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    queueEnqueueMock = vi.fn()
  })

  it('returns {ok:false} when topic is undefined', () => {
    const result = handleExtensionsQueueEnqueue(
      { queueEnqueue: queueEnqueueMock },
      'ext1', undefined, null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(queueEnqueueMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when topic is null', () => {
    const result = handleExtensionsQueueEnqueue(
      { queueEnqueue: queueEnqueueMock },
      'ext1', null, null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(queueEnqueueMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when topic is a number', () => {
    const result = handleExtensionsQueueEnqueue(
      { queueEnqueue: queueEnqueueMock },
      'ext1', 99 as unknown as string, null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(queueEnqueueMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when topic is an object', () => {
    const result = handleExtensionsQueueEnqueue(
      { queueEnqueue: queueEnqueueMock },
      'ext1', { topic: 'foo' } as unknown as string, null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(queueEnqueueMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when topic is empty string', () => {
    const result = handleExtensionsQueueEnqueue(
      { queueEnqueue: queueEnqueueMock },
      'ext1', '', null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(queueEnqueueMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when topic is whitespace-only', () => {
    const result = handleExtensionsQueueEnqueue(
      { queueEnqueue: queueEnqueueMock },
      'ext1', '  \t\n', null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(queueEnqueueMock).not.toHaveBeenCalled()
  })
})

describe('extensions:queue:enqueue — delegation', () => {
  let queueEnqueueMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    queueEnqueueMock = vi.fn().mockReturnValue({ ok: true, data: { id: 'msg-1', deduplicated: false } })
  })

  it('delegates with trimmed extensionId and topic', () => {
    handleExtensionsQueueEnqueue(
      { queueEnqueue: queueEnqueueMock },
      '  ext-id  ', '  my-topic  ', { job: 'process' }, { idempotencyKey: 'job-1' },
    )
    expect(queueEnqueueMock).toHaveBeenCalledWith(
      'ext-id', 'my-topic', { job: 'process' }, { idempotencyKey: 'job-1' },
    )
  })

  it('passes payload through unchanged even when complex', () => {
    const complexPayload = { nested: { arr: [1, 2, 3] }, fn: () => {} }
    handleExtensionsQueueEnqueue(
      { queueEnqueue: queueEnqueueMock },
      'ext1', 'topic1', complexPayload,
    )
    expect(queueEnqueueMock).toHaveBeenCalledWith('ext1', 'topic1', complexPayload, undefined)
  })

  it('passes malformed opts through for runtime validation', () => {
    handleExtensionsQueueEnqueue(
      { queueEnqueue: queueEnqueueMock },
      'ext1', 'topic1', { ok: true }, { idempotencyKey: 123 as unknown as string, availableAt: { soon: true } as unknown as string },
    )
    expect(queueEnqueueMock).toHaveBeenCalledWith(
      'ext1', 'topic1', { ok: true }, { idempotencyKey: 123, availableAt: { soon: true } },
    )
  })

  it('passes through the result from queueEnqueue unchanged', () => {
    const successResult = { ok: true, data: { id: 'msg-abc', deduplicated: false } }
    queueEnqueueMock.mockReturnValue(successResult)
    const result = handleExtensionsQueueEnqueue(
      { queueEnqueue: queueEnqueueMock },
      'ext1', 'topic1', null,
    )
    expect(result).toBe(successResult)
  })

  it('passes through error result from queueEnqueue unchanged', () => {
    const errorResult = { ok: false, error: { code: 'unauthorized', message: 'Missing queue.publish capability' } }
    queueEnqueueMock.mockReturnValue(errorResult)
    const result = handleExtensionsQueueEnqueue(
      { queueEnqueue: queueEnqueueMock },
      'ext1', 'topic1', null,
    )
    expect(result).toBe(errorResult)
  })

  it('calls queueEnqueue exactly once per valid invocation', () => {
    handleExtensionsQueueEnqueue(
      { queueEnqueue: queueEnqueueMock },
      'ext1', 'topic1', null,
    )
    expect(queueEnqueueMock).toHaveBeenCalledTimes(1)
  })
})
