import { Check, ChevronRight, FolderOpen, FolderPlus, Pencil, Plus, Trash2, X, Eye } from 'lucide-react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'

import { ProjectIcon } from '@/components/sidebar/ProjectIcon'
import { useWorkspace } from '@/features/workspace/store'
import type { Project, ProjectSubFolder } from '@/features/workspace/types'
import type { ResolvedSubFolder } from '@/components/sidebar/useProjectFolder'

// ── Types ──────────────────────────────────────────────────────────

import { ManageSubFolder } from '@/components/sidebar/ManageSubFolder'

type ProjectFolderProps = {
  autoFoldedProjects: Project[]
  archivedProjects?: Project[]
  subFolders: ResolvedSubFolder[]
  extensions?: Array<{ id: string; icon?: string; iconUrl?: string }>
}

// ── Helpers ────────────────────────────────────────────────────────

function generateId(): string {
  return `sf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ── SubFolderRow: a single named subfolder inside the popover ─────

function SubFolderRow({
  folder,
  onOpenProject,
  onRename,
  onDelete,
  onManage,
}: {
  folder: ResolvedSubFolder
  onOpenProject: (projectId: string) => void
  onRename: (folderId: string, name: string) => void
  onDelete: (folderId: string) => void
  onManage: (folder: ResolvedSubFolder) => void
}) {
  const { t } = useTranslation()
  const { state } = useWorkspace()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(folder.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const deleteTimerRef = useRef<number | null>(null)

  // Auto-expand subfolder when a project inside it is selected
  useEffect(() => {
    if (!expanded && state.selectedProjectId && folder.projects.some((p) => p.id === state.selectedProjectId)) {
      setExpanded(true)
    }
  }, [state.selectedProjectId, folder.projects, expanded])

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  useEffect(() => {
    return () => {
      if (deleteTimerRef.current !== null) window.clearTimeout(deleteTimerRef.current)
    }
  }, [])

  const commitRename = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== folder.name) {
      onRename(folder.id, trimmed)
    } else {
      setEditValue(folder.name)
    }
    setEditing(false)
  }

  const handleDeleteClick = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      if (deleteTimerRef.current !== null) window.clearTimeout(deleteTimerRef.current)
      deleteTimerRef.current = window.setTimeout(() => {
        setConfirmDelete(false)
        deleteTimerRef.current = null
      }, 2000)
      return
    }
    if (deleteTimerRef.current !== null) {
      window.clearTimeout(deleteTimerRef.current)
      deleteTimerRef.current = null
    }
    setConfirmDelete(false)
    onDelete(folder.id)
  }

  return (
    <div className="pf-subfolder">
      <div className="pf-subfolder-header">
        <motion.button
          type="button"
          className="pf-subfolder-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          whileTap={{ scale: 0.97 }}
        >
          <motion.span
            className="pf-subfolder-chevron"
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.15 }}
          >
            <ChevronRight className="h-3 w-3" />
          </motion.span>
          <FolderOpen className="h-3.5 w-3.5 pf-subfolder-icon" />
          {editing ? (
            <input
              ref={inputRef}
              className="pf-subfolder-name-input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') {
                  setEditValue(folder.name)
                  setEditing(false)
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="pf-subfolder-name truncate">{folder.name}</span>
          )}
          <span className="pf-subfolder-count">{folder.projects.length}</span>
        </motion.button>
        <div className="pf-subfolder-actions">
          <button
            type="button"
            className="pf-action-btn"
            onClick={(e) => {
              e.stopPropagation()
              setEditing(true)
              setEditValue(folder.name)
            }}
            aria-label={t('Renommer')}
            title={t('Renommer')}
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="pf-action-btn"
            onClick={(e) => {
              e.stopPropagation()
              onManage(folder)
            }}
            aria-label={t('Gérer le dossier')}
            title={t('Gérer le dossier')}
          >
            <FolderOpen className="h-3 w-3" />
          </button>
          <button
            type="button"
            className={`pf-action-btn ${confirmDelete ? 'pf-action-btn-danger' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              handleDeleteClick()
            }}
            aria-label={confirmDelete ? t('Confirmer la suppression') : t('Supprimer le dossier')}
            title={confirmDelete ? t('Cliquer pour confirmer') : t('Supprimer le dossier')}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            className="pf-subfolder-list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {folder.projects.length === 0 ? (
              <div className="pf-empty">{t('Aucun projet')}</div>
            ) : (
              folder.projects.map((project, i) => (
                <motion.button
                  key={project.id}
                  type="button"
                  className="pf-project-item"
                  onClick={() => onOpenProject(project.id)}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.025, duration: 0.15, ease: 'easeOut' }}
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="project-leading-icon" aria-hidden="true">
                    <ProjectIcon icon={project.icon} size={14} loadAsDataUrl />
                  </span>
                  <span className="pf-project-name truncate">{project.name}</span>
                </motion.button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── CreateSubFolderInline: inline form to create a new subfolder ──

function CreateSubFolderInline({
  autoFoldedProjects,
  onCreate,
  onCancel,
}: {
  autoFoldedProjects: Project[]
  onCreate: (name: string, projectIds: string[]) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const toggleProject = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed, Array.from(selectedIds))
  }

  return (
    <motion.div
      className="pf-create-form"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="pf-create-header">
        <FolderPlus className="h-3.5 w-3.5 pf-create-icon" />
        <span className="pf-create-title">{t('Nouveau dossier')}</span>
      </div>
      <input
        ref={inputRef}
        className="pf-create-input"
        placeholder={t('Nom du dossier')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit()
          if (e.key === 'Escape') onCancel()
        }}
      />
      {autoFoldedProjects.length > 0 && (
        <div className="pf-create-project-picker">
          <span className="pf-create-picker-label">{t('Ajouter des projets')}</span>
          <div className="pf-create-picker-list">
            {autoFoldedProjects.map((project) => {
              const selected = selectedIds.has(project.id)
              return (
                <button
                  key={project.id}
                  type="button"
                  className={`pf-create-picker-item ${selected ? 'pf-create-picker-item-selected' : ''}`}
                  onClick={() => toggleProject(project.id)}
                >
                  <span className={`pf-create-picker-check ${selected ? 'pf-create-picker-check-on' : ''}`}>
                    {selected && <Check className="h-2.5 w-2.5" />}
                  </span>
                  <ProjectIcon icon={project.icon} size={14} loadAsDataUrl />
                  <span className="truncate">{project.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      <div className="pf-create-actions">
        <button type="button" className="pf-btn-secondary" onClick={onCancel}>
          {t('Annuler')}
        </button>
        <button
          type="button"
          className="pf-btn-primary"
          disabled={!name.trim()}
          onClick={handleSubmit}
        >
          {t('Creer')}
        </button>
      </div>
    </motion.div>
  )
}

// ── Main ProjectFolder component ──────────────────────────────────

export const ProjectFolder = memo(function ProjectFolder({
  autoFoldedProjects,
  archivedProjects = [],
  subFolders,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  extensions: _extensions,
}: ProjectFolderProps) {
  const { t } = useTranslation()
  const { state, createConversationForProject, updateSettings, archiveProject, setProjectHidden, selectProject } = useWorkspace()
  const [isOpen, setIsOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [managingFolder, setManagingFolder] = useState<ProjectSubFolder | null>(null)

  // All projects in the folder section (auto-folded + subfolder contents + archived)
  const allFoldedCount = autoFoldedProjects.length + archivedProjects.length + subFolders.reduce((n, sf) => n + sf.projects.length, 0)

  const containerRef = useRef<HTMLDivElement>(null)

  // Close on click outside and handle escape
  useEffect(() => {
    if (!isOpen && !managingFolder) return

    function handleClickOutside(event: MouseEvent) {
      const modalElement = document.querySelector('.project-folder-modal')
      const manageModalElement = document.querySelector('.manage-subfolder-modal')
      const containerElement = containerRef.current
      
      // If clicking inside any modal content, don't close
      if (modalElement && modalElement.contains(event.target as Node)) return
      if (manageModalElement && manageModalElement.contains(event.target as Node)) return
      if (containerElement && containerElement.contains(event.target as Node)) return
      
      // Otherwise close everything
      setIsOpen(false)
      setIsCreating(false)
      setManagingFolder(null)
    }
    
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (isCreating) setIsCreating(false)
        else if (managingFolder) setManagingFolder(null)
        else setIsOpen(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, isCreating, managingFolder])

  // ── Settings mutations ──

  const persistSubFolders = useCallback(
    (nextDefs: ProjectSubFolder[]) => {
      void updateSettings({
        ...state.settings,
        projectSubFolders: nextDefs,
      })
    },
    [state.settings, updateSettings],
  )

  const handleCreateSubFolder = useCallback(
    (name: string, projectIds: string[]) => {
      const newFolder: ProjectSubFolder = {
        id: generateId(),
        name,
        projectIds,
      }
      persistSubFolders([...(state.settings.projectSubFolders ?? []), newFolder])
      setIsCreating(false)
    },
    [state.settings.projectSubFolders, persistSubFolders],
  )

  const handleRenameSubFolder = useCallback(
    (folderId: string, newName: string) => {
      const updated = (state.settings.projectSubFolders ?? []).map((sf) =>
        sf.id === folderId ? { ...sf, name: newName } : sf,
      )
      persistSubFolders(updated)
    },
    [state.settings.projectSubFolders, persistSubFolders],
  )

  const handleDeleteSubFolder = useCallback(
    (folderId: string) => {
      const updated = (state.settings.projectSubFolders ?? []).filter((sf) => sf.id !== folderId)
      persistSubFolders(updated)
    },
    [state.settings.projectSubFolders, persistSubFolders],
  )

  const handleUpdateSubFolder = useCallback(
    (folderId: string, projectIds: string[]) => {
      const updated = (state.settings.projectSubFolders ?? []).map((sf) =>
        sf.id === folderId ? { ...sf, projectIds } : sf,
      )
      persistSubFolders(updated)
    },
    [state.settings.projectSubFolders, persistSubFolders],
  )

  const handleManageSubFolder = useCallback(
    (folder: ResolvedSubFolder) => {
      const folderDef = state.settings.projectSubFolders.find(sf => sf.id === folder.id)
      if (folderDef) {
        setIsCreating(false)
        setManagingFolder(folderDef)
      }
    },
    [state.settings.projectSubFolders],
  )

  const handleOpenProject = useCallback(
    (projectId: string) => {
      setIsOpen(false)
      setIsCreating(false)
      void createConversationForProject(projectId)
      selectProject(projectId)
    },
    [createConversationForProject, selectProject],
  )

  if (allFoldedCount === 0 && subFolders.length === 0) return null

  // Show up to 4 mini icons in the row preview
  const previewProjects = [
    ...subFolders.flatMap((sf) => sf.projects),
    ...autoFoldedProjects,
  ].slice(0, 4)
  const extraCount = Math.max(0, allFoldedCount - previewProjects.length)

  return (
    <>
      <div className="project-folder-container">
        <motion.button
          type="button"
          className="project-folder-row"
          onClick={() => {
            setIsOpen((prev) => !prev)
            if (isOpen) setIsCreating(false)
          }}
          aria-expanded={isOpen}
          aria-label={t('{{count}} projets groupes', { count: allFoldedCount })}
          whileTap={{ scale: 0.98 }}
        >
          <span className="project-folder-icons">
            {previewProjects.map((project, i) => (
              <motion.span
                key={`${project.id}-${allFoldedCount}`}
                className="project-folder-icon-slot"
                layout
                initial={{ opacity: 0, scale: 0.6, x: -4 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.6, x: -4 }}
                transition={{ delay: i * 0.04, duration: 0.18, ease: 'easeOut' }}
              >
                <ProjectIcon icon={project.icon} size={14} loadAsDataUrl />
              </motion.span>
            ))}
            {extraCount > 0 && (
              <motion.span
                key={`extra-count-${allFoldedCount}`}
                className="project-folder-extra-count"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                +{extraCount}
              </motion.span>
            )}
          </span>
          <span className="project-folder-label">
            {t('{{count}} projets', { count: allFoldedCount })}
          </span>
        </motion.button>
      </div>

      {/* Project Folder Modal - displayed as overlay */}
      {isOpen && createPortal(
        <div className="project-folder-modal-overlay">
          <AnimatePresence>
            <motion.div
              className="project-folder-modal"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Header */}
              <div className="project-folder-popover-header">
                <span className="project-folder-popover-title">
                  {t('Projets groupes')}
                </span>
                <div className="pf-header-actions">
                  <button
                    type="button"
                    className="pf-header-action-btn"
                    onClick={() => setIsCreating((v) => !v)}
                    aria-label={t('Nouveau dossier')}
                    title={t('Nouveau dossier')}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="project-folder-popover-close"
                    onClick={() => {
                      setIsOpen(false)
                      setIsCreating(false)
                    }}
                    aria-label={t('Fermer')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="project-folder-popover-list">
                {/* Create form */}
                <AnimatePresence>
                  {isCreating && (
                    <CreateSubFolderInline
                      autoFoldedProjects={autoFoldedProjects}
                      onCreate={handleCreateSubFolder}
                      onCancel={() => setIsCreating(false)}
                    />
                  )}
                </AnimatePresence>

                {/* User-created subfolders */}
                {subFolders.map((folder) => (
                  <SubFolderRow
                    key={folder.id}
                    folder={folder}
                    onOpenProject={handleOpenProject}
                    onRename={handleRenameSubFolder}
                    onDelete={handleDeleteSubFolder}
                    onManage={handleManageSubFolder}
                  />
                ))}

                {/* Divider between subfolders and loose auto-folded projects */}
                {subFolders.length > 0 && (autoFoldedProjects.length > 0 || archivedProjects.length > 0) && (
                  <div className="pf-divider" />
                )}

                {/* Archived projects section */}
                {archivedProjects.length > 0 && (
                  <>
                    <div className="pf-section-label">{t('Projets masqués')}</div>
                    {archivedProjects.map((project, i) => (
                      <div key={project.id} className="pf-project-item-wrapper">
                        <motion.button
                          type="button"
                          className="pf-project-item"
                          onClick={() => handleOpenProject(project.id)}
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{
                            delay: i * 0.03,
                            duration: 0.18,
                            ease: 'easeOut',
                          }}
                          whileHover={{ x: 2 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <span className="project-leading-icon opacity-50" aria-hidden="true">
                            <ProjectIcon icon={project.icon} loadAsDataUrl />
                          </span>
                          <span className="project-folder-popover-name truncate opacity-50">
                            {project.name}
                          </span>
                        </motion.button>
                        <button
                          type="button"
                          className="pf-project-action"
                          title={t('Afficher le projet')}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            void archiveProject(project.id, false)
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </>
                )}

                {/* Divider between archived and auto-folded projects */}
                {archivedProjects.length > 0 && autoFoldedProjects.length > 0 && (
                  <div className="pf-divider" />
                )}

                {/* Auto-folded projects (not in any subfolder) */}
                {autoFoldedProjects.map((project, i) => (
                  <div key={project.id} className="pf-project-item-wrapper">
                    <motion.button
                      type="button"
                      className="pf-project-item"
                      onClick={() => handleOpenProject(project.id)}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: i * 0.03,
                        duration: 0.18,
                        ease: 'easeOut',
                      }}
                      whileHover={{ x: 2 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span className="project-leading-icon" aria-hidden="true">
                        <ProjectIcon icon={project.icon} loadAsDataUrl />
                      </span>
                      <span className="project-folder-popover-name truncate">
                        {project.name}
                      </span>
                    </motion.button>
                    {project.isHidden && (
                      <button
                        type="button"
                        className="pf-project-action"
                        title={t('Afficher le projet')}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setProjectHidden(project.id, false)
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>,
        document.body
      )}
      
      {/* Manage SubFolder Modal - displayed outside popover */}
      {managingFolder && createPortal(
        <div className="manage-subfolder-modal-overlay">
          <AnimatePresence>
            <motion.div
              className="manage-subfolder-modal"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              transition={{ duration: 0.2 }}
            >
              <ManageSubFolder
                folder={managingFolder}
                allProjects={state.projects}
                onClose={() => setManagingFolder(null)}
                onUpdate={handleUpdateSubFolder}
              />
            </motion.div>
          </AnimatePresence>
        </div>,
        document.body
      )}
    </>
  )
})
