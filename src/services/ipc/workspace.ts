import type {
  Conversation,
  CreateConversationResult,
  DeleteConversationResult,
  DeleteProjectResult,
  PiCommandAction,
  PiCommandResult,
  PiConfigSnapshot,
  PiDiagnostics,
  ChatonsExtension,
  ChatonsExtensionCatalogItem,
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
type EnableConversationWorktreeResult =
  | { ok: true; conversation: Conversation }
  | { ok: false; reason: 'conversation_not_found' | 'project_not_found' | 'unknown' }
type DisableConversationWorktreeResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: 'conversation_not_found' | 'project_not_found' | 'has_uncommitted_changes' | 'unknown' }


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
    options?: { modelProvider?: string; modelId?: string; thinkingLevel?: string; accessMode?: 'secure' | 'open' },
  ): Promise<CreateConversationResult> => getApi().createConversationForProject(projectId, options),
  enableConversationWorktree: (
    conversationId: string,
  ): Promise<EnableConversationWorktreeResult> => getApi().enableConversationWorktree(conversationId),
  disableConversationWorktree: (
    conversationId: string,
  ): Promise<DisableConversationWorktreeResult> => getApi().disableConversationWorktree(conversationId),
  createConversationGlobal: (
    options?: { modelProvider?: string; modelId?: string; thinkingLevel?: string; accessMode?: 'secure' | 'open' },
  ): Promise<CreateConversationResult> => getApi().createConversationGlobal(options),
  setConversationAccessMode: (
    conversationId: string,
    accessMode: 'secure' | 'open',
  ): Promise<{ ok: true; accessMode: 'secure' | 'open' } | { ok: false; reason: 'conversation_not_found' }> =>
    getApi().setConversationAccessMode(conversationId, accessMode),
  deleteConversation: (conversationId: string, force?: boolean): Promise<DeleteConversationResult> => getApi().deleteConversation(conversationId, force),
  getConversationMessageCache: (conversationId: string): Promise<unknown[]> => getApi().getConversationMessageCache(conversationId),
  requestConversationAutoTitle: (
    conversationId: string,
    firstMessage: string,
  ): Promise<
    | { ok: true; skipped?: boolean; title?: string }
    | {
        ok: false
        reason: 'empty_message' | 'conversation_not_found' | 'title_generation_failed'
      }
  > => getApi().requestConversationAutoTitle(conversationId, firstMessage),
  listPiModels: (): Promise<ListPiModelsResult> => getApi().listPiModels(),
  syncPiModels: (): Promise<ListPiModelsResult> => getApi().syncPiModels(),
  setPiModelScoped: (provider: string, id: string, scoped: boolean): Promise<SetPiModelScopedResult> =>
    getApi().setPiModelScoped(provider, id, scoped),
  getPiConfigSnapshot: (): Promise<PiConfigSnapshot> => getApi().getPiConfigSnapshot(),
  updatePiSettingsJson: (next: Record<string, unknown>): Promise<{ ok: true } | { ok: false; message: string }> =>
    getApi().updatePiSettingsJson(next),
  resolveProviderBaseUrl: (
    rawUrl: string,
  ): Promise<
    | { ok: true; baseUrl: string; matched: boolean; tested: string[] }
    | { ok: false; message: string }
  > => getApi().resolveProviderBaseUrl(rawUrl),
  updatePiModelsJson: (next: Record<string, unknown>): Promise<{ ok: true } | { ok: false; message: string }> =>
    getApi().updatePiModelsJson(next),
  updatePiAuthJson: (next: Record<string, unknown>): Promise<{ ok: true } | { ok: false; message: string }> =>
    getApi().updatePiAuthJson(next),
  runPiCommand: (action: PiCommandAction, params?: PiCommandParams): Promise<PiCommandResult> =>
    getApi().runPiCommand(action, params ?? {}),
  getPiDiagnostics: (): Promise<PiDiagnostics> => getApi().getPiDiagnostics(),
  listSkillsCatalog: (): Promise<{ ok: true; entries: Array<{ source: string; title: string; description: string; author?: string; installs?: number; stars?: number; highlighted?: boolean }>; source: 'remote' | 'cache'; updatedAt: string }> =>
    getApi().listSkillsCatalog(),
  listExtensions: (): Promise<{ ok: true; extensions: ChatonsExtension[] }> => getApi().listExtensions(),
  listExtensionCatalog: (): Promise<{ ok: true; entries: ChatonsExtensionCatalogItem[]; updatedAt: string; source: 'cache' | 'npm' }> =>
    getApi().listExtensionCatalog(),
  quickActionsListUsage: (): Promise<{ ok: true; rows: Array<{ action_id: string; uses_count: number; decayed_score: number; last_used_at: string | null; created_at: string; updated_at: string }> }> =>
    getApi().quickActionsListUsage(),
  quickActionsRecordUse: (
    actionId: string,
  ): Promise<{ ok: true; row: { action_id: string; uses_count: number; decayed_score: number; last_used_at: string | null; created_at: string; updated_at: string } } | { ok: false; message: string }> =>
    getApi().quickActionsRecordUse(actionId),
  getExtensionManifest: (id: string): Promise<{ ok: true; manifest: unknown | null }> => getApi().getExtensionManifest(id),
  registerExtensionUi: (): Promise<{ ok: true; entries: unknown[] }> => getApi().registerExtensionUi(),
  getExtensionMainViewHtml: (viewId: string): Promise<{ ok: boolean; html?: string; message?: string }> =>
    getApi().getExtensionMainViewHtml(viewId),
  installExtension: (id: string): Promise<{ ok: boolean; message?: string; extension?: ChatonsExtension; started?: boolean; state?: { id: string; status: string; message?: string } | null }> => getApi().installExtension(id),
  getExtensionInstallState: (id: string): Promise<{ ok: boolean; state?: { id: string; status: string; message?: string; startedAt?: string; finishedAt?: string } }> => getApi().getExtensionInstallState(id),
  cancelExtensionInstall: (id: string): Promise<{ ok: boolean; message?: string }> => getApi().cancelExtensionInstall(id),
  toggleExtension: (id: string, enabled: boolean): Promise<{ ok: boolean; id?: string; enabled?: boolean; message?: string }> =>
    getApi().toggleExtension(id, enabled),
  removeExtension: (id: string): Promise<{ ok: boolean; id?: string; message?: string }> => getApi().removeExtension(id),
  runExtensionHealthCheck: (): Promise<{ ok: true; report: Array<{ id: string; enabled: boolean; health: string; lastRunStatus: string | null; lastError: string | null }> }> =>
    getApi().runExtensionHealthCheck(),
  getExtensionLogs: (id: string): Promise<{ ok: true; id: string; content: string }> => getApi().getExtensionLogs(id),
  extensionEventSubscribe: (
    extensionId: string,
    topic: string,
    options?: { projectId?: string; conversationId?: string },
  ): Promise<{ ok: boolean; subscriptionId?: string; message?: string }> => getApi().extensionEventSubscribe(extensionId, topic, options),
  extensionEventPublish: (
    extensionId: string,
    topic: string,
    payload: unknown,
    meta?: { idempotencyKey?: string },
  ): Promise<{ ok: boolean; data?: unknown; error?: { code: string; message: string } }> =>
    getApi().extensionEventPublish(extensionId, topic, payload, meta),
  extensionQueueEnqueue: (
    extensionId: string,
    topic: string,
    payload: unknown,
    opts?: { idempotencyKey?: string; availableAt?: string },
  ): Promise<{ ok: boolean; data?: unknown; error?: { code: string; message: string } }> =>
    getApi().extensionQueueEnqueue(extensionId, topic, payload, opts),
  extensionQueueConsume: (
    extensionId: string,
    topic: string,
    consumerId: string,
    opts?: { limit?: number },
  ): Promise<{ ok: boolean; data?: unknown; error?: { code: string; message: string } }> =>
    getApi().extensionQueueConsume(extensionId, topic, consumerId, opts),
  extensionQueueAck: (extensionId: string, messageId: string): Promise<{ ok: boolean; data?: unknown; error?: { code: string; message: string } }> =>
    getApi().extensionQueueAck(extensionId, messageId),
  extensionQueueNack: (
    extensionId: string,
    messageId: string,
    retryAt?: string,
    errorMessage?: string,
  ): Promise<{ ok: boolean; data?: unknown; error?: { code: string; message: string } }> =>
    getApi().extensionQueueNack(extensionId, messageId, retryAt, errorMessage),
  extensionQueueDeadLetterList: (
    extensionId: string,
    topic?: string,
  ): Promise<{ ok: boolean; data?: unknown; error?: { code: string; message: string } }> =>
    getApi().extensionQueueDeadLetterList(extensionId, topic),
  extensionStorageKvGet: (
    extensionId: string,
    key: string,
  ): Promise<{ ok: boolean; data?: unknown; error?: { code: string; message: string } }> =>
    getApi().extensionStorageKvGet(extensionId, key),
  extensionStorageKvSet: (
    extensionId: string,
    key: string,
    value: unknown,
  ): Promise<{ ok: boolean; data?: unknown; error?: { code: string; message: string } }> =>
    getApi().extensionStorageKvSet(extensionId, key, value),
  extensionStorageKvDelete: (
    extensionId: string,
    key: string,
  ): Promise<{ ok: boolean; data?: unknown; error?: { code: string; message: string } }> =>
    getApi().extensionStorageKvDelete(extensionId, key),
  extensionStorageKvList: (
    extensionId: string,
  ): Promise<{ ok: boolean; data?: unknown; error?: { code: string; message: string } }> =>
    getApi().extensionStorageKvList(extensionId),
  extensionStorageFilesRead: (
    extensionId: string,
    relativePath: string,
  ): Promise<{ ok: boolean; data?: unknown; error?: { code: string; message: string } }> =>
    getApi().extensionStorageFilesRead(extensionId, relativePath),
  extensionStorageFilesWrite: (
    extensionId: string,
    relativePath: string,
    content: string,
  ): Promise<{ ok: boolean; data?: unknown; error?: { code: string; message: string } }> =>
    getApi().extensionStorageFilesWrite(extensionId, relativePath, content),
  extensionHostCall: (
    extensionId: string,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<{ ok: boolean; data?: unknown; error?: { code: string; message: string } }> =>
    getApi().extensionHostCall(extensionId, method, params),
  extensionCall: (
    callerExtensionId: string,
    extensionId: string,
    apiName: string,
    versionRange: string,
    payload: unknown,
  ): Promise<{ ok: boolean; data?: unknown; error?: { code: string; message: string } }> =>
    getApi().extensionCall(callerExtensionId, extensionId, apiName, versionRange, payload),
  extensionRuntimeHealth: (): Promise<{ ok: true; started: boolean; manifests: number; subscriptions: number; deadLetters: number; byExtension: unknown[] }> =>
    getApi().extensionRuntimeHealth(),
  restartAppForExtension: (): Promise<{ ok: true }> => getApi().restartAppForExtension(),
  openExtensionsFolder: (): Promise<{ ok: boolean; message?: string }> => getApi().openExtensionsFolder(),
  checkExtensionUpdates: (): Promise<{ ok: true; updates: Array<{ id: string; currentVersion: string; latestVersion: string }> }> => getApi().checkExtensionUpdates(),
  updateExtension: (id: string): Promise<{ ok: boolean; started?: boolean; state?: { id: string; status: string; message?: string } | null; message?: string }> => getApi().updateExtension(id),
  updateAllExtensions: (): Promise<{ ok: true; results: Array<{ id: string; success: boolean; message: string }> }> => getApi().updateAllExtensions(),
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
    listener: (payload: { conversationId: string; title?: string; worktreePath?: string; updatedAt: string }) => void,
  ): (() => void) => getApi().onConversationUpdated(listener),
  onExtensionOpenMainView: (
    listener: (payload: { extensionId: string; viewId: string }) => void,
  ): (() => void) => getApi().onExtensionOpenMainView(listener),
  onExtensionNotification: (
    listener: (payload: { title: string; body: string }) => void,
  ): (() => void) => getApi().onExtensionNotification(listener),
  getLanguagePreference: (): Promise<string> => getApi().getLanguagePreference(),
  updateLanguagePreference: (language: string): Promise<void> => getApi().updateLanguagePreference(language),
  detectVscode: (): Promise<{ detected: boolean }> => getApi().detectVscode(),
  detectOllama: (): Promise<{ installed: boolean; apiRunning: boolean; baseUrl: string }> => getApi().detectOllama(),
  detectLmStudio: (): Promise<{ installed: boolean; apiRunning: boolean; baseUrl: string }> => getApi().detectLmStudio(),
  openWorktreeInVscode: (worktreePath: string): Promise<{ success: boolean; error?: string }> => getApi().openWorktreeInVscode(worktreePath),
  openProjectFolder: (projectId: string): Promise<{ ok: true } | { ok: false; reason: 'project_not_found'; message?: string }> => getApi().openProjectFolder(projectId),
  detectProjectCommands: (
    conversationId: string,
  ): Promise<
    | {
        ok: true
        projectType: string
        commands: Array<{
          id: string
          label: string
          command: string
          args: string[]
          source: string
          cwd?: string
        }>
        customCommands: Array<{
          id: string
          commandText: string
          lastUsedAt: string
        }>
      }
    | { ok: false; reason: 'conversation_not_found' | 'project_not_found' | 'unknown'; message?: string }
  > => getApi().detectProjectCommands(conversationId),
  startProjectCommandTerminal: (
    conversationId: string,
    commandId: string,
    customCommandText?: string,
  ): Promise<
    | { ok: true; runId: string; startedAt: string }
    | {
        ok: false
        reason: 'conversation_not_found' | 'project_not_found' | 'command_not_found' | 'already_running' | 'access_denied' | 'unknown'
        message?: string
      }
  > => getApi().startProjectCommandTerminal(conversationId, commandId, customCommandText),
  readProjectCommandTerminal: (
    runId: string,
    afterSeq?: number,
  ): Promise<
    | {
        ok: true
        run: {
          id: string
          title: string
          commandLabel: string
          commandPreview: string
          status: 'running' | 'exited' | 'failed' | 'stopped'
          exitCode: number | null
          startedAt: string
          endedAt: string | null
        }
        events: Array<{ seq: number; stream: 'stdout' | 'stderr' | 'meta'; text: string }>
      }
    | { ok: false; reason: 'run_not_found' }
  > => getApi().readProjectCommandTerminal(runId, afterSeq),
  stopProjectCommandTerminal: (
    runId: string,
  ): Promise<{ ok: true } | { ok: false; reason: 'run_not_found' }> => getApi().stopProjectCommandTerminal(runId),
}

export type { ImportProjectResult, WorkspacePayload }
