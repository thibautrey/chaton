import { FolderGit2, PencilLine, Trash2 } from 'lucide-react'
import { type MouseEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'

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
  const [afficherTousLesFils, setAfficherTousLesFils] = useState(false)
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
  const THREAD_LIMIT = 5
  const isOverflowing = conversations.length > THREAD_LIMIT
  const displayedConversations = afficherTousLesFils || !isOverflowing ? conversations : conversations.slice(0, THREAD_LIMIT)

  useEffect(() => {
    if (!isOverflowing && afficherTousLesFils) {
      setAfficherTousLesFils(false)
    }
  }, [isOverflowing, afficherTousLesFils])

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

      <AnimatePresence initial={false}>
        {!collapsed ? (
          <motion.div
            id={sectionId}
            role="list"
            className="sidebar-thread-list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            {conversations.length === 0 ? (
              <div className="empty-thread-state">{t('Aucun fil pour ce projet')}</div>
            ) : (
              <AnimatePresence initial={false}>
                {displayedConversations.map((conversation) => (
                  <motion.div
                    key={conversation.id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                  >
                    <ConversationRow
                      conversation={conversation}
                      isActive={state.selectedConversationId === conversation.id}
                      isStreaming={state.piByConversation[conversation.id]?.status === 'streaming'}
                      onSelect={selectConversation}
                      onDelete={deleteConversation}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
            {isOverflowing && (
              <button
                type="button"
                className="sidebar-show-more"
                onClick={() => setAfficherTousLesFils((actuel) => !actuel)}
              >
                {afficherTousLesFils ? t('Masquer les fils') : t('Plus de fils')}
              </button>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  )
}
