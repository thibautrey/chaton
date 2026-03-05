import { useMemo } from 'react'
import { useWorkspace } from '@/features/workspace/store'

export function TelemetryConsentCard() {
  const { state, updateSettings } = useWorkspace()

  const shouldShow = useMemo(
    () => state.settings.hasCompletedOnboarding && !state.settings.telemetryConsentAnswered,
    [state.settings.hasCompletedOnboarding, state.settings.telemetryConsentAnswered],
  )

  if (!shouldShow) {
    return null
  }

  return (
    <aside className="telemetry-consent-card" aria-live="polite">
      <p className="telemetry-consent-title">Improve Chatons</p>
      <p className="telemetry-consent-text">
        Allow anonymous logs and crash details to help us improve reliability.
      </p>
      <div className="telemetry-consent-actions">
        <button
          type="button"
          className="settings-action"
          onClick={() => {
            void updateSettings({
              ...state.settings,
              allowAnonymousTelemetry: false,
              telemetryConsentAnswered: true,
            })
          }}
        >
          No thanks
        </button>
        <button
          type="button"
          className="settings-action telemetry-consent-accept"
          onClick={() => {
            void updateSettings({
              ...state.settings,
              allowAnonymousTelemetry: true,
              telemetryConsentAnswered: true,
            })
          }}
        >
          Allow
        </button>
      </div>
    </aside>
  )
}
