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

import type { ModifiedFileStatByPath } from '@/components/shell/composer/types'
import { computeRecentChangedFiles, computeThreadDeltaFiles, toStatByPath } from '@/components/shell/composer/git'
import { workspaceIpc } from '@/services/ipc/workspace'

import type {
  PiCommandAction,
  PiModelsJson,
  PiSettingsJson,
  SidebarSettings,
} from '../types'
import type {
  ImageContent,
  JsonValue,
  RpcCommand,
  RpcExtensionUiResponse,
} from '../rpc'
import { WorkspaceContext } from './context'
import { applyPiEvent, mergeSnapshot } from './pi-events'
import {
  buildSendFailureNotice,
  initialState,
  isMessageSendCommand,
  reducer,
  UPSTREAM_NO_OUTPUT_MAX_RETRIES,
} from './state'

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [isLoading, setIsLoading] = useState(true)
  const hydratingRuntimeIdsRef = useRef(new Set<string>())
  const stateRef = useRef(state)
  const lastSentPromptRef = useRef<
    Record<string, { message: string; images: ImageContent[]; at: number; steer: boolean }>
  >({})
  const retryAttemptsByPromptRef = useRef<Record<string, number>>({})
  const gitBaselineByConversationRef = useRef<Record<string, ModifiedFileStatByPath>>({})
  const lastFileChangeSignatureByConversationRef = useRef<Record<string, string>>({})
  const lastEditToolCallAtByConversationRef = useRef<Record<string, number>>({})

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
      const result = applyPiEvent(dispatch, event, stateRef) ?? { shouldAutoRetry: false }

      const payload = event.event as Record<string, JsonValue> | null
      if (payload?.type === 'tool_execution_start') {
        const conversationId = event.conversationId
        const toolName = typeof payload.toolName === 'string' ? payload.toolName.trim() : ''
        if (toolName === 'edit') {
          lastEditToolCallAtByConversationRef.current[conversationId] = Date.now()
        }
      }

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

          const recentFiles = computeRecentChangedFiles(summary.files, baseline)
          gitBaselineByConversationRef.current[conversationId] = toStatByPath(summary.files)
          if (recentFiles.length === 0) {
            return
          }

          const lastEditAt = lastEditToolCallAtByConversationRef.current[conversationId] ?? 0
          const toolName = typeof payload.toolName === 'string' ? payload.toolName.trim() : ''
          const wasTriggeredByRecentEdit = toolName === 'edit' || Date.now() - lastEditAt <= 3000
          if (!wasTriggeredByRecentEdit) {
            return
          }

          const signature = JSON.stringify(recentFiles)
          if (lastFileChangeSignatureByConversationRef.current[conversationId] === signature) {
            return
          }
          lastFileChangeSignatureByConversationRef.current[conversationId] = signature

          const payloadToolCallId = typeof payload.toolCallId === 'string' ? payload.toolCallId : null
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

      const runtime = stateRef.current.piByConversation[event.conversationId]
      const isStreaming = runtime?.status === 'streaming' || runtime?.state?.isStreaming
      const retryCommand: RpcCommand =
        isStreaming || lastPrompt.steer
          ? { type: 'follow_up', message: lastPrompt.message, images: lastPrompt.images }
          : { type: 'prompt', message: lastPrompt.message, images: lastPrompt.images }

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
          const currentRuntime = stateRef.current.piByConversation[event.conversationId]
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

  useEffect(() => {
    const unsubscribe = workspaceIpc.onExtensionNotification((payload) => {
      if (!payload?.title) return
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
        payload: { notice: 'Le dossier sélectionné n’est pas un repo Git.' },
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

  const hydrateConversationRuntime = useCallback(async (conversationId: string) => {
    if (hydratingRuntimeIdsRef.current.has(conversationId)) {
      return
    }

    hydratingRuntimeIdsRef.current.add(conversationId)

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

  const createConversationForProject = useCallback(
    async (projectId: string, options?: { modelProvider?: string; modelId?: string; thinkingLevel?: string; accessMode?: 'secure' | 'open' }) => {
      const result = await workspaceIpc.createConversationForProject(projectId, options)
      if (!result.ok) {
        dispatch({
          type: 'setNotice',
          payload: { notice: 'Impossible de créer un fil pour ce projet.' },
        })
        return null
      }

      dispatch({
        type: 'addConversation',
        payload: { conversation: result.conversation },
      })
      void hydrateConversationRuntime(result.conversation.id)
      return result.conversation
    },
    [hydrateConversationRuntime],
  )

  const createConversationGlobal = useCallback(
    async (options?: { modelProvider?: string; modelId?: string; thinkingLevel?: string; accessMode?: 'secure' | 'open' }) => {
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
        payload: { notice: 'Impossible d’activer le worktree pour ce fil.' },
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

      const snapshot = await workspaceIpc.getInitialState()
      dispatch({
        type: 'hydrate',
        payload: {
          projects: snapshot.projects,
          conversations: snapshot.conversations,
          settings: snapshot.settings,
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

      // Only do optimistic UI if deletion was successful
      dispatch({ type: 'removeConversation', payload: { conversationId } })
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
            settings: snapshot.settings,
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
            pendingCommands: (state.piByConversation[conversationId]?.pendingCommands ?? 0) + 1,
          },
        },
      })

      const response = await workspaceIpc.piSendCommand(conversationId, command)

      dispatch({
        type: 'setPiRuntime',
        payload: {
          conversationId,
          runtime: {
            pendingCommands: Math.max((state.piByConversation[conversationId]?.pendingCommands ?? 1) - 1, 0),
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
    [state.piByConversation],
  )

  const sendPiPrompt = useCallback(
    async ({
      conversationId,
      message,
      steer = false,
      images = [],
    }: {
      conversationId: string
      message: string
      steer?: boolean
      images?: ImageContent[]
    }) => {
      lastSentPromptRef.current[conversationId] = {
        message,
        images,
        steer,
        at: Date.now(),
      }
      retryAttemptsByPromptRef.current = Object.fromEntries(
        Object.entries(retryAttemptsByPromptRef.current).filter(([key]) => !key.startsWith(`${conversationId}:`)),
      )
      
      // Clear the completed action marker when a new action starts
      if (state.completedActionByConversation[conversationId]) {
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

      const runtime = state.piByConversation[conversationId]
      if (!runtime) {
        await hydrateConversationRuntime(conversationId)
      }

      const effectiveRuntime = state.piByConversation[conversationId]
      const isStreaming = effectiveRuntime?.status === 'streaming' || effectiveRuntime?.state?.isStreaming

      if (steer && isStreaming) {
        await sendPiCommand(conversationId, { type: 'steer', message, images })
        return
      }

      if (isStreaming) {
        await sendPiCommand(conversationId, { type: 'follow_up', message, images })
        return
      }

      await sendPiCommand(conversationId, { type: 'prompt', message, images })
    },
    [hydrateConversationRuntime, sendPiCommand, state.piByConversation, state.completedActionByConversation],
  )

  useEffect(() => {
    const activeConversationIds = new Set(state.conversations.map((conversation) => conversation.id))
    for (const conversationId of Object.keys(gitBaselineByConversationRef.current)) {
      if (activeConversationIds.has(conversationId)) continue
      delete gitBaselineByConversationRef.current[conversationId]
      delete lastFileChangeSignatureByConversationRef.current[conversationId]
      delete lastEditToolCallAtByConversationRef.current[conversationId]
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

  useEffect(() => {
    const conversationId = state.selectedConversationId
    if (!conversationId) {
      return
    }

    const runtime = state.piByConversation[conversationId]
    if (runtime && runtime.status !== 'stopped') {
      return
    }

    // Clear the completed action marker when conversation is selected
    if (state.completedActionByConversation[conversationId]) {
      dispatch({ type: 'clearConversationActionCompleted', payload: { conversationId } })
    }

    void hydrateConversationRuntime(conversationId)
  }, [hydrateConversationRuntime, state.piByConversation, state.selectedConversationId, state.completedActionByConversation])

  useEffect(() => {
    if (state.conversations.length === 0) {
      return
    }
    void Promise.all(state.conversations.map((conversation) => hydrateConversationCache(conversation.id)))
  }, [hydrateConversationCache, state.conversations])



  const value = useMemo(
    () => ({
      state,
      isLoading,
      openSettings: () => dispatch({ type: 'setSidebarMode', payload: { mode: 'settings' } }),
      openAutomations: () =>
        dispatch({
          type: 'setSidebarMode',
          payload: { mode: 'extension-main-view', activeExtensionViewId: 'automation.main' },
        }),
      openExtensionMainView: (viewId: string) =>
        dispatch({
          type: 'setSidebarMode',
          payload: { mode: 'extension-main-view', activeExtensionViewId: viewId },
        }),
      openSkills: () => dispatch({ type: 'setSidebarMode', payload: { mode: 'skills' } }),
      openExtensions: () => dispatch({ type: 'setSidebarMode', payload: { mode: 'extensions' } }),
      closeSettings: () => dispatch({ type: 'setSidebarMode', payload: { mode: 'default' } }),
      selectProject: (projectId: string) => dispatch({ type: 'selectProject', payload: { projectId } }),
      selectConversation: async (conversationId: string) => {
        dispatch({ type: 'setSidebarMode', payload: { mode: 'default' } })
        dispatch({ type: 'selectConversation', payload: { conversationId } })
        dispatch({ type: 'clearConversationActionCompleted', payload: { conversationId } })
        await hydrateConversationCache(conversationId)
        await hydrateConversationRuntime(conversationId)
      },
      startConversationDraft: (projectId: string) => dispatch({ type: 'startConversationDraft', payload: { projectId } }),
      startGlobalConversationDraft: () => dispatch({ type: 'startGlobalConversationDraft' }),
      toggleProjectCollapsed,
      importProject,
      createConversationGlobal,
      createConversationForProject,
      enableConversationWorktree,
      disableConversationWorktree,
      deleteConversation,
      deleteProject,
      updateSettings: persistSettings,
      setSearchQuery: async (query: string) => {
        await persistSettings({ ...state.settings, searchQuery: query })
      },
      sendPiPrompt,
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
      exportPiSessionHtml: (sessionFile: string, outputFile?: string) => workspaceIpc.exportPiSessionHtml(sessionFile, outputFile),
      getWorktreeGitInfo: (conversationId: string) => workspaceIpc.getWorktreeGitInfo(conversationId),
      generateWorktreeCommitMessage: (conversationId: string) => workspaceIpc.generateWorktreeCommitMessage(conversationId),
      commitWorktree: (conversationId: string, message: string) => workspaceIpc.commitWorktree(conversationId, message),
      mergeWorktreeIntoMain: (conversationId: string) => workspaceIpc.mergeWorktreeIntoMain(conversationId),
      pushWorktreeBranch: (conversationId: string) => workspaceIpc.pushWorktreeBranch(conversationId),
      setConversationAccessMode,
      setNotice: (notice: string | null) => dispatch({ type: 'setNotice', payload: { notice } }),
    }),
    [
      createConversationGlobal,
      createConversationForProject,
      enableConversationWorktree,
      disableConversationWorktree,
      deleteConversation,
      deleteProject,
      hydrateConversationCache,
      hydrateConversationRuntime,
      importProject,
      isLoading,
      persistSettings,
      respondExtensionUi,
      sendPiPrompt,
      setConversationAccessMode,
      setPiModel,
      setPiThinkingLevel,
      state,
      stopPi,
      toggleProjectCollapsed,
    ],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider')
  }

  return context
}
