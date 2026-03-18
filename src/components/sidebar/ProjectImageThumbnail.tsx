import { useEffect, useState } from 'react'

type ProjectImageThumbnailProps = {
  imagePath: string
  fileName: string
  isActive: boolean
  onClick: () => void
}

/** Image thumbnail that loads as data URL for project image picker */
export function ProjectImageThumbnail({ imagePath, fileName, isActive, onClick }: ProjectImageThumbnailProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true)
    window.chaton
      .imageToDataUrl(imagePath)
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url)
          setIsLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [imagePath])

  return (
    <button
      type="button"
      className={`project-sheet-image-option ${isActive ? 'project-sheet-image-option-active' : ''}`}
      onClick={onClick}
      title={fileName}
    >
      {isLoading ? (
        <div className="project-sheet-image-loading" />
      ) : dataUrl ? (
        <img
          src={dataUrl}
          alt={fileName}
          draggable={false}
        />
      ) : (
        <div className="project-sheet-image-error" />
      )}
      <span className="project-sheet-image-name">{fileName}</span>
    </button>
  )
}
