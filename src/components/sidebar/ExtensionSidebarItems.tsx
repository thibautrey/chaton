import { useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '@/features/workspace/store'
import { workspaceIpc } from '@/services/ipc/workspace'
import { getExtensionIcon } from '@/components/extensions/extension-icons'

type ExtensionUiEntry = {
  extensionId: string
  icon?: string
  iconUrl?: string
  enabled?: boolean
  sidebarMenuItems?: Array<{
    id: string
    label: string
    icon?: string
    openMainView?: string
    order?: number
  }>
}

export function ExtensionSidebarItems() {
  const { state, openExtensionMainView } = useWorkspace()
  const [entries, setEntries] = useState<ExtensionUiEntry[]>([])

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

  // Filter to only enabled extensions with sidebar menu items
  const sidebarItems = useMemo(() => {
    return entries
      .filter((entry) => entry.enabled !== false && (entry.sidebarMenuItems?.length ?? 0) > 0)
      .flatMap((entry) =>
        (entry.sidebarMenuItems ?? []).map((item) => ({
          extensionId: entry.extensionId,
          entry,
          item,
        }))
      )
      // Sort by item order or label for consistency
      .sort((a, b) => {
        const aOrder = typeof a.item.order === 'number' ? a.item.order : 999
        const bOrder = typeof b.item.order === 'number' ? b.item.order : 999
        if (aOrder !== bOrder) return aOrder - bOrder
        return a.item.label.localeCompare(b.item.label)
      })
  }, [entries])

  if (sidebarItems.length === 0) return null

  return (
    <>
      {sidebarItems.map(({ extensionId, entry, item }) => {
        const iconValue = getExtensionIcon(
          typeof entry.iconUrl === 'string' ? entry.iconUrl : entry.icon
        )
        const isActive =
          state.sidebarMode === 'extension-main-view' &&
          state.activeExtensionViewId === item.openMainView

        return (
          <button
            key={`${extensionId}:${item.id}`}
            type="button"
            className={`sidebar-item ${isActive ? 'sidebar-item-active' : ''}`}
            onClick={() => {
              if (item.openMainView) {
                openExtensionMainView(item.openMainView)
              }
            }}
            disabled={!item.openMainView}
          >
            {iconValue.kind === 'image' ? (
              <img
                src={iconValue.src}
                alt=""
                className="sidebar-nav-icon h-4 w-4 object-contain"
                loading="lazy"
              />
            ) : (
              <iconValue.Component className="sidebar-nav-icon h-4 w-4" />
            )}
            {item.label}
          </button>
        )
      })}
    </>
  )
}
