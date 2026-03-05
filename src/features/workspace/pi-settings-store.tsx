import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react'

import { workspaceIpc } from '@/services/ipc/workspace'
import type {
  PiCommandAction,
  PiCommandResult,
  PiConfigSnapshot,
  PiDiagnostics,
  PiModelsJson,
  PiSettingsJson,
} from './types'

type SettingsSection = 'general' | 'behavior' | 'language' | 'providersModels' | 'sessions' | 'commands' | 'diagnostics'

type PiSettingsContextValue = {
  activeSection: SettingsSection
  setActiveSection: (section: SettingsSection) => void
  snapshot: PiConfigSnapshot | null
  settingsJson: PiSettingsJson
  setSettingsJson: (next: PiSettingsJson) => void
  modelsJson: PiModelsJson
  setModelsJson: (next: PiModelsJson) => void
  models: Array<{ id: string; provider: string; key: string; scoped: boolean }>
  diagnostics: PiDiagnostics | null
  lastResult: PiCommandResult | null
  setLastResult: (result: PiCommandResult | null) => void
  refresh: () => Promise<void>
  saveSettings: () => Promise<{ ok: true } | { ok: false; message: string }>
  saveModels: () => Promise<{ ok: true } | { ok: false; message: string }>
  runCommand: (action: PiCommandAction, params?: { search?: string; source?: string; local?: boolean }) => Promise<PiCommandResult>
}

const PiSettingsContext = createContext<PiSettingsContextValue | null>(null)

export function PiSettingsProvider({ children }: PropsWithChildren) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')
  const [snapshot, setSnapshot] = useState<PiConfigSnapshot | null>(null)
  const [settingsJson, setSettingsJson] = useState<PiSettingsJson>({})
  const [modelsJson, setModelsJson] = useState<PiModelsJson>({})
  const [models, setModels] = useState<Array<{ id: string; provider: string; key: string; scoped: boolean }>>([])
  const [diagnostics, setDiagnostics] = useState<PiDiagnostics | null>(null)
  const [lastResult, setLastResult] = useState<PiCommandResult | null>(null)

  const refresh = async () => {
    const config = await workspaceIpc.getPiConfigSnapshot()
    setSnapshot(config)
    setSettingsJson((config.settings ?? {}) as PiSettingsJson)
    setModelsJson((config.models ?? {}) as PiModelsJson)

    const listRes = await workspaceIpc.runPiCommand('list-models')
    setLastResult(listRes)
    if (listRes.ok) {
      const rows = listRes.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('provider'))
        .map((line) => {
          const parts = line.split(/\s{2,}/)
          const provider = parts[0]
          const id = parts[1]
          const key = `${provider}/${id}`
          const enabled = Array.isArray((config.settings ?? {}).enabledModels)
            ? ((config.settings ?? {}).enabledModels as unknown[]).includes(key)
            : false
          return { provider, id, key, scoped: enabled }
        })
      setModels(rows)
    }

    const nextDiag = await workspaceIpc.getPiDiagnostics()
    setDiagnostics(nextDiag)
  }

  useEffect(() => {
    void refresh()
  }, [])

  const value = useMemo<PiSettingsContextValue>(
    () => ({
      activeSection,
      setActiveSection,
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
      saveSettings: () => workspaceIpc.updatePiSettingsJson(settingsJson as Record<string, unknown>),
      saveModels: () => workspaceIpc.updatePiModelsJson(modelsJson as Record<string, unknown>),
      runCommand: (action, params) => workspaceIpc.runPiCommand(action, params),
    }),
    [activeSection, snapshot, settingsJson, modelsJson, models, diagnostics, lastResult],
  )

  return <PiSettingsContext.Provider value={value}>{children}</PiSettingsContext.Provider>
}

export function usePiSettingsStore() {
  const context = useContext(PiSettingsContext)
  if (!context) {
    throw new Error('usePiSettingsStore must be used within PiSettingsProvider')
  }
  return context
}
