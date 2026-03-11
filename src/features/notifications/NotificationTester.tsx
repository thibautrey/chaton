import { useNotifications } from '@/features/notifications'
import { Button } from '@/components/ui/button'

/**
 * Component de test pour les notifications avec deeplinks
 * À utiliser uniquement en développement
 */
export function NotificationTester() {
  const { addNotification } = useNotifications()

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <h3>Notification Test Panel</h3>

      <div>
        <h4>Simple Notifications</h4>
        <Button
          onClick={() => addNotification('Info notification', 'info')}
          style={{ marginRight: '8px' }}
        >
          Test Info
        </Button>
        <Button
          onClick={() => addNotification('Success notification', 'success')}
          style={{ marginRight: '8px' }}
        >
          Test Success
        </Button>
        <Button
          onClick={() => addNotification('Warning notification', 'warning')}
          style={{ marginRight: '8px' }}
        >
          Test Warning
        </Button>
        <Button
          onClick={() => addNotification('Error notification', 'error')}
          style={{ marginRight: '8px' }}
        >
          Test Error
        </Button>
      </div>

      <div>
        <h4>With Deeplinks</h4>
        <Button
          onClick={() =>
            addNotification('Open first conversation', 'info', 0, {
              type: 'deeplink',
              href: 'settings:models',
              label: 'Open Settings',
            })
          }
          style={{ marginRight: '8px' }}
        >
          Settings Deeplink
        </Button>
        <Button
          onClick={() =>
            addNotification('Workspace action', 'success', 0, {
              type: 'deeplink',
              href: 'workspace:open-settings',
              label: 'Open',
            })
          }
          style={{ marginRight: '8px' }}
        >
          Workspace Deeplink
        </Button>
      </div>

      <div>
        <h4>With URLs</h4>
        <Button
          onClick={() =>
            addNotification('GitHub repository', 'info', 0, {
              type: 'url',
              href: 'https://github.com',
              label: 'Visit GitHub',
            })
          }
          style={{ marginRight: '8px' }}
        >
          URL Example
        </Button>
      </div>

      <div>
        <h4>No Auto-Close</h4>
        <Button
          onClick={() =>
            addNotification(
              'This notification will stay until you close it',
              'warning',
              0,
              { type: 'url', href: 'https://example.com', label: 'View' }
            )
          }
        >
          Important Notification
        </Button>
      </div>
    </div>
  )
}
