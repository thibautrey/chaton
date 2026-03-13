import { useCallback, useState } from 'react'
import { Check, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'

import { ProjectIcon } from '@/components/sidebar/ProjectIcon'
import type { Project, ProjectSubFolder } from '@/features/workspace/types'

type ManageSubFolderProps = {
  folder: ProjectSubFolder
  allProjects: Project[]
  onClose: () => void
  onUpdate: (folderId: string, projectIds: string[]) => void
}

export function ManageSubFolder({ folder, allProjects, onClose, onUpdate }: ManageSubFolderProps) {
  const { t } = useTranslation()
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set(folder.projectIds))

  const toggleProject = useCallback((projectId: string) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }, [])

  const handleSave = useCallback(() => {
    onUpdate(folder.id, Array.from(selectedProjectIds))
  }, [folder.id, onUpdate, selectedProjectIds])

  return (
    <motion.div
      className="manage-subfolder-panel"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2 }}
    >
      <div className="manage-subfolder-header">
        <h3 className="manage-subfolder-title">
          {t('Gérer le dossier {{name}}', { name: folder.name })}
        </h3>
        <button
          type="button"
          className="manage-subfolder-close"
          onClick={onClose}
          aria-label={t('Fermer')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="manage-subfolder-list">
        {allProjects.length === 0 ? (
          <div className="manage-subfolder-empty">
            {t('Aucun projet trouvé')}
          </div>
        ) : (
          allProjects.map((project) => {
            const isSelected = selectedProjectIds.has(project.id)
            return (
              <motion.button
                key={project.id}
                type="button"
                className={`manage-subfolder-project ${isSelected ? 'manage-subfolder-project-selected' : ''}`}
                onClick={() => toggleProject(project.id)}
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
              >
                <span className="manage-subfolder-project-check">
                  {isSelected && <Check className="h-4 w-4" />}
                </span>
                <span className="project-leading-icon" aria-hidden="true">
                  <ProjectIcon icon={project.icon} size={16} loadAsDataUrl />
                </span>
                <span className="manage-subfolder-project-name truncate">
                  {project.name}
                </span>
              </motion.button>
            )
          })
        )}
      </div>

      <div className="manage-subfolder-actions">
        <button
          type="button"
          className="manage-subfolder-cancel-btn"
          onClick={onClose}
        >
          {t('Annuler')}
        </button>
        <button
          type="button"
          className="manage-subfolder-save-btn"
          onClick={handleSave}
        >
          {t('Enregistrer')}
        </button>
      </div>
    </motion.div>
  )
}