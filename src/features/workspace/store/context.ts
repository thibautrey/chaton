import { createContext } from 'react'

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
  SidebarSettings,
  WorkspaceState,
} from '../types'
import type {
  ImageContent,
  FileContent,
  RequirementSheet,
  RpcExtensionUiResponse,
  RpcResponse,
} from '../rpc'

export type WorkspaceContextValue = {
  state: WorkspaceState
  isLoading: boolean
  openSettings: () => void
  openAutomations: () => void
  openExtensionMainView: (viewId: string) => void
  openSkills: () => void
  openExtensions: () => void
  openChannels: () => void
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
  toggleSidebarSearch: () => Promise<void>
  sendPiPrompt: (args: { conversationId: string; message: string; steer?: boolean; images?: ImageContent[]; files?: FileContent[] }) => Promise<void>
  clearThreadActionSuggestions: (conversationId: string) => void
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
  showRequirementSheet: (conversationId: string, sheet: RequirementSheet) => void
  dismissRequirementSheet: (conversationId: string) => void
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)
