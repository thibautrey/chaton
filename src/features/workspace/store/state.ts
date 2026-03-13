import i18n from '@/lib/i18n'

import type {
  AppMode,
  AssistantView,
  Conversation,
  ConversationStatus,
  Project,
  SidebarSettings,
  WorkspaceState,
} from '../types'
import type {
  JsonValue,
  PiConversationRuntime,
  ThreadActionSuggestion,
} from '../rpc'

export type Action =
  | {
      type: 'hydrate'
      payload: Pick<WorkspaceState, 'projects' | 'conversations' | 'settings' | 'extensionUpdatesCount'>
    }
  | { type: 'selectProject'; payload: { projectId: string } }
  | { type: 'selectConversation'; payload: { conversationId: string } }
  | { type: 'startConversationDraft'; payload: { projectId: string } }
  | { type: 'startGlobalConversationDraft' }
  | { type: 'toggleProjectCollapsed'; payload: { projectId: string } }
  | { type: 'setSearchQuery'; payload: { query: string } }
  | { type: 'updateSettings'; payload: SidebarSettings }
  | { type: 'addProject'; payload: { project: Project } }
  | { type: 'updateProject'; payload: { project: Project } }
  | { type: 'addConversation'; payload: { conversation: Conversation } }
  | { type: 'removeConversation'; payload: { conversationId: string } }
  | { type: 'archiveConversation'; payload: { conversationId: string; updatedAt?: string } }
  | { type: 'removeProject'; payload: { projectId: string } }
  | { type: 'setNotice'; payload: { notice: string | null } }
  | { type: 'setExtensionUpdatesCount'; payload: { count: number } }
  | { type: 'setSidebarMode'; payload: { mode: 'default' | 'settings' | 'skills' | 'extensions' | 'channels' | 'extension-main-view'; activeExtensionViewId?: string | null; deeplinkExtensionId?: string | null } }
  | { type: 'setAppMode'; payload: { mode: AppMode } }
  | { type: 'setAssistantView'; payload: { view: AssistantView } }
  | { type: 'setAssistantExtensionView'; payload: { viewId: string | null } }
  | { type: 'openExtensionConfigSheet'; payload: { viewId: string; title: string } }
  | { type: 'closeExtensionConfigSheet' }
  | { type: 'setPiRuntime'; payload: { conversationId: string; runtime: Partial<PiConversationRuntime> } }
  | { type: 'setThreadActionSuggestions'; payload: { conversationId: string; actions: ThreadActionSuggestion[] } }
  | { type: 'clearThreadActionSuggestions'; payload: { conversationId: string } }
  | { type: 'setPiMessages'; payload: { conversationId: string; messages: JsonValue[] } }
  | { type: 'setConversationDraftMessage'; payload: { conversationId: string | null; message: string } }
  | { type: 'upsertPiMessage'; payload: { conversationId: string; message: JsonValue } }
  | { type: 'pushPiExtensionRequest'; payload: { conversationId: string; request: { id: string; method: string; payload: Record<string, JsonValue | undefined> } } }
  | { type: 'popPiExtensionRequest'; payload: { conversationId: string; id: string } }
  | { type: 'updateConversationModel'; payload: { conversationId: string; provider: string; modelId: string } }
  | { type: 'updateConversationTitle'; payload: { conversationId: string; title: string; updatedAt?: string } }
  | { type: 'updateConversationWorktree'; payload: { conversationId: string; worktreePath: string; updatedAt?: string } }
  | { type: 'updateConversationAccessMode'; payload: { conversationId: string; accessMode: 'secure' | 'open'; updatedAt?: string } }
  | { type: 'markConversationActionCompleted'; payload: { conversationId: string } }
  | { type: 'clearConversationActionCompleted'; payload: { conversationId: string } }
  | { type: 'updateProjectSubFolder'; payload: { folderId: string; projectIds: string[] } }
  | { type: 'addProjectToSubFolder'; payload: { folderId: string; projectId: string } }
  | { type: 'removeProjectFromSubFolder'; payload: { folderId: string; projectId: string } }
  | { type: 'showRequirementSheet'; payload: { conversationId: string; sheet: import('../rpc').RequirementSheet } }
  | { type: 'dismissRequirementSheet'; payload: { conversationId: string } }


export const defaultSettings: SidebarSettings = {
  organizeBy: 'project',
  sortBy: 'updated',
  show: 'all',
  showAssistantStats: false,
  searchQuery: '',
  isSearchVisible: false,
  collapsedProjectIds: [],
  sidebarWidth: 320,
  hasCompletedOnboarding: false,
  allowAnonymousTelemetry: false,
  telemetryConsentAnswered: false,
  anonymousInstallId: null,
  enableConversationChime: true,
  assistantOnboardingCompleted: false,
  assistantName: '',
  assistantUserName: '',
  assistantChannelId: null,
  projectSubFolders: [],
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

export const makePiRuntime = (): PiConversationRuntime => ({
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
  threadActionSuggestions: [],
  requirementSheet: null,
})

export const initialState: WorkspaceState = {
  projects: [],
  conversations: [],
  selectedProjectId: null,
  selectedConversationId: null,
  sidebarMode: 'default',
  activeExtensionViewId: null,
  deeplinkExtensionId: null,
  appMode: 'workspace',
  assistantView: 'home',
  assistantExtensionViewId: null,
  extensionConfigSheet: null,
  settings: defaultSettings,
  notice: null,
  extensionUpdatesCount: 0,
}

import type { PiStoreState } from './pi-store'

export function ensureRuntimeMap(piState: PiStoreState, conversationId: string): PiStoreState['piByConversation'] {
  if (piState.piByConversation[conversationId]) {
    return piState.piByConversation
  }
  return {
    ...piState.piByConversation,
    [conversationId]: makePiRuntime(),
  }
}

export function getPiMessageId(message: JsonValue): string | null {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return null
  }
  const record = message as Record<string, JsonValue>
  return typeof record.id === 'string' ? record.id : null
}

export function getPiMessageRole(message: JsonValue): string | null {
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

export function extractPiMessageText(value: JsonValue): string {
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

export const UPSTREAM_NO_OUTPUT_RETRY_TEXT = '[upstream returned no assistant output; please retry]'
export const UPSTREAM_NO_OUTPUT_MAX_RETRIES = 5

export function isMessageSendCommand(command: string): boolean {
  return command === 'prompt' || command === 'follow_up' || command === 'steer'
}

export function buildSendFailureNotice(error: string | null | undefined): string {
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

export function isUpstreamNoOutputRetryMessage(message: JsonValue): boolean {
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

// Extract all toolCallIds from a message's content array
function getToolCallIdsFromMessage(message: JsonValue): string[] {
  if (!isPlainRecord(message)) return []
  const content = Array.isArray(message.content) ? message.content : []
  const ids: string[] = []
  for (const part of content) {
    if (!isPlainRecord(part)) continue
    if (part.type === 'toolCall' && typeof part.id === 'string' && part.id.length > 0) {
      ids.push(part.id)
    }
  }
  return ids
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
    const previousResultIndex = existingContent.findIndex(
      (part) => isPlainRecord(part) && part.type === 'toolResult',
    )
    const mergedContent = [...existingContent]
    if (previousResultIndex >= 0) {
      mergedContent[previousResultIndex] = incomingPart
    } else {
      mergedContent.push(incomingPart)
    }
    return { ...existing, content: mergedContent, timestamp: incoming.timestamp }
  }
  
  // Handle tool call merging with existing tool result (should not happen, but handle gracefully)
  if (existingPart.type === 'toolResult' && incomingPart.type === 'toolCall') {
    return incoming
  }
  
  return incoming
}

export function reducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case 'hydrate': {
      const selectedProjectId = action.payload.projects[0]?.id ?? null
      const firstConversation = action.payload.conversations.find((c) => c.projectId === selectedProjectId)
      return {
        ...state,
        projects: action.payload.projects,
        conversations: action.payload.conversations,
        settings: action.payload.settings,
        extensionUpdatesCount: action.payload.extensionUpdatesCount ?? 0,
        selectedProjectId,
        selectedConversationId: firstConversation?.id ?? action.payload.conversations[0]?.id ?? null,
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
            : null,
        deeplinkExtensionId:
          action.payload.mode === 'extensions'
            ? (action.payload.deeplinkExtensionId ?? null)
            : null,
      }
    }
    case 'setAppMode': {
      return {
        ...state,
        appMode: action.payload.mode,
        assistantView: 'home',
        assistantExtensionViewId: null,
        // Reset sidebar to default when switching modes
        sidebarMode: 'default',
        activeExtensionViewId: null,
      }
    }
    case 'setAssistantView': {
      return {
        ...state,
        assistantView: action.payload.view,
        assistantExtensionViewId: null,
      }
    }
    case 'setAssistantExtensionView': {
      return {
        ...state,
        assistantExtensionViewId: action.payload.viewId,
      }
    }
    case 'openExtensionConfigSheet': {
      return {
        ...state,
        extensionConfigSheet: {
          viewId: action.payload.viewId,
          title: action.payload.title,
        },
      }
    }
    case 'closeExtensionConfigSheet': {
      return {
        ...state,
        extensionConfigSheet: null,
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
    case 'updateProject': {
      return {
        ...state,
        projects: state.projects.map((project) =>
          project.id === action.payload.project.id ? action.payload.project : project,
        ),
      }
    }
    case 'addConversation': {
      // Pi state handled by piReducer
      return {
        ...state,
        conversations: [action.payload.conversation, ...state.conversations],
        selectedConversationId: action.payload.conversation.id,
        selectedProjectId: action.payload.conversation.projectId,
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

      // Pi state cleanup handled by piReducer
      return {
        ...state,
        conversations: nextConversations,
        selectedConversationId: fallbackConversation?.id ?? null,
        selectedProjectId: fallbackConversation?.projectId ?? state.selectedProjectId,
      }
    }
    case 'archiveConversation': {
      const archivedStatus: ConversationStatus = 'archived'
      const nextConversations = state.conversations.map((conversation) =>
        conversation.id === action.payload.conversationId
          ? {
              ...conversation,
              status: archivedStatus,
              updatedAt: action.payload.updatedAt ?? conversation.updatedAt,
            }
          : conversation,
      )
      const visibleConversations = nextConversations.filter((conversation) => conversation.status !== 'archived')
      const selectedConversationId = state.selectedConversationId === action.payload.conversationId ? null : state.selectedConversationId
      const selectedStillExists =
        selectedConversationId !== null && visibleConversations.some((conversation) => conversation.id === selectedConversationId)
      const fallbackConversation = selectedStillExists
        ? visibleConversations.find((conversation) => conversation.id === selectedConversationId) ?? null
        : visibleConversations.find((conversation) => conversation.projectId === state.selectedProjectId) ?? visibleConversations[0] ?? null

      return {
        ...state,
        conversations: nextConversations,
        selectedConversationId: fallbackConversation?.id ?? null,
        selectedProjectId: fallbackConversation?.projectId ?? state.selectedProjectId,
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

      // Pi state cleanup handled by piReducer
      return {
        ...state,
        projects: nextProjects,
        conversations: nextConversations,
        selectedConversationId: fallbackConversation?.id ?? null,
        selectedProjectId: fallbackProjectId,
        settings: {
          ...state.settings,
          collapsedProjectIds: state.settings.collapsedProjectIds.filter((id) => id !== action.payload.projectId),
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
    case 'updateConversationAccessMode': {
      return {
        ...state,
        conversations: state.conversations.map((conversation) =>
          conversation.id === action.payload.conversationId
            ? {
                ...conversation,
                accessMode: action.payload.accessMode,
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
    case 'setExtensionUpdatesCount': {
      return {
        ...state,
        extensionUpdatesCount: action.payload.count,
      }
    }
    // Pi-related actions are no-ops in this reducer.
    // They are handled by piReducer() which updates the external pi-store.
    case 'setPiRuntime':
    case 'setThreadActionSuggestions':
    case 'clearThreadActionSuggestions':
    case 'setPiMessages':
    case 'upsertPiMessage':
    case 'pushPiExtensionRequest':
    case 'popPiExtensionRequest':
    case 'markConversationActionCompleted':
    case 'clearConversationActionCompleted':
    case 'showRequirementSheet':
    case 'dismissRequirementSheet':
    case 'setConversationDraftMessage':
      return state
    default:
      return state
  }
}

/**
 * Handles Pi-related actions by updating the external piStore.
 * These actions are deliberately kept out of the React reducer to
 * prevent high-frequency streaming events from triggering re-renders
 * of all useWorkspace() consumers (17 components).
 */
export function piReducer(piState: PiStoreState, action: Action): PiStoreState {
  switch (action.type) {
    case 'hydrate': {
      const piByConversation: Record<string, PiConversationRuntime> = {}
      const completedActionByConversation: Record<string, boolean> = {}
      for (const conversation of action.payload.conversations) {
        piByConversation[conversation.id] = makePiRuntime()
        completedActionByConversation[conversation.id] = false
      }
      return { piByConversation, completedActionByConversation }
    }
    case 'addConversation': {
      return {
        piByConversation: {
          ...piState.piByConversation,
          [action.payload.conversation.id]: makePiRuntime(),
        },
        completedActionByConversation: {
          ...piState.completedActionByConversation,
          [action.payload.conversation.id]: false,
        },
      }
    }
    case 'removeConversation': {
      const nextPi = { ...piState.piByConversation }
      delete nextPi[action.payload.conversationId]
      const nextCompleted = { ...piState.completedActionByConversation }
      delete nextCompleted[action.payload.conversationId]
      return { piByConversation: nextPi, completedActionByConversation: nextCompleted }
    }
    case 'archiveConversation':
      return piState
    case 'removeProject': {
      // Need conversations list to know which to remove. Provider passes it.
      // For now, this is handled in the provider dispatch wrapper.
      return piState
    }
    case 'updateProject': {
      // Project metadata updates don't affect Pi state
      return piState
    }
    case 'setPiRuntime': {
      const piByConversation = ensureRuntimeMap(piState, action.payload.conversationId)
      const current = piByConversation[action.payload.conversationId]
      return {
        ...piState,
        piByConversation: {
          ...piByConversation,
          [action.payload.conversationId]: { ...current, ...action.payload.runtime },
        },
      }
    }
    case 'setThreadActionSuggestions': {
      const piByConversation = ensureRuntimeMap(piState, action.payload.conversationId)
      const current = piByConversation[action.payload.conversationId]
      return {
        ...piState,
        piByConversation: {
          ...piByConversation,
          [action.payload.conversationId]: { ...current, threadActionSuggestions: action.payload.actions },
        },
      }
    }
    case 'clearThreadActionSuggestions': {
      const piByConversation = ensureRuntimeMap(piState, action.payload.conversationId)
      const current = piByConversation[action.payload.conversationId]
      if ((current.threadActionSuggestions?.length ?? 0) === 0) return piState
      return {
        ...piState,
        piByConversation: {
          ...piByConversation,
          [action.payload.conversationId]: { ...current, threadActionSuggestions: [] },
        },
      }
    }
    case 'setPiMessages': {
      const piByConversation = ensureRuntimeMap(piState, action.payload.conversationId)
      const current = piByConversation[action.payload.conversationId]
      return {
        ...piState,
        piByConversation: {
          ...piByConversation,
          [action.payload.conversationId]: { ...current, messages: action.payload.messages },
        },
      }
    }
    case 'upsertPiMessage': {
      const piByConversation = ensureRuntimeMap(piState, action.payload.conversationId)
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
      // Evict tool-exec placeholder messages whose tool calls are now covered by the incoming message.
      // This handles the race where tool_execution_start fires before message_update arrives.
      const afterToolExecEviction = (() => {
        if (!incomingId || incomingId.startsWith('tool-exec:')) return nextMessages
        const incomingToolCallIds = getToolCallIdsFromMessage(incoming)
        if (incomingToolCallIds.length === 0) return nextMessages
        const evictIds = new Set<string>()
        for (const msg of nextMessages) {
          const msgId = getPiMessageId(msg)
          if (!msgId || !msgId.startsWith('tool-exec:')) continue
          const msgToolCallIds = getToolCallIdsFromMessage(msg)
          if (msgToolCallIds.some((id) => incomingToolCallIds.includes(id))) {
            evictIds.add(msgId)
          }
        }
        if (evictIds.size === 0) return nextMessages
        return nextMessages.filter((msg) => {
          const msgId = getPiMessageId(msg)
          return !msgId || !evictIds.has(msgId)
        })
      })()
      const reconciledMessages =
        incomingId !== null && incomingRole === 'user'
          ? (() => {
              const incomingText = extractPiMessageText(incoming).trim()
              if (!incomingText) return afterToolExecEviction
              const optimisticIndex = afterToolExecEviction.findIndex((message) => {
                const id = getPiMessageId(message)
                if (!id || !id.startsWith('optimistic-user:')) return false
                if (getPiMessageRole(message) !== 'user') return false
                return extractPiMessageText(message).trim() === incomingText
              })
              if (optimisticIndex === -1) return afterToolExecEviction
              const updated = [...afterToolExecEviction]
              updated[optimisticIndex] = incoming
              return updated
            })()
          : afterToolExecEviction
      return {
        ...piState,
        piByConversation: {
          ...piByConversation,
          [action.payload.conversationId]: { ...current, messages: reconciledMessages },
        },
      }
    }
    case 'pushPiExtensionRequest': {
      const piByConversation = ensureRuntimeMap(piState, action.payload.conversationId)
      const current = piByConversation[action.payload.conversationId]
      return {
        ...piState,
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
      const piByConversation = ensureRuntimeMap(piState, action.payload.conversationId)
      const current = piByConversation[action.payload.conversationId]
      return {
        ...piState,
        piByConversation: {
          ...piByConversation,
          [action.payload.conversationId]: {
            ...current,
            extensionRequests: current.extensionRequests.filter((req) => req.id !== action.payload.id),
          },
        },
      }
    }
    case 'markConversationActionCompleted': {
      return {
        ...piState,
        completedActionByConversation: {
          ...piState.completedActionByConversation,
          [action.payload.conversationId]: true,
        },
      }
    }
    case 'clearConversationActionCompleted': {
      const next = { ...piState.completedActionByConversation }
      delete next[action.payload.conversationId]
      return { ...piState, completedActionByConversation: next }
    }
    case 'showRequirementSheet': {
      const piByConversation = ensureRuntimeMap(piState, action.payload.conversationId)
      const current = piByConversation[action.payload.conversationId]
      return {
        ...piState,
        piByConversation: {
          ...piByConversation,
          [action.payload.conversationId]: { ...current, requirementSheet: action.payload.sheet },
        },
      }
    }
    case 'dismissRequirementSheet': {
      const piByConversation = ensureRuntimeMap(piState, action.payload.conversationId)
      const current = piByConversation[action.payload.conversationId]
      return {
        ...piState,
        piByConversation: {
          ...piByConversation,
          [action.payload.conversationId]: { ...current, requirementSheet: null },
        },
      }
    }
    default:
      return piState
  }
}
