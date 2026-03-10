import { Brain, MessageCircle, Settings, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useWorkspace } from '@/features/workspace/store'

export function QuickActions() {
  const { t } = useTranslation()
  const { createConversationGlobal, setAssistantView, setAppMode, openSettings } = useWorkspace()

  const handleTalkToAssistant = async () => {
    setAppMode('workspace')
    await createConversationGlobal()
  }

  return (
    <section className="ad-card">
      <div className="ad-card-header">
        <Zap className="ad-card-icon h-4 w-4" />
        <h2 className="ad-card-title">{t('assistant.dashboard.quickActions')}</h2>
      </div>

      <div className="ad-quick-grid">
        <button type="button" className="ad-quick-btn" onClick={() => void handleTalkToAssistant()}>
          <div className="ad-quick-btn-icon ad-quick-btn-icon-chat">
            <MessageCircle className="h-5 w-5" />
          </div>
          <span className="ad-quick-btn-label">{t('assistant.dashboard.talkTo')}</span>
        </button>

        <button type="button" className="ad-quick-btn" onClick={() => setAssistantView('automations')}>
          <div className="ad-quick-btn-icon ad-quick-btn-icon-auto">
            <Zap className="h-5 w-5" />
          </div>
          <span className="ad-quick-btn-label">{t('assistant.dashboard.scheduleTask')}</span>
        </button>

        <button type="button" className="ad-quick-btn" onClick={() => setAssistantView('memory')}>
          <div className="ad-quick-btn-icon ad-quick-btn-icon-memory">
            <Brain className="h-5 w-5" />
          </div>
          <span className="ad-quick-btn-label">{t('assistant.dashboard.viewMemory')}</span>
        </button>

        <button type="button" className="ad-quick-btn" onClick={openSettings}>
          <div className="ad-quick-btn-icon ad-quick-btn-icon-settings">
            <Settings className="h-5 w-5" />
          </div>
          <span className="ad-quick-btn-label">{t('assistant.dashboard.manageSettings')}</span>
        </button>
      </div>
    </section>
  )
}
