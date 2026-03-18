import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { workspaceIpc } from '@/services/ipc/workspace'
import { useWorkspace } from '@/features/workspace/store'
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

/**
 * Full-screen slide-over sheet that displays an extension's main view
 * inside assistant mode. Reuses the same iframe loading pattern as
 * ExtensionMainViewPanel but renders as an overlay instead of replacing
 * the main content area.
 */
export function AssistantExtensionSheet() {
  const { t } = useTranslation()
  const { state, closeAssistantExtensionView } = useWorkspace()
  const viewId = state.assistantExtensionViewId

  const [html, setHtml] = useState<string | null>(null)
  const [title, setTitle] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  const { views: backgroundViews } = useChannelExtensions()
  const backgroundView = viewId ? backgroundViews.find((v) => v.viewId === viewId) : null

  useEffect(() => {
    if (!viewId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHtml(null)
      setError(null)
      return
    }

    // If background iframe is already running for this view, reuse its HTML
    if (backgroundView) {
      setTitle(backgroundView.title ?? '')
      setHtml(backgroundView.html)
      return
    }

    let cancelled = false
    setHtml(null)
    setError(null)

    void workspaceIpc.registerExtensionUi().then(async (ui) => {
      if (cancelled) return
      const entries = (ui.entries ?? []) as ExtensionUiEntry[]
      const match = entries
        .flatMap((entry) =>
          (entry.mainViews ?? []).map((mv) => ({ extensionId: entry.extensionId, mainView: mv })),
        )
        .find((item) => item.mainView.viewId === viewId)

      if (!match) {
        setError(t('assistant.sheet.viewNotFound'))
        return
      }

      setTitle(match.mainView.title || '')
      const result = await workspaceIpc.getExtensionMainViewHtml(match.mainView.viewId)
      if (cancelled) return
      if (!result.ok || !result.html) {
        setError(result.message ?? t('assistant.sheet.loadError'))
        return
      }
      setHtml(result.html)
    })

    return () => { cancelled = true }
  }, [viewId, backgroundView, t])

  // Close on Escape key
  useEffect(() => {
    if (!viewId) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAssistantExtensionView()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewId, closeAssistantExtensionView])

  return (
    <AnimatePresence>
      {viewId && (
        <>
          {/* Backdrop */}
          <motion.div
            className="ad-sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeAssistantExtensionView}
          />

          {/* Sheet panel */}
          <motion.div
            className="ad-sheet"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="ad-sheet-header">
              <h2 className="ad-sheet-title">{title}</h2>
              <button
                type="button"
                className="ad-sheet-close"
                onClick={closeAssistantExtensionView}
                aria-label={t('assistant.sheet.close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="ad-sheet-body">
              {error ? (
                <div className="ad-sheet-error">{error}</div>
              ) : !html ? (
                <div className="ad-sheet-loading">{t('assistant.dashboard.loading')}</div>
              ) : (
                <iframe
                  ref={iframeRef}
                  className="ad-sheet-iframe"
                  title={title}
                  srcDoc={html}
                  style={{ border: 'none', width: '100%', height: '100%', background: 'transparent' }}
                />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
