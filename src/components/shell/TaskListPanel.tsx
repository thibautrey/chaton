import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Clock, AlertCircle, Loader, ChevronRight } from 'lucide-react'
import type { TaskList } from '@/features/task-list/types'

interface TaskListPanelProps {
  taskList: TaskList
  previousTaskLists: TaskList[]
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="task-icon task-icon-completed" />
    case 'error':
      return <AlertCircle className="task-icon task-icon-error" />
    case 'in-progress':
      return <Loader className="task-icon task-icon-in-progress" />
    default:
      return <Clock className="task-icon task-icon-pending" />
  }
}

/** Collapsed summary of a completed task list, expandable on click */
function CollapsedTaskList({ taskList }: { taskList: TaskList }) {
  const [expanded, setExpanded] = useState(false)
  const completedCount = taskList.tasks.filter((t) => t.status === 'completed').length
  const errorCount = taskList.tasks.filter((t) => t.status === 'error').length
  const totalCount = taskList.tasks.length

  return (
    <motion.div
      className="collapsed-task-list"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
    >
      <button
        type="button"
        className="collapsed-task-list-header"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <motion.div
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className="collapsed-task-list-chevron"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </motion.div>
        <CheckCircle2 className="collapsed-task-list-icon" />
        <span className="collapsed-task-list-title">{taskList.title}</span>
        <span className="collapsed-task-list-badge">
          {errorCount > 0 ? `${completedCount}/${totalCount}` : `${totalCount}`}
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="collapsed-task-list-tasks"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {taskList.tasks.map((task) => (
              <div key={task.id} className={`task-item task-item-${task.status} task-item-compact`}>
                <div className="task-item-header">
                  <div className="task-item-icon-wrapper">
                    <StatusIcon status={task.status} />
                  </div>
                  <div className="task-item-content">
                    <div className="task-item-title">{task.title}</div>
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** Active task list with animated progress bar that hides on completion */
function ActiveTaskList({ taskList }: { taskList: TaskList }) {
  const completedCount = taskList.tasks.filter((t) => t.status === 'completed').length
  const totalCount = taskList.tasks.length
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0
  const isAllDone = Boolean(taskList.completedAt)

  return (
    <div className="task-list-active">
      <div className="task-list-header">
        <h3 className="task-list-title">{taskList.title}</h3>
        {taskList.description && <p className="task-list-description">{taskList.description}</p>}
      </div>

      {/* Progress bar: animate out when all tasks complete */}
      <AnimatePresence>
        {!isAllDone && (
          <motion.div
            className="task-list-progress"
            initial={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.3 }}
          >
            <div className="task-list-progress-bar">
              <div className="task-list-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="task-list-progress-text">
              {completedCount} of {totalCount} completed
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="task-list-items">
        {taskList.tasks.map((task) => (
          <div key={task.id} className={`task-item task-item-${task.status}`}>
            <div className="task-item-header">
              <div className="task-item-icon-wrapper">
                <StatusIcon status={task.status} />
              </div>
              <div className="task-item-content">
                <div className="task-item-title">{task.title}</div>
                {task.description && <div className="task-item-description">{task.description}</div>}
                {task.errorMessage && <div className="task-item-error">{task.errorMessage}</div>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TaskListPanel({ taskList, previousTaskLists }: TaskListPanelProps) {
  return (
    <div className="task-list-panel">
      {/* Previous completed task lists, collapsed */}
      {previousTaskLists.length > 0 && (
        <div className="task-list-history">
          {previousTaskLists.map((prev) => (
            <CollapsedTaskList key={prev.id} taskList={prev} />
          ))}
        </div>
      )}

      {/* Current active task list */}
      <AnimatePresence mode="wait">
        <motion.div
          key={taskList.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
          className="task-list-active-wrapper"
        >
          <ActiveTaskList taskList={taskList} />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
