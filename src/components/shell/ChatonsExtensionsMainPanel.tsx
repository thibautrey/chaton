import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { ChatonsExtension } from '@/features/workspace/types'
import { useWorkspace } from '@/features/workspace/store'
import { workspaceIpc } from '@/services/ipc/workspace'

export function ChatonsExtensionsMainPanel() {
  const { t } = useTranslation()
  const { setNotice } = useWorkspace()
  const [extensions, setExtensions] = useState<ChatonsExtension[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [logsById, setLogsById] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const result = await workspaceIpc.listExtensions()
    setExtensions(result.extensions ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleToggle = async (item: ChatonsExtension) => {
    setBusyId(item.id)
    const result = await workspaceIpc.toggleExtension(item.id, !item.enabled)
    if (!result.ok) {
      setNotice(result.message ?? 'Impossible de changer le statut de l’extension.')
      setBusyId(null)
      return
    }
    await load()
    setBusyId(null)
  }

  const handleRepair = async (item: ChatonsExtension) => {
    setBusyId(item.id)
    await workspaceIpc.runExtensionHealthCheck()
    await load()
    setNotice(`Health check exécuté pour ${item.name}.`)
    setBusyId(null)
  }

  const handleShowLogs = async (item: ChatonsExtension) => {
    const result = await workspaceIpc.getExtensionLogs(item.id)
    setLogsById((prev) => ({ ...prev, [item.id]: result.content ?? '' }))
  }

  const handleRemove = async (item: ChatonsExtension) => {
    setBusyId(item.id)
    const result = await workspaceIpc.removeExtension(item.id)
    if (!result.ok) {
      setNotice(result.message ?? 'Impossible de supprimer cette extension.')
      setBusyId(null)
      return
    }
    await load()
    setBusyId(null)
  }

  const catalog = useMemo(
    () => [
      {
        id: 'qwen-schema-sanitizer',
        name: 'Qwen Schema Sanitizer',
        description: 'Patch runtime Pi pour corriger la conversion JSON schema avec Qwen/LiteLLM.',
      },
    ],
    [],
  )

  const installedIds = new Set(extensions.map((extension) => extension.id))

  return (
    <div className="main-scroll">
      <section className="chat-section settings-main-wrap">
        <header className="skills-header">
          <p className="skills-subtitle">Gérez les extensions runtime Chatons (hooks avant lancement Pi).</p>
        </header>

        <div className="skills-section-head">Installées</div>
        {loading ? <div className="settings-card-note">Chargement des extensions...</div> : null}
        {!loading && extensions.length === 0 ? <div className="settings-card-note">{t('Aucune extension installée.')}</div> : null}
        <div className="skills-grid">
          {extensions.map((extension) => {
            const pending = busyId === extension.id
            return (
              <article key={extension.id} className="settings-card">
                <div className="settings-card-title">{extension.name}</div>
                <div className="settings-card-note">{extension.description}</div>
                <div className="settings-card-note">ID: {extension.id}</div>
                <div className="settings-card-note">Version: {extension.version}</div>
                <div className="settings-card-note">Health: {extension.health}</div>
                {extension.lastRunStatus ? <div className="settings-card-note">Dernier run: {extension.lastRunStatus}</div> : null}
                {extension.lastError ? <div className="settings-error">{extension.lastError}</div> : null}

                <div className="settings-actions-row">
                  <button type="button" className="settings-action" disabled={pending} onClick={() => void handleToggle(extension)}>
                    {extension.enabled ? 'Désactiver' : 'Activer'}
                  </button>
                  <button type="button" className="settings-action" disabled={pending} onClick={() => void handleRepair(extension)}>
                    Réparer
                  </button>
                  <button type="button" className="settings-action" onClick={() => void handleShowLogs(extension)}>
                    Voir logs
                  </button>
                  {extension.installSource !== 'builtin' ? (
                    <button type="button" className="settings-action" disabled={pending} onClick={() => void handleRemove(extension)}>
                      {t('Supprimer')}
                    </button>
                  ) : null}
                </div>

                {logsById[extension.id] ? <pre className="settings-card-note">{logsById[extension.id]}</pre> : null}
              </article>
            )
          })}
        </div>

        <div className="skills-section-head">Catalogue (builtin MVP)</div>
        <div className="skills-grid">
          {catalog.map((item) => (
            <article key={item.id} className="settings-card">
              <div className="settings-card-title">{item.name}</div>
              <div className="settings-card-note">{item.description}</div>
              <div className="settings-card-note">ID: {item.id}</div>
              <div className="settings-actions-row">
                <button
                  type="button"
                  className="settings-action"
                  disabled={installedIds.has(item.id)}
                  onClick={async () => {
                    const result = await workspaceIpc.installExtension(item.id)
                    if (!result.ok) {
                      setNotice(result.message ?? 'Installation impossible.')
                      return
                    }
                    setNotice(`${item.name} installée.`)
                    await load()
                  }}
                >
                  {installedIds.has(item.id) ? 'Installée' : 'Installer'}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
