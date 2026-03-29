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
    default:
      return <Clock className={`${baseClasses} text-gray-400`} />
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'completed':
      return 'Completed'
    case 'error':
      return 'Failed'
    case 'in-progress':
    case 'running':
      return 'In Progress'
    case 'pending':
      return 'Pending'
    default:
      return status
  }
}

interface TaskListItemProps {
  task: SubAgent
  isExpanded: boolean
  onToggle: () => void
  onOpenDetail: () => void
}

function TaskListItem({ task, isExpanded, onToggle, onOpenDetail }: TaskListItemProps) {
  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800 last:border-b-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
      >
        <ChevronRight
          className={`h-4 w-4 text-neutral-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        />
        <StatusIcon status={task.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
              {escapeDisplayText(task.label || task.type)}
            </span>
            {task.type === 'subagent' && <Bot className="h-3.5 w-3.5 text-purple-500" />}
            {task.type === 'task' && <Cpu className="h-3.5 w-3.5 text-blue-500" />}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {escapeDisplayText(task.id)} • {getStatusLabel(task.status)}
          </div>
        </div>
        {task.result && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onOpenDetail()
            }}
            className="p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            title="View details"
          >
            <ExternalLink className="h-4 w-4 text-neutral-400" />
          </button>
        )}
      </button>

      <AnimatePresence>
        {isExpanded && task.result && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pl-12">
              <div className="p-3 bg-neutral-100 dark:bg-neutral-900 rounded-lg">
                <pre className="text-xs text-neutral-600 dark:text-neutral-300 whitespace-pre-wrap break-words font-mono">
                  {escapeDisplayText(task.result)}
                </pre>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function TaskListPanel({
  taskList,
  previousTaskLists,
  subAgents,
}: TaskListPanelProps) {
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set())
  const [selectedTask, setSelectedTask] = useState<SubAgent | null>(null)

  const allTasks = subAgents.length > 0 ? subAgents : (taskList?.tasks || [])

  const toggleTask = (taskId: string) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }

  const openTaskDetail = (task: SubAgent) => {
    setSelectedTask(task)
  }

  const closeTaskDetail = () => {
    setSelectedTask(null)
  }

  if (allTasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500">
        No tasks yet
      </div>
    )
  }

  return (
    <>
      <div className="overflow-y-auto max-h-[300px]">
        {allTasks.map((task) => (
          <TaskListItem
            key={task.id}
            task={task}
            isExpanded={expandedTaskIds.has(task.id)}
            onToggle={() => toggleTask(task.id)}
            onOpenDetail={() => openTaskDetail(task)}
          />
        ))}
      </div>

      <SubAgentDetailSheet
        agent={selectedTask}
        onClose={closeTaskDetail}
      />
    </>
  )
}
