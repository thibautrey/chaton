import { useEffect, useMemo, useRef, useState } from 'react'
import { ExtensionIcon } from '@/components/extensions/extension-icons'
import { useWorkspace } from '@/features/workspace/store'
import type { ChatonsExtensionDeeplink, ChatonsExtensionTopbarItem, ChatonsTopbarWidgetContext } from '@/features/workspace/types'
import { workspaceIpc } from '@/services/ipc/workspace'

type ExtensionUiEntry = {
  extensionId: string
  enabled?: boolean
  icon?: string
  iconUrl?: string
  topbarItems?: ChatonsExtensionTopbarItem[]
  mainViews?: Array<{
    viewId: string
    title: string
    webviewUrl: string
    initialRoute?: string
  }>
}

function dispatchExtensionDeeplink(extensionId: string, deeplink: ChatonsExtensionDeeplink) {
  window.dispatchEvent(
    new CustomEvent('chaton:extension:deeplink', {
      detail: {
        extensionId,
        deeplink,
      },
    }),
  )
}

function TopbarWidgetHost({
  extensionId,
  item,
  title,
  widgetContext,
}: {
  extensionId: string
  item: ChatonsExtensionTopbarItem
  title: string
  widgetContext: ChatonsTopbarWidgetContext
}) {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const pendingDeeplinkRef = useRef<{ viewId: string; target: string; params?: Record<string, unknown> } | null>(null)

  useEffect(() => {
    let cancelled = false
    setHtml(null)
    setError(null)

    if (!item.widget?.viewId) {
      setError('Missing topbar widget view id.')
      return
    }

    void workspaceIpc.getExtensionMainViewHtml(item.widget.viewId).then((htmlResult) => {
      if (cancelled) return
      if (!htmlResult.ok || !htmlResult.html) {
        setError(htmlResult.message ?? `Unable to load widget ${item.widget?.viewId}`)
        return
      }
      setHtml(htmlResult.html)
    })

    return () => {
      cancelled = true
    }
  }, [item.widget?.viewId])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow || !item.widget?.viewId) return
    iframe.contentWindow.postMessage(
      {
        type: 'chaton.extension.topbarContext',
        payload: {
          ...widgetContext,
          widget: {
            viewId: item.widget.viewId,
            width: item.widget.width ?? null,
            minWidth: item.widget.minWidth ?? null,
          },
        },
      },
      '*',
    )
  }, [item.widget?.minWidth, item.widget?.viewId, item.widget?.width, widgetContext])

  useEffect(() => {
    const handle = (event: Event) => {
      const custom = event as CustomEvent<{ extensionId?: string; deeplink?: ChatonsExtensionDeeplink }>
      const payload = custom.detail
      if (!payload?.deeplink?.viewId || !payload?.deeplink?.target) return
      if (payload.extensionId !== extensionId) return
      if (payload.deeplink.viewId !== item.widget?.viewId) return
      pendingDeeplinkRef.current = {
        viewId: payload.deeplink.viewId,
        target: payload.deeplink.target,
        params: payload.deeplink.params,
      }
      const iframe = iframeRef.current
      if (!iframe?.contentWindow) return
      iframe.contentWindow.postMessage({ type: 'chaton.extension.deeplink', payload: pendingDeeplinkRef.current }, '*')
    }
    window.addEventListener('chaton:extension:deeplink', handle)
    return () => window.removeEventListener('chaton:extension:deeplink', handle)
  }, [extensionId, item.widget?.viewId])

  if (error) return null
  if (!html) {
    return (
      <div
        className="topbar-extension-widget"
        style={{ width: item.widget?.width ?? 44, minWidth: item.widget?.minWidth ?? item.widget?.width ?? 44 }}
        aria-label={item.label}
        title={item.label}
      />
    )
  }

  return (
    <div
      className="topbar-extension-widget"
      style={{ width: item.widget?.width ?? 44, minWidth: item.widget?.minWidth ?? item.widget?.width ?? 44 }}
      aria-label={item.label}
      title={item.label}
    >
      <iframe
        ref={iframeRef}
        className="topbar-extension-widget-iframe"
        title={title}
        srcDoc={html}
        onLoad={() => {
          const pending = pendingDeeplinkRef.current
          const iframe = iframeRef.current
          if (!pending || !iframe?.contentWindow || pending.viewId !== item.widget?.viewId) return
          iframe.contentWindow.postMessage({ type: 'chaton.extension.deeplink', payload: pending }, '*')
        }}
      />
    </div>
  )
}

function GenericTopbarButton({
  extensionId,
  item,
  icon,
}: {
  extensionId: string
  item: ChatonsExtensionTopbarItem
  icon?: string
}) {
  const { openExtensionMainView } = useWorkspace()

  const handleClick = () => {
    if (item.openMainView) {
      openExtensionMainView(item.openMainView)
      return
    }
    if (item.deeplink) {
      dispatchExtensionDeeplink(extensionId, item.deeplink)
    }
  }

  return (
    <button
      type="button"
      className="sidebar-icon-button topbar-vscode-button"
      aria-label={item.label}
      title={item.label}
      onClick={handleClick}
      disabled={!item.openMainView && !item.deeplink}
    >
      <ExtensionIcon iconName={item.icon ?? icon} extensionId={extensionId} className="h-4 w-4 object-contain" />
    </button>
  )
}

export function TopbarExtensionItems() {
  const { state } = useWorkspace()
  const [entries, setEntries] = useState<ExtensionUiEntry[]>([])

  const selectedConversation = state.conversations.find(
    (conversation) => conversation.id === state.selectedConversationId,
  )

  useEffect(() => {
    let cancelled = false
    void workspaceIpc.registerExtensionUi().then((result) => {
      if (cancelled) return
      setEntries((result.entries ?? []) as ExtensionUiEntry[])
    })
    return () => {
      cancelled = true
    }
  }, [])

  const widgetContext = useMemo<ChatonsTopbarWidgetContext>(() => {
    const targetConversation = state.conversations.find((conversation) => conversation.id === state.selectedConversationId)
    const project = targetConversation?.projectId
      ? state.projects.find((entry) => entry.id === targetConversation.projectId) ?? null
      : null

    return {
      extensionId: '',
      itemId: '',
      label: '',
      conversation: {
        id: targetConversation?.id ?? null,
        projectId: targetConversation?.projectId ?? null,
        worktreePath: targetConversation?.worktreePath ?? null,
        accessMode: targetConversation?.accessMode ?? null,
      },
      project: {
        id: project?.id ?? null,
        name: project?.name ?? null,
        repoPath: project?.repoPath ?? null,
      },
      thread: {
        kind: targetConversation?.projectId ? 'project' : targetConversation ? 'global' : 'none',
      },
    }
  }, [state.conversations, state.selectedConversationId, state.projects])

  const topbarItems = useMemo(() => {
    return entries
      .filter((entry) => entry.enabled !== false && (entry.topbarItems?.length ?? 0) > 0)
      .flatMap((entry) =>
        (entry.topbarItems ?? []).map((item) => ({ extensionId: entry.extensionId, entry, item })),
      )
      .filter(({ item }) => {
        if (item.context === 'project') return Boolean(selectedConversation?.projectId)
        if (item.context === 'global') return !selectedConversation?.projectId
        return true
      })
      .sort((a, b) => (a.item.order ?? 999) - (b.item.order ?? 999))
  }, [entries, selectedConversation?.projectId])

  if (topbarItems.length === 0) return null

  return (
    <>
      {topbarItems.map(({ extensionId, entry, item }) => {
        const widgetTitle = entry.mainViews?.find((view) => view.viewId === item.widget?.viewId)?.title ?? item.label
        if (item.widget?.viewId) {
          return (
            <TopbarWidgetHost
              key={`${extensionId}:${item.id}`}
              extensionId={extensionId}
              item={item}
              title={widgetTitle}
              widgetContext={{
                ...widgetContext,
                extensionId,
                itemId: item.id,
                label: item.label,
              }}
            />
          )
        }
        return (
          <GenericTopbarButton
            key={`${extensionId}:${item.id}`}
            extensionId={extensionId}
            item={item}
            icon={entry.icon}
          />
        )
      })}
    </>
  )
}
