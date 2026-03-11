# Notification System Documentation

## Overview

Chatons now has a comprehensive notification system that supports:

1. **Temporary notifications** - Pop-up toast notifications that auto-dismiss
2. **Persistent notifications** - Saved in browser localStorage, visible in the notification bell
3. **Deep linking** - Trigger internal Chatons actions from notifications
4. **URL viewing** - Display web pages in a sheet overlay

## Architecture

### Components

- **NotificationProvider** - Context provider for the entire notification system
- **GlobalNotificationDisplay** - Renders temporary toast notifications
- **NotificationBell** - Button in topbar showing notification history
- **NotificationUrlViewer** - Sheet overlay for viewing URLs
- **deeplink-handler** - Registry and dispatcher for internal links

### Features

✅ Auto-save to localStorage (24h retention)  
✅ Dark mode support  
✅ Smooth animations  
✅ Type-safe with TypeScript  
✅ Extensible deeplink system  
✅ Iframe sandbox for URL viewing  

## Usage

### Basic Notification

```typescript
import { useNotifications } from '@/features/notifications'

function MyComponent() {
  const { addNotification } = useNotifications()

  const handleClick = () => {
    addNotification('Operation successful', 'success', 5000)
  }

  return <button onClick={handleClick}>Click me</button>
}
```

### With Deeplink

```typescript
const { addNotification } = useNotifications()

addNotification(
  'New conversation ready',
  'info',
  5000,
  {
    type: 'deeplink',
    href: 'conversation:abc123',
    label: 'Open'
  }
)
```

### With URL

```typescript
const { addNotification } = useNotifications()

addNotification(
  'Documentation updated',
  'info',
  5000,
  {
    type: 'url',
    href: 'https://docs.example.com/guide',
    label: 'View docs'
  }
)
```

## Notification Types

- `'info'` - Informational (blue)
- `'success'` - Success/completion (green)
- `'warning'` - Warning (orange)
- `'error'` - Error/failure (red)

## Deeplinks

Deeplinks follow the format: `type:identifier`

### Registering a Deeplink Handler

```typescript
import { registerDeeplinkHandler } from '@/features/notifications'

// In app initialization:
registerDeeplinkHandler('conversation', async (id) => {
  // Navigate to conversation with given ID
  console.log('Opening conversation:', id)
  return true // success
})
```

### Built-in Deeplink Examples

- `conversation:abc123` - Open conversation
- `project:def456` - Open project
- `settings:models` - Open model settings
- `settings:providers` - Open provider settings

## API Reference

### useNotifications()

```typescript
const {
  notifications,        // Current active notifications
  allNotifications,     // Full history
  addNotification,      // Add new notification
  removeNotification,   // Remove by ID
  clearNotifications,   // Clear active only
  clearAllNotifications // Clear history too
} = useNotifications()
```

### addNotification()

```typescript
addNotification(
  message: string,
  type?: 'info' | 'success' | 'warning' | 'error',
  timeout?: number,
  link?: NotificationLink
): void
```

### NotificationLink

```typescript
type NotificationLink = {
  type: 'deeplink' | 'url'
  href: string
  label?: string
}
```

## Storage

Notifications are stored in localStorage with:
- **Key**: `chatons_notifications_history`
- **Max items**: 100
- **Retention**: 24 hours
- **Auto-cleanup**: Expired entries removed on load

## Dark Mode

The system automatically respects `prefers-color-scheme` media query.

All colors are optimized for both light and dark modes in the CSS.

## Styling

Main CSS files:
- `/src/styles/components/notifications.css` - Toast notifications
- `/src/features/notifications/notification-bell.css` - Notification bell
- `/src/features/notifications/notification-url-viewer.css` - URL viewer

All styles follow Chatons' design system with subtle colors and smooth animations.

## Examples

See `USAGE_GUIDE.ts` for 7 complete examples of different notification patterns.

## Security

- **Deeplinks**: Validated against registered handlers
- **URLs**: Loaded in sandboxed iframes with restricted permissions
- **Storage**: Uses browser localStorage (same-origin policy applies)

## Performance

- **Lazy rendering**: Only visible notifications are rendered
- **Efficient updates**: Uses React batching and proper memoization
- **Storage operations**: Debounced and done in-place

## Browser Compatibility

- Modern browsers with localStorage support
- Graceful fallback if localStorage unavailable
- Works in sandboxed contexts

## Future Enhancements

Possible improvements:
- [ ] Notification categories and filtering
- [ ] Notification actions (buttons with callbacks)
- [ ] Sound/desktop notifications
- [ ] Grouped notifications
- [ ] Notification priority levels
- [ ] Export notification history
