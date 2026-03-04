import type {
  CreateConversationResult,
  DeleteConversationResult,
  DeleteProjectResult,
  PiCommandAction,
  PiCommandResult,
  PiConfigSnapshot,
  PiDiagnostics,
  ChatonExtension,
  Project,
  SidebarSettings,
  WorkspacePayload,
} from '@/features/workspace/types'
import type {
  PiRendererEvent,
  RpcCommand,
  RpcExtensionUiResponse,
  RpcResponse,
} from '@/features/workspace/rpc'

function getApi() {
  return window.chaton
}

type ImportProjectResult =
  | { ok: true; duplicate: boolean; project: Project }
  | { ok: false; reason: 'not_git_repo' | 'unknown' }

type PiModel = {
  id: string
  provider: string
  scoped: boolean
  key: string
  supportsThinking: boolean
  thinkingLevels: Array<'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'>
}
type ListPiModelsResult =
  | { ok: true; models: PiModel[] }
  | { ok: false; reason: 'pi_not_available' | 'unknown'; message?: string }
type SetPiModelScopedResult =
  | { ok: true; models: PiModel[] }
  | { ok: false; reason: 'pi_not_available' | 'invalid_model' | 'unknown'; message?: string }
type PiCommandParams = { search?: string; source?: string; local?: boolean }
type WorktreeGitInfoResult =
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
  | {
      ok: false
      reason: 'conversation_not_found' | 'worktree_not_found' | 'git_not_available' | 'unknown'
      message?: string
    }


export const workspaceIpc = {
  getInitialState: () => window.chaton.getInitialState(),
  getGitDiffSummary: (conversationId: string) => getApi().getGitDiffSummary(conversationId),
  getGitFileDiff: (conversationId: string, filePath: string) => getApi().getGitFileDiff(conversationId, filePath),
  getWorktreeGitInfo: (conversationId: string): Promise<WorktreeGitInfoResult> => getApi().getWorktreeGitInfo(conversationId),
  generateWorktreeCommitMessage: (
    conversationId: string,
  ): Promise<
    | { ok: true; message: string }
    | { ok: false; reason: 'conversation_not_found' | 'worktree_not_found' | 'no_changes' | 'git_not_available' | 'unknown'; message?: string }
  > => getApi().generateWorktreeCommitMessage(conversationId),
  commitWorktree: (
    conversationId: string,
    message: string,
  ): Promise<
    | { ok: true; commit: string; message: string }
    | { ok: false; reason: 'conversation_not_found' | 'worktree_not_found' | 'empty_message' | 'no_changes' | 'git_not_available' | 'unknown'; message?: string }
  > => getApi().commitWorktree(conversationId, message),
  mergeWorktreeIntoMain: (
    conversationId: string,
  ): Promise<
    | { ok: true; merged: boolean; message: string }
    | { ok: false; reason: 'conversation_not_found' | 'project_not_found' | 'worktree_not_found' | 'already_merged' | 'merge_conflicts' | 'git_not_available' | 'unknown'; message?: string }
  > => getApi().mergeWorktreeIntoMain(conversationId),
  pushWorktreeBranch: (
    conversationId: string,
  ): Promise<
    | { ok: true; branch: string; remote: string }
    | { ok: false; reason: 'conversation_not_found' | 'worktree_not_found' | 'git_not_available' | 'unknown'; message?: string }
  > => getApi().pushWorktreeBranch(conversationId),
  pickProjectFolder: () => getApi().pickProjectFolder(),
  importProjectFromFolder: (folderPath: string) => getApi().importProjectFromFolder(folderPath),
  deleteProject: (projectId: string): Promise<DeleteProjectResult> => getApi().deleteProject(projectId),
  updateSettings: (settings: SidebarSettings) => getApi().updateSettings(settings),
  createConversationForProject: (
    projectId: string,
    options?: { modelProvider?: string; modelId?: string; thinkingLevel?: string },
  ): Promise<CreateConversationResult> => getApi().createConversationForProject(projectId, options),
  deleteConversation: (conversationId: string): Promise<DeleteConversationResult> => getApi().deleteConversation(conversationId),
  getConversationMessageCache: (conversationId: string): Promise<unknown[]> => getApi().getConversationMessageCache(conversationId),
  requestConversationAutoTitle: (
    conversationId: string,
    firstMessage: string,
  ): Promise<
    | { ok: true; skipped?: boolean; title?: string }
    | {
        ok: false
        reason: 'empty_message' | 'conversation_not_found' | 'project_not_found' | 'title_generation_failed'
      }
  > => getApi().requestConversationAutoTitle(conversationId, firstMessage),
  listPiModels: (): Promise<ListPiModelsResult> => getApi().listPiModels(),
  syncPiModels: (): Promise<ListPiModelsResult> => getApi().syncPiModels(),
  setPiModelScoped: (provider: string, id: string, scoped: boolean): Promise<SetPiModelScopedResult> =>
    getApi().setPiModelScoped(provider, id, scoped),
  getPiConfigSnapshot: (): Promise<PiConfigSnapshot> => getApi().getPiConfigSnapshot(),
  updatePiSettingsJson: (next: Record<string, unknown>): Promise<{ ok: true } | { ok: false; message: string }> =>
    getApi().updatePiSettingsJson(next),
  updatePiModelsJson: (next: Record<string, unknown>): Promise<{ ok: true } | { ok: false; message: string }> =>
    getApi().updatePiModelsJson(next),
  updatePiAuthJson: (next: Record<string, unknown>): Promise<{ ok: true } | { ok: false; message: string }> =>
    getApi().updatePiAuthJson(next),
  runPiCommand: (action: PiCommandAction, params?: PiCommandParams): Promise<PiCommandResult> =>
    getApi().runPiCommand(action, params ?? {}),
  getPiDiagnostics: (): Promise<PiDiagnostics> => getApi().getPiDiagnostics(),
  listExtensions: (): Promise<{ ok: true; extensions: ChatonExtension[] }> => getApi().listExtensions(),
  installExtension: (id: string): Promise<{ ok: boolean; message?: string; extension?: ChatonExtension }> => getApi().installExtension(id),
  toggleExtension: (id: string, enabled: boolean): Promise<{ ok: boolean; id?: string; enabled?: boolean; message?: string }> =>
    getApi().toggleExtension(id, enabled),
  removeExtension: (id: string): Promise<{ ok: boolean; id?: string; message?: string }> => getApi().removeExtension(id),
  runExtensionHealthCheck: (): Promise<{ ok: true; report: Array<{ id: string; enabled: boolean; health: string; lastRunStatus: string | null; lastError: string | null }> }> =>
    getApi().runExtensionHealthCheck(),
  getExtensionLogs: (id: string): Promise<{ ok: true; id: string; content: string }> => getApi().getExtensionLogs(id),
  openPath: (target: 'settings' | 'models' | 'sessions'): Promise<{ ok: boolean; message?: string }> => getApi().openPath(target),
  exportPiSessionHtml: (sessionFile: string, outputFile?: string): Promise<PiCommandResult> =>
    getApi().exportPiSessionHtml(sessionFile, outputFile),
  piStartSession: (conversationId: string): Promise<{ ok: true } | { ok: false; reason: string; message?: string }> =>
    getApi().piStartSession(conversationId),
  piStopSession: (conversationId: string): Promise<{ ok: true }> => getApi().piStopSession(conversationId),
  piSendCommand: (conversationId: string, command: RpcCommand): Promise<RpcResponse> =>
    getApi().piSendCommand(conversationId, command),
  piGetSnapshot: (conversationId: string) => getApi().piGetSnapshot(conversationId),
  piRespondExtensionUi: (
    conversationId: string,
    response: RpcExtensionUiResponse,
  ): Promise<{ ok: true } | { ok: false; reason: string }> => getApi().piRespondExtensionUi(conversationId, response),
  onPiEvent: (listener: (event: PiRendererEvent) => void): (() => void) => getApi().onPiEvent(listener),
  onConversationUpdated: (
    listener: (payload: { conversationId: string; title: string; updatedAt: string }) => void,
  ): (() => void) => getApi().onConversationUpdated(listener),
  getLanguagePreference: (): Promise<string> => getApi().getLanguagePreference(),
  updateLanguagePreference: (language: string): Promise<void> => getApi().updateLanguagePreference(language),
  detectVscode: (): Promise<{ detected: boolean }> => getApi().detectVscode(),
  openWorktreeInVscode: (worktreePath: string): Promise<{ success: boolean; error?: string }> => getApi().openWorktreeInVscode(worktreePath),
}

export type { ImportProjectResult, WorkspacePayload }
