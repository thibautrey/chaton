import { FolderGit2 } from 'lucide-react'
import { useState, useEffect } from 'react'

type ProjectIconProps = {
  icon: string | null | undefined
  size?: number
  loadAsDataUrl?: boolean
}

/** Render a project icon: emoji text, file:// image (as data URL), or default FolderGit2 */
export function ProjectIcon({ icon, size = 16, loadAsDataUrl = false }: ProjectIconProps) {
  const trimmed = icon?.trim()
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  // Convert file:// path to data URL on mount
  useEffect(() => {
    if (!trimmed?.startsWith('file://') || !loadAsDataUrl) {
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
  }, [trimmed, loadAsDataUrl])

  if (!trimmed) {
    return <FolderGit2 className="shrink-0" style={{ width: size, height: size }} />
  }
  if (trimmed.startsWith('file://')) {
    if (!loadAsDataUrl) {
      // Fallback: try file:// directly (may not work in Electron)
      const src = trimmed.replace(/^file:\/\//, '')
      return (
        <img
          src={`file://${src}`}
          alt=""
          className="project-icon-image shrink-0"
          style={{ width: size, height: size, objectFit: 'cover', borderRadius: 3 }}
          draggable={false}
        />
      )
    }
    // Use data URL if available
    if (dataUrl) {
      return (
        <img
          src={dataUrl}
          alt=""
          className="project-icon-image shrink-0"
          style={{ width: size, height: size, objectFit: 'cover', borderRadius: 3 }}
          draggable={false}
        />
      )
    }
    // Still loading
    return <FolderGit2 className="shrink-0" style={{ width: size, height: size, opacity: 0.5 }} />
  }
  return <>{trimmed}</>
}
