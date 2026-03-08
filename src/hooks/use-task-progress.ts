import { useMemo } from 'react'
import { useConversationSidePanel } from './use-conversation-side-panel'

export interface TaskProgress {
  completed: number
  total: number
  percentage: number
  hasTaskList: boolean
}

/**
 * Hook to calculate task completion progress for a conversation
 * Returns progress information including completed count, total count, and percentage
 * Hides progress when all tasks are completed
 */
export function useTaskProgress(conversationId: string): TaskProgress {
  const { getTaskListForConversation } = useConversationSidePanel()

  return useMemo(() => {
    const taskList = getTaskListForConversation(conversationId)

    if (!taskList || taskList.tasks.length === 0) {
      return { completed: 0, total: 0, percentage: 0, hasTaskList: false }
    }

    const total = taskList.tasks.length
    const completed = taskList.tasks.filter(
      (task) => task.status === 'completed' || task.status === 'error',
    ).length
    const percentage = (completed / total) * 100

    // Hide progress bar when all tasks are completed
    const allCompleted = completed === total
    const isCompletedTaskList = taskList.completedAt !== undefined

    return {
      completed,
      total,
      percentage,
      hasTaskList: !allCompleted && !isCompletedTaskList,
    }
  }, [conversationId, getTaskListForConversation])
}
