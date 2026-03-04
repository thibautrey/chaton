import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { ChatonsExtension, ChatonsExtensionCatalogItem } from '@/features/workspace/types'
import { useWorkspace } from '@/features/workspace/store'
import { workspaceIpc } from '@/services/ipc/workspace'

export function ChatonsExtensionsMainPanel() {
  const { t } = useTranslation()
  const { setNotice } = useWorkspace()
  const [extensions, setExtensions] = useState<ChatonsExtension[]>([])
  const [catalog, setCatalog] = useState<ChatonsExtensionCatalogItem[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [logsById, setLogsById] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const [installedResult, catalogResult] = await Promise.all([
      workspaceIpc.listExtensions(),
      workspaceIpc.listExtensionCatalog(),
    ])
    setExtensions(installedResult.extensions ?? [])
    setCatalog(catalogResult.entries ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleToggle = async (item: ChatonsExtension) => {
    setBusyId(item.id)
    const result = await workspaceIpc.toggleExtension(item.id, !item.enabled)
    if (!result.ok) {
      setNotice(result.message ?? t('Impossible de changer le statut de l’extension.'))
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
    setNotice(t('Health check exécuté pour {{name}}.', { name: item.name }))
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
      setNotice(result.message ?? t('Impossible de supprimer cette extension.'))
      setBusyId(null)
      return
    }
    await load()
    setBusyId(null)
  }

  const handleInstall = async (item: ChatonsExtensionCatalogItem) => {
    setBusyId(item.id)
    const result = await workspaceIpc.installExtension(item.id)
    if (!result.ok) {
      setNotice(result.message ?? t('Installation impossible.'))
      setBusyId(null)
      return
    }
    setNotice(t('{{name}} installée.', { name: item.name }))
    await load()
    setBusyId(null)
  }

  const handleRestart = async () => {
    await workspaceIpc.restartAppForExtension()
  }

  const installedIds = new Set(extensions.map((extension) => extension.id))
  const discoverItems = useMemo(() => {
    const base = catalog.filter((item) => !installedIds.has(item.id))
    const normalized = query.trim().toLowerCase()
    return base.filter((item) => {
      if (!normalized) return true
      const haystack = `${item.name} ${item.id} ${item.description}`.toLowerCase()
      return haystack.includes(normalized)
    })
  }, [catalog, installedIds, query])
  const installedItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return extensions.filter((item) => {
      if (!normalized) return true
      const haystack = `${item.name} ${item.id} ${item.description}`.toLowerCase()
      return haystack.includes(normalized)
    })
  }, [extensions, query])
  const discoverHighlighted = discoverItems.slice(0, 4)
  const discoverPopular = discoverItems.slice(4)
  const gridClass = 'grid grid-cols-1 gap-4 md:grid-cols-2'

  return (
    <div className="main-scroll">
      <section className="chat-section settings-main-wrap">
        <header className="mb-6">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-4xl font-semibold tracking-[-0.02em] dark:text-[#eef2fb]">{t('Extensions')}</h1>
            <button
              type="button"
              className="settings-action open-folder-button"
              onClick={async () => {
                const result = await workspaceIpc.openExtensionsFolder()
                if (!result.ok) {
                  setNotice(result.message ?? t("Impossible d'ouvrir le dossier des extensions."))
                }
              }}
              title={t('Ouvrir le dossier des extensions')}
            >
              {t('📁 Ouvrir le dossier')}
            </button>
          </div>
          <p className="mt-1 text-xl dark:text-[#a6b2c9]">{t('Parcourez la bibliothèque d’extensions.')}</p>
        </header>

        <div className="mb-6">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('Filtrer par nom, package ou description...')}
            className="w-full rounded-2xl border border-[#e6cdc5] bg-white dark:border-[#2a3345] dark:bg-[#0f1520] px-4 py-3 text-xl text-[#4b4d55] dark:text-[#e4eaf8] placeholder:text-[#a4a6ae] dark:placeholder:text-[#9aa5ba]"
          />
        </div>

        <div className="mb-3 text-2xl font-semibold dark:text-[#eaf0fc]">{t('Installées')}</div>
        {!loading && installedItems.length === 0 ? <div className="settings-card-note">{t('Aucune extension installée.')}</div> : null}
        <div className={gridClass}>
          {installedItems.map((extension) => {
            const pending = busyId === extension.id
            const requiresRestart = extension.config?.requiresRestart === true
            return (
              <article key={extension.id} className="settings-card">
                <div className="text-2xl font-semibold leading-tight dark:text-[#eaf0fc]">{extension.name}</div>
                <div className="text-lg dark:text-[#a6b2c9]">{extension.description}</div>
                <div className="settings-card-note">{t('ID')}: {extension.id}</div>
                <div className="settings-card-note">{t('Version')}: {extension.version}</div>
                <div className="settings-card-note">{t('Health')}: {extension.health}</div>
                <div className="settings-card-note">{t('Sandbox: activée')}</div>
                {extension.lastRunStatus ? <div className="settings-card-note">{t('Dernier run')}: {extension.lastRunStatus}</div> : null}
                {extension.lastError ? <div className="settings-error">{extension.lastError}</div> : null}

                <div className="settings-actions-row">
                  <button type="button" className="settings-action" disabled={pending} onClick={() => void handleToggle(extension)}>
                    {extension.enabled ? t('Désactiver') : t('Activer')}
                  </button>
                  <button type="button" className="settings-action" disabled={pending} onClick={() => void handleRepair(extension)}>
                    {t('Réparer')}
                  </button>
                  <button type="button" className="settings-action" onClick={() => void handleShowLogs(extension)}>
                    {t('Voir logs')}
                  </button>
                  {extension.installSource !== 'builtin' ? (
                    <button type="button" className="settings-action" disabled={pending} onClick={() => void handleRemove(extension)}>
                      {t('Supprimer')}
                    </button>
                  ) : null}
                  {requiresRestart ? (
                    <button type="button" className="settings-action" onClick={() => void handleRestart()}>
                      {t('Relancer Chatons')}
                    </button>
                  ) : null}
                </div>

                {logsById[extension.id] ? <pre className="settings-card-note">{logsById[extension.id]}</pre> : null}
              </article>
            )
          })}
        </div>

        <div className="mt-8 mb-2 text-2xl font-semibold dark:text-[#eaf0fc]">{t('Extensions mises en avant')}</div>
        {discoverHighlighted.length === 0 && !loading ? (
          <div className="settings-card-note">{t('Aucune extension trouvée dans le scope npm @chaton/*.')}</div>
        ) : null}
        <div className={gridClass}>
          {discoverHighlighted.map((item) => (
            <article key={item.id} className="settings-card">
              <div className="inline-flex rounded-full bg-[#d7ebe6] dark:bg-[#1a2740] px-3 py-1 text-sm font-semibold text-[#257466] dark:text-[#c8d3ea]">{t('Extension')}</div>
              <div className="text-2xl font-semibold leading-tight dark:text-[#eaf0fc]">{item.name}</div>
              <div className="text-lg dark:text-[#a6b2c9]">{item.description}</div>
              <div className="settings-card-note">{t('ID')}: {item.id}</div>
              <div className="settings-card-note">{t('Version')}: {item.version}</div>
              {item.requiresRestart ? <div className="settings-card-note">{t('Nécessite un redémarrage après installation.')}</div> : null}
              <div className="settings-actions-row">
                <button
                  type="button"
                  className="settings-action"
                  disabled={busyId === item.id || installedIds.has(item.id)}
                  onClick={() => void handleInstall(item)}
                >
                  {installedIds.has(item.id) ? t('Installée') : t('Installer')}
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8 mb-2 text-2xl font-semibold dark:text-[#eaf0fc]">{t('Découvrir')}</div>
        {!loading && discoverItems.length === 0 ? (
          <div className="settings-card-note">{t('Aucune extension trouvée dans le scope npm @chaton/*.')}</div>
        ) : null}
        <div className={gridClass}>
          {(discoverPopular.length > 0 ? discoverPopular : discoverItems).map((item) => (
            <article key={item.id} className="settings-card">
              <div className="text-2xl font-semibold leading-tight text-[#1d1e22]">{item.name}</div>
              <div className="text-lg text-[#646772]">{item.description}</div>
              <div className="settings-card-note">{t('ID')}: {item.id}</div>
              <div className="settings-card-note">{t('Version')}: {item.version}</div>
              <div className="settings-card-note">{t('Source')}: {item.source === 'builtin' ? t('builtin') : t('npm')}</div>
              {item.requiresRestart ? <div className="settings-card-note">{t('Nécessite un redémarrage après installation.')}</div> : null}
              <div className="settings-actions-row">
                <button
                  type="button"
                  className="settings-action"
                  disabled={busyId === item.id || installedIds.has(item.id)}
                  onClick={() => void handleInstall(item)}
                >
                  {installedIds.has(item.id) ? t('Installée') : t('Installer')}
                </button>
              </div>
            </article>
          ))}
        </div>

      </section>
    </div>
  )
}
