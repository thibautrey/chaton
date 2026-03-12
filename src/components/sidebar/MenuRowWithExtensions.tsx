import { useEffect, useMemo, useState } from 'react'
import { AdaptiveMenuRow } from '@/components/sidebar/AdaptiveMenuRow'
import { useWorkspace } from '@/features/workspace/store'
import { workspaceIpc } from '@/services/ipc/workspace'
import { ExtensionIcon } from '@/components/extensions/extension-icons'

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

interface MenuRowWithExtensionsProps {
  items: any[]
}

/**
 * Adaptive menu row that:
 * - Shows full-width buttons when there's enough vertical space
 * - Collapses to compact icon row when space is limited
 * - Automatically includes extension sidebar items (memory, automation, etc.)
 */
export function MenuRowWithExtensions({
  items,
}: MenuRowWithExtensionsProps) {
  const { state, openExtensionMainView } = useWorkspace()
  const [extensionItems, setExtensionItems] = useState<ExtensionUiEntry[]>([])

  useEffect(() => {
    let cancelled = false
    void workspaceIpc.registerExtensionUi().then((result) => {
      if (cancelled) return
      setExtensionItems((result.entries ?? []) as ExtensionUiEntry[])
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Convert extension sidebar items to MenuItem format
  const extensionMenuItems = useMemo(() => {
    return extensionItems
      .filter((entry) => entry.enabled !== false && (entry.sidebarMenuItems?.length ?? 0) > 0)
      .flatMap((entry) =>
        (entry.sidebarMenuItems ?? []).map((item) => ({
          extensionId: entry.extensionId,
          entry,
          item,
        }))
      )
      .sort((a, b) => {
        const aOrder = typeof a.item.order === 'number' ? a.item.order : 999
        const bOrder = typeof b.item.order === 'number' ? b.item.order : 999
        if (aOrder !== bOrder) return aOrder - bOrder
        return a.item.label.localeCompare(b.item.label)
      })
      .map(({ extensionId, item }) => {
        const isActive =
          state.sidebarMode === 'extension-main-view' &&
          state.activeExtensionViewId === item.openMainView

        return {
          id: `extension-${extensionId}:${item.id}`,
          label: item.label,
          icon: (
            <ExtensionIcon
              iconName={item.icon}
              extensionId={extensionId}
              className="h-4 w-4 object-contain"
            />
          ),
          onClick: () => {
            if (item.openMainView) {
              openExtensionMainView(item.openMainView)
            }
          },
          isActive,
        }
      })
  }, [extensionItems, state.sidebarMode, state.activeExtensionViewId, openExtensionMainView])

  // Combine built-in menu items with extension items
  const allItems = useMemo(() => [...items, ...extensionMenuItems], [items, extensionMenuItems])

  return <AdaptiveMenuRow items={allItems} expandThresholdPx={300} />
}
