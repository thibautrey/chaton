import { Bell, Trash2, X, ExternalLink, LinkIcon } from 'lucide-react'
import { useState } from 'react'
import { useNotifications } from './NotificationContext'
import { handleDeeplink } from './deeplink-handler'
import { NotificationUrlViewer } from './NotificationUrlViewer'
import { css, compose } from '@/lib/migration'

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

  // Type-specific icon colors for notification types
  const getTypeIconClasses = (type: string) => {
    const base = 'shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-xs font-semibold'
    switch (type) {
      case 'success':
        return compose(base, 'bg-emerald-50 text-emerald-600')
      case 'warning':
        return compose(base, 'bg-amber-50 text-amber-600')
      case 'error':
        return compose(base, 'bg-red-50 text-red-600')
      case 'info':
      default:
        return compose(base, 'bg-sky-50 text-sky-600')
    }
  }

  // Type badge classes
  const getTypeBadgeClasses = (type: string) => {
    const base = 'px-1.5 py-0.5 rounded text-[11px] font-medium'
    switch (type) {
      case 'success':
        return compose(base, 'bg-emerald-100 text-emerald-700')
      case 'warning':
        return compose(base, 'bg-amber-100 text-amber-700')
      case 'error':
        return compose(base, 'bg-red-100 text-red-700')
      case 'info':
      default:
        return compose(base, 'bg-slate-100 text-slate-700')
    }
  }

  // Link button classes
  const getLinkButtonClasses = (type: string) => {
    const base = 'inline-flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded text-xs font-medium cursor-pointer transition-all'
    switch (type) {
      case 'success':
        return compose(base, 'bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100')
      case 'warning':
        return compose(base, 'bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100')
      case 'error':
        return compose(base, 'bg-red-50 border border-red-200 text-red-700 hover:bg-red-100')
      case 'info':
      default:
        return compose(base, 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100')
    }
  }

  return (
    <>
      <div className="relative">
        <button
          className={css('notification-bell-button', 'relative bg-none border-none p-1.5 flex items-center justify-center rounded-lg text-[#66676f] transition-all hover:bg-[#f0f0f2] hover:text-[#2c2d34] dark:text-[#a1a2a9] dark:hover:bg-[#4a4d57] dark:hover:text-[#e4e5ea]')}
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Notifications"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {allNotifications.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-5 h-5 p-0.5 bg-red-500 text-white text-[10px] font-semibold rounded-[10px] border-2 border-white dark:border-[#3a3c44]">
              {allNotifications.length > 99 ? '99+' : allNotifications.length}
            </span>
          )}
        </button>

        {isOpen && (
          <div className={css('notification-bell-dropdown', 'absolute top-full right-0 mt-2 w-96 max-h-[500px] bg-white dark:bg-[#3a3c44] border border-[#e0e1e6] dark:border-[#4a4d57] rounded-xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)] flex flex-col z-[1000]')}>
            <div className={css('notification-bell-header', 'flex items-center justify-between p-3.5 border-b border-[#f0f0f2] dark:bg-[#2f313a] dark:border-[#4a4d57]')}>
              <h3 className={css('notification-bell-title', 'text-sm font-semibold m-0 text-[#2c2d34] dark:text-[#e4e5ea]')}>
                Notifications
              </h3>
              {allNotifications.length > 0 && (
                <button
                  className={css('notification-bell-clear', 'bg-none border-none cursor-pointer p-1 flex items-center justify-center text-[#a1a2a9] dark:text-[#696b74] rounded-md transition-all hover:bg-[#f0f0f2] dark:hover:bg-[#4a4d57] hover:text-[#66676f]')}
                  onClick={() => clearAllNotifications()}
                  title="Clear all notifications"
                  aria-label="Clear all notifications"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className={css('notification-bell-list', 'flex-1 overflow-y-auto flex flex-col [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#d4d5db] [&::-webkit-scrollbar-thumb]:rounded dark:[&::-webkit-scrollbar-thumb]:bg-[#4a4d57]')}>
              {allNotifications.length === 0 ? (
                <div className={css('notification-bell-empty', 'flex items-center justify-center p-10 text-[#a1a2a9] dark:text-[#696b74] text-sm')}>
                  <p className="m-0">No notifications yet</p>
                </div>
              ) : (
                allNotifications
                  .slice()
                  .reverse()
                  .map((notification) => (
                    <div
                      key={notification.id}
                      className={compose(
                        'group flex gap-3 p-3 border-b border-[#f8f8f9] dark:border-[#4a4d57] transition-colors hover:bg-[#f8f8f9] dark:hover:bg-[#4a4d57]',
                        notification.link ? 'has-link' : ''
                      )}
                    >
                      <div className={getTypeIconClasses(notification.type)}>
                        {getTypeIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-[#2c2d34] dark:text-[#e4e5ea] leading-6 mb-1 break-words">
                          {notification.message}
                        </div>
                        <div className="flex gap-2 items-center text-[11px]">
                          <span className={getTypeBadgeClasses(notification.type)}>
                            {getTypeLabel(notification.type)}
                          </span>
                          <span className="text-[#a1a2a9] dark:text-[#696b74]">
                            {formatTime(notification.createdAt)}
                          </span>
                        </div>
                        {notification.link && (
                          <button
                            className={getLinkButtonClasses(notification.type)}
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
                        className="shrink-0 bg-none border-none cursor-pointer p-1 flex items-center justify-center text-[#a1a2a9] dark:text-[#696b74] rounded transition-all opacity-0 group-hover:opacity-100 hover:opacity-100 hover:bg-[#f0f0f2] dark:hover:bg-[#4a4d57] hover:text-[#66676f]"
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

        {isOpen && (
          <div 
            className="fixed inset-0 z-[999]" 
            onClick={() => setIsOpen(false)} 
          />
        )}
      </div>

      {viewingUrl && <NotificationUrlViewer url={viewingUrl} onClose={() => setViewingUrl(null)} />}
    </>
  )
}
