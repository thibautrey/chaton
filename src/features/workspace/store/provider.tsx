/* eslint-disable react-refresh/only-export-components */
/* eslint-disable react-hooks/exhaustive-deps */
/**
 * Note: dispatch from useReducer is intentionally excluded from dependency arrays.
 * dispatch is guaranteed to be stable across re-renders.
 */
import {
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'

import { CreateCloudProjectModal } from '@/components/shell/mainView/CreateCloudProjectModal'
import type { ModifiedFileStatByPath } from '@/components/shell/composer/types'
import { computeRecentChangedFiles, computeThreadDeltaFiles, toStatByPath } from '@/components/shell/composer/git'
import { workspaceIpc } from '@/services/ipc/workspace'
import { logger } from '@/lib/logger'

import type {
  PiCommandAction,
  PiModelsJson,
  PiSettingsJson,
  SidebarSettings,
} from '../types'
import type {
  ImageContent,
  FileContent,
  JsonValue,
  RpcCommand,
  RpcExtensionUiResponse,
} from '../rpc'
import { WorkspaceContext } from './context'
import { applyPiEvent, mergeSnapshot } from './pi-events'
import {
  type Action,
  buildSendFailureNotice,
  initialState,
  isMessageSendCommand,
  piReducer,
  reducer,
  UPSTREAM_NO_OUTPUT_MAX_RETRIES,
} from './state'
import { piStoreGetState, piStoreReplace, piStoreReplaceSync } from './pi-store'
import { perfMonitor } from './perf-monitor'
import { useNotifications } from '@/features/notifications/NotificationContext'
import type { ChatonsExtensionDeeplink } from '../types'

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const [state, rawDispatch] = useReducer(reducer, initialState)
  const [isLoading, setIsLoading] = useState(true)
  const [showCloudProjectModal, setShowCloudProjectModal] = useState(false)
  const { addNotification } = useNotifications()
  const pendingAutomationSuggestionDeeplinkRef = useRef<ChatonsExtensionDeeplink | null>(null)

  // Combined dispatch: routes Pi actions to the external store,
  // non-Pi actions to the React reducer. Some actions (hydrate,
  // addConversation, removeConversation) go to both.
  const dispatch = useCallback((action: Action) => {
    perfMonitor.recordDispatch(action.type)
    
    // Handle notification actions
    if (action.type === 'setNotice') {
      const notice = action.payload.notice
      if (notice) {
        // Convert notice to notification
        addNotification(notice, 'info')
      }
    }
    
    // Always update piStore for actions it handles
    const piState = piStoreGetState()
    let nextPiState: typeof piState

    if (action.type === 'removeProject') {
      // removeProject needs conversation IDs from state — handle inline
      // since piReducer can't access WorkspaceState
      const nextPi = { ...piState.piByConversation }
      const nextCompleted = { ...piState.completedActionByConversation }
      // We read the current conversations from the stateRef (set below)
      const conversations = stateRef.current.conversations
      const removedIds = new Set(
        conversations
          .filter((c) => c.projectId === action.payload.projectId)
          .map((c) => c.id),
      )
      for (const id of removedIds) {
        delete nextPi[id]
        delete nextCompleted[id]
      }
      nextPiState = { piByConversation: nextPi, completedActionByConversation: nextCompleted }
    } else {
      nextPiState = piReducer(piState, action)
    }

    // Only emit piStore change if something actually changed
    if (nextPiState !== piState) {
      // Use synchronous notification for user-initiated actions that need
      // immediate UI feedback. High-frequency streaming actions (message updates,
      // tool execution, runtime status during streaming) use the default rAF-batched path.
      const isHighFrequency =
        action.type === 'upsertPiMessage' ||
        action.type === 'setPiMessages' ||
        (action.type === 'setPiRuntime' && !('status' in (action.payload.runtime ?? {})))

      if (isHighFrequency) {
        piStoreReplace(nextPiState)
      } else {
        piStoreReplaceSync(nextPiState)
      }
    }

    // Always forward to React reducer (it returns state unchanged for Pi-only actions)
    rawDispatch(action)
  }, [addNotification])

  const hydratingRuntimeIdsRef = useRef(new Set<string>())
  const stateRef = useRef(state)
  const lastSentPromptRef = useRef<
    Record<string, { message: string; images: ImageContent[]; files: FileContent[]; at: number; steer: boolean }>
  >({})
  const retryAttemptsByPromptRef = useRef<Record<string, number>>({})
  const gitBaselineByConversationRef = useRef<Record<string, ModifiedFileStatByPath>>({})
  const lastFileChangeSignatureByConversationRef = useRef<Record<string, string>>({})
  const lastCompletedNotificationAtByConversationRef = useRef<Record<string, number>>({})

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    let mounted = true
    workspaceIpc
      .getInitialState()
      .then((payload) => {
        if (!mounted) {
          return
        }

        dispatch({ type: 'hydrate', payload })
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const unsubscribe = workspaceIpc.onPiEvent((event) => {
      const result =
        applyPiEvent(dispatch, event, stateRef, {
          shouldNotifyConversationCompleted: (conversationId) => {
            const now = Date.now()
            const lastNotifiedAt = lastCompletedNotificationAtByConversationRef.current[conversationId] ?? 0
            if (now - lastNotifiedAt < 3000) {
              return false
            }

            const runtime = piStoreGetState().piByConversation[conversationId]
            if (runtime?.pendingUserMessage || runtime?.status === 'starting' || runtime?.status === 'streaming') {
              return false
            }

            lastCompletedNotificationAtByConversationRef.current[conversationId] = now
            return true
          },
        }) ?? { shouldAutoRetry: false }

      const payload = event.event as Record<string, JsonValue> | null
      if (payload?.type === 'tool_execution_end') {
        const conversationId = event.conversationId
        void (async () => {
          const summary = await workspaceIpc.getGitDiffSummary(conversationId)
          if (!summary.ok) {
            return
          }

          const baseline = gitBaselineByConversationRef.current[conversationId]
          if (!baseline) {
            gitBaselineByConversationRef.current[conversationId] = toStatByPath(summary.files)
            return
          }

          const payloadToolCallId = typeof payload.toolCallId === 'string' ? payload.toolCallId : null
          const touchedPaths = payloadToolCallId
            ? await workspaceIpc.getTouchedFilesForToolCall(payloadToolCallId)
            : []
          const touchedPathSet = new Set(touchedPaths)
          const recentFiles = computeRecentChangedFiles(summary.files, baseline).filter((file) =>
            touchedPathSet.size > 0 && touchedPathSet.has(file.path),
          )
          gitBaselineByConversationRef.current[conversationId] = toStatByPath(summary.files)
          if (recentFiles.length === 0) {
            return
          }

          const signature = JSON.stringify(recentFiles)
          if (lastFileChangeSignatureByConversationRef.current[conversationId] === signature) {
            return
          }
          lastFileChangeSignatureByConversationRef.current[conversationId] = signature

          const messageTimestamp = Date.now()
          const message = {
            id: payloadToolCallId
              ? `file-changes:${payloadToolCallId}`
              : `file-changes:${messageTimestamp}`,
            role: 'assistant',
            timestamp: messageTimestamp,
            content: [
              {
                type: 'fileChanges',
                label: 'Modifié',
                files: recentFiles.map((file) => ({
                  path: file.path,
                  added: file.added,
                  removed: file.removed,
                })),
              },
            ],
          } satisfies Record<string, JsonValue>

          dispatch({
            type: 'upsertPiMessage',
            payload: {
              conversationId,
              message,
            },
          })
        })()
      }

      if (!result.shouldAutoRetry) {
        return
      }

      const lastPrompt = lastSentPromptRef.current[event.conversationId]
      if (!lastPrompt) {
        return
      }
      const retryKey = `${event.conversationId}:${lastPrompt.at}`
      const attempts = retryAttemptsByPromptRef.current[retryKey] ?? 0
      if (attempts >= UPSTREAM_NO_OUTPUT_MAX_RETRIES) {
        dispatch({
          type: 'setPiRuntime',
          payload: {
            conversationId: event.conversationId,
            runtime: {
              lastError:
                "L'assistant n'a retourné aucune réponse après 5 tentatives automatiques. Veuillez réessayer dans un instant.",
            },
          },
        })
        return
      }
      retryAttemptsByPromptRef.current[retryKey] = attempts + 1

      const runtime = piStoreGetState().piByConversation[event.conversationId]
      const isStreaming = runtime?.status === 'streaming' || runtime?.state?.isStreaming
      const retryCommand: RpcCommand =
        isStreaming || lastPrompt.steer
          ? { type: 'follow_up', message: lastPrompt.message, images: lastPrompt.images, files: lastPrompt.files }
          : { type: 'prompt', message: lastPrompt.message, images: lastPrompt.images, files: lastPrompt.files }

      dispatch({
        type: 'setPiRuntime',
        payload: {
          conversationId: event.conversationId,
          runtime: {
            pendingCommands: (runtime?.pendingCommands ?? 0) + 1,
          },
        },
      })

      void workspaceIpc
        .piSendCommand(event.conversationId, retryCommand)
        .then((response) => {
          if (!response.success) {
            dispatch({
              type: 'setPiRuntime',
              payload: {
                conversationId: event.conversationId,
                runtime: {
                  lastError: response.error ?? `Commande ${response.command} échouée`,
                },
              },
            })
            if (isMessageSendCommand(response.command)) {
              dispatch({
                type: 'setNotice',
                payload: { notice: buildSendFailureNotice(response.error) },
              })
            }
          }
        })
        .finally(() => {
          const currentRuntime = piStoreGetState().piByConversation[event.conversationId]
          dispatch({
            type: 'setPiRuntime',
            payload: {
              conversationId: event.conversationId,
              runtime: {
                pendingCommands: Math.max((currentRuntime?.pendingCommands ?? 1) - 1, 0),
              },
            },
          })
        })
    })

    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const unsubscribe = workspaceIpc.onConversationUpdated((payload) => {
      if (!payload?.conversationId) return
      if (payload.title) {
        dispatch({
          type: 'updateConversationTitle',
          payload: {
            conversationId: payload.conversationId,
            title: payload.title,
            updatedAt: payload.updatedAt,
          },
        })
      }
      if (payload.worktreePath) {
        dispatch({
          type: 'updateConversationWorktree',
          payload: {
            conversationId: payload.conversationId,
            worktreePath: payload.worktreePath,
            updatedAt: payload.updatedAt,
          },
        })
      }
      if (payload.accessMode) {
        dispatch({
          type: 'updateConversationAccessMode',
          payload: {
            conversationId: payload.conversationId,
            accessMode: payload.accessMode,
            updatedAt: payload.updatedAt,
          },
        })
      }
    })
    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const unsubscribe = workspaceIpc.onExtensionOpenMainView((payload) => {
      if (!payload?.viewId) return
      dispatch({
        type: 'setSidebarMode',
        payload: {
          mode: 'extension-main-view',
          activeExtensionViewId: payload.viewId,
        },
      })
    })
    return () => {
      unsubscribe()
    }
  }, [])

  const setExtensionUpdatesCount = useCallback((count: number) => {
    dispatch({ type: 'setExtensionUpdatesCount', payload: { count } })
  }, [])

  useEffect(() => {
    const checkUpdates = async () => {
      try {
        const result = await workspaceIpc.checkExtensionUpdates()
        setExtensionUpdatesCount(result.updates.length)
      } catch (error) {
        console.error('Failed to check for extension updates:', error)
      }
    }

    checkUpdates()
    const intervalId = setInterval(checkUpdates, 60 * 60 * 1000) // Check every hour

    return () => {
      clearInterval(intervalId)
    }
  }, [setExtensionUpdatesCount])

  useEffect(() => {
    const unsubscribe = workspaceIpc.onExtensionNotification((payload) => {
      if (!payload?.title) return
      const suggestionDraft =
        payload.meta &&
        typeof payload.meta === 'object' &&
        !Array.isArray(payload.meta) &&
        'automationSuggestionDraft' in payload.meta
          ? (payload.meta as {
              automationSuggestionDraft?: {
                name?: unknown
                instruction?: unknown
                trigger?: unknown
                actionType?: unknown
                cooldown?: unknown
              }
            }).automationSuggestionDraft
          : null
      if (
        payload.link?.type === 'deeplink' &&
        payload.link.href === 'automation-suggestion:open' &&
        suggestionDraft
      ) {
        pendingAutomationSuggestionDeeplinkRef.current = {
          viewId: 'automation.main',
          target: 'open-create-automation-suggestion',
          params: {
            name: typeof suggestionDraft.name === 'string' ? suggestionDraft.name : '',
            instruction: typeof suggestionDraft.instruction === 'string' ? suggestionDraft.instruction : '',
            trigger: suggestionDraft.trigger === 'cron' ? 'cron' : 'cron',
            actionType:
              suggestionDraft.actionType === 'executeAndNotify'
                ? 'executeAndNotify'
                : 'executeAndNotify',
            cooldown:
              typeof suggestionDraft.cooldown === 'number' && Number.isFinite(suggestionDraft.cooldown)
                ? suggestionDraft.cooldown
                : 86400000,
          },
        }
      }
      addNotification(payload.body ? `${payload.title}: ${payload.body}` : payload.title, 'info', 0, payload.link)
      dispatch({
        type: 'setNotice',
        payload: {
          notice: payload.body ? `${payload.title}: ${payload.body}` : payload.title,
        },
      })
      if (window.desktop) {
        void window.desktop.showNotification(payload.title, payload.body ?? '')
      }
    })
    return () => {
      unsubscribe()
    }
  }, [addNotification])

  const openAutomationSuggestionReview = useCallback(async () => {
    if (stateRef.current.appMode === 'assistant') {
      dispatch({ type: 'setAssistantExtensionView', payload: { viewId: 'automation.main' } })
    } else {
      dispatch({
        type: 'setSidebarMode',
        payload: {
          mode: 'extension-main-view',
          activeExtensionViewId: 'automation.main',
        },
      })
    }

    const deeplink = pendingAutomationSuggestionDeeplinkRef.current
    if (!deeplink) return

    window.dispatchEvent(
      new CustomEvent('chaton:extension:deeplink', {
        detail: {
          viewId: deeplink.viewId,
          target: deeplink.target,
          params: deeplink.params,
        },
      }),
    )
  }, [dispatch])

  // Listen for deep link events to open the extensions marketplace
  useEffect(() => {
    const unsubscribe = workspaceIpc.onDeeplinkExtensionInstall((payload) => {
      if (!payload?.extensionId) return
      dispatch({
        type: 'setSidebarMode',
        payload: {
          mode: 'extensions',
          deeplinkExtensionId: payload.extensionId,
        },
      })
    })
    return () => {
      unsubscribe()
    }
  }, [])

  const persistSettings = useCallback(async (settings: SidebarSettings) => {
    const saved = await workspaceIpc.updateSettings(settings)
    dispatch({ type: 'updateSettings', payload: saved })
  }, [])

  const toggleProjectCollapsed = useCallback(
    async (projectId: string) => {
      const exists = state.settings.collapsedProjectIds.includes(projectId)
      const collapsedProjectIds = exists
        ? state.settings.collapsedProjectIds.filter((id) => id !== projectId)
        : [...state.settings.collapsedProjectIds, projectId]
      await persistSettings({ ...state.settings, collapsedProjectIds })
    },
    [persistSettings, state.settings],
  )

  const importProject = useCallback(async () => {
    const folderPath = await workspaceIpc.pickProjectFolder()
    if (!folderPath) {
      return
    }

    const result = await workspaceIpc.importProjectFromFolder(folderPath)
    if (!result.ok) {
      dispatch({
        type: 'setNotice',
        payload: { notice: "Le dossier sélectionné n'est pas un repo Git." },
      })
      return
    }

    dispatch({
      type: 'setNotice',
      payload: {
        notice: result.duplicate ? 'Projet déjà importé, sélection appliquée.' : 'Projet importé avec succès.',
      },
    })

    dispatch({ type: 'addProject', payload: { project: result.project } })
    dispatch({
      type: 'selectProject',
      payload: { projectId: result.project.id },
    })
  }, [])

  const connectCloudInstance = useCallback(async (options?: { name?: string; baseUrl?: string }) => {
    const baseUrl = options?.baseUrl ?? 'https://cloud.chatons.ai'
    logger.info('Cloud: Starting connection', { name: options?.name, baseUrl })
    const result = await workspaceIpc.startCloudAuth({
      name: options?.name,
      baseUrl,
    })
    logger.info('Cloud: startCloudAuth result', result)
    if (!result.ok) {
      logger.error('Cloud: Failed to start auth', { reason: result.reason, message: result.message })
      dispatch({
        type: 'setNotice',
        payload: { notice: result.message ?? 'Impossible de connecter cette instance cloud.' },
      })
      return
    }
    logger.info('Cloud: Auth started, opening browser', { instanceId: result.instanceId, authUrl: result.authUrl })
    dispatch({
      type: 'setNotice',
      payload: {
        notice: 'Connexion cloud ouverte dans votre navigateur.',
      },
    })
  }, [])

  const openCloudLogin = useCallback(async () => {
    logger.info('Cloud: Opening login page')
    await workspaceIpc.openExternal('https://cloud.chatons.ai/cloud/login')
  }, [])

  const openCloudSignup = useCallback(async () => {
    logger.info('Cloud: Opening signup page')
    await workspaceIpc.openExternal('https://cloud.chatons.ai/cloud/signup')
  }, [])

  const openCloudSettings = useCallback(() => {
    dispatch({ type: 'setSidebarMode', payload: { mode: 'settings' } })
  }, [])

  const openSettingsToCloud = useCallback(() => {
    dispatch({ type: 'setSidebarMode', payload: { mode: 'settings', settingsSection: 'cloud' } })
  }, [])

  const refreshCloudAccount = useCallback(async () => {
    logger.info('Cloud: Refreshing account')
    const result = await workspaceIpc.getCloudAccount()
    logger.info('Cloud: getCloudAccount result', result)
    if (!result.ok) {
      logger.warn('Cloud: No account or error', { reason: result.reason })
      dispatch({ type: 'setCloudAccount', payload: { account: null } })
      dispatch({ type: 'setCloudAdminUsers', payload: { users: [] } })
      return
    }
    logger.info('Cloud: Account refreshed', { 
      userEmail: result.account?.user.email, 
      organizations: result.account?.organizations.length,
      cloudInstances: state.cloudInstances.length 
    })
    dispatch({ type: 'setCloudAccount', payload: { account: result.account } })
    dispatch({ type: 'setCloudAdminUsers', payload: { users: result.users } })
  }, [state.cloudInstances.length])

  const logoutCloud = useCallback(async () => {
    logger.info('Cloud: Logging out')
    const result = await workspaceIpc.logoutCloud()
    logger.info('Cloud: logoutCloud result', result)
    if (!result.ok) {
      logger.error('Cloud: Logout failed', { reason: result.reason })
      dispatch({
        type: 'setNotice',
        payload: { notice: 'Impossible de se déconnecter du cloud.' },
      })
      return
    }
    logger.info('Cloud: Logout successful')
    dispatch({ type: 'setCloudAccount', payload: { account: null } })
    dispatch({ type: 'setCloudAdminUsers', payload: { users: [] } })
    dispatch({
      type: 'setNotice',
      payload: { notice: 'Déconnexion réussie.' },
    })
  }, [])

  const updateCloudUser = useCallback(async (
    userId: string,
    updates: { subscriptionPlan?: import('../types').CloudSubscriptionPlan; isAdmin?: boolean },
  ) => {
    const result = await workspaceIpc.updateCloudUser(userId, updates)
    if (!result.ok) {
      dispatch({
        type: 'setNotice',
        payload: { notice: result.message ?? 'Impossible de mettre à jour cet utilisateur cloud.' },
      })
      return
    }
    dispatch({ type: 'setCloudAccount', payload: { account: result.account } })
    dispatch({ type: 'setCloudAdminUsers', payload: { users: result.users } })
    dispatch({
      type: 'setNotice',
      payload: { notice: 'Compte cloud mis à jour.' },
    })
  }, [])

  const grantCloudSubscription = useCallback(async (
    userId: string,
    grant: { planId: import('../types').CloudSubscriptionPlan; durationDays?: number | null },
  ) => {
    const result = await workspaceIpc.grantCloudSubscription(userId, grant)
    if (!result.ok) {
      dispatch({
        type: 'setNotice',
        payload: { notice: result.message ?? "Impossible d'allouer cet abonnement complémentaire." },
      })
      return
    }
    dispatch({ type: 'setCloudAccount', payload: { account: result.account } })
    dispatch({ type: 'setCloudAdminUsers', payload: { users: result.users } })
    dispatch({
      type: 'setNotice',
      payload: { notice: 'Abonnement complémentaire alloué.' },
    })
  }, [])

  const updateCloudPlan = useCallback(async (
    planId: import('../types').CloudSubscriptionPlan,
    updates: { label?: string; parallelSessionsLimit?: number; isDefault?: boolean },
  ) => {
    const result = await workspaceIpc.updateCloudPlan(planId, updates)
    if (!result.ok) {
      dispatch({
        type: 'setNotice',
        payload: { notice: result.message ?? "Impossible de mettre à jour ce plan d'abonnement." },
      })
      return
    }
    dispatch({ type: 'setCloudAccount', payload: { account: result.account } })
    dispatch({ type: 'setCloudAdminUsers', payload: { users: result.users } })
    dispatch({
      type: 'setNotice',
      payload: { notice: "Plan d'abonnement mis à jour." },
    })
  }, [])

  const handleCloudProjectConfirm = useCallback(
    async (data: {
      instanceId: string
      projectName: string
      organizationId: string
      kind: 'repository' | 'conversation_only'
      repository?: {
        cloneUrl: string
        defaultBranch: string | null
        authMode: 'none' | 'token'
        accessToken: string | null
      } | null
    }) => {
      setShowCloudProjectModal(false)

      const result = await workspaceIpc.createCloudProject({
        cloudInstanceId: data.instanceId,
        name: data.projectName,
        organizationId: data.organizationId,
        kind: data.kind,
        repository: data.repository ?? null,
      })

      if (!result.ok) {
        dispatch({
          type: 'setNotice',
          payload: { notice: 'Impossible de créer ce projet cloud.' },
        })
        return
      }

      dispatch({ type: 'addProject', payload: { project: result.project } })
      dispatch({
        type: 'selectProject',
        payload: { projectId: result.project.id },
      })
      dispatch({
        type: 'setNotice',
        payload: { notice: 'Projet cloud créé. Premier fil cloud lancé.' },
      })
      const threadResult = await workspaceIpc.createConversationForProject(result.project.id)
      if (threadResult.ok) {
        dispatch({
          type: 'addConversation',
          payload: { conversation: threadResult.conversation },
        })
        dispatch({
          type: 'setSidebarMode',
          payload: { mode: 'default' },
        })
        dispatch({
          type: 'selectConversation',
          payload: { conversationId: threadResult.conversation.id },
        })
      }
    },
    [],
  )

  const createCloudProject = useCallback(async () => {
    const instances = stateRef.current.cloudInstances
    if (instances.length === 0) {
      dispatch({
        type: 'setNotice',
        payload: { notice: "Connectez d'abord une instance cloud." },
      })
      return
    }

    let account = stateRef.current.cloudAccount
    let refreshReason: string | null = null
    if (!account || account.organizations.length === 0) {
      const refreshed = await workspaceIpc.getCloudAccount()
      if (refreshed.ok) {
        account = refreshed.account
        dispatch({ type: 'setCloudAccount', payload: { account: refreshed.account } })
        dispatch({ type: 'setCloudAdminUsers', payload: { users: refreshed.users } })
      } else {
        refreshReason = refreshed.reason
      }
    }

    if (!account) {
      dispatch({
        type: 'setNotice',
        payload: { notice: refreshReason === 'session_expired' ? 'Votre session cloud a expiré. Reconnectez-vous dans Paramètres > Cloud.' : 'Aucune session cloud valide. Reconnectez-vous dans Paramètres > Cloud.' },
      })
      dispatch({ type: 'setSidebarMode', payload: { mode: 'settings', settingsSection: 'cloud' } })
      return
    }

    if (account.organizations.length === 0) {
      dispatch({
        type: 'setNotice',
        payload: { notice: 'Aucune organisation cloud disponible pour ce compte.' },
      })
      return
    }

    setShowCloudProjectModal(true)
  }, [])

  const hydrateConversationRuntime = useCallback(async (conversationId: string) => {
    if (hydratingRuntimeIdsRef.current.has(conversationId)) {
      return
    }

    hydratingRuntimeIdsRef.current.add(conversationId)
    dispatch({
      type: 'setPiRuntime',
      payload: {
        conversationId,
        runtime: {
          status: 'starting',
          lastError: null,
        },
      },
    })

    const started = await workspaceIpc.piStartSession(conversationId)
    if (!started.ok) {
      dispatch({
        type: 'setPiRuntime',
        payload: {
          conversationId,
          runtime: {
            status: 'error',
            lastError: started.message ?? started.reason,
          },
        },
      })
      hydratingRuntimeIdsRef.current.delete(conversationId)
      return
    }

    try {
      const snapshot = await workspaceIpc.piGetSnapshot(conversationId)
      mergeSnapshot(dispatch, conversationId, snapshot)
    } finally {
      hydratingRuntimeIdsRef.current.delete(conversationId)
    }
  }, [])

  const hydrateConversationCache = useCallback(async (conversationId: string) => {
    const cached = await workspaceIpc.getConversationMessageCache(conversationId)
    if (cached.length > 0) {
      dispatch({ type: 'setPiMessages', payload: { conversationId, messages: cached as JsonValue[] } })
    }
  }, [])

  useEffect(() => {
    if (!window.desktop?.onNotificationClick) {
      return
    }

    return window.desktop.onNotificationClick((payload) => {
      const conversationId = typeof payload?.conversationId === 'string' ? payload.conversationId : null
      if (!conversationId) {
        return
      }

      void (async () => {
        const conversationExists = stateRef.current.conversations.some((conversation) => conversation.id === conversationId)
        if (!conversationExists) {
          return
        }
        dispatch({ type: 'setSidebarMode', payload: { mode: 'default' } })
        await hydrateConversationCache(conversationId)
        dispatch({ type: 'selectConversation', payload: { conversationId } })
        dispatch({ type: 'clearConversationActionCompleted', payload: { conversationId } })
        await hydrateConversationRuntime(conversationId)
      })()
    })
  }, [dispatch, hydrateConversationCache, hydrateConversationRuntime])

  const archiveProject = useCallback(
    async (projectId: string, isArchived: boolean) => {
      const project = state.projects.find((p) => p.id === projectId)
      if (!project) {
        return { ok: false as const, reason: 'project_not_found' as const }
      }

      // Optimistic UI: update project state immediately
      dispatch({
        type: 'updateProject',
        payload: {
          project: { ...project, isArchived },
        },
      })

      const result = await workspaceIpc.archiveProject(projectId, isArchived)
      if (!result.ok) {
        // Revert optimistic update on failure
        dispatch({
          type: 'updateProject',
          payload: {
            project,
          },
        })
        dispatch({
          type: 'setNotice',
          payload: { notice: isArchived ? 'Impossible de masquer ce projet.' : 'Impossible d\'afficher ce projet.' },
        })
        return result
      }

      dispatch({ type: 'setNotice', payload: { notice: null } })
      return result
    },
    [state.projects],
  )

  const setProjectHidden = useCallback(
    (projectId: string, isHidden: boolean) => {
      const project = state.projects.find((p) => p.id === projectId)
      if (!project) {
        return
      }

      // Optimistic UI: update project state immediately
      dispatch({
        type: 'updateProject',
        payload: {
          project: { ...project, isHidden },
        },
      })
    },
    [state.projects],
  )

  const updateProjectIcon = useCallback(
    async (projectId: string, icon: string | null) => {
      const project = stateRef.current.projects.find((p) => p.id === projectId)
      if (!project) {
        return { ok: false as const, reason: 'project_not_found' as const }
      }

      const normalizedIcon = icon && icon.trim().length > 0 ? icon.trim() : null

      dispatch({
        type: 'updateProject',
        payload: {
          project: { ...project, icon: normalizedIcon },
        },
      })

      const result = await workspaceIpc.updateProjectIcon(projectId, normalizedIcon)
      if (!result.ok) {
        dispatch({
          type: 'updateProject',
          payload: {
            project,
          },
        })
        dispatch({
          type: 'setNotice',
          payload: { notice: 'Impossible de mettre a jour l\'icone du projet.' },
        })
        return result
      }

      dispatch({ type: 'setNotice', payload: { notice: null } })
      return result
    },
    [],
  )

  const createConversationForProject = useCallback(
    async (projectId: string, options?: { modelProvider?: string; modelId?: string; thinkingLevel?: string; accessMode?: 'secure' | 'open'; channelExtensionId?: string }) => {
      const result = await workspaceIpc.createConversationForProject(projectId, options)
      if (!result.ok) {
        dispatch({
          type: 'setNotice',
          payload: { notice: 'Impossible de créer un fil pour ce projet.' },
        })
        return null
      }

      // If the project is archived, unhide it
      const project = state.projects.find((p) => p.id === projectId)
      if (project?.isArchived) {
        void archiveProject(projectId, false)
      }
      // If the project is hidden, show it
      if (project?.isHidden) {
        setProjectHidden(projectId, false)
      }

      dispatch({
        type: 'addConversation',
        payload: { conversation: result.conversation },
      })

      // Opening a new conversation should leave settings/skills/extensions views
      // and show the thread immediately, even if creation started from another menu.
      dispatch({
        type: 'setSidebarMode',
        payload: { mode: 'default' },
      })

      // Automatically expand the project if it's collapsed
      if (state.settings.collapsedProjectIds.includes(projectId)) {
        await toggleProjectCollapsed(projectId)
      }

      // Automatically select the newly created conversation
      dispatch({
        type: 'selectConversation',
        payload: { conversationId: result.conversation.id },
      })

      // Start hydrating the runtime after selection (for new conversations, no cache to preload)
      const createdProject = stateRef.current.projects.find((p) => p.id === projectId)
      if (createdProject?.location !== 'cloud') {
        void hydrateConversationRuntime(result.conversation.id)
      }
      
      return result.conversation
    },
    [hydrateConversationRuntime, state.settings.collapsedProjectIds, toggleProjectCollapsed, archiveProject, state.projects],
  )

  const createConversationGlobal = useCallback(
    async (options?: { modelProvider?: string; modelId?: string; thinkingLevel?: string; accessMode?: 'secure' | 'open'; channelExtensionId?: string }) => {
      const result = await workspaceIpc.createConversationGlobal(options)
      if (!result.ok) {
        dispatch({
          type: 'setNotice',
          payload: { notice: 'Impossible de créer un fil global.' },
        })
        return null
      }

      dispatch({
        type: 'addConversation',
        payload: { conversation: result.conversation },
      })

      // Opening a new conversation should leave settings/skills/extensions views
      // and show the thread immediately, even if creation started from another menu.
      dispatch({
        type: 'setSidebarMode',
        payload: { mode: 'default' },
      })

      // Automatically select the newly created conversation
      dispatch({
        type: 'selectConversation',
        payload: { conversationId: result.conversation.id },
      })

      // Start hydrating the runtime after selection (for new conversations, no cache to preload)
      void hydrateConversationRuntime(result.conversation.id)
      
      return result.conversation
    },
    [hydrateConversationRuntime],
  )

  const enableConversationWorktree = useCallback(async (conversationId: string) => {
    const result = await workspaceIpc.enableConversationWorktree(conversationId)
    if (!result.ok) {
      dispatch({
        type: 'setNotice',
        payload: { notice: "Impossible d'activer le worktree pour ce fil." },
      })
      return null
    }

    dispatch({
      type: 'updateConversationWorktree',
      payload: {
        conversationId,
        worktreePath: result.conversation.worktreePath ?? '',
        updatedAt: result.conversation.updatedAt,
      },
    })
    return result.conversation
  }, [])

  const disableConversationWorktree = useCallback(async (conversationId: string) => {
    const result = await workspaceIpc.disableConversationWorktree(conversationId)
    if (!result.ok) {
      return result
    }
    if (result.changed) {
      dispatch({
        type: 'updateConversationWorktree',
        payload: {
          conversationId,
          worktreePath: '',
          updatedAt: new Date().toISOString(),
        },
      })
    }
    return result
  }, [])

  const setConversationAccessMode = useCallback(
    async (conversationId: string, accessMode: 'secure' | 'open') => {
      const result = await workspaceIpc.setConversationAccessMode(conversationId, accessMode)
      if (!result.ok) {
        return result
      }

      dispatch({
        type: 'updateConversationAccessMode',
        payload: {
          conversationId,
          accessMode,
          updatedAt: new Date().toISOString(),
        },
      })

      await workspaceIpc.piStopSession(conversationId)
      dispatch({
        type: 'setPiRuntime',
        payload: {
          conversationId,
          runtime: {
            status: 'stopped',
            state: null,
            pendingCommands: 0,
            pendingUserMessage: false,
            pendingUserMessageText: null,
            lastError: null,
          },
        },
      })

      await hydrateConversationRuntime(conversationId)
      return result
    },
    [hydrateConversationRuntime],
  )

  const deleteConversation = useCallback(
    async (conversationId: string, force: boolean = false) => {
      const exists = state.conversations.some((conversation) => conversation.id === conversationId)
      if (!exists) {
        return { ok: false as const, reason: 'conversation_not_found' as const }
      }

      const result = await workspaceIpc.deleteConversation(conversationId, force)
      if (!result.ok) {
        if (result.reason === 'has_uncommitted_changes') {
          // Show confirmation dialog for uncommitted changes
          const userConfirmed = window.confirm(
            '⚠️  Ce fil a des modifications non validées dans son worktree.\n\n' +
            'Si vous supprimez ce fil, TOUTES les modifications non validées dans le worktree seront PERDUES de manière irréversible.\n\n' +
            'Voulez-vous vraiment supprimer ce fil et son worktree ?'
          )
          if (userConfirmed) {
            // Try again with force=true
            return deleteConversation(conversationId, true)
          } else {
            // User cancelled - don't show error notice
            return { ok: false as const, reason: 'user_cancelled' as const }
          }
        }
        
        // For other errors, show notice
        dispatch({
          type: 'setNotice',
          payload: { notice: 'Impossible de supprimer ce fil.' },
        })
        return result
      }

      // Keep archived conversations in state for future archive UI, but hide them from current selectors.
      dispatch({ type: 'archiveConversation', payload: { conversationId } })
      dispatch({ type: 'clearConversationActionCompleted', payload: { conversationId } })
      
      await workspaceIpc.piStopSession(conversationId)

      dispatch({ type: 'setNotice', payload: { notice: null } })
      return result
    },
    [state.conversations],
  )

  const deleteProject = useCallback(
    async (projectId: string) => {
      const exists = state.projects.some((project) => project.id === projectId)
      if (!exists) {
        return { ok: false as const, reason: 'project_not_found' as const }
      }

      const conversationIds = state.conversations.filter((conversation) => conversation.projectId === projectId).map((conversation) => conversation.id)

      // Optimistic UI: hide project and related threads immediately.
      dispatch({ type: 'removeProject', payload: { projectId } })

      await Promise.all(conversationIds.map((conversationId) => workspaceIpc.piStopSession(conversationId)))
      const result = await workspaceIpc.deleteProject(projectId)
      if (!result.ok) {
        const snapshot = await workspaceIpc.getInitialState()
        dispatch({
          type: 'hydrate',
          payload: {
            projects: snapshot.projects,
            conversations: snapshot.conversations,
            cloudInstances: snapshot.cloudInstances,
            cloudAccount: snapshot.cloudAccount,
            cloudAdminUsers: snapshot.cloudAdminUsers,
            settings: snapshot.settings,
            extensionUpdatesCount: snapshot.extensionUpdatesCount ?? 0,
          },
        })
        dispatch({
          type: 'setNotice',
          payload: { notice: 'Impossible de supprimer ce projet.' },
        })
        return result
      }

      dispatch({ type: 'setNotice', payload: { notice: null } })
      return result
    },
    [state.conversations, state.projects],
  )

  const sendPiCommand = useCallback(
    async (conversationId: string, command: RpcCommand) => {
      dispatch({
        type: 'setPiRuntime',
        payload: {
          conversationId,
          runtime: {
            pendingCommands: (piStoreGetState().piByConversation[conversationId]?.pendingCommands ?? 0) + 1,
          },
        },
      })

      const response = await workspaceIpc.piSendCommand(conversationId, command)

      dispatch({
        type: 'setPiRuntime',
        payload: {
          conversationId,
          runtime: {
            pendingCommands: Math.max((piStoreGetState().piByConversation[conversationId]?.pendingCommands ?? 1) - 1, 0),
          },
        },
      })

      if (!response.success) {
        dispatch({
          type: 'setPiRuntime',
          payload: {
            conversationId,
            runtime: {
              lastError: response.error ?? `Commande ${response.command} échouée`,
            },
          },
        })
        if (isMessageSendCommand(response.command)) {
          dispatch({
            type: 'setNotice',
            payload: { notice: buildSendFailureNotice(response.error) },
          })
        }
      }

      return response
    },
    // stateRef is stable — no state dependency needed here
     
    [],
  )

  const clearThreadActionSuggestions = useCallback((conversationId: string) => {
    dispatch({ type: 'clearThreadActionSuggestions', payload: { conversationId } })
  }, [])

  const sendPiPrompt = useCallback(
    async ({
      conversationId,
      message,
      steer = false,
      images = [],
      files = [],
    }: {
      conversationId: string
      message: string
      steer?: boolean
      images?: ImageContent[]
      files?: FileContent[]
    }) => {
      dispatch({ type: 'clearThreadActionSuggestions', payload: { conversationId } })
      lastSentPromptRef.current[conversationId] = {
        message,
        images,
        files,
        steer,
        at: Date.now(),
      }
      retryAttemptsByPromptRef.current = Object.fromEntries(
        Object.entries(retryAttemptsByPromptRef.current).filter(([key]) => !key.startsWith(`${conversationId}:`)),
      )

      // Clear the completed action marker when a new action starts
      if (piStoreGetState().completedActionByConversation[conversationId]) {
        dispatch({ type: 'clearConversationActionCompleted', payload: { conversationId } })
      }

      dispatch({
        type: 'setPiRuntime',
        payload: {
          conversationId,
          runtime: { pendingUserMessage: true, pendingUserMessageText: message, activeStreamTurn: Date.now(), activeStreamEventSeq: 0 },
        },
      })
      dispatch({
        type: 'upsertPiMessage',
        payload: {
          conversationId,
          message: {
            id: `optimistic-user:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
            role: 'user',
            timestamp: Date.now(),
            content: [{ type: 'text', text: message }],
          } satisfies Record<string, JsonValue>,
        },
      })

      if (!gitBaselineByConversationRef.current[conversationId]) {
        const baselineSummary = await workspaceIpc.getGitDiffSummary(conversationId)
        if (baselineSummary.ok) {
          gitBaselineByConversationRef.current[conversationId] = toStatByPath(baselineSummary.files)
          lastFileChangeSignatureByConversationRef.current[conversationId] = JSON.stringify(
            computeThreadDeltaFiles(baselineSummary.files, gitBaselineByConversationRef.current[conversationId]),
          )
        }
      }

      let runtime = piStoreGetState().piByConversation[conversationId]
      if (!runtime) {
        await hydrateConversationRuntime(conversationId)
        runtime = piStoreGetState().piByConversation[conversationId]
      }

      const isStreaming = runtime?.status === 'streaming' || runtime?.state?.isStreaming

      if (steer && isStreaming) {
        await sendPiCommand(conversationId, { type: 'steer', message, images, files })
        return
      }

      if (isStreaming) {
        await sendPiCommand(conversationId, { type: 'follow_up', message, images, files })
        return
      }

      await sendPiCommand(conversationId, { type: 'prompt', message, images, files })
    },
    // Uses stateRef for runtime reads — no state dependency needed, only stable refs/callbacks
    [hydrateConversationRuntime, sendPiCommand],
  )

  useEffect(() => {
    const activeConversationIds = new Set(state.conversations.map((conversation) => conversation.id))
    for (const conversationId of Object.keys(gitBaselineByConversationRef.current)) {
      if (activeConversationIds.has(conversationId)) continue
      delete gitBaselineByConversationRef.current[conversationId]
      delete lastFileChangeSignatureByConversationRef.current[conversationId]
      delete lastCompletedNotificationAtByConversationRef.current[conversationId]
    }
  }, [state.conversations])

  const stopPi = useCallback(async (conversationId: string) => {
    await sendPiCommand(conversationId, { type: 'abort' })
  }, [sendPiCommand])

  const setPiModel = useCallback(
    async (conversationId: string, provider: string, modelId: string) => {
      const response = await sendPiCommand(conversationId, { type: 'set_model', provider, modelId })
      if (response.success) {
        dispatch({ type: 'updateConversationModel', payload: { conversationId, provider, modelId } })
      }
      return response
    },
    [sendPiCommand],
  )

  const setPiThinkingLevel = useCallback(
    async (conversationId: string, level: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh') => {
      return sendPiCommand(conversationId, { type: 'set_thinking_level', level })
    },
    [sendPiCommand],
  )

  const respondExtensionUi = useCallback(async (conversationId: string, response: RpcExtensionUiResponse) => {
    await workspaceIpc.piRespondExtensionUi(conversationId, response)
    dispatch({ type: 'popPiExtensionRequest', payload: { conversationId, id: response.id } })
  }, [])

  const showRequirementSheet = useCallback((conversationId: string, sheet: import('../rpc').RequirementSheet) => {
    dispatch({ type: 'showRequirementSheet', payload: { conversationId, sheet } })
  }, [])

  const dismissRequirementSheet = useCallback((conversationId: string) => {
    dispatch({ type: 'dismissRequirementSheet', payload: { conversationId } })
  }, [])

  const retryLastPiPrompt = useCallback(async (conversationId: string) => {
    const lastPrompt = lastSentPromptRef.current[conversationId]
    if (!lastPrompt?.message) {
      return
    }
    await sendPiPrompt({
      conversationId,
      message: lastPrompt.message,
      steer: lastPrompt.steer,
      images: lastPrompt.images,
      files: lastPrompt.files,
    })
  }, [sendPiPrompt])

  useEffect(() => {
    const conversationId = state.selectedConversationId
    if (!conversationId) {
      return
    }

    const piState = piStoreGetState()
    const runtime = piState.piByConversation[conversationId]
    if (runtime && runtime.status !== 'stopped') {
      return
    }

    // Clear the completed action marker when conversation is selected
    if (piState.completedActionByConversation[conversationId]) {
      dispatch({ type: 'clearConversationActionCompleted', payload: { conversationId } })
    }

    void hydrateConversationRuntime(conversationId)
  }, [hydrateConversationRuntime, state.selectedConversationId, dispatch])

  useEffect(() => {
    if (state.conversations.length === 0) {
      return
    }
    void Promise.all(state.conversations.map((conversation) => hydrateConversationCache(conversation.id)))
  }, [hydrateConversationCache, state.conversations])

  useEffect(() => {
    return workspaceIpc.onCloudConnect((payload) => {
      void (async () => {
        const result = await workspaceIpc.startCloudAuth({
          baseUrl:
            typeof payload.baseUrl === 'string' && payload.baseUrl.trim().length > 0
              ? payload.baseUrl.trim()
              : 'https://cloud.chatons.ai',
        })
        if (!result.ok) {
          dispatch({
            type: 'setNotice',
            payload: { notice: result.message ?? 'Impossible de lancer la connexion cloud.' },
          })
          return
        }

        dispatch({
          type: 'setNotice',
          payload: { notice: 'Connexion cloud ouverte dans votre navigateur.' },
        })
      })()
    })
  }, [dispatch])

  useEffect(() => {
    return workspaceIpc.onCloudAuthCallback((payload) => {
      void (async () => {
        logger.info('Cloud: Auth callback received', { hasCode: !!payload.code, hasState: !!payload.state, error: payload.error });
        const result = await workspaceIpc.completeCloudAuth(payload)
        logger.info('Cloud: completeCloudAuth result', result);
        if (!result.ok) {
          logger.error('Cloud: Auth failed', { reason: result.reason, message: result.message });
          dispatch({
            type: 'setNotice',
            payload: { notice: result.message ?? 'La connexion cloud a échoué.' },
          })
          return
        }

        logger.info('Cloud: Auth successful, fetching state');
        const snapshot = await workspaceIpc.getInitialState()
        logger.info('Cloud: State fetched', { 
          hasAccount: !!snapshot.cloudAccount, 
          cloudInstances: snapshot.cloudInstances.length 
        });
        dispatch({
          type: 'hydrate',
          payload: {
            projects: snapshot.projects,
            conversations: snapshot.conversations,
            cloudInstances: snapshot.cloudInstances,
            cloudAccount: snapshot.cloudAccount,
            cloudAdminUsers: snapshot.cloudAdminUsers,
            settings: snapshot.settings,
            extensionUpdatesCount: snapshot.extensionUpdatesCount ?? 0,
          },
        })
        dispatch({
          type: 'setNotice',
          payload: { notice: 'Connexion cloud réussie.' },
        })
      })()
    })
  }, [])

  useEffect(() => {
    return workspaceIpc.onCloudRealtimeEvent((payload) => {
      void (async () => {
        if (
          payload?.type === 'conversation.event' &&
          typeof payload.conversationId === 'string' &&
          payload.payload &&
          typeof payload.payload === 'object' &&
          'event' in payload.payload
        ) {
          applyPiEvent(
            dispatch,
            {
              conversationId: payload.conversationId,
              event: (payload.payload as { event: import('../rpc').RpcEvent }).event,
            },
            stateRef,
            {
              shouldNotifyConversationCompleted: (conversationId) => {
                const now = Date.now()
                const lastNotifiedAt = lastCompletedNotificationAtByConversationRef.current[conversationId] ?? 0
                if (now - lastNotifiedAt < 3000) {
                  return false
                }
                return true
              },
            },
          )
          return
        }

        const snapshot = await workspaceIpc.getInitialState()
        dispatch({
          type: 'hydrate',
          payload: {
            projects: snapshot.projects,
            conversations: snapshot.conversations,
            cloudInstances: snapshot.cloudInstances,
            cloudAccount: snapshot.cloudAccount,
            cloudAdminUsers: snapshot.cloudAdminUsers,
            settings: snapshot.settings,
            extensionUpdatesCount: snapshot.extensionUpdatesCount ?? 0,
          },
        })
      })()
    })
  }, [])



  const value = useMemo(
    () => ({
      state,
      isLoading,
      openSettings: () => dispatch({ type: 'setSidebarMode', payload: { mode: 'settings' } }),
      openAutomations: () => {
        if (state.appMode === 'assistant') {
          dispatch({ type: 'setAssistantExtensionView', payload: { viewId: 'automation.main' } })
        } else {
          dispatch({
            type: 'setSidebarMode',
            payload: { mode: 'extension-main-view', activeExtensionViewId: 'automation.main' },
          })
        }
      },
      openExtensionMainView: (viewId: string) => {
        // In assistant mode, open as a slide-over sheet instead of replacing the main view
        if (state.appMode === 'assistant') {
          dispatch({ type: 'setAssistantExtensionView', payload: { viewId } })
        } else {
          dispatch({
            type: 'setSidebarMode',
            payload: { mode: 'extension-main-view', activeExtensionViewId: viewId },
          })
        }
      },
      openSkills: () => dispatch({ type: 'setSidebarMode', payload: { mode: 'skills' } }),
      openExtensions: () => dispatch({ type: 'setSidebarMode', payload: { mode: 'extensions' } }),
      openChannels: () => dispatch({ type: 'setSidebarMode', payload: { mode: 'channels' } }),
      openCloudSettings,
      openSettingsToCloud,
      closeSettings: () => dispatch({ type: 'setSidebarMode', payload: { mode: 'default' } }),
      selectProject: async (projectId: string) => {
        dispatch({ type: 'selectProject', payload: { projectId } })
      },
      selectConversation: async (conversationId: string) => {
        dispatch({ type: 'setSidebarMode', payload: { mode: 'default' } })
        // Pre-load message cache before switching conversation to avoid flashing empty state
        await hydrateConversationCache(conversationId)
        // Now switch to the conversation (with messages already loaded)
        dispatch({ type: 'selectConversation', payload: { conversationId } })
        dispatch({ type: 'clearConversationActionCompleted', payload: { conversationId } })
        await hydrateConversationRuntime(conversationId)
      },
      startConversationDraft: (projectId: string) => dispatch({ type: 'startConversationDraft', payload: { projectId } }),
      startGlobalConversationDraft: () => dispatch({ type: 'startGlobalConversationDraft' }),
      toggleProjectCollapsed,
      importProject,
      connectCloudInstance,
      openCloudLogin,
      openCloudSignup,
      refreshCloudAccount,
      logoutCloud,
      updateCloudUser,
      grantCloudSubscription,
      updateCloudPlan,
      createCloudProject,
      createConversationGlobal,
      createConversationForProject,
      enableConversationWorktree,
      disableConversationWorktree,
      deleteConversation,
      deleteProject,
      archiveProject,
      updateProjectIcon,
      setProjectHidden,
      updateSettings: persistSettings,
      setSearchQuery: async (query: string) => {
        await persistSettings({ ...state.settings, searchQuery: query })
      },
      toggleSidebarSearch: async () => {
        await persistSettings({
          ...state.settings,
          isSearchVisible: !state.settings.isSearchVisible,
        })
      },
      sendPiPrompt,
      clearThreadActionSuggestions,
      stopPi,
      setPiModel,
      setPiThinkingLevel,
      respondExtensionUi,
      getPiConfig: () => workspaceIpc.getPiConfigSnapshot(),
      savePiSettingsPatch: (next: PiSettingsJson) => workspaceIpc.updatePiSettingsJson(next as Record<string, unknown>),
      savePiModelsPatch: (next: PiModelsJson) => workspaceIpc.updatePiModelsJson(next as Record<string, unknown>),
      runPiCommand: (action: PiCommandAction, params?: { search?: string; source?: string; local?: boolean }) =>
        workspaceIpc.runPiCommand(action, params),
      getPiDiagnostics: () => workspaceIpc.getPiDiagnostics(),
      openPiPath: (target: 'settings' | 'models' | 'sessions') => workspaceIpc.openPath(target),
      openAutomationSuggestionReview,
      exportPiSessionHtml: (sessionFile: string, outputFile?: string) => workspaceIpc.exportPiSessionHtml(sessionFile, outputFile),
      getWorktreeGitInfo: (conversationId: string) => workspaceIpc.getWorktreeGitInfo(conversationId),
      generateWorktreeCommitMessage: (conversationId: string) => workspaceIpc.generateWorktreeCommitMessage(conversationId),
      commitWorktree: (conversationId: string, message: string) => workspaceIpc.commitWorktree(conversationId, message),
      mergeWorktreeIntoMain: (conversationId: string) => workspaceIpc.mergeWorktreeIntoMain(conversationId),
      pushWorktreeBranch: (conversationId: string) => workspaceIpc.pushWorktreeBranch(conversationId),
      setConversationAccessMode,
      setNotice: (notice: string | null) => dispatch({ type: 'setNotice', payload: { notice } }),
      setExtensionUpdatesCount,
      clearDeeplinkExtensionId: () => dispatch({ type: 'setSidebarMode', payload: { mode: 'extensions', deeplinkExtensionId: null } }),
      setAppMode: (mode: import('../types').AppMode) => dispatch({ type: 'setAppMode', payload: { mode } }),
      setAssistantView: (view: import('../types').AssistantView) => dispatch({ type: 'setAssistantView', payload: { view } }),
      closeAssistantExtensionView: () => dispatch({ type: 'setAssistantExtensionView', payload: { viewId: null } }),
      openExtensionConfigSheet: (viewId: string, title: string) => dispatch({ type: 'openExtensionConfigSheet', payload: { viewId, title } }),
      closeExtensionConfigSheet: () => dispatch({ type: 'closeExtensionConfigSheet' }),
      showRequirementSheet,
      dismissRequirementSheet,
      retryLastPiPrompt,
    }),
    [
      createConversationGlobal,
      createConversationForProject,
      enableConversationWorktree,
      disableConversationWorktree,
      deleteConversation,
      deleteProject,
      archiveProject,
      hydrateConversationCache,
      hydrateConversationRuntime,
      importProject,
      connectCloudInstance,
      refreshCloudAccount,
      updateCloudUser,
      updateCloudPlan,
      createCloudProject,
      openCloudSettings,
      openSettingsToCloud,
      isLoading,
      persistSettings,
      respondExtensionUi,
      sendPiPrompt,
      clearThreadActionSuggestions,
      setConversationAccessMode,
      setExtensionUpdatesCount,
      setPiModel,
      setPiThinkingLevel,
      showRequirementSheet,
      dismissRequirementSheet,
      retryLastPiPrompt,
      state,
      stopPi,
      toggleProjectCollapsed,
    ],
  )

  // Track how often the context value object changes (triggers consumer re-renders)
  const prevValueRef = useRef(value)
  useEffect(() => {
    if (prevValueRef.current !== value) {
      perfMonitor.recordContextValueChange()
      prevValueRef.current = value
    }
  })

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
      {showCloudProjectModal && (
        <CreateCloudProjectModal
          instances={state.cloudInstances}
          organizations={state.cloudAccount?.organizations ?? []}
          activeOrganizationId={state.cloudAccount?.activeOrganizationId ?? null}
          onConfirm={handleCloudProjectConfirm}
          onCancel={() => setShowCloudProjectModal(false)}
        />
      )}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider')
  }

  return context
}
