import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMock = vi.fn()
const getAllWindowsMock = vi.fn()
const getDbMock = vi.fn()
const getAcpConversationStateMock = vi.fn()
const recordAcpMessageMock = vi.fn()
const upsertAcpAgentStateMock = vi.fn()
const saveAcpTaskListMock = vi.fn()
const updateAcpTaskStatusMock = vi.fn()

vi.mock('electron', () => ({
  default: {
    BrowserWindow: {
      getAllWindows: getAllWindowsMock,
    },
  },
}))

vi.mock('../db/index.js', () => ({
  getDb: getDbMock,
}))

vi.mock('./store.js', () => ({
  getAcpConversationState: getAcpConversationStateMock,
  recordAcpMessage: recordAcpMessageMock,
  saveAcpTaskList: saveAcpTaskListMock,
  updateAcpTaskStatus: updateAcpTaskStatusMock,
  upsertAcpAgentState: upsertAcpAgentStateMock,
}))

describe('ACP router broadcasts', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.clearAllMocks()
    sendMock.mockClear()
    getDbMock.mockReturnValue({})
    getAllWindowsMock.mockReturnValue([
      {
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          send: sendMock,
        },
      },
    ])
    recordAcpMessageMock.mockImplementation((_db, params) => ({
      id: `${params.title ?? 'event'}-${recordAcpMessageMock.mock.calls.length}`,
      conversationId: params.conversationId,
      threadId: params.conversationId,
      from: params.from,
      to: params.to ?? null,
      role: params.role,
      type: params.type,
      title: params.title ?? null,
      payload: params.payload ?? null,
      createdAt: '2026-04-30T00:00:00.000Z',
      updatedAt: '2026-04-30T00:00:00.000Z',
    }))
    getAcpConversationStateMock.mockReturnValue({
      conversationId: 'conversation-1',
      threadId: 'conversation-1',
      timeline: [],
      orchestratorTaskList: null,
      previousOrchestratorTaskLists: [],
      subAgents: [],
    })
  })

  it('coalesces rapid writes into one full-state broadcast', async () => {
    const { updateAcpAgentStatus } = await import('./router.js')

    updateAcpAgentStatus({
      conversationId: 'conversation-1',
      agentId: 'agent-1',
      role: 'custom',
      label: 'Agent 1',
      status: 'running',
    })
    updateAcpAgentStatus({
      conversationId: 'conversation-1',
      agentId: 'agent-1',
      role: 'custom',
      label: 'Agent 1',
      status: 'completed',
    })

    expect(getAcpConversationStateMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(50)

    expect(getAcpConversationStateMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith(
      'chaton:acp:event',
      expect.objectContaining({
        conversationId: 'conversation-1',
        latest: expect.objectContaining({
          title: 'Agent 1 completed',
        }),
      }),
    )
  })

  it('coalesces rapid appendMessage calls into one broadcast', async () => {
    const { registerAcpAgent, updateAcpAgentStatus } = await import('./router.js')

    registerAcpAgent({
      conversationId: 'conversation-1',
      agentId: 'agent-1',
      role: 'custom',
      label: 'Agent 1',
      description: 'Test agent',
    })
    updateAcpAgentStatus({
      conversationId: 'conversation-1',
      agentId: 'agent-1',
      role: 'custom',
      label: 'Agent 1',
      status: 'running',
    })
    updateAcpAgentStatus({
      conversationId: 'conversation-1',
      agentId: 'agent-1',
      role: 'custom',
      label: 'Agent 1',
      status: 'completed',
    })

    expect(getAcpConversationStateMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(50)

    expect(getAcpConversationStateMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith(
      'chaton:acp:event',
      expect.objectContaining({
        conversationId: 'conversation-1',
        latest: expect.objectContaining({
          title: 'Agent 1 completed',
        }),
      }),
    )
  })

  it('clears pending broadcasts when conversation is cleaned up', async () => {
    const { updateAcpAgentStatus, clearPendingBroadcastsForConversation } =
      await import('./router.js')

    updateAcpAgentStatus({
      conversationId: 'conversation-1',
      agentId: 'agent-1',
      role: 'custom',
      label: 'Agent 1',
      status: 'running',
    })

    expect(getAcpConversationStateMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()

    clearPendingBroadcastsForConversation('conversation-1')

    // After clearing, the timer fires but finds no entry to broadcast
    await vi.advanceTimersByTimeAsync(50)

    expect(getAcpConversationStateMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('stress: 150 rapid status updates produce exactly one broadcast', async () => {
    const { updateAcpAgentStatus } = await import('./router.js')

    // Simulate 150 messages arriving in rapid succession (e.g., streaming tokens)
    for (let i = 0; i < 150; i++) {
      updateAcpAgentStatus({
        conversationId: 'stress-test',
        agentId: 'stress-agent',
        role: 'custom',
        label: `Update ${i}`,
        status: i === 149 ? 'completed' : 'running',
      })
    }

    expect(getAcpConversationStateMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()

    // Only one timer should fire, with the last (completed) state
    await vi.advanceTimersByTimeAsync(50)

    expect(getAcpConversationStateMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith(
      'chaton:acp:event',
      expect.objectContaining({
        conversationId: 'stress-test',
        latest: expect.objectContaining({
          title: 'Update 149 completed',
        }),
      }),
    )
  })

  it('clears pending broadcasts independently per conversation', async () => {
    const { updateAcpAgentStatus, clearPendingBroadcastsForConversation } =
      await import('./router.js')

    // Fire updates for two different conversations
    updateAcpAgentStatus({
      conversationId: 'conv-A',
      agentId: 'agent-A',
      role: 'custom',
      label: 'A running',
      status: 'running',
    })
    updateAcpAgentStatus({
      conversationId: 'conv-B',
      agentId: 'agent-B',
      role: 'custom',
      label: 'B running',
      status: 'running',
    })

    // Clear only conv-A
    clearPendingBroadcastsForConversation('conv-A')

    // Advance timers — only conv-B should broadcast
    await vi.advanceTimersByTimeAsync(50)

    expect(getAcpConversationStateMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledTimes(1)
    // Verify the broadcast was for conv-B, not conv-A
    expect(sendMock).toHaveBeenCalledWith(
      'chaton:acp:event',
      expect.objectContaining({
        conversationId: 'conv-B',
      }),
    )
  })
})
