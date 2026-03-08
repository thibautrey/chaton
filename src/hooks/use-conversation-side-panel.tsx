import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { TaskList, TaskStatus } from '@/features/task-list/types'

export type ConversationSidePanelType = 'taskList' | null

interface ConversationTaskListState {
  taskList: TaskList | null
  previousTaskLists: TaskList[]
}

interface ConversationSidePanelContextType {
  isOpen: boolean
  panelType: ConversationSidePanelType
  taskList: TaskList | null
  previousTaskLists: TaskList[]
  setIsOpen: (isOpen: boolean) => void
  setPanelType: (panelType: ConversationSidePanelType) => void
  togglePanel: () => void
  setConversationId: (id: string | null) => void
}

const ConversationSidePanelContext = createContext(
  undefined as ConversationSidePanelContextType | undefined,
)

export function ConversationSidePanelProvider(props: {
  children: ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [panelType, setPanelType] = useState(null as ConversationSidePanelType)
  const [currentConversationId, setCurrentConversationId] = useState(null as string | null)
  // Store task lists per conversation: conversationId -> { taskList, previousTaskLists }
  const [taskListsByConversation, setTaskListsByConversation] = useState(
    new Map<string, ConversationTaskListState>(),
  )

  // Get the state for the current conversation
  const currentState = currentConversationId
    ? taskListsByConversation.get(currentConversationId)
    : null
  const taskList = currentState?.taskList ?? null
  const previousTaskLists = currentState?.previousTaskLists ?? []

  const handleSetTaskList = useCallback((event: Event) => {
    const detail = (event as CustomEvent).detail
    if (!detail?.taskList || !currentConversationId) return
    const incoming = detail.taskList as TaskList

    setTaskListsByConversation((prev) => {
      const newMap = new Map(prev)
      const convState = newMap.get(currentConversationId) ?? {
        taskList: null,
        previousTaskLists: [],
      }

      // If there was a previous task list, archive it
      if (convState.taskList) {
        convState.previousTaskLists = [convState.taskList, ...convState.previousTaskLists]
      }

      newMap.set(currentConversationId, {
        taskList: incoming,
        previousTaskLists: convState.previousTaskLists,
      })
      return newMap
    })

    setPanelType('taskList')
    setIsOpen(true)
  }, [currentConversationId])

  const handleUpdateTaskStatus = useCallback((event: Event) => {
    const detail = (event as CustomEvent).detail
    if (!detail?.taskId || !detail?.status || !currentConversationId) return
    const { taskId, status, errorMessage } = detail as {
      taskId: string
      status: TaskStatus
      errorMessage?: string
    }

    setTaskListsByConversation((prev) => {
      const newMap = new Map(prev)
      const convState = newMap.get(currentConversationId)
      if (!convState?.taskList) return newMap

      const updatedTasks = convState.taskList.tasks.map((task) => {
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

      newMap.set(currentConversationId, {
        taskList: {
          ...convState.taskList,
          tasks: updatedTasks,
          ...(allCompleted && !convState.taskList.completedAt
            ? { completedAt: new Date().toISOString() }
            : {}),
        },
        previousTaskLists: convState.previousTaskLists,
      })
      return newMap
    })
  }, [currentConversationId])

  useEffect(() => {
    window.addEventListener('chaton:set-task-list', handleSetTaskList)
    window.addEventListener('chaton:update-task-status', handleUpdateTaskStatus)
    return () => {
      window.removeEventListener('chaton:set-task-list', handleSetTaskList)
      window.removeEventListener('chaton:update-task-status', handleUpdateTaskStatus)
    }
  }, [handleSetTaskList, handleUpdateTaskStatus])

  const togglePanel = () => setIsOpen((prev) => !prev)

  const value: ConversationSidePanelContextType = {
    isOpen,
    panelType,
    taskList,
    previousTaskLists,
    setIsOpen,
    setPanelType,
    togglePanel,
    setConversationId: setCurrentConversationId,
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
