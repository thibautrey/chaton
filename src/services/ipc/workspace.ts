import type {
  CloudAccount,
  CloudSubscriptionPlan,
  CloudInstance,
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
} from "@/features/workspace/types";
import type {
  PiRendererEvent,
  RpcCommand,
  RpcExtensionUiResponse,
  RpcResponse,
} from "@/features/workspace/rpc";

function getApi() {
  return window.chaton;
}

type ImportProjectResult =
  | { ok: true; duplicate: boolean; project: Project }
  | { ok: false; reason: "not_git_repo" | "unknown" };
type ConnectCloudInstanceResult =
  | { ok: true; duplicate: boolean; id: string }
  | { ok: false; reason: "invalid_base_url"; message?: string };
type StartCloudAuthResult =
  | { ok: true; instanceId: string; authUrl: string }
  | { ok: false; reason: "invalid_base_url" | "open_failed"; message?: string };
type CompleteCloudAuthResult =
  | { ok: true; instanceId: string; duplicate?: boolean }
  | {
      ok: false;
      reason: "invalid_state" | "provider_error" | "unknown";
      message?: string;
    };
type CreateCloudProjectResult =
  | { ok: true; project: import("@/features/workspace/types").Project }
  | {
      ok: false;
      reason: "cloud_instance_not_found" | "invalid_name" | "unknown";
    };
type GetCloudAccountResult =
  | { ok: true; account: CloudAccount | null; users: import("@/features/workspace/types").CloudAccountUser[] }
  | { ok: false; reason: "not_connected" | "forbidden" | "unknown"; message?: string };

type PiModel = {
  id: string;
  provider: string;
  scoped: boolean;
  key: string;
  supportsThinking: boolean;
  thinkingLevels: Array<
    "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
  >;
  contextWindow?: number;
  contextWindowSource?: "provider" | "pi";
  maxTokens?: number;
  reasoning?: boolean;
  imageInput?: boolean;
};
type ListPiModelsResult =
  | { ok: true; models: PiModel[] }
  | { ok: false; reason: "pi_not_available" | "unknown"; message?: string };
type SetPiModelScopedResult =
  | { ok: true; models: PiModel[] }
  | {
      ok: false;
      reason: "pi_not_available" | "invalid_model" | "unknown";
      message?: string;
    };
type DiscoverProviderModelsResult =
  | { ok: true; models: PiModel[] }
  | { ok: false; models?: PiModel[]; message?: string };
type TestProviderConnectionResult =
  | { ok: true; latency: number; statusCode: number; message: string }
  | { ok: false; message: string; statusCode?: number; latency?: number };
type PiCommandParams = { search?: string; source?: string; local?: boolean };
type WorktreeFileChange = {
  path: string;
  x: string;
  y: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  deleted: boolean;
  renamed: boolean;
};

type WorktreeGitInfoResult =
  | {
      ok: true;
      worktreePath: string;
      branch: string;
      baseBranch: string;
      hasChanges: boolean;
      hasStagedChanges: boolean;
      hasUncommittedChanges: boolean;
      ahead: number;
      behind: number;
      isMergedIntoBase: boolean;
      isPushedToUpstream: boolean;
      changes: WorktreeFileChange[];
    }
  | {
      ok: false;
      reason:
        | "conversation_not_found"
        | "worktree_not_found"
        | "git_not_available"
        | "unknown";
      message?: string;
    };
type EnableConversationWorktreeResult =
  | { ok: true; conversation: Conversation }
  | {
      ok: false;
      reason: "conversation_not_found" | "project_not_found" | "unknown";
    };
type DisableConversationWorktreeResult =
  | { ok: true; changed: boolean }
  | {
      ok: false;
      reason:
        | "conversation_not_found"
        | "project_not_found"
        | "has_uncommitted_changes"
        | "unknown";
    };

export const workspaceIpc = {
  getInitialState: () => window.chaton.getInitialState(),
  getGitDiffSummary: (conversationId: string) =>
    getApi().getGitDiffSummary(conversationId),
  searchProjectFiles: (
    query: string,
    conversationId: string | null,
    projectId: string | null,
  ): Promise<{ ok: true; files: string[] } | { ok: false; reason: string }> =>
    getApi().searchProjectFiles(query, conversationId, projectId),
  getGitFileDiff: (conversationId: string, filePath: string) =>
    getApi().getGitFileDiff(conversationId, filePath),
  getTouchedFilesForToolCall: (toolCallId: string) =>
    getApi().getTouchedFilesForToolCall(toolCallId),
  getWorktreeGitInfo: (
    conversationId: string,
  ): Promise<WorktreeGitInfoResult> =>
    getApi().getWorktreeGitInfo(conversationId),
  generateWorktreeCommitMessage: (
    conversationId: string,
  ): Promise<
    | { ok: true; message: string }
    | {
        ok: false;
        reason:
          | "conversation_not_found"
          | "worktree_not_found"
          | "no_changes"
          | "git_not_available"
          | "unknown";
        message?: string;
      }
  > => getApi().generateWorktreeCommitMessage(conversationId),
  stageWorktreeFile: (
    conversationId: string,
    filePath: string,
  ): Promise<
    | { ok: true }
    | {
        ok: false;
        reason:
          | "conversation_not_found"
          | "worktree_not_found"
          | "file_not_found"
          | "git_not_available"
          | "unknown";
        message?: string;
      }
  > => getApi().stageWorktreeFile(conversationId, filePath),
  unstageWorktreeFile: (
    conversationId: string,
    filePath: string,
  ): Promise<
    | { ok: true }
    | {
        ok: false;
        reason:
          | "conversation_not_found"
          | "worktree_not_found"
          | "file_not_found"
          | "git_not_available"
          | "unknown";
        message?: string;
      }
  > => getApi().unstageWorktreeFile(conversationId, filePath),
  commitWorktree: (
    conversationId: string,
    message: string,
  ): Promise<
    | { ok: true; commit: string; message: string }
    | {
        ok: false;
        reason:
          | "conversation_not_found"
          | "worktree_not_found"
          | "empty_message"
          | "no_changes"
          | "git_not_available"
          | "unknown";
        message?: string;
      }
  > => getApi().commitWorktree(conversationId, message),
  mergeWorktreeIntoMain: (
    conversationId: string,
  ): Promise<
    | { ok: true; merged: boolean; message: string }
    | {
        ok: false;
        reason:
          | "conversation_not_found"
          | "project_not_found"
          | "worktree_not_found"
          | "already_merged"
          | "merge_conflicts"
          | "git_not_available"
          | "unknown";
        message?: string;
      }
  > => getApi().mergeWorktreeIntoMain(conversationId),
  pullWorktreeBranch: (
    conversationId: string,
  ): Promise<
    | { ok: true; branch: string; remote: string }
    | {
        ok: false;
        reason:
          | "conversation_not_found"
          | "worktree_not_found"
          | "git_not_available"
          | "unknown";
        message?: string;
      }
  > => getApi().pullWorktreeBranch(conversationId),
  pushWorktreeBranch: (
    conversationId: string,
  ): Promise<
    | { ok: true; branch: string; remote: string }
    | {
        ok: false;
        reason:
          | "conversation_not_found"
          | "worktree_not_found"
          | "git_not_available"
          | "unknown";
        message?: string;
      }
  > => getApi().pushWorktreeBranch(conversationId),
  pickProjectFolder: () => getApi().pickProjectFolder(),
  importProjectFromFolder: (folderPath: string) =>
    getApi().importProjectFromFolder(folderPath),
  connectCloudInstance: (
    input: { name?: string; baseUrl?: string },
  ): Promise<ConnectCloudInstanceResult> => getApi().connectCloudInstance(input),
  startCloudAuth: (
    input?: { name?: string; baseUrl?: string },
  ): Promise<StartCloudAuthResult> => getApi().startCloudAuth(input),
  completeCloudAuth: (payload: {
    code?: string | null
    state?: string | null
    error?: string | null
    baseUrl?: string | null
  }): Promise<CompleteCloudAuthResult> => getApi().completeCloudAuth(payload),
  updateCloudInstanceStatus: (
    instanceId: string,
    status: CloudInstance["connectionStatus"],
    lastError?: string | null,
  ): Promise<{ ok: true } | { ok: false; reason: "instance_not_found" }> =>
    getApi().updateCloudInstanceStatus(instanceId, status, lastError),
  createCloudProject: (params: {
    cloudInstanceId: string;
    name: string;
    organizationId: string;
    kind: 'repository' | 'conversation_only';
    repository?: {
      cloneUrl: string;
      defaultBranch: string | null;
      authMode: 'none' | 'token';
      accessToken: string | null;
    } | null;
  }): Promise<CreateCloudProjectResult> => getApi().createCloudProject(params),
  getCloudAccount: (): Promise<GetCloudAccountResult> => getApi().getCloudAccount(),
  logoutCloud: (): Promise<{ ok: true } | { ok: false; reason: "not_connected" }> => getApi().logoutCloud(),
  updateCloudUser: (
    userId: string,
    updates: { subscriptionPlan?: CloudSubscriptionPlan; isAdmin?: boolean },
  ): Promise<GetCloudAccountResult> => getApi().updateCloudUser(userId, updates),
  grantCloudSubscription: (
    userId: string,
    grant: { planId: CloudSubscriptionPlan; durationDays?: number | null },
  ): Promise<GetCloudAccountResult> => getApi().grantCloudSubscription(userId, grant),
  updateCloudPlan: (
    planId: CloudSubscriptionPlan,
    updates: { label?: string; parallelSessionsLimit?: number; isDefault?: boolean },
  ): Promise<GetCloudAccountResult> => getApi().updateCloudPlan(planId, updates),
  deleteProject: (projectId: string): Promise<DeleteProjectResult> =>
    getApi().deleteProject(projectId),
  archiveProject: (projectId: string, isArchived: boolean): Promise<{ ok: boolean; reason?: string }> =>
    getApi().archiveProject(projectId, isArchived),
  updateProjectIcon: (projectId: string, icon: string | null): Promise<{ ok: boolean; reason?: string }> =>
    getApi().updateProjectIcon(projectId, icon),
  scanProjectImages: (projectId: string): Promise<{ ok: boolean; reason?: string; images: string[] }> =>
    getApi().scanProjectImages(projectId),
  pickIconImage: (): Promise<string | null> =>
    getApi().pickIconImage(),
  imageToDataUrl: (imagePath: string): Promise<string | null> =>
    getApi().imageToDataUrl(imagePath),
  updateSettings: (settings: SidebarSettings) =>
    getApi().updateSettings(settings),
  createConversationForProject: (
    projectId: string,
    options?: {
      modelProvider?: string;
      modelId?: string;
      thinkingLevel?: string;
      accessMode?: "secure" | "open";
      channelExtensionId?: string;
    },
  ): Promise<CreateConversationResult> =>
    getApi().createConversationForProject(projectId, options),
  enableConversationWorktree: (
    conversationId: string,
  ): Promise<EnableConversationWorktreeResult> =>
    getApi().enableConversationWorktree(conversationId),
  disableConversationWorktree: (
    conversationId: string,
  ): Promise<DisableConversationWorktreeResult> =>
    getApi().disableConversationWorktree(conversationId),
  createConversationGlobal: (options?: {
    modelProvider?: string;
    modelId?: string;
    thinkingLevel?: string;
    accessMode?: "secure" | "open";
    channelExtensionId?: string;
  }): Promise<CreateConversationResult> =>
    getApi().createConversationGlobal(options),
  setConversationAccessMode: (
    conversationId: string,
    accessMode: "secure" | "open",
  ): Promise<
    | { ok: true; accessMode: "secure" | "open" }
    | { ok: false; reason: "conversation_not_found" | "restart_failed"; message?: string }
  > => getApi().setConversationAccessMode(conversationId, accessMode),
  deleteConversation: (
    conversationId: string,
    force?: boolean,
  ): Promise<DeleteConversationResult> =>
    getApi().deleteConversation(conversationId, force),
  getConversationMessageCache: (conversationId: string): Promise<unknown[]> =>
    getApi().getConversationMessageCache(conversationId),
  requestConversationAutoTitle: (
    conversationId: string,
    firstMessage: string,
  ): Promise<
    | { ok: true; skipped?: boolean; title?: string }
    | {
        ok: false;
        reason:
          | "empty_message"
          | "conversation_not_found"
          | "title_generation_failed";
      }
  > => getApi().requestConversationAutoTitle(conversationId, firstMessage),
  listPiModels: (): Promise<ListPiModelsResult> => getApi().listPiModels(),
  syncPiModels: (): Promise<ListPiModelsResult> => getApi().syncPiModels(),
  discoverProviderModels: (providerConfig: Record<string, unknown>, providerId?: string): Promise<DiscoverProviderModelsResult> =>
    getApi().discoverProviderModels(providerConfig, providerId),
  testProviderConnection: (providerConfig: Record<string, unknown>): Promise<TestProviderConnectionResult> =>
    getApi().testProviderConnection(providerConfig),
  setPiModelScoped: (
    provider: string,
    id: string,
    scoped: boolean,
  ): Promise<SetPiModelScopedResult> =>
    getApi().setPiModelScoped(provider, id, scoped),
  getPiConfigSnapshot: (): Promise<PiConfigSnapshot> =>
    getApi().getPiConfigSnapshot(),
  updatePiSettingsJson: (
    next: Record<string, unknown>,
  ): Promise<{ ok: true } | { ok: false; message: string }> =>
    getApi().updatePiSettingsJson(next),
  resolveProviderBaseUrl: (
    rawUrl: string,
  ): Promise<
    | { ok: true; baseUrl: string; matched: boolean; tested: string[] }
    | { ok: false; message: string }
  > => getApi().resolveProviderBaseUrl(rawUrl),
  updatePiModelsJson: (
    next: Record<string, unknown>,
  ): Promise<{ ok: true } | { ok: false; message: string }> =>
    getApi().updatePiModelsJson(next),
  updatePiAuthJson: (
    next: Record<string, unknown>,
  ): Promise<{ ok: true } | { ok: false; message: string }> =>
    getApi().updatePiAuthJson(next),
  runPiCommand: (
    action: PiCommandAction,
    params?: PiCommandParams,
  ): Promise<PiCommandResult> => getApi().runPiCommand(action, params ?? {}),
  getPiDiagnostics: (): Promise<PiDiagnostics> => getApi().getPiDiagnostics(),
  getPiAuthJson: (): Promise<{ ok: true; auth: Record<string, unknown> }> =>
    getApi().getPiAuthJson(),
  oauthLogin: (
    providerId: string,
  ): Promise<
    { ok: true; providerId: string } | { ok: false; message: string }
  > => getApi().oauthLogin(providerId),
  oauthPromptReply: (value: string): void => getApi().oauthPromptReply(value),
  oauthPromptCancel: (): void => getApi().oauthPromptCancel(),
  oauthLoginCancel: (): void => getApi().oauthLoginCancel(),
  onOAuthEvent: (
    callback: (event: {
      type: string;
      url?: string;
      instructions?: string;
      message?: string;
      placeholder?: string;
      allowEmpty?: boolean;
    }) => void,
  ): (() => void) => getApi().onOAuthEvent(callback),
  listSkillsCatalog: (): Promise<{
    ok: true;
    entries: Array<{
      source: string;
      title: string;
      description: string;
      author?: string;
      installs?: number;
      stars?: number;
      highlighted?: boolean;
    }>;
    source: "remote" | "cache" | "fallback" | "skills.sh" | "cloudhub" | "npm-pi" | "hybrid";
    updatedAt: string;
  }> => getApi().listSkillsCatalog(),
  getSkillsMarketplace: (): Promise<{
    ok: boolean;
    featured?: Array<{
      source: string;
      title: string;
      description: string;
      author?: string;
      installs?: number;
      stars?: number;
      highlighted?: boolean;
      category?: string;
      tags?: string[];
      language?: string;
      lastUpdated?: string;
      featured?: boolean;
      popularity?: string;
      installSource?: string;
      packageName?: string;
      packageVersion?: string;
    }>;
    new?: Array<{
      source: string;
      title: string;
      description: string;
      author?: string;
      installs?: number;
      stars?: number;
      highlighted?: boolean;
      category?: string;
      tags?: string[];
      language?: string;
      lastUpdated?: string;
      featured?: boolean;
      popularity?: string;
      installSource?: string;
      packageName?: string;
      packageVersion?: string;
    }>;
    trending?: Array<{
      source: string;
      title: string;
      description: string;
      author?: string;
      installs?: number;
      stars?: number;
      highlighted?: boolean;
      category?: string;
      tags?: string[];
      language?: string;
      lastUpdated?: string;
      featured?: boolean;
      popularity?: string;
      installSource?: string;
      packageName?: string;
      packageVersion?: string;
    }>;
    byCategory?: Array<{
      name: string;
      count: number;
      items: Array<{
        source: string;
        title: string;
        description: string;
        author?: string;
        installs?: number;
        stars?: number;
        highlighted?: boolean;
        category?: string;
        tags?: string[];
        language?: string;
        lastUpdated?: string;
        featured?: boolean;
        popularity?: string;
        installSource?: string;
        packageName?: string;
        packageVersion?: string;
      }>;
    }>;
    updatedAt?: string;
    source?: "remote" | "cache" | "fallback" | "skills.sh" | "cloudhub" | "npm-pi" | "hybrid";
    message?: string;
  }> => getApi().getSkillsMarketplace(),
  getSkillsMarketplaceFiltered: (options: {
    query?: string;
    category?: string;
    language?: string;
    minInstalls?: number;
    minStars?: number;
    source?: string;
    createdAfter?: string;
    updatedAfter?: string;
    sortBy?: string;
    limit?: number;
  }): Promise<{
    ok: boolean;
    results?: Array<{
      source: string;
      title: string;
      description: string;
      author?: string;
      installs?: number;
      stars?: number;
      highlighted?: boolean;
      category?: string;
      tags?: string[];
      language?: string;
      lastUpdated?: string;
      createdAt?: string;
      featured?: boolean;
      popularity?: string;
      repository?: string;
      documentation?: string;
      dependencies?: string[];
      installSource?: string;
      packageName?: string;
      packageVersion?: string;
      rating?: { average: number; count: number };
    }>;
    total?: number;
    returned?: number;
    message?: string;
  }> => getApi().getSkillsMarketplaceFiltered(options),
  getSkillsRatings: (skillSource?: string): Promise<unknown[]> =>
    getApi().getSkillsRatings(skillSource),
  addSkillRating: (
    skillSource: string,
    rating: number,
    review?: string,
  ): Promise<unknown> => getApi().addSkillRating(skillSource, rating, review),
  getSkillAverageRating: (
    skillSource: string,
  ): Promise<{ average: number; count: number }> =>
    getApi().getSkillAverageRating(skillSource),
  listExtensions: (): Promise<{ ok: true; extensions: ChatonsExtension[] }> =>
    getApi().listExtensions(),
  listExtensionCatalog: (): Promise<{
    ok: true;
    entries: ChatonsExtensionCatalogItem[];
    updatedAt: string;
    source: "cache" | "npm" | "chatons";
  }> => getApi().listExtensionCatalog(),
  getExtensionMarketplace: (): Promise<{
    ok: boolean;
    featured?: ChatonsExtensionCatalogItem[];
    new?: ChatonsExtensionCatalogItem[];
    trending?: ChatonsExtensionCatalogItem[];
    byCategory?: Array<{
      name: string;
      count: number;
      items: ChatonsExtensionCatalogItem[];
    }>;
    updatedAt?: string;
    source?: "cache" | "npm" | "chatons";
    message?: string;
  }> => getApi().getExtensionMarketplace(),
  quickActionsListUsage: (): Promise<{
    ok: true;
    rows: Array<{
      action_id: string;
      uses_count: number;
      decayed_score: number;
      last_used_at: string | null;
      created_at: string;
      updated_at: string;
    }>;
  }> => getApi().quickActionsListUsage(),
  quickActionsRecordUse: (
    actionId: string,
  ): Promise<
    | {
        ok: true;
        row: {
          action_id: string;
          uses_count: number;
          decayed_score: number;
          last_used_at: string | null;
          created_at: string;
          updated_at: string;
        };
      }
    | { ok: false; message: string }
  > => getApi().quickActionsRecordUse(actionId),
  getExtensionManifest: (
    id: string,
  ): Promise<{ ok: true; manifest: unknown | null }> =>
    getApi().getExtensionManifest(id),
  registerExtensionUi: (): Promise<{ ok: true; entries: unknown[] }> =>
    getApi().registerExtensionUi(),
  getExtensionMainViewHtml: (
    viewId: string,
  ): Promise<{ ok: boolean; html?: string; baseUrl?: string; message?: string }> =>
    getApi().getExtensionMainViewHtml(viewId),
  installExtension: (
    id: string,
  ): Promise<{
    ok: boolean;
    message?: string;
    extension?: ChatonsExtension;
    started?: boolean;
    state?: { id: string; status: string; message?: string } | null;
  }> => getApi().installExtension(id),
  getExtensionInstallState: (
    id: string,
  ): Promise<{
    ok: boolean;
    state?: {
      id: string;
      status: string;
      message?: string;
      startedAt?: string;
      finishedAt?: string;
    };
  }> => getApi().getExtensionInstallState(id),
  cancelExtensionInstall: (
    id: string,
  ): Promise<{ ok: boolean; message?: string }> =>
    getApi().cancelExtensionInstall(id),
  toggleExtension: (
    id: string,
    enabled: boolean,
  ): Promise<{
    ok: boolean;
    id?: string;
    enabled?: boolean;
    message?: string;
  }> => getApi().toggleExtension(id, enabled),
  removeExtension: (
    id: string,
  ): Promise<{ ok: boolean; id?: string; message?: string }> =>
    getApi().removeExtension(id),
  runExtensionHealthCheck: (): Promise<{
    ok: true;
    report: Array<{
      id: string;
      enabled: boolean;
      health: string;
      lastRunStatus: string | null;
      lastError: string | null;
    }>;
  }> => getApi().runExtensionHealthCheck(),
  getExtensionLogs: (
    id: string,
  ): Promise<{ ok: true; id: string; content: string }> =>
    getApi().getExtensionLogs(id),
  extensionEventSubscribe: (
    extensionId: string,
    topic: string,
    options?: { projectId?: string; conversationId?: string },
  ): Promise<{ ok: boolean; subscriptionId?: string; message?: string }> =>
    getApi().extensionEventSubscribe(extensionId, topic, options),
  extensionEventPublish: (
    extensionId: string,
    topic: string,
    payload: unknown,
    meta?: { idempotencyKey?: string },
  ): Promise<{
    ok: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> => getApi().extensionEventPublish(extensionId, topic, payload, meta),
  extensionQueueEnqueue: (
    extensionId: string,
    topic: string,
    payload: unknown,
    opts?: { idempotencyKey?: string; availableAt?: string },
  ): Promise<{
    ok: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> => getApi().extensionQueueEnqueue(extensionId, topic, payload, opts),
  extensionQueueConsume: (
    extensionId: string,
    topic: string,
    consumerId: string,
    opts?: { limit?: number },
  ): Promise<{
    ok: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> => getApi().extensionQueueConsume(extensionId, topic, consumerId, opts),
  extensionQueueAck: (
    extensionId: string,
    messageId: string,
  ): Promise<{
    ok: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> => getApi().extensionQueueAck(extensionId, messageId),
  extensionQueueNack: (
    extensionId: string,
    messageId: string,
    retryAt?: string,
    errorMessage?: string,
  ): Promise<{
    ok: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> =>
    getApi().extensionQueueNack(extensionId, messageId, retryAt, errorMessage),
  extensionQueueDeadLetterList: (
    extensionId: string,
    topic?: string,
  ): Promise<{
    ok: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> => getApi().extensionQueueDeadLetterList(extensionId, topic),
  extensionStorageKvGet: (
    extensionId: string,
    key: string,
  ): Promise<{
    ok: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> => getApi().extensionStorageKvGet(extensionId, key),
  extensionStorageKvSet: (
    extensionId: string,
    key: string,
    value: unknown,
  ): Promise<{
    ok: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> => getApi().extensionStorageKvSet(extensionId, key, value),
  extensionStorageKvDelete: (
    extensionId: string,
    key: string,
  ): Promise<{
    ok: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> => getApi().extensionStorageKvDelete(extensionId, key),
  extensionStorageKvList: (
    extensionId: string,
  ): Promise<{
    ok: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> => getApi().extensionStorageKvList(extensionId),
  extensionStorageFilesRead: (
    extensionId: string,
    relativePath: string,
  ): Promise<{
    ok: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> => getApi().extensionStorageFilesRead(extensionId, relativePath),
  extensionStorageFilesWrite: (
    extensionId: string,
    relativePath: string,
    content: string,
  ): Promise<{
    ok: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> => getApi().extensionStorageFilesWrite(extensionId, relativePath, content),
  extensionHostCall: (
    extensionId: string,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<{
    ok: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> => getApi().extensionHostCall(extensionId, method, params),
  extensionCall: (
    callerExtensionId: string,
    extensionId: string,
    apiName: string,
    versionRange: string,
    payload: unknown,
  ): Promise<{
    ok: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> =>
    getApi().extensionCall(
      callerExtensionId,
      extensionId,
      apiName,
      versionRange,
      payload,
    ),
  extensionRuntimeHealth: (): Promise<{
    ok: true;
    started: boolean;
    manifests: number;
    subscriptions: number;
    deadLetters: number;
    byExtension: unknown[];
  }> => getApi().extensionRuntimeHealth(),
  restartAppForExtension: (): Promise<{ ok: true }> =>
    getApi().restartAppForExtension(),
  openExtensionsFolder: (): Promise<{ ok: boolean; message?: string }> =>
    getApi().openExtensionsFolder(),
  checkExtensionUpdates: (): Promise<{
    ok: true;
    updates: Array<{
      id: string;
      currentVersion: string;
      latestVersion: string;
    }>;
  }> => getApi().checkExtensionUpdates(),
  updateExtension: (
    id: string,
  ): Promise<{
    ok: boolean;
    started?: boolean;
    state?: { id: string; status: string; message?: string } | null;
    message?: string;
  }> => getApi().updateExtension(id),
  updateAllExtensions: (): Promise<{
    ok: true;
    results: Array<{ id: string; success: boolean; message: string }>;
  }> => getApi().updateAllExtensions(),
  publishExtension: (
    id: string,
    npmToken?: string,
  ): Promise<{
    ok: boolean;
    started?: boolean;
    state?: { id: string; status: string; message?: string } | null;
    message?: string;
    requiresNpmLogin?: boolean;
    npmLoginHelp?: string;
  }> => getApi().publishExtension(id, npmToken),
  checkStoredNpmToken: (): Promise<{ ok: boolean; hasToken: boolean }> =>
    getApi().checkStoredNpmToken(),
  clearStoredNpmToken: (): Promise<{ ok: boolean; message?: string }> =>
    getApi().clearStoredNpmToken(),
  openPath: (
    target: "settings" | "models" | "sessions",
  ): Promise<{ ok: boolean; message?: string }> => getApi().openPath(target),
  exportPiSessionHtml: (
    sessionFile: string,
    outputFile?: string,
  ): Promise<PiCommandResult> =>
    getApi().exportPiSessionHtml(sessionFile, outputFile),
  piStartSession: (
    conversationId: string,
  ): Promise<{ ok: true } | { ok: false; reason: string; message?: string }> =>
    getApi().piStartSession(conversationId),
  piStopSession: (conversationId: string): Promise<{ ok: true }> =>
    getApi().piStopSession(conversationId),
  piSendCommand: (
    conversationId: string,
    command: RpcCommand,
  ): Promise<RpcResponse> => {
    const globalWindow = window as typeof window & {
      chatonPiBridge?: { sendCommand?: (conversationId: string, command: RpcCommand) => Promise<RpcResponse> }
    }
    const api = getApi()
    const piBridge = globalWindow.chatonPiBridge
    const rawInvoke = globalWindow.electron?.ipcRenderer?.invoke
    if (typeof rawInvoke === "function") {
      return rawInvoke("pi:sendCommand", conversationId, command) as Promise<RpcResponse>
    }
    if (piBridge?.sendCommand) {
      return piBridge.sendCommand(conversationId, command)
    }
    return api.piSendCommand(conversationId, command)
  },
  piGetSnapshot: (conversationId: string) =>
    getApi().piGetSnapshot(conversationId),
  piRespondExtensionUi: (
    conversationId: string,
    response: RpcExtensionUiResponse,
  ): Promise<{ ok: true } | { ok: false; reason: string }> =>
    getApi().piRespondExtensionUi(conversationId, response),
  onPiEvent: (listener: (event: PiRendererEvent) => void): (() => void) =>
    getApi().onPiEvent(listener),
  onConversationUpdated: (
    listener: (payload: {
      conversationId: string;
      title?: string;
      worktreePath?: string;
      accessMode?: 'secure' | 'open';
      updatedAt: string;
    }) => void,
  ): (() => void) => getApi().onConversationUpdated(listener),
  onExtensionOpenMainView: (
    listener: (payload: { extensionId: string; viewId: string }) => void,
  ): (() => void) => getApi().onExtensionOpenMainView(listener),
  onExtensionNotification: (
    listener: (payload: {
      title: string;
      body: string;
      link?: { type: 'deeplink' | 'url'; href: string; label?: string };
      meta?: unknown;
    }) => void,
  ): (() => void) => getApi().onExtensionNotification(listener),
  onDeeplinkExtensionInstall: (
    listener: (payload: { extensionId: string }) => void,
  ): (() => void) => getApi().onDeeplinkExtensionInstall(listener),
  onCloudAuthCallback: (
    listener: (payload: {
      code?: string | null
      state?: string | null
      error?: string | null
      baseUrl?: string | null
      rawUrl: string
    }) => void,
  ): (() => void) => getApi().onCloudAuthCallback(listener),
  onCloudConnect: (
    listener: (payload: {
      baseUrl?: string | null
      rawUrl: string
    }) => void,
  ): (() => void) => getApi().onCloudConnect(listener),
  onCloudRealtimeEvent: (
    listener: (payload: {
      instanceId?: string
      type?: string
      conversationId?: string
      status?: 'connected' | 'connecting' | 'disconnected' | 'error'
      message?: string
      payload?: unknown
    }) => void,
  ): (() => void) => getApi().onCloudRealtimeEvent(listener),
  getLanguagePreference: (): Promise<string> =>
    getApi().getLanguagePreference(),
  updateLanguagePreference: (language: string): Promise<void> =>
    getApi().updateLanguagePreference(language),
  detectVscode: (): Promise<{ detected: boolean }> => getApi().detectVscode(),
  detectExternalCommand: (command: string): Promise<{ detected: boolean }> =>
    getApi().detectExternalCommand(command),
  openExternal: (url: string): Promise<{ success: boolean; error?: string }> =>
    getApi().openExternal(url),
  openExternalApplication: (
    command: string,
    args: string[],
  ): Promise<{ success: boolean; error?: string }> =>
    getApi().openExternalApplication(command, args),
  detectOllama: (): Promise<{
    installed: boolean;
    apiRunning: boolean;
    baseUrl: string;
  }> => getApi().detectOllama(),
  detectLmStudio: (): Promise<{
    installed: boolean;
    apiRunning: boolean;
    baseUrl: string;
  }> => getApi().detectLmStudio(),
  openWorktreeInVscode: (
    worktreePath: string,
  ): Promise<{ success: boolean; error?: string }> =>
    getApi().openWorktreeInVscode(worktreePath),
  openProjectFolder: (
    projectId: string,
  ): Promise<
    { ok: true } | { ok: false; reason: "project_not_found"; message?: string }
  > => getApi().openProjectFolder(projectId),
  detectProjectCommands: (
    conversationId: string,
  ): Promise<
    | {
        ok: true;
        projectType: string;
        commands: Array<{
          id: string;
          label: string;
          command: string;
          args: string[];
          source: string;
          cwd?: string;
        }>;
        customCommands: Array<{
          id: string;
          commandText: string;
          lastUsedAt: string;
        }>;
      }
    | {
        ok: false;
        reason: "conversation_not_found" | "project_not_found" | "unknown";
        message?: string;
      }
  > => getApi().detectProjectCommands(conversationId),
  startProjectCommandTerminal: (
    conversationId: string,
    commandId: string,
    customCommandText?: string,
  ): Promise<
    | { ok: true; runId: string; startedAt: string }
    | {
        ok: false;
        reason:
          | "conversation_not_found"
          | "project_not_found"
          | "command_not_found"
          | "already_running"
          | "access_denied"
          | "unknown";
        message?: string;
      }
  > =>
    getApi().startProjectCommandTerminal(
      conversationId,
      commandId,
      customCommandText,
    ),
  readProjectCommandTerminal: (
    runId: string,
    afterSeq?: number,
  ): Promise<
    | {
        ok: true;
        run: {
          id: string;
          title: string;
          commandLabel: string;
          commandPreview: string;
          status: "running" | "exited" | "failed" | "stopped";
          exitCode: number | null;
          startedAt: string;
          endedAt: string | null;
        };
        events: Array<{
          seq: number;
          stream: "stdout" | "stderr" | "meta";
          text: string;
        }>;
      }
    | { ok: false; reason: "run_not_found" }
  > => getApi().readProjectCommandTerminal(runId, afterSeq),
  stopProjectCommandTerminal: (
    runId: string,
  ): Promise<{ ok: true } | { ok: false; reason: "run_not_found" }> =>
    getApi().stopProjectCommandTerminal(runId),

  // Composer drafts
  saveDraft: (key: string, content: string): Promise<{ ok: boolean; error?: string }> =>
    getApi().saveDraft(key, content),
  getDraft: (key: string): Promise<{ ok: boolean; draft: string | null; error?: string }> =>
    getApi().getDraft(key),
  getAllDrafts: (): Promise<{ ok: boolean; drafts: Record<string, string>; error?: string }> =>
    getApi().getAllDrafts(),
  deleteDraft: (key: string): Promise<{ ok: boolean; error?: string }> =>
    getApi().deleteDraft(key),
  saveQueuedMessages: (key: string, messages: string[]): Promise<{ ok: boolean; error?: string }> =>
    getApi().saveQueuedMessages(key, messages),
  getQueuedMessages: (key: string): Promise<{ ok: boolean; messages: string[]; error?: string }> =>
    getApi().getQueuedMessages(key),
  getAllQueuedMessages: (): Promise<{ ok: boolean; queuedMessages: Record<string, string[]>; error?: string }> =>
    getApi().getAllQueuedMessages(),
  deleteQueuedMessages: (key: string): Promise<{ ok: boolean; error?: string }> =>
    getApi().deleteQueuedMessages(key),

  // Performance tracing
  startTracing: (): Promise<{ ok: true } | { ok: false; message: string }> =>
    getApi().startTracing(),
  stopTracing: (): Promise<
    { ok: true; filePath?: string; cancelled?: boolean } | { ok: false; message: string }
  > => getApi().stopTracing(),

  // Memory model preference
  getMemoryModelPreference: (): Promise<{ ok: boolean; modelKey: string | null }> =>
    getApi().getMemoryModelPreference(),
  setMemoryModelPreference: (modelKey: string | null): Promise<{ ok: boolean }> =>
    getApi().setMemoryModelPreference(modelKey),
  // Title model preference
  getTitleModelPreference: (): Promise<{ ok: boolean; modelKey: string | null }> =>
    getApi().getTitleModelPreference(),
  setTitleModelPreference: (modelKey: string | null): Promise<{ ok: boolean }> =>
    getApi().setTitleModelPreference(modelKey),
  onMemorySaving: (
    listener: (payload: {
      conversationId: string;
      status: "started" | "completed" | "skipped" | "error";
      memoryId?: string | null;
    }) => void,
  ) => getApi().onMemorySaving(listener),

  // Autocomplete model preference
  getAutocompleteModelPreference: (): Promise<{ ok: boolean; enabled: boolean; modelKey: string | null }> =>
    getApi().getAutocompleteModelPreference(),
  setAutocompleteModelPreference: (enabled: boolean, modelKey: string | null): Promise<{ ok: boolean }> =>
    getApi().setAutocompleteModelPreference(enabled, modelKey),

  // Autocomplete suggestions
  getAutocompleteSuggestions: (params: {
    text: string;
    cursorPosition: number;
    conversationId?: string | null;
    maxSuggestions?: number;
  }): Promise<{
    ok: boolean;
    suggestions?: Array<{ id: string; text: string; type: "inline" | "suffix" | "block" }>;
    message?: string;
  }> =>
    getApi().getAutocompleteSuggestions(params),
};

export type { ImportProjectResult, WorkspacePayload };
