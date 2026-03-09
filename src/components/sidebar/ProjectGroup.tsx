import { FolderGit2, PencilLine, Trash2 } from 'lucide-react'
import { memo, type MouseEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'

import { ConversationRow } from '@/components/sidebar/ConversationRow'
import { useWorkspace } from '@/features/workspace/store'
import { selectConversationsForProject } from '@/features/workspace/selectors'
import type { Project, Conversation } from '@/features/workspace/types'
import { perfMonitor } from '@/features/workspace/store/perf-monitor'
import { usePiStore } from '@/features/workspace/store/pi-store'

type ProjectGroupProps = {
  project: Project
  extensions?: Array<{ id: string; icon?: string; iconUrl?: string }>
}

export const ProjectGroup = memo(function ProjectGroup({ project, extensions = [] }: ProjectGroupProps) {
  perfMonitor.recordComponentRender('ProjectGroup')
  const { t } = useTranslation()
  const { state, selectConversation, selectProject, createConversationForProject, toggleProjectCollapsed, deleteConversation, deleteProject } =
    useWorkspace()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [afficherTousLesFils, setAfficherTousLesFils] = useState(false)
  const resetTimerRef = useRef<number | null>(null)

  // Access pi store to check conversation activity status
  const piStore = usePiStore((s) => s)

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

  // Helper function to check if a conversation is running or has completed an action
  const isConversationPrioritized = (conversation: Conversation): boolean => {
    const runtime = piStore.piByConversation[conversation.id]
    const isActive =
      runtime?.status === 'streaming' ||
      runtime?.status === 'starting' ||
      !!runtime?.pendingUserMessage
    const hasCompletedAction = !!piStore.completedActionByConversation[conversation.id]
    return isActive || hasCompletedAction
  }

  // Separate conversations into prioritized (running/completed) and regular
  const prioritizedConversations = conversations.filter(isConversationPrioritized)
  const regularConversations = conversations.filter((c) => !isConversationPrioritized(c))

  // For regular conversations, only show first THREAD_LIMIT if not showing all
  const displayedRegularConversations = afficherTousLesFils
    ? regularConversations
    : regularConversations.slice(0, THREAD_LIMIT)

  // Always show all prioritized conversations, then add regular ones
  const displayedConversations = [...prioritizedConversations, ...displayedRegularConversations]

  // Check if there are hidden regular conversations
  const hasHiddenRegularConversations = regularConversations.length > THREAD_LIMIT && !afficherTousLesFils

  useEffect(() => {
    if (!hasHiddenRegularConversations && afficherTousLesFils) {
      setAfficherTousLesFils(false)
    }
  }, [hasHiddenRegularConversations, afficherTousLesFils])

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
                      onSelect={selectConversation}
                      onDelete={deleteConversation}
                      extensions={extensions}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
            {hasHiddenRegularConversations && (
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
}, (prevProps, nextProps) => {
  // Memoization: only re-render if project data changed
  if (prevProps.project.id !== nextProps.project.id) return false
  if (prevProps.project.name !== nextProps.project.name) return false
  if (prevProps.extensions?.length !== nextProps.extensions?.length) return false
  return true
})
