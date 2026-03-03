import { Clock4 } from 'lucide-react'

import type { Conversation } from '@/features/workspace/types'

type ConversationRowProps = {
  conversation: Conversation
  isActive: boolean
  onSelect: (conversationId: string) => void
}

export function ConversationRow({ conversation, isActive, onSelect }: ConversationRowProps) {
  return (
    <button
      type="button"
      className={`thread-row ${isActive ? 'thread-row-active' : ''}`}
      onClick={() => onSelect(conversation.id)}
      aria-current={isActive ? 'true' : undefined}
    >
      <span className="thread-row-title">{conversation.title}</span>
      <span className="thread-row-meta">
        <Clock4 className="h-3.5 w-3.5" />
      </span>
    </button>
  )
}
