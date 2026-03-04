import type { PiSettingsJson } from '@/features/workspace/types'
import { useTranslation } from 'react-i18next'

export function PackagesSection({
  settings,
  setSettings,
  onSave,
}: {
  settings: PiSettingsJson
  setSettings: (next: PiSettingsJson) => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  const packages = Array.isArray(settings.packages) ? settings.packages : []
  return (
    <section className="settings-card">
      <div className="settings-list">
        {packages.map((pkg, idx) => (
          <div key={idx} className="settings-list-row">
            <span className="settings-mono">{typeof pkg === 'string' ? pkg : JSON.stringify(pkg)}</span>
            <button
              type="button"
              className="settings-icon-action"
              onClick={() => {
                const next = packages.filter((_, i) => i !== idx)
                setSettings({ ...settings, packages: next })
              }}
            >
              {t('Supprimer')}
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="settings-action"
        onClick={() => setSettings({ ...settings, packages: [...packages, 'npm:new-package'] })}
      >
        {t('Ajouter package')}
      </button>
      <button type="button" className="settings-action" onClick={onSave}>{t('Sauvegarder')}</button>
    </section>
  )
}
