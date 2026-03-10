import { Bot } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useWorkspace } from '@/features/workspace/store'
import { AssistantOnboarding } from '@/components/assistant/AssistantOnboarding'

/**
 * Top-level router for assistant mode.
 * Shows onboarding if not completed, otherwise shows the dashboard placeholder.
 */
export function AssistantMainView() {
  const { t } = useTranslation()
  const { state } = useWorkspace()

  if (!state.settings.assistantOnboardingCompleted) {
    return <AssistantOnboarding />
  }

  // Future: return <AssistantDashboard />
  return (
    <div className="assistant-main">
      <div className="assistant-placeholder">
        <div className="assistant-placeholder-icon">
          <Bot className="h-10 w-10" />
        </div>
        <h1 className="assistant-placeholder-title">
          {t('Bienvenue, {{name}}', { name: state.settings.assistantUserName || '' }).trim()}
        </h1>
        <p className="assistant-placeholder-subtitle">
          {t('Toujours disponible, connecte a vos messageries, et apprend de vos preferences au fil du temps.')}
        </p>
      </div>
    </div>
  )
}
