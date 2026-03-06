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

import i18n from '@/lib/i18n'
import { workspaceIpc } from '@/services/ipc/workspace'
import type { ModifiedFileStatByPath } from '@/components/shell/composer/types'
import { computeThreadDeltaFiles, toStatByPath } from '@/components/shell/composer/git'

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
  | { type: 'startGlobalConversationDraft' }
  | { type: 'toggleProjectCollapsed'; payload: { projectId: string } }
  | { type: 'setSearchQuery'; payload: { query: string } }
  | { type: 'updateSettings'; payload: SidebarSettings }
  | { type: 'addProject'; payload: { project: Project } }
  | { type: 'addConversation'; payload: { conversation: Conversation } }
  | { type: 'removeConversation'; payload: { conversationId: string } }
  | { type: 'removeProject'; payload: { projectId: string } }
  | { type: 'setNotice'; payload: { notice: string | null } }
  | { type: 'setSidebarMode'; payload: { mode: 'default' | 'settings' | 'skills' | 'extensions' | 'extension-main-view'; activeExtensionViewId?: string | null } }
  | { type: 'setPiRuntime'; payload: { conversationId: string; runtime: Partial<PiConversationRuntime> } }
  | { type: 'setPiMessages'; payload: { conversationId: string; messages: JsonValue[] } }
  | { type: 'setConversationDraftMessage'; payload: { conversationId: string | null; message: string } }
  | { type: 'upsertPiMessage'; payload: { conversationId: string; message: JsonValue } }
  | { type: 'pushPiExtensionRequest'; payload: { conversationId: string; request: { id: string; method: string; payload: Record<string, JsonValue | undefined> } } }
  | { type: 'popPiExtensionRequest'; payload: { conversationId: string; id: string } }
  | { type: 'updateConversationModel'; payload: { conversationId: string; provider: string; modelId: string } }
  | { type: 'updateConversationTitle'; payload: { conversationId: string; title: string; updatedAt?: string } }
  | { type: 'updateConversationWorktree'; payload: { conversationId: string; worktreePath: string; updatedAt?: string } }
  | { type: 'markConversationActionCompleted'; payload: { conversationId: string } }
  | { type: 'clearConversationActionCompleted'; payload: { conversationId: string } }


const defaultSettings: SidebarSettings = {
  organizeBy: 'project',
  sortBy: 'updated',
  show: 'all',
  showAssistantStats: false,
  searchQuery: '',
  collapsedProjectIds: [],
  sidebarWidth: 320,
  hasCompletedOnboarding: false,
  allowAnonymousTelemetry: false,
  telemetryConsentAnswered: false,
  defaultBehaviorPrompt: `When searching for text or files, prefer using \`rg\` or \`rg --files\` respectively because \`rg\` is much faster than alternatives like \`grep\`. (If the \`rg\` command is not found, then use alternatives.)
## Editing constraints
- Default to ASCII when editing or creating files. Only introduce non-ASCII or other Unicode characters when there is a clear justification and the file already uses them.
- Add succinct code comments that explain what is going on if code is not self-explanatory. You should not add comments like "Assigns the value to the variable", but a brief comment might be useful ahead of a complex code block that the user would otherwise have to spend time parsing out. Usage of these comments should be rare.
- Try to use apply_patch for single file edits, but it is fine to explore other options to make the edit if it does not work well. Do not use apply_patch for changes that are auto-generated (i.e. generating package.json or running a lint or format command like gofmt) or when scripting is more efficient (such as search and replacing a string across a codebase).
- You may be in a dirty git worktree.
  * NEVER revert existing changes you did not make unless explicitly requested, since these changes were made by the user.
  * If asked to make a commit or code edits and there are unrelated changes to your work or changes that you didn't make in those files, don't revert those changes.
  * If the changes are in files you've touched recently, you should read carefully and understand how you can work with the changes rather than reverting them.
  * If the changes are in unrelated files, just ignore them and don't revert them.
- Do not amend a commit unless explicitly requested to do so.
- While you are working, you might notice unexpected changes that you didn't make. If this happens, STOP IMMEDIATELY and ask the user how they would like to proceed.
- **NEVER** use destructive commands like \`git reset --hard\` or \`git checkout --\` unless specifically requested or approved by the user.
## Special user requests
- If the user makes a simple request (such as asking for the time) which you can fulfill by running a terminal command (such as \`date\`), you should do so.
- If the user asks for a "review", default to a code review mindset: prioritise identifying bugs, risks, behavioural regressions, and missing tests. Findings must be the primary focus of the response - keep summaries or overviews brief and only after enumerating the issues. Present findings first (ordered by severity with file/line references), follow with open questions or assumptions, and offer a change-summary only as a secondary detail. If no findings are discovered, state that explicitly and mention any residual risks or testing gaps.
  * Each reference should have a stand alone path. Even if it's the same file.
  * Do not use URIs like file://, vscode://, or https://.
  * Do not provide range of lines
  * Examples: src/app.ts, src/app.ts:42, b/server/index.js#L10, C:\\repo\\project\\main.rs:12:5
<permissions instructions>
Approval policy is currently never. Do not provide the \`sandbox_permissions\` for any reason, commands will be rejected.`,
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
  activeExtensionViewId: null,
  settings: defaultSettings,
  notice: null,
  piByConversation: {},
  completedActionByConversation: {},
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

function extractPiMessageText(value: JsonValue): string {
  if (typeof value === 'string') {
    return value
  }
  if (!value || typeof value !== 'object') {
    return ''
  }
  if (Array.isArray(value)) {
    return value.map((item) => extractPiMessageText(item)).filter(Boolean).join('\n')
  }
  const record = value as Record<string, JsonValue>
  if (typeof record.text === 'string') {
    return record.text
  }
  if (record.content) {
    return extractPiMessageText(record.content)
  }
  if (record.message) {
    return extractPiMessageText(record.message)
  }
  return ''
}

const UPSTREAM_NO_OUTPUT_RETRY_TEXT = '[upstream returned no assistant output; please retry]'
const UPSTREAM_NO_OUTPUT_MAX_RETRIES = 5

function isMessageSendCommand(command: string): boolean {
  return command === 'prompt' || command === 'follow_up' || command === 'steer'
}

function buildSendFailureNotice(error: string | null | undefined): string {
  const safeError = typeof error === 'string' ? error.trim() : ''
  if (!safeError) {
    return i18n.t('notice.sendMessage.failed')
  }

  const lower = safeError.toLowerCase()
  const isAuthError =
    /\b401\b/.test(lower) ||
    /\bunauthorized\b/.test(lower) ||
    /\bforbidden\b/.test(lower) ||
    /\bapi key\b/.test(lower) ||
    /\bauth\b/.test(lower)

  if (isAuthError) {
    return i18n.t('notice.sendMessage.authFailed')
  }

  return i18n.t('notice.sendMessage.failedWithReason', { reason: safeError })
}

function isUpstreamNoOutputRetryMessage(message: JsonValue): boolean {
  if (getPiMessageRole(message) !== 'assistant') {
    return false
  }
  return extractPiMessageText(message).trim().toLowerCase() === UPSTREAM_NO_OUTPUT_RETRY_TEXT
}

function isPlainRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isEmptyRecord(value: JsonValue | undefined): boolean {
  return isPlainRecord(value) && Object.keys(value).length === 0
}

function mergeToolCallArgs(existing: JsonValue, incoming: JsonValue): JsonValue {
  if (!isPlainRecord(existing) || !isPlainRecord(incoming)) return incoming
  const existingContent = existing.content
  const incomingContent = incoming.content
  if (!Array.isArray(existingContent) || !Array.isArray(incomingContent) || incomingContent.length === 0) {
    return incoming
  }
  const existingPart = existingContent[0]
  const incomingPart = incomingContent[0]
  if (!isPlainRecord(existingPart) || !isPlainRecord(incomingPart)) return incoming
  
  // Handle tool call merging (existing behavior)
  if (existingPart.type === 'toolCall' && incomingPart.type === 'toolCall') {
    if (!('arguments' in existingPart) || !('arguments' in incomingPart)) return incoming
    if (!isEmptyRecord(incomingPart.arguments) || isEmptyRecord(existingPart.arguments)) return incoming

    const mergedPart = { ...incomingPart, arguments: existingPart.arguments }
    const mergedContent = [...incomingContent]
    mergedContent[0] = mergedPart
    return { ...incoming, content: mergedContent }
  }
  
  // Handle tool result merging with existing tool call
  if (existingPart.type === 'toolCall' && incomingPart.type === 'toolResult') {
    // Append tool result to existing tool call message
    const mergedContent = [...existingContent, incomingPart]
    return { ...existing, content: mergedContent, timestamp: incoming.timestamp }
  }
  
  // Handle tool call merging with existing tool result (should not happen, but handle gracefully)
  if (existingPart.type === 'toolResult' && incomingPart.type === 'toolCall') {
    return incoming
  }
  
  return incoming
}

function reducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case 'hydrate': {
      const selectedProjectId = action.payload.projects[0]?.id ?? null
      const firstConversation = action.payload.conversations.find((c) => c.projectId === selectedProjectId)
      const piByConversation: Record<string, PiConversationRuntime> = {}
      const completedActionByConversation: Record<string, boolean> = {}
      for (const conversation of action.payload.conversations) {
        piByConversation[conversation.id] = makePiRuntime()
        completedActionByConversation[conversation.id] = false
      }
      return {
        ...state,
        projects: action.payload.projects,
        conversations: action.payload.conversations,
        settings: action.payload.settings,
        selectedProjectId,
        selectedConversationId: firstConversation?.id ?? action.payload.conversations[0]?.id ?? null,
        piByConversation,
        completedActionByConversation,
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
    case 'startGlobalConversationDraft': {
      return {
        ...state,
        sidebarMode: 'default',
        selectedProjectId: null,
        selectedConversationId: null,
      }
    }
    case 'setSidebarMode': {
      return {
        ...state,
        sidebarMode: action.payload.mode,
        activeExtensionViewId:
          action.payload.mode === 'extension-main-view'
            ? (action.payload.activeExtensionViewId ?? state.activeExtensionViewId)
            : state.activeExtensionViewId,
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
        completedActionByConversation: {
          ...state.completedActionByConversation,
          [action.payload.conversation.id]: false,
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

      const nextCompletedActionByConversation = { ...state.completedActionByConversation }
      delete nextCompletedActionByConversation[action.payload.conversationId]

      return {
        ...state,
        conversations: nextConversations,
        selectedConversationId: fallbackConversation?.id ?? null,
        selectedProjectId: fallbackConversation?.projectId ?? state.selectedProjectId,
        piByConversation: nextPiByConversation,
        completedActionByConversation: nextCompletedActionByConversation,
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

      const nextCompletedActionByConversation = { ...state.completedActionByConversation }
      for (const conversationId of removedConversationIds) {
        delete nextCompletedActionByConversation[conversationId]
      }

      return {
        ...state,
        projects: nextProjects,
        conversations: nextConversations,
        selectedConversationId: fallbackConversation?.id ?? null,
        selectedProjectId: fallbackProjectId,
        piByConversation: nextPiByConversation,
        completedActionByConversation: nextCompletedActionByConversation,
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
      const incomingRole = getPiMessageRole(incoming)
      const nextMessages =
        incomingId === null
          ? (() => {
              if (incomingRole === 'assistant' || incomingRole === 'toolResult') {
                for (let index = current.messages.length - 1; index >= 0; index -= 1) {
                  const existing = current.messages[index]
                  const existingId = getPiMessageId(existing)
                  const existingRole = getPiMessageRole(existing)
                  if (existingId !== null) break
                  if (existingRole === incomingRole) {
                    const updated = [...current.messages]
                    updated[index] = incoming
                    return updated
                  }
                }
              }
              return [...current.messages, incoming]
            })()
          : (() => {
              const index = current.messages.findIndex((message) => getPiMessageId(message) === incomingId)
              if (index === -1) return [...current.messages, incoming]
              const updated = [...current.messages]
              const existing = updated[index]
              updated[index] = mergeToolCallArgs(existing, incoming)
              return updated
            })()
      const reconciledMessages =
        incomingId !== null && incomingRole === 'user'
          ? (() => {
              const incomingText = extractPiMessageText(incoming).trim()
              if (!incomingText) return nextMessages
              const optimisticIndex = nextMessages.findIndex((message) => {
                const id = getPiMessageId(message)
                if (!id || !id.startsWith('optimistic-user:')) return false
                if (getPiMessageRole(message) !== 'user') return false
                return extractPiMessageText(message).trim() === incomingText
              })
              if (optimisticIndex === -1) return nextMessages
              const updated = [...nextMessages]
              updated[optimisticIndex] = incoming
              return updated
            })()
          : nextMessages

      return {
        ...state,
        piByConversation: {
          ...piByConversation,
          [action.payload.conversationId]: {
            ...current,
            messages: reconciledMessages,
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
    case 'updateConversationWorktree': {
      return {
        ...state,
        conversations: state.conversations.map((conversation) =>
          conversation.id === action.payload.conversationId
            ? {
                ...conversation,
                worktreePath: action.payload.worktreePath,
                updatedAt: action.payload.updatedAt ?? conversation.updatedAt,
              }
            : conversation,
        ),
      }
    }
    case 'markConversationActionCompleted': {
      return {
        ...state,
        completedActionByConversation: {
          ...state.completedActionByConversation,
          [action.payload.conversationId]: true,
        },
      }
    }
    case 'clearConversationActionCompleted': {
      const nextCompleted = { ...state.completedActionByConversation }
      delete nextCompleted[action.payload.conversationId]
      return {
        ...state,
        completedActionByConversation: nextCompleted,
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
  openAutomations: () => void
  openExtensionMainView: (viewId: string) => void
  openSkills: () => void
  openExtensions: () => void
  closeSettings: () => void
  selectProject: (projectId: string) => void
  selectConversation: (conversationId: string) => void
  startConversationDraft: (projectId: string) => void
  startGlobalConversationDraft: () => void
  toggleProjectCollapsed: (projectId: string) => void
  importProject: () => Promise<void>
  createConversationGlobal: (
    options?: { modelProvider?: string; modelId?: string; thinkingLevel?: string; accessMode?: 'secure' | 'open' },
  ) => Promise<Conversation | null>
  createConversationForProject: (
    projectId: string,
    options?: { modelProvider?: string; modelId?: string; thinkingLevel?: string; accessMode?: 'secure' | 'open' },
  ) => Promise<Conversation | null>
  enableConversationWorktree: (conversationId: string) => Promise<Conversation | null>
  disableConversationWorktree: (
    conversationId: string,
  ) => Promise<{ ok: true; changed: boolean } | { ok: false; reason: 'conversation_not_found' | 'project_not_found' | 'has_uncommitted_changes' | 'unknown' }>
  deleteConversation: (conversationId: string, force?: boolean) => Promise<DeleteConversationResult>
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
  getWorktreeGitInfo: (
    conversationId: string,
  ) => Promise<
    | {
        ok: true
        worktreePath: string
        branch: string
        baseBranch: string
        hasChanges: boolean
        hasStagedChanges: boolean
        hasUncommittedChanges: boolean
        ahead: number
        behind: number
        isMergedIntoBase: boolean
        isPushedToUpstream: boolean
      }
    | { ok: false; reason: 'conversation_not_found' | 'worktree_not_found' | 'git_not_available' | 'unknown'; message?: string }
  >
  generateWorktreeCommitMessage: (
    conversationId: string,
  ) => Promise<
    | { ok: true; message: string }
    | { ok: false; reason: 'conversation_not_found' | 'worktree_not_found' | 'no_changes' | 'git_not_available' | 'unknown'; message?: string }
  >
  commitWorktree: (
    conversationId: string,
    message: string,
  ) => Promise<
    | { ok: true; commit: string; message: string }
    | { ok: false; reason: 'conversation_not_found' | 'worktree_not_found' | 'empty_message' | 'no_changes' | 'git_not_available' | 'unknown'; message?: string }
  >
  mergeWorktreeIntoMain: (
    conversationId: string,
  ) => Promise<
    | { ok: true; merged: boolean; message: string }
    | { ok: false; reason: 'conversation_not_found' | 'project_not_found' | 'worktree_not_found' | 'already_merged' | 'merge_conflicts' | 'git_not_available' | 'unknown'; message?: string }
  >
  pushWorktreeBranch: (
    conversationId: string,
  ) => Promise<
    | { ok: true; branch: string; remote: string }
    | { ok: false; reason: 'conversation_not_found' | 'worktree_not_found' | 'git_not_available' | 'unknown'; message?: string }
  >
  setConversationAccessMode: (
    conversationId: string,
    accessMode: 'secure' | 'open',
  ) => Promise<{ ok: true; accessMode: 'secure' | 'open' } | { ok: false; reason: 'conversation_not_found' }>
  setNotice: (notice: string | null) => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

function mergeSnapshot(dispatch: React.Dispatch<Action>, conversationId: string, snapshot: { status: string; state: unknown; messages: unknown[] }) {
  const status = snapshot.status as PiConversationRuntime['status']
  const rawState = (snapshot.state as RpcSessionState | null) ?? null
  const normalizedState =
    rawState && status !== 'streaming' && rawState.isStreaming
      ? { ...rawState, isStreaming: false }
      : rawState

  dispatch({
    type: 'setPiRuntime',
    payload: {
      conversationId,
      runtime: {
        status,
        state: normalizedState,
        ...(status !== 'streaming' ? { pendingUserMessage: false, pendingUserMessageText: null } : {}),
      },
    },
  })
  dispatch({ type: 'setPiMessages', payload: { conversationId, messages: (snapshot.messages as JsonValue[]) ?? [] } })
}

// Helper function to extract tool blocks from a message
function getToolBlocks(value: JsonValue): Array<
  | { kind: 'toolCall', name?: string, arguments?: string, toolCallId?: string }
  | { kind: 'toolResult', toolName?: string, text?: string, isError?: boolean, toolCallId?: string }
> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }

  const record = value as Record<string, JsonValue>
  const nestedMessage =
    record.message && typeof record.message === 'object' && !Array.isArray(record.message)
      ? (record.message as Record<string, JsonValue>)
      : null
  const source = nestedMessage ?? record
  const content = Array.isArray(source.content) ? source.content : null
  if (!content) {
    if (source.role === 'toolResult') {
      const toolName = typeof source.toolName === 'string' ? source.toolName : 'tool'
      const text = typeof source.text === 'string' ? source.text : (typeof source.result === 'string' ? source.result : '')
      const isError = source.isError === true || source.error === true
      const toolCallId = typeof source.toolCallId === 'string' ? source.toolCallId : undefined
      return [{ kind: 'toolResult', toolName, text, isError, toolCallId }]
    }
    return []
  }

  const blocks: Array<
    | { kind: 'toolCall', name?: string, arguments?: string, toolCallId?: string }
    | { kind: 'toolResult', toolName?: string, text?: string, isError?: boolean, toolCallId?: string }
  > = []
  for (const item of content) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const part = item as Record<string, JsonValue>
    const type = part.type

    if (type === 'toolCall') {
      const name = typeof part.name === 'string' ? part.name : 'tool'
      const args = part.arguments
      const argumentsText =
        args === undefined ? '' : typeof args === 'string' ? args : JSON.stringify(args, null, 2)
      const toolCallId = typeof part.id === 'string' ? part.id : undefined
      blocks.push({ kind: 'toolCall', name, arguments: argumentsText, toolCallId })
      continue
    }

    if (type === 'toolResult') {
      const toolName = typeof part.toolName === 'string' ? part.toolName : 'tool'
      const text = typeof part.text === 'string' ? part.text : (typeof part.result === 'string' ? part.result : '')
      const isError = part.isError === true || part.error === true
      const toolCallId = typeof part.toolCallId === 'string' ? part.toolCallId : undefined
      blocks.push({ kind: 'toolResult', toolName, text, isError, toolCallId })
    }
  }

  return blocks
}

// Helper function to find matching tool call message for tools without toolCallId
function findMatchingToolCallMessage(state: WorkspaceState, conversationId: string, toolName: string): string {
  const runtime = state.piByConversation[conversationId]
  if (!runtime || !runtime.messages) return `tool-exec-result:${Date.now()}:${toolName}`

  // Look for the most recent tool call message with matching tool name
  for (let i = runtime.messages.length - 1; i >= 0; i--) {
    const message = runtime.messages[i]
    if (typeof message === 'object' && message !== null && 'id' in message && typeof message.id === 'string' && message.id.startsWith('tool-exec:') && !message.id.includes('tool-exec-result:')) {
      const blocks = getToolBlocks(message)
      if (blocks.length > 0 && blocks[0].kind === 'toolCall' && blocks[0].name === toolName) {
        return message.id
      }
    }
  }

  return `tool-exec-result:${Date.now()}:${toolName}`
}

async function showConversationCompletedNotification(conversationTitle: string): Promise<void> {
  try {
    // Check if window.desktop API is available
    if (!window.desktop) {
      return
    }
    
    // Check if window is focused
    const isFocused = await window.desktop.isWindowFocused()
    
    // Only show notification if window is not focused
    if (isFocused) {
      return
    }
    
    // Show notification with translated message
    // Note: In a real app, you'd want to use i18n here, but since we're in the store
    // and don't have access to the React context, we'll use simple translations
    const title = 'Conversation terminée'
    const body = `La conversation "${conversationTitle}" a terminé son action`
    
    await window.desktop.showNotification(title, body)
  } catch (error) {
    console.error('Failed to show notification:', error)
  }
}

function applyPiEvent(dispatch: React.Dispatch<Action>, event: PiRendererEvent, stateRef: React.RefObject<WorkspaceState>): { shouldAutoRetry: boolean } {
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
    return { shouldAutoRetry: false }
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
    return { shouldAutoRetry: false }
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
      const responseCommand = typeof payload.command === 'string' ? payload.command : ''
      if (isMessageSendCommand(responseCommand)) {
        const noticeSourceError = typeof payload.error === 'string' ? payload.error : null
        dispatch({
          type: 'setNotice',
          payload: { notice: buildSendFailureNotice(noticeSourceError) },
        })
      }
    }
    return { shouldAutoRetry: false }
  }

  if (payload.type === 'message_update') {
    const message = payload.message as JsonValue
    if (isUpstreamNoOutputRetryMessage(message)) {
      return { shouldAutoRetry: true }
    }
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
    return { shouldAutoRetry: false }
  }

  if (payload.type === 'tool_execution_start') {
    const toolCallId = typeof payload.toolCallId === 'string' ? payload.toolCallId : null
    const toolName = typeof payload.toolName === 'string' && payload.toolName.trim() ? payload.toolName : 'tool'
    const args = payload.args ?? {}
    const timestamp = Date.now()
    const messageId = toolCallId ? `tool-exec:${toolCallId}` : `tool-exec:${timestamp}:${toolName}`
    const toolCallPart = {
      type: 'toolCall',
      ...(toolCallId ? { id: toolCallId } : {}),
      name: toolName,
      arguments: args,
    } satisfies Record<string, JsonValue>
    const message = {
      id: messageId,
      role: 'assistant',
      timestamp: timestamp,
      content: [toolCallPart],
    } satisfies Record<string, JsonValue>
    dispatch({
      type: 'upsertPiMessage',
      payload: {
        conversationId,
        message,
      },
    })
  }

  if (payload.type === 'tool_execution_end') {
    const toolCallId = typeof payload.toolCallId === 'string' ? payload.toolCallId : null
    const toolName = typeof payload.toolName === 'string' && payload.toolName.trim() ? payload.toolName : 'tool'
    
    // Use the same message ID as the tool call to enable merging
    const messageId = toolCallId 
      ? `tool-exec:${toolCallId}`
      : findMatchingToolCallMessage(stateRef.current, conversationId, toolName)
    const toolResultPart = {
      type: 'toolResult',
      ...(toolCallId ? { toolCallId } : {}),
      toolName,
      isError: payload.isError === true,
      result: payload.result ?? null,
    } satisfies Record<string, JsonValue>
    const message = {
      id: messageId,
      role: 'assistant',
      timestamp: Date.now(),
      content: [toolResultPart],
    } satisfies Record<string, JsonValue>
    dispatch({
      type: 'upsertPiMessage',
      payload: {
        conversationId,
        message,
      },
    })
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
    dispatch({
      type: 'markConversationActionCompleted',
      payload: { conversationId },
    })
    
    // Find the conversation title for notification
    const conversation = stateRef.current.conversations.find(c => c.id === conversationId)
    if (conversation) {
      // Show notification if window is not focused
      void showConversationCompletedNotification(conversation.title)
    }
  }

  if (payload.type === 'extension_ui_request') {
    const method = typeof payload.method === 'string' ? payload.method : ''
    if (method === 'setStatus' || method === 'setWidget' || method === 'set_editor_text' || method === 'setTitle' || method === 'notify') {
      return { shouldAutoRetry: false }
    }
    if (method !== 'select' && method !== 'confirm' && method !== 'input' && method !== 'editor') {
      return { shouldAutoRetry: false }
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
    return { shouldAutoRetry: false }
  }

  return { shouldAutoRetry: false }
}

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

          const deltaFiles = computeThreadDeltaFiles(summary.files, baseline)
          if (deltaFiles.length === 0) {
            return
          }

          const signature = JSON.stringify(deltaFiles)
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
                files: deltaFiles.map((file) => ({
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
