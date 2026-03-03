import { ChevronDown, FolderGit2 } from 'lucide-react'

import { ConversationRow } from '@/components/sidebar/ConversationRow'
import { useWorkspace } from '@/features/workspace/store'
import { selectConversationsForProject } from '@/features/workspace/selectors'
import type { Project } from '@/features/workspace/types'

type ProjectGroupProps = {
  project: Project
}

export function ProjectGroup({ project }: ProjectGroupProps) {
  const { state, selectConversation, selectProject, toggleProjectCollapsed } = useWorkspace()

  const conversations = selectConversationsForProject(state.conversations, project.id, state.settings)
  const collapsed = state.settings.collapsedProjectIds.includes(project.id)
  const sectionId = `project-section-${project.id}`

  return (
    <section className="project-group" aria-labelledby={`project-label-${project.id}`}>
      <button
        id={`project-label-${project.id}`}
        type="button"
        className={`project-header ${state.selectedProjectId === project.id ? 'project-header-active' : ''}`}
        onClick={() => {
          selectProject(project.id)
          void toggleProjectCollapsed(project.id)
        }}
        aria-expanded={!collapsed}
        aria-controls={sectionId}
      >
        <FolderGit2 className="h-4 w-4" />
        <span className="truncate">{project.name}</span>
        <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
      </button>

      {!collapsed ? (
        <div id={sectionId} role="list" className="sidebar-thread-list">
          {conversations.length === 0 ? (
            <div className="empty-thread-state">Aucun fil pour ce projet</div>
          ) : (
            conversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                isActive={state.selectedConversationId === conversation.id}
                onSelect={selectConversation}
              />
            ))
          )}
        </div>
      ) : null}
    </section>
  )
}
