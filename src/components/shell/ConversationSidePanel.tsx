import { motion, AnimatePresence } from 'framer-motion'
import { useConversationSidePanel } from '@/hooks/use-conversation-side-panel'
import { TaskListPanel } from '@/components/shell/TaskListPanel'

export function ConversationSidePanel() {
  const { isOpen, panelType, taskList, previousTaskLists } = useConversationSidePanel()

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          className="conversation-side-panel"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
        >
          {panelType === 'taskList' && taskList ? (
            <TaskListPanel taskList={taskList} previousTaskLists={previousTaskLists} />
          ) : (
            <div className="conversation-side-panel-placeholder" />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
