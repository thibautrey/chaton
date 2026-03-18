import { Bell, Trash2, X, ExternalLink, LinkIcon } from 'lucide-react'
import { useState } from 'react'
import { useNotifications } from './NotificationContext'
import { handleDeeplink } from './deeplink-handler'
import { NotificationUrlViewer } from './NotificationUrlViewer'
import './notification-bell.css'

export function NotificationBell() {
  const { allNotifications, removeNotification, clearAllNotifications } = useNotifications()
  const [isOpen, setIsOpen] = useState(false)
  const [viewingUrl, setViewingUrl] = useState<string | null>(null)

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'success':
        return 'Success'
      case 'warning':
        return 'Warning'
      case 'error':
        return 'Error'
      case 'info':
      default:
        return 'Info'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'success':
        return '✓'
      case 'warning':
        return '!'
      case 'error':
        return '✕'
      case 'info':
      default:
        return 'ⓘ'
    }
  }

  const formatTime = (timestamp: number) => {
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now()
    const diff = now - timestamp
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (seconds < 60) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`

    const date = new Date(timestamp)
    return date.toLocaleDateString()
  }

  const handleLinkClick = async (link: typeof allNotifications[0]['link']) => {
    if (!link) return

    if (link.type === 'deeplink') {
      const success = await handleDeeplink(link.href)
      if (success) {
        setIsOpen(false)
      } else {
        console.warn(`Deeplink not handled: ${link.href}`)
      }
    } else if (link.type === 'url') {
      setViewingUrl(link.href)
    }
  }

  return (
    <>
      <div className="notification-bell-wrapper">
        <button
          className="notification-bell-button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Notifications"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {allNotifications.length > 0 && (
            <span className="notification-bell-badge">{allNotifications.length > 99 ? '99+' : allNotifications.length}</span>
          )}
        </button>

        {isOpen && (
          <div className="notification-bell-dropdown">
            <div className="notification-bell-header">
              <h3 className="notification-bell-title">Notifications</h3>
              {allNotifications.length > 0 && (
                <button
                  className="notification-bell-clear"
                  onClick={() => clearAllNotifications()}
                  title="Clear all notifications"
                  aria-label="Clear all notifications"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="notification-bell-list">
              {allNotifications.length === 0 ? (
                <div className="notification-bell-empty">
                  <p>No notifications yet</p>
                </div>
              ) : (
                allNotifications
                  .slice()
                  .reverse()
                  .map((notification) => (
                    <div
                      key={notification.id}
                      className={`notification-bell-item notification-type-${notification.type} ${notification.link ? 'has-link' : ''}`}
                    >
                      <div className="notification-bell-item-icon">{getTypeIcon(notification.type)}</div>
                      <div className="notification-bell-item-content">
                        <div className="notification-bell-item-message">{notification.message}</div>
                        <div className="notification-bell-item-meta">
                          <span className="notification-bell-item-type">{getTypeLabel(notification.type)}</span>
                          <span className="notification-bell-item-time">{formatTime(notification.createdAt)}</span>
                        </div>
                        {notification.link && (
                          <button
                            className="notification-bell-item-link"
                            onClick={() => handleLinkClick(notification.link)}
                            title={notification.link.label || (notification.link.type === 'url' ? 'View link' : 'Open link')}
                          >
                            {notification.link.type === 'url' ? (
                              <>
                                <ExternalLink className="h-3.5 w-3.5" />
                                {notification.link.label || 'View'}
                              </>
                            ) : (
                              <>
                                <LinkIcon className="h-3.5 w-3.5" />
                                {notification.link.label || 'Open'}
                              </>
                            )}
                          </button>
                        )}
                      </div>
                      <button
                        className="notification-bell-item-delete"
                        onClick={() => removeNotification(notification.id)}
                        title="Delete notification"
                        aria-label="Delete notification"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}

        {isOpen && <div className="notification-bell-overlay" onClick={() => setIsOpen(false)} />}
      </div>

      {viewingUrl && <NotificationUrlViewer url={viewingUrl} onClose={() => setViewingUrl(null)} />}
    </>
  )
}
