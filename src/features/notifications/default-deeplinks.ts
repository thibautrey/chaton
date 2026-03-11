import { registerDeeplinkHandler } from './deeplink-handler'

/**
 * WorkspaceDispatcher - Permet les deeplinks d'interagir avec le workspace
 * Cette instance est définie lors de l'initialisation des deeplinks
 */
let workspaceDispatcher: WorkspaceDeeplinkDispatcher | null = null

export type WorkspaceDeeplinkDispatcher = {
  selectConversation: (conversationId: string) => Promise<void>
  selectProject: (projectId: string) => Promise<void>
  openSettings: () => void
  closeSettings: () => void
}

/**
 * Enregistre le dispatcher du workspace pour les deeplinks
 * À appeler une fois lors du démarrage de l'app
 */
export function setWorkspaceDeeplinkDispatcher(dispatcher: WorkspaceDeeplinkDispatcher): void {
  workspaceDispatcher = dispatcher
}

/**
 * Initialise tous les deeplinks par défaut
 * À appeler une fois lors du démarrage de l'app
 */
export function initializeDefaultDeeplinks(): void {
  // Deeplink: conversation:id
  // Ouvre une conversation par ID
  registerDeeplinkHandler('conversation', async (conversationId) => {
    if (!workspaceDispatcher) {
      console.warn('Workspace dispatcher not initialized for deeplink')
      return false
    }

    try {
      await workspaceDispatcher.selectConversation(conversationId)
      return true
    } catch (error) {
      console.error(`Failed to open conversation ${conversationId}:`, error)
      return false
    }
  })

  // Deeplink: project:id
  // Ouvre un projet par ID
  registerDeeplinkHandler('project', async (projectId) => {
    if (!workspaceDispatcher) {
      console.warn('Workspace dispatcher not initialized for deeplink')
      return false
    }

    try {
      await workspaceDispatcher.selectProject(projectId)
      return true
    } catch (error) {
      console.error(`Failed to open project ${projectId}:`, error)
      return false
    }
  })

  // Deeplink: settings:page
  // Ouvre les settings à une page spécifique
  // Pages supportées: 'models', 'providers', 'general', etc.
  registerDeeplinkHandler('settings', async (page) => {
    if (!workspaceDispatcher) {
      console.warn('Workspace dispatcher not initialized for deeplink')
      return false
    }

    try {
      workspaceDispatcher.openSettings()
      // TODO: Si nécessaire, naviguer vers une page spécifique
      console.log('Opening settings page:', page)
      return true
    } catch (error) {
      console.error(`Failed to open settings ${page}:`, error)
      return false
    }
  })

  // Deeplink: workspace:action
  // Actions globales du workspace
  registerDeeplinkHandler('workspace', async (action) => {
    if (!workspaceDispatcher) {
      console.warn('Workspace dispatcher not initialized for deeplink')
      return false
    }

    try {
      switch (action) {
        case 'close-settings':
          workspaceDispatcher.closeSettings()
          return true

        case 'open-settings':
          workspaceDispatcher.openSettings()
          return true

        default:
          console.warn(`Unknown workspace action: ${action}`)
          return false
      }
    } catch (error) {
      console.error(`Failed to execute workspace action ${action}:`, error)
      return false
    }
  })
}
