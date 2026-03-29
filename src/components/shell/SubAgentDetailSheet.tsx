import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Clock, CheckCircle2, AlertCircle, Loader, Bot, FileText, ChevronRight } from 'lucide-react'
import type { SubAgent, TaskList, Task } from '@/features/task-list/types'

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

interface SubAgentDetailSheetProps {
  open: boolean
  onClose: () => void
  agent: SubAgent | null
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-500" />
    case 'in-progress':
    case 'running':
      return <Loader className="h-4 w-4 animate-spin text-blue-500" />
    default:
      return <Clock className="h-4 w-4 text-gray-400" />
  }
}

function TaskItem({ task }: { task: Task }) {
  const statusClasses = task.status === 'completed'
    ? 'border-emerald-200/20 bg-emerald-50'
    : task.status === 'error'
      ? 'border-red-200/20 bg-red-50'
      : task.status === 'in-progress'
        ? 'border-blue-200/20 bg-blue-50'
        : 'border-gray-200 bg-white'

  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${statusClasses}`}>
      <StatusIcon status={task.status} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{task.title}</div>
        {task.description && (
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{task.description}</div>
        )}
        {task.errorMessage && (
          <div className="mt-1 text-xs text-red-600">{task.errorMessage}</div>
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
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </motion.div>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
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
    ? 'text-amber-500'
    : agent.status === 'completed'
      ? 'text-emerald-500'
      : agent.status === 'error'
        ? 'text-red-500'
        : 'text-gray-400'

  return (
    <div
      className={`fixed inset-0 flex items-stretch justify-end bg-black/20 transition-colors dark:bg-black/40 ${isClosing ? 'bg-black/10 dark:bg-black/20' : ''}`}
      onClick={onClose}
      style={{ zIndex: 1100 }}
    >
      <motion.div
        className="flex h-full w-full max-w-lg flex-col bg-white shadow-xl dark:bg-[#0d131d]"
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
        <div className="flex items-start justify-between border-b border-gray-200 bg-gray-50 p-4 dark:border-[#273244] dark:bg-[#12141c]">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-amber-600" />
            <div>
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">{agent.name}</h2>
              {agent.description && (
                <p className="text-xs text-gray-500 dark:text-[#7a7f8e]">{agent.description}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-200 dark:text-[#7a7f8e] dark:hover:bg-[#1a1e28] dark:hover:text-[#e7e9ef]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-[#273244] dark:bg-[#0d131d]">
          <div className="flex items-center gap-2">
            <StatusIcon status={agent.status} />
            <span className={`text-sm font-medium capitalize ${statusColor}`}>
              {agent.status}
            </span>
          </div>
          {agent.executionMode && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Execution: {agent.executionMode}
            </span>
          )}
        </div>

        {/* Metadata */}
        <div className="flex flex-col gap-1 border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-[#273244] dark:bg-[#12141c]">
          {agent.createdAt && (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Clock className="h-3.5 w-3.5" />
              <span>Created: {new Date(agent.createdAt).toLocaleString()}</span>
            </div>
          )}
          {agent.startedAt && (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Clock className="h-3.5 w-3.5" />
              <span>Started: {new Date(agent.startedAt).toLocaleString()}</span>
            </div>
          )}
          {agent.completedAt && (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Clock className="h-3.5 w-3.5" />
              <span>Completed: {new Date(agent.completedAt).toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Current task list */}
          {agent.taskList && (
            <TaskListSection taskList={agent.taskList} title="Current Tasks" />
          )}

          {/* Previous task lists */}
          {agent.previousTaskLists.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-2 text-sm font-semibold text-gray-600 dark:text-gray-400">
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
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <div className="mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Result</h3>
              </div>
              {agent.result.summary && (
                <p className="text-sm text-gray-600 dark:text-gray-400">{escapeDisplayText(agent.result.summary)}</p>
              )}
              {agent.result.outputText && (
                <div className="mt-3">
                  <div className="text-xs font-medium text-gray-500">Output:</div>
                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-gray-50 dark:bg-gray-900 p-2 text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                    {escapeDisplayText(agent.result.outputText)}
                  </pre>
                </div>
              )}
              {!!agent.result.outputJson && (
                <div className="mt-3">
                  <div className="text-xs font-medium text-gray-500">JSON Output:</div>
                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-gray-50 dark:bg-gray-900 p-2 text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                    {JSON.stringify(agent.result.outputJson as object, null, 2)}
                  </pre>
                </div>
              )}
              {agent.result.producedFiles && agent.result.producedFiles.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs font-medium text-gray-500">Produced Files:</div>
                  <ul className="mt-1 space-y-1">
                    {agent.result.producedFiles.map((file, idx) => (
                      <li key={idx} className="text-xs text-blue-500">{file}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {agent.errorMessage && (
            <div className="mt-4 rounded-lg border border-red-200/20 bg-red-50 dark:bg-red-900/20 p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium text-red-600 dark:text-red-400">Error</span>
              </div>
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{agent.errorMessage}</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
