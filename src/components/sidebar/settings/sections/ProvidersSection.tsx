import { SecretInput } from '@/components/sidebar/settings/SecretInput'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { workspaceIpc } from '@/services/ipc/workspace'

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
  const [refreshingProvider, setRefreshingProvider] = useState<string | null>(null)
  const [discoveryStatus, setDiscoveryStatus] = useState<Record<string, { ok: boolean; message?: string }>>({})

  const handleRefreshModels = async (providerName: string) => {
    setRefreshingProvider(providerName)
    setDiscoveryStatus({})
    try {
      const provider = (providers[providerName] ?? {}) as Record<string, unknown>
      const result = await workspaceIpc.discoverProviderModels(provider)
      
      if (result.ok && result.models.length > 0) {
        // Update models.json with discovered models
        const discoveredModelsList = result.models.map((model) => {
          const entry: Record<string, unknown> = { id: model.id }
          if (typeof model.contextWindow === 'number') {
            entry.contextWindow = model.contextWindow
          }
          if (typeof model.maxTokens === 'number') {
            entry.maxTokens = model.maxTokens
          }
          if (model.reasoning) {
            entry.reasoning = true
          }
          if (model.imageInput) {
            entry.imageInput = true
          }
          return entry
        })

        setModels({
          ...models,
          providers: {
            ...providers,
            [providerName]: {
              ...provider,
              models: discoveredModelsList,
            },
          },
        })

        setDiscoveryStatus({
          [providerName]: {
            ok: true,
            message: `Found ${result.models.length} models`,
          },
        })
      } else {
        setDiscoveryStatus({
          [providerName]: {
            ok: false,
            message: (result as any).message || 'No models found',
          },
        })
      }
    } catch (error) {
      setDiscoveryStatus({
        [providerName]: {
          ok: false,
          message: error instanceof Error ? error.message : 'Failed to discover models',
        },
      })
    } finally {
      setRefreshingProvider(null)
    }
  }

  return (
    <section className="settings-card">
      {Object.entries(providers).map(([name, cfg]) => {
        const provider = (cfg ?? {}) as Record<string, unknown>
        const status = discoveryStatus[name]
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
            <div className="settings-row-wrap">
              <button
                type="button"
                className="settings-action-secondary"
                onClick={() => handleRefreshModels(name)}
                disabled={refreshingProvider === name}
              >
                {refreshingProvider === name ? 'Discovering...' : 'Discover Models'}
              </button>
              {status && (
                <span className={`settings-muted ${status.ok ? 'ok' : 'error'}`} style={{ marginLeft: '8px' }}>
                  {status.message}
                </span>
              )}
            </div>
          </div>
        )
      })}
      <button type="button" className="settings-action" onClick={onSave}>{t('Sauvegarder')}</button>
    </section>
  )
}

