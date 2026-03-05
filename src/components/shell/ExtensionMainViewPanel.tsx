import { useEffect, useRef, useState } from 'react'

import { workspaceIpc } from '@/services/ipc/workspace'

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
  const pendingDeeplinkRef = useRef<{ viewId: string; target: string; params?: Record<string, unknown> } | null>(null)

  useEffect(() => {
    const handle = (event: Event) => {
      const custom = event as CustomEvent<{ viewId?: string; target?: string; params?: Record<string, unknown> }>
      const payload = custom.detail
      if (!payload?.viewId || !payload?.target) return
      pendingDeeplinkRef.current = { viewId: payload.viewId, target: payload.target, params: payload.params }
      const iframe = iframeRef.current
      if (!iframe || !iframe.contentWindow || viewId !== payload.viewId) return
      iframe.contentWindow.postMessage({ type: 'chaton.extension.deeplink', payload: pendingDeeplinkRef.current }, '*')
    }
    window.addEventListener('chaton:extension:deeplink', handle)
    return () => window.removeEventListener('chaton:extension:deeplink', handle)
  }, [viewId])

  useEffect(() => {
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
  }, [viewId])

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
    <div className="main-scroll">
      <section className="chat-section" style={{ paddingTop: 0, maxWidth: '100%', width: '100%' }}>
        <iframe
          ref={iframeRef}
          title={title}
          srcDoc={html}
          onLoad={() => {
            const pending = pendingDeeplinkRef.current
            const iframe = iframeRef.current
            if (!pending || !iframe || !iframe.contentWindow || pending.viewId !== viewId) return
            iframe.contentWindow.postMessage({ type: 'chaton.extension.deeplink', payload: pending }, '*')
          }}
          style={{ border: 'none', width: '100%', height: 'calc(100vh - 64px)', borderRadius: 16, background: 'transparent' }}
        />
      </section>
    </div>
  )
}
