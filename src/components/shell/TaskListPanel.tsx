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
import type { TaskList, SubAgent, Task } from '@/features/task-list/types'
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
    case 'queued':
      return 'Queued'
    case 'cancelled':
      return 'Cancelled'
    default:
      return status
  }
}

function isSubAgent(item: Task | SubAgent): item is SubAgent {
  return 'name' in item
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

function getItemPreview(item: Task | SubAgent): string {
  if (isSubAgent(item)) {
    return getSubAgentResultPreview(item.result)
  }

  return item.errorMessage || item.description || ''
}

function getItemTitle(item: Task | SubAgent): string {
  return isSubAgent(item) ? item.name : item.title
}

interface TaskListItemProps {
  item: Task | SubAgent
  isExpanded: boolean
  onToggle: () => void
  onOpenDetail?: () => void
}

function TaskListItem({ item, isExpanded, onToggle, onOpenDetail }: TaskListItemProps) {
  const itemPreview = getItemPreview(item)
  const subAgent = isSubAgent(item)
  const canOpenDetail = subAgent && !!item.result && !!onOpenDetail

  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800 last:border-b-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900"
      >
        <ChevronRight
          className={`h-4 w-4 text-neutral-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        />
        <StatusIcon status={item.status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-neutral-900 dark:text-neutral-100">
              {escapeDisplayText(getItemTitle(item))}
            </span>
            {subAgent ? (
              <Bot className="h-3.5 w-3.5 text-purple-500" />
            ) : (
              <Cpu className="h-3.5 w-3.5 text-blue-500" />
            )}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {escapeDisplayText(item.id)} {'•'} {getStatusLabel(item.status)}
          </div>
        </div>
        {canOpenDetail && (
          <button
            onClick={(event) => {
              event.stopPropagation()
              onOpenDetail()
            }}
            className="rounded p-1.5 transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700"
            title="View details"
          >
            <ExternalLink className="h-4 w-4 text-neutral-400" />
          </button>
        )}
      </button>

      <AnimatePresence>
        {isExpanded && itemPreview && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pl-12">
              <div className="rounded-lg bg-neutral-100 p-3 dark:bg-neutral-900">
                <pre className="whitespace-pre-wrap break-words font-mono text-xs text-neutral-600 dark:text-neutral-300">
                  {escapeDisplayText(itemPreview)}
                </pre>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
        {escapeDisplayText(title)}
      </div>
      {subtitle && (
        <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {escapeDisplayText(subtitle)}
        </div>
      )}
    </div>
  )
}

export function TaskListPanel({ taskList, previousTaskLists, subAgents }: TaskListPanelProps) {
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set())
  const [selectedAgent, setSelectedAgent] = useState<SubAgent | null>(null)

  const hasOrchestratorTasks = !!taskList?.tasks.length
  const hasPreviousTaskLists = previousTaskLists.length > 0
  const hasSubAgents = subAgents.length > 0

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

  const openTaskDetail = (agent: SubAgent) => {
    setSelectedAgent(agent)
  }

  const closeTaskDetail = () => {
    setSelectedAgent(null)
  }

  if (!hasOrchestratorTasks && !hasPreviousTaskLists && !hasSubAgents) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        No tasks yet
      </div>
    )
  }

  return (
    <>
      <div className="max-h-[300px] overflow-y-auto">
        {taskList && (
          <section>
            <SectionHeader
              title={taskList.title || 'Current tasks'}
              subtitle={`${taskList.tasks.length} task${taskList.tasks.length > 1 ? 's' : ''}`}
            />
            {taskList.tasks.map((task) => (
              <TaskListItem
                key={task.id}
                item={task}
                isExpanded={expandedTaskIds.has(task.id)}
                onToggle={() => toggleTask(task.id)}
              />
            ))}
          </section>
        )}

        {hasPreviousTaskLists && (
          <section>
            <SectionHeader
              title="Previous task lists"
              subtitle={previousTaskLists.map((list) => list.title).join(' • ')}
            />
          </section>
        )}

        {hasSubAgents && (
          <section>
            <SectionHeader
              title="Sub-agents"
              subtitle={`${subAgents.length} agent${subAgents.length > 1 ? 's' : ''}`}
            />
            {subAgents.map((agent) => (
              <TaskListItem
                key={agent.id}
                item={agent}
                isExpanded={expandedTaskIds.has(agent.id)}
                onToggle={() => toggleTask(agent.id)}
                onOpenDetail={() => openTaskDetail(agent)}
              />
            ))}
          </section>
        )}
      </div>

      <SubAgentDetailSheet
        open={selectedAgent !== null}
        agent={selectedAgent}
        onClose={closeTaskDetail}
      />
    </>
  )
}
