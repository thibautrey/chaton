import electron from "electron";
const { app, BrowserWindow, dialog, ipcMain, shell } = electron;
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { GitService } from "../lib/git/git-service.js";
import { getDb } from "../db/index.js";
import {
  clearConversationWorktreePath,
  deleteConversationById,
  findConversationById,
  insertConversation,
  listConversations,
  listConversationsByProjectId,
  listConversationMessagesCache,
  replaceConversationMessagesCache,
  saveConversationPiRuntime,
  updateConversationTitle,
  type DbConversation,
} from "../db/repos/conversations.js";
import { getConversationHarnessFeedback } from "../db/repos/meta-harness-feedback.js";
import {
  listPiModelsCache,
  replacePiModelsCache,
} from "../db/repos/pi-models-cache.js";
import { getLanguagePreference } from "../db/repos/settings.js";
import { listProjects, updateProjectIcon } from "../db/repos/projects.js";
import { listCloudInstances } from "../db/repos/cloud-instances.js";
import {
  getSidebarSettings,
  saveSidebarSettings,
  type DbSidebarSettings,
} from "../db/repos/settings.js";
import {
  PiSessionRuntimeManager,
  type PiRendererEvent,
  type RpcCommand,
  type RpcExtensionUiResponse,
  type RpcResponse,
} from "../pi-sdk-runtime.js";
import {
  emitHostEvent,
  storageKvGet,
  storageKvSet,
} from "../extensions/runtime.js";
import { getLogManager } from "../lib/logging/log-manager.js";
import {
  registerSystemHandlers,
  registerWorkspaceHandlers,
  stopWorkspaceHandlers,
} from "./workspace-handlers.js";
import {
  listSkillsCatalog,
  getSkillsMarketplace,
  getSkillsMarketplaceFiltered,
  getSkillsRatings,
  addSkillRating,
  getSkillAverageRating,
} from "./workspace-skills.js";
import {
  AFFINAGE_TITRE_IA_ACTIVE,
  construireTitreDeterministe,
  generateConversationTitleFromPi as generateConversationTitleFromPiInModule,
} from "./workspace-title.js";
import {
  backupFile,
  getAuthJson,
  getGlobalWorkspaceDir,
  getPiAgentDir,
  getPiBinaryPath,
  getPiConfigSnapshot,
  getPiDiagnostics,
  getPiModelsPath,
  getPiSettingsPath,
  atomicWriteJson,
  discoverProviderModels,
  ensurePiAgentBootstrapped,
  listPiModelsCached,
  probeProviderBaseUrl,
  readJsonFile,
  runPiExec,
  runPiRemoveWithFallback,
  sanitizeModelsJsonWithResolvedBaseUrls,
  sanitizePiSettings,
  setPiModelScoped,
  syncPiModelsCache,
  syncProviderApiKeysBetweenModelsAndAuth,
  testProviderConnection,
  upsertProviderInModelsJson,
  validateDefaultModelExistsInModels,
  validateModelsJson,
} from "./workspace-pi.js";
import { searchProjectFiles } from "./workspace-search.js";

// Types for git status matrix
type HeadStatus = 0 | 1;
type WorkdirStatus = 0 | 1 | 2;
type StageStatus = 0 | 1 | 2 | 3;
type StatusRow = [string, HeadStatus, WorkdirStatus, StageStatus];

type WorkspacePayload = {
  projects: Array<{
    id: string;
    name: string;
    repoPath: string | null;
    repoName: string;
    location: "local" | "cloud";
    kind: "repository" | "conversation_only" | null;
    workspaceCapability: "full_tools" | "chat_only" | null;
    repository: {
      cloneUrl: string;
      defaultBranch: string | null;
      authMode: "none" | "token";
    } | null;
    cloudInstanceId: string | null;
    organizationId: string | null;
    organizationName: string | null;
    cloudStatus: "connected" | "connecting" | "disconnected" | "error" | null;
    isArchived: boolean;
    isHidden: boolean;
    icon: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  conversations: Array<{
    id: string;
    projectId: string | null;
    title: string;
    status: "active" | "done" | "archived";
    isRelevant: boolean;
    createdAt: string;
    updatedAt: string;
    lastMessageAt: string;
    modelProvider: string | null;
    modelId: string | null;
    thinkingLevel: string | null;
    lastRuntimeError: string | null;
    worktreePath: string | null;
    accessMode: "secure" | "open";
    runtimeLocation: "local" | "cloud";
    harnessEnabled: boolean;
    harnessCandidateId: string | null;
    harnessUserRating: -1 | 1 | null;
  }>;
  cloudInstances: Array<{
    id: string;
    name: string;
    baseUrl: string;
    authMode: "oauth";
    connectionStatus: "connected" | "connecting" | "disconnected" | "error";
    lastError: string | null;
    userEmail: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  cloudAccount: {
    user: {
      id: string;
      email: string;
      displayName: string;
      isAdmin: boolean;
      createdAt: string;
      subscription: {
        id: "plus" | "pro" | "max";
        label: string;
        parallelSessionsLimit: number;
        isDefault?: boolean;
      };
    };
    usage: {
      activeParallelSessions: number;
      parallelSessionsLimit: number;
      remainingParallelSessions: number;
    };
    plans: Array<{
      id: "plus" | "pro" | "max";
      label: string;
      parallelSessionsLimit: number;
      isDefault?: boolean;
    }>;
    organizations: Array<{
      id: string;
      slug: string;
      name: string;
      role: "owner" | "admin" | "member" | "billing_viewer";
      providers?: Array<{
        id: string;
        kind: "openai" | "anthropic" | "google" | "github-copilot";
        label: string;
        secretHint: string;
        baseUrl: string;
        credentialType: "api_key" | "oauth";
        models: Array<{ id: string; label: string }>;
        defaultModel: string | null;
        supportsCloudRuntime: boolean;
        createdAt: string;
      }>;
    }>;
    activeOrganizationId: string | null;
  } | null;
  cloudAdminUsers: Array<{
    id: string;
    email: string;
    displayName: string;
    isAdmin: boolean;
    createdAt: string;
    subscription: {
      id: "plus" | "pro" | "max";
      label: string;
      parallelSessionsLimit: number;
      isDefault?: boolean;
    };
  }>;
  settings: DbSidebarSettings;
};

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
  maxTokens?: number;
  reasoning?: boolean;
  imageInput?: boolean;
};

type PiModelsResult =
  | { ok: true; models: PiModel[] }
  | { ok: false; reason: "pi_not_available" | "unknown"; message?: string };

type SetPiModelScopedResult =
  | { ok: true; models: PiModel[] }
  | {
      ok: false;
      reason: "pi_not_available" | "invalid_model" | "unknown" | "lock_error";
      message?: string;
    };

type PiCommandAction =
  | "list"
  | "list-models"
  | "install"
  | "remove"
  | "update"
  | "config";
type PiCommandResult = {
  ok: boolean;
  code: number;
  command: string[];
  stdout: string;
  stderr: string;
  ranAt: string;
  message?: string;
};

type GitModifiedFileStat = {
  path: string;
  added: number;
  removed: number;
};

export type GitDiffSummaryResult =
  | {
      ok: true;
      files: GitModifiedFileStat[];
      totals: { added: number; removed: number; files: number };
    }
  | {
      ok: false;
      reason:
        | "project_not_found"
        | "not_git_repo"
        | "git_not_available"
        | "unknown";
      message?: string;
    };

type GitFileDiffResult =
  | {
      ok: true;
      path: string;
      diff: string;
      isBinary: boolean;
      firstChangedLine: number | null;
    }
  | {
      ok: false;
      reason:
        | "project_not_found"
        | "not_git_repo"
        | "git_not_available"
        | "file_not_found"
        | "unknown";
      message?: string;
    };

export const piRuntimeManager = new PiSessionRuntimeManager();
const extensionQueueWorker: NodeJS.Timeout | null = null;
const execFileAsync = promisify(execFile);
const projectCommandRuns = new Map<string, ProjectTerminalRun>();
const detectedProjectCommandsCache = new Map<
  string,
  { timestamp: number; result: DetectProjectCommandsResult }
>();
const DETECTED_PROJECT_COMMANDS_TTL_MS = 15_000;

function formatPiEventForLog(event: PiRendererEvent["event"]): {
  level: "info" | "warn" | "error" | "debug";
  message: string;
  data?: unknown;
} {
  const eventType =
    event && typeof event === "object" && "type" in event
      ? String((event as { type?: unknown }).type ?? "unknown")
      : "unknown";

  const eventMessage =
    event && typeof event === "object" && "message" in event
      ? (event as { message?: unknown }).message
      : undefined;

  if (eventType === "runtime_error") {
    return {
      level: "error",
      message:
        typeof eventMessage === "string" && eventMessage.trim().length > 0
          ? eventMessage
          : "Pi runtime error",
      data: event,
    };
  }

  if (eventType === "runtime_status") {
    const status =
      event && typeof event === "object" && "status" in event
        ? String((event as { status?: unknown }).status ?? "unknown")
        : "unknown";
    const suffix =
      typeof eventMessage === "string" && eventMessage.trim().length > 0
        ? `: ${eventMessage}`
        : "";
    return {
      level: status === "error" ? "error" : "info",
      message: `Pi runtime status: ${status}${suffix}`,
      data: event,
    };
  }

  return {
    level: "debug",
    message: `Pi event: ${eventType}`,
    data: event,
  };
}

piRuntimeManager.subscribe((payload) => {
  const logManager = getLogManager();
  const entry = formatPiEventForLog(payload.event);
  logManager.log(
    entry.level,
    "pi",
    entry.message,
    {
      conversationId: payload.conversationId,
      event: entry.data,
    },
    payload.conversationId,
  );
});

function mapConversation(c: DbConversation) {
  const feedback = getConversationHarnessFeedback(getDb(), c.id)
  return {
    id: c.id,
    projectId: c.project_id,
    title: c.title,
    titleSource: c.title_source,
    status: c.status,
    isRelevant: Boolean(c.is_relevant),
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    lastMessageAt: c.last_message_at,
    modelProvider: c.model_provider,
    modelId: c.model_id,
    thinkingLevel: c.thinking_level,
    lastRuntimeError: c.last_runtime_error,
    worktreePath: c.worktree_path,
    accessMode: c.access_mode ?? "secure",
    runtimeLocation: c.runtime_location ?? "local",
    channelExtensionId: c.channel_extension_id,
    hiddenFromSidebar: Boolean(c.hidden_from_sidebar),
    memoryInjected: Boolean(c.memory_injected),
    harnessEnabled: feedback?.enabled === true,
    harnessCandidateId: feedback?.harnessCandidateId ?? null,
    harnessUserRating: feedback?.userRating ?? null,
  };
}

function mapProject(
  p: ReturnType<typeof listProjects>[number],
): WorkspacePayload["projects"][number] {
  return {
    id: p.id,
    name: p.name,
    repoPath: p.repo_path ?? null,
    repoName: p.repo_name,
    location: p.location ?? "local",
    kind: p.cloud_project_kind ?? null,
    workspaceCapability: p.cloud_workspace_capability ?? null,
    repository:
      p.cloud_repository_clone_url != null
        ? {
            cloneUrl: p.cloud_repository_clone_url,
            defaultBranch: p.cloud_repository_default_branch ?? null,
            authMode: p.cloud_repository_auth_mode ?? "none",
          }
        : null,
    cloudInstanceId: p.cloud_instance_id ?? null,
    organizationId: p.organization_id ?? null,
    organizationName: p.organization_name ?? null,
    cloudStatus: p.cloud_status ?? null,
    isArchived: Boolean(p.is_archived),
    isHidden: Boolean(p.is_hidden),
    icon: p.icon ?? null,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

function extractLatestAssistantTextFromSnapshot(
  snapshot: { messages?: unknown[] } | null | undefined,
): string | null {
  const messages = Array.isArray(snapshot?.messages) ? snapshot.messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as Record<string, unknown> | null;
    if (!message) continue;
    const role =
      (typeof message.role === "string"
        ? message.role
        : ((message.message as Record<string, unknown> | undefined)?.role as
            | string
            | undefined)) ?? "";
    if (role !== "assistant") continue;
    const content = Array.isArray(message.content)
      ? message.content
      : Array.isArray(
            (message.message as Record<string, unknown> | undefined)?.content,
          )
        ? ((message.message as Record<string, unknown> | undefined)
            ?.content as unknown[])
        : [];
    const textParts = content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const record = part as Record<string, unknown>;
        if (record.type === "text" && typeof record.text === "string")
          return record.text;
        return "";
      })
      .filter((part) => part.trim().length > 0);
    if (textParts.length > 0) return textParts.join("\n\n").trim();
  }
  return null;
}

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
      nativeGitAvailable?: boolean;
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

type WorktreeGenerateCommitMessageResult =
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
    };

type WorktreeCommitResult =
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
    };

type WorktreeMergeResult =
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
    };

type WorktreePushResult =
  | { ok: true; branch: string; remote: string }
  | {
      ok: false;
      reason:
        | "conversation_not_found"
        | "worktree_not_found"
        | "git_not_available"
        | "unknown";
      message?: string;
    };

type DetectedProjectCommand = {
  id: string;
  label: string;
  command: string;
  args: string[];
  source: string;
  cwd?: string;
  isCustom?: boolean;
  commandText?: string;
};

type DetectProjectCommandsResult =
  | {
      ok: true;
      projectType: string;
      commands: DetectedProjectCommand[];
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
    };

type ProjectTerminalRunStatus = "running" | "exited" | "failed" | "stopped";

type ProjectTerminalRun = {
  id: string;
  conversationId: string;
  commandId: string;
  title: string;
  commandLabel: string;
  commandPreview: string;
  cwd: string;
  status: ProjectTerminalRunStatus;
  exitCode: number | null;
  startedAt: string;
  endedAt: string | null;
  nextSeq: number;
  events: Array<{
    seq: number;
    stream: "stdout" | "stderr" | "meta";
    text: string;
  }>;
  process: import("node:child_process").ChildProcess | null;
};

function toWorkspacePayload(): WorkspacePayload {
  const db = getDb();
  const projects = listProjects(db).map(mapProject);
  const cloudInstances = listCloudInstances(db).map((instance) => ({
    id: instance.id,
    name: instance.name,
    baseUrl: instance.base_url,
    authMode: instance.auth_mode,
    connectionStatus: instance.connection_status,
    lastError: instance.last_error,
    userEmail: instance.user_email,
    createdAt: instance.created_at,
    updatedAt: instance.updated_at,
  }));

  const conversations = listConversations(db)
    .filter((c) => !c.hidden_from_sidebar)
    .map(mapConversation);

  return {
    projects,
    conversations,
    cloudInstances,
    cloudAccount: null,
    cloudAdminUsers: [],
    settings: getSidebarSettings(db),
  };
}

// Initialize GitService for self-contained git operations
const gitService = new GitService();

async function isGitRepo(folderPath: string): Promise<boolean> {
  return gitService.isGitRepo(folderPath);
}

function getConversationWorktreeRoot() {
  return path.join(getPiAgentDir(), "worktrees", "chatons");
}

function sanitizeWorktreeSegment(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function shortenWorktreeHash(conversationId: string): string {
  // Use first 8 characters of the UUID for shorter worktree names
  return conversationId.substring(0, 8);
}

async function ensureConversationWorktree(
  projectRepoPath: string,
  conversationId: string,
): Promise<string> {
  const root = getConversationWorktreeRoot();
  const shortHash = shortenWorktreeHash(conversationId);
  const folderName = sanitizeWorktreeSegment(shortHash);
  const worktreePath = path.join(root, folderName);
  fs.mkdirSync(root, { recursive: true });
  if (fs.existsSync(worktreePath)) {
    return worktreePath;
  }

  // Use self-contained git service instead of external git commands
  try {
    // Create worktree using our self-contained git service
    await gitService.createWorktree(
      projectRepoPath,
      worktreePath,
      `chaton/thread-${sanitizeWorktreeSegment(shortHash)}`,
    );

    // Initialize git repo if it doesn't exist (fallback for self-contained mode)
    if (!fs.existsSync(path.join(worktreePath, ".git"))) {
      throw new Error(`Worktree created without git metadata at ${worktreePath}`);
    }
  } catch (error) {
    console.error("Error creating worktree with self-contained git:", error);
    try {
      fs.rmSync(worktreePath, { recursive: true, force: true });
    } catch {
      // Best effort cleanup for failed worktree creation.
    }
    throw error;
  }
  return worktreePath;
}

async function removeConversationWorktree(
  worktreePath: string | null | undefined,
  projectRepoPath?: string | null,
): Promise<void> {
  if (!worktreePath || !worktreePath.trim()) {
    return;
  }

  // Check if there are any uncommitted changes (stale changes)
  const hasWorkingChanges = await hasWorkingTreeChanges(worktreePath);
  const hasStagedChangesResult = await hasStagedChanges(worktreePath);
  const hasUncommittedChanges = hasWorkingChanges || hasStagedChangesResult;

  if (hasUncommittedChanges) {
    // Don't remove worktree if there are uncommitted changes
    return;
  }

  try {
    if (projectRepoPath && (await isGitRepo(projectRepoPath))) {
      await gitService.removeWorktree(projectRepoPath, worktreePath);
    } else {
      fs.rmSync(worktreePath, { recursive: true, force: true });
    }
  } catch {
    // Best effort cleanup.
  }
}

async function cleanupOrphanedWorktrees(): Promise<number> {
  const root = getConversationWorktreeRoot();
  if (!fs.existsSync(root)) {
    return 0;
  }

  try {
    const db = getDb();
    const allConversations = listConversations(db);
    // Map shortened directory names to conversation IDs
    const conversationIdToShortHash = new Map<string, string>();
    const shortHashToConversationId = new Map<string, string>();
    for (const conv of allConversations) {
      const shortHash = shortenWorktreeHash(conv.id);
      conversationIdToShortHash.set(conv.id, shortHash);
      shortHashToConversationId.set(shortHash, conv.id);
    }

    const worktreeDirs = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    let cleanedCount = 0;

    for (const worktreeDir of worktreeDirs) {
      const worktreePath = path.join(root, worktreeDir);

      // Check if this worktree has a corresponding conversation
      // The directory name is now the shortened hash of the conversation ID
      const conversationId = shortHashToConversationId.get(worktreeDir);
      if (conversationId) {
        continue; // Worktree has a conversation, don't clean up
      }

      // Also check for old-style full conversation ID directories (backward compatibility)
      // If the directory name looks like a full UUID (36 characters with dashes), it's an old-style conversation ID
      if (
        worktreeDir.match(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        )
      ) {
        continue; // Worktree has a conversation, don't clean up
      }

      // Check if worktree is a valid git repo
      const isRepo = await isGitRepo(worktreePath);
      if (!isRepo) {
        // Not a git repo, clean it up
        try {
          fs.rmSync(worktreePath, { recursive: true, force: true });
          cleanedCount++;
          console.log(
            `Cleaned up orphaned worktree (not a git repo): ${worktreePath}`,
          );
        } catch {
          // Best effort
        }
        continue;
      }

      // Check if there are any uncommitted changes
      const hasWorkingChanges = await hasWorkingTreeChanges(worktreePath);
      const hasStagedChangesResult = await hasStagedChanges(worktreePath);
      const hasUncommittedChanges = hasWorkingChanges || hasStagedChangesResult;

      if (hasUncommittedChanges) {
        // Has uncommitted changes, don't clean up
        continue;
      }

      // Safe to clean up - no conversation and no uncommitted changes
      try {
        fs.rmSync(worktreePath, { recursive: true, force: true });
        cleanedCount++;
        console.log(`Cleaned up orphaned worktree: ${worktreePath}`);
      } catch {
        // Best effort
      }
    }

    return cleanedCount;
  } catch (error) {
    console.error("Erreur lors du nettoyage des worktrees orphelins:", error);
    return 0;
  }
}

async function resolveConversationRepoPath(conversationId: string): Promise<
  | { ok: true; repoPath: string }
  | {
      ok: false;
      reason: "conversation_not_found" | "project_not_found" | "not_git_repo";
    }
> {
  const db = getDb();
  const conversation = findConversationById(db, conversationId);
  if (!conversation) {
    return { ok: false, reason: "conversation_not_found" };
  }
  if (
    conversation.worktree_path &&
    (await isGitRepo(conversation.worktree_path))
  ) {
    return { ok: true, repoPath: conversation.worktree_path };
  }
  if (!conversation.project_id) {
    const globalWorkspacePath = getGlobalWorkspaceDir();
    if (!(await isGitRepo(globalWorkspacePath))) {
      return { ok: false, reason: "not_git_repo" };
    }
    return { ok: true, repoPath: globalWorkspacePath };
  }
  const project = listProjects(db).find(
    (item) => item.id === conversation.project_id,
  );
  if (!project) {
    return { ok: false, reason: "project_not_found" };
  }
  if (project.location === "cloud" || !project.repo_path) {
    return { ok: false, reason: "not_git_repo" };
  }
  if (!(await isGitRepo(project.repo_path))) {
    return { ok: false, reason: "not_git_repo" };
  }
  return { ok: true, repoPath: project.repo_path };
}

function getConversationAndProject(conversationId: string): {
  conversation: DbConversation | null;
  projectRepoPath: string | null;
} {
  const db = getDb();
  const conversation = findConversationById(db, conversationId) ?? null;
  if (!conversation) {
    return { conversation: null, projectRepoPath: null };
  }
  const project = listProjects(db).find(
    (item) => item.id === conversation.project_id,
  );
  return {
    conversation,
    projectRepoPath:
      project && project.location === "local" ? project.repo_path ?? null : null,
  };
}

async function getCurrentBranch(repoPath: string): Promise<string> {
  const branch = await gitService.getCurrentBranch(repoPath);
  return branch ?? "HEAD";
}

async function hasWorkingTreeChanges(repoPath: string): Promise<boolean> {
  try {
    // Use self-contained git service
    return gitService.hasUncommittedChanges(repoPath);
  } catch (error) {
    console.warn("Error checking working tree changes:", error);
    return true; // Conservative: assume changes if we can't determine
  }
}

async function hasStagedChanges(repoPath: string): Promise<boolean> {
  try {
    // Use self-contained git service
    return gitService.hasStagedChanges(repoPath);
  } catch (error) {
    console.warn("Error checking staged changes:", error);
    return true; // Conservative: assume changes if we can't determine
  }
}

async function getAheadBehind(
  _repoPath: string,
  baseRef: string,
  headRef: string,
): Promise<{ ahead: number; behind: number }> {
  void baseRef;
  void headRef;
  const behind = 0;
  const ahead = 0;
  return {
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0,
  };
}

async function isMerged(
  _baseRepoPath: string,
  sourceRef: string,
  targetRef: string,
): Promise<boolean> {
  void sourceRef;
  void targetRef;
  return false;
}

async function getUpstreamBranch(
  _repoPath: string,
  branch: string,
): Promise<string | null> {
  void branch;
  return null;
}

const worktreeGitInfoCache = new Map<
  string,
  { result: WorktreeGitInfoResult; timestamp: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function listWorktreeChanges(repoPath: string): Promise<WorktreeFileChange[]> {
  if (await gitService.isNativeGitAvailable()) {
    const result = await execFileAsync('git', ['-C', repoPath, 'status', '--porcelain=v1']);
    return result.stdout
      .split('\n')
      .map((line) => line.replace(/\r$/, ''))
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const x = line[0] ?? ' ';
        const y = line[1] ?? ' ';
        const rawPath = line.slice(3).trim();
        const pathPart = rawPath.includes(' -> ') ? rawPath.split(' -> ').pop() ?? rawPath : rawPath;
        return {
          path: pathPart,
          x,
          y,
          staged: x !== ' ' && x !== '?',
          unstaged: y !== ' ',
          untracked: x === '?' && y === '?',
          deleted: x === 'D' || y === 'D',
          renamed: x === 'R' || y === 'R',
        };
      });
  }

  const status = await gitService.getStatus(repoPath);
  return status
    .filter(([, kind]) => kind !== 'unmodified' && kind !== 'absent')
    .map(([filePath, kind]) => ({
      path: filePath,
      x: kind === 'staged' ? 'M' : kind === 'untracked' ? '?' : ' ',
      y: kind === 'modified' ? 'M' : kind === 'deleted' ? 'D' : kind === 'untracked' ? '?' : ' ',
      staged: kind === 'staged',
      unstaged: kind === 'modified' || kind === 'deleted' || kind === 'untracked',
      untracked: kind === 'untracked',
      deleted: kind === 'deleted',
      renamed: kind === 'renamed',
    }));
}

async function getWorktreeGitInfo(
  conversationId: string,
): Promise<WorktreeGitInfoResult> {
  const cached = worktreeGitInfoCache.get(conversationId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  const { conversation, projectRepoPath } =
    getConversationAndProject(conversationId);
  if (!conversation) {
    return { ok: false, reason: "conversation_not_found" };
  }

  const resolvedRepo = await resolveConversationRepoPath(conversationId);
  if (!resolvedRepo.ok) {
    return {
      ok: false,
      reason:
        resolvedRepo.reason === "conversation_not_found"
          ? "conversation_not_found"
          : "worktree_not_found",
    };
  }

  const worktreePath = resolvedRepo.repoPath;
  const baseRepoPath = projectRepoPath ?? worktreePath;
  const baseBranch =
    (await gitService.resolveDefaultBranch(baseRepoPath)) ?? "main";

  try {
    const [branch, hasChanges, hasStaged, aheadBehind, merged, upstream, changes, nativeGitAvailable] =
      await Promise.all([
        getCurrentBranch(worktreePath),
        hasWorkingTreeChanges(worktreePath),
        hasStagedChanges(worktreePath),
        getAheadBehind(worktreePath, `origin/${baseBranch}`, "HEAD").catch(
          () => ({ ahead: 0, behind: 0 }),
        ),
        isMerged(baseRepoPath, "HEAD", `origin/${baseBranch}`).catch(() => false),
        getUpstreamBranch(worktreePath, "HEAD"),
        listWorktreeChanges(worktreePath),
        gitService.isNativeGitAvailable(),
      ]);

    const pushed = upstream
      ? await isMerged(worktreePath, "HEAD", upstream)
      : false;

    const result: WorktreeGitInfoResult = {
      ok: true,
      worktreePath,
      branch,
      baseBranch,
      hasChanges,
      hasStagedChanges: hasStaged,
      hasUncommittedChanges: hasChanges,
      ahead: aheadBehind.ahead,
      behind: aheadBehind.behind,
      isMergedIntoBase: merged,
      isPushedToUpstream: pushed,
      nativeGitAvailable,
      changes,
    };

    worktreeGitInfoCache.set(conversationId, { result, timestamp: Date.now() });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("enoent")) {
      return { ok: false, reason: "git_not_available", message };
    }
    return { ok: false, reason: "unknown", message };
  }
}

function summarizeGitDiffForCommit(diffText: string): string {
  const lines = (diffText ?? "")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  const fileNames = lines
    .map((line) => {
      const parts = line.split("\t");
      return parts[2]?.trim() ?? "";
    })
    .filter((file) => file.length > 0);
  if (fileNames.length === 0) {
    return "chore: update thread changes";
  }
  const first = fileNames[0];
  if (fileNames.length === 1) {
    return `chore: update ${first}`;
  }
  return `chore: update ${first} and ${fileNames.length - 1} other file${fileNames.length - 1 > 1 ? "s" : ""}`;
}

function generateCommitMessagePrompt(
  diffText: string,
  statusText: string,
): string {
  return [
    "SYSTEM",
    "You are a helpful assistant that generates informative git commit messages based on git diffs output. Skip preamble and remove all backticks surrounding the commit message.",
    "USER",
    "Based on the provided git diff, generate a concise and descriptive commit message.",
    "",
    "The commit message should:",
    "1. Has a short title (50-72 characters)",
    "2. The commit message should adhere to the conventional commit format",
    "3. Describe what was changed and why",
    "4. Be clear and informative",
    "",
    "# Git Diff Output:",
    diffText,
    "",
    "# Git Status Output:",
    statusText,
  ].join("\n");
}

async function generateCommitMessageWithPi(
  diffText: string,
  statusText: string,
  worktreePath: string,
): Promise<string | null> {
  const piPath = getPiBinaryPath();
  if (!piPath || !fs.existsSync(piPath)) {
    return null;
  }

  const prompt = generateCommitMessagePrompt(diffText, statusText);

  // Try with a scoped model first, fallback to default model
  const modelsResult = await listPiModelsCached();
  let modelKey: string | null = null; // default fallback

  if (modelsResult.ok && modelsResult.models.length > 0) {
    // Try to find a good model for this task
    const preferredModels = [
      "openai-codex/gpt-5.2-codex",
      "openai-codex/gpt-5.1-codex",
    ];
    for (const preferred of preferredModels) {
      const found = modelsResult.models.find((m) => m.key === preferred);
      if (found) {
        modelKey = preferred;
        break;
      }
    }
    // If no preferred model found, use the first available model
    if (!modelKey) {
      modelKey = modelsResult.models[0].key;
    }
  }

  if (!modelKey) {
    throw new Error("No model available for auto-title generation");
  }

  try {
    const result = await runPiExec(
      ["--model", modelKey, "-p", prompt],
      30_000,
      worktreePath,
    );
    if (result.ok && result.stdout.trim()) {
      // Clean up the response - remove any surrounding backticks or quotes
      let message = result.stdout.trim();
      message = message.replace(/^['"`]+|['"`]+$/g, "");
      message = message.replace(/^commit:\s*/i, "");

      // Ensure it follows conventional commit format
      if (
        !message.match(
          /^(feat|fix|docs|style|refactor|perf|test|chore|build|ci|revert)(\(.+\))?: .+/,
        )
      ) {
        // If it doesn't follow the format, prepend 'chore:'
        message = `chore: ${message}`;
      }

      return message;
    }
    return null;
  } catch (error) {
    console.error("Failed to generate commit message with Pi:", error);
    return null;
  }
}

async function generateWorktreeCommitMessage(
  conversationId: string,
): Promise<WorktreeGenerateCommitMessageResult> {
  const { conversation } = getConversationAndProject(conversationId);
  if (!conversation) {
    return { ok: false, reason: "conversation_not_found" };
  }

  const resolvedRepo = await resolveConversationRepoPath(conversationId);
  if (!resolvedRepo.ok) {
    return {
      ok: false,
      reason:
        resolvedRepo.reason === "conversation_not_found"
          ? "conversation_not_found"
          : "worktree_not_found",
    };
  }

  try {
    const hasChanges = await gitService.hasUncommittedChanges(
      resolvedRepo.repoPath,
    );
    if (!hasChanges) {
      return { ok: false, reason: "no_changes" };
    }

    const stagedDiff = await gitService.getStagedDiff(resolvedRepo.repoPath);
    const unstagedDiff = await gitService.getDiff(resolvedRepo.repoPath);
    const statusEntries = await gitService.getStatus(resolvedRepo.repoPath);
    const statusText = statusEntries
      .map(([filePath, status]) => `${status}\t${filePath}`)
      .join("\n");
    const combinedPromptDiff = [
      stagedDiff.trim() ? `# Staged diff\n${stagedDiff.trim()}` : "",
      unstagedDiff.trim() ? `# Unstaged diff\n${unstagedDiff.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const piMessage = await generateCommitMessageWithPi(
      combinedPromptDiff,
      statusText,
      resolvedRepo.repoPath,
    );

    if (piMessage) {
      return { ok: true, message: piMessage };
    }

    return { ok: true, message: summarizeGitDiffForCommit(statusText) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("enoent")) {
      return { ok: false, reason: "git_not_available", message };
    }
    return { ok: false, reason: "unknown", message };
  }
}

async function stageWorktreeFile(
  conversationId: string,
  filePath: string,
): Promise<{ ok: true } | { ok: false; reason: 'conversation_not_found' | 'worktree_not_found' | 'file_not_found' | 'git_not_available' | 'unknown'; message?: string }> {
  const { conversation } = getConversationAndProject(conversationId);
  if (!conversation) {
    return { ok: false, reason: 'conversation_not_found' };
  }
  const resolvedRepo = await resolveConversationRepoPath(conversationId);
  if (!resolvedRepo.ok) {
    return {
      ok: false,
      reason:
        resolvedRepo.reason === 'conversation_not_found'
          ? 'conversation_not_found'
          : 'worktree_not_found',
    };
  }
  if (!filePath || !filePath.trim()) {
    return { ok: false, reason: 'file_not_found' };
  }

  try {
    await gitService.stageFile(resolvedRepo.repoPath, filePath);
    worktreeGitInfoCache.delete(conversationId);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('enoent')) {
      return { ok: false, reason: 'git_not_available', message };
    }
    return { ok: false, reason: 'unknown', message };
  }
}

async function unstageWorktreeFile(
  conversationId: string,
  filePath: string,
): Promise<{ ok: true } | { ok: false; reason: 'conversation_not_found' | 'worktree_not_found' | 'file_not_found' | 'git_not_available' | 'unknown'; message?: string }> {
  const { conversation } = getConversationAndProject(conversationId);
  if (!conversation) {
    return { ok: false, reason: 'conversation_not_found' };
  }
  const resolvedRepo = await resolveConversationRepoPath(conversationId);
  if (!resolvedRepo.ok) {
    return {
      ok: false,
      reason:
        resolvedRepo.reason === 'conversation_not_found'
          ? 'conversation_not_found'
          : 'worktree_not_found',
    };
  }
  if (!filePath || !filePath.trim()) {
    return { ok: false, reason: 'file_not_found' };
  }

  try {
    await gitService.unstageFile(resolvedRepo.repoPath, filePath);
    worktreeGitInfoCache.delete(conversationId);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('enoent')) {
      return { ok: false, reason: 'git_not_available', message };
    }
    return { ok: false, reason: 'unknown', message };
  }
}

async function pullWorktreeBranch(
  conversationId: string,
): Promise<{ ok: true; branch: string; remote: string } | { ok: false; reason: 'conversation_not_found' | 'worktree_not_found' | 'git_not_available' | 'unknown'; message?: string }> {
  const { conversation } = getConversationAndProject(conversationId);
  if (!conversation) {
    return { ok: false, reason: 'conversation_not_found' };
  }
  const resolvedRepo = await resolveConversationRepoPath(conversationId);
  if (!resolvedRepo.ok) {
    return {
      ok: false,
      reason:
        resolvedRepo.reason === 'conversation_not_found'
          ? 'conversation_not_found'
          : 'worktree_not_found',
    };
  }

  try {
    const branch = await getCurrentBranch(resolvedRepo.repoPath).catch(() => 'HEAD');
    const remote = 'origin';
    await gitService.pull(resolvedRepo.repoPath, remote, branch === 'HEAD' ? undefined : branch);
    worktreeGitInfoCache.delete(conversationId);
    return { ok: true, branch, remote };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('enoent')) {
      return { ok: false, reason: 'git_not_available', message };
    }
    return { ok: false, reason: 'unknown', message };
  }
}

async function commitWorktree(
  conversationId: string,
  message: string,
): Promise<WorktreeCommitResult> {
  const trimmedMessage = (message ?? "").trim();
  if (!trimmedMessage) {
    return { ok: false, reason: "empty_message" };
  }
  const { conversation } = getConversationAndProject(conversationId);
  if (!conversation) {
    return { ok: false, reason: "conversation_not_found" };
  }
  const resolvedRepo = await resolveConversationRepoPath(conversationId);
  if (!resolvedRepo.ok) {
    return {
      ok: false,
      reason:
        resolvedRepo.reason === "conversation_not_found"
          ? "conversation_not_found"
          : "worktree_not_found",
    };
  }
  const worktreePath = resolvedRepo.repoPath;
  try {
    const hasWorkingChanges = await gitService.hasUncommittedChanges(worktreePath);
    const hasStaged = await gitService.hasStagedChanges(worktreePath);
    if (!hasWorkingChanges && !hasStaged) {
      return { ok: false, reason: "no_changes" };
    }

    if (!hasStaged) {
      await gitService.addAll(worktreePath);
    }

    const shortHash = await gitService.commit(worktreePath, trimmedMessage);
    worktreeGitInfoCache.delete(conversationId);
    return {
      ok: true,
      commit: shortHash,
      message: trimmedMessage,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes("nothing to commit")) {
      return { ok: false, reason: "no_changes" };
    }
    if (msg.toLowerCase().includes("enoent")) {
      return { ok: false, reason: "git_not_available", message: msg };
    }
    return { ok: false, reason: "unknown", message: msg };
  }
}

async function mergeWorktreeIntoMain(
  conversationId: string,
): Promise<WorktreeMergeResult> {
  const { conversation, projectRepoPath } =
    getConversationAndProject(conversationId);
  if (!conversation) {
    return { ok: false, reason: "conversation_not_found" };
  }
  if (!projectRepoPath || !(await isGitRepo(projectRepoPath))) {
    return { ok: false, reason: "project_not_found" };
  }
  const resolvedRepo = await resolveConversationRepoPath(conversationId);
  if (!resolvedRepo.ok) {
    return {
      ok: false,
      reason:
        resolvedRepo.reason === "conversation_not_found"
          ? "conversation_not_found"
          : "worktree_not_found",
    };
  }

  const nativeGitAvailable = await gitService.isNativeGitAvailable();
  if (!nativeGitAvailable) {
    return {
      ok: false,
      reason: "git_not_available",
      message:
        "Le merge automatique du worktree requiert l'installation de Git natif.",
    };
  }

  const baseBranch =
    (await gitService.resolveDefaultBranch(projectRepoPath)) ?? "main";
  const worktreePath = resolvedRepo.repoPath;
  const sourceBranch = await getCurrentBranch(worktreePath).catch(() => "HEAD");
  const alreadyMerged = await isMerged(
    projectRepoPath,
    sourceBranch,
    `origin/${baseBranch}`,
  ).catch(() => false);
  if (alreadyMerged) {
    return { ok: false, reason: "already_merged" };
  }

  try {
    const hasLocalChanges = await gitService.hasUncommittedChanges(worktreePath);
    if (hasLocalChanges) {
      return {
        ok: false,
        reason: "merge_conflicts",
        message:
          "Le worktree contient encore des modifications non committees. Committez ou nettoyez-les avant le merge.",
      };
    }

    const currentProjectBranch = await gitService.getCurrentBranch(projectRepoPath);
    if (currentProjectBranch !== baseBranch) {
      await gitService.checkout(projectRepoPath, baseBranch);
    }

    try {
      await gitService.pull(projectRepoPath, "origin", baseBranch);
    } catch (pullError) {
      console.warn("Failed to pull latest changes before merge:", pullError);
    }

    const mergeResult = await execFileAsync("git", [
      "-C",
      projectRepoPath,
      "merge",
      "--no-ff",
      sourceBranch,
    ]);

    worktreeGitInfoCache.delete(conversationId);
    gitService.clearCache(projectRepoPath);
    gitService.clearCache(worktreePath);

    return {
      ok: true,
      merged: true,
      message:
        mergeResult.stdout.trim() ||
        `Fusion réussie de ${sourceBranch} vers ${baseBranch}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error during merge operation:", error);
    const lower = message.toLowerCase();
    if (lower.includes("conflict") || lower.includes("merge conflict")) {
      return {
        ok: false,
        reason: "merge_conflicts",
        message: `Échec de la fusion: ${message}`,
      };
    }
    if (lower.includes("enoent")) {
      return {
        ok: false,
        reason: "git_not_available",
        message,
      };
    }
    return {
      ok: false,
      reason: "unknown",
      message: `Échec de la fusion: ${message}`,
    };
  }
}

async function pushWorktreeBranch(
  conversationId: string,
): Promise<WorktreePushResult> {
  const { conversation } = getConversationAndProject(conversationId);
  if (!conversation) {
    return { ok: false, reason: "conversation_not_found" };
  }
  const resolvedRepo = await resolveConversationRepoPath(conversationId);
  if (!resolvedRepo.ok) {
    return {
      ok: false,
      reason:
        resolvedRepo.reason === "conversation_not_found"
          ? "conversation_not_found"
          : "worktree_not_found",
    };
  }
  const branch = await getCurrentBranch(resolvedRepo.repoPath).catch(
    () => "HEAD",
  );
  const remote = "origin";
  try {
    await gitService.push(
      resolvedRepo.repoPath,
      remote,
      branch === "HEAD" ? undefined : branch,
    );
    worktreeGitInfoCache.delete(conversationId);
    return { ok: true, branch, remote };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("enoent")) {
      return { ok: false, reason: "git_not_available", message };
    }
    return { ok: false, reason: "unknown", message };
  }
}

function pathExistsSafe(targetPath: string): boolean {
  try {
    return fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

function detectProjectType(repoPath: string): string {
  if (pathExistsSafe(path.join(repoPath, "package.json"))) return "node";
  if (
    pathExistsSafe(path.join(repoPath, "pyproject.toml")) ||
    pathExistsSafe(path.join(repoPath, "requirements.txt")) ||
    pathExistsSafe(path.join(repoPath, "setup.py"))
  ) {
    return "python";
  }
  if (pathExistsSafe(path.join(repoPath, "Cargo.toml"))) return "rust";
  if (pathExistsSafe(path.join(repoPath, "go.mod"))) return "go";
  if (
    pathExistsSafe(path.join(repoPath, "CMakeLists.txt")) ||
    pathExistsSafe(path.join(repoPath, "Makefile")) ||
    pathExistsSafe(path.join(repoPath, "makefile"))
  ) {
    return "c";
  }
  return "unknown";
}

function buildDetectedProjectCommands(
  repoPath: string,
): DetectProjectCommandsResult {
  const projectType = detectProjectType(repoPath);
  const commands: DetectedProjectCommand[] = [];
  const seen = new Set<string>();
  const addCommand = (command: DetectedProjectCommand) => {
    const key = `${command.command} ${command.args.join(" ")}`.trim();
    if (seen.has(key)) return;
    seen.add(key);
    commands.push(command);
  };

  const packageJsonPath = path.join(repoPath, "package.json");
  if (pathExistsSafe(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
        scripts?: Record<string, unknown>;
      };
      const scripts =
        pkg.scripts && typeof pkg.scripts === "object" ? pkg.scripts : {};
      for (const scriptName of Object.keys(scripts)) {
        if (
          ["start", "dev", "test", "build", "lint", "preview"].includes(
            scriptName,
          )
        ) {
          addCommand({
            id: `node:npm:${scriptName}`,
            label: `npm run ${scriptName}`,
            command: "npm",
            args: ["run", scriptName],
            source: "package.json",
            cwd: repoPath,
          });
        }
      }
      if (commands.length === 0) {
        addCommand({
          id: "node:npm:start",
          label: "npm start",
          command: "npm",
          args: ["start"],
          source: "node-default",
          cwd: repoPath,
        });
      }
    } catch (error) {
      return {
        ok: false,
        reason: "unknown",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (projectType === "python") {
    if (pathExistsSafe(path.join(repoPath, "manage.py"))) {
      addCommand({
        id: "python:manage:runserver",
        label: "python manage.py runserver",
        command: "python",
        args: ["manage.py", "runserver"],
        source: "manage.py",
        cwd: repoPath,
      });
    }
    if (pathExistsSafe(path.join(repoPath, "app.py"))) {
      addCommand({
        id: "python:app",
        label: "python app.py",
        command: "python",
        args: ["app.py"],
        source: "app.py",
        cwd: repoPath,
      });
    }
    if (pathExistsSafe(path.join(repoPath, "main.py"))) {
      addCommand({
        id: "python:main",
        label: "python main.py",
        command: "python",
        args: ["main.py"],
        source: "main.py",
        cwd: repoPath,
      });
    }
    addCommand({
      id: "python:pytest",
      label: "pytest",
      command: "pytest",
      args: [],
      source: "python-default",
      cwd: repoPath,
    });
  }

  if (pathExistsSafe(path.join(repoPath, "Cargo.toml"))) {
    addCommand({
      id: "rust:cargo:run",
      label: "cargo run",
      command: "cargo",
      args: ["run"],
      source: "Cargo.toml",
      cwd: repoPath,
    });
    addCommand({
      id: "rust:cargo:test",
      label: "cargo test",
      command: "cargo",
      args: ["test"],
      source: "Cargo.toml",
      cwd: repoPath,
    });
  }

  if (pathExistsSafe(path.join(repoPath, "go.mod"))) {
    addCommand({
      id: "go:run",
      label: "go run .",
      command: "go",
      args: ["run", "."],
      source: "go.mod",
      cwd: repoPath,
    });
    addCommand({
      id: "go:test",
      label: "go test ./...",
      command: "go",
      args: ["test", "./..."],
      source: "go.mod",
      cwd: repoPath,
    });
  }

  if (
    pathExistsSafe(path.join(repoPath, "Makefile")) ||
    pathExistsSafe(path.join(repoPath, "makefile"))
  ) {
    addCommand({
      id: "c:make",
      label: "make",
      command: "make",
      args: [],
      source: "Makefile",
      cwd: repoPath,
    });
    addCommand({
      id: "c:make:test",
      label: "make test",
      command: "make",
      args: ["test"],
      source: "Makefile",
      cwd: repoPath,
    });
  }

  if (pathExistsSafe(path.join(repoPath, "CMakeLists.txt"))) {
    addCommand({
      id: "c:cmake:build",
      label: "cmake --build build",
      command: "cmake",
      args: ["--build", "build"],
      source: "CMakeLists.txt",
      cwd: repoPath,
    });
  }

  return {
    ok: true,
    projectType,
    commands,
    customCommands: [],
  };
}

function getConversationProjectRepoPath(conversationId: string):
  | {
      ok: true;
      repoPath: string;
    }
  | {
      ok: false;
      reason: "conversation_not_found" | "project_not_found";
    } {
  const db = getDb();
  const conversation = findConversationById(db, conversationId);
  if (!conversation) {
    return { ok: false, reason: "conversation_not_found" };
  }
  if (!conversation.project_id) {
    return { ok: false, reason: "project_not_found" };
  }
  const project = listProjects(db).find(
    (item) => item.id === conversation.project_id,
  );
  if (!project || !project.repo_path) {
    return { ok: false, reason: "project_not_found" };
  }
  return { ok: true, repoPath: project.repo_path };
}

function appendProjectCommandRunEvent(
  run: ProjectTerminalRun,
  stream: "stdout" | "stderr" | "meta",
  text: string,
) {
  if (!text) return;
  run.events.push({ seq: run.nextSeq, stream, text });
  run.nextSeq += 1;
}

function parseDiffStats(diffText: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;

  for (const line of diffText.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }
    if (line.startsWith("+")) {
      added += 1;
      continue;
    }
    if (line.startsWith("-")) {
      removed += 1;
    }
  }

  return { added, removed };
}

function extractFirstChangedLineFromUnifiedDiff(
  diffText: string,
): number | null {
  for (const line of diffText.split("\n")) {
    const match = /^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.exec(line);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }
  return null;
}

async function getGitDiffSummaryForConversation(
  conversationId: string,
): Promise<GitDiffSummaryResult> {
  const resolved = await resolveConversationRepoPath(conversationId);
  if (!resolved.ok) {
    return {
      ok: false,
      reason:
        resolved.reason === "conversation_not_found"
          ? "project_not_found"
          : resolved.reason,
    };
  }
  const repoPath = resolved.repoPath;

  try {
    const statusMatrix = await gitService.getStatusMatrix({
      fs,
      dir: repoPath,
      filepaths: ["."],
    });

    const modifiedFiles = statusMatrix.filter((row: StatusRow) => {
      const [, headStatus, workdirStatus, stageStatus] = row;
      const isModified = workdirStatus !== headStatus;
      const isStaged = stageStatus !== headStatus;
      const isUntracked =
        headStatus === 0 && workdirStatus === 2 && stageStatus === 0;
      return isModified || isStaged || isUntracked;
    });

    const files: GitModifiedFileStat[] = [];

    for (const row of modifiedFiles) {
      const filepath = row[0];

      try {
        const diff = await gitService.getCombinedDiff(repoPath, filepath);
        const stats = parseDiffStats(diff);
        files.push({
          path: filepath,
          added: stats.added,
          removed: stats.removed,
        });
      } catch (error) {
        console.warn(`Could not get diff stats for ${filepath}:`, error);
        files.push({
          path: filepath,
          added: 0,
          removed: 0,
        });
      }
    }

    const totals = files.reduce(
      (acc, file) => ({
        files: acc.files + 1,
        added: acc.added + file.added,
        removed: acc.removed + file.removed,
      }),
      { files: 0, added: 0, removed: 0 },
    );

    return { ok: true, files, totals };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result = message.toLowerCase().includes("enoent")
      ? ({ ok: false, reason: "git_not_available", message } as const)
      : ({ ok: false, reason: "unknown", message } as const);
    console.warn("[WorkspaceMain] getGitDiffSummaryForConversation:error", {
      conversationId,
      reason: result.reason,
      message,
    });
    return result;
  }
}

async function getGitFileDiffForConversation(
  conversationId: string,
  filePath: string,
): Promise<GitFileDiffResult> {
  const resolved = await resolveConversationRepoPath(conversationId);
  if (!resolved.ok) {
    return {
      ok: false,
      reason:
        resolved.reason === "conversation_not_found"
          ? "project_not_found"
          : resolved.reason,
    };
  }
  const repoPath = resolved.repoPath;
  if (!filePath || !filePath.trim()) {
    return { ok: false, reason: "file_not_found" };
  }

  try {
    const diff = await gitService.getCombinedDiff(repoPath, filePath);
    const firstChangedLine = extractFirstChangedLineFromUnifiedDiff(diff);
    const lower = diff.toLowerCase();
    const isBinary =
      lower.includes("binary files") || lower.includes("git binary patch");
    return {
      ok: true,
      path: filePath,
      diff,
      isBinary,
      firstChangedLine,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("enoent")) {
      return { ok: false, reason: "git_not_available", message };
    }
    return { ok: false, reason: "unknown", message };
  }
}

async function generateConversationTitleFromPi(params: {
  provider: string;
  modelId: string;
  repoPath: string;
  firstMessage: string;
  projectId?: string | null;
}): Promise<string | null> {
  const modelsResult = await listPiModelsCached();
  const availableModelKeys =
    modelsResult.ok
      ? modelsResult.models.map((model) => model.key)
      : undefined;
  const fallbackModelKey =
    modelsResult.ok && modelsResult.models.length > 0
      ? modelsResult.models[0]?.key ?? null
      : null;

  return generateConversationTitleFromPiInModule({
    ...params,
    availableModelKeys,
    fallbackModelKey,
    piRuntimeManager,
    insertConversation: (conversation) => {
      insertConversation(getDb(), {
        id: conversation.id,
        projectId: conversation.project_id,
        title: conversation.title,
        modelProvider: conversation.model_provider,
        modelId: conversation.model_id,
        accessMode: conversation.access_mode,
        hiddenFromSidebar: conversation.hiddenFromSidebar,
      });
    },
    log: (message, details) => {
      console.warn("[conversation-title]", message, details ?? {});
    },
  });
}

function cacheMessagesFromSnapshot(
  conversationId: string,
  snapshot: { messages: unknown[] },
) {
  if (conversationId.startsWith("__runtime_subagent__:")) {
    return;
  }
  const db = getDb();
  const MEMORY_CONTEXT_MARKER = "## Context from Past Memories";
  const ACCESS_MODE_CHANGE_MARKER = "[SYSTEM: Access Mode Change]";
  const messages = (snapshot.messages ?? []).filter((message) => {
    // Filter out memory context messages that were injected via steer()
    const payload = message as {
      role?: string;
      content?: string | Array<{ type?: string; text?: string }>;
      message?: {
        role?: string;
        content?: string | Array<{ type?: string; text?: string }>;
      };
    };
    const role = payload.role ?? payload.message?.role;
    const content = payload.content ?? payload.message?.content;
    if (role === "user" && content) {
      if (typeof content === "string") {
        return !content.includes(MEMORY_CONTEXT_MARKER);
      } else if (Array.isArray(content)) {
        return !content.some(
          (part) =>
            typeof part.text === "string" && part.text.includes(MEMORY_CONTEXT_MARKER)
        );
      }
    }
    if (role !== "assistant" && role !== "toolResult" && content) {
      if (typeof content === "string") {
        return !content.includes(ACCESS_MODE_CHANGE_MARKER);
      } else if (Array.isArray(content)) {
        return !content.some(
          (part) =>
            typeof part.text === "string" && part.text.includes(ACCESS_MODE_CHANGE_MARKER)
        );
      }
    }
    return true;
  }).map((message, index) => {
    const payload = message as {
      id?: string;
      role?: string;
      message?: { role?: string };
    };
    const role = payload?.role ?? payload?.message?.role ?? "unknown";
    return {
      id: payload.id ?? `${conversationId}-${index}`,
      role,
      payloadJson: JSON.stringify(message),
    };
  });
  replaceConversationMessagesCache(db, conversationId, messages);
}

export function diffuserTitreConversation(
  conversationId: string,
  title: string,
) {
  const payload = {
    conversationId,
    title,
    updatedAt: new Date().toISOString(),
  };
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    const webContents = win.webContents;
    if (webContents.isDestroyed()) continue;
    try {
      webContents.send("workspace:conversationUpdated", payload);
    } catch (err) {
      console.warn("[updateConversationTitle] Failed to send to window:", err);
    }
  }
  return payload;
}

export function registerWorkspaceIpc() {
  // File mention search handler
  ipcMain.handle(
    "workspace:searchProjectFiles",
    async (
      _event: electron.IpcMainInvokeEvent,
      query: string,
      conversationId: string | null,
      projectId: string | null,
    ) =>
      searchProjectFiles(query, conversationId, projectId, {
        resolveConversationRepoPath,
        getGlobalWorkspaceDir,
      }),
  );

  registerWorkspaceHandlers({
    toWorkspacePayload,
    getGitDiffSummaryForConversation,
    getGitFileDiffForConversation,
    getWorktreeGitInfo,
    generateWorktreeCommitMessage,
    stageWorktreeFile,
    unstageWorktreeFile,
    commitWorktree,
    mergeWorktreeIntoMain,
    pullWorktreeBranch,
    pushWorktreeBranch,
    listPiModelsCached,
    syncPiModelsCache,
    setPiModelScoped,
    getPiConfigSnapshot,
    sanitizePiSettings,
    readJsonFile,
    validateDefaultModelExistsInModels,
    getPiModelsPath,
    getPiSettingsPath,
    backupFile,
    atomicWriteJson,
    syncProviderApiKeysBetweenModelsAndAuth,
    getPiAgentDir,
    probeProviderBaseUrl,
    sanitizeModelsJsonWithResolvedBaseUrls,
    validateModelsJson,
    runPiExec,
    runPiRemoveWithFallback,
    getPiDiagnostics,
    listSkillsCatalog,
    getSkillsMarketplace,
    getSkillsMarketplaceFiltered: getSkillsMarketplaceFiltered as any,
    getSkillsRatings,
    addSkillRating,
    getSkillAverageRating,
    getAuthJson,
    upsertProviderInModelsJson,
    ensureConversationWorktree,
    isGitRepo,
    removeConversationWorktree,
    discoverProviderModels,
    testProviderConnection,
    hasWorkingTreeChanges,
    hasStagedChanges,
    mapConversation,
    getGlobalWorkspaceDir,
    construireTitreDeterministe,
    AFFINAGE_TITRE_IA_ACTIVE,
    generateConversationTitleFromPi,
    diffuserTitreConversation,
    detectedProjectCommandsCache,
    DETECTED_PROJECT_COMMANDS_TTL_MS,
    getConversationProjectRepoPath,
    buildDetectedProjectCommands,
    projectCommandRuns,
    appendProjectCommandRunEvent,
    piRuntimeManager,
    cacheMessagesFromSnapshot,
    extractLatestAssistantTextFromSnapshot,
    gitService,
  });
}

export async function stopPiRuntimes() {
  await stopWorkspaceHandlers(piRuntimeManager);
}

registerSystemHandlers();

export { cleanupOrphanedWorktrees };

export { ensurePiAgentBootstrapped } from "./workspace-pi.js";
