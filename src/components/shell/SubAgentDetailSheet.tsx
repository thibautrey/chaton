import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Clock, CheckCircle2, AlertCircle, Loader, Bot, FileText, ChevronRight } from 'lucide-react'
import type { SubAgent, TaskList, Task } from '@/features/task-list/types'

/** Strip XML-like tags from text, leaving only the inner content */
function stripXmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, '').trim()
}

interface SubAgentDetailSheetProps {
  open: boolean
  onClose: () => void
  agent: SubAgent | null
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-[#10b981]" />
    case 'error':
      return <AlertCircle className="h-4 w-4 text-[#ef4444]" />
    case 'in-progress':
    case 'running':
      return <Loader className="h-4 w-4 animate-spin text-[#3b82f6]" />
    default:
      return <Clock className="h-4 w-4 text-[#9ca3af]" />
  }
}

function TaskItem({ task }: { task: Task }) {
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${
      task.status === 'completed' ? 'border-[#10b981]/20 bg-[#f0fdf4]' :
      task.status === 'error' ? 'border-[#ef4444]/20 bg-[#fef2f2]' :
      task.status === 'in-progress' ? 'border-[#3b82f6]/20 bg-[#eff6ff]' :
      'border-[#e2e3e6] bg-white'
    }`}>
      <StatusIcon status={task.status} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[#1f2025]">{task.title}</div>
        {task.description && (
          <div className="mt-1 text-xs text-[#7f8087]">{task.description}</div>
        )}
        {task.errorMessage && (
          <div className="mt-1 text-xs text-[#dc2626]">{task.errorMessage}</div>
        )}
      </div>
    </div>
  )
}

function TaskListSection({ taskList, title }: { taskList: TaskList; title: string }) {
  const [expanded, setExpanded] = useState(true)
  const completedCount = taskList.tasks.filter(t => t.status === 'completed').length
  const totalCount = taskList.tasks.length

  return (
    <div className="mb-4">
      <button
        type="button"
        className="flex w-full items-center gap-2 py-2 text-left"
        onClick={() => setExpanded(prev => !prev)}
      >
        <motion.div
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
        >
          <ChevronRight className="h-4 w-4 text-[#9ca3af]" />
        </motion.div>
        <span className="text-sm font-semibold text-[#1f2025]">{title}</span>
        <span className="text-xs text-[#7f8087]">
          {completedCount}/{totalCount} completed
        </span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-2 pl-6"
          >
            {taskList.tasks.map(task => (
              <TaskItem key={task.id} task={task} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function SubAgentDetailSheet({ open, onClose, agent }: SubAgentDetailSheetProps) {
  const [isRendered, setIsRendered] = useState(open)
  const [isClosing, setIsClosing] = useState(false)

  useEffect(() => {
    if (open) {
      // Initial render state - set synchronously to avoid flash
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsRendered(true)
      setIsClosing(false)
      return
    }

    if (!isRendered) {
      return
    }

    setIsClosing(true)
    const timeout = window.setTimeout(() => {
      setIsRendered(false)
      setIsClosing(false)
    }, 220)

    return () => window.clearTimeout(timeout)
  }, [isRendered, open])

  useEffect(() => {
    if (!isRendered) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isRendered, onClose])

  if (!isRendered || !agent) return null

  const statusColor = agent.status === 'running'
    ? 'text-[#f59e0b]'
    : agent.status === 'completed'
      ? 'text-[#10b981]'
      : agent.status === 'error'
        ? 'text-[#ef4444]'
        : 'text-[#9ca3af]'

  return (
    <div
      className={`subagent-detail-sheet-backdrop ${isClosing ? 'subagent-detail-sheet-backdrop-closing' : ''}`}
      onClick={onClose}
      style={{ zIndex: 1100 }}
    >
      <motion.div
        className="subagent-detail-sheet"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 100 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
        style={{ zIndex: 1101 }}
      >
        {/* Header */}
        <div className="subagent-detail-sheet-header">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-[#b45309]" />
            <div>
              <h2 className="text-base font-semibold text-[#1f2025]">{agent.name}</h2>
              {agent.description && (
                <p className="text-xs text-[#7f8087]">{agent.description}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="subagent-detail-sheet-close"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status bar */}
        <div className="subagent-detail-sheet-status">
          <div className="flex items-center gap-2">
            <StatusIcon status={agent.status} />
            <span className={`text-sm font-medium capitalize ${statusColor}`}>
              {agent.status}
            </span>
          </div>
          {agent.executionMode && (
            <span className="text-xs text-[#7f8087]">
              Execution: {agent.executionMode}
            </span>
          )}
        </div>

        {/* Metadata */}
        <div className="subagent-detail-sheet-meta">
          {agent.createdAt && (
            <div className="flex items-center gap-2 text-xs text-[#7f8087]">
              <Clock className="h-3.5 w-3.5" />
              <span>Created: {new Date(agent.createdAt).toLocaleString()}</span>
            </div>
          )}
          {agent.startedAt && (
            <div className="flex items-center gap-2 text-xs text-[#7f8087]">
              <Clock className="h-3.5 w-3.5" />
              <span>Started: {new Date(agent.startedAt).toLocaleString()}</span>
            </div>
          )}
          {agent.completedAt && (
            <div className="flex items-center gap-2 text-xs text-[#7f8087]">
              <Clock className="h-3.5 w-3.5" />
              <span>Completed: {new Date(agent.completedAt).toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="subagent-detail-sheet-content">
          {/* Current task list */}
          {agent.taskList && (
            <TaskListSection taskList={agent.taskList} title="Current Tasks" />
          )}

          {/* Previous task lists */}
          {agent.previousTaskLists.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-2 text-sm font-semibold text-[#5f6573]">
                Previous Task Lists ({agent.previousTaskLists.length})
              </h3>
              {agent.previousTaskLists.map((prevList, index) => (
                <TaskListSection
                  key={prevList.id}
                  taskList={prevList}
                  title={`${prevList.title} (${index + 1})`}
                />
              ))}
            </div>
          )}

          {/* Result */}
          {agent.result && (
            <div className="rounded-lg border border-[#e2e3e6] bg-white p-4">
              <div className="mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#5f6573]" />
                <h3 className="text-sm font-semibold text-[#1f2025]">Result</h3>
              </div>
              {agent.result.summary && (
                <p className="text-sm text-[#5f6573]">{stripXmlTags(agent.result.summary)}</p>
              )}
              {agent.result.outputText && (
                <div className="mt-3">
                  <div className="text-xs font-medium text-[#7f8087]">Output:</div>
                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-[#f9f9fb] p-2 text-xs text-[#5f6573] whitespace-pre-wrap">
                    {stripXmlTags(agent.result.outputText)}
                  </pre>
                </div>
              )}
              {!!agent.result.outputJson && (
                <div className="mt-3">
                  <div className="text-xs font-medium text-[#7f8087]">JSON Output:</div>
                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-[#f9f9fb] p-2 text-xs text-[#5f6573] whitespace-pre-wrap">
                    {JSON.stringify(agent.result.outputJson as object, null, 2)}
                  </pre>
                </div>
              )}
              {agent.result.producedFiles && agent.result.producedFiles.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs font-medium text-[#7f8087]">Produced Files:</div>
                  <ul className="mt-1 space-y-1">
                    {agent.result.producedFiles.map((file, idx) => (
                      <li key={idx} className="text-xs text-[#3b82f6]">{file}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {agent.errorMessage && (
            <div className="mt-4 rounded-lg border border-[#ef4444]/20 bg-[#fef2f2] p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-[#ef4444]" />
                <span className="text-sm font-medium text-[#dc2626]">Error</span>
              </div>
              <p className="mt-1 text-sm text-[#dc2626]">{agent.errorMessage}</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
