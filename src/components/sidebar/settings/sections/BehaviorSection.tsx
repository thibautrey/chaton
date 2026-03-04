import type { PiSettingsJson } from '@/features/workspace/types'
import { useTranslation } from 'react-i18next'

type Props = {
  settings: PiSettingsJson
  setSettings: (next: PiSettingsJson) => void
  onSave: () => void
}

export function BehaviorSection({ settings, setSettings, onSave }: Props) {
  const { t } = useTranslation()
  return (
    <section className="settings-card">
      <div className="settings-card-note">
        {t('Prompt appliqué automatiquement au début de chaque message utilisateur.')}
      </div>
      <label className="settings-row-wrap">
        <span className="settings-label">defaultBehaviorPrompt</span>
        <textarea
          className="settings-input"
          rows={18}
          value={String(settings.defaultBehaviorPrompt ?? '')}
          onChange={(e) => setSettings({ ...settings, defaultBehaviorPrompt: e.target.value })}
        />
      </label>
      <button type="button" className="settings-action" onClick={onSave}>
        {t('Sauvegarder')}
      </button>
    </section>
  )
}
