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
  ExternalLink,
} from 'lucide-react'
import type { TaskList, SubAgent } from '@/features/task-list/types'
import { SubAgentDetailSheet } from './SubAgentDetailSheet'

// Escape angle brackets for display instead of trying to strip pseudo-tags.
function escapeDisplayText(text: string): string {
  return text.replace(/[<>]/g, '').trim()
}

interface TaskListPanelProps {
  taskList: TaskList | null
  previousTaskLists: TaskList[]
  subAgents: SubAgent[]
}

function StatusIcon({ status }: { status: string }) {
  const baseClasses = 'h-5 w-5'
  switch (status) {
    case 'completed':
      return <CheckCircle2 className={`${baseClasses} text-emerald-500`} />
    case 'error':
      return <AlertCircle className={`${baseClasses} text-red-500`} />
    case 'in-progress':
    case 'running':
      return <Loader className={`${baseClasses} animate-spin text-blue-500`} />
    case 'cancelled':
    case 'queued':
    default:
      return <Clock className={`${baseClasses} text-gray-400`} />
  }
}

function AgentBadge({ isOrchestrator }: { isOrchestrator: boolean }) {
  const baseClasses = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide'
  const orchestratorClasses = 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
  const subagentClasses = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
  
  return (
    <span className={`${baseClasses} ${isOrchestrator ? orchestratorClasses : subagentClasses}`}>
      {isOrchestrator ? (
        <>
          <Cpu className="h-3 w-3" />
          <span>Orchestrator</span>
        </>
      ) : (
        <>
          <Bot className="h-3 w-3" />
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
      className="overflow-hidden border-b border-gray-200 last:border-b-0"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-gray-100"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <motion.div
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className="shrink-0 text-gray-400"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </motion.div>
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        <span className="flex-1 truncate text-xs font-medium text-gray-500 dark:text-[#9ca3b4]">
          {agentLabel ? `${agentLabel}: ` : ''}
          {taskList.title}
        </span>
        <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-[#14532d]/30 dark:text-[#34d399]">
          {errorCount > 0 ? `${completedCount}/${totalCount}` : `${totalCount}`}
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="overflow-hidden px-2 pb-2"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {taskList.tasks.map((task) => (
              <TaskItem key={task.id} task={task} compact />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function TaskItem({ task, compact = false }: { task: { id: string; title: string; description?: string; errorMessage?: string; status: string }; compact?: boolean }) {
  const iconSize = compact ? 'h-4 w-4' : 'h-5 w-5'
  const titleSize = compact ? 'text-xs' : 'text-sm'
  
  const statusClasses = task.status === 'completed'
    ? 'border-emerald-200/20 bg-emerald-50'
    : task.status === 'error'
      ? 'border-red-200/20 bg-red-50'
      : task.status === 'in-progress' || task.status === 'running'
        ? 'border-blue-200/20 bg-blue-50'
        : 'border-gray-200 bg-white'
  
  const iconClasses = task.status === 'completed'
    ? `${iconSize} text-emerald-500`
    : task.status === 'error'
      ? `${iconSize} text-red-500`
      : task.status === 'in-progress' || task.status === 'running'
        ? `${iconSize} animate-spin text-blue-500`
        : `${iconSize} text-gray-400`

  return (
    <div className={`mb-1 rounded-lg border bg-white p-3 transition-all ${statusClasses} ${compact ? 'mb-1 p-2' : 'mb-2'}`}>
      <div className="flex gap-3">
        <div className="mt-0.5 shrink-0">
          {task.status === 'completed' ? (
            <CheckCircle2 className={iconClasses} />
          ) : task.status === 'error' ? (
            <AlertCircle className={iconClasses} />
          ) : task.status === 'in-progress' || task.status === 'running' ? (
            <Loader className={iconClasses} />
          ) : (
            <Clock className={iconClasses} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`font-medium text-gray-800 dark:text-[#e7e9ef] ${titleSize}`}>{task.title}</div>
          {task.description && !compact && (
            <div className="mt-1 text-xs text-gray-500 dark:text-[#7a7f8e]">{task.description}</div>
          )}
          {task.errorMessage && (
            <div className="mt-1 text-xs text-red-600">{task.errorMessage}</div>
          )}
        </div>
      </div>
    </div>
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
    <div className="flex flex-col">
      <div className="shrink-0 border-b border-gray-200 bg-gray-50 p-4 dark:border-[#181c24] dark:bg-[#12141c]">
        {agentBadge && <div className="mb-2">{agentBadge}</div>}
        <h3 className="text-sm font-semibold text-gray-800 dark:text-[#e7e9ef]">{taskList.title}</h3>
        {taskList.description && <p className="mt-1 text-xs text-gray-500 dark:text-[#7a7f8e]">{taskList.description}</p>}
      </div>

      <AnimatePresence>
        {!isAllDone && (
          <motion.div
            className="shrink-0 overflow-hidden border-b border-gray-200 p-4 dark:border-[#181c24]"
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
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-[#1a1e28]">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-blue-700 transition-all duration-300" 
                style={{ width: `${progress}%` }} 
              />
            </div>
            <div className="mt-2 text-xs font-medium text-gray-500 dark:text-[#7a7f8e]">
              {completedCount} of {totalCount} completed
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="min-h-0 overflow-y-auto p-2">
        {taskList.tasks.map((task) => (
          <TaskItem key={task.id} task={task} />
        ))}
      </div>
    </div>
  )
}

/** A subagent section: collapsible, shows agent status and its tasks */
function SubAgentSection({ agent }: { agent: SubAgent }) {
  const [expanded, setExpanded] = useState(true)
  const [showDetailSheet, setShowDetailSheet] = useState(false)
  const isRunning = agent.status === 'running'
  const isDone = agent.status === 'completed'
  const isError = agent.status === 'error'
  const isQueued = agent.status === 'queued'
  const isCancelled = agent.status === 'cancelled'

  const sectionClasses = isRunning
    ? 'border-amber-300/30 bg-amber-50'
    : isDone
      ? 'border-emerald-200/20 bg-emerald-50'
      : isError
        ? 'border-red-200/20 bg-red-50'
        : 'border-gray-200 bg-gray-50'

  // Compute task summary for the header
  const taskCount = agent.taskList?.tasks.length ?? 0
  const completedTaskCount =
    agent.taskList?.tasks.filter((t) => t.status === 'completed').length ?? 0

  // Remove angle brackets from summary to avoid rendering pseudo-markup in plain text UI.
  const cleanedSummary = agent.result?.summary ? escapeDisplayText(agent.result.summary) : undefined

  return (
    <>
      <motion.div
        className={`mx-2 mb-2 overflow-hidden rounded-lg border transition-all ${sectionClasses} ${isQueued || isCancelled ? 'dark:border-[#1a1e28] dark:bg-[#12141c]' : ''} ${isRunning ? 'dark:border-[#78350f]/40 dark:bg-[#1c1508]' : ''} ${isDone ? 'dark:border-[#14532d]/40 dark:bg-[#0f1f17]' : ''} ${isError ? 'dark:border-[#7f1d1d]/40 dark:bg-[#1f0f0f]' : ''}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
      >
        {/* Subagent header */}
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/[0.03]"
          onClick={() => setExpanded((prev) => !prev)}
        >
          <div className="flex min-w-0 items-center gap-2">
            <motion.div
              animate={{ rotate: expanded ? 90 : 0 }}
              transition={{ duration: 0.15 }}
              className="shrink-0 text-gray-400"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </motion.div>
            <div className="shrink-0">
              <StatusIcon status={agent.status} />
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium text-gray-800 dark:text-[#e7e9ef]">{agent.name}</span>
              <AgentBadge isOrchestrator={false} />
            </div>
          </div>
          <div className="shrink-0">
            {taskCount > 0 && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-[#1a1e28] dark:text-[#7a7f8e]">
                {completedTaskCount}/{taskCount}
              </span>
            )}
          </div>
        </button>

        {/* View details button */}
        <button
          type="button"
          className="mx-3 mb-2 flex w-auto items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 dark:border-[#273244] dark:bg-[#12141c] dark:text-[#7a7f8e] dark:hover:border-[#3b82f6]/30 dark:hover:bg-[#1c1508] dark:hover:text-[#60a5fa]"
          onClick={(e) => {
            e.stopPropagation()
            setShowDetailSheet(true)
          }}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span>Voir détails</span>
        </button>

      {/* Agent description */}
      {agent.description && expanded && (
        <div className="px-3 pb-2 text-xs text-gray-500 dark:text-[#7a7f8e]">{agent.description}</div>
      )}

      {expanded && agent.executionMode && (
        <div className="px-3 pb-2 text-xs text-gray-500 dark:text-[#7a7f8e]">Execution: {agent.executionMode}</div>
      )}

      {expanded && agent.startedAt && (
        <div className="px-3 pb-2 text-xs text-gray-500 dark:text-[#7a7f8e]">Started: {new Date(agent.startedAt).toLocaleTimeString()}</div>
      )}

      {expanded && cleanedSummary && (
        <div className="px-3 pb-2 text-xs text-gray-500 dark:text-[#7a7f8e]">Result: {cleanedSummary}</div>
      )}

      {/* Error message */}
      {agent.errorMessage && (
        <div className="mx-3 mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-[#1f0f0f] dark:text-[#f87171]">{agent.errorMessage}</div>
      )}

      {/* Subagent tasks */}
      <AnimatePresence>
        {expanded && agent.taskList && (
          <motion.div
            className="overflow-hidden border-t border-gray-100 px-2 pb-2 pt-1 dark:border-[#1a1e28]/50"
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
            <div className="flex flex-col">
              {agent.taskList.tasks.map((task) => (
                <TaskItem key={task.id} task={task} compact />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>

      {/* Detail sheet for this subagent */}
      <SubAgentDetailSheet
        open={showDetailSheet}
        onClose={() => setShowDetailSheet(false)}
        agent={agent}
      />
    </>
  )
}

export function TaskListPanel({ taskList, previousTaskLists, subAgents }: TaskListPanelProps) {
  const hasSubAgents = subAgents.length > 0
  const showOrchestratorBadge = hasSubAgents

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto pb-[124px]">
      {/* Previous completed orchestrator task lists, collapsed */}
      {previousTaskLists.length > 0 && (
        <div className="shrink-0 border-b border-gray-200 dark:border-[#181c24]">
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
            className="min-h-0 shrink-0"
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
        <div className="shrink-0">
          <div className="flex items-center gap-2 px-4 py-3">
            <div className="h-px flex-1 bg-gray-200 dark:bg-[#1a1e28]"></div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-[#4b5563]">Sub-agents</span>
            <div className="h-px flex-1 bg-gray-200 dark:bg-[#1a1e28]"></div>
          </div>
          {subAgents.map((agent) => (
            <SubAgentSection key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  )
}
