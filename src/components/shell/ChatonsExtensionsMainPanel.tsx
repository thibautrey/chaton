import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Blocks, FolderOpen, Loader2, RefreshCw, Search, ShieldCheck, Sparkles, Square, Wrench, Check } from 'lucide-react'

import { getExtensionIcon } from '@/components/extensions/extension-icons'
import { useTranslation } from 'react-i18next'

import type { ChatonsExtension, ChatonsExtensionCatalogItem } from '@/features/workspace/types'
import { useWorkspace } from '@/features/workspace/store'
import { workspaceIpc } from '@/services/ipc/workspace'

function statusTone(health?: string): string {
  if (health === 'ok') return 'ok'
  if (health === 'error') return 'error'
  return 'warn'
}

export function ChatonsExtensionsMainPanel() {
  const { t } = useTranslation()
  const { setNotice } = useWorkspace()
  const [extensions, setExtensions] = useState<ChatonsExtension[]>([])
  const [catalog, setCatalog] = useState<ChatonsExtensionCatalogItem[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [installMessage, setInstallMessage] = useState<string | null>(null)
  const [updateMessage, setUpdateMessage] = useState<string | null>(null)
  const [logsById, setLogsById] = useState<Record<string, string>>({})
  const [updatesAvailable, setUpdatesAvailable] = useState<Array<{ id: string; currentVersion: string; latestVersion: string }>>([])
  const [selectedForUpdate, setSelectedForUpdate] = useState<Set<string>>(new Set())
  const installPollRef = useRef<number | null>(null)
  const updatePollRef = useRef<number | null>(null)
  const [serverStatusById, setServerStatusById] = useState<Record<string, { ready?: boolean; lastError?: string } | null>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const [installedResult, catalogResult, updatesResult] = await Promise.all([
      workspaceIpc.listExtensions(),
      workspaceIpc.listExtensionCatalog(),
      workspaceIpc.checkExtensionUpdates(),
    ])
    setExtensions(installedResult.extensions ?? [])
    setCatalog(catalogResult.entries ?? [])
    setUpdatesAvailable(updatesResult.updates ?? [])
    const uiResult = await workspaceIpc.registerExtensionUi()
    const nextStatus: Record<string, { ready?: boolean; lastError?: string } | null> = {}
    for (const entry of (uiResult.entries ?? []) as Array<{ extensionId: string; serverStatus?: { ready?: boolean; lastError?: string } | null }>) {
      if (entry && typeof entry.extensionId === 'string') {
        nextStatus[entry.extensionId] = entry.serverStatus ?? null
      }
    }
    setServerStatusById(nextStatus)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    return () => {
      if (installPollRef.current !== null) {
        window.clearInterval(installPollRef.current)
      }
    }
  }, [])

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

  const stopInstallPolling = useCallback(() => {
    if (installPollRef.current !== null) {
      window.clearInterval(installPollRef.current)
      installPollRef.current = null
    }
  }, [])

  const stopUpdatePolling = useCallback(() => {
    if (updatePollRef.current !== null) {
      window.clearInterval(updatePollRef.current)
      updatePollRef.current = null
    }
  }, [])

  const beginInstallPolling = useCallback((id: string, name: string) => {
    stopInstallPolling()
    setInstallingId(id)
    installPollRef.current = window.setInterval(async () => {
      const stateResult = await workspaceIpc.getExtensionInstallState(id)
      const state = stateResult.state
      if (!state) return
      setInstallMessage(state.message ?? null)
      if (state.status === 'running') return
      stopInstallPolling()
      setInstallingId(null)
      setBusyId(null)
      await load()
      if (state.status === 'done') {
        setNotice(t('{{name}} installée.', { name }))
        return
      }
      if (state.status === 'cancelled') {
        setNotice(t('Installation annulée.'))
        return
      }
      if (state.status === 'error') {
        setNotice(state.message ?? t('Installation impossible.'))
      }
    }, 700)
  }, [load, setNotice, stopInstallPolling, t])

  const beginUpdatePolling = useCallback((id: string, name: string) => {
    stopUpdatePolling()
    updatePollRef.current = window.setInterval(async () => {
      const stateResult = await workspaceIpc.getExtensionInstallState(id)
      const state = stateResult.state
      if (!state) return
      if (state.status === 'running') return
      stopUpdatePolling()
      setBusyId(null)
      await load()
      if (state.status === 'done') {
        setNotice(t('{{name}} mise à jour.', { name }))
        return
      }
      if (state.status === 'cancelled') {
        setNotice(t('Mise à jour annulée.'))
        return
      }
      if (state.status === 'error') {
        setNotice(state.message ?? t('Mise à jour impossible.'))
      }
    }, 700)
  }, [load, setNotice, stopUpdatePolling, t])

  const handleCancelInstall = async (id: string) => {
    const result = await workspaceIpc.cancelExtensionInstall(id)
    if (!result.ok) {
      setNotice(result.message ?? t("Impossible d'annuler l'installation."))
      return
    }
    setInstallMessage(t('Installation annulée.'))
  }

  const handleInstall = async (item: ChatonsExtensionCatalogItem) => {
    setBusyId(item.id)
    setInstallMessage(t('Installation en cours...'))
    const result = await workspaceIpc.installExtension(item.id)
    if (!result.ok) {
      setNotice(result.message ?? t('Installation impossible.'))
      setBusyId(null)
      setInstallMessage(null)
      return
    }
    if (result.started) {
      beginInstallPolling(item.id, item.name)
      return
    }
    setNotice(t('{{name}} installée.', { name: item.name }))
    await load()
    setBusyId(null)
    setInstallMessage(null)
  }

  const handleUpdate = async (item: ChatonsExtension) => {
    setBusyId(item.id)
    const result = await workspaceIpc.updateExtension(item.id)
    if (!result.ok) {
      setNotice(result.message ?? t('Mise à jour impossible.'))
      setBusyId(null)
      return
    }
    if (result.started) {
      beginUpdatePolling(item.id, item.name)
      return
    }
    setNotice(t('{{name}} mise à jour.', { name: item.name }))
    await load()
    setBusyId(null)
  }

  const handleUpdateAll = async () => {
    const extensionsToUpdate = updatesAvailable.map(update => update.id)
    if (extensionsToUpdate.length === 0) {
      setNotice(t('Aucune mise à jour disponible.'))
      return
    }
    
    setBusyId('all')
    setUpdateMessage(t('Mise à jour de toutes les extensions...'))
    const result = await workspaceIpc.updateAllExtensions()
    
    if (result.ok) {
      const successCount = result.results.filter(r => r.success).length
      setNotice(t('{{count}} extensions mises à jour.', { count: successCount }))
      await load()
    } else {
      setNotice(t('Échec de la mise à jour des extensions.'))
    }
    
    setBusyId(null)
    setUpdateMessage(null)
  }

  const handleToggleUpdateSelection = (id: string) => {
    setSelectedForUpdate(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const handleUpdateSelected = async () => {
    if (selectedForUpdate.size === 0) {
      setNotice(t('Aucune extension sélectionnée pour la mise à jour.'))
      return
    }
    
    setBusyId('selected')
    setUpdateMessage(t('Mise à jour des extensions sélectionnées...'))
    
    const results = []
    for (const id of selectedForUpdate) {
      const result = await workspaceIpc.updateExtension(id)
      results.push({ id, success: result.ok })
    }
    
    const successCount = results.filter(r => r.success).length
    setNotice(t('{{count}} extensions mises à jour.', { count: successCount }))
    await load()
    setSelectedForUpdate(new Set())
    setBusyId(null)
    setUpdateMessage(null)
  }

  const handleRestart = async () => {
    await workspaceIpc.restartAppForExtension()
  }

  const [showNpmLoginModal, setShowNpmLoginModal] = useState<{ extensionId: string; extensionName: string } | null>(null)
  const [npmToken, setNpmToken] = useState('')

  const handlePublish = async (item: ChatonsExtension) => {
    setBusyId(item.id)
    const result = await workspaceIpc.publishExtension(item.id)
    if (!result.ok) {
      if (result.requiresNpmLogin) {
        setShowNpmLoginModal({ extensionId: item.id, extensionName: item.name })
        setBusyId(null)
        return
      }
      setNotice(result.message ?? t('Impossible de publier cette extension.'))
      setBusyId(null)
      return
    }
    if (result.started) {
      setNotice(t('Publication de {{name}} en cours...', { name: item.name }))
      return
    }
    setNotice(t('{{name}} publiée.', { name: item.name }))
    await load()
    setBusyId(null)
  }

  const handlePublishWithToken = async () => {
    if (!showNpmLoginModal) return
    
    setBusyId(showNpmLoginModal.extensionId)
    setShowNpmLoginModal(null)
    
    const result = await workspaceIpc.publishExtension(showNpmLoginModal.extensionId, npmToken)
    if (!result.ok) {
      setNotice(result.message ?? t('Impossible de publier cette extension.'))
      setBusyId(null)
      return
    }
    if (result.started) {
      setNotice(t('Publication de {{name}} en cours...', { name: showNpmLoginModal.extensionName }))
      setNpmToken('')
      return
    }
    setNotice(t('{{name}} publiée.', { name: showNpmLoginModal.extensionName }))
    await load()
    setBusyId(null)
    setNpmToken('')
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
  const discoverChannelItems = useMemo(
    () => discoverItems.filter((item) => item.id.includes('/channel-') || item.name.toLowerCase().includes('channel')),
    [discoverItems],
  )
  const discoverGeneralItems = useMemo(() => {
    const channelIds = new Set(discoverChannelItems.map((item) => item.id))
    return discoverItems.filter((item) => !channelIds.has(item.id))
  }, [discoverItems, discoverChannelItems])
  const enabledCount = extensions.filter((extension) => extension.enabled).length
  const restartCount = extensions.filter((extension) => extension.config?.requiresRestart === true).length
  const gridClass = 'grid grid-cols-1 gap-5 xl:grid-cols-2'

  return (
    <div className="main-scroll px-0 pt-0">
      <section className="chat-section settings-main-wrap extensions-panel-shell">
        <header className="extensions-hero">
          <div className="extensions-hero-copy">
            <h1 className="extensions-hero-title">{t('Extensions')}</h1>
          </div>
          <div className="extensions-hero-actions">
            <button
              type="button"
              className="extensions-primary-action"
              onClick={async () => {
                const result = await workspaceIpc.openExtensionsFolder()
                if (!result.ok) {
                  setNotice(result.message ?? t("Impossible d'ouvrir le dossier des extensions."))
                }
              }}
              title={t('Ouvrir le dossier des extensions')}
            >
              <FolderOpen className="h-4 w-4" />
              <span>{t('Ouvrir le dossier')}</span>
            </button>
          </div>
        </header>

        <div className="extensions-content-shell">
          {installingId ? (
            <div className="extensions-install-progress" role="status" aria-live="polite">
              <div className="extensions-install-progress-main">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{installMessage ?? t('Installation en cours...')}</span>
              </div>
              <button
                type="button"
                className="extensions-install-cancel"
                onClick={() => void handleCancelInstall(installingId)}
                aria-label={t("Annuler l'installation")}
                title={t("Annuler l'installation")}
              >
                <Square className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
          {updateMessage ? (
            <div className="extensions-install-progress" role="status" aria-live="polite">
              <div className="extensions-install-progress-main">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{updateMessage}</span>
              </div>
            </div>
          ) : null}
          <div className="extensions-stats-grid">
            <article className="extensions-stat-card">
              <div className="extensions-stat-icon"><Blocks className="h-5 w-5" /></div>
              <div className="extensions-stat-value">{extensions.length}</div>
              <div className="extensions-stat-label">{t('Installées')}</div>
            </article>
            <article className="extensions-stat-card">
              <div className="extensions-stat-icon"><ShieldCheck className="h-5 w-5" /></div>
              <div className="extensions-stat-value">{enabledCount}</div>
              <div className="extensions-stat-label">{t('Actives')}</div>
            </article>
            <article className="extensions-stat-card">
              <div className="extensions-stat-icon"><Sparkles className="h-5 w-5" /></div>
              <div className="extensions-stat-value">{discoverItems.length}</div>
              <div className="extensions-stat-label">{t('A découvrir')}</div>
            </article>
            <article className="extensions-stat-card">
              <div className="extensions-stat-icon"><RefreshCw className="h-5 w-5" /></div>
              <div className="extensions-stat-value">{restartCount}</div>
              <div className="extensions-stat-label">{t('Demandent un restart')}</div>
            </article>
          </div>

          <div className="extensions-search-shell">
            <Search className="extensions-search-icon h-4 w-4" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('Filtrer par nom, package ou description...')}
              className="extensions-search-input"
            />
          </div>

          {updatesAvailable.length > 0 && (
            <section className="extensions-section-block">
              <div className="extensions-section-header">
                <div>
                  <div className="extensions-section-eyebrow">{t('Updates Available')}</div>
                  <h2 className="extensions-section-title">{t('Mises à jour disponibles')}</h2>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="extensions-secondary-action"
                    onClick={() => void handleUpdateAll()}
                    disabled={busyId === 'all'}
                  >
                    <Check className="h-4 w-4" />
                    <span>{t('Tout mettre à jour')}</span>
                  </button>
                  <button
                    type="button"
                    className="extensions-secondary-action"
                    onClick={() => void handleUpdateSelected()}
                    disabled={busyId === 'selected' || selectedForUpdate.size === 0}
                  >
                    <Check className="h-4 w-4" />
                    <span>{t('Mettre à jour la sélection')}</span>
                  </button>
                </div>
              </div>
              <div className={gridClass}>
                {updatesAvailable.map((update) => {
                  const extension = extensions.find(ext => ext.id === update.id)
                  if (!extension) return null
                  
                  const pending = busyId === extension.id || busyId === 'all' || busyId === 'selected'
                  const isSelected = selectedForUpdate.has(extension.id)
                  const tone = statusTone(extension.health)
                  const iconValue = getExtensionIcon(typeof extension.config?.iconUrl === 'string' ? extension.config.iconUrl : extension.config?.icon)
                  
                  return (
                    <article key={extension.id} className="extensions-surface-card">
                      <div className="extensions-card-topline">
                        <div className="extensions-card-badges">
                          <span className={`extensions-status-pill extensions-status-pill-${tone}`}>{extension.health}</span>
                          <span className={`extensions-status-pill ${extension.enabled ? 'extensions-status-pill-live' : ''}`}>
                            {extension.enabled ? t('Active') : t('Inactive')}
                          </span>
                          <span className="extensions-status-pill extensions-status-pill-update">
                            {t('Update Available')}
                          </span>
                        </div>
                      </div>
                      <div className="extensions-card-title-row">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl border border-[#d7d8dd] bg-[#f7f8fb] text-[#45464d] dark:border-[#273043] dark:bg-[#111827] dark:text-[#d6def2]">
                            {iconValue.kind === 'image' ? (
                              <img src={iconValue.src} alt="" className="h-6 w-6 object-contain" loading="lazy" />
                            ) : (
                              <iconValue.Component className="h-5 w-5" />
                            )}
                          </div>
                          <div>
                            <h3 className="extensions-card-title">{extension.name}</h3>
                            <p className="extensions-card-description">{extension.description}</p>
                            {extension.name !== extension.id ? (
                              <p className="extensions-card-description">{extension.id}</p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <dl className="extensions-meta-grid">
                        <div>
                          <dt>{t('ID')}</dt>
                          <dd>{extension.id}</dd>
                        </div>
                        <div>
                          <dt>{t('Version')}</dt>
                          <dd>{update.currentVersion} → {update.latestVersion}</dd>
                        </div>
                        <div>
                          <dt>{t('Sandbox')}</dt>
                          <dd>{t('Activée')}</dd>
                        </div>
                        {extension.lastRunStatus ? (
                          <div>
                            <dt>{t('Dernier run')}</dt>
                            <dd>{extension.lastRunStatus}</dd>
                          </div>
                        ) : null}
                      </dl>
                      {extension.lastError ? <div className="settings-error">{extension.lastError}</div> : null}

                      <div className="extensions-actions-row">
                        <button type="button" className="extensions-secondary-action" disabled={pending} onClick={() => void handleToggle(extension)}>
                          {extension.enabled ? t('Désactiver') : t('Activer')}
                        </button>
                        <button type="button" className="extensions-secondary-action" disabled={pending} onClick={() => void handleRepair(extension)}>
                          <Wrench className="h-4 w-4" />
                          <span>{t('Réparer')}</span>
                        </button>
                        <button type="button" className="extensions-secondary-action" onClick={() => void handleShowLogs(extension)}>
                          {t('Voir logs')}
                        </button>
                        <button
                          type="button"
                          className="extensions-primary-inline-action"
                          disabled={pending}
                          onClick={() => void handleUpdate(extension)}
                        >
                          {t('Mettre à jour')}
                        </button>
                        <label className="flex items-center gap-2 ml-auto">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleUpdateSelection(extension.id)}
                            disabled={pending}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>{t('Sélectionner')}</span>
                        </label>
                      </div>

                      {logsById[extension.id] ? <pre className="extensions-log-box">{logsById[extension.id]}</pre> : null}
                    </article>
                  )
                })}
              </div>
            </section>
          )}

          <section className="extensions-section-block">
            <div className="extensions-section-header">
            <div>
              <div className="extensions-section-eyebrow">{t('Installed')}</div>
              <h2 className="extensions-section-title">{t('Vos extensions')}</h2>
            </div>
          </div>
          {!loading && installedItems.length === 0 ? <div className="extensions-empty-state">{t('Aucune extension installée.')}</div> : null}
          <div className={gridClass}>
            {installedItems.map((extension) => {
              const pending = busyId === extension.id
              const requiresRestart = extension.config?.requiresRestart === true
              const tone = statusTone(extension.health)
              const serverStatus = serverStatusById[extension.id] ?? null
              const iconValue = getExtensionIcon(typeof extension.config?.iconUrl === 'string' ? extension.config.iconUrl : extension.config?.icon)
              return (
                <article key={extension.id} className="extensions-surface-card">
                  <div className="extensions-card-topline">
                    <div className="extensions-card-badges">
                      <span className={`extensions-status-pill extensions-status-pill-${tone}`}>{extension.health}</span>
                      <span className={`extensions-status-pill ${extension.enabled ? 'extensions-status-pill-live' : ''}`}>
                        {extension.enabled ? t('Active') : t('Inactive')}
                      </span>
                      {updatesAvailable.some(update => update.id === extension.id) && (
                        <span className="extensions-status-pill extensions-status-pill-update">
                          {t('Update Available')}
                        </span>
                      )}
                    </div>
                    {requiresRestart ? <span className="extensions-subtle-pill">{t('Restart requis')}</span> : null}
                  </div>
                  <div className="extensions-card-title-row">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl border border-[#d7d8dd] bg-[#f7f8fb] text-[#45464d] dark:border-[#273043] dark:bg-[#111827] dark:text-[#d6def2]">
                        {iconValue.kind === 'image' ? (
                          <img src={iconValue.src} alt="" className="h-6 w-6 object-contain" loading="lazy" />
                        ) : (
                          <iconValue.Component className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <h3 className="extensions-card-title">{extension.name}</h3>
                        <p className="extensions-card-description">{extension.description}</p>
                        {extension.name !== extension.id ? (
                          <p className="extensions-card-description">{extension.id}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <dl className="extensions-meta-grid">
                    <div>
                      <dt>{t('ID')}</dt>
                      <dd>{extension.id}</dd>
                    </div>
                    <div>
                      <dt>{t('Version')}</dt>
                      <dd>{extension.version}</dd>
                    </div>
                    <div>
                      <dt>{t('Sandbox')}</dt>
                      <dd>{t('Activée')}</dd>
                    </div>
                    {extension.lastRunStatus ? (
                      <div>
                        <dt>{t('Dernier run')}</dt>
                        <dd>{extension.lastRunStatus}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {extension.lastError ? <div className="settings-error">{extension.lastError}</div> : null}
                  {serverStatus && serverStatus.ready === false ? (
                    <div className="settings-error">
                      {t('Serveur extension en cours de démarrage...')}
                    </div>
                  ) : null}

                  <div className="extensions-actions-row">
                    <button type="button" className="extensions-secondary-action" disabled={pending} onClick={() => void handleToggle(extension)}>
                      {extension.enabled ? t('Désactiver') : t('Activer')}
                    </button>
                    <button type="button" className="extensions-secondary-action" disabled={pending} onClick={() => void handleRepair(extension)}>
                      <Wrench className="h-4 w-4" />
                      <span>{t('Réparer')}</span>
                    </button>
                    <button type="button" className="extensions-secondary-action" onClick={() => void handleShowLogs(extension)}>
                      {t('Voir logs')}
                    </button>
                    {updatesAvailable.some(update => update.id === extension.id) && (
                      <button type="button" className="extensions-primary-inline-action" disabled={pending} onClick={() => void handleUpdate(extension)}>
                        {t('Mettre à jour')}
                      </button>
                    )}
                    {extension.installSource !== 'builtin' ? (
                      <button type="button" className="extensions-secondary-action" disabled={pending} onClick={() => void handleRemove(extension)}>
                        {t('Supprimer')}
                      </button>
                    ) : null}
                    {extension.installSource === 'localPath' ? (
                      <button type="button" className="extensions-primary-inline-action" disabled={pending} onClick={() => void handlePublish(extension)}>
                        {t('Publier')}
                      </button>
                    ) : null}
                    {requiresRestart ? (
                      <button type="button" className="extensions-primary-inline-action" onClick={() => void handleRestart()}>
                        {t('Relancer Chatons')}
                      </button>
                    ) : null}
                  </div>

                  {logsById[extension.id] ? <pre className="extensions-log-box">{logsById[extension.id]}</pre> : null}
                </article>
              )
            })}
          </div>
        </section>

        <section className="extensions-section-block">
          <div className="extensions-section-header">
            <div>
              <div className="extensions-section-eyebrow">{t('Featured')}</div>
              <h2 className="extensions-section-title">{t('Mises en avant')}</h2>
            </div>
          </div>
          {discoverHighlighted.length === 0 && !loading ? (
            <div className="extensions-empty-state">{t('Aucune extension trouvée avec le format npm @user/chatons-extension-name.')}</div>
          ) : null}
          <div className={gridClass}>
            {discoverHighlighted.map((item) => (
              <article key={item.id} className="extensions-surface-card extensions-surface-card-highlighted">
                <div className="extensions-card-topline">
                  <span className="extensions-feature-pill">{t('Extension')}</span>
                  {item.requiresRestart ? <span className="extensions-subtle-pill">{t('Restart requis')}</span> : null}
                </div>
                <h3 className="extensions-card-title">{item.name}</h3>
                <p className="extensions-card-description">{item.description}</p>
                <dl className="extensions-meta-grid">
                  <div>
                    <dt>{t('ID')}</dt>
                    <dd>{item.id}</dd>
                  </div>
                  <div>
                    <dt>{t('Version')}</dt>
                    <dd>{item.version}</dd>
                  </div>
                </dl>
                <div className="extensions-actions-row">
                  <button
                    type="button"
                    className="extensions-primary-inline-action"
                    disabled={busyId === item.id || installedIds.has(item.id)}
                    onClick={() => void handleInstall(item)}
                  >
                    {busyId === item.id && installingId === item.id ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{t('Installation...')}</span>
                      </>
                    ) : installedIds.has(item.id) ? t('Installée') : t('Installer')}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="extensions-section-block">
          <div className="extensions-section-header">
            <div>
              <div className="extensions-section-eyebrow">{t('Discover')}</div>
              <h2 className="extensions-section-title">{t('Explorer le catalogue')}</h2>
            </div>
          </div>
          {!loading && discoverItems.length === 0 ? (
            <div className="extensions-empty-state">{t('Aucune extension trouvée avec le format npm @user/chatons-extension-name.')}</div>
          ) : null}

          {discoverChannelItems.length > 0 ? (
            <>
              <div className="extensions-subsection-title">{t('Channels')}</div>
              <div className={gridClass}>
                {discoverChannelItems.map((item) => (
                  <article key={item.id} className="extensions-surface-card">
                    <div className="extensions-card-topline">
                      <span className="extensions-subtle-pill">{t('Channel')}</span>
                      <span className="extensions-subtle-pill">{item.source === 'builtin' ? t('builtin') : t('npm')}</span>
                    </div>
                    <h3 className="extensions-card-title">{item.name}</h3>
                    <p className="extensions-card-description">{item.description}</p>
                    <dl className="extensions-meta-grid">
                      <div>
                        <dt>{t('ID')}</dt>
                        <dd>{item.id}</dd>
                      </div>
                      <div>
                        <dt>{t('Version')}</dt>
                        <dd>{item.version}</dd>
                      </div>
                    </dl>
                    <div className="extensions-actions-row">
                      <button
                        type="button"
                        className="extensions-primary-inline-action"
                        disabled={busyId === item.id || installedIds.has(item.id)}
                        onClick={() => void handleInstall(item)}
                      >
                        {busyId === item.id && installingId === item.id ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>{t('Installation...')}</span>
                          </>
                        ) : installedIds.has(item.id) ? t('Installée') : t('Installer')}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}

          {discoverGeneralItems.length > 0 ? (
            <>
              <div className="extensions-subsection-title">{t('Autres extensions')}</div>
              <div className={gridClass}>
                {discoverGeneralItems.map((item) => (
                  <article key={item.id} className="extensions-surface-card">
                    <div className="extensions-card-topline">
                      <span className="extensions-subtle-pill">{item.source === 'builtin' ? t('builtin') : t('npm')}</span>
                      {item.requiresRestart ? <span className="extensions-subtle-pill">{t('Restart requis')}</span> : null}
                    </div>
                    <h3 className="extensions-card-title">{item.name}</h3>
                    <p className="extensions-card-description">{item.description}</p>
                    <dl className="extensions-meta-grid">
                      <div>
                        <dt>{t('ID')}</dt>
                        <dd>{item.id}</dd>
                      </div>
                      <div>
                        <dt>{t('Version')}</dt>
                        <dd>{item.version}</dd>
                      </div>
                    </dl>
                    <div className="extensions-actions-row">
                      <button
                        type="button"
                        className="extensions-primary-inline-action"
                        disabled={busyId === item.id || installedIds.has(item.id)}
                        onClick={() => void handleInstall(item)}
                      >
                        {busyId === item.id && installingId === item.id ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>{t('Installation...')}</span>
                          </>
                        ) : installedIds.has(item.id) ? t('Installée') : t('Installer')}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </section>
        </div>
      </section>
    </div>
    
    {showNpmLoginModal && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            {t('npm Login Required')}
          </h3>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            {t('You need to be logged in to npm to publish extensions. Please provide your npm token.')}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {t('Get your token from:')} <a href="https://www.npmjs.com/settings/tokens" className="text-blue-600 dark:text-blue-400 underline" target="_blank" rel="noopener noreferrer">
              https://www.npmjs.com/settings/tokens
            </a> <span className="text-xs">({t('replace {{your-username}} with your actual npm username')})</span>
          </p>
          <div className="mb-4">
            <label htmlFor="npmToken" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('npm Token')}
            </label>
            <input
              type="password"
              id="npmToken"
              value={npmToken}
              onChange={(e) => setNpmToken(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
              placeholder={t('Enter your npm token')}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setShowNpmLoginModal(null)
                setNpmToken('')
                setBusyId(null)
              }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {t('Cancel')}
            </button>
            <button
              type="button"
              onClick={handlePublishWithToken}
              disabled={!npmToken.trim()}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('Publish with Token')}
            </button>
          </div>
        </div>
      </div>
    )}
  )
}
