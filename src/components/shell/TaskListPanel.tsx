import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader,
  ChevronRight,
  Bot,
  Cpu,
} from 'lucide-react'
import type { TaskList, SubAgent } from '@/features/task-list/types'

interface TaskListPanelProps {
  taskList: TaskList | null
  previousTaskLists: TaskList[]
  subAgents: SubAgent[]
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="task-icon task-icon-completed" />
    case 'error':
      return <AlertCircle className="task-icon task-icon-error" />
    case 'in-progress':
    case 'running':
      return <Loader className="task-icon task-icon-in-progress" />
    default:
      return <Clock className="task-icon task-icon-pending" />
  }
}

function AgentBadge({ isOrchestrator }: { isOrchestrator: boolean }) {
  return (
    <span className={`agent-badge ${isOrchestrator ? 'agent-badge-orchestrator' : 'agent-badge-subagent'}`}>
      {isOrchestrator ? (
        <>
          <Cpu className="agent-badge-icon" />
          <span>Orchestrator</span>
        </>
      ) : (
        <>
          <Bot className="agent-badge-icon" />
          <span>Sub-agent</span>
        </>
      )}
    </span>
  )
}

/** Collapsed summary of a completed task list, expandable on click */
function CollapsedTaskList({ taskList, agentLabel }: { taskList: TaskList; agentLabel?: string }) {
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
        <span className="collapsed-task-list-title">
          {agentLabel ? `${agentLabel}: ` : ''}
          {taskList.title}
        </span>
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

/** A task list with progress bar, used for both orchestrator and subagents */
function ActiveTaskList({
  taskList,
  agentBadge,
}: {
  taskList: TaskList
  agentBadge?: React.ReactNode
}) {
  const completedCount = taskList.tasks.filter((t) => t.status === 'completed').length
  const totalCount = taskList.tasks.length
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0
  const isAllDone = Boolean(taskList.completedAt)

  return (
    <div className="task-list-active">
      <div className="task-list-header">
        {agentBadge && <div className="task-list-agent-badge-row">{agentBadge}</div>}
        <h3 className="task-list-title">{taskList.title}</h3>
        {taskList.description && <p className="task-list-description">{taskList.description}</p>}
      </div>

      <AnimatePresence>
        {!isAllDone && (
          <motion.div
            className="task-list-progress"
            initial={{ opacity: 1, height: 'auto' }}
            exit={{
              opacity: 0,
              height: 0,
              marginTop: 0,
              marginBottom: 0,
              paddingTop: 0,
              paddingBottom: 0,
            }}
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
                {task.description && (
                  <div className="task-item-description">{task.description}</div>
                )}
                {task.errorMessage && (
                  <div className="task-item-error">{task.errorMessage}</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** A subagent section: collapsible, shows agent status and its tasks */
function SubAgentSection({ agent }: { agent: SubAgent }) {
  const [expanded, setExpanded] = useState(true)
  const isRunning = agent.status === 'running'
  const isDone = agent.status === 'completed'
  const isError = agent.status === 'error'

  const statusColor = isRunning
    ? 'subagent-status-running'
    : isDone
      ? 'subagent-status-completed'
      : isError
        ? 'subagent-status-error'
        : 'subagent-status-pending'

  // Compute task summary for the header
  const taskCount = agent.taskList?.tasks.length ?? 0
  const completedTaskCount =
    agent.taskList?.tasks.filter((t) => t.status === 'completed').length ?? 0

  return (
    <motion.div
      className={`subagent-section ${statusColor}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
    >
      {/* Subagent header */}
      <button
        type="button"
        className="subagent-header"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="subagent-header-left">
          <motion.div
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.15 }}
            className="subagent-chevron"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </motion.div>
          <div className="subagent-status-indicator">
            <StatusIcon status={agent.status} />
          </div>
          <div className="subagent-info">
            <span className="subagent-name">{agent.name}</span>
            <AgentBadge isOrchestrator={false} />
          </div>
        </div>
        <div className="subagent-header-right">
          {taskCount > 0 && (
            <span className="subagent-task-count">
              {completedTaskCount}/{taskCount}
            </span>
          )}
        </div>
      </button>

      {/* Agent description */}
      {agent.description && expanded && (
        <div className="subagent-description">{agent.description}</div>
      )}

      {/* Error message */}
      {agent.errorMessage && (
        <div className="subagent-error">{agent.errorMessage}</div>
      )}

      {/* Subagent tasks */}
      <AnimatePresence>
        {expanded && agent.taskList && (
          <motion.div
            className="subagent-tasks"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {/* Previous task lists for this subagent */}
            {agent.previousTaskLists.map((prev) => (
              <CollapsedTaskList key={prev.id} taskList={prev} />
            ))}

            {/* Current task list */}
            <div className="subagent-task-list">
              {agent.taskList.tasks.map((task) => (
                <div
                  key={task.id}
                  className={`task-item task-item-${task.status} task-item-compact task-item-nested`}
                >
                  <div className="task-item-header">
                    <div className="task-item-icon-wrapper">
                      <StatusIcon status={task.status} />
                    </div>
                    <div className="task-item-content">
                      <div className="task-item-title">{task.title}</div>
                      {task.errorMessage && (
                        <div className="task-item-error">{task.errorMessage}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function TaskListPanel({ taskList, previousTaskLists, subAgents }: TaskListPanelProps) {
  const hasSubAgents = subAgents.length > 0
  const showOrchestratorBadge = hasSubAgents

  return (
    <div className="task-list-panel">
      {/* Previous completed orchestrator task lists, collapsed */}
      {previousTaskLists.length > 0 && (
        <div className="task-list-history">
          {previousTaskLists.map((prev) => (
            <CollapsedTaskList
              key={prev.id}
              taskList={prev}
              agentLabel={hasSubAgents ? 'Orchestrator' : undefined}
            />
          ))}
        </div>
      )}

      {/* Current active orchestrator task list */}
      {taskList && (
        <AnimatePresence mode="wait">
          <motion.div
            key={taskList.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            className="task-list-active-wrapper"
          >
            <ActiveTaskList
              taskList={taskList}
              agentBadge={showOrchestratorBadge ? <AgentBadge isOrchestrator /> : undefined}
            />
          </motion.div>
        </AnimatePresence>
      )}

      {/* Subagent sections */}
      {hasSubAgents && (
        <div className="subagents-container">
          <div className="subagents-divider">
            <span className="subagents-divider-label">Sub-agents</span>
          </div>
          {subAgents.map((agent) => (
            <SubAgentSection key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  )
}
