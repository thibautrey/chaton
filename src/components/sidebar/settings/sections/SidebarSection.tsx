import type { SidebarSettings } from '@/features/workspace/types'
import { useTranslation } from 'react-i18next'

type Props = {
  settings: SidebarSettings
  setSettings: (next: SidebarSettings) => void
  onSave: () => void
}

export function SidebarSection({ settings, setSettings, onSave }: Props) {
  const { t } = useTranslation()
  
  return (
    <section className="settings-card">
      <h3 className="settings-card-title">{t('Affichage de la barre latérale')}</h3>
      <div className="settings-grid">
        <label className="settings-toggle-row">
          <span className="settings-label">{t('Afficher les stats assistant')}</span>
          <input
            type="checkbox"
            checked={Boolean(settings.showAssistantStats)}
            onChange={(e) => setSettings({ ...settings, showAssistantStats: e.target.checked })}
          />
        </label>
      </div>
      <button type="button" className="settings-action" onClick={onSave}>
        {t('Sauvegarder')}
      </button>
    </section>
  )
}