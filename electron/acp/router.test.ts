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
})
