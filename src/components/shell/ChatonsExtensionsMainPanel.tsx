import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Blocks, FolderOpen, Loader2, RefreshCw, Search, ShieldCheck, Sparkles, Square, Wrench } from 'lucide-react'

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
  const [logsById, setLogsById] = useState<Record<string, string>>({})
  const installPollRef = useRef<number | null>(null)

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
              const ExtensionIcon = getExtensionIcon(typeof extension.config?.icon === 'string' ? extension.config.icon : undefined)
              return (
                <article key={extension.id} className="extensions-surface-card">
                  <div className="extensions-card-topline">
                    <div className="extensions-card-badges">
                      <span className={`extensions-status-pill extensions-status-pill-${tone}`}>{extension.health}</span>
                      <span className={`extensions-status-pill ${extension.enabled ? 'extensions-status-pill-live' : ''}`}>
                        {extension.enabled ? t('Active') : t('Inactive')}
                      </span>
                    </div>
                    {requiresRestart ? <span className="extensions-subtle-pill">{t('Restart requis')}</span> : null}
                  </div>
                  <div className="extensions-card-title-row">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#d7d8dd] bg-[#f7f8fb] text-[#45464d] dark:border-[#273043] dark:bg-[#111827] dark:text-[#d6def2]">
                        <ExtensionIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="extensions-card-title">{extension.name}</h3>
                        <p className="extensions-card-description">{extension.description}</p>
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
                    {extension.installSource !== 'builtin' ? (
                      <button type="button" className="extensions-secondary-action" disabled={pending} onClick={() => void handleRemove(extension)}>
                        {t('Supprimer')}
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
  )
}
