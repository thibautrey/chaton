/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useState } from 'react'
import { MessageSquareShare, Plus, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { workspaceIpc } from '@/services/ipc/workspace'
import { useWorkspace } from '@/features/workspace/store'
import type { ChatonsExtension } from '@/features/workspace/types'
import { ExtensionIcon } from '@/components/extensions/extension-icons'

type ExtensionUiEntry = {
  extensionId: string
  icon?: string
  iconUrl?: string
  mainViews?: Array<{
    viewId: string
    title: string
    icon?: string
    webviewUrl: string
    initialRoute?: string
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

export type ChannelInfo = {
  id: string
  name: string
  isConnected: boolean
  configViewId: string | null
  iconName: string | undefined
}

function isChannelExtension(ext: ChatonsExtension): boolean {
  return ext.config?.kind === 'channel'
}

/**
 * Hook that loads channel extensions and their connection state.
 * Shared between ChannelsStatus and the dashboard parent.
 */
export function useChannelExtensions() {
  const [channels, setChannels] = useState<ChannelInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setLoading(true)
      try {
        const [installedResult, uiResult] = await Promise.all([
          workspaceIpc.listExtensions(),
          workspaceIpc.registerExtensionUi(),
        ])
        if (cancelled) return

        const extensions = (installedResult.extensions ?? []).filter(
          (ext) => ext.enabled && isChannelExtension(ext),
        )
        const entries = (uiResult.entries ?? []) as ExtensionUiEntry[]
        const entryMap = new Map(entries.map((e) => [e.extensionId, e]))

        // Query KV store for each channel to check if configured
        const infos: ChannelInfo[] = await Promise.all(
          extensions.map(async (ext) => {
            const entry = entryMap.get(ext.id)
            const iconName = typeof entry?.iconUrl === 'string' ? entry.iconUrl : entry?.icon
            const mainView = entry?.mainViews?.[0]

        // Query channel status reported by the extension itself
        const channelStatus = entry?.channelStatus ?? null
        const isConnected = (channelStatus?.connected ?? false) || (entry?.serverStatus?.ready ?? false)

        return {
          id: ext.id,
          name: ext.name,
          isConnected,
          configViewId: mainView?.viewId ?? null,
          iconName,
        }
          }),
        )

        if (!cancelled) {
          setChannels(infos)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [])

  const connectedCount = useMemo(() => channels.filter((c) => c.isConnected).length, [channels])

  return { channels, loading, connectedCount }
}

export function ChannelsStatus({
  channels,
  loading,
}: {
  channels: ChannelInfo[]
  loading: boolean
}) {
  const { t } = useTranslation()
  const { openExtensionMainView, setAssistantView } = useWorkspace()

  if (loading) {
    return (
      <section className="ad-card">
        <div className="ad-card-header">
          <MessageSquareShare className="ad-card-icon h-4 w-4" />
          <h2 className="ad-card-title">{t('assistant.dashboard.channels')}</h2>
        </div>
        <div className="ad-card-loading">{t('assistant.dashboard.loading')}</div>
      </section>
    )
  }

  return (
    <section className="ad-card">
      <div className="ad-card-header">
        <MessageSquareShare className="ad-card-icon h-4 w-4" />
        <h2 className="ad-card-title">{t('assistant.dashboard.channels')}</h2>
      </div>

      {channels.length === 0 ? (
        <div className="ad-card-empty">
          <p>{t('assistant.dashboard.noChannels')}</p>
          <button
            type="button"
            className="ad-card-action"
            onClick={() => setAssistantView('channels')}
          >
            <Plus className="h-3.5 w-3.5" />
            {t('assistant.dashboard.addChannel')}
          </button>
        </div>
      ) : (
        <>
          <div className="ad-channel-list">
            {channels.map((channel) => (
              <div key={channel.id} className="ad-channel-row">
                <div className="ad-channel-icon">
                  <ExtensionIcon
                    iconName={channel.iconName}
                    extensionId={channel.id}
                    className="h-4 w-4 object-contain"
                  />
                </div>
                <span className="ad-channel-name">{channel.name}</span>
                <span className={`ad-status-dot ${channel.isConnected ? 'ad-status-dot-online' : 'ad-status-dot-offline'}`} />
                <span className="ad-channel-status-text">
                  {channel.isConnected
                    ? t('assistant.dashboard.connected')
                    : t('assistant.dashboard.notConfigured')}
                </span>
                {channel.configViewId && (
                  <button
                    type="button"
                    className="ad-channel-config-btn"
                    onClick={() => openExtensionMainView(channel.configViewId!)}
                  >
                    <Settings className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="ad-card-action mt-2"
            onClick={() => setAssistantView('channels')}
          >
            <Plus className="h-3.5 w-3.5" />
            {t('assistant.dashboard.addChannel')}
          </button>
        </>
      )}
    </section>
  )
}
