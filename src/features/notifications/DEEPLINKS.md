# Deeplinks - Système de Liens Internes

Les deeplinks permettent les notifications de déclencher des actions internes dans Chatons.

## Format

```
type:identifier
```

## Deeplinks Disponibles

### `conversation:id`

Ouvre une conversation spécifique par son ID.

```typescript
addNotification('Conversation créée', 'success', 5000, {
  type: 'deeplink',
  href: 'conversation:abc123def456',
  label: 'Ouvrir'
})
```

**Paramètres:**
- `id` - L'ID unique de la conversation

### `project:id`

Ouvre un projet spécifique par son ID.

```typescript
addNotification('Projet importé', 'success', 5000, {
  type: 'deeplink',
  href: 'project:def456ghi789',
  label: 'Voir le projet'
})
```

**Paramètres:**
- `id` - L'ID unique du projet

### `settings:page`

Ouvre la page des paramètres. Page peut être vide pour les settings généraux.

```typescript
addNotification('Modèle non configuré', 'error', 0, {
  type: 'deeplink',
  href: 'settings:models',
  label: 'Configurer'
})
```

**Pages supportées:**
- `settings:models` - Configuration des modèles
- `settings:providers` - Configuration des providers
- `settings:` (vide) - Page générale des settings

### `workspace:action`

Actions globales du workspace.

```typescript
addNotification('Settings disponibles', 'info', 5000, {
  type: 'deeplink',
  href: 'workspace:open-settings',
  label: 'Ouvrir'
})
```

**Actions disponibles:**
- `workspace:open-settings` - Ouvrir les paramètres
- `workspace:close-settings` - Fermer les paramètres

## Ajouter de Nouveaux Deeplinks

Pour ajouter un nouveau type de deeplink, utilisez `registerDeeplinkHandler`:

```typescript
import { registerDeeplinkHandler } from '@/features/notifications'

registerDeeplinkHandler('myfeature', async (identifier) => {
  console.log('Opening:', identifier)
  // Votre logique ici
  return true // success, ou false si échoué
})

// Utilisation:
addNotification('Try my feature', 'info', 5000, {
  type: 'deeplink',
  href: 'myfeature:some-id',
  label: 'Open'
})
```

## Erreurs et Fallback

Si un deeplink échoue à s'exécuter:
1. La notification reste visible
2. Un message d'erreur est loggé en console
3. L'utilisateur peut réessayer en cliquant à nouveau

## Bonnes Pratiques

1. **Utilisez des labels explicites** - Le label doit clairement indiquer l'action
2. **Pas d'auto-close pour les actions** - Utilisez `timeout: 0` pour les notifications avec deeplinks importants
3. **Validez les IDs** - Vérifiez que la ressource existe avant de créer la notification
4. **Fournissez un fallback** - Si possible, complétez la notification avec une URL alternative

Exemple complet:

```typescript
async function notifyNewConversation(conversationId: string) {
  const { addNotification } = useNotifications()
  
  // Vérifier que la conversation existe
  const conversation = await getConversation(conversationId)
  if (!conversation) {
    addNotification('Conversation not found', 'error')
    return
  }
  
  addNotification(
    `Nouvelle conversation: ${conversation.title}`,
    'success',
    5000,
    {
      type: 'deeplink',
      href: `conversation:${conversationId}`,
      label: 'Ouvrir la conversation'
    }
  )
}
```

## Architecture

Les deeplinks fonctionnent en deux phases:

1. **Registration** - Au démarrage de l'app, les handlers sont enregistrés
2. **Dispatch** - Quand l'utilisateur clique sur un lien, le handler est appelé

```
Notification with deeplink
        ↓
    User clicks link
        ↓
    handleDeeplink() is called
        ↓
    Handler is found in registry
        ↓
    Handler executes (e.g., selectConversation)
        ↓
    UI updates
```

Les handlers sont asynchrones pour supporter les opérations qui prennent du temps.
