import { FolderGit2, PencilLine, Trash2 } from 'lucide-react'
import { type MouseEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConversationRow } from '@/components/sidebar/ConversationRow'
import { useWorkspace } from '@/features/workspace/store'
import { selectConversationsForProject } from '@/features/workspace/selectors'
import type { Project } from '@/features/workspace/types'

type ProjectGroupProps = {
  project: Project
}

export function ProjectGroup({ project }: ProjectGroupProps) {
  const { t } = useTranslation()
  const { state, selectConversation, selectProject, createConversationForProject, toggleProjectCollapsed, deleteConversation, deleteProject } =
    useWorkspace()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const resetTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

  const scheduleReset = () => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current)
    }
    resetTimerRef.current = window.setTimeout(() => {
      setConfirmDelete(false)
      resetTimerRef.current = null
    }, 2000)
  }

  const onDeleteClick = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()

    if (!confirmDelete) {
      setConfirmDelete(true)
      scheduleReset()
      return
    }

    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }
    setConfirmDelete(false)
    await deleteProject(project.id)
  }

  const conversations = selectConversationsForProject(state.conversations, project.id, state.settings)
  const collapsed = state.settings.collapsedProjectIds.includes(project.id)
  const sectionId = `project-section-${project.id}`

  return (
    <section className="project-group" aria-labelledby={`project-label-${project.id}`}>
      <div className={`project-header-row ${state.selectedProjectId === project.id ? 'project-header-active' : ''}`}>
        <button
          id={`project-label-${project.id}`}
          type="button"
          className="project-header"
          onClick={() => {
            selectProject(project.id)
            void toggleProjectCollapsed(project.id)
          }}
          aria-expanded={!collapsed}
          aria-controls={sectionId}
        >
          <FolderGit2 className="h-4 w-4" />
          <span className="project-title truncate">{project.name}</span>
        </button>
        <button
          type="button"
          className="project-action-button"
          aria-label={`Créer un fil à partir de ${project.name}`}
          title="Créer un fil"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void createConversationForProject(project.id)
          }}
        >
          <PencilLine className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={`project-action-button ${confirmDelete ? 'project-action-button-confirm' : ''}`}
          aria-label={confirmDelete ? t('Confirmer la suppression de {{name}}', { name: project.name }) : t('Supprimer {{name}}', { name: project.name })}
          title={confirmDelete ? t('Cliquer à nouveau pour supprimer') : t('Supprimer le projet')}
          onClick={(event) => {
            void onDeleteClick(event)
          }}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

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
                isStreaming={state.piByConversation[conversation.id]?.status === 'streaming'}
                onSelect={selectConversation}
                onDelete={deleteConversation}
              />
            ))
          )}
        </div>
      ) : null}
    </section>
  )
}
