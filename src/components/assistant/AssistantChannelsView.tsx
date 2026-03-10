import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, MessageSquareShare, Plus, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { workspaceIpc } from '@/services/ipc/workspace'
import { useWorkspace } from '@/features/workspace/store'
import type { ChatonsExtension } from '@/features/workspace/types'
import { getExtensionIcon } from '@/components/extensions/extension-icons'

type ExtensionUiEntry = {
  extensionId: string
  icon?: string
  iconUrl?: string
  mainViews?: Array<{
    viewId: string
    title: string
  }>
  serverStatus?: {
    ready?: boolean
    lastError?: string
  } | null
  channelStatus?: {
    configured: boolean
    connected: boolean
    lastActivity?: string | null
    issues?: string[]
    info?: string | null
    updatedAt: string
  } | null
}

function isChannelExtension(ext: ChatonsExtension): boolean {
  return ext.config?.kind === 'channel'
}

export function AssistantChannelsView() {
  const { t } = useTranslation()
  const { setAssistantView, openExtensionMainView, openExtensions } = useWorkspace()
  const [extensions, setExtensions] = useState<ChatonsExtension[]>([])
  const [entries, setEntries] = useState<ExtensionUiEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      const [installedResult, uiResult] = await Promise.all([
        workspaceIpc.listExtensions(),
        workspaceIpc.registerExtensionUi(),
      ])
      if (cancelled) return
      setExtensions(installedResult.extensions ?? [])
      setEntries((uiResult.entries ?? []) as ExtensionUiEntry[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const channelExtensions = useMemo(
    () => extensions.filter((ext) => ext.enabled && isChannelExtension(ext)),
    [extensions],
  )

  const entryMap = useMemo(
    () => new Map(entries.map((e) => [e.extensionId, e])),
    [entries],
  )

  return (
    <div className="ad-subview">
      <div className="ad-subview-header">
        <button type="button" className="ad-back-btn" onClick={() => setAssistantView('home')}>
          <ArrowLeft className="h-4 w-4" />
        </button>
        <MessageSquareShare className="ad-subview-icon h-5 w-5" />
        <h1 className="ad-subview-title">{t('assistant.channels.title')}</h1>
      </div>
      <p className="ad-subview-desc">{t('assistant.channels.desc')}</p>

      <div className="ad-subview-scroll">
        {loading ? (
          <div className="ad-card-loading">{t('assistant.dashboard.loading')}</div>
        ) : channelExtensions.length === 0 ? (
          <div className="ad-card-empty">
            <MessageSquareShare className="h-8 w-8 text-[#b0b5c0] dark:text-[#5a6580]" />
            <p>{t('assistant.channels.empty')}</p>
            <button type="button" className="ad-card-action" onClick={openExtensions}>
              <Plus className="h-3.5 w-3.5" />
              {t('assistant.channels.install')}
            </button>
          </div>
        ) : (
          <AssistantChannelsList
            channelExtensions={channelExtensions}
            entryMap={entryMap}
            openExtensionMainView={openExtensionMainView}
            openExtensions={openExtensions}
            t={t}
          />
        )}
      </div>
    </div>
  )
}

function AssistantChannelsList({
  channelExtensions,
  entryMap,
  openExtensionMainView,
  openExtensions,
  t,
}: {
  channelExtensions: ChatonsExtension[]
  entryMap: Map<string, ExtensionUiEntry>
  openExtensionMainView: (viewId: string) => void
  openExtensions: () => void
  t: (key: string) => string
}) {
  const [statuses, setStatuses] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false

    void (async () => {
      // No need to query KV - channelStatus is already in the UI entry
      // Just use it directly after a short delay to ensure UI is responsive
      await new Promise(resolve => setTimeout(resolve, 0))
      if (!cancelled) {
        const nextStatuses = channelExtensions.reduce((acc, ext) => {
          const entry = entryMap.get(ext.id)
          const channelStatus = entry?.channelStatus ?? null
          acc[ext.id] = channelStatus?.connected ?? (entry?.serverStatus?.ready ?? false)
          return acc
        }, {} as Record<string, boolean>)
        setStatuses(nextStatuses)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [channelExtensions, entryMap])

  return (
    <div className="ad-channels-full-list">
      {channelExtensions.map((ext) => {
        const entry = entryMap.get(ext.id)
        const iconRaw = typeof entry?.iconUrl === 'string' ? entry.iconUrl : entry?.icon
        const iconValue = getExtensionIcon(iconRaw, ext.id)
        const mainView = entry?.mainViews?.[0]
        const isConnected = statuses[ext.id] ?? (entry?.serverStatus?.ready ?? false)

        return (
          <div key={ext.id} className="ad-channel-full-row">
            <div className="ad-channel-full-icon">
              {iconValue.kind === 'image' ? (
                <img src={iconValue.src} alt="" className="h-5 w-5 object-contain" loading="lazy" />
              ) : (
                <iconValue.Component className="h-5 w-5" />
              )}
            </div>
            <div className="ad-channel-full-content">
              <div className="ad-channel-full-name">{ext.name}</div>
              {ext.description && (
                <div className="ad-channel-full-desc">{ext.description}</div>
              )}
              <div className="ad-channel-full-status">
                <span className={`ad-status-dot ${isConnected ? 'ad-status-dot-online' : 'ad-status-dot-offline'}`} />
                <span>{isConnected ? t('assistant.dashboard.connected') : t('assistant.dashboard.notConfigured')}</span>
              </div>
            </div>
            {mainView?.viewId && (
              <button
                type="button"
                className="ad-channel-full-config"
                onClick={() => openExtensionMainView(mainView.viewId)}
              >
                <Settings className="h-3.5 w-3.5" />
                {t('assistant.channels.configure')}
              </button>
            )}
          </div>
        )
      })}
      <button type="button" className="ad-card-action mt-3" onClick={openExtensions}>
        <Plus className="h-3.5 w-3.5" />
        {t('assistant.channels.addMore')}
      </button>
    </div>
  )
}
