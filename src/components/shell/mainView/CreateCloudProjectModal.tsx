import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export interface CloudInstance {
  id: string
  name: string
  baseUrl: string
}

export interface CreateCloudProjectModalProps {
  instances: CloudInstance[]
  onConfirm: (data: {
    instanceId: string
    projectName: string
    organizationName: string
    organizationId: string
  }) => void
  onCancel: () => void
}

export function CreateCloudProjectModal({
  instances,
  onConfirm,
  onCancel,
}: CreateCloudProjectModalProps) {
  const { t } = useTranslation()
  const [selectedInstanceIndex, setSelectedInstanceIndex] = useState(0)
  const [projectName, setProjectName] = useState('')
  const [organizationName, setOrganizationName] = useState(
    instances.length > 0 ? instances[0].name : '',
  )
  const [organizationId, setOrganizationId] = useState(
    instances.length > 0
      ? instances[0].name.toLowerCase().replace(/\s+/g, '-')
      : '',
  )

  const handleOrganizationNameChange = (value: string) => {
    setOrganizationName(value)
    // Auto-generate organization ID from name
    setOrganizationId(value.toLowerCase().replace(/\s+/g, '-'))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectName.trim()) return

    const selectedInstance = instances[selectedInstanceIndex]
    onConfirm({
      instanceId: selectedInstance.id,
      projectName: projectName.trim(),
      organizationName: organizationName.trim() || selectedInstance.name,
      organizationId: organizationId.trim() || organizationName.toLowerCase().replace(/\s+/g, '-'),
    })
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-cloud-project-title"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h2 id="create-cloud-project-title" className="modal-title">
              {t('Créer un projet cloud')}
            </h2>
          </div>

          <div className="modal-content">
            {/* Instance Selection */}
            {instances.length > 1 && (
              <div className="form-group">
                <label htmlFor="instance-select" className="form-label">
                  {t('Instance cloud')}
                </label>
                <select
                  id="instance-select"
                  className="form-select"
                  value={selectedInstanceIndex}
                  onChange={(e) => {
                    const idx = Number.parseInt(e.target.value, 10)
                    setSelectedInstanceIndex(idx)
                    // Update defaults when instance changes
                    const instance = instances[idx]
                    if (!organizationName || organizationName === instances[selectedInstanceIndex].name) {
                      setOrganizationName(instance.name)
                      setOrganizationId(instance.name.toLowerCase().replace(/\s+/g, '-'))
                    }
                  }}
                >
                  {instances.map((instance, index) => (
                    <option key={instance.id} value={index}>
                      {instance.name} ({instance.baseUrl})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Project Name */}
            <div className="form-group">
              <label htmlFor="project-name" className="form-label">
                {t('Nom du projet')} *
              </label>
              <input
                id="project-name"
                type="text"
                className="form-input"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder={t('Mon projet')}
                autoFocus
                required
              />
            </div>

            {/* Organization Name */}
            <div className="form-group">
              <label htmlFor="organization-name" className="form-label">
                {t("Nom de l'organisation")}
              </label>
              <input
                id="organization-name"
                type="text"
                className="form-input"
                value={organizationName}
                onChange={(e) => handleOrganizationNameChange(e.target.value)}
                placeholder={instances[selectedInstanceIndex]?.name}
              />
            </div>

            {/* Organization ID */}
            <div className="form-group">
              <label htmlFor="organization-id" className="form-label">
                {t("Identifiant de l'organisation")}
              </label>
              <input
                id="organization-id"
                type="text"
                className="form-input"
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                placeholder={organizationName.toLowerCase().replace(/\s+/g, '-')}
              />
              <span className="form-hint">
                {t('Utilisé pour les URLs et identifiants API')}
              </span>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="modal-btn modal-btn-secondary"
              onClick={onCancel}
            >
              {t('Annuler')}
            </button>
            <button
              type="submit"
              className="modal-btn modal-btn-primary"
              disabled={!projectName.trim()}
            >
              {t('Créer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
