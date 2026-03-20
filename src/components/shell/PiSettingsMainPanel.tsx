import { AppearanceSection } from '@/components/sidebar/settings/sections/AppearanceSection'
import { BehaviorSection } from '@/components/sidebar/settings/sections/BehaviorSection'
import { ModelsSection } from '@/components/sidebar/settings/sections/ModelsSection'
import { CloudSection } from '@/components/sidebar/settings/sections/CloudSection'
import { AdvancedSection } from '@/components/sidebar/settings/sections/AdvancedSection'
import { useWorkspace } from '@/features/workspace/store'
import { usePiSettingsStore } from '@/features/workspace/pi-settings-store'

export function PiSettingsMainPanel() {
  const { state, setNotice, openPiPath, updateSettings, connectCloudInstance, refreshCloudAccount, updateCloudUser } = useWorkspace()
  const {
    activeSection,
    settingsJson,
    setSettingsJson,
    modelsJson,
    setModelsJson,
    diagnostics,
    lastResult,
    saveSettings,
    refresh,
  } = usePiSettingsStore()

  const handleSaveSettingsJson = async () => {
    const result = await saveSettings()
    if (!result.ok) {
      setNotice(result.message)
      return
    }
    setNotice('settings.json sauvegardé.')
    await refresh()
  }

  const handleSaveSidebarSettings = async () => {
    await updateSettings(state.settings)
    setNotice('Paramètres sauvegardés.')
  }

  return (
    <div className="main-scroll">
      <section className="chat-section settings-main-wrap">
        {/* Apparence */}
        {activeSection === 'appearance' && (
          <AppearanceSection
            settingsJson={settingsJson}
            sidebarSettings={state.settings}
            setSettingsJson={setSettingsJson}
            setSidebarSettings={(next) => updateSettings(next)}
            onSaveSettingsJson={handleSaveSettingsJson}
            onSaveSidebar={handleSaveSidebarSettings}
          />
        )}

        {/* Comportement */}
        {activeSection === 'behavior' && (
          <BehaviorSection
            settings={state.settings}
            setSettings={(next) => updateSettings(next)}
            onSave={handleSaveSidebarSettings}
          />
        )}

        {/* Modèles */}
        {activeSection === 'models' && (
          <ModelsSection
            modelsJson={modelsJson}
            setModelsJson={setModelsJson}
            onProviderConnected={() => {
              void refresh()
            }}
          />
        )}

        {activeSection === 'cloud' && (
          <CloudSection
            state={state}
            onConnect={connectCloudInstance}
            onRefresh={refreshCloudAccount}
            onUpdateUser={updateCloudUser}
          />
        )}

        {/* Audio */}
        {activeSection === 'audio' && (
          <AudioSectionWrapper
            settings={state.settings}
            setSettings={(next) => updateSettings(next)}
            onSave={handleSaveSidebarSettings}
          />
        )}

        {/* Sessions */}
        {activeSection === 'sessions' && (
          <SessionsSectionWrapper
            sessionDir={String(settingsJson.sessionDir ?? '')}
            onOpenSessions={() => {
              void openPiPath('sessions')
            }}
          />
        )}

        {/* Avancé */}
        {activeSection === 'advanced' && (
          <AdvancedSection
            lastResult={lastResult}
            diagnostics={diagnostics}
          />
        )}
      </section>
    </div>
  )
}

// Wrapper components to maintain compatibility with existing sections
import { AudioSection } from '@/components/sidebar/settings/sections/AudioSection'
import type { SidebarSettings } from '@/features/workspace/types'

function AudioSectionWrapper({
  settings,
  setSettings,
  onSave,
}: {
  settings: SidebarSettings
  setSettings: (next: SidebarSettings) => void
  onSave: () => void
}) {
  return <AudioSection settings={settings} setSettings={setSettings} onSave={onSave} />
}

import { useTranslation } from 'react-i18next'

function SessionsSectionWrapper({
  sessionDir,
  onOpenSessions,
}: {
  sessionDir: string
  onOpenSessions: () => void
}) {
  const { t } = useTranslation()

  return (
    <section className="settings-card">
      <h3 className="settings-card-title">{t('Sessions')}</h3>
      <div className="settings-card-note">
        {t('Session dir')}:{' '}
        <span className="settings-mono">{sessionDir || t('Local sessions')}</span>
      </div>
      <div className="settings-actions-row">
        <button type="button" className="settings-action" onClick={onOpenSessions}>
          {t('Ouvrir dossier sessions')}
        </button>
      </div>
    </section>
  )
}
