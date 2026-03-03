import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'

import { workspaceIpc } from '@/services/ipc/workspace'

import type {
  Conversation,
  DeleteConversationResult,
  DeleteProjectResult,
  PiCommandAction,
  PiCommandResult,
  PiConfigSnapshot,
  PiDiagnostics,
  PiModelsJson,
  PiSettingsJson,
  Project,
  SidebarSettings,
  WorkspaceState,
} from './types'
import type {
  ImageContent,
  JsonValue,
  PiConversationRuntime,
  PiRendererEvent,
  PiRuntimeStatus,
  RpcCommand,
  RpcExtensionUiResponse,
  RpcResponse,
  RpcSessionState,
} from './rpc'

type Action =
  | {
      type: 'hydrate'
      payload: Pick<WorkspaceState, 'projects' | 'conversations' | 'settings'>
    }
  | { type: 'selectProject'; payload: { projectId: string } }
  | { type: 'selectConversation'; payload: { conversationId: string } }
  | { type: 'startConversationDraft'; payload: { projectId: string } }
  | { type: 'toggleProjectCollapsed'; payload: { projectId: string } }
  | { type: 'setSearchQuery'; payload: { query: string } }
  | { type: 'updateSettings'; payload: SidebarSettings }
  | { type: 'addProject'; payload: { project: Project } }
  | { type: 'addConversation'; payload: { conversation: Conversation } }
  | { type: 'removeConversation'; payload: { conversationId: string } }
  | { type: 'removeProject'; payload: { projectId: string } }
  | { type: 'setNotice'; payload: { notice: string | null } }
  | { type: 'setSidebarMode'; payload: { mode: 'default' | 'settings' } }
  | { type: 'setPiRuntime'; payload: { conversationId: string; runtime: Partial<PiConversationRuntime> } }
  | { type: 'setPiMessages'; payload: { conversationId: string; messages: JsonValue[] } }
  | { type: 'upsertPiMessage'; payload: { conversationId: string; message: JsonValue } }
  | { type: 'pushPiExtensionRequest'; payload: { conversationId: string; request: { id: string; method: string; payload: Record<string, JsonValue | undefined> } } }
  | { type: 'popPiExtensionRequest'; payload: { conversationId: string; id: string } }
  | { type: 'updateConversationModel'; payload: { conversationId: string; provider: string; modelId: string } }
  | { type: 'updateConversationTitle'; payload: { conversationId: string; title: string; updatedAt?: string } }

const defaultSettings: SidebarSettings = {
  organizeBy: 'project',
  sortBy: 'updated',
  show: 'all',
  showAssistantStats: false,
  searchQuery: '',
  collapsedProjectIds: [],
  sidebarWidth: 320,
}

const makePiRuntime = (): PiConversationRuntime => ({
  status: 'stopped',
  state: null,
  messages: [],
  activeStreamTurn: null,
  activeStreamEventSeq: 0,
  pendingUserMessage: false,
  pendingUserMessageText: null,
  pendingCommands: 0,
  lastError: null,
  extensionRequests: [],
  extensionStatus: {},
  extensionWidget: null,
  editorPrefill: null,
})

const initialState: WorkspaceState = {
  projects: [],
  conversations: [],
  selectedProjectId: null,
  selectedConversationId: null,
  sidebarMode: 'default',
  settings: defaultSettings,
  notice: null,
  piByConversation: {},
}

function ensureRuntimeMap(state: WorkspaceState, conversationId: string) {
  if (state.piByConversation[conversationId]) {
    return state.piByConversation
  }
  return {
    ...state.piByConversation,
    [conversationId]: makePiRuntime(),
  }
}

function getPiMessageId(message: JsonValue): string | null {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return null
  }
  const record = message as Record<string, JsonValue>
  return typeof record.id === 'string' ? record.id : null
}

function getPiMessageRole(message: JsonValue): string | null {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return null
  }
  const record = message as Record<string, JsonValue>
  if (typeof record.role === 'string') {
    return record.role
  }
  const nested = record.message
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const nestedRole = (nested as Record<string, JsonValue>).role
    return typeof nestedRole === 'string' ? nestedRole : null
  }
  return null
}

function mergeMessageToolBlocks(existing: JsonValue, incoming: JsonValue): JsonValue {
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) return incoming
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return incoming

  const existingRecord = existing as Record<string, JsonValue>
  const incomingRecord = incoming as Record<string, JsonValue>
  const existingContent = Array.isArray(existingRecord.content) ? existingRecord.content : null
  const incomingContent = Array.isArray(incomingRecord.content) ? incomingRecord.content : null
  if (!existingContent || !incomingContent) return incoming

  const stableString = (value: JsonValue): string => {
    if (value === null) return 'null'
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (Array.isArray(value)) return `[${value.map((item) => stableString(item)).join(',')}]`
    const record = value as Record<string, JsonValue>
    const keys = Object.keys(record).sort()
    return `{${keys.map((key) => `${key}:${stableString(record[key])}`).join(',')}}`
  }

  const compactSignature = (value: JsonValue): string => {
    const raw = stableString(value).replace(/\s+/g, ' ').trim()
    return raw.length > 160 ? raw.slice(0, 160) : raw
  }

  const existingSeq = typeof existingRecord.__streamSeq === 'number' ? existingRecord.__streamSeq : null
  const incomingSeq = typeof incomingRecord.__streamSeq === 'number' ? incomingRecord.__streamSeq : null

  const getToolKey = (part: JsonValue, fallbackIndex: number, sourceSeq: number | null): string | null => {
    if (!part || typeof part !== 'object' || Array.isArray(part)) return null
    const value = part as Record<string, JsonValue>
    const seqPrefix = sourceSeq !== null ? `seq:${sourceSeq}:` : ''
    if (value.type === 'toolCall') {
      const callId = typeof value.id === 'string' ? value.id : null
      const name = typeof value.name === 'string' ? value.name : 'tool'
      const argsSig = compactSignature(value.arguments ?? null)
      return `toolCall:${callId ?? `${seqPrefix}${name}:${argsSig}:${fallbackIndex}`}`
    }
    if (value.type === 'toolResult') {
      const callId = typeof value.toolCallId === 'string' ? value.toolCallId : null
      const name = typeof value.toolName === 'string' ? value.toolName : 'tool'
      const resultSig = compactSignature(value.result ?? value.content ?? null)
      return `toolResult:${callId ?? `${seqPrefix}${name}:${resultSig}:${fallbackIndex}`}`
    }
    return null
  }

  const incomingKeys = new Set<string>()
  for (let i = 0; i < incomingContent.length; i += 1) {
    const key = getToolKey(incomingContent[i], i, incomingSeq)
    if (key) incomingKeys.add(key)
  }

  const mergedContent = [...incomingContent]
  for (let i = 0; i < existingContent.length; i += 1) {
    const part = existingContent[i]
    const key = getToolKey(part, i, existingSeq)
    if (key && !incomingKeys.has(key)) {
      mergedContent.push(part)
    }
  }

  return {
    ...incomingRecord,
    content: mergedContent,
  }
}

function withMessageStreamMeta(message: JsonValue, streamTurn: number, streamSeq: number): JsonValue {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return message
  }
  return {
    ...(message as Record<string, JsonValue>),
    __streamTurn: streamTurn,
    __streamSeq: streamSeq,
  } as JsonValue
}

function reducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case 'hydrate': {
      const selectedProjectId = action.payload.projects[0]?.id ?? null
      const firstConversation = action.payload.conversations.find((c) => c.projectId === selectedProjectId)
      const piByConversation: Record<string, PiConversationRuntime> = {}
      for (const conversation of action.payload.conversations) {
        piByConversation[conversation.id] = makePiRuntime()
      }
      return {
        ...state,
        projects: action.payload.projects,
        conversations: action.payload.conversations,
        settings: action.payload.settings,
        selectedProjectId,
        selectedConversationId: firstConversation?.id ?? action.payload.conversations[0]?.id ?? null,
        piByConversation,
      }
    }
    case 'selectProject': {
      const firstConversation = state.conversations.find((conversation) => conversation.projectId === action.payload.projectId)
      return {
        ...state,
        selectedProjectId: action.payload.projectId,
        selectedConversationId: firstConversation?.id ?? state.selectedConversationId,
      }
    }
    case 'selectConversation': {
      const conversation = state.conversations.find((c) => c.id === action.payload.conversationId)
      return {
        ...state,
        selectedConversationId: action.payload.conversationId,
        selectedProjectId: conversation ? conversation.projectId : state.selectedProjectId,
      }
    }
    case 'startConversationDraft': {
      return {
        ...state,
        sidebarMode: 'default',
        selectedProjectId: action.payload.projectId,
        selectedConversationId: null,
      }
    }
    case 'setSidebarMode': {
      return {
        ...state,
        sidebarMode: action.payload.mode,
      }
    }
    case 'toggleProjectCollapsed': {
      const exists = state.settings.collapsedProjectIds.includes(action.payload.projectId)
      const collapsedProjectIds = exists
        ? state.settings.collapsedProjectIds.filter((id) => id !== action.payload.projectId)
        : [...state.settings.collapsedProjectIds, action.payload.projectId]

      return {
        ...state,
        settings: {
          ...state.settings,
          collapsedProjectIds,
        },
      }
    }
    case 'setSearchQuery': {
      return {
        ...state,
        settings: {
          ...state.settings,
          searchQuery: action.payload.query,
        },
      }
    }
    case 'updateSettings': {
      return {
        ...state,
        settings: action.payload,
      }
    }
    case 'addProject': {
      return {
        ...state,
        projects: [action.payload.project, ...state.projects],
        selectedProjectId: action.payload.project.id,
        settings: {
          ...state.settings,
          collapsedProjectIds: state.settings.collapsedProjectIds.filter((id) => id !== action.payload.project.id),
        },
      }
    }
    case 'addConversation': {
      return {
        ...state,
        conversations: [action.payload.conversation, ...state.conversations],
        selectedConversationId: action.payload.conversation.id,
        selectedProjectId: action.payload.conversation.projectId,
        piByConversation: {
          ...state.piByConversation,
          [action.payload.conversation.id]: makePiRuntime(),
        },
      }
    }
    case 'removeConversation': {
      const nextConversations = state.conversations.filter((conversation) => conversation.id !== action.payload.conversationId)
      const selectedConversationId = state.selectedConversationId === action.payload.conversationId ? null : state.selectedConversationId
      const selectedStillExists =
        selectedConversationId !== null && nextConversations.some((conversation) => conversation.id === selectedConversationId)
      const fallbackConversation = selectedStillExists
        ? nextConversations.find((conversation) => conversation.id === selectedConversationId) ?? null
        : nextConversations.find((conversation) => conversation.projectId === state.selectedProjectId) ?? nextConversations[0] ?? null

      const nextPiByConversation = { ...state.piByConversation }
      delete nextPiByConversation[action.payload.conversationId]

      return {
        ...state,
        conversations: nextConversations,
        selectedConversationId: fallbackConversation?.id ?? null,
        selectedProjectId: fallbackConversation?.projectId ?? state.selectedProjectId,
        piByConversation: nextPiByConversation,
      }
    }
    case 'removeProject': {
      const nextProjects = state.projects.filter((project) => project.id !== action.payload.projectId)
      const removedConversationIds = new Set(
        state.conversations.filter((conversation) => conversation.projectId === action.payload.projectId).map((conversation) => conversation.id),
      )
      const nextConversations = state.conversations.filter((conversation) => conversation.projectId !== action.payload.projectId)

      let selectedConversationId = state.selectedConversationId
      if (selectedConversationId && removedConversationIds.has(selectedConversationId)) {
        selectedConversationId = null
      }

      let selectedProjectId = state.selectedProjectId
      if (selectedProjectId === action.payload.projectId) {
        selectedProjectId = null
      }

      const selectedConversationStillExists =
        selectedConversationId !== null && nextConversations.some((conversation) => conversation.id === selectedConversationId)
      const fallbackConversation = selectedConversationStillExists
        ? nextConversations.find((conversation) => conversation.id === selectedConversationId) ?? null
        : nextConversations[0] ?? null
      const fallbackProjectId = selectedProjectId ?? fallbackConversation?.projectId ?? nextProjects[0]?.id ?? null

      const nextPiByConversation = { ...state.piByConversation }
      for (const conversationId of removedConversationIds) {
        delete nextPiByConversation[conversationId]
      }

      return {
        ...state,
        projects: nextProjects,
        conversations: nextConversations,
        selectedConversationId: fallbackConversation?.id ?? null,
        selectedProjectId: fallbackProjectId,
        piByConversation: nextPiByConversation,
        settings: {
          ...state.settings,
          collapsedProjectIds: state.settings.collapsedProjectIds.filter((id) => id !== action.payload.projectId),
        },
      }
    }
    case 'setPiRuntime': {
      const piByConversation = ensureRuntimeMap(state, action.payload.conversationId)
      const current = piByConversation[action.payload.conversationId]
      return {
        ...state,
        piByConversation: {
          ...piByConversation,
          [action.payload.conversationId]: {
            ...current,
            ...action.payload.runtime,
          },
        },
      }
    }
    case 'setPiMessages': {
      const piByConversation = ensureRuntimeMap(state, action.payload.conversationId)
      const current = piByConversation[action.payload.conversationId]
      return {
        ...state,
        piByConversation: {
          ...piByConversation,
          [action.payload.conversationId]: {
            ...current,
            messages: action.payload.messages,
          },
        },
      }
    }
    case 'upsertPiMessage': {
      const piByConversation = ensureRuntimeMap(state, action.payload.conversationId)
      const current = piByConversation[action.payload.conversationId]
      const incoming = action.payload.message
      const incomingId = getPiMessageId(incoming)
      const streamTurn = current.activeStreamTurn
      const isStreamingMessage = current.status === 'streaming' && streamTurn !== null
      const nextStreamEventSeq = isStreamingMessage ? current.activeStreamEventSeq + 1 : current.activeStreamEventSeq
      const messageWithStreamTurn = isStreamingMessage ? withMessageStreamMeta(incoming, streamTurn, nextStreamEventSeq) : incoming

      if (isStreamingMessage) {
        return {
          ...state,
          piByConversation: {
            ...piByConversation,
            [action.payload.conversationId]: {
              ...current,
              messages: [...current.messages, messageWithStreamTurn],
              activeStreamEventSeq: nextStreamEventSeq,
            },
          },
        }
      }

      const nextMessages =
        incomingId === null
          ? (() => {
              return [...current.messages, messageWithStreamTurn]
            })()
          : (() => {
              let index = -1
              for (let i = current.messages.length - 1; i >= 0; i -= 1) {
                if (getPiMessageId(current.messages[i]) === incomingId) {
                  index = i
                  break
                }
              }
              if (index === -1) {
                return [...current.messages, messageWithStreamTurn]
              }
              const existing = current.messages[index]
              const updated = [...current.messages]
              updated[index] = mergeMessageToolBlocks(existing, messageWithStreamTurn)
              return updated
            })()

      return {
        ...state,
        piByConversation: {
          ...piByConversation,
          [action.payload.conversationId]: {
            ...current,
            messages: nextMessages,
            activeStreamEventSeq: nextStreamEventSeq,
          },
        },
      }
    }
    case 'pushPiExtensionRequest': {
      const piByConversation = ensureRuntimeMap(state, action.payload.conversationId)
      const current = piByConversation[action.payload.conversationId]
      return {
        ...state,
        piByConversation: {
          ...piByConversation,
          [action.payload.conversationId]: {
            ...current,
            extensionRequests: [...current.extensionRequests, action.payload.request],
          },
        },
      }
    }
    case 'popPiExtensionRequest': {
      const piByConversation = ensureRuntimeMap(state, action.payload.conversationId)
      const current = piByConversation[action.payload.conversationId]
      return {
        ...state,
        piByConversation: {
          ...piByConversation,
          [action.payload.conversationId]: {
            ...current,
            extensionRequests: current.extensionRequests.filter((req) => req.id !== action.payload.id),
          },
        },
      }
    }
    case 'updateConversationModel': {
      return {
        ...state,
        conversations: state.conversations.map((conversation) =>
          conversation.id === action.payload.conversationId
            ? { ...conversation, modelProvider: action.payload.provider, modelId: action.payload.modelId }
            : conversation,
        ),
      }
    }
    case 'updateConversationTitle': {
      return {
        ...state,
        conversations: state.conversations.map((conversation) =>
          conversation.id === action.payload.conversationId
            ? {
                ...conversation,
                title: action.payload.title,
                updatedAt: action.payload.updatedAt ?? conversation.updatedAt,
              }
            : conversation,
        ),
      }
    }
    case 'setNotice': {
      return {
        ...state,
        notice: action.payload.notice,
      }
    }
    default:
      return state
  }
}

type WorkspaceContextValue = {
  state: WorkspaceState
  isLoading: boolean
  openSettings: () => void
  closeSettings: () => void
  selectProject: (projectId: string) => void
  selectConversation: (conversationId: string) => void
  startConversationDraft: (projectId: string) => void
  toggleProjectCollapsed: (projectId: string) => void
  importProject: () => Promise<void>
  createConversationForProject: (
    projectId: string,
    options?: { modelProvider?: string; modelId?: string; thinkingLevel?: string },
  ) => Promise<Conversation | null>
  deleteConversation: (conversationId: string) => Promise<DeleteConversationResult>
  deleteProject: (projectId: string) => Promise<DeleteProjectResult>
  updateSettings: (settings: SidebarSettings) => Promise<void>
  setSearchQuery: (query: string) => Promise<void>
  sendPiPrompt: (args: { conversationId: string; message: string; steer?: boolean; images?: ImageContent[] }) => Promise<void>
  stopPi: (conversationId: string) => Promise<void>
  setPiModel: (conversationId: string, provider: string, modelId: string) => Promise<RpcResponse>
  setPiThinkingLevel: (conversationId: string, level: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh') => Promise<RpcResponse>
  respondExtensionUi: (conversationId: string, response: RpcExtensionUiResponse) => Promise<void>
  getPiConfig: () => Promise<PiConfigSnapshot>
  savePiSettingsPatch: (next: PiSettingsJson) => Promise<{ ok: true } | { ok: false; message: string }>
  savePiModelsPatch: (next: PiModelsJson) => Promise<{ ok: true } | { ok: false; message: string }>
  runPiCommand: (action: PiCommandAction, params?: { search?: string; source?: string; local?: boolean }) => Promise<PiCommandResult>
  getPiDiagnostics: () => Promise<PiDiagnostics>
  openPiPath: (target: 'settings' | 'models' | 'sessions') => Promise<{ ok: boolean; message?: string }>
  exportPiSessionHtml: (sessionFile: string, outputFile?: string) => Promise<PiCommandResult>
  setNotice: (notice: string | null) => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

function mergeSnapshot(dispatch: React.Dispatch<Action>, conversationId: string, snapshot: { status: string; state: unknown; messages: unknown[] }) {
  dispatch({
    type: 'setPiRuntime',
    payload: {
      conversationId,
      runtime: {
        status: snapshot.status as PiConversationRuntime['status'],
        state: (snapshot.state as RpcSessionState | null) ?? null,
      },
    },
  })
  dispatch({ type: 'setPiMessages', payload: { conversationId, messages: (snapshot.messages as JsonValue[]) ?? [] } })
}

function applyPiEvent(dispatch: React.Dispatch<Action>, event: PiRendererEvent) {
  const conversationId = event.conversationId
  const payload = event.event

  if (payload.type === 'runtime_status') {
    const nextStatus = payload.status as PiRuntimeStatus
    const nextMessage = typeof payload.message === 'string' ? payload.message : 'Pi error'
    dispatch({
      type: 'setPiRuntime',
      payload: {
        conversationId,
        runtime: {
          status: nextStatus,
          ...(nextStatus === 'ready' || nextStatus === 'error' || nextStatus === 'stopped'
            ? { activeStreamTurn: null, activeStreamEventSeq: 0 }
            : {}),
          ...(nextStatus === 'streaming' ? { pendingUserMessage: false, pendingUserMessageText: null } : {}),
          lastError: nextStatus === 'error' ? nextMessage : null,
        },
      },
    })
    return
  }

  if (payload.type === 'runtime_error') {
    const runtimeError = typeof payload.message === 'string' ? payload.message : 'Pi runtime error'
    dispatch({
      type: 'setPiRuntime',
      payload: {
        conversationId,
        runtime: {
          status: 'error',
          lastError: runtimeError,
        },
      },
    })
    return
  }

  if (payload.type === 'response') {
    const shouldClearPendingUserMessage =
      payload.command === 'prompt' || payload.command === 'follow_up' || payload.command === 'steer'

    if (shouldClearPendingUserMessage && !payload.success) {
      dispatch({
        type: 'setPiRuntime',
        payload: {
          conversationId,
          runtime: {
            pendingUserMessage: false,
            pendingUserMessageText: null,
          },
        },
      })
    }

    if (payload.command === 'get_state' && payload.success) {
      dispatch({
        type: 'setPiRuntime',
        payload: {
          conversationId,
          runtime: {
            state: payload.data as unknown as RpcSessionState,
          },
        },
      })
    }

    if (payload.command === 'get_messages' && payload.success) {
      const data = payload.data as { messages?: JsonValue[] }
      dispatch({
        type: 'setPiMessages',
        payload: {
          conversationId,
          messages: data?.messages ?? [],
        },
      })
    }

    if (!payload.success) {
      const errorMessage = typeof payload.error === 'string' ? payload.error : `Commande ${payload.command} échouée`
      dispatch({
        type: 'setPiRuntime',
        payload: {
          conversationId,
          runtime: {
            lastError: errorMessage,
          },
        },
      })
    }
    return
  }

  if (payload.type === 'message_update') {
    const message = payload.message as JsonValue
    const role = getPiMessageRole(message)
    if (role === 'user') {
      dispatch({
        type: 'setPiRuntime',
        payload: {
          conversationId,
          runtime: {
            pendingUserMessage: false,
            pendingUserMessageText: null,
          },
        },
      })
    }

    if (message) {
      dispatch({
        type: 'upsertPiMessage',
        payload: {
          conversationId,
          message,
        },
      })
    }
  }

  if (payload.type === 'agent_end') {
    dispatch({
      type: 'setPiRuntime',
      payload: {
        conversationId,
        runtime: {
          status: 'ready',
          pendingCommands: 0,
          pendingUserMessage: false,
          pendingUserMessageText: null,
        },
      },
    })
  }

  if (payload.type === 'extension_ui_request') {
    const method = typeof payload.method === 'string' ? payload.method : ''
    if (method === 'setStatus' || method === 'setWidget' || method === 'set_editor_text' || method === 'setTitle' || method === 'notify') {
      return
    }
    if (method !== 'select' && method !== 'confirm' && method !== 'input' && method !== 'editor') {
      return
    }

    dispatch({
      type: 'pushPiExtensionRequest',
      payload: {
        conversationId,
        request: {
          id: String(payload.id),
          method,
          payload,
        },
      },
    })
  }
}

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [isLoading, setIsLoading] = useState(true)
  const hydratingRuntimeIdsRef = useRef(new Set<string>())

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
      applyPiEvent(dispatch, event)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const unsubscribe = workspaceIpc.onConversationUpdated((payload) => {
      if (!payload?.conversationId || !payload?.title) {
        return
      }
      dispatch({
        type: 'updateConversationTitle',
        payload: {
          conversationId: payload.conversationId,
          title: payload.title,
          updatedAt: payload.updatedAt,
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
    async (projectId: string, options?: { modelProvider?: string; modelId?: string; thinkingLevel?: string }) => {
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

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      const exists = state.conversations.some((conversation) => conversation.id === conversationId)
      if (!exists) {
        return { ok: false as const, reason: 'conversation_not_found' as const }
      }

      // Optimistic UI: hide row immediately, persist deletion in background.
      dispatch({ type: 'removeConversation', payload: { conversationId } })

      await workspaceIpc.piStopSession(conversationId)
      const result = await workspaceIpc.deleteConversation(conversationId)
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
          payload: { notice: 'Impossible de supprimer ce fil.' },
        })
        return result
      }

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
      dispatch({
        type: 'setPiRuntime',
        payload: {
          conversationId,
          runtime: { pendingUserMessage: true, pendingUserMessageText: message, activeStreamTurn: Date.now(), activeStreamEventSeq: 0 },
        },
      })

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
    [hydrateConversationRuntime, sendPiCommand, state.piByConversation],
  )

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

    void hydrateConversationRuntime(conversationId)
  }, [hydrateConversationRuntime, state.piByConversation, state.selectedConversationId])

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
      closeSettings: () => dispatch({ type: 'setSidebarMode', payload: { mode: 'default' } }),
      selectProject: (projectId: string) => dispatch({ type: 'selectProject', payload: { projectId } }),
      selectConversation: async (conversationId: string) => {
        dispatch({ type: 'setSidebarMode', payload: { mode: 'default' } })
        dispatch({ type: 'selectConversation', payload: { conversationId } })
        await hydrateConversationCache(conversationId)
        await hydrateConversationRuntime(conversationId)
      },
      startConversationDraft: (projectId: string) => dispatch({ type: 'startConversationDraft', payload: { projectId } }),
      toggleProjectCollapsed,
      importProject,
      createConversationForProject,
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
      setNotice: (notice: string | null) => dispatch({ type: 'setNotice', payload: { notice } }),
    }),
    [
      createConversationForProject,
      deleteConversation,
      deleteProject,
      hydrateConversationCache,
      hydrateConversationRuntime,
      importProject,
      isLoading,
      persistSettings,
      respondExtensionUi,
      sendPiPrompt,
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
