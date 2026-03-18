/* eslint-disable react-hooks/rules-of-hooks */
import { useNotifications, registerDeeplinkHandler } from '@/features/notifications'

/**
 * GUIDE D'UTILISATION - SYSTÈME DE NOTIFICATIONS AVEC LIENS
 * 
 * Les notifications supportent maintenant deux types de liens:
 * 1. Deeplinks - Actions internes dans Chatons
 * 2. URLs - Afficher le contenu d'une page dans une sheet
 */

// ============================================================================
// 1. SETUP - Les deeplinks sont automatiquement initialisés au démarrage
// ============================================================================

/**
 * Aucune configuration initiale requise!
 * Les deeplinks par défaut sont automatiquement enregistrés par AppShell.tsx
 */

// ============================================================================
// 2. UTILISATION - Créer des notifications avec liens
// ============================================================================

/**
 * Exemple 1: Notification simple sans lien
 */
export function example1_SimpleNotification() {
  const { addNotification } = useNotifications()

  addNotification(
    'Conversation créée avec succès',
    'success',
    5000
  )
}

/**
 * Exemple 2: Notification avec deeplink - Ouvrir une conversation
 */
export function example2_OpenConversation() {
  const { addNotification } = useNotifications()

  addNotification(
    'Nouvelle conversation prête',
    'success',
    5000,
    {
      type: 'deeplink',
      href: 'conversation:abc123def456',
      label: 'Ouvrir'
    }
  )
}

/**
 * Exemple 3: Notification avec deeplink - Ouvrir un projet
 */
export function example3_OpenProject() {
  const { addNotification } = useNotifications()

  addNotification(
    'Projet importé avec succès',
    'success',
    5000,
    {
      type: 'deeplink',
      href: 'project:xyz789',
      label: 'Voir le projet'
    }
  )
}

/**
 * Exemple 4: Erreur avec lien vers les settings
 */
export function example4_ErrorWithSettings() {
  const { addNotification } = useNotifications()

  addNotification(
    'Aucun modèle configuré. Veuillez en ajouter un.',
    'error',
    0, // Pas de timeout auto - l'utilisateur doit prendre action
    {
      type: 'deeplink',
      href: 'settings:models',
      label: 'Configurer modèles'
    }
  )
}

/**
 * Exemple 5: Notification avec URL
 */
export function example5_NotificationWithUrl() {
  const { addNotification } = useNotifications()

  addNotification(
    'Documentation mise à jour',
    'info',
    5000,
    {
      type: 'url',
      href: 'https://docs.example.com/guide',
      label: 'Lire la doc'
    }
  )
}

/**
 * Exemple 6: Avertissement avec article
 */
export function example6_WarningWithArticle() {
  const { addNotification } = useNotifications()

  addNotification(
    'Version bêta détectée. Consultez les notes de version.',
    'warning',
    8000,
    {
      type: 'url',
      href: 'https://github.com/releases/beta-1.0.0',
      label: 'Notes de version'
    }
  )
}

/**
 * Exemple 7: Notification persistante sans timeout
 */
export function example7_ImportantNotification() {
  const { addNotification } = useNotifications()

  addNotification(
    'Action requise: Mise à jour disponible. Veuillez redémarrer.',
    'warning',
    0, // Pas d'auto-close - reste visible jusqu'à fermeture manuelle
    {
      type: 'deeplink',
      href: 'workspace:open-settings',
      label: 'Paramètres'
    }
  )
}

// ============================================================================
// 3. DEEPLINKS DISPONIBLES PAR DÉFAUT
// ============================================================================

/**
 * Format: "type:identifier"
 * 
 * Deeplinks implémentés:
 * - conversation:id - Ouvrir une conversation par ID
 * - project:id - Ouvrir un projet par ID
 * - settings:models - Ouvrir les paramètres des modèles
 * - settings:providers - Ouvrir les paramètres des providers
 * - settings: - Ouvrir les paramètres généraux
 * - workspace:open-settings - Ouvrir les paramètres
 * - workspace:close-settings - Fermer les paramètres
 */

// ============================================================================
// 4. AJOUTER DES DEEPLINKS PERSONNALISÉS
// ============================================================================

/**
 * Exemple: Ajouter un deeplink personnalisé
 */
export function addCustomDeeplink() {
  registerDeeplinkHandler('blog', async (slug) => {
    console.log('Opening blog post:', slug)
    // Votre logique de navigation ici
    return true
  })

  // Utilisation:
  const { addNotification } = useNotifications()
  addNotification('New blog post published', 'info', 5000, {
    type: 'deeplink',
    href: 'blog:welcome-to-chatons',
    label: 'Read'
  })
}

// ============================================================================
// 5. API COMPLÈTE
// ============================================================================

/**
 * addNotification(message, type?, timeout?, link?)
 * 
 * @param message - Texte de la notification
 * @param type - 'info' | 'success' | 'warning' | 'error' (défaut: 'info')
 * @param timeout - Durée avant fermeture auto en ms (défaut: 5000, 0 = jamais)
 * @param link - Optionnel
 * 
 * Link (deeplink):
 * {
 *   type: 'deeplink',
 *   href: 'type:identifier',
 *   label?: 'Texte du bouton'
 * }
 * 
 * Link (URL):
 * {
 *   type: 'url',
 *   href: 'https://...',
 *   label?: 'Texte du bouton'
 * }
 */

// ============================================================================
// 6. CAS D'USAGE RÉELS
// ============================================================================

/**
 * Notification après import d'un projet réussi
 */
export async function notifyProjectImported(projectId: string, projectName: string) {
  const { addNotification } = useNotifications()
  
  addNotification(
    `Projet "${projectName}" importé avec succès`,
    'success',
    5000,
    {
      type: 'deeplink',
      href: `project:${projectId}`,
      label: 'Ouvrir'
    }
  )
}

/**
 * Notification quand une conversation est partagée
 */
export async function notifyConversationShared(conversationId: string) {
  const { addNotification } = useNotifications()
  
  addNotification(
    'Conversation partagée! Vous pouvez maintenant la consulter.',
    'success',
    5000,
    {
      type: 'deeplink',
      href: `conversation:${conversationId}`,
      label: 'Consulter'
    }
  )
}

/**
 * Notification d'erreur de configuration
 */
export function notifyMissingModelConfiguration() {
  const { addNotification } = useNotifications()
  
  addNotification(
    'Aucun modèle d\'IA n\'est configuré. Veuillez configurer au moins un modèle pour continuer.',
    'error',
    0, // Reste visible jusqu'à fermeture
    {
      type: 'deeplink',
      href: 'settings:models',
      label: 'Configurer maintenant'
    }
  )
}

