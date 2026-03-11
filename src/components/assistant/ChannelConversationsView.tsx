import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { workspaceIpc } from '@/services/ipc/workspace'
import { useWorkspace } from '@/features/workspace/store'
import type { Conversation, ChatonsExtension } from '@/features/workspace/types'
import { ExtensionIcon } from '@/components/extensions/extension-icons'

type ExtensionUiEntry = {
  extensionId: string
  icon?: string
  iconUrl?: string
  mainViews?: Array<{
    viewId: string
    title: string
  }>
}

function isChannelExtension(ext: ChatonsExtension): boolean {
  return ext.config?.kind === 'channel'
}

/**
 * Displays all conversations created by channel extensions
 * organized by channel.
 */
export function ChannelConversationsView() {
  const { t } = useTranslation()
  const { setAssistantView, selectConversation } = useWorkspace()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [extensions, setExtensions] = useState<ChatonsExtension[]>([])
  const [entries, setEntries] = useState<ExtensionUiEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const workspaceState = await workspaceIpc.getInitialState()
        const [installedResult, uiResult] = await Promise.all([
          workspaceIpc.listExtensions(),
          workspaceIpc.registerExtensionUi(),
        ])
        if (cancelled) return
        setConversations(workspaceState.conversations ?? [])
        setExtensions(installedResult.extensions ?? [])
        setEntries((uiResult.entries ?? []) as ExtensionUiEntry[])
      } finally {
        if (!cancelled) setLoading(false)
      }
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

  // Group conversations by channel extension ID
  const conversationsByChannel = useMemo(() => {
    const grouped = new Map<string, Conversation[]>()
    for (const conv of conversations) {
      if (conv.channelExtensionId) {
        if (!grouped.has(conv.channelExtensionId)) {
          grouped.set(conv.channelExtensionId, [])
        }
        grouped.get(conv.channelExtensionId)!.push(conv)
      }
    }
    // Sort conversations by lastMessageAt (newest first)
    for (const convs of grouped.values()) {
      convs.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
    }
    return grouped
  }, [conversations])

  const handleOpenConversation = async (conversationId: string) => {
    try {
      await selectConversation(conversationId)
      setAssistantView('home')
    } catch (err) {
      console.error('Failed to open conversation:', err)
    }
  }

  return (
    <div className="ad-subview">
      <div className="ad-subview-header">
        <button type="button" className="ad-back-btn" onClick={() => setAssistantView('channels')}>
          <ArrowLeft className="h-4 w-4" />
        </button>
        <MessageSquare className="ad-subview-icon h-5 w-5" />
        <h1 className="ad-subview-title">{t('assistant.channels.conversations.title')}</h1>
      </div>
      <p className="ad-subview-desc">{t('assistant.channels.conversations.desc')}</p>

      <div className="ad-subview-scroll">
        {loading ? (
          <div className="ad-card-loading">{t('assistant.dashboard.loading')}</div>
        ) : conversationsByChannel.size === 0 ? (
          <div className="ad-card-empty">
            <MessageSquare className="h-8 w-8 text-[#b0b5c0] dark:text-[#5a6580]" />
            <p>{t('assistant.channels.conversations.empty')}</p>
          </div>
        ) : (
          <div className="ad-channel-conversations-list">
            {channelExtensions.map((ext) => {
              const convs = conversationsByChannel.get(ext.id) ?? []
              if (convs.length === 0) return null

              const entry = entryMap.get(ext.id)
              const iconRaw = typeof entry?.iconUrl === 'string' ? entry.iconUrl : entry?.icon

              return (
                <div key={ext.id} className="ad-channel-conv-group">
                  <div className="ad-channel-conv-header">
                    <ExtensionIcon
                      iconName={iconRaw}
                      extensionId={ext.id}
                      className="h-4 w-4 object-contain"
                    />
                    <h3 className="ad-channel-conv-title">{ext.name}</h3>
                    <span className="ad-channel-conv-count">{convs.length}</span>
                  </div>
                  <div className="ad-channel-conv-items">
                    {convs.map((conv) => (
                      <button
                        key={conv.id}
                        type="button"
                        className="ad-channel-conv-item"
                        onClick={() => handleOpenConversation(conv.id)}
                      >
                        <div className="ad-channel-conv-item-content">
                          <div className="ad-channel-conv-item-title">{conv.title}</div>
                          <div className="ad-channel-conv-item-meta">
                            {conv.modelProvider && (
                              <span className="ad-channel-conv-item-model">
                                {conv.modelProvider}/{conv.modelId}
                              </span>
                            )}
                            {conv.lastMessageAt && (
                              <span className="ad-channel-conv-item-time">
                                {new Date(conv.lastMessageAt).toLocaleString([], {
                                  year: '2-digit',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="ad-channel-conv-item-arrow">
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
