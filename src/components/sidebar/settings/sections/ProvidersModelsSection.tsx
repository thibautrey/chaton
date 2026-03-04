import { Plus, Star, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { SecretInput } from '@/components/sidebar/settings/SecretInput'
import type { PiModelsJson, PiSettingsJson } from '@/features/workspace/types'

type PiModel = { id: string; provider: string; key: string; scoped: boolean }
type ProviderConfig = { api?: string; baseUrl?: string; apiKey?: string; [key: string]: unknown }

const KNOWN_PROVIDER_ICON: Record<string, string> = {
  openai: 'https://www.google.com/s2/favicons?sz=64&domain=openai.com',
  anthropic: 'https://www.google.com/s2/favicons?sz=64&domain=anthropic.com',
  google: 'https://www.google.com/s2/favicons?sz=64&domain=ai.google.dev',
  gemini: 'https://www.google.com/s2/favicons?sz=64&domain=ai.google.dev',
  mistral: 'https://www.google.com/s2/favicons?sz=64&domain=mistral.ai',
  groq: 'https://www.google.com/s2/favicons?sz=64&domain=groq.com',
  xai: 'https://www.google.com/s2/favicons?sz=64&domain=x.ai',
  perplexity: 'https://www.google.com/s2/favicons?sz=64&domain=perplexity.ai',
  deepseek: 'https://www.google.com/s2/favicons?sz=64&domain=deepseek.com',
  together: 'https://www.google.com/s2/favicons?sz=64&domain=together.ai',
  ollama: 'https://www.google.com/s2/favicons?sz=64&domain=ollama.com',
  openrouter: 'https://www.google.com/s2/favicons?sz=64&domain=openrouter.ai',
}

function normalizeProviderName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '-')
}

function emptyProviderConfig(): ProviderConfig {
  return { api: '', baseUrl: '', apiKey: '' }
}

export function ProvidersModelsSection({
  settings,
  setSettings,
  modelsJson,
  setModelsJson,
  models,
  onToggleScope,
  onSaveAll,
}: {
  settings: PiSettingsJson
  setSettings: (next: PiSettingsJson) => void
  modelsJson: PiModelsJson
  setModelsJson: (next: PiModelsJson) => void
  models: PiModel[]
  onToggleScope: (provider: string, id: string, scoped: boolean) => void
  onSaveAll: () => void
}) {
  const [newProvider, setNewProvider] = useState('')
  const [newModelProvider, setNewModelProvider] = useState('')
  const [newModelId, setNewModelId] = useState('')

  const providers = ((modelsJson.providers ?? {}) as Record<string, ProviderConfig>)
  const providerNames = useMemo(
    () => Array.from(new Set([...Object.keys(providers), ...models.map((m) => m.provider)])).sort((a, b) => a.localeCompare(b)),
    [providers, models],
  )
  const enabled = Array.isArray(settings.enabledModels) ? settings.enabledModels.filter((x): x is string => typeof x === 'string') : []

  return (
    <section className="settings-card settings-pm-shell">
      <div className="settings-pm-topbar">
        <div className="settings-pm-inline-form">
          <input
            className="settings-input"
            placeholder="Nouveau provider (ex: openai-codex)"
            value={newProvider}
            onChange={(e) => setNewProvider(e.target.value)}
          />
          <button
            type="button"
            className="settings-action settings-pm-btn-primary"
            onClick={() => {
              const key = normalizeProviderName(newProvider)
              if (!key || providers[key]) return
              setModelsJson({
                ...modelsJson,
                providers: { ...providers, [key]: emptyProviderConfig() },
              })
              setNewProvider('')
            }}
          >
            <Plus className="h-4 w-4" /> Ajouter provider
          </button>
        </div>
        <button type="button" className="settings-action settings-pm-btn-primary" onClick={onSaveAll}>
          Sauvegarder
        </button>
      </div>

      <div className="settings-pm-grid">
        {providerNames.map((name) => {
          const provider = (providers[name] ?? emptyProviderConfig()) as ProviderConfig
          const providerModels = models.filter((model) => model.provider === name)
          const iconSrc = KNOWN_PROVIDER_ICON[normalizeProviderName(name)]
          const scopedCount = providerModels.filter((model) => model.scoped).length
          return (
            <div key={name} className="settings-pm-card">
              <div className="settings-provider-head settings-pm-card-head">
                <div className="settings-provider-brand">
                  {iconSrc ? (
                    <img src={iconSrc} alt="" className="settings-provider-favicon" loading="lazy" />
                  ) : (
                    <div className="settings-provider-fallback">{name.slice(0, 1).toUpperCase()}</div>
                  )}
                  <div>
                    <div className="settings-pm-provider-name">{name}</div>
                    <div className="settings-muted">{scopedCount}/{providerModels.length} dans le scope</div>
                  </div>
                </div>
                <button
                  type="button"
                  className="settings-icon-action"
                  onClick={() => {
                    const nextProviders = { ...providers }
                    delete nextProviders[name]
                    setModelsJson({ ...modelsJson, providers: nextProviders })
                  }}
                  title="Supprimer provider"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="settings-pm-form">
                <label className="settings-row-wrap">
                  <span className="settings-label">api</span>
                  <input
                    className="settings-input"
                    value={String(provider.api ?? '')}
                    onChange={(e) =>
                      setModelsJson({
                        ...modelsJson,
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
                      setModelsJson({
                        ...modelsJson,
                        providers: { ...providers, [name]: { ...provider, baseUrl: e.target.value } },
                      })
                    }
                  />
                </label>
                <SecretInput
                  label="apiKey"
                  onApply={(value) =>
                    setModelsJson({
                      ...modelsJson,
                      providers: { ...providers, [name]: { ...provider, apiKey: value } },
                    })
                  }
                />
              </div>

              <div className="settings-list settings-pm-models">
                {providerModels.map((model) => (
                  <div key={model.key} className="settings-list-row settings-pm-model-row">
                    <span className="settings-mono">{model.id}</span>
                    <button
                      type="button"
                      className={`settings-icon-action ${model.scoped ? 'settings-pm-star-active' : ''}`}
                      onClick={() => onToggleScope(model.provider, model.id, model.scoped)}
                    >
                      <Star className={`h-4 w-4 ${model.scoped ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                ))}
                {!providerModels.length ? <div className="settings-muted">Aucun modèle détecté via `pi --list-models`.</div> : null}
              </div>
            </div>
          )
        })}
      </div>

      <div className="settings-pm-footer">
        <div className="settings-actions-grid">
          <select className="settings-input" value={newModelProvider} onChange={(e) => setNewModelProvider(e.target.value)}>
            <option value="">Provider du modèle</option>
            {providerNames.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
          <input
            className="settings-input"
            placeholder="ID modèle (ex: gpt-5.3-codex)"
            value={newModelId}
            onChange={(e) => setNewModelId(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="settings-action settings-pm-btn-primary"
          onClick={() => {
            const provider = normalizeProviderName(newModelProvider)
            const id = newModelId.trim()
            if (!provider || !id) return
            const next = Array.isArray(settings.enabledModels) ? [...settings.enabledModels] : []
            const key = `${provider}/${id}`
            if (!next.includes(key)) next.push(key)
            setSettings({ ...settings, enabledModels: next })
            setNewModelId('')
          }}
        >
          <Plus className="h-4 w-4" /> Ajouter au scope
        </button>
        <label className="settings-row-wrap">
          <span className="settings-label">enabledModels (CSV)</span>
          <input
            className="settings-input settings-mono"
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
      </div>
    </section>
  )
}
