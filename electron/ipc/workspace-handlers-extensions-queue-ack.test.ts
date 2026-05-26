import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `extensions:queue:ack` IPC handler.
 *
 * The handler validates extensionId and messageId before delegating to
 * queueAck(extensionId.trim(), messageId.trim()):
 *   1. Rejects non-string or empty extensionId
 *   2. Rejects non-string or empty messageId
 *   3. Trims both before delegation
 */

type ExtensionHostCallResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: { code: string; message: string } }

function handleExtensionsQueueAck(params: {
  queueAck: (extensionId: string, messageId: string) => ExtensionHostCallResult
}, extensionId: unknown, messageId: unknown): ExtensionHostCallResult {
  if (typeof extensionId !== "string" || !extensionId.trim()) {
    return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
  }
  if (typeof messageId !== "string" || !messageId.trim()) {
    return { ok: false, error: { code: "bad_request", message: "messageId is required" } };
  }
  return params.queueAck(extensionId.trim(), messageId.trim());
}

describe('extensions:queue:ack — extensionId validation', () => {
  let queueAckMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    queueAckMock = vi.fn()
  })

  it('returns {ok:false} when extensionId is undefined', () => {
    const result = handleExtensionsQueueAck(
      { queueAck: queueAckMock },
      undefined, 'msg-1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueAckMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is null', () => {
    const result = handleExtensionsQueueAck(
      { queueAck: queueAckMock },
      null, 'msg-1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueAckMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is a number', () => {
    const result = handleExtensionsQueueAck(
      { queueAck: queueAckMock },
      99 as unknown as string, 'msg-1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueAckMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is an object', () => {
    const result = handleExtensionsQueueAck(
      { queueAck: queueAckMock },
      { id: 'ext1' } as unknown as string, 'msg-1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueAckMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is empty string', () => {
    const result = handleExtensionsQueueAck(
      { queueAck: queueAckMock },
      '', 'msg-1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueAckMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when extensionId is whitespace-only', () => {
    const result = handleExtensionsQueueAck(
      { queueAck: queueAckMock },
      '  \t\n', 'msg-1',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "extensionId is required" } })
    expect(queueAckMock).not.toHaveBeenCalled()
  })
})

describe('extensions:queue:ack — messageId validation', () => {
  let queueAckMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    queueAckMock = vi.fn()
  })

  it('returns {ok:false} when messageId is undefined', () => {
    const result = handleExtensionsQueueAck(
      { queueAck: queueAckMock },
      'ext1', undefined,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "messageId is required" } })
    expect(queueAckMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when messageId is null', () => {
    const result = handleExtensionsQueueAck(
      { queueAck: queueAckMock },
      'ext1', null,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "messageId is required" } })
    expect(queueAckMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when messageId is a number', () => {
    const result = handleExtensionsQueueAck(
      { queueAck: queueAckMock },
      'ext1', 7 as unknown as string,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "messageId is required" } })
    expect(queueAckMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when messageId is an object', () => {
    const result = handleExtensionsQueueAck(
      { queueAck: queueAckMock },
      'ext1', { id: 'msg-1' } as unknown as string,
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "messageId is required" } })
    expect(queueAckMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when messageId is empty string', () => {
    const result = handleExtensionsQueueAck(
      { queueAck: queueAckMock },
      'ext1', '',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "messageId is required" } })
    expect(queueAckMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false} when messageId is whitespace-only', () => {
    const result = handleExtensionsQueueAck(
      { queueAck: queueAckMock },
      'ext1', '  \t\n',
    )
    expect(result).toEqual({ ok: false, error: { code: "bad_request", message: "messageId is required" } })
    expect(queueAckMock).not.toHaveBeenCalled()
  })
})

describe('extensions:queue:ack — delegation', () => {
  let queueAckMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    queueAckMock = vi.fn().mockReturnValue({ ok: true })
  })

  it('delegates with trimmed extensionId and messageId', () => {
    handleExtensionsQueueAck(
      { queueAck: queueAckMock },
      '  ext-id  ', '  msg-123  ',
    )
    expect(queueAckMock).toHaveBeenCalledWith('ext-id', 'msg-123')
  })

  it('passes through success result from queueAck unchanged', () => {
    const successResult = { ok: true }
    queueAckMock.mockReturnValue(successResult)
    const result = handleExtensionsQueueAck(
      { queueAck: queueAckMock },
      'ext1', 'msg-1',
    )
    expect(result).toBe(successResult)
  })

  it('passes through error result from queueAck unchanged', () => {
    const errorResult = { ok: false, error: { code: 'not_found', message: 'message not found' } }
    queueAckMock.mockReturnValue(errorResult)
    const result = handleExtensionsQueueAck(
      { queueAck: queueAckMock },
      'ext1', 'msg-1',
    )
    expect(result).toBe(errorResult)
  })

  it('calls queueAck exactly once per valid invocation', () => {
    handleExtensionsQueueAck(
      { queueAck: queueAckMock },
      'ext1', 'msg-1',
    )
    expect(queueAckMock).toHaveBeenCalledTimes(1)
  })
})
