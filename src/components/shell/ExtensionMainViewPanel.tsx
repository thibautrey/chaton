import { useEffect, useRef, useState } from 'react'

import { workspaceIpc } from '@/services/ipc/workspace'
import { useChannelExtensions } from '@/components/extensions/BackgroundChannelExtensions'

type ExtensionUiEntry = {
  extensionId: string
  mainViews?: Array<{
    viewId: string
    title: string
    webviewUrl: string
    initialRoute?: string
  }>
}

export function ExtensionMainViewPanel({ viewId }: { viewId: string | null }) {
  const [html, setHtml] = useState<string | null>(null)
  const [title, setTitle] = useState<string>('Vue extension')
  const [error, setError] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const frameOriginRef = useRef<string>(window.location.origin)
  const pendingDeeplinkRef = useRef<{ viewId: string; target: string; params?: Record<string, unknown> } | null>(null)

  const { views: backgroundViews, getIframeRef } = useChannelExtensions()

  // Check if this view already has a background iframe running
  const backgroundView = viewId ? backgroundViews.find((v) => v.viewId === viewId) : null
  const backgroundIframeRef = viewId ? getIframeRef(viewId) : null
  const hasBackgroundIframe = !!backgroundView && !!backgroundIframeRef

  useEffect(() => {
    const handle = (event: Event) => {
      const custom = event as CustomEvent<{ viewId?: string; target?: string; params?: Record<string, unknown> }>
      const payload = custom.detail
      if (!payload?.viewId || !payload?.target) return
      pendingDeeplinkRef.current = { viewId: payload.viewId, target: payload.target, params: payload.params }
      // Send deeplink to the background iframe if it exists, otherwise the local one
      const iframe = (backgroundIframeRef?.current) ?? iframeRef.current
      if (!iframe || !iframe.contentWindow || viewId !== payload.viewId) return
      iframe.contentWindow.postMessage(
        { type: 'chaton.extension.deeplink', payload: pendingDeeplinkRef.current },
        frameOriginRef.current,
      )
    }
    window.addEventListener('chaton:extension:deeplink', handle)
    return () => window.removeEventListener('chaton:extension:deeplink', handle)
  }, [viewId, backgroundIframeRef])

  useEffect(() => {
    // If the background iframe is handling this view, no need to fetch HTML again
    if (hasBackgroundIframe) return

    let cancelled = false
    setHtml(null)
    setError(null)

    if (!viewId) {
      setError('Aucune vue extension sélectionnée.')
      return
    }

    void workspaceIpc.registerExtensionUi().then(async (ui) => {
      if (cancelled) return
      const entries = (ui.entries ?? []) as ExtensionUiEntry[]
      const match = entries
        .flatMap((entry) =>
          (entry.mainViews ?? []).map((mainView) => ({
            extensionId: entry.extensionId,
            mainView,
          })),
        )
        .find((item) => item.mainView.viewId === viewId)

      if (!match) {
        setError(`Aucune vue enregistrée pour: ${viewId}`)
        return
      }

      setTitle(match.mainView.title || 'Vue extension')
      frameOriginRef.current = window.location.origin
      const htmlResult = await workspaceIpc.getExtensionMainViewHtml(match.mainView.viewId)
      if (cancelled) return
      if (!htmlResult.ok || !htmlResult.html) {
        setError(htmlResult.message ?? `Impossible de charger la vue ${viewId}`)
        return
      }
      setHtml(htmlResult.html)
    })

    return () => {
      cancelled = true
    }
  }, [viewId, hasBackgroundIframe])

  if (error) {
    return (
      <div className="main-scroll">
        <section className="chat-section settings-main-wrap">
          <h1 className="text-4xl font-semibold tracking-[-0.02em] dark:text-[#eef2fb]">Vue extension</h1>
          <p className="mt-1 text-xl dark:text-[#a6b2c9]">{error}</p>
        </section>
      </div>
    )
  }

  // If the background iframe is already running, show it at full size visually
  if (hasBackgroundIframe) {
    return (
      <div className="main-scroll extension-main-scroll">
        <section className="extension-main-section" style={{ paddingTop: 0 }}>
          <iframe
            ref={(el) => {
              // Mirror the element so deeplink messages work via iframeRef too
              iframeRef.current = el
            }}
            className="extension-main-iframe"
            title={title}
            srcDoc={backgroundView.html}
            onLoad={() => {
              const pending = pendingDeeplinkRef.current
              const iframe = iframeRef.current
              if (!pending || !iframe || !iframe.contentWindow || pending.viewId !== viewId) return
              iframe.contentWindow.postMessage(
                { type: 'chaton.extension.deeplink', payload: pending },
                frameOriginRef.current,
              )
            }}
            style={{ border: 'none', width: '100%', height: '100%', borderRadius: 0, background: 'transparent' }}
          />
        </section>
      </div>
    )
  }

  if (!html) {
    return (
      <div className="main-scroll">
        <section className="chat-section settings-main-wrap">
          <h1 className="text-4xl font-semibold tracking-[-0.02em] dark:text-[#eef2fb]">{title}</h1>
          <p className="mt-1 text-xl dark:text-[#a6b2c9]">Chargement...</p>
        </section>
      </div>
    )
  }

  return (
    <div className="main-scroll extension-main-scroll">
      <section className="extension-main-section" style={{ paddingTop: 0 }}>
        <iframe
          ref={iframeRef}
          className="extension-main-iframe"
          title={title}
          srcDoc={html}
          onLoad={() => {
            const pending = pendingDeeplinkRef.current
            const iframe = iframeRef.current
            if (!pending || !iframe || !iframe.contentWindow || pending.viewId !== viewId) return
            iframe.contentWindow.postMessage(
              { type: 'chaton.extension.deeplink', payload: pending },
              frameOriginRef.current,
            )
          }}
          style={{ border: 'none', width: '100%', height: '100%', borderRadius: 0, background: 'transparent' }}
        />
      </section>
    </div>
  )
}
