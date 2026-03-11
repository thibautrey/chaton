import { useNotifications } from './NotificationContext'
import { X, Check, AlertTriangle, Info, AlertCircle, ExternalLink, LinkIcon } from 'lucide-react'
import { useState } from 'react'
import { handleDeeplink } from './deeplink-handler'
import { NotificationUrlViewer } from './NotificationUrlViewer'

export function GlobalNotificationDisplay() {
  const { notifications, removeNotification } = useNotifications()
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set())
  const [viewingUrl, setViewingUrl] = useState<string | null>(null)

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <Check className="h-4 w-4" strokeWidth={2.5} />
      case 'warning':
        return <AlertTriangle className="h-4 w-4" strokeWidth={2.5} />
      case 'error':
        return <AlertCircle className="h-4 w-4" strokeWidth={2.5} />
      case 'info':
      default:
        return <Info className="h-4 w-4" strokeWidth={2.5} />
    }
  }

  const getNotificationClass = (type: string) => {
    switch (type) {
      case 'success':
        return 'notification-success'
      case 'warning':
        return 'notification-warning'
      case 'error':
        return 'notification-error'
      case 'info':
      default:
        return 'notification-info'
    }
  }

  const handleClose = (id: string) => {
    setExitingIds((prev) => new Set(prev).add(id))
    setTimeout(() => {
      removeNotification(id)
      setExitingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, 300)
  }

  const handleLinkClick = async (link: typeof notifications[0]['link']) => {
    if (!link) return

    if (link.type === 'deeplink') {
      await handleDeeplink(link.href)
    } else if (link.type === 'url') {
      setViewingUrl(link.href)
    }
  }

  if (notifications.length === 0) {
    return viewingUrl ? <NotificationUrlViewer url={viewingUrl} onClose={() => setViewingUrl(null)} /> : null
  }

  return (
    <>
      <div className="global-notification-container">
        {notifications.map((notification) => {
          const isExiting = exitingIds.has(notification.id)
          return (
            <div
              key={notification.id}
              className={`global-notification ${getNotificationClass(notification.type)} ${isExiting ? 'notification-exit' : ''}`}
              role="status"
              aria-live="polite"
              aria-label={`${notification.type} notification: ${notification.message}`}
              style={isExiting ? { animation: 'notification-slide-out 0.3s ease-out forwards' } : undefined}
            >
              <div className="notification-icon" aria-hidden="true">
                {getIcon(notification.type)}
              </div>
              <div className="notification-content">
                <div className="notification-message">{notification.message}</div>
                {notification.link && (
                  <button
                    className="notification-link-button"
                    onClick={() => handleLinkClick(notification.link)}
                    title={notification.link.label || (notification.link.type === 'url' ? 'View link' : 'Open link')}
                  >
                    {notification.link.type === 'url' ? (
                      <>
                        <ExternalLink className="h-3 w-3" />
                        {notification.link.label || 'View'}
                      </>
                    ) : (
                      <>
                        <LinkIcon className="h-3 w-3" />
                        {notification.link.label || 'Open'}
                      </>
                    )}
                  </button>
                )}
              </div>
              <button
                className="notification-close"
                onClick={() => handleClose(notification.id)}
                aria-label={`Close ${notification.type} notification`}
                title="Close notification"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            </div>
          )
        })}
      </div>

      {viewingUrl && <NotificationUrlViewer url={viewingUrl} onClose={() => setViewingUrl(null)} />}
    </>
  )
}
