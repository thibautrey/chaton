import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FolderGit2, FolderOpen, Image, MessageSquare, PencilLine, Smile, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ProjectImageThumbnail } from '@/components/sidebar/ProjectImageThumbnail'
import { useWorkspace } from '@/features/workspace/store'
import type { Project, ProjectSubFolder } from '@/features/workspace/types'

type ProjectDetailsSheetProps = {
  project: Project | null
  open: boolean
  onClose: () => void
  onProjectUpdated?: (projectId: string, icon: string | null) => void
  onSubFolderChange?: (projectId: string, folderId: string | null) => void
  availableSubFolders?: ProjectSubFolder[]
}

type IconTab = 'emoji' | 'project' | 'file'

const ICON_OPTIONS = ['📁', '🐱', '🚀', '⚡', '🧠', '💻', '🛠️', '📦', '🌈', '🔥', '⭐', '🎯'] as const

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

/** Render the icon preview — emoji text or an <img> for file:// paths (with data URL) */
function IconPreview({ icon, size = 20 }: { icon: string | null | undefined; size?: number }) {
  const trimmed = icon?.trim()
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!trimmed?.startsWith('file://')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDataUrl(null)
      return
    }
    let cancelled = false
    const imagePath = trimmed.replace(/^file:\/\//, '')
    window.chaton
      .imageToDataUrl(imagePath)
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDataUrl(null)
        }
      })
    return () => { cancelled = true }
  }, [trimmed])

  if (!trimmed) {
    return <FolderGit2 style={{ width: size, height: size }} />
  }
  if (trimmed.startsWith('file://')) {
    if (dataUrl) {
      return (
        <img
          src={dataUrl}
          alt=""
          style={{ width: size, height: size, objectFit: 'cover', borderRadius: 4 }}
          draggable={false}
        />
      )
    }
    return <FolderGit2 style={{ width: size, height: size, opacity: 0.5 }} />
  }
  return <span>{trimmed}</span>
}

export function ProjectDetailsSheet({ project, open, onClose, onProjectUpdated, onSubFolderChange, availableSubFolders = [] }: ProjectDetailsSheetProps) {
  const { t } = useTranslation()
  const { state, updateProjectIcon } = useWorkspace()
  const [iconDraft, setIconDraft] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<IconTab>('emoji')
  const [projectImages, setProjectImages] = useState<string[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [shouldCloseAfterSave, setShouldCloseAfterSave] = useState(false)

  // Sync draft from project
  useEffect(() => {
    setIconDraft(project?.icon ?? '')
    setActiveTab('emoji')
    setProjectImages([])
  }, [project?.icon, project?.id])

  // Listen for the icon update in workspace state and close the sheet after it's reflected
  useEffect(() => {
    if (!shouldCloseAfterSave || !project) return
    
    const updatedProject = state.projects.find((p) => p.id === project.id)
    if (updatedProject && updatedProject.icon === (iconDraft.trim() || null)) {
      setShouldCloseAfterSave(false)
      onClose()
    }
  }, [shouldCloseAfterSave, state.projects, project, iconDraft, onClose])

  // Escape closes
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Scan project images when "project" tab opens
  useEffect(() => {
    if (activeTab !== 'project' || !project?.id || projectImages.length > 0) return
    let cancelled = false
    setIsScanning(true)
    window.chaton
      .scanProjectImages(project.id)
      .then((result) => {
        if (!cancelled && result.ok) {
          setProjectImages(result.images)
        }
      })
      .finally(() => {
        if (!cancelled) setIsScanning(false)
      })
    return () => { cancelled = true }
  }, [activeTab, project?.id, projectImages.length])

  const projectConversations = useMemo(
    () => state.conversations.filter((c) => c.projectId === project?.id),
    [state.conversations, project?.id],
  )

  const stats = useMemo(() => {
    const activeCount = projectConversations.filter((c) => c.status === 'active').length
    const doneCount = projectConversations.filter((c) => c.status === 'done').length
    const archivedCount = projectConversations.filter((c) => c.status === 'archived').length
    return { conversationCount: projectConversations.length, activeCount, doneCount, archivedCount }
  }, [projectConversations])

  // Find current subfolder for this project
  const currentSubFolderId = useMemo(() => {
    return availableSubFolders.find(f => f.projectIds.includes(project?.id || ''))?.id || null
  }, [availableSubFolders, project?.id])

  const handleSaveIcon = useCallback(async (iconValue?: string) => {
    if (!project || isSaving) return
    const value = iconValue ?? iconDraft
    setIsSaving(true)
    try {
      const normalizedValue = value.trim() || null
      const result = await updateProjectIcon(project.id, normalizedValue)
      if (result.ok) {
        onProjectUpdated?.(project.id, normalizedValue)
        // Set flag to close after state update is reflected
        setShouldCloseAfterSave(true)
      }
    } finally {
      setIsSaving(false)
    }
  }, [project, isSaving, iconDraft, updateProjectIcon, onProjectUpdated])

  const handlePickFile = useCallback(async () => {
    const filePath = await window.chaton.pickIconImage()
    if (filePath) {
      const iconValue = `file://${filePath}`
      setIconDraft(iconValue)
      void handleSaveIcon(iconValue)
    }
  }, [handleSaveIcon])

  const handleSelectProjectImage = useCallback((imagePath: string) => {
    const iconValue = `file://${imagePath}`
    setIconDraft(iconValue)
    void handleSaveIcon(iconValue)
  }, [handleSaveIcon])

  const tabs: { id: IconTab; label: string; icon: React.ReactNode }[] = [
    { id: 'emoji', label: t('Emoji'), icon: <Smile className="h-3.5 w-3.5" /> },
    { id: 'project', label: t('Projet'), icon: <Image className="h-3.5 w-3.5" /> },
    { id: 'file', label: t('Fichier'), icon: <FolderOpen className="h-3.5 w-3.5" /> },
  ]

  return (
    <AnimatePresence>
      {open && project ? (
        <>
          <motion.div
            className="project-sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          <motion.aside
            className="project-sheet"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            aria-label={t('Details du projet')}
          >
            <div className="project-sheet-header">
              <div className="project-sheet-heading">
                <div className="project-sheet-icon-preview" aria-hidden="true">
                  <IconPreview icon={iconDraft || project.icon} size={20} />
                </div>
                <div>
                  <h2 className="project-sheet-title">{project.name}</h2>
                  <p className="project-sheet-subtitle">{project.repoName}</p>
                </div>
              </div>
              <button
                type="button"
                className="project-sheet-close"
                onClick={onClose}
                aria-label={t('Fermer')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {onSubFolderChange && (
              <div className="project-sheet-subfolder-selector">
                <select
                  className="project-sheet-subfolder-select"
                  value={currentSubFolderId || ''}
                  onChange={(e) => onSubFolderChange(project?.id || '', e.target.value || null)}
                >
                  <option value="">{t('Aucun dossier')}</option>
                  {availableSubFolders.map((folder) => (
                    <option key={folder.id} value={folder.id}>{folder.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="project-sheet-body">
              {/* Project info */}
              <section className="project-sheet-section">
                <h3 className="project-sheet-section-title">{t('Informations principales')}</h3>
                <dl className="project-sheet-meta">
                  <div>
                    <dt>{t('Nom')}</dt>
                    <dd>{project.name}</dd>
                  </div>
                  <div>
                    <dt>{t('Repository')}</dt>
                    <dd>{project.repoName}</dd>
                  </div>
                  <div>
                    <dt>{t('Chemin')}</dt>
                    <dd className="project-sheet-path">{project.repoPath}</dd>
                  </div>
                  <div>
                    <dt>{t('Cree le')}</dt>
                    <dd>{formatDate(project.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>{t('Derniere mise a jour')}</dt>
                    <dd>{formatDate(project.updatedAt)}</dd>
                  </div>
                </dl>
              </section>

              {/* Stats */}
              <section className="project-sheet-section">
                <h3 className="project-sheet-section-title">{t('Stats')}</h3>
                <div className="project-sheet-stats-grid">
                  <div className="project-sheet-stat-card">
                    <MessageSquare className="h-4 w-4" />
                    <span className="project-sheet-stat-value">{stats.conversationCount}</span>
                    <span className="project-sheet-stat-label">{t('Fils')}</span>
                  </div>
                  <div className="project-sheet-stat-card">
                    <PencilLine className="h-4 w-4" />
                    <span className="project-sheet-stat-value">{stats.activeCount}</span>
                    <span className="project-sheet-stat-label">{t('Actifs')}</span>
                  </div>
                  <div className="project-sheet-stat-card">
                    <span className="project-sheet-stat-badge project-sheet-stat-badge-done" />
                    <span className="project-sheet-stat-value">{stats.doneCount}</span>
                    <span className="project-sheet-stat-label">{t('Termines')}</span>
                  </div>
                  <div className="project-sheet-stat-card">
                    <span className="project-sheet-stat-badge project-sheet-stat-badge-archived" />
                    <span className="project-sheet-stat-value">{stats.archivedCount}</span>
                    <span className="project-sheet-stat-label">{t('Archives')}</span>
                  </div>
                </div>
              </section>

              {/* Icon picker with tabs */}
              <section className="project-sheet-section">
                <h3 className="project-sheet-section-title">{t('Icone du projet')}</h3>

                {/* Tab bar */}
                <div className="project-sheet-tabs" role="tablist">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === tab.id}
                      className={`project-sheet-tab ${activeTab === tab.id ? 'project-sheet-tab-active' : ''}`}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>

                {/* Tab: Emoji */}
                {activeTab === 'emoji' && (
                  <div className="project-sheet-tab-panel">
                    <p className="project-sheet-helper">
                      {t('Choisissez un emoji ou saisissez-en un.')}
                    </p>
                    <div className="project-sheet-icon-grid">
                      {ICON_OPTIONS.map((icon) => {
                        const active = iconDraft === icon
                        return (
                          <button
                            key={icon}
                            type="button"
                            className={`project-sheet-icon-option ${active ? 'project-sheet-icon-option-active' : ''}`}
                            onClick={() => setIconDraft(icon)}
                            aria-pressed={active}
                          >
                            {icon}
                          </button>
                        )
                      })}
                    </div>

                    <label className="project-sheet-custom-icon-label">
                      <span>{t('Icone personnalisee')}</span>
                      <input
                        className="project-sheet-custom-icon-input"
                        type="text"
                        maxLength={2}
                        value={iconDraft.startsWith('file://') ? '' : iconDraft}
                        onChange={(event) => setIconDraft(event.target.value.slice(0, 2))}
                        placeholder="..."
                      />
                    </label>

                    <div className="project-sheet-actions">
                      <button
                        type="button"
                        className="project-sheet-secondary-button"
                        onClick={() => setIconDraft('')}
                      >
                        {t('Reinitialiser')}
                      </button>
                      <button
                        type="button"
                        className="project-sheet-primary-button"
                        onClick={() => { void handleSaveIcon() }}
                        disabled={isSaving}
                      >
                        {isSaving ? t('Enregistrement...') : t('Enregistrer')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Tab: Project images */}
                {activeTab === 'project' && (
                  <div className="project-sheet-tab-panel">
                    <p className="project-sheet-helper">
                      {t('Images detectees dans le dossier du projet.')}
                    </p>
                    {isScanning ? (
                      <p className="project-sheet-helper">{t('Recherche en cours...')}</p>
                    ) : projectImages.length === 0 ? (
                      <p className="project-sheet-helper">{t('Aucune image trouvee.')}</p>
                    ) : (
                      <div className="project-sheet-image-grid">
                        {projectImages.map((imagePath) => {
                          const isActive = iconDraft === `file://${imagePath}`
                          const fileName = imagePath.split('/').pop() ?? imagePath
                          return (
                            <ProjectImageThumbnail
                              key={imagePath}
                              imagePath={imagePath}
                              fileName={fileName}
                              isActive={isActive}
                              onClick={() => handleSelectProjectImage(imagePath)}
                            />
                          )
                        })}
                      </div>
                    )}

                    <div className="project-sheet-actions">
                      <button
                        type="button"
                        className="project-sheet-secondary-button"
                        onClick={() => {
                          setIconDraft('')
                          void handleSaveIcon('')
                        }}
                      >
                        {t('Reinitialiser')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Tab: File picker */}
                {activeTab === 'file' && (
                  <div className="project-sheet-tab-panel">
                    <p className="project-sheet-helper">
                      {t('Ouvrir le selecteur de fichiers pour choisir une image.')}
                    </p>
                    <button
                      type="button"
                      className="project-sheet-pick-file-button"
                      onClick={() => { void handlePickFile() }}
                      disabled={isSaving}
                    >
                      <FolderOpen className="h-5 w-5" />
                      <span>{t('Parcourir...')}</span>
                    </button>

                    <div className="project-sheet-actions">
                      <button
                        type="button"
                        className="project-sheet-secondary-button"
                        onClick={() => {
                          setIconDraft('')
                          void handleSaveIcon('')
                        }}
                      >
                        {t('Reinitialiser')}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  )
}
