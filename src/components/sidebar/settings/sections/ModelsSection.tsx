import { Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { PiSettingsJson } from '@/features/workspace/types'

type PiModel = { id: string; provider: string; key: string; scoped: boolean }

export function ModelsSection({
  settings,
  models,
  setSettings,
  onToggle,
  onSave,
}: {
  settings: PiSettingsJson
  models: PiModel[]
  setSettings: (next: PiSettingsJson) => void
  onToggle: (provider: string, id: string, scoped: boolean) => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  const enabled = Array.isArray(settings.enabledModels) ? settings.enabledModels.filter((x): x is string => typeof x === 'string') : []

  return (
    <section className="settings-card">
      <label className="settings-row-wrap">
        <span className="settings-label">enabledModels (CSV)</span>
        <input
          className="settings-input"
          value={enabled.join(',')}
          onChange={(e) => {
            const values = e.target.value
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
            setSettings({ ...settings, enabledModels: values })
          }}
        />
      </label>
      <div className="settings-list">
        {models.map((model) => (
          <div key={model.key} className="settings-list-row">
            <div>
              <div>{model.id}</div>
              <div className="settings-muted">{model.provider}</div>
            </div>
            <button type="button" className="settings-icon-action" onClick={() => onToggle(model.provider, model.id, model.scoped)}>
              <Star className={`h-4 w-4 ${model.scoped ? 'fill-current' : ''}`} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="settings-action" onClick={onSave}>{t('Sauvegarder')}</button>
    </section>
  )
}
