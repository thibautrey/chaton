import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { workspaceIpc } from '@/services/ipc/workspace'
import type { ChatonsExtension } from '@/features/workspace/types'

type ExtensionUiEntry = {
  extensionId: string
  mainViews?: Array<{
    viewId: string
    title: string
    webviewUrl: string
    initialRoute?: string
  }>
}

type LoadedView = {
  extensionId: string
  viewId: string
  html: string
  title: string
}

type ChannelExtensionsContextValue = {
  views: LoadedView[]
  getIframeRef: (viewId: string) => React.RefObject<HTMLIFrameElement | null> | null
}

const ChannelExtensionsContext = createContext<ChannelExtensionsContextValue>({
  views: [],
  getIframeRef: () => null,
})

export function useChannelExtensions() {
  return useContext(ChannelExtensionsContext)
}

function isChannelExtension(extension: ChatonsExtension): boolean {
  return extension.config?.kind === 'channel'
}

/**
 * Loads all enabled channel extensions as hidden background iframes so their
 * polling logic runs without the user having to open them. The iframes are
 * exposed via context so the explicit "Configure" view can move them visually
 * rather than creating a second duplicate iframe.
 */
export function BackgroundChannelExtensions({ children }: { children: React.ReactNode }) {
  const [views, setViews] = useState<LoadedView[]>([])
  const iframeRefs = useRef<Map<string, React.RefObject<HTMLIFrameElement | null>>>(new Map())
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true

    void (async () => {
      const [installedResult, uiResult] = await Promise.all([
        workspaceIpc.listExtensions(),
        workspaceIpc.registerExtensionUi(),
      ])

      const channelExtensions = (installedResult.extensions ?? []).filter(
        (ext) => ext.enabled && isChannelExtension(ext),
      )
      if (channelExtensions.length === 0) return

      const entries = (uiResult.entries ?? []) as ExtensionUiEntry[]
      const entryById = new Map(entries.map((e) => [e.extensionId, e]))

      const loaded: LoadedView[] = []
      for (const ext of channelExtensions) {
        const entry = entryById.get(ext.id)
        const viewId = entry?.mainViews?.[0]?.viewId
        if (!viewId) continue
        const htmlResult = await workspaceIpc.getExtensionMainViewHtml(viewId)
        if (htmlResult.ok && htmlResult.html) {
          const ref: React.RefObject<HTMLIFrameElement | null> = { current: null }
          iframeRefs.current.set(viewId, ref)
          loaded.push({ extensionId: ext.id, viewId, html: htmlResult.html, title: entry?.mainViews?.[0]?.title || '' })
        }
      }
      setViews(loaded)
    })()
  }, [])

  const getIframeRef = useCallback(
    (viewId: string) => iframeRefs.current.get(viewId) ?? null,
    [],
  )

  return (
    <ChannelExtensionsContext.Provider value={{ views, getIframeRef }}>
      {children}
      {/* Hidden background iframes — always mounted to keep polling alive */}
      <div style={{ position: 'fixed', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none', opacity: 0 }}>
        {views.map((view) => (
          <iframe
            key={view.viewId}
            ref={(el) => {
              const ref = iframeRefs.current.get(view.viewId)
              if (ref) ref.current = el
            }}
            title={`bg-${view.extensionId}`}
            srcDoc={view.html}
            style={{ width: 1, height: 1, border: 'none' }}
          />
        ))}
      </div>
    </ChannelExtensionsContext.Provider>
  )
}
