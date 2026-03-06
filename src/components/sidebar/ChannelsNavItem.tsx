import { useEffect, useState } from 'react'
import { MessageSquareShare } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { workspaceIpc } from '@/services/ipc/workspace'

function isChannelExtension(extension: { enabled?: boolean; config?: Record<string, unknown> | undefined }) {
  return extension.enabled !== false && extension.config?.kind === 'channel'
}

export function ChannelsNavItem({ active, onClick }: { active: boolean; onClick: () => void }) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let cancelled = false
    void workspaceIpc.listExtensions().then((result) => {
      if (cancelled) return
      const extensions = result.extensions ?? []
      setVisible(extensions.some((extension) => isChannelExtension(extension)))
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!visible) return null

  return (
    <button
      type="button"
      className={`sidebar-item ${active ? 'sidebar-item-active' : ''}`}
      onClick={onClick}
    >
      <MessageSquareShare className="sidebar-nav-icon h-4 w-4" />
      {t('Channels')}
    </button>
  )
}
