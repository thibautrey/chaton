import { useEffect, useState } from 'react'

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
          title={title}
          srcDoc={html}
          style={{ border: 'none', width: '100%', height: 'calc(100vh - 64px)', borderRadius: 16, background: 'transparent' }}
        />
      </section>
    </div>
  )
}
