// Gestionnaire de deeplinks pour les notifications
// Les deeplinks permettent de déclencher des actions dans Chatons

export type DeeplinkHandler = (href: string) => Promise<boolean>

const handlers = new Map<string, DeeplinkHandler>()

/**
 * Enregistre un handler pour un type de deeplink
 * @param type - Le type de deeplink (ex: "conversation", "project")
 * @param handler - La fonction qui traite le deeplink
 */
export function registerDeeplinkHandler(type: string, handler: DeeplinkHandler): void {
  handlers.set(type, handler)
}

/**
 * Traite un deeplink et déclenche l'action correspondante
 * @param href - Le lien à traiter (ex: "conversation:123" ou "project:456")
 * @returns true si le deeplink a été traité, false sinon
 */
export async function handleDeeplink(href: string): Promise<boolean> {
  const [type, ...rest] = href.split(':')
  const handler = handlers.get(type)

  if (!handler) {
    console.warn(`No handler registered for deeplink type: ${type}`)
    return false
  }

  try {
    return await handler(rest.join(':'))
  } catch (error) {
    console.error(`Error handling deeplink ${href}:`, error)
    return false
  }
}

/**
 * Exemples de deeplinks:
 * - "conversation:abc123" - Ouvrir une conversation
 * - "project:def456" - Ouvrir un projet
 * - "settings:models" - Ouvrir les paramètres modèles
 * - "workspace:onboarding" - Afficher l'onboarding
 */
