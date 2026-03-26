import { Loader2, Trash2 } from 'lucide-react'
import { memo, type CSSProperties, type MouseEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'

import type { Conversation } from '@/features/workspace/types'
import { ExtensionIcon } from '@/components/extensions/extension-icons'
import { useConversationActivityStatus } from '@/features/workspace/store/pi-store'
import { perfMonitor } from '@/features/workspace/store/perf-monitor'
import { useTaskProgress } from '@/hooks/use-task-progress'

type ConversationRowProps = {
  conversation: Conversation
  isActive: boolean
  onSelect: (conversationId: string) => void
  onDelete: (conversationId: string) => Promise<unknown>
  extensions?: Array<{ id: string; icon?: string; iconUrl?: string }>
}

const CONFIRM_WINDOW_MS = 2000

export const ConversationRow = memo(function ConversationRow({ conversation, isActive, onSelect, onDelete, extensions = [] }: ConversationRowProps) {
  perfMonitor.recordComponentRender('ConversationRow')
  const { t } = useTranslation()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const resetTimerRef = useRef<number | null>(null)

  // Activity status from external Pi store (only re-renders this row when its status changes)
  const { isActive: hasRunningAction, hasCompletedAction } = useConversationActivityStatus(conversation.id)

  // Get task progress for this conversation
  const taskProgress = useTaskProgress(conversation.id)

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

  const scheduleReset = () => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current)
    }
    resetTimerRef.current = window.setTimeout(() => {
      setConfirmDelete(false)
      resetTimerRef.current = null
    }, CONFIRM_WINDOW_MS)
  }

  const onDeleteClick = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()

    if (!confirmDelete) {
      setConfirmDelete(true)
      scheduleReset()
      return
    }

    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }
    setConfirmDelete(false)
    await onDelete(conversation.id)
  }

  // Find the channel extension for this conversation
  const channelExtension = conversation.channelExtensionId && extensions
    ? extensions.find(ext => ext.id === conversation.channelExtensionId)
    : null

  // Channel conversations should not show the completion indicator
  const shouldShowCompletionIndicator = !conversation.channelExtensionId && hasCompletedAction && !isActive

  // Use a soft tinted fill instead of a strong progress bar background.
  const progressStyle = taskProgress.hasTaskList
    ? {
        '--task-progress': `${taskProgress.percentage}%`,
      } as CSSProperties
    : {}

  return (
    <div
      className={`thread-row ${isActive ? 'thread-row-active' : ''} ${taskProgress.hasTaskList ? 'thread-row-with-progress' : ''}`}
      style={progressStyle}
      role="button"
      tabIndex={0}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        // Dispatch event to notify MainView to scroll to bottom
        window.dispatchEvent(
          new CustomEvent('chaton:conversation-selected', {
            detail: { conversationId: conversation.id },
          }),
        )
        onSelect(conversation.id)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          // Dispatch event to notify MainView to scroll to bottom
          window.dispatchEvent(
            new CustomEvent('chaton:conversation-selected', {
              detail: { conversationId: conversation.id },
            }),
          )
          onSelect(conversation.id)
        }
      }}
      aria-current={isActive ? 'true' : undefined}
      aria-label={taskProgress.hasTaskList ? t('{{title}} - {{completed}} de {{total}} tâches', { title: conversation.title, completed: taskProgress.completed, total: taskProgress.total }) : conversation.title}
    >
      <motion.span
        className="thread-row-title"
        layout
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        {hasRunningAction && <Loader2 className="thread-row-spinner animate-spin" aria-hidden="true" />}
        {shouldShowCompletionIndicator && (
          <span className="thread-row-completed-indicator" aria-hidden="true" />
        )}
        {channelExtension && (
          <span className="thread-row-channel-icon" aria-hidden="true">
            <ExtensionIcon
              iconName={channelExtension.iconUrl ?? channelExtension.icon}
              extensionId={channelExtension.id}
              className="h-4 w-4 object-contain"
            />
          </span>
        )}
        <motion.span
          className="thread-row-title-text"
          layout="position"
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {conversation.title}
        </motion.span>
        {taskProgress.hasTaskList && (
          <span className="thread-row-progress-badge" aria-label={t('{{completed}} de {{total}} tâches', { completed: taskProgress.completed, total: taskProgress.total })}>
            {taskProgress.completed}/{taskProgress.total}
          </span>
        )}
      </motion.span>
      <AnimatePresence>
        {isHovered && (
          <motion.span
            className="thread-row-meta h-7 shrink-0 py-0"
            initial={{ opacity: 0, x: 4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            <button
              type="button"
              className={`thread-delete-button ${confirmDelete ? 'thread-delete-button-confirm' : ''}`}
              onMouseDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onClick={(event) => {
                void onDeleteClick(event)
              }}
              aria-label={confirmDelete ? t('Confirmer la suppression de {{title}}', { title: conversation.title }) : t('Supprimer {{title}}', { title: conversation.title })}
              title={confirmDelete ? t('Cliquer à nouveau pour supprimer') : t('Supprimer la conversation')}
            >
              <Trash2 className="h-3 w-3" />
              <AnimatePresence initial={false} mode="wait">
                {confirmDelete && (
                  <motion.span
                    className="thread-delete-confirm-text"
                    initial={{ opacity: 0, scale: 0.8, x: -4 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.8, x: 4 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                  >
                    {t('Confirmer')}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}, (prevProps, nextProps) => {
  if (prevProps.conversation.id !== nextProps.conversation.id) return false
  if (prevProps.conversation.title !== nextProps.conversation.title) return false
  if (prevProps.conversation.lastMessageAt !== nextProps.conversation.lastMessageAt) return false
  if (prevProps.isActive !== nextProps.isActive) return false
  if (prevProps.extensions?.length !== nextProps.extensions?.length) return false
  return true
})
