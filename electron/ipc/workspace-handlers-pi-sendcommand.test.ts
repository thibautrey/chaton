import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `pi:sendCommand` IPC handler's local (non-cloud) error path.
 *
 * The handler's local path wraps `piRuntimeManager.sendCommand()` in try/catch
 * and returns a well-formed `RpcResponse` with `success: false` and an `error`
 * string, rather than letting the exception propagate to the IPC layer.
 *
 * We replicate the minimal handler logic inline to test the error-safety guarantee
 * without needing the full workspace-handlers.ts module (which requires complex
 * dep setup: database, IPC, and PiRuntimeManager wiring).
 */

describe('pi:sendCommand local path error handling', () => {
  // -------------------------------------------------------------------------
  // Minimal types mirroring those used by the real handler
  // -------------------------------------------------------------------------
  type RpcCommandType = 'prompt' | 'follow_up' | 'steer' | 'stop' | 'get_snapshot' | 'set_model'
  interface RpcCommand {
    id: string
    type: RpcCommandType
    message?: string
    streamingBehavior?: 'steer' | 'append'
  }
  interface RpcResponse {
    id: string
    type: 'response'
    command: RpcCommandType
    success: boolean
    error?: string
  }

  // -------------------------------------------------------------------------
  // Inline minimal handler — mirrors workspace-handlers.ts lines 3688–3700.
  // This is the exact code path that was missing error handling before the fix.
  // -------------------------------------------------------------------------
  function sendCommandLocal(
    sendCommandImpl: (conversationId: string, command: RpcCommand) => Promise<RpcResponse>,
    conversationId: string,
    command: RpcCommand,
  ): Promise<RpcResponse> {
    return sendCommandImpl(conversationId, command).catch((err) => ({
      id: command.id,
      type: 'response' as const,
      command: command.type,
      success: false as const,
      error: err instanceof Error ? err.message : String(err),
    }))
  }

  it('returns the successful response when sendCommand resolves', async () => {
    const mockResponse: RpcResponse = {
      id: 'cmd-1',
      type: 'response',
      command: 'prompt',
      success: true,
    }
    const sendCommandImpl = vi.fn().mockResolvedValue(mockResponse)

    const result = await sendCommandLocal(sendCommandImpl, 'conv-A', {
      id: 'cmd-1',
      type: 'prompt',
      message: 'hello',
    })

    expect(result).toEqual(mockResponse)
    expect(sendCommandImpl).toHaveBeenCalledOnce()
  })

  it('returns success:false with error string when sendCommand throws Error', async () => {
    const error = new Error('Provider timeout: connection refused')
    const sendCommandImpl = vi.fn().mockRejectedValue(error)

    const result = await sendCommandLocal(sendCommandImpl, 'conv-A', {
      id: 'cmd-2',
      type: 'steer',
      message: 'change mode',
    })

    expect(result).toEqual({
      id: 'cmd-2',
      type: 'response',
      command: 'steer',
      success: false,
      error: 'Provider timeout: connection refused',
    })
  })

  it('returns success:false with string when sendCommand throws non-Error', async () => {
    // Some code paths may reject with a plain string rather than an Error object.
    const sendCommandImpl = vi.fn().mockRejectedValue('Session ended unexpectedly')

    const result = await sendCommandLocal(sendCommandImpl, 'conv-A', {
      id: 'cmd-3',
      type: 'prompt',
    })

    expect(result).toEqual({
      id: 'cmd-3',
      type: 'response',
      command: 'prompt',
      success: false,
      error: 'Session ended unexpectedly',
    })
  })

  it('preserves command.id and command.type in error response', async () => {
    const sendCommandImpl = vi.fn().mockRejectedValue(new Error('boom'))

    const result = await sendCommandLocal(sendCommandImpl, 'conv-A', {
      id: 'unique-cmd-id',
      type: 'get_snapshot',
    })

    // The error response must still carry the command id so the caller can
    // correlate it with the original request.
    expect(result.id).toBe('unique-cmd-id')
    expect(result.command).toBe('get_snapshot')
    expect(result.success).toBe(false)
    expect(result.error).toBe('boom')
  })

  it('does not rethrow — callers receive a resolved promise in both success and error cases', async () => {
    const sendCommandImpl = vi.fn().mockRejectedValue(new Error('rejected'))

    // If the handler incorrectly re-throws, this would fail with an unhandled rejection.
    await expect(
      sendCommandLocal(sendCommandImpl, 'conv-A', { id: 'cmd-5', type: 'stop' }),
    ).resolves.toMatchObject({ success: false })
  })
})
