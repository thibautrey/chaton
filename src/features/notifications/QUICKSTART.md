# 🚀 Quick Start - Notification System

## Import

```typescript
import { useNotifications } from '@/features/notifications'
```

## Utilisation de Base

```typescript
const { addNotification } = useNotifications()

// Simple notification
addNotification('Hello!', 'success', 5000)

// Avec tous les paramètres
addNotification(
  message: 'Operation complete',
  type: 'success',
  timeout: 5000,
  link: {
    type: 'deeplink' | 'url',
    href: 'conversation:abc123',
    label: 'Click me'
  }
)
```

## Exemples Courants

### ✅ Succès
```typescript
addNotification('File uploaded successfully', 'success')
```

### ⚠️ Avertissement
```typescript
addNotification('This action cannot be undone', 'warning', 0)
```

### ❌ Erreur
```typescript
addNotification('Failed to save', 'error', 5000, {
  type: 'url',
  href: 'https://docs.example.com/help',
  label: 'Get help'
})
```

### ℹ️ Info
```typescript
addNotification('New feature available', 'info', 5000)
```

## Deeplinks

### Ouvrir une Conversation
```typescript
addNotification('New conversation ready', 'success', 5000, {
  type: 'deeplink',
  href: `conversation:${conversationId}`,
  label: 'Open'
})
```

### Ouvrir un Projet
```typescript
addNotification('Project imported', 'success', 5000, {
  type: 'deeplink',
  href: `project:${projectId}`,
  label: 'View'
})
```

### Ouvrir Settings
```typescript
addNotification('Configure models', 'error', 0, {
  type: 'deeplink',
  href: 'settings:models',
  label: 'Configure'
})
```

## URLs

### Afficher une Page Web
```typescript
addNotification('Documentation updated', 'info', 5000, {
  type: 'url',
  href: 'https://docs.example.com',
  label: 'Read'
})
```

## Autres Fonctions

```typescript
const {
  notifications,           // Notifications actives
  allNotifications,        // Historique complet
  removeNotification,      // Supprimer par ID
  clearNotifications,      // Vider les actives
  clearAllNotifications    // Vider l'historique
} = useNotifications()
```

## Tips

- **Pas d'auto-close**: `timeout: 0` pour les actions importantes
- **Labels clairs**: Utilisez des labels explicites
- **Validation**: Vérifiez les IDs avant de créer la notification
- **Context**: Fournissez du contexte dans le message

## Pattern Recommandé

```typescript
async function handleAction() {
  try {
    const result = await performAction()
    
    addNotification(
      `Success: ${result.message}`,
      'success',
      5000,
      {
        type: 'deeplink',
        href: `conversation:${result.id}`,
        label: 'View'
      }
    )
  } catch (error) {
    addNotification(
      `Error: ${error.message}`,
      'error',
      0, // No auto-close
      {
        type: 'url',
        href: 'https://docs.example.com/troubleshooting',
        label: 'Help'
      }
    )
  }
}
```

## Ajuster les Deeplinks

```typescript
import { registerDeeplinkHandler } from '@/features/notifications'

registerDeeplinkHandler('custom', async (id) => {
  // Votre logique
  return true
})

// Utilisation
addNotification('Custom action', 'info', 5000, {
  type: 'deeplink',
  href: 'custom:my-id',
  label: 'Go'
})
```

---

**Plus d'infos**: Voir `USAGE_GUIDE.ts`, `DEEPLINKS.md`, `README.md`
