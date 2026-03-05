import type { PiSettingsJson } from '@/features/workspace/types'
import { useTranslation } from 'react-i18next'

type Props = {
  settings: PiSettingsJson
  models: Array<{ id: string; provider: string; key: string; scoped: boolean }>
  setSettings: (next: PiSettingsJson) => void
  onSave: () => void
}

function setPath(obj: PiSettingsJson, path: string[], value: unknown) {
  const next: PiSettingsJson = { ...obj }
  let node: Record<string, unknown> = next
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i]
    const current = node[key]
    node[key] = current && typeof current === 'object' && !Array.isArray(current) ? { ...(current as Record<string, unknown>) } : {}
    node = node[key] as Record<string, unknown>
  }
  node[path[path.length - 1]] = value
  return next
}

// const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
// const STEERING_MODES = ['one-at-a-time', 'all'] as const
// const DOUBLE_ESCAPE_ACTIONS = ['tree', 'fork', 'none'] as const
const THEMES = ['system', 'light', 'dark'] as const

export function GeneralSection({ settings, models, setSettings, onSave }: Props) {
  const { t } = useTranslation()
  const providerOptions = Array.from(new Set(models.map((model) => model.provider))).sort((a, b) => a.localeCompare(b))
  const selectedProvider = String(settings.defaultProvider ?? providerOptions[0] ?? '')
  const modelOptions = models
    .filter((model) => model.provider === selectedProvider)
    .map((model) => model.id)
    .sort((a, b) => a.localeCompare(b))

  // const textFields: Array<{ key: string; value: string }> = []
  // const boolFields: Array<{ key: string; value: boolean }> = [
  //   { key: 'hideThinkingBlock', value: Boolean(settings.hideThinkingBlock) },
  //   { key: 'quietStartup', value: Boolean(settings.quietStartup) },
  //   { key: 'collapseChangelog', value: Boolean(settings.collapseChangelog) },
  // ]

  return (
    <section className="settings-card">
      <div className="settings-grid">
        {/* <label className="settings-row-wrap">
          <span className="settings-label">defaultProvider</span>
          <select
            className="settings-input"
            value={selectedProvider}
            onChange={(e) => {
              const provider = e.target.value
              const firstModel = models.find((model) => model.provider === provider)?.id ?? ''
              setSettings({ ...settings, defaultProvider: provider, defaultModel: firstModel })
            }}
          >
            {providerOptions.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-row-wrap">
          <span className="settings-label">defaultModel</span>
          <select
            className="settings-input"
            value={String(settings.defaultModel ?? modelOptions[0] ?? '')}
            onChange={(e) => setSettings({ ...settings, defaultModel: e.target.value })}
          >
            {modelOptions.map((modelId) => (
              <option key={modelId} value={modelId}>
                {modelId}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-row-wrap">
          <span className="settings-label">defaultThinkingLevel</span>
          <select
            className="settings-input"
            value={String(settings.defaultThinkingLevel ?? 'off')}
            onChange={(e) => setSettings({ ...settings, defaultThinkingLevel: e.target.value })}
          >
            {THINKING_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-row-wrap">
          <span className="settings-label">steeringMode</span>
          <select
            className="settings-input"
            value={String(settings.steeringMode ?? 'one-at-a-time')}
            onChange={(e) => setSettings({ ...settings, steeringMode: e.target.value })}
          >
            {STEERING_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-row-wrap">
          <span className="settings-label">doubleEscapeAction</span>
          <select
            className="settings-input"
            value={String(settings.doubleEscapeAction ?? 'tree')}
            onChange={(e) => setSettings({ ...settings, doubleEscapeAction: e.target.value })}
          >
            {DOUBLE_ESCAPE_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label> */}
        <label className="settings-row-wrap">
          <span className="settings-label">theme</span>
          <select
            className="settings-input"
            value={String(settings.theme ?? 'system')}
            onChange={(e) => setSettings({ ...settings, theme: e.target.value })}
          >
            {THEMES.map((theme) => (
              <option key={theme} value={theme}>
                {theme}
              </option>
            ))}
          </select>
        </label>
        {/* {textFields.map(({ key, value }) => (
          <label key={key} className="settings-row-wrap">
            <span className="settings-label">{key}</span>
            <input className="settings-input" value={value} onChange={(e) => setSettings({ ...settings, [key]: e.target.value })} />
          </label>
        ))}
        {boolFields.map(({ key, value }) => (
          <label key={key} className="settings-toggle-row">
            <span className="settings-label">{key}</span>
            <input
              type="checkbox"
              checked={value as boolean}
              onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })}
            />
          </label>
        ))}
        <label className="settings-toggle-row">
          <span className="settings-label">terminal.clearOnShrink</span>
          <input
            type="checkbox"
            checked={Boolean((settings.terminal as { clearOnShrink?: boolean } | undefined)?.clearOnShrink)}
            onChange={(e) => setSettings(setPath(settings, ['terminal', 'clearOnShrink'], e.target.checked))}
          />
        </label>
        <label className="settings-toggle-row">
          <span className="settings-label">gpuStatus.enabled</span>
          <input
            type="checkbox"
            checked={Boolean((settings.gpuStatus as { enabled?: boolean } | undefined)?.enabled)}
            onChange={(e) => setSettings(setPath(settings, ['gpuStatus', 'enabled'], e.target.checked))}
          />
        </label>
        <label className="settings-row-wrap">
          <span className="settings-label">gpuStatus.ssh</span>
          <input
            className="settings-input"
            value={String((settings.gpuStatus as { ssh?: string } | undefined)?.ssh ?? '')}
            onChange={(e) => setSettings(setPath(settings, ['gpuStatus', 'ssh'], e.target.value))}
          />
        </label> */}
      </div>
      <button type="button" className="settings-action" onClick={onSave}>{t('Sauvegarder')}</button>
    </section>
  )
}
