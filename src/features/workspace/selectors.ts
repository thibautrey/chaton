import type { Conversation, SidebarSettings } from './types'

function sortConversations(items: Conversation[], settings: SidebarSettings) {
  const key = settings.sortBy === 'created' ? 'createdAt' : 'updatedAt'
  return [...items].sort((a, b) => b[key].localeCompare(a[key]))
}

function applyFilters(items: Conversation[], settings: SidebarSettings) {
  return items.filter((conversation) => {
    if (conversation.status === 'archived') {
      return false
    }

    // Hide conversations that come from channels - they are shown in the channels menu instead
    if (conversation.channelExtensionId !== null) {
      return false
    }

    if (settings.show === 'relevant' && !conversation.isRelevant) {
      return false
    }

    if (!settings.searchQuery) {
      return true
    }

    return conversation.title.toLowerCase().includes(settings.searchQuery.toLowerCase())
  })
}

export function selectVisibleConversations(conversations: Conversation[], settings: SidebarSettings) {
  return sortConversations(applyFilters(conversations, settings), settings)
}

export function selectConversationsForProject(
  conversations: Conversation[],
  projectId: string,
  settings: SidebarSettings,
) {
  return selectVisibleConversations(
    conversations.filter((conversation) => conversation.projectId === projectId),
    settings,
  )
}

export function selectGlobalConversations(conversations: Conversation[], settings: SidebarSettings) {
  return selectVisibleConversations(
    conversations.filter((conversation) => conversation.projectId === null),
    settings,
  )
}
