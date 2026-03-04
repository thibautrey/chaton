import { SecretInput } from '@/components/sidebar/settings/SecretInput'
import { useTranslation } from 'react-i18next'

import type { PiModelsJson } from '@/features/workspace/types'

export function ProvidersSection({
  models,
  setModels,
  onSave,
}: {
  models: PiModelsJson
  setModels: (next: PiModelsJson) => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  const providers = ((models.providers ?? {}) as Record<string, unknown>)

  return (
    <section className="settings-card">
      {Object.entries(providers).map(([name, cfg]) => {
        const provider = (cfg ?? {}) as Record<string, unknown>
        return (
          <div key={name} className="settings-subcard">
            <div className="settings-subtitle">{name}</div>
            <label className="settings-row-wrap">
              <span className="settings-label">api</span>
              <input
                className="settings-input"
                value={String(provider.api ?? '')}
                onChange={(e) =>
                  setModels({
                    ...models,
                    providers: { ...providers, [name]: { ...provider, api: e.target.value } },
                  })
                }
              />
            </label>
            <label className="settings-row-wrap">
              <span className="settings-label">baseUrl</span>
              <input
                className="settings-input"
                value={String(provider.baseUrl ?? '')}
                onChange={(e) =>
                  setModels({
                    ...models,
                    providers: { ...providers, [name]: { ...provider, baseUrl: e.target.value } },
                  })
                }
              />
            </label>
            <SecretInput
              label="apiKey"
              onApply={(value) =>
                setModels({
                  ...models,
                  providers: { ...providers, [name]: { ...provider, apiKey: value } },
                })
              }
            />
          </div>
        )
      })}
      <button type="button" className="settings-action" onClick={onSave}>{t('Sauvegarder')}</button>
    </section>
  )
}
