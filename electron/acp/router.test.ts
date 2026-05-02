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

  it('maps task status "completed" to message type "result"', async () => {
    const { recordAcpTaskStatus, clearPendingBroadcastsForConversation } = await import('./router.js')

    updateAcpTaskStatusMock.mockReturnValueOnce({ id: 'task-1', status: 'completed' })
    recordAcpMessageMock.mockClear()

    recordAcpTaskStatus({
      conversationId: 'conversation-1',
      ownerKind: 'orchestrator',
      ownerAgentId: 'orchestrator',
      from: 'orchestrator',
      ownerRole: 'orchestrator',
      taskId: 'task-1',
      status: 'completed',
    })

    expect(recordAcpMessageMock).toHaveBeenCalledTimes(1)
    expect(recordAcpMessageMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'result',
        title: 'Task completed',
        payload: expect.objectContaining({
          taskId: 'task-1',
          status: 'completed',
        }),
      }),
    )
    clearPendingBroadcastsForConversation('conversation-1')
  })

  it('maps task status "error" to message type "error"', async () => {
    const { recordAcpTaskStatus, clearPendingBroadcastsForConversation } = await import('./router.js')

    updateAcpTaskStatusMock.mockReturnValueOnce({ id: 'task-2', status: 'error' })
    recordAcpMessageMock.mockClear()

    recordAcpTaskStatus({
      conversationId: 'conversation-1',
      ownerKind: 'orchestrator',
      ownerAgentId: 'orchestrator',
      from: 'orchestrator',
      ownerRole: 'orchestrator',
      taskId: 'task-2',
      status: 'error',
      errorMessage: 'Something went wrong',
    })

    expect(recordAcpMessageMock).toHaveBeenCalledTimes(1)
    expect(recordAcpMessageMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'error',
        title: 'Task error',
        payload: expect.objectContaining({
          taskId: 'task-2',
          status: 'error',
          errorMessage: 'Something went wrong',
        }),
      }),
    )
    clearPendingBroadcastsForConversation('conversation-1')
  })

  it('maps task status "in-progress" to message type "status"', async () => {
    const { recordAcpTaskStatus, clearPendingBroadcastsForConversation } = await import('./router.js')

    updateAcpTaskStatusMock.mockReturnValueOnce({ id: 'task-3', status: 'in-progress' })
    recordAcpMessageMock.mockClear()

    recordAcpTaskStatus({
      conversationId: 'conversation-1',
      ownerKind: 'subagent',
      ownerAgentId: 'subagent-1',
      from: 'orchestrator',
      ownerRole: 'custom',
      taskId: 'task-3',
      status: 'in-progress',
    })

    expect(recordAcpMessageMock).toHaveBeenCalledTimes(1)
    expect(recordAcpMessageMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'status',
        title: 'Task in-progress',
        payload: expect.objectContaining({
          taskId: 'task-3',
          status: 'in-progress',
        }),
      }),
    )
    clearPendingBroadcastsForConversation('conversation-1')
  })

  it('recordAcpTaskStatus early-returns when updateAcpTaskStatus returns null', async () => {
    const { recordAcpTaskStatus } = await import('./router.js')

    updateAcpTaskStatusMock.mockReturnValueOnce(null)
    recordAcpMessageMock.mockClear()

    recordAcpTaskStatus({
      conversationId: 'conversation-1',
      ownerKind: 'orchestrator',
      ownerAgentId: 'orchestrator',
      from: 'orchestrator',
      ownerRole: 'orchestrator',
      taskId: 'task-4',
      status: 'completed',
    })

    // Should not append a message when update returns null (no-op)
    expect(recordAcpMessageMock).not.toHaveBeenCalled()
  })

  it('recordAcpTaskStatus excludes errorMessage from payload for non-error statuses', async () => {
    const { recordAcpTaskStatus, clearPendingBroadcastsForConversation } =
      await import('./router.js')

    updateAcpTaskStatusMock.mockReturnValueOnce({ id: 'task-5', status: 'completed' })
    recordAcpMessageMock.mockClear()

    // Pass errorMessage even though status is "completed" — it should be ignored
    recordAcpTaskStatus({
      conversationId: 'conversation-1',
      ownerKind: 'orchestrator',
      ownerAgentId: 'orchestrator',
      from: 'orchestrator',
      ownerRole: 'orchestrator',
      taskId: 'task-5',
      status: 'completed',
      errorMessage: 'this should not appear in the payload',
    })

    expect(recordAcpMessageMock).toHaveBeenCalledTimes(1)
    const callArg = recordAcpMessageMock.mock.calls[0][1] as Record<string, unknown>
    expect(callArg.payload).not.toHaveProperty('errorMessage')
    expect(callArg.payload).toMatchObject({
      taskId: 'task-5',
      status: 'completed',
    })
    clearPendingBroadcastsForConversation('conversation-1')
  })

  it('updateAcpAgentStatus excludes errorMessage from payload for non-error statuses', async () => {
    const { updateAcpAgentStatus, clearPendingBroadcastsForConversation } =
      await import('./router.js')
    recordAcpMessageMock.mockClear()

    // Pass errorMessage even though status is "completed" — it should be ignored
    updateAcpAgentStatus({
      conversationId: 'conversation-1',
      agentId: 'agent-err',
      role: 'custom',
      label: 'Test Agent',
      status: 'completed',
      errorMessage: 'this should not appear in the payload',
    })

    expect(recordAcpMessageMock).toHaveBeenCalledTimes(1)
    const callArg = recordAcpMessageMock.mock.calls[0][1] as Record<string, unknown>
    expect(callArg.payload).not.toHaveProperty('errorMessage')
    expect(callArg.payload).toMatchObject({
      agentId: 'agent-err',
      status: 'completed',
    })
    clearPendingBroadcastsForConversation('conversation-1')
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
