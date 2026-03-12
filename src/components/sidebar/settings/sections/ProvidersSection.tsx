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
  const [testingProvider, setTestingProvider] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<Record<string, { ok: boolean; message?: string; latency?: number }>>({})

  const handleRefreshModels = async (providerName: string) => {
    setRefreshingProvider(providerName)
    setDiscoveryStatus({})
    try {
      const provider = (providers[providerName] ?? {}) as Record<string, unknown>
      const result = await workspaceIpc.discoverProviderModels(provider, providerName)
      
      if (result.ok && result.models.length > 0) {
        // Update models.json with discovered models
        const discoveredModelsList = result.models.map((model) => {
          const entry: Record<string, unknown> = { id: model.id }
          if (typeof model.contextWindow === 'number' && model.contextWindowSource === 'provider') {
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

  const handleTestConnection = async (providerName: string) => {
    setTestingProvider(providerName)
    setTestStatus({})
    try {
      const provider = (providers[providerName] ?? {}) as Record<string, unknown>
      const currentBaseUrl = typeof provider.baseUrl === 'string' ? provider.baseUrl.trim() : ''
      if (currentBaseUrl) {
        const resolved = await workspaceIpc.resolveProviderBaseUrl(currentBaseUrl)
        if (resolved.ok && resolved.baseUrl && resolved.baseUrl !== currentBaseUrl) {
          setModels({
            ...models,
            providers: {
              ...providers,
              [providerName]: {
                ...provider,
                baseUrl: resolved.baseUrl,
              },
            },
          })
        }
      }
      const result = await workspaceIpc.testProviderConnection(provider)
      
      setTestStatus({
        [providerName]: {
          ok: result.ok,
          message: result.message,
          latency: result.ok ? result.latency : (result as any).latency,
        },
      })
    } catch (error) {
      setTestStatus({
        [providerName]: {
          ok: false,
          message: error instanceof Error ? error.message : 'Failed to test connection',
        },
      })
    } finally {
      setTestingProvider(null)
    }
  }

  return (
    <section className="settings-card">
      {Object.entries(providers).map(([name, cfg]) => {
        const provider = (cfg ?? {}) as Record<string, unknown>
        const status = discoveryStatus[name]
        const connStatus = testStatus[name]
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
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="settings-action-secondary"
                  onClick={() => handleTestConnection(name)}
                  disabled={testingProvider === name || refreshingProvider === name}
                >
                  {testingProvider === name ? 'Testing...' : 'Ping'}
                </button>
                <button
                  type="button"
                  className="settings-action-secondary"
                  onClick={() => handleRefreshModels(name)}
                  disabled={refreshingProvider === name || testingProvider === name}
                >
                  {refreshingProvider === name ? 'Discovering...' : 'Discover Models'}
                </button>
              </div>
            </div>
            {connStatus && (
              <div style={{ marginTop: '8px' }}>
                <div className={`settings-muted ${connStatus.ok ? 'ok' : 'error'}`}>
                  <strong>Ping:</strong> {connStatus.message}
                  {connStatus.ok && connStatus.latency !== undefined && ` (${connStatus.latency}ms)`}
                </div>
              </div>
            )}
            {status && (
              <span className={`settings-muted ${status.ok ? 'ok' : 'error'}`} style={{ marginLeft: '0px', display: 'block', marginTop: '4px' }}>
                <strong>Models:</strong> {status.message}
              </span>
            )}
          </div>
        )
      })}
      <button type="button" className="settings-action" onClick={onSave}>{t('Sauvegarder')}</button>
    </section>
  )
}
