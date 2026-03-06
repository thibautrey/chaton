import { useEffect, useMemo, useState } from 'react'
import { MessageSquareShare } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { workspaceIpc } from '@/services/ipc/workspace'
import type { ChatonsExtension } from '@/features/workspace/types'
import { useWorkspace } from '@/features/workspace/store'

function isChannelExtension(extension: ChatonsExtension): boolean {
  return extension.config?.kind === 'channel'
}

type ExtensionMainView = {
  viewId: string
  title: string
  webviewUrl: string
  initialRoute?: string
}

type ExtensionUiEntry = {
  extensionId: string
  mainViews?: ExtensionMainView[]
}

export function ChannelsMainPanel() {
  const { t } = useTranslation()
  const { openExtensionMainView } = useWorkspace()
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
    return () => {
      cancelled = true
    }
  }, [])

  const channelExtensions = useMemo(() => {
    return extensions.filter((extension) => extension.enabled && isChannelExtension(extension))
  }, [extensions])

  const mainViewByExtensionId = useMemo(() => {
    const map = new Map<string, ExtensionMainView>()
    for (const entry of entries) {
      const firstMainView = entry.mainViews?.[0]
      if (firstMainView) {
        map.set(entry.extensionId, firstMainView)
      }
    }
    return map
  }, [entries])

  return (
    <div className="main-scroll">
      <section className="chat-section settings-main-wrap">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-0.02em] dark:text-[#eef2fb]">{t('Channels')}</h1>
            <p className="mt-1 text-xl text-[#5b5d65] dark:text-[#a6b2c9]">
              {t('Configurez vos passerelles de messagerie externes comme Telegram ou WhatsApp.')}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="mt-8 rounded-3xl border border-[#d7d8dd] bg-white/85 p-6 text-[#5b5d65] shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur dark:border-[#273043] dark:bg-[#121826]/85 dark:text-[#9fb0cc]">
            {t('Chargement...')}
          </div>
        ) : channelExtensions.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-[#d7d8dd] bg-white/80 p-8 text-[#5b5d65] shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur dark:border-[#273043] dark:bg-[#121826]/80 dark:text-[#9fb0cc]">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f3f4f7] text-[#45464d] dark:bg-[#1a2233] dark:text-[#d6def2]">
                <MessageSquareShare className="h-6 w-6" />
              </div>
              <div>
                <div className="text-lg font-semibold text-[#111827] dark:text-[#eef2fb]">{t('Aucun channel installé')}</div>
                <p className="mt-1 text-sm leading-6">
                  {t('Installez une extension de type channel pour connecter Chatons a Telegram, WhatsApp ou d\'autres messageries externes.')}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-8 grid gap-4">
            {channelExtensions.map((extension) => {
              const mainView = mainViewByExtensionId.get(extension.id)
              return (
                <section
                  key={extension.id}
                  className="rounded-3xl border border-[#d7d8dd] bg-white/88 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur dark:border-[#273043] dark:bg-[#121826]/88"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-xl font-semibold text-[#111827] dark:text-[#eef2fb]">{extension.name}</div>
                      <div className="mt-1 text-sm text-[#5b5d65] dark:text-[#9fb0cc]">{extension.description}</div>
                      <div className="mt-3 text-xs uppercase tracking-[0.16em] text-[#7a7d86] dark:text-[#7f8aa3]">
                        {extension.id}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full border border-[#d7d8dd] px-3 py-1 text-xs font-medium text-[#4b5563] dark:border-[#2a3448] dark:text-[#b8c4db]">
                        {t('Installée')}
                      </span>
                      <button
                        type="button"
                        className="rounded-2xl bg-[#1f2937] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#111827] dark:bg-[#e8eefc] dark:text-[#0f172a] dark:hover:bg-white"
                        onClick={() => {
                          if (mainView?.viewId) {
                            openExtensionMainView(mainView.viewId)
                          }
                        }}
                        disabled={!mainView?.viewId}
                      >
                        {t('Configurer')}
                      </button>
                    </div>
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
