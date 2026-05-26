import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `extensions:queue:consume` IPC handler.
 *
 * The handler validates extensionId, topic, and consumerId before delegating to
 * queueConsume(extensionId.trim(), topic.trim(), consumerId.trim(), opts):
 *   1. Rejects non-string or empty extensionId
 *   2. Rejects non-string or empty topic
 *   3. Rejects non-string or empty consumerId
 *   4. Trims all three before delegation
 *   5. Passes opts through unchanged
 */

type ExtensionHostCallResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: { code: string; message: string } }

function handleExtensionsQueueConsume(params: {
  queueConsume: (
    extensionId: string,
    topic: string,
    consumerId: string,
    opts?: { limit?: number },
  ) => ExtensionHostCallResult
}, extensionId: unknown, topic: unknown, consumerId: unknown, opts?: { limit?: number }): ExtensionHostCallResult {
  if (typeof extensionId !== "string" || !extensionId.trim()) {
    return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
  }
  if (typeof topic !== "string" || !topic.trim()) {
    return { ok: false, error: { code: "bad_request", message: "topic is required" } };
  }
  if (typeof consumerId !== "string" || !consumerId.trim()) {
    return { ok: false, error: { code: "bad_request", message: "consumerId is required" } };
  }
  return params.queueConsume(extensionId.trim(), topic.trim(), consumerId.trim(), opts);
}

describe('extensions:queue:consume — extensionId validation', () => {
  let queueConsumeMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    queueConsumeMock = vi.fn()
  })

  it('returns {ok:false} when extensionId is undefined', () => {
    const result = handleExtensionsQueueConsume(
      { queueConsume: queueConsumeMock },
      undefined, 'topic', 'consumer1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueConsumeMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is null', () => {
    const result = handleExtensionsQueueConsume(
      { queueConsume: queueConsumeMock },
      null, 'topic', 'consumer1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueConsumeMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is a number', () => {
    const result = handleExtensionsQueueConsume(
      { queueConsume: queueConsumeMock },
      42 as unknown as string, 'topic', 'consumer1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueConsumeMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is an object', () => {
    const result = handleExtensionsQueueConsume(
      { queueConsume: queueConsumeMock },
      { id: 'ext1' } as unknown as string, 'topic', 'consumer1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueConsumeMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is empty string', () => {
    const result = handleExtensionsQueueConsume(
      { queueConsume: queueConsumeMock },
      '', 'topic', 'consumer1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueConsumeMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is whitespace-only', () => {
    const result = handleExtensionsQueueConsume(
      { queueConsume: queueConsumeMock },
      '  \t\n', 'topic', 'consumer1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueConsumeMock).not.toHaveBeenCalled()
  })
})

describe('extensions:queue:consume — topic validation', () => {
  let queueConsumeMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    queueConsumeMock = vi.fn()
  })

  it('returns {ok:false} when topic is undefined', () => {
    const result = handleExtensionsQueueConsume(
      { queueConsume: queueConsumeMock },
      'ext1', undefined, 'consumer1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(queueConsumeMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when topic is null', () => {
    const result = handleExtensionsQueueConsume(
      { queueConsume: queueConsumeMock },
      'ext1', null, 'consumer1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(queueConsumeMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when topic is a number', () => {
    const result = handleExtensionsQueueConsume(
      { queueConsume: queueConsumeMock },
      'ext1', 99 as unknown as string, 'consumer1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(queueConsumeMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when topic is an object', () => {
    const result = handleExtensionsQueueConsume(
      { queueConsume: queueConsumeMock },
      'ext1', { topic: 'foo' } as unknown as string, 'consumer1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(queueConsumeMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when topic is empty string', () => {
    const result = handleExtensionsQueueConsume(
      { queueConsume: queueConsumeMock },
      'ext1', '', 'consumer1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(queueConsumeMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when topic is whitespace-only', () => {
    const result = handleExtensionsQueueConsume(
      { queueConsume: queueConsumeMock },
      'ext1', '  \t\n', 'consumer1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "topic is required" } })
    expect(queueConsumeMock).not.toHaveBeenCalled()
  })
})

describe('extensions:queue:consume — consumerId validation', () => {
  let queueConsumeMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    queueConsumeMock = vi.fn()
  })

  it('returns {ok:false} when consumerId is undefined', () => {
    const result = handleExtensionsQueueConsume(
      { queueConsume: queueConsumeMock },
      'ext1', 'topic1', undefined,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "consumerId is required" } })
    expect(queueConsumeMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when consumerId is null', () => {
    const result = handleExtensionsQueueConsume(
      { queueConsume: queueConsumeMock },
      'ext1', 'topic1', null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "consumerId is required" } })
    expect(queueConsumeMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when consumerId is a number', () => {
    const result = handleExtensionsQueueConsume(
      { queueConsume: queueConsumeMock },
      'ext1', 'topic1', 7 as unknown as string,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "consumerId is required" } })
    expect(queueConsumeMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when consumerId is an object', () => {
    const result = handleExtensionsQueueConsume(
      { queueConsume: queueConsumeMock },
      'ext1', 'topic1', { id: 'consumer1' } as unknown as string,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "consumerId is required" } })
    expect(queueConsumeMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when consumerId is empty string', () => {
    const result = handleExtensionsQueueConsume(
      { queueConsume: queueConsumeMock },
      'ext1', 'topic1', '',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "consumerId is required" } })
    expect(queueConsumeMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when consumerId is whitespace-only', () => {
    const result = handleExtensionsQueueConsume(
      { queueConsume: queueConsumeMock },
      'ext1', 'topic1', '  \t\n',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "consumerId is required" } })
    expect(queueConsumeMock).not.toHaveBeenCalled()
  })
})

describe('extensions:queue:consume — delegation', () => {
  let queueConsumeMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    queueConsumeMock = vi.fn().mockReturnValue({ ok: true, data: [] })
  })

  it('delegates with trimmed extensionId, topic, and consumerId', () => {
    handleExtensionsQueueConsume(
      { queueConsume: queueConsumeMock },
      '  ext-id  ', '  my-topic  ', '  consumer-1  ', { limit: 10 },
    )
    expect(queueConsumeMock).toHaveBeenCalledWith('ext-id', 'my-topic', 'consumer-1', { limit: 10 })
  })

  it('passes opts through unchanged', () => {
    handleExtensionsQueueConsume(
      { queueConsume: queueConsumeMock },
      'ext1', 'topic1', 'consumer1', { limit: 5 },
    )
    expect(queueConsumeMock).toHaveBeenCalledWith('ext1', 'topic1', 'consumer1', { limit: 5 })
  })

  it('passes through the result from queueConsume unchanged', () => {
    const successResult = { ok: true, data: [{ id: 'msg-1', topic: 'topic1', payload: {}, attempts: 1 }] }
    queueConsumeMock.mockReturnValue(successResult)
    const result = handleExtensionsQueueConsume(
      { queueConsume: queueConsumeMock },
      'ext1', 'topic1', 'consumer1',
    )
    expect(result).toBe(successResult)
  })

  it('passes through error result from queueConsume unchanged', () => {
    const errorResult = { ok: false, error: { code: 'unauthorized', message: 'Missing queue.consume capability' } }
    queueConsumeMock.mockReturnValue(errorResult)
    const result = handleExtensionsQueueConsume(
      { queueConsume: queueConsumeMock },
      'ext1', 'topic1', 'consumer1',
    )
    expect(result).toBe(errorResult)
  })

  it('calls queueConsume exactly once per valid invocation', () => {
    handleExtensionsQueueConsume(
      { queueConsume: queueConsumeMock },
      'ext1', 'topic1', 'consumer1',
    )
    expect(queueConsumeMock).toHaveBeenCalledTimes(1)
  })
})
