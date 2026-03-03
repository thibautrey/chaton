import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useWorkspace } from '@/features/workspace/store'

function TopPill({ label, chime = false }: { label: string; chime?: boolean }) {
  return (
    <Button type="button" variant="outline" className={`top-pill top-pill-default ${chime ? 'top-pill-chime' : ''}`}>
      <span>{label}</span>
    </Button>
  )
}

export function Topbar() {
  const { state } = useWorkspace()
  const [isQueueDialogOpen, setIsQueueDialogOpen] = useState(false)
  const { t } = useTranslation()

  const selectedConversation = state.conversations.find((conversation) => conversation.id === state.selectedConversationId)
  const runtime = selectedConversation ? state.piByConversation[selectedConversation.id] : null
  const shouldShowRuntimePills = Boolean(runtime && (runtime.status !== 'stopped' || runtime.lastError))
  const shouldShowStatusPill = Boolean(runtime && runtime.status !== 'stopped' && runtime.status !== 'starting')
  const shouldShowQueuePill = Boolean(runtime && runtime.pendingCommands > 0)

  useEffect(() => {
    if (!shouldShowQueuePill) {
      setIsQueueDialogOpen(false)
    }
  }, [shouldShowQueuePill])

  useEffect(() => {
    if (!isQueueDialogOpen) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsQueueDialogOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isQueueDialogOpen])

  if (state.sidebarMode === 'settings') {
    return null
  }

  return (
    <header className="topbar">
      <div className="topbar-title">{selectedConversation?.title ?? t('Nouveau fil')}</div>

      <div className="flex items-center gap-2">
        {shouldShowStatusPill ? <TopPill label={`Pi ${runtime?.status}`} /> : null}
        {shouldShowRuntimePills && shouldShowQueuePill ? (
          <Button
            type="button"
            variant="outline"
            className="top-pill top-pill-default"
            onClick={() => setIsQueueDialogOpen(true)}
          >
            <span>{`${t('Queue')} ${runtime?.pendingCommands ?? 0}`}</span>
          </Button>
        ) : null}
      </div>

      {isQueueDialogOpen && runtime ? (
        <div className="extension-modal-backdrop" onClick={() => setIsQueueDialogOpen(false)}>
          <div className="extension-modal max-w-[560px]" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="extension-modal-title">{t('Queue Pi')}</div>
            <div className="mt-3 space-y-2 text-sm text-[#2c3140]">
              <div className="flex items-center justify-between rounded-lg bg-[#f5f7fb] px-3 py-2">
                <span>{t('Commandes en attente')}</span>
                <strong>{runtime.pendingCommands}</strong>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-[#f5f7fb] px-3 py-2">
                <span>{t('Message utilisateur en attente')}</span>
                <strong>{runtime.pendingUserMessage ? t('Oui') : t('Non')}</strong>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-[#f5f7fb] px-3 py-2">
                <span>{t('État runtime')}</span>
                <strong>{runtime.status}</strong>
              </div>
              {runtime.state ? (
                <div className="flex items-center justify-between rounded-lg bg-[#f5f7fb] px-3 py-2">
                  <span>{t('Messages en attente (session Pi)')}</span>
                  <strong>{runtime.state.pendingMessageCount}</strong>
                </div>
              ) : null}
              {runtime.lastError ? (
                <div className="rounded-lg border border-[#f2c9bf] bg-[#fff3ef] px-3 py-2 text-[#8a3d2a]">{runtime.lastError}</div>
              ) : null}
            </div>
            <div className="extension-modal-actions">
              <button type="button" className="extension-modal-btn extension-modal-btn-primary" onClick={() => setIsQueueDialogOpen(false)}>
                {t('Fermer')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  )
}
