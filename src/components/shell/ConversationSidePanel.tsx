import { motion, AnimatePresence } from 'framer-motion'
import { useEffect } from 'react'
import { useConversationSidePanel } from '@/hooks/use-conversation-side-panel'
import { TaskListPanel } from '@/components/shell/TaskListPanel'

export function ConversationSidePanel() {
  const { isOpen, setIsOpen, panelType, taskList, previousTaskLists, subAgents } = useConversationSidePanel()

  // Show panel if there's an orchestrator task list or any subagents
  const hasContent = taskList || subAgents.length > 0

  // Auto-close panel when no content is available
  useEffect(() => {
    if (isOpen && !hasContent) {
      setIsOpen(false)
    }
  }, [hasContent, isOpen, setIsOpen])

  return (
    <AnimatePresence mode="wait">
      {isOpen && hasContent && (
        <motion.div
          className="conversation-side-panel"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
        >
          {panelType === 'taskList' ? (
            <TaskListPanel
              taskList={taskList}
              previousTaskLists={previousTaskLists}
              subAgents={subAgents}
            />
          ) : null}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
