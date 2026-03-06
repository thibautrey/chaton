import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { workspaceIpc } from '@/services/ipc/workspace'
import type {
  PiCommandAction,
  PiCommandResult,
  PiConfigSnapshot,
  PiDiagnostics,
  PiModelsJson,
  PiSettingsJson,
} from './types'

type SettingsSection = 'general' | 'behavior' | 'sidebar' | 'language' | 'providersModels' | 'sessions' | 'commands' | 'diagnostics'

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
  const REFRESH_TTL_MS = 30_000
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')
  const [snapshot, setSnapshot] = useState<PiConfigSnapshot | null>(null)
  const [settingsJson, setSettingsJson] = useState<PiSettingsJson>({})
  const [modelsJson, setModelsJson] = useState<PiModelsJson>({})
  const [models, setModels] = useState<Array<{ id: string; provider: string; key: string; scoped: boolean }>>([])
  const [diagnostics, setDiagnostics] = useState<PiDiagnostics | null>(null)
  const [lastResult, setLastResult] = useState<PiCommandResult | null>(null)
  const lastRefreshAtRef = useRef(0)
  const refreshInFlightRef = useRef(false)

  const refresh = async () => {
    if (refreshInFlightRef.current) {
      return
    }
    refreshInFlightRef.current = true
    try {
      const config = await workspaceIpc.getPiConfigSnapshot()
      setSnapshot(config)
      setSettingsJson((config.settings ?? {}) as PiSettingsJson)
      setModelsJson((config.models ?? {}) as PiModelsJson)

      const listRes = await workspaceIpc.listPiModels()
      if (listRes.ok) {
        setModels(
          listRes.models.map((model) => ({
            id: model.id,
            provider: model.provider,
            key: model.key,
            scoped: model.scoped,
          })),
        )
      } else {
        setModels([])
      }

      const commandRes = await workspaceIpc.runPiCommand('list-models')
      setLastResult(commandRes)

      const nextDiag = await workspaceIpc.getPiDiagnostics()
      setDiagnostics(nextDiag)
      lastRefreshAtRef.current = Date.now()
    } finally {
      refreshInFlightRef.current = false
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    if (activeSection !== 'providersModels') {
      return
    }
    const now = Date.now()
    if (now - lastRefreshAtRef.current < REFRESH_TTL_MS) {
      return
    }
    void refresh()
  }, [activeSection])

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
