import { Loader2, Trash2 } from 'lucide-react'
import { type MouseEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Conversation } from '@/features/workspace/types'
import { getExtensionIcon } from '@/components/extensions/extension-icons'

type ConversationRowProps = {
  conversation: Conversation
  isActive: boolean
  hasCompletedAction: boolean
  hasRunningAction: boolean
  onSelect: (conversationId: string) => void
  onDelete: (conversationId: string) => Promise<unknown>
  extensions?: Array<{ id: string; icon?: string; iconUrl?: string }>
}

const CONFIRM_WINDOW_MS = 2000

export function ConversationRow({ conversation, isActive, hasCompletedAction, hasRunningAction, onSelect, onDelete, extensions = [] }: ConversationRowProps) {
  const { t } = useTranslation()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const resetTimerRef = useRef<number | null>(null)

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

  const channelIcon = channelExtension
    ? getExtensionIcon(channelExtension.iconUrl ?? channelExtension.icon)
    : null

  // Channel conversations should not show the completion indicator
  const shouldShowCompletionIndicator = !conversation.channelExtensionId && hasCompletedAction && !isActive

  return (
    <div
      className={`thread-row ${isActive ? 'thread-row-active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(conversation.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(conversation.id)
        }
      }}
      aria-current={isActive ? 'true' : undefined}
    >
      <span className="thread-row-title">
        {hasRunningAction && <Loader2 className="thread-row-spinner animate-spin" aria-hidden="true" />}
        {shouldShowCompletionIndicator && (
          <span className="thread-row-completed-indicator" aria-hidden="true" />
        )}
        {channelIcon && (
          <span className="thread-row-channel-icon" aria-hidden="true">
            {channelIcon.kind === 'image' ? (
              <img src={channelIcon.src} alt="" className="h-4 w-4 object-contain" loading="lazy" />
            ) : (
              <channelIcon.Component className="h-4 w-4" />
            )}
          </span>
        )}
        <span className="thread-row-title-text">{conversation.title}</span>
      </span>
      <span className="thread-row-meta">
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
          title={confirmDelete ? t('Cliquer à nouveau pour supprimer') : t('Supprimer le fil')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  )
}
