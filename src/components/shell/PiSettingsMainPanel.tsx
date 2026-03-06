import { useMemo } from 'react'
import i18n from '@/lib/i18n'

import { CommandsSection } from '@/components/sidebar/settings/sections/CommandsSection'
import { DiagnosticsSection } from '@/components/sidebar/settings/sections/DiagnosticsSection'
import { BehaviorSection } from '@/components/sidebar/settings/sections/BehaviorSection'
import { GeneralSection } from '@/components/sidebar/settings/sections/GeneralSection'
import { LanguageSection } from '@/components/sidebar/settings/sections/LanguageSection'
import { ProvidersModelsSection } from '@/components/sidebar/settings/sections/ProvidersModelsSection'
import { SessionsSection } from '@/components/sidebar/settings/sections/SessionsSection'
import { SidebarSection } from '@/components/sidebar/settings/sections/SidebarSection'
import { useWorkspace } from '@/features/workspace/store'
import { usePiSettingsStore } from '@/features/workspace/pi-settings-store'
import { workspaceIpc } from '@/services/ipc/workspace'

export function PiSettingsMainPanel() {
  const { state, setNotice, openPiPath, updateSettings } = useWorkspace()
  const {
    activeSection,
    snapshot,
    settingsJson,
    setSettingsJson,
    modelsJson,
    setModelsJson,
    models,
    diagnostics,
    lastResult,
    refresh,
    saveSettings,
  } = usePiSettingsStore()

  const sessionDir = useMemo(() => String(settingsJson.sessionDir ?? ''), [settingsJson])

  const handleSaveSettings = async () => {
    const result = await saveSettings()
    if (!result.ok) {
      setNotice(result.message)
      return
    }
    setNotice('settings.json sauvegardé.')
    await refresh()
  }

  const handleSaveBehaviorSettings = async () => {
    await updateSettings(state.settings)
    setNotice('Paramètres de comportement sauvegardés.')
  }

  const handleLanguageChange = async (language: string) => {
    await i18n.changeLanguage(language)
    await workspaceIpc.updateLanguagePreference(language)
  }

  return (
    <div className="main-scroll">
      <section className="chat-section settings-main-wrap">
        {activeSection === 'general' ? (
          <GeneralSection settings={settingsJson} setSettings={setSettingsJson} onSave={handleSaveSettings} />
        ) : null}
        {activeSection === 'behavior' ? (
          <BehaviorSection settings={state.settings} setSettings={(next) => updateSettings(next)} onSave={handleSaveBehaviorSettings} />
        ) : null}
        {activeSection === 'sidebar' ? (
          <SidebarSection settings={state.settings} setSettings={(next) => updateSettings(next)} onSave={handleSaveBehaviorSettings} />
        ) : null}
        {activeSection === 'language' ? (
          <LanguageSection 
            currentLanguage={i18n.language}
            setLanguage={handleLanguageChange}
          />
        ) : null}
        {activeSection === 'providersModels' ? (
          <ProvidersModelsSection
            modelsJson={modelsJson}
            setModelsJson={setModelsJson}
            models={models}
            onToggleScope={async (model) => {
              const result = await workspaceIpc.setPiModelScoped(
                model.provider,
                model.id,
                !model.scoped,
              )
              if (!result.ok) {
                setNotice(result.message ?? 'Impossible de modifier le scope du modèle.')
                return
              }
              const scopedKeys = result.models.filter((item) => item.scoped).map((item) => item.key)
              setSettingsJson({ ...settingsJson, enabledModels: scopedKeys })
              await refresh()
            }}
          />
        ) : null}
        {activeSection === 'sessions' ? (
          <SessionsSection
            sessionDir={sessionDir}
            openSessions={() => {
              void openPiPath('sessions')
            }}
          />
        ) : null}
        {activeSection === 'commands' ? (
          <CommandsSection
            lastResult={lastResult}
          />
        ) : null}
        {activeSection === 'diagnostics' ? <DiagnosticsSection diagnostics={diagnostics} /> : null}
        {snapshot?.errors?.length ? <div className="settings-error">{snapshot.errors.join(' | ')}</div> : null}
      </section>
    </div>
  )
}
