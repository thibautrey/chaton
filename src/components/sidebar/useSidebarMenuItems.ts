import { useMemo } from 'react'
import type { MenuItem } from '@/components/sidebar/MenuRow'

interface MenuConfig {
  sidebarMode: string | null
  extensionUpdatesCount: number
  onOpenSkills: () => void
  onOpenExtensions: () => void
  onOpenChannels: () => void
  onOpenNewConversation: () => void
}

/**
 * Hook to generate menu items for the top navigation
 * Returns TWO arrays:
 * - alwaysVisible: Items that never go in the folder (e.g., "New Conversation")
 * - foldableItems: Items that go in the folder when needed
 */
export function useSidebarMenuItems({
  sidebarMode,
  extensionUpdatesCount,
  onOpenSkills,
  onOpenExtensions,
  onOpenChannels,
  onOpenNewConversation,
}: MenuConfig): {
  alwaysVisible: MenuItem[]
  foldableItems: MenuItem[]
} {
  return useMemo(() => {
    const alwaysVisible: MenuItem[] = [
      {
        id: 'new-conversation',
        label: 'Nouvelle conversation',
        icon: null, // Will be provided by parent
        onClick: onOpenNewConversation,
        isPinned: true,
      },
    ]

    const foldableItems: MenuItem[] = [
      {
        id: 'skills',
        label: 'Compétences',
        icon: null,
        onClick: onOpenSkills,
        isActive: sidebarMode === 'skills',
      },
      {
        id: 'extensions',
        label: 'Extensions',
        icon: null,
        onClick: onOpenExtensions,
        isActive: sidebarMode === 'extensions',
        badge: extensionUpdatesCount > 0 ? extensionUpdatesCount : undefined,
      },
      {
        id: 'channels',
        label: 'Channels',
        icon: null,
        onClick: onOpenChannels,
        isActive: sidebarMode === 'channels',
      },
    ]

    return { alwaysVisible, foldableItems }
  }, [
    sidebarMode,
    extensionUpdatesCount,
    onOpenSkills,
    onOpenExtensions,
    onOpenChannels,
    onOpenNewConversation,
  ])
}
