import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { TaskList, TaskStatus, SubAgent, SubAgentStatus, OrchestrationState } from '@/features/task-list/types'

export type ConversationSidePanelType = 'taskList' | null

interface ConversationSidePanelContextType {
  isOpen: boolean
  panelType: ConversationSidePanelType
  // Orchestrator (main agent) task list - backward compatible
  taskList: TaskList | null
  previousTaskLists: TaskList[]
  // Subagent tracking
  subAgents: SubAgent[]
  setIsOpen: (isOpen: boolean) => void
  setPanelType: (panelType: ConversationSidePanelType) => void
  togglePanel: () => void
  setConversationId: (id: string | null) => void
  // Helper to get task list for any conversation by ID (for progress tracking)
  getTaskListForConversation: (conversationId: string) => TaskList | null
}

const ConversationSidePanelContext = createContext(
  undefined as ConversationSidePanelContextType | undefined,
)

const EMPTY_STATE: OrchestrationState = {
  orchestratorTaskList: null,
  previousOrchestratorTaskLists: [],
  subAgents: [],
}

interface PanelStatePerConversation {
  isOpen: boolean
  panelType: ConversationSidePanelType
}

/** Read state for a conversation from the map, falling back to empty defaults */
function readConvState(map: Map<string, OrchestrationState>, convId: string): OrchestrationState {
  return map.get(convId) ?? EMPTY_STATE
}

function readPanelState(
  map: Map<string, PanelStatePerConversation>,
  convId: string,
): PanelStatePerConversation {
  return map.get(convId) ?? { isOpen: false, panelType: null }
}

export function ConversationSidePanelProvider(props: {
  children: ReactNode
}) {
  const [currentConversationId, setCurrentConversationId] = useState(null as string | null)
  // Full orchestration state per conversation
  const [stateByConversation, setStateByConversation] = useState(
    new Map<string, OrchestrationState>(),
  )
  // Panel UI state (isOpen, panelType) per conversation
  const [panelStateByConversation, setPanelStateByConversation] = useState(
    new Map<string, PanelStatePerConversation>(),
  )

  // Current conversation state (for rendering)
  const currentState = currentConversationId
    ? readConvState(stateByConversation, currentConversationId)
    : null
  const taskList = currentState?.orchestratorTaskList ?? null
  const previousTaskLists = currentState?.previousOrchestratorTaskLists ?? []
  const subAgents = currentState?.subAgents ?? []

  // Current panel UI state
  const currentPanelState = currentConversationId
    ? readPanelState(panelStateByConversation, currentConversationId)
    : { isOpen: false, panelType: null }
  const isOpen = currentPanelState.isOpen
  const panelType = currentPanelState.panelType

  // --- Orchestrator task list events (backward compatible) ---
  const handleSetTaskList = useCallback((event: Event) => {
    const detail = (event as CustomEvent).detail
    if (!detail?.taskList) return
    const incoming = detail.taskList as TaskList
    const conversationId = typeof detail.conversationId === 'string' ? detail.conversationId : currentConversationId
    if (!conversationId) return

    setStateByConversation((prev) => {
      const newMap = new Map(prev)
      const convState = { ...readConvState(prev, conversationId) }

      // Archive the previous task list for the targeted conversation only.
      if (convState.orchestratorTaskList) {
        convState.previousOrchestratorTaskLists = [
          convState.orchestratorTaskList,
          ...convState.previousOrchestratorTaskLists,
        ]
      }
      convState.orchestratorTaskList = incoming

      newMap.set(conversationId, convState)
      return newMap
    })

    // Auto-open panel when task list is set on the currently viewed conversation.
    if (conversationId === currentConversationId) {
      setPanelStateByConversation((prev) => {
        const newMap = new Map(prev)
        newMap.set(conversationId, { isOpen: true, panelType: 'taskList' })
        return newMap
      })
    }
  }, [currentConversationId])

  const handleUpdateTaskStatus = useCallback((event: Event) => {
    const detail = (event as CustomEvent).detail
    if (!detail?.taskId || !detail?.status) return
    const { conversationId, taskId, status, errorMessage } = detail as {
      conversationId?: string
      taskId: string
      status: TaskStatus
      errorMessage?: string
    }

    const targetConversationId = conversationId || currentConversationId
    if (!targetConversationId) return

    setStateByConversation((prev) => {
      const newMap = new Map(prev)
      const convState = { ...readConvState(prev, targetConversationId) }

      if (!convState.orchestratorTaskList) return prev

      const updatedTasks = convState.orchestratorTaskList.tasks.map((task) => {
        if (task.id !== taskId) return task
        return {
          ...task,
          status,
          ...(status === 'completed' ? { completedAt: new Date().toISOString() } : {}),
          ...(status === 'error' && errorMessage ? { errorMessage } : {}),
        }
      })

      const allCompleted = updatedTasks.every(
        (t) => t.status === 'completed' || t.status === 'error',
      )

      convState.orchestratorTaskList = {
        ...convState.orchestratorTaskList,
        tasks: updatedTasks,
        ...(allCompleted && !convState.orchestratorTaskList.completedAt
          ? { completedAt: new Date().toISOString() }
          : {}),
      }

      newMap.set(targetConversationId, convState)
      return newMap
    })
  }, [currentConversationId])

  // --- Subagent events ---
  const handleRegisterSubAgent = useCallback((event: Event) => {
    const detail = (event as CustomEvent).detail
    const conversationId = typeof detail?.conversationId === 'string' ? detail.conversationId : currentConversationId
    if (!detail?.subAgent || !conversationId) return
    const incoming = detail.subAgent as SubAgent

    setStateByConversation((prev) => {
      const newMap = new Map(prev)
      const convState = { ...readConvState(prev, conversationId) }

      // Don't duplicate: update if already registered
      const existingIdx = convState.subAgents.findIndex((a) => a.id === incoming.id)
      if (existingIdx >= 0) {
        const updated = [...convState.subAgents]
        updated[existingIdx] = { ...updated[existingIdx], ...incoming }
        convState.subAgents = updated
      } else {
        convState.subAgents = [...convState.subAgents, incoming]
      }

      newMap.set(conversationId, convState)
      return newMap
    })

    // Auto-open panel when subagent is registered for the active conversation.
    if (conversationId === currentConversationId) {
      setPanelStateByConversation((prev) => {
        const newMap = new Map(prev)
        newMap.set(conversationId, { isOpen: true, panelType: 'taskList' })
        return newMap
      })
    }
  }, [currentConversationId])

  const handleUpdateSubAgentStatus = useCallback((event: Event) => {
    const detail = (event as CustomEvent).detail
    const conversationId = typeof detail?.conversationId === 'string' ? detail.conversationId : currentConversationId
    if (!detail?.subAgentId || !detail?.status || !conversationId) return
    const { subAgentId, status, errorMessage } = detail as {
      conversationId?: string
      subAgentId: string
      status: SubAgentStatus
      errorMessage?: string
    }

    setStateByConversation((prev) => {
      const newMap = new Map(prev)
      const convState = { ...readConvState(prev, conversationId) }
      const updatedAgents = convState.subAgents.map((agent) => {
        if (agent.id !== subAgentId) return agent
        return {
          ...agent,
          status,
          ...(status === 'completed' || status === 'error'
            ? { completedAt: new Date().toISOString() }
            : {}),
          ...(status === 'error' && errorMessage ? { errorMessage } : {}),
        }
      })
      convState.subAgents = updatedAgents
      newMap.set(conversationId, convState)
      return newMap
    })
  }, [currentConversationId])

  const handleSetSubAgentTaskList = useCallback((event: Event) => {
    const detail = (event as CustomEvent).detail
    const conversationId = typeof detail?.conversationId === 'string' ? detail.conversationId : currentConversationId
    if (!detail?.subAgentId || !detail?.taskList || !conversationId) return
    const { subAgentId, taskList: incoming } = detail as {
      conversationId?: string
      subAgentId: string
      taskList: TaskList
    }

    setStateByConversation((prev) => {
      const newMap = new Map(prev)
      const convState = { ...readConvState(prev, conversationId) }
      const updatedAgents = convState.subAgents.map((agent) => {
        if (agent.id !== subAgentId) return agent

        // Archive previous task list if present
        const prevLists = agent.taskList
          ? [agent.taskList, ...agent.previousTaskLists]
          : agent.previousTaskLists

        return {
          ...agent,
          taskList: incoming,
          previousTaskLists: prevLists,
        }
      })
      convState.subAgents = updatedAgents
      newMap.set(conversationId, convState)
      return newMap
    })
  }, [currentConversationId])

  const handleUpdateSubAgentTaskStatus = useCallback((event: Event) => {
    const detail = (event as CustomEvent).detail
    const conversationId = typeof detail?.conversationId === 'string' ? detail.conversationId : currentConversationId
    if (!detail?.subAgentId || !detail?.taskId || !detail?.status || !conversationId) return
    const { subAgentId, taskId, status, errorMessage } = detail as {
      conversationId?: string
      subAgentId: string
      taskId: string
      status: TaskStatus
      errorMessage?: string
    }

    setStateByConversation((prev) => {
      const newMap = new Map(prev)
      const convState = { ...readConvState(prev, conversationId) }
      const updatedAgents = convState.subAgents.map((agent) => {
        if (agent.id !== subAgentId || !agent.taskList) return agent

        const updatedTasks = agent.taskList.tasks.map((task) => {
          if (task.id !== taskId) return task
          return {
            ...task,
            status,
            ...(status === 'completed' ? { completedAt: new Date().toISOString() } : {}),
            ...(status === 'error' && errorMessage ? { errorMessage } : {}),
          }
        })

        const allCompleted = updatedTasks.every(
          (t) => t.status === 'completed' || t.status === 'error',
        )

        return {
          ...agent,
          taskList: {
            ...agent.taskList,
            tasks: updatedTasks,
            ...(allCompleted && !agent.taskList.completedAt
              ? { completedAt: new Date().toISOString() }
              : {}),
          },
        }
      })
      convState.subAgents = updatedAgents
      newMap.set(conversationId, convState)
      return newMap
    })
  }, [currentConversationId])

  const handleCompleteAllPendingTasks = useCallback((event: Event) => {
    const detail = (event as CustomEvent).detail
    if (!detail?.conversationId) return
    const { conversationId } = detail as { conversationId: string }

    setStateByConversation((prev) => {
      const newMap = new Map(prev)
      const convState = { ...readConvState(prev, conversationId) }

      // Complete all tasks in orchestrator task list
      if (convState.orchestratorTaskList) {
        const updatedTasks = convState.orchestratorTaskList.tasks.map((task) => {
          // Only update if not already completed or errored
          if (task.status === 'completed' || task.status === 'error') {
            return task
          }
          return {
            ...task,
            status: 'completed' as TaskStatus,
            completedAt: new Date().toISOString(),
          }
        })

        convState.orchestratorTaskList = {
          ...convState.orchestratorTaskList,
          tasks: updatedTasks,
          completedAt: new Date().toISOString(),
        }
      }

      // Complete all tasks in subagent task lists
      const updatedSubAgents = convState.subAgents.map((agent) => {
        if (!agent.taskList) return agent

        const updatedTasks = agent.taskList.tasks.map((task) => {
          if (task.status === 'completed' || task.status === 'error') {
            return task
          }
          return {
            ...task,
            status: 'completed' as TaskStatus,
            completedAt: new Date().toISOString(),
          }
        })

        return {
          ...agent,
          taskList: {
            ...agent.taskList,
            tasks: updatedTasks,
            completedAt: new Date().toISOString(),
          },
        }
      })

      convState.subAgents = updatedSubAgents

      newMap.set(conversationId, convState)
      return newMap
    })
  }, [])

  useEffect(() => {
    window.addEventListener('chaton:set-task-list', handleSetTaskList)
    window.addEventListener('chaton:update-task-status', handleUpdateTaskStatus)
    window.addEventListener('chaton:register-subagent', handleRegisterSubAgent)
    window.addEventListener('chaton:update-subagent-status', handleUpdateSubAgentStatus)
    window.addEventListener('chaton:set-subagent-task-list', handleSetSubAgentTaskList)
    window.addEventListener('chaton:update-subagent-task-status', handleUpdateSubAgentTaskStatus)
    window.addEventListener('chaton:complete-all-pending-tasks', handleCompleteAllPendingTasks)
    return () => {
      window.removeEventListener('chaton:set-task-list', handleSetTaskList)
      window.removeEventListener('chaton:update-task-status', handleUpdateTaskStatus)
      window.removeEventListener('chaton:register-subagent', handleRegisterSubAgent)
      window.removeEventListener('chaton:update-subagent-status', handleUpdateSubAgentStatus)
      window.removeEventListener('chaton:set-subagent-task-list', handleSetSubAgentTaskList)
      window.removeEventListener('chaton:update-subagent-task-status', handleUpdateSubAgentTaskStatus)
      window.removeEventListener('chaton:complete-all-pending-tasks', handleCompleteAllPendingTasks)
    }
  }, [
    handleSetTaskList,
    handleUpdateTaskStatus,
    handleRegisterSubAgent,
    handleUpdateSubAgentStatus,
    handleSetSubAgentTaskList,
    handleUpdateSubAgentTaskStatus,
    handleCompleteAllPendingTasks,
  ])

  const setIsOpen = (isOpen: boolean) => {
    if (!currentConversationId) return
    setPanelStateByConversation((prev) => {
      const newMap = new Map(prev)
      const current = readPanelState(prev, currentConversationId)
      newMap.set(currentConversationId, { ...current, isOpen })
      return newMap
    })
  }

  const setPanelType = (panelType: ConversationSidePanelType) => {
    if (!currentConversationId) return
    setPanelStateByConversation((prev) => {
      const newMap = new Map(prev)
      const current = readPanelState(prev, currentConversationId)
      newMap.set(currentConversationId, { ...current, panelType })
      return newMap
    })
  }

  const togglePanel = () => {
    setIsOpen(!isOpen)
  }

  const handleSetConversationId = useCallback((id: string | null) => {
    setCurrentConversationId(id)
  }, [])

  const getTaskListForConversation = useCallback((conversationId: string): TaskList | null => {
    const state = readConvState(stateByConversation, conversationId)
    return state.orchestratorTaskList ?? null
  }, [stateByConversation])

  const value: ConversationSidePanelContextType = {
    isOpen,
    panelType,
    taskList,
    previousTaskLists,
    subAgents,
    setIsOpen,
    setPanelType,
    togglePanel,
    setConversationId: handleSetConversationId,
    getTaskListForConversation,
  }

  return (
    <ConversationSidePanelContext.Provider value={value}>
      {props.children}
    </ConversationSidePanelContext.Provider>
  )
}

export function useConversationSidePanel() {
  const context = useContext(ConversationSidePanelContext)
  if (!context) {
    throw new Error(
      'useConversationSidePanel must be used within ConversationSidePanelProvider',
    )
  }
  return context
}
