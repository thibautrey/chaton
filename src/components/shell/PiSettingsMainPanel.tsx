import { useMemo } from 'react'
import i18n from '@/lib/i18n'

import { CommandsSection } from '@/components/sidebar/settings/sections/CommandsSection'
import { DiagnosticsSection } from '@/components/sidebar/settings/sections/DiagnosticsSection'
import { BehaviorSection } from '@/components/sidebar/settings/sections/BehaviorSection'
import { GeneralSection } from '@/components/sidebar/settings/sections/GeneralSection'
import { LanguageSection } from '@/components/sidebar/settings/sections/LanguageSection'
import { PackagesSection } from '@/components/sidebar/settings/sections/PackagesSection'
import { ProvidersModelsSection } from '@/components/sidebar/settings/sections/ProvidersModelsSection'
import { SessionsSection } from '@/components/sidebar/settings/sections/SessionsSection'
import { ToolsSection } from '@/components/sidebar/settings/sections/ToolsSection'
import { useWorkspace } from '@/features/workspace/store'
import { usePiSettingsStore } from '@/features/workspace/pi-settings-store'
import { workspaceIpc } from '@/services/ipc/workspace'

export function PiSettingsMainPanel() {
  const { setNotice, openPiPath, exportPiSessionHtml } = useWorkspace()
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
    setLastResult,
    refresh,
    saveSettings,
    runCommand,
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

  const handleLanguageChange = async (language: string) => {
    await i18n.changeLanguage(language)
    await workspaceIpc.updateLanguagePreference(language)
  }

  return (
    <div className="main-scroll">
      <section className="chat-section settings-main-wrap">
        {activeSection === 'general' ? (
          <GeneralSection settings={settingsJson} models={models} setSettings={setSettingsJson} onSave={handleSaveSettings} />
        ) : null}
        {activeSection === 'behavior' ? (
          <BehaviorSection settings={settingsJson} setSettings={setSettingsJson} onSave={handleSaveSettings} />
        ) : null}
        {activeSection === 'language' ? (
          <LanguageSection 
            currentLanguage={i18n.language}
            setLanguage={handleLanguageChange}
          />
        ) : null}
        {activeSection === 'providersModels' ? (
          <ProvidersModelsSection
            settings={settingsJson}
            setSettings={setSettingsJson}
            modelsJson={modelsJson}
            setModelsJson={setModelsJson}
            models={models}
            onToggleScope={async (provider, id, scoped) => {
              const result = await workspaceIpc.setPiModelScoped(provider, id, !scoped)
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
        {activeSection === 'packages' ? <PackagesSection settings={settingsJson} setSettings={setSettingsJson} onSave={handleSaveSettings} /> : null}
        {activeSection === 'tools' ? <ToolsSection settings={settingsJson} setSettings={setSettingsJson} onSave={handleSaveSettings} /> : null}
        {activeSection === 'sessions' ? (
          <SessionsSection
            sessionDir={sessionDir}
            openSessions={() => {
              void openPiPath('sessions')
            }}
            exportSession={(session, output) => {
              void exportPiSessionHtml(session, output).then((result) => setLastResult(result))
            }}
          />
        ) : null}
        {activeSection === 'commands' ? (
          <CommandsSection
            lastResult={lastResult}
            onRun={(action, params) => {
              void runCommand(action, params).then((result) => setLastResult(result))
            }}
          />
        ) : null}
        {activeSection === 'diagnostics' ? <DiagnosticsSection diagnostics={diagnostics} onRefresh={() => void refresh()} /> : null}
        {snapshot?.errors?.length ? <div className="settings-error">{snapshot.errors.join(' | ')}</div> : null}
      </section>
    </div>
  )
}
