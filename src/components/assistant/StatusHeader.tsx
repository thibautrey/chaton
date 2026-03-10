import { useTranslation } from 'react-i18next'

import { useWorkspace } from '@/features/workspace/store'

function getGreeting(t: (key: string) => string): string {
  const hour = new Date().getHours()
  if (hour < 6) return t('assistant.greeting.night')
  if (hour < 12) return t('assistant.greeting.morning')
  if (hour < 18) return t('assistant.greeting.afternoon')
  return t('assistant.greeting.evening')
}

export function StatusHeader({ channelsConnected }: { channelsConnected: number }) {
  const { t } = useTranslation()
  const { state } = useWorkspace()

  const userName = state.settings.assistantUserName || ''
  const assistantName = state.settings.assistantName || 'Chaton'
  const greeting = getGreeting(t)
  const isOnline = channelsConnected > 0

  return (
    <div className="ad-status-header">
      <div className="ad-status-header-text">
        <h1 className="ad-status-greeting">
          {greeting}{userName ? `, ${userName}` : ''}
        </h1>
        <div className="ad-status-line">
          <span className={`ad-status-dot ${isOnline ? 'ad-status-dot-online' : 'ad-status-dot-offline'}`} />
          <span className="ad-status-label">
            {isOnline
              ? t('assistant.dashboard.online', { name: assistantName })
              : t('assistant.dashboard.offline', { name: assistantName })}
          </span>
        </div>
      </div>
    </div>
  )
}
