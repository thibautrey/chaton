import { Monitor, Bot } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useWorkspace } from '@/features/workspace/store'

export function SidebarModeSwitcher() {
  const { t } = useTranslation()
  const { state, setAppMode } = useWorkspace()
  const isAssistant = state.appMode === 'assistant'

  return (
    <div className="sidebar-mode-switcher" role="radiogroup" aria-label={t('Mode de l\'application')}>
      <button
        type="button"
        role="radio"
        aria-checked={!isAssistant}
        className={`sidebar-mode-segment ${!isAssistant ? 'sidebar-mode-segment-active' : ''}`}
        onClick={() => setAppMode('workspace')}
      >
        <Monitor className="h-4 w-4" />
        <span>{t('Workspace')}</span>
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={isAssistant}
        className={`sidebar-mode-segment ${isAssistant ? 'sidebar-mode-segment-active' : ''}`}
        onClick={() => setAppMode('assistant')}
      >
        <Bot className="h-4 w-4" />
        <span>{t('Assistant')}</span>
      </button>
    </div>
  )
}
