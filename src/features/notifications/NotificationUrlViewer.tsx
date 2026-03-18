import { X, Loader } from 'lucide-react'
import { useState } from 'react'
import './notification-url-viewer.css'

interface NotificationUrlViewerProps {
  url: string
  onClose: () => void
}

export function NotificationUrlViewer({ url, onClose }: NotificationUrlViewerProps) {
  // Validate URL during render
  const isValidUrl = (() => {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  })()

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(isValidUrl ? null : 'Invalid URL')

  const handleLoad = () => {
    setIsLoading(false)
  }

  const handleError = () => {
    setIsLoading(false)
    setError('Failed to load the page')
  }

  return (
    <div className="notification-url-viewer-overlay">
      <div className="notification-url-viewer">
        <div className="notification-url-viewer-header">
          <div className="notification-url-viewer-title">
            <span className="notification-url-viewer-url">{url}</span>
          </div>
          <button
            className="notification-url-viewer-close"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="notification-url-viewer-content">
          {isLoading && (
            <div className="notification-url-viewer-loading">
              <Loader className="h-5 w-5 animate-spin" />
              <p>Loading...</p>
            </div>
          )}

          {error && (
            <div className="notification-url-viewer-error">
              <p>{error}</p>
              <p className="notification-url-viewer-error-hint">
                Opening this link in your browser instead.
              </p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="notification-url-viewer-error-link"
              >
                Open in browser →
              </a>
            </div>
          )}

          {!error && (
            <iframe
              src={url}
              className="notification-url-viewer-iframe"
              onLoad={handleLoad}
              onError={handleError}
              title="Notification content"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-presentation"
            />
          )}
        </div>
      </div>
    </div>
  )
}
