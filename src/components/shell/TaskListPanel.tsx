import { useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader,
  ChevronRight,
  Bot,
  Cpu,
  ExternalLink,
} from 'lucide-react'
import type { TaskList, SubAgent } from '@/features/task-list/types'
import { SubAgentDetailSheet } from './SubAgentDetailSheet'

// Sanitize text for safe plain-text display.
// This function removes any HTML, script, or dangerous content
// and returns only plain safe text.
// Since React auto-escapes text in JSX children, this is a defense-in-depth measure.
function escapeDisplayText(text: string): string {
  if (!text) return ''

  // Step 1: Strip all HTML tags (including script, style, etc.)
  let result = text.replace(/<[^>]*>/g, '')

  // Step 2: Remove any remaining < or > that could be used to create tags
  result = result.replace(/[<>]/g, '')

  // Step 3: Remove event handler patterns (onclick, onerror, etc.)
  result = result.replace(/\bon\w+\s*=/gi, '')

  // Step 4: Remove javascript:, data:, vbscript: URL patterns
  result = result.replace(/javascript\s*:/gi, '')
  result = result.replace(/data\s*:/gi, '')
  result = result.replace(/vbscript\s*:/gi, '')

  // Step 5: Remove HTML entities that could be used for obfuscation
  result = result.replace(/&[#\w]+;/gi, '')

  return result.trim()
}

function truncatePreview(text: string, maxLength = 180): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

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
    case 'cancelled':
    case 'queued':
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

function getSubAgentResultPreview(result?: SubAgent['result']): string {
  if (!result) return ''
  if (result.summary) return result.summary
  if (result.outputText) return result.outputText
  if (result.errorMessage) return result.errorMessage
  if (result.outputJson !== undefined) {
    try {
      return JSON.stringify(result.outputJson, null, 2)
    } catch {
      return 'Structured result available'
    }
  }
  if (result.producedFiles?.length) {
    return result.producedFiles.join('\n')
  }
  return 'Result available'
}

function getSubAgentInlinePreview(agent: SubAgent): string {
  const preview = escapeDisplayText(getSubAgentResultPreview(agent.result))
  if (!preview) return ''
  return truncatePreview(preview.replace(/\s+/g, ' '))
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
          {agentLabel ? `${escapeDisplayText(agentLabel)}: ` : ''}
          {escapeDisplayText(taskList.title)}
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
                    <div className="task-item-title">{escapeDisplayText(task.title)}</div>
                    {task.errorMessage && (
                      <div className="task-item-error-message">{escapeDisplayText(task.errorMessage)}</div>
                    )}
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
  agentBadge?: ReactNode
}) {
  const completedCount = taskList.tasks.filter((t) => t.status === 'completed').length
  const totalCount = taskList.tasks.length
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0
  const isAllDone = Boolean(taskList.completedAt)

  return (
    <div className="task-list-active">
      <div className="task-list-header">
        {agentBadge && <div className="task-list-agent-badge-row">{agentBadge}</div>}
        <h3 className="task-list-title">{escapeDisplayText(taskList.title)}</h3>
        {taskList.description && (
          <p className="task-list-description">{escapeDisplayText(taskList.description)}</p>
        )}
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
                <div className="task-item-title">{escapeDisplayText(task.title)}</div>
                {task.description && (
                  <div className="task-item-description">{escapeDisplayText(task.description)}</div>
                )}
                {task.errorMessage && (
                  <div className="task-item-error-message">{escapeDisplayText(task.errorMessage)}</div>
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
function SubAgentSection({
  agent,
  onOpenDetail,
}: {
  agent: SubAgent
  onOpenDetail: (agent: SubAgent) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const isRunning = agent.status === 'running'
  const isDone = agent.status === 'completed'
  const isError = agent.status === 'error'
  const isQueued = agent.status === 'queued'
  const isCancelled = agent.status === 'cancelled'

  const statusColor = isRunning
    ? 'subagent-status-running'
    : isDone
      ? 'subagent-status-completed'
      : isError
        ? 'subagent-status-error'
        : isQueued || isCancelled
          ? 'subagent-status-pending'
          : 'subagent-status-pending'

  const taskCount = agent.taskList?.tasks.length ?? 0
  const completedTaskCount =
    agent.taskList?.tasks.filter((t) => t.status === 'completed').length ?? 0
  const resultPreview = getSubAgentInlinePreview(agent)
  const hasExpandedContent = agent.previousTaskLists.length > 0 || !!agent.taskList

  return (
    <motion.div
      className={`subagent-section ${statusColor}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
    >
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
            <span className="subagent-name">{escapeDisplayText(agent.name)}</span>
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

      <button
        type="button"
        className="subagent-detail-button"
        onClick={(event) => {
          event.stopPropagation()
          onOpenDetail(agent)
        }}
      >
        <ExternalLink className="h-3.5 w-3.5" />
        <span>Voir détails</span>
      </button>

      {agent.description && expanded && (
        <div className="subagent-description">{escapeDisplayText(agent.description)}</div>
      )}

      {expanded && agent.executionMode && (
        <div className="subagent-description">
          Execution: {escapeDisplayText(agent.executionMode)}
        </div>
      )}

      {expanded && agent.startedAt && (
        <div className="subagent-description">
          Started: {new Date(agent.startedAt).toLocaleTimeString()}
        </div>
      )}

      {expanded && resultPreview && (
        <div className="subagent-description">Result: {resultPreview}</div>
      )}

      {agent.errorMessage && (
        <div className="subagent-error-banner">{escapeDisplayText(agent.errorMessage)}</div>
      )}

      <AnimatePresence>
        {expanded && hasExpandedContent && (
          <motion.div
            className="subagent-tasks"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {agent.previousTaskLists.map((prev) => (
              <CollapsedTaskList key={prev.id} taskList={prev} />
            ))}

            {agent.taskList && (
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
                        <div className="task-item-title">{escapeDisplayText(task.title)}</div>
                        {task.description && (
                          <div className="task-item-description">
                            {escapeDisplayText(task.description)}
                          </div>
                        )}
                        {task.errorMessage && (
                          <div className="task-item-error-message">
                            {escapeDisplayText(task.errorMessage)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function TaskListPanel({ taskList, previousTaskLists, subAgents }: TaskListPanelProps) {
  const [selectedAgent, setSelectedAgent] = useState<SubAgent | null>(null)
  const hasSubAgents = subAgents.length > 0
  const hasContent = !!taskList || previousTaskLists.length > 0 || hasSubAgents
  const showOrchestratorBadge = hasSubAgents

  if (!hasContent) {
    return (
      <div className="conversation-side-panel-placeholder text-[#7f8087] dark:text-[#7a7f8e]">
        No tasks yet
      </div>
    )
  }

  return (
    <>
      <div className="task-list-panel">
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

        {hasSubAgents && (
          <div className="subagents-container">
            <div className="subagents-divider">
              <span className="subagents-divider-label">Sub-agents</span>
            </div>
            {subAgents.map((agent) => (
              <SubAgentSection key={agent.id} agent={agent} onOpenDetail={setSelectedAgent} />
            ))}
          </div>
        )}
      </div>

      <SubAgentDetailSheet
        open={selectedAgent !== null}
        onClose={() => setSelectedAgent(null)}
        agent={selectedAgent}
      />
    </>
  )
}
