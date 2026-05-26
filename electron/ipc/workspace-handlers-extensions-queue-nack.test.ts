import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `extensions:queue:nack` IPC handler.
 *
 * The handler validates extensionId and messageId before delegating to
 * queueNack(extensionId.trim(), messageId.trim(), retryAt, errorMessage):
 *   1. Rejects non-string or empty extensionId
 *   2. Rejects non-string or empty messageId
 *   3. Trims extensionId and messageId before delegation
 *   4. Passes optional retryAt and errorMessage through unchanged so runtime validation is authoritative
 */

type QueueNackResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: { code: string; message: string } }

function handleExtensionsQueueNack(params: {
  queueNack: (
    extensionId: string,
    messageId: string,
    retryAt?: string,
    errorMessage?: string,
  ) => QueueNackResult
}, extensionId: unknown, messageId: unknown, retryAt?: unknown, errorMessage?: unknown): QueueNackResult {
  if (typeof extensionId !== "string" || !extensionId.trim()) {
    return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
  }
  if (typeof messageId !== "string" || !messageId.trim()) {
    return { ok: false, error: { code: "bad_request", message: "messageId is required" } };
  }
  return params.queueNack(
    extensionId.trim(),
    messageId.trim(),
    retryAt as string | undefined,
    errorMessage as string | undefined,
  );
}

describe('extensions:queue:nack — extensionId validation', () => {
  let queueNackMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    queueNackMock = vi.fn()
  })

  it('returns {ok:false} when extensionId is undefined', () => {
    const result = handleExtensionsQueueNack(
      { queueNack: queueNackMock },
      undefined, 'msg-1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueNackMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is null', () => {
    const result = handleExtensionsQueueNack(
      { queueNack: queueNackMock },
      null, 'msg-1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueNackMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is a number', () => {
    const result = handleExtensionsQueueNack(
      { queueNack: queueNackMock },
      99 as unknown as string, 'msg-1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueNackMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is an object', () => {
    const result = handleExtensionsQueueNack(
      { queueNack: queueNackMock },
      { id: 'ext1' } as unknown as string, 'msg-1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueNackMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is empty string', () => {
    const result = handleExtensionsQueueNack(
      { queueNack: queueNackMock },
      '', 'msg-1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueNackMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is whitespace-only', () => {
    const result = handleExtensionsQueueNack(
      { queueNack: queueNackMock },
      '  \t\n', 'msg-1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueNackMock).not.toHaveBeenCalled()
  })
})

describe('extensions:queue:nack — messageId validation', () => {
  let queueNackMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    queueNackMock = vi.fn()
  })

  it('returns {ok:false} when messageId is undefined', () => {
    const result = handleExtensionsQueueNack(
      { queueNack: queueNackMock },
      'ext1', undefined,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "messageId is required" } })
    expect(queueNackMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when messageId is null', () => {
    const result = handleExtensionsQueueNack(
      { queueNack: queueNackMock },
      'ext1', null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "messageId is required" } })
    expect(queueNackMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when messageId is a number', () => {
    const result = handleExtensionsQueueNack(
      { queueNack: queueNackMock },
      'ext1', 7 as unknown as string,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "messageId is required" } })
    expect(queueNackMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when messageId is an object', () => {
    const result = handleExtensionsQueueNack(
      { queueNack: queueNackMock },
      'ext1', { id: 'msg-1' } as unknown as string,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "messageId is required" } })
    expect(queueNackMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when messageId is empty string', () => {
    const result = handleExtensionsQueueNack(
      { queueNack: queueNackMock },
      'ext1', '',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "messageId is required" } })
    expect(queueNackMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when messageId is whitespace-only', () => {
    const result = handleExtensionsQueueNack(
      { queueNack: queueNackMock },
      'ext1', '  \t\n',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "messageId is required" } })
    expect(queueNackMock).not.toHaveBeenCalled()
  })
})

describe('extensions:queue:nack — delegation', () => {
  let queueNackMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    queueNackMock = vi.fn().mockReturnValue({ ok: true })
  })

  it('delegates with trimmed extensionId and messageId', () => {
    handleExtensionsQueueNack(
      { queueNack: queueNackMock },
      '  ext-id  ', '  msg-123  ',
    )
    expect(queueNackMock).toHaveBeenCalledWith('ext-id', 'msg-123', undefined, undefined)
  })

  it('passes through optional retryAt and errorMessage when provided', () => {
    handleExtensionsQueueNack(
      { queueNack: queueNackMock },
      'ext1', 'msg-1', '2026-05-10T00:00:00Z', 'Processing failed',
    )
    expect(queueNackMock).toHaveBeenCalledWith('ext1', 'msg-1', '2026-05-10T00:00:00Z', 'Processing failed')
  })

  it('passes non-string retryAt through for runtime validation', () => {
    handleExtensionsQueueNack(
      { queueNack: queueNackMock },
      'ext1', 'msg-1', 123 as unknown as string,
    )
    expect(queueNackMock).toHaveBeenCalledWith('ext1', 'msg-1', 123, undefined)
  })

  it('passes non-string errorMessage through for runtime validation', () => {
    handleExtensionsQueueNack(
      { queueNack: queueNackMock },
      'ext1', 'msg-1', undefined, { reason: 'failed' } as unknown as string,
    )
    expect(queueNackMock).toHaveBeenCalledWith('ext1', 'msg-1', undefined, { reason: 'failed' })
  })

  it('passes through success result from queueNack unchanged', () => {
    const successResult = { ok: true, data: { processed: false } }
    queueNackMock.mockReturnValue(successResult)
    const result = handleExtensionsQueueNack(
      { queueNack: queueNackMock },
      'ext1', 'msg-1',
    )
    expect(result).toBe(successResult)
  })

  it('passes through error result from queueNack unchanged', () => {
    const errorResult = { ok: false, error: { code: 'not_found', message: 'message not found' } }
    queueNackMock.mockReturnValue(errorResult)
    const result = handleExtensionsQueueNack(
      { queueNack: queueNackMock },
      'ext1', 'msg-1',
    )
    expect(result).toBe(errorResult)
  })

  it('calls queueNack exactly once per valid invocation', () => {
    handleExtensionsQueueNack(
      { queueNack: queueNackMock },
      'ext1', 'msg-1',
    )
    expect(queueNackMock).toHaveBeenCalledTimes(1)
  })
})
