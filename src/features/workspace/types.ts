export type ConversationStatus = 'active' | 'done' | 'archived'

export type Project = {
  id: string
  name: string
  repoPath: string
  repoName: string
  createdAt: string
  updatedAt: string
  isArchived: boolean
}

export type Conversation = {
  id: string
  projectId: string
  title: string
  status: ConversationStatus
  isRelevant: boolean
  createdAt: string
  updatedAt: string
  lastMessageAt: string
}

export type SidebarSettings = {
  organizeBy: 'project' | 'chronological'
  sortBy: 'created' | 'updated'
  show: 'all' | 'relevant'
  searchQuery: string
  collapsedProjectIds: string[]
}

export type WorkspaceState = {
  projects: Project[]
  conversations: Conversation[]
  selectedProjectId: string | null
  selectedConversationId: string | null
  settings: SidebarSettings
  notice: string | null
}

export type WorkspacePayload = {
  projects: Project[]
  conversations: Conversation[]
  settings: SidebarSettings
}
