import { useMemo } from 'react'
import { Clock, MessageCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useWorkspace } from '@/features/workspace/store'
import type { Conversation } from '@/features/workspace/types'

function formatRelativeTime(dateStr: string, t: (key: string) => string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMin < 1) return t('assistant.dashboard.justNow')
  if (diffMin < 60) return t('assistant.dashboard.minutesAgo').replace('{{count}}', diffMin.toString())
  if (diffHours < 24) return t('assistant.dashboard.hoursAgo').replace('{{count}}', diffHours.toString())
  if (diffDays === 1) return t('assistant.dashboard.yesterday')
  if (diffDays < 7) return t('assistant.dashboard.daysAgo').replace('{{count}}', diffDays.toString())
  return date.toLocaleDateString()
}

export function RecentActivity() {
  const { t } = useTranslation()
  const { state, selectConversation, setAppMode } = useWorkspace()

  // Show the 5 most recent conversations, sorted by last update
  const recentConversations = useMemo(() => {
    return [...state.conversations]
      .sort((a, b) => new Date(b.lastMessageAt || b.updatedAt).getTime() - new Date(a.lastMessageAt || a.updatedAt).getTime())
      .slice(0, 5)
  }, [state.conversations])

  const handleOpenConversation = (conversation: Conversation) => {
    setAppMode('workspace')
    void selectConversation(conversation.id)
  }

  return (
    <section className="ad-card">
      <div className="ad-card-header">
        <Clock className="ad-card-icon h-4 w-4" />
        <h2 className="ad-card-title">{t('assistant.dashboard.recentActivity')}</h2>
      </div>

      {recentConversations.length === 0 ? (
        <div className="ad-card-empty">
          <p>{t('assistant.dashboard.noActivity')}</p>
        </div>
      ) : (
        <div className="ad-activity-list">
          {recentConversations.map((conversation) => {
            const isChannel = Boolean(conversation.channelExtensionId)
            const timeStr = formatRelativeTime(
              conversation.lastMessageAt || conversation.updatedAt,
              t,
            )
            return (
              <button
                key={conversation.id}
                type="button"
                className="ad-activity-row"
                onClick={() => handleOpenConversation(conversation)}
              >
                <div className="ad-activity-icon">
                  <MessageCircle className="h-3.5 w-3.5" />
                </div>
                <div className="ad-activity-content">
                  <span className="ad-activity-title">
                    {conversation.title || t('assistant.dashboard.untitled')}
                  </span>
                  {isChannel && (
                    <span className="ad-activity-badge">{t('assistant.dashboard.viaChannel')}</span>
                  )}
                </div>
                <span className="ad-activity-time">{timeStr}</span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
