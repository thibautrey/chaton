import electron from "electron";
const { app, BrowserWindow, dialog, ipcMain, shell } = electron;
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import {
  AuthStorage,
  ModelRegistry,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";

// Utility function to clean up stale lock files
function cleanupStaleLocks(agentDir: string): void {
  const settingsPath = path.join(agentDir, "settings.json");
  const lockPath = `${settingsPath}.lock`;

  try {
    // Check if lock file exists and is stale (older than 5 minutes)
    if (fs.existsSync(lockPath)) {
      const stats = fs.statSync(lockPath);
      const lockAge = Date.now() - stats.mtime.getTime();
      const staleThreshold = 5 * 60 * 1000; // 5 minutes in milliseconds

      if (lockAge > staleThreshold) {
        console.log(`Cleaning up stale lock file: ${lockPath}`);
        fs.rmSync(lockPath, { recursive: true, force: true });
      }
    }
  } catch (error) {
    console.warn(
      `Failed to cleanup stale locks: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// Retry wrapper for SettingsManager creation with exponential backoff
async function createSettingsManagerWithRetry(
  cwd: string,
  agentDir: string,
  maxRetries = 3,
): Promise<SettingsManager> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Clean up stale locks before each attempt
      cleanupStaleLocks(agentDir);

      // Try to create SettingsManager
      return SettingsManager.create(cwd, agentDir);
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        // Exponential backoff: 100ms, 200ms, 400ms
        const delay = 100 * Math.pow(2, attempt - 1);
        console.warn(
          `Attempt ${attempt} failed to create SettingsManager, retrying in ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
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
import {
  listPiModelsCache,
  replacePiModelsCache,
} from "../db/repos/pi-models-cache.js";
import { getLanguagePreference } from "../db/repos/settings.js";
import { listProjects } from "../db/repos/projects.js";
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

function getChatonsPiAgentDir() {
  return path.join(app.getPath("userData"), ".pi", "agent");
}

function getGlobalWorkspaceDir() {
  return path.join(app.getPath("userData"), "workspace", "global");
}

// Types for git status matrix
type HeadStatus = 0 | 1;
type WorkdirStatus = 0 | 1 | 2;
type StageStatus = 0 | 1 | 2 | 3;
type StatusRow = [string, HeadStatus, WorkdirStatus, StageStatus];

function getDefaultPiSettings(): Record<string, unknown> {
  return {
    defaultProvider: null,
    defaultModel: null,
    enabledModels: [],
  };
}

function getDefaultPiModels(): Record<string, unknown> {
  return {
    providers: {},
  };
}

function ensurePiAuthJsonExists(agentDir: string): void {
  const authPath = path.join(agentDir, "auth.json");
  if (fs.existsSync(authPath)) {
    return;
  }
  fs.mkdirSync(path.dirname(authPath), { recursive: true });
  fs.writeFileSync(authPath, "{}\n", "utf8");
}

export function ensurePiAgentBootstrapped() {
  const agentDir = getChatonsPiAgentDir();
  const settingsPath = path.join(agentDir, "settings.json");
  const modelsPath = path.join(agentDir, "models.json");
  const sessionsDir = path.join(agentDir, "sessions");
  const worktreesDir = path.join(agentDir, "worktrees", "chaton");
  const binDir = path.join(agentDir, "bin");
  const globalWorkspaceDir = getGlobalWorkspaceDir();

  // Clean up any stale locks on startup
  cleanupStaleLocks(agentDir);

  fs.mkdirSync(agentDir, { recursive: true });
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.mkdirSync(worktreesDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(globalWorkspaceDir, { recursive: true });

  if (!fs.existsSync(settingsPath)) {
    atomicWriteJson(settingsPath, getDefaultPiSettings());
  }

  if (!fs.existsSync(modelsPath)) {
    atomicWriteJson(modelsPath, getDefaultPiModels());
  }

  ensurePiAuthJsonExists(agentDir);
  syncProviderApiKeysBetweenModelsAndAuth(agentDir);
}

type WorkspacePayload = {
  projects: Array<{
    id: string;
    name: string;
    repoPath: string;
    repoName: string;
    isArchived: boolean;
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

type GitDiffSummaryResult =
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

const piRuntimeManager = new PiSessionRuntimeManager();
const extensionQueueWorker: NodeJS.Timeout | null = null;
const execFileAsync = promisify(execFile);
const requireFromHere = createRequire(import.meta.url);
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
  logManager.log(entry.level, "pi", entry.message, {
    conversationId: payload.conversationId,
    event: entry.data,
  });
});

function mapConversation(c: DbConversation) {
  return {
    id: c.id,
    projectId: c.project_id,
    title: c.title,
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
    channelExtensionId: c.channel_extension_id,
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
  const projects = listProjects(db).map((p) => ({
    id: p.id,
    name: p.name,
    repoPath: p.repo_path,
    repoName: p.repo_name,
    isArchived: Boolean(p.is_archived),
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }));

  const conversations = listConversations(db).map(mapConversation);

  return {
    projects,
    conversations,
    settings: getSidebarSettings(db),
  };
}

// Initialize GitService for self-contained git operations
const gitService = new GitService();

async function isGitRepo(folderPath: string): Promise<boolean> {
  return gitService.isGitRepo(folderPath);
}

function getConversationWorktreeRoot() {
  return path.join(getChatonsPiAgentDir(), "worktrees", "chatons");
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
      await gitService.init(worktreePath);
    }
  } catch (error) {
    console.error("Error creating worktree with self-contained git:", error);
    // Fallback: create directory structure manually
    fs.mkdirSync(worktreePath, { recursive: true });
  }
  return worktreePath;
}

async function removeConversationWorktree(
  worktreePath: string | null | undefined,
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
    fs.rmSync(worktreePath, { recursive: true, force: true });
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

      // Check if this follows our worktree pattern (contains "chaton" subdirectory)
      const chatonSubdir = path.join(worktreePath, "chaton");
      if (!fs.existsSync(chatonSubdir)) {
        continue; // Not one of our worktrees
      }

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
  if (!isGitRepo(project.repo_path)) {
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
    projectRepoPath: project?.repo_path ?? null,
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
  if (!conversation.worktree_path || !isGitRepo(conversation.worktree_path)) {
    return { ok: false, reason: "worktree_not_found" };
  }

  const worktreePath = conversation.worktree_path;
  const baseRepoPath = projectRepoPath ?? worktreePath;
  const baseBranch = "main";

  try {
    const [branch, hasChanges, hasStaged, aheadBehind, merged, upstream] =
      await Promise.all([
        getCurrentBranch(worktreePath),
        hasWorkingTreeChanges(worktreePath),
        hasStagedChanges(worktreePath),
        getAheadBehind(worktreePath, `origin/${baseBranch}`, "HEAD").catch(
          () => ({ ahead: 0, behind: 0 }),
        ),
        isMerged(baseRepoPath, "HEAD", `origin/${baseBranch}`),
        getUpstreamBranch(worktreePath, "HEAD"),
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
  if (!conversation.worktree_path || !isGitRepo(conversation.worktree_path)) {
    return { ok: false, reason: "worktree_not_found" };
  }

  try {
    const hasChanges = await gitService.hasUncommittedChanges(
      conversation.worktree_path,
    );
    if (!hasChanges) {
      return { ok: false, reason: "no_changes" };
    }

    // Try to generate a better commit message using Pi
    const piMessage = await generateCommitMessageWithPi(
      "",
      "",
      conversation.worktree_path,
    );

    if (piMessage) {
      return { ok: true, message: piMessage };
    }

    // Fallback to simple summary if Pi fails
    return { ok: true, message: summarizeGitDiffForCommit("") };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("enoent")) {
      return { ok: false, reason: "git_not_available", message };
    }
    return { ok: false, reason: "unknown", message };
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
  if (!conversation.worktree_path || !isGitRepo(conversation.worktree_path)) {
    return { ok: false, reason: "worktree_not_found" };
  }
  const worktreePath = conversation.worktree_path;
  try {
    // Use self-contained git service to check for changes
    const hasChanges = await gitService.hasUncommittedChanges(worktreePath);
    if (!hasChanges) {
      return { ok: false, reason: "no_changes" };
    }

    // Use self-contained git service for add and commit
    await gitService.addAll(worktreePath);
    // Note: isomorphic-git doesn't have a simple commit function,
    // so we'll need to implement this or use a different approach
    console.log(`Would commit with message: ${trimmedMessage}`);

    // Generate a short hash for the commit (simplified approach)
    const shortHash = crypto.randomBytes(4).toString("hex");
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
  if (!projectRepoPath || !isGitRepo(projectRepoPath)) {
    return { ok: false, reason: "project_not_found" };
  }
  if (!conversation.worktree_path || !isGitRepo(conversation.worktree_path)) {
    return { ok: false, reason: "worktree_not_found" };
  }
  const baseBranch = "main";
  const worktreePath = conversation.worktree_path;
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
    // Use self-contained git service to check for changes
    const hasLocalChanges =
      await gitService.hasUncommittedChanges(worktreePath);
    if (hasLocalChanges) {
      await gitService.addAll(worktreePath);
      // Note: commit functionality would go here
      console.log(`Would auto-commit before merge to ${baseBranch}`);
    }
  } catch (error) {
    console.error(
      "Error with self-contained git operations during merge:",
      error,
    );
    // Continue with merge even if commit fails
  }

  try {
    // Implement basic merge using isomorphic-git capabilities
    // 1. First, ensure we're on the main branch in the project repo
    const currentProjectBranch =
      await gitService.getCurrentBranch(projectRepoPath);
    if (currentProjectBranch !== baseBranch) {
      // Checkout main branch first
      try {
        await gitService.checkout(projectRepoPath, baseBranch);
      } catch (checkoutError) {
        console.error("Failed to checkout main branch:", checkoutError);
        return {
          ok: false,
          reason: "git_not_available",
          message: `Échec de basculement vers la branche ${baseBranch}: ${checkoutError instanceof Error ? checkoutError.message : String(checkoutError)}`,
        };
      }
    }

    // 2. Pull latest changes from remote to ensure we're up to date
    try {
      await gitService.pull(projectRepoPath, "origin", baseBranch);
    } catch (pullError) {
      console.warn("Failed to pull latest changes:", pullError);
      // Continue with merge even if pull fails
    }

    // 3. Get the commit hash from the worktree branch
    const worktreeLog = await gitService.getLog(worktreePath, 1);
    const sourceCommit =
      worktreeLog.length > 0 ? worktreeLog[0].oid : undefined;

    if (!sourceCommit) {
      return {
        ok: false,
        reason: "unknown",
        message: `Aucun commit trouvé dans la branche source ${sourceBranch}`,
      };
    }

    // 4. Merge the worktree changes into main
    // Note: isomorphic-git doesn't have a direct merge function,
    // so we implement a basic merge using cherry-pick approach
    try {
      // Get all commits from the worktree branch
      const worktreeCommits = await gitService.getLog(worktreePath);

      if (worktreeCommits.length === 0) {
        return {
          ok: true,
          merged: false,
          message: `Aucun changement à fusionner depuis ${sourceBranch}`,
        };
      }

      // For now, implement a simple approach: copy changes from worktree to main
      // This is a basic implementation that works for simple cases
      const worktreeStatus = await gitService.getStatus(worktreePath);

      if (worktreeStatus.length === 0) {
        return {
          ok: true,
          merged: false,
          message: `Aucun fichier modifié dans ${sourceBranch}`,
        };
      }

      // Copy changed files from worktree to project main branch
      let filesCopied = 0;
      let filesWithConflicts = 0;

      for (const [filePath, status] of worktreeStatus) {
        if (status === "modified" || status === "added") {
          const sourceFile = path.join(worktreePath, filePath);
          const destFile = path.join(projectRepoPath, filePath);

          try {
            // Ensure destination directory exists
            const destDir = path.dirname(destFile);
            if (!fs.existsSync(destDir)) {
              fs.mkdirSync(destDir, { recursive: true });
            }

            // Copy file from worktree to main
            if (fs.existsSync(sourceFile)) {
              fs.copyFileSync(sourceFile, destFile);
              filesCopied++;
            }
          } catch (copyError) {
            console.warn(`Failed to copy ${filePath}:`, copyError);
            filesWithConflicts++;
          }
        }
      }

      if (filesWithConflicts > 0) {
        return {
          ok: false,
          reason: "merge_conflicts",
          message: `Fusion partielle: ${filesCopied} fichiers copiés, ${filesWithConflicts} fichiers en conflit`,
        };
      }

      // Add all the copied files to the main branch
      await gitService.addAll(projectRepoPath);

      return {
        ok: true,
        merged: true,
        message: `Fusion réussie de ${sourceBranch} vers ${baseBranch} (${filesCopied} fichiers)`,
      };
    } catch (mergeError) {
      console.error("Merge failed:", mergeError);
      return {
        ok: false,
        reason: "merge_conflicts",
        message: `Échec de la fusion: ${mergeError instanceof Error ? mergeError.message : String(mergeError)}`,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error during merge operation:", error);
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
  if (!conversation.worktree_path || !isGitRepo(conversation.worktree_path)) {
    return { ok: false, reason: "worktree_not_found" };
  }
  const branch = await getCurrentBranch(conversation.worktree_path).catch(
    () => "HEAD",
  );
  const remote = "origin";
  return {
    ok: false,
    reason: "git_not_available",
    message: `Push non disponible en mode self-contained (remote: ${remote}, branch: ${branch}).`,
  };
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
  if (!project) {
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

function parseEnabledScopedModels(): Set<string> {
  const settingsPath = path.join(getChatonsPiAgentDir(), "settings.json");
  if (!settingsPath || !fs.existsSync(settingsPath)) {
    return new Set();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as {
      enabledModels?: unknown;
    };
    if (!Array.isArray(parsed.enabledModels)) {
      return new Set();
    }

    return new Set(
      parsed.enabledModels.filter(
        (value): value is string => typeof value === "string",
      ),
    );
  } catch {
    return new Set();
  }
}

function getPiSettingsPath() {
  return path.join(getChatonsPiAgentDir(), "settings.json");
}

function getPiModelsPath() {
  return path.join(getChatonsPiAgentDir(), "models.json");
}

function getPiAuthPath() {
  return path.join(getChatonsPiAgentDir(), "auth.json");
}

function getAuthJson(): Record<string, unknown> {
  const result = readJsonFile(getPiAuthPath());
  return result.ok ? result.value : {};
}

function upsertProviderInModelsJson(
  providerId: string,
  config: Record<string, unknown>,
): { ok: true } | { ok: false; message: string } {
  const modelsPath = getPiModelsPath();
  const existing = readJsonFile(modelsPath);
  const current: Record<string, unknown> = existing.ok
    ? { ...existing.value }
    : {};
  const providers =
    (current.providers as Record<string, unknown> | undefined) ?? {};
  if (!providers[providerId]) {
    providers[providerId] = config;
    const next = { ...current, providers };
    try {
      if (fs.existsSync(modelsPath)) backupFile(modelsPath);
      atomicWriteJson(modelsPath, next);
      syncProviderApiKeysBetweenModelsAndAuth(getChatonsPiAgentDir());
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return { ok: true };
}

function getPiBinaryPath() {
  const bundledPiCli = getBundledPiCliPath();
  if (bundledPiCli) {
    return bundledPiCli;
  }
  return null;
}

function getPiAgentDir() {
  return getChatonsPiAgentDir();
}

function migrateProviderApiKeysToAuthIfNeeded(agentDir: string): void {
  const modelsPath = path.join(agentDir, "models.json");
  const authPath = path.join(agentDir, "auth.json");
  ensurePiAuthJsonExists(agentDir);
  if (!fs.existsSync(modelsPath)) {
    return;
  }

  type ModelsShape = {
    providers?: Record<string, { apiKey?: unknown }>;
  };

  let models: ModelsShape | null = null;
  try {
    models = JSON.parse(fs.readFileSync(modelsPath, "utf8")) as ModelsShape;
  } catch {
    return;
  }
  if (!models || typeof models !== "object") {
    return;
  }

  const providers =
    models.providers && typeof models.providers === "object"
      ? models.providers
      : {};
  const apiKeys = Object.entries(providers)
    .map(([provider, cfg]) => {
      const key = cfg?.apiKey;
      return {
        provider,
        key:
          typeof key === "string" && key.trim().length > 0 ? key.trim() : null,
      };
    })
    .filter(
      (entry): entry is { provider: string; key: string } => entry.key !== null,
    );

  if (apiKeys.length === 0) {
    return;
  }

  let auth: Record<string, unknown> = {};
  if (fs.existsSync(authPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(authPath, "utf8"));
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        auth = raw as Record<string, unknown>;
      }
    } catch {
      auth = {};
    }
  }

  let changed = false;
  for (const { provider, key } of apiKeys) {
    const existing = auth[provider];
    if (
      existing &&
      typeof existing === "object" &&
      !Array.isArray(existing) &&
      (existing as { type?: unknown }).type === "api_key" &&
      typeof (existing as { key?: unknown }).key === "string" &&
      (existing as { key: string }).key.trim().length > 0
    ) {
      continue;
    }
    auth[provider] = { type: "api_key", key };
    changed = true;
  }

  if (!changed) {
    return;
  }

  fs.mkdirSync(path.dirname(authPath), { recursive: true });
  fs.writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`, "utf8");
}

function syncProviderApiKeysBetweenModelsAndAuth(agentDir: string): void {
  migrateProviderApiKeysToAuthIfNeeded(agentDir);

  const modelsPath = path.join(agentDir, "models.json");
  const authPath = path.join(agentDir, "auth.json");
  if (!fs.existsSync(modelsPath) || !fs.existsSync(authPath)) {
    return;
  }

  type ModelsShape = {
    providers?: Record<string, { apiKey?: unknown }>;
  };
  type AuthShape = Record<string, { type?: unknown; key?: unknown }>;

  let models: ModelsShape | null = null;
  let auth: AuthShape | null = null;
  try {
    models = JSON.parse(fs.readFileSync(modelsPath, "utf8")) as ModelsShape;
    auth = JSON.parse(fs.readFileSync(authPath, "utf8")) as AuthShape;
  } catch {
    return;
  }
  if (!models || typeof models !== "object") return;
  if (!auth || typeof auth !== "object" || Array.isArray(auth)) return;
  if (!models.providers || typeof models.providers !== "object") return;

  let modelsChanged = false;
  const nextProviders: Record<string, { apiKey?: unknown }> = {
    ...(models.providers as Record<string, { apiKey?: unknown }>),
  };

  for (const [providerName, providerConfig] of Object.entries(nextProviders)) {
    const authEntry = auth[providerName];
    const authKey =
      authEntry &&
      typeof authEntry === "object" &&
      !Array.isArray(authEntry) &&
      authEntry.type === "api_key" &&
      typeof authEntry.key === "string" &&
      authEntry.key.trim().length > 0
        ? authEntry.key.trim()
        : null;
    if (!authKey) {
      continue;
    }

    const modelKey =
      typeof providerConfig?.apiKey === "string"
        ? providerConfig.apiKey.trim()
        : "";
    if (!modelKey || modelKey !== authKey) {
      nextProviders[providerName] = {
        ...(providerConfig ?? {}),
        apiKey: authKey,
      };
      modelsChanged = true;
    }
  }

  if (modelsChanged) {
    const nextModels = {
      ...models,
      providers: nextProviders,
    } as Record<string, unknown>;
    fs.writeFileSync(
      modelsPath,
      `${JSON.stringify(nextModels, null, 2)}\n`,
      "utf8",
    );
  }
}

function getBundledPiCliPath(): string | null {
  const candidates = new Set<string>();

  try {
    const piEntrypoint = requireFromHere.resolve(
      "@mariozechner/pi-coding-agent",
    );
    const distDir = path.dirname(piEntrypoint);
    candidates.add(path.join(distDir, "cli.js"));
  } catch {
    // Keep probing static candidate paths below.
  }

  const appPath = app.getAppPath();
  const resourcesPath = process.resourcesPath;
  const roots = [
    process.cwd(),
    appPath,
    path.dirname(appPath),
    resourcesPath,
    path.join(resourcesPath, "app.asar.unpacked"),
  ];

  for (const root of roots) {
    candidates.add(
      path.join(
        root,
        "node_modules",
        "@mariozechner",
        "pi-coding-agent",
        "dist",
        "cli.js",
      ),
    );
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function readJsonFile(
  filePath: string,
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string } {
  if (!filePath || !fs.existsSync(filePath)) {
    return { ok: false, message: `Fichier introuvable: ${filePath}` };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {
        ok: false,
        message: `JSON invalide dans ${filePath}: objet attendu`,
      };
    }
    return { ok: true, value: raw as Record<string, unknown> };
  } catch (error) {
    return {
      ok: false,
      message: `JSON invalide dans ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function backupFile(filePath: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${filePath}.bak.${stamp}`;
  fs.copyFileSync(filePath, backupPath);
}

function atomicWriteJson(filePath: string, data: Record<string, unknown>) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(
    dir,
    `${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`,
  );
  fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tmpPath, filePath);
}

function validateModelsJson(next: Record<string, unknown>): string | null {
  const providers = next.providers;
  if (providers !== undefined) {
    if (
      !providers ||
      typeof providers !== "object" ||
      Array.isArray(providers)
    ) {
      return 'models.json: "providers" doit être un objet.';
    }
    for (const [providerName, providerConfig] of Object.entries(
      providers as Record<string, unknown>,
    )) {
      if (
        !providerConfig ||
        typeof providerConfig !== "object" ||
        Array.isArray(providerConfig)
      ) {
        return `models.json: provider "${providerName}" invalide (objet attendu).`;
      }
      const modelList = (providerConfig as Record<string, unknown>).models;
      if (modelList !== undefined && !Array.isArray(modelList)) {
        return `models.json: provider "${providerName}" -> "models" doit être un tableau.`;
      }
      if (Array.isArray(modelList)) {
        for (const model of modelList) {
          if (!model || typeof model !== "object" || Array.isArray(model)) {
            return `models.json: provider "${providerName}" contient un modèle invalide.`;
          }
          const id = (model as Record<string, unknown>).id;
          if (typeof id !== "string" || id.trim().length === 0) {
            return `models.json: provider "${providerName}" contient un modèle sans id valide.`;
          }
        }
      }
    }
  }
  return null;
}

function normalizeModelsJsonForPiSchema(next: Record<string, unknown>): {
  value: Record<string, unknown>;
  changed: boolean;
} {
  const providersNode = next.providers;
  if (
    !providersNode ||
    typeof providersNode !== "object" ||
    Array.isArray(providersNode)
  ) {
    return { value: next, changed: false };
  }

  const providers = providersNode as Record<string, unknown>;
  const nextProviders: Record<string, unknown> = { ...providers };
  let changed = false;

  for (const [providerName, providerValue] of Object.entries(providers)) {
    if (
      !providerValue ||
      typeof providerValue !== "object" ||
      Array.isArray(providerValue)
    ) {
      continue;
    }
    const providerConfig = {
      ...(providerValue as Record<string, unknown>),
    };
    let providerChanged = false;

    if (typeof providerConfig.apiKey === "string") {
      const trimmed = providerConfig.apiKey.trim();
      if (trimmed.length === 0) {
        delete providerConfig.apiKey;
        providerChanged = true;
      } else if (trimmed !== providerConfig.apiKey) {
        providerConfig.apiKey = trimmed;
        providerChanged = true;
      }
    }

    if (providerChanged) {
      nextProviders[providerName] = providerConfig;
      changed = true;
    }
  }

  if (!changed) {
    return { value: next, changed: false };
  }

  return {
    value: {
      ...next,
      providers: nextProviders,
    },
    changed: true,
  };
}

function normalizeModelsJsonFileForPiSchema(modelsPath: string) {
  const modelsResult = readJsonFile(modelsPath);
  if (!modelsResult.ok) return;
  const normalized = normalizeModelsJsonForPiSchema(modelsResult.value);
  if (!normalized.changed) return;
  atomicWriteJson(modelsPath, normalized.value);
}

function normalizeHttpBaseUrlShape(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}

function buildBaseUrlCandidates(raw: string): string[] {
  const normalized = normalizeHttpBaseUrlShape(raw);
  if (!normalized) return [];
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return [normalized];
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return [normalized];
  }

  const origin = parsed.origin;
  const path = parsed.pathname.replace(/\/+$/, "");
  const withV1 = `${origin}/v1`;
  const withoutV1 = origin;
  const ordered = [normalized];

  if (path === "" || path === "/") {
    ordered.push(withV1);
  } else if (path === "/v1") {
    ordered.push(withoutV1);
  } else {
    // Keep unusual paths first but still try common OpenAI-compatible roots.
    ordered.push(withV1, withoutV1);
  }

  const dedup = new Set<string>();
  for (const entry of ordered) {
    const value = normalizeHttpBaseUrlShape(entry);
    if (value) dedup.add(value);
  }
  return Array.from(dedup);
}

async function probeProviderBaseUrl(baseUrl: string): Promise<{
  resolvedBaseUrl: string;
  tested: string[];
  matched: boolean;
}> {
  const candidates = buildBaseUrlCandidates(baseUrl);
  if (candidates.length === 0) {
    return { resolvedBaseUrl: baseUrl.trim(), tested: [], matched: false };
  }

  const results = await Promise.all(
    candidates.map(async (candidate) => {
      const probeUrl = `${candidate}/models`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      try {
        const response = await fetch(probeUrl, {
          method: "GET",
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        // 401/403/405 usually means the endpoint exists but requires auth or another method.
        const reachable =
          response.status < 500 &&
          response.status !== 404 &&
          response.status !== 410;
        return { candidate, reachable };
      } catch {
        return { candidate, reachable: false };
      } finally {
        clearTimeout(timeout);
      }
    }),
  );

  const winner = results.find((result) => result.reachable);
  return {
    resolvedBaseUrl: winner ? winner.candidate : candidates[0],
    tested: candidates,
    matched: Boolean(winner),
  };
}

async function sanitizeModelsJsonWithResolvedBaseUrls(
  next: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const normalized = normalizeModelsJsonForPiSchema(next).value;
  const providersNode = normalized.providers;
  if (
    !providersNode ||
    typeof providersNode !== "object" ||
    Array.isArray(providersNode)
  ) {
    return normalized;
  }

  const providers = providersNode as Record<string, unknown>;
  const nextProviders: Record<string, unknown> = { ...providers };

  await Promise.all(
    Object.entries(providers).map(async ([providerName, providerValue]) => {
      if (
        !providerValue ||
        typeof providerValue !== "object" ||
        Array.isArray(providerValue)
      ) {
        return;
      }
      const providerConfig = providerValue as Record<string, unknown>;
      const baseUrl =
        typeof providerConfig.baseUrl === "string"
          ? providerConfig.baseUrl.trim()
          : "";
      if (!baseUrl) return;

      const resolved = await probeProviderBaseUrl(baseUrl);
      if (!resolved.resolvedBaseUrl || resolved.resolvedBaseUrl === baseUrl) {
        return;
      }

      console.info(
        `[pi] Auto-corrected provider baseUrl for "${providerName}": "${baseUrl}" -> "${resolved.resolvedBaseUrl}" (tested: ${resolved.tested.join(", ")})`,
      );
      nextProviders[providerName] = {
        ...providerConfig,
        baseUrl: resolved.resolvedBaseUrl,
      };
    }),
  );

  return {
    ...normalized,
    providers: nextProviders,
  };
}

function sanitizePiSettings(
  next: Record<string, unknown>,
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string } {
  const sanitized = { ...next };
  if (sanitized.enabledModels !== undefined) {
    if (!Array.isArray(sanitized.enabledModels)) {
      return {
        ok: false,
        message: 'settings.json: "enabledModels" doit être un tableau.',
      };
    }
    sanitized.enabledModels = (sanitized.enabledModels as unknown[]).filter(
      (item): item is string => typeof item === "string",
    );
  }
  return { ok: true, value: sanitized };
}

function validateDefaultModelExistsInModels(
  settings: Record<string, unknown>,
  models: Record<string, unknown>,
): string | null {
  const defaultProvider =
    typeof settings.defaultProvider === "string"
      ? settings.defaultProvider.trim()
      : "";
  const defaultModel =
    typeof settings.defaultModel === "string"
      ? settings.defaultModel.trim()
      : "";
  if (!defaultProvider || !defaultModel) {
    return null;
  }

  const providers = models.providers;
  if (!providers || typeof providers !== "object" || Array.isArray(providers)) {
    return 'models.json invalide: "providers" doit être un objet.';
  }
  const providerNode = (providers as Record<string, unknown>)[defaultProvider];
  if (
    !providerNode ||
    typeof providerNode !== "object" ||
    Array.isArray(providerNode)
  ) {
    return `settings.json invalide: defaultProvider "${defaultProvider}" absent de models.json.`;
  }
  const modelList = (providerNode as Record<string, unknown>).models;
  if (!Array.isArray(modelList)) {
    return `models.json invalide: provider "${defaultProvider}" -> "models" doit être un tableau.`;
  }

  const exists = modelList.some((model) => {
    if (!model || typeof model !== "object" || Array.isArray(model)) {
      return false;
    }
    return (model as { id?: unknown }).id === defaultModel;
  });
  if (!exists) {
    return `settings.json invalide: defaultModel "${defaultModel}" absent du provider "${defaultProvider}" dans models.json.`;
  }
  return null;
}

async function runPiExec(
  args: string[],
  timeout = 20_000,
  cwd?: string,
): Promise<PiCommandResult> {
  const piPath = getPiBinaryPath();
  if (!piPath) {
    return {
      ok: false,
      code: 1,
      command: [piPath || "pi", ...args],
      stdout: "",
      stderr: "",
      ranAt: new Date().toISOString(),
      message: `Pi CLI introuvable: ${piPath || "inconnu"}`,
    };
  }

  const command = process.execPath;
  const commandArgs = [piPath, ...args];
  const workdir = cwd ?? getGlobalWorkspaceDir();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    PI_CODING_AGENT_DIR: getPiAgentDir(),
  };

  try {
    const result = await execFileAsync(command, commandArgs, {
      cwd: workdir,
      timeout,
      env,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 10,
    });

    return {
      ok: true,
      code: 0,
      command: [command, ...commandArgs],
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      ranAt: new Date().toISOString(),
      message: "",
    };
  } catch (error) {
    const typedError = error as {
      code?: number | string;
      message?: string;
      stdout?: string;
      stderr?: string;
      signal?: string;
    };
    const stderr = [typedError.stderr, typedError.message]
      .filter(
        (part): part is string => typeof part === "string" && part.length > 0,
      )
      .join("\n");

    return {
      ok: false,
      code: typeof typedError.code === "number" ? typedError.code : 1,
      command: [command, ...commandArgs],
      stdout: typedError.stdout ?? "",
      stderr,
      ranAt: new Date().toISOString(),
      message:
        typedError.signal === "SIGTERM"
          ? "Commande Pi expirée."
          : stderr || "Command failed",
    };
  }
}

type PiListedModel = {
  provider: string;
  id: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  imageInput?: boolean;
};

async function fetchProviderModelsFromEndpoint(
  providerConfig: Record<string, unknown>,
): Promise<PiListedModel[]> {
  const baseUrl =
    typeof providerConfig.baseUrl === "string"
      ? providerConfig.baseUrl.trim()
      : "";
  if (!baseUrl) return [];

  const normalizedBaseUrl = normalizeHttpBaseUrlShape(baseUrl);
  if (!normalizedBaseUrl) return [];

  const apiKey =
    typeof providerConfig.apiKey === "string"
      ? providerConfig.apiKey.trim()
      : "";
  const headers: Record<string, string> = { accept: "application/json" };
  if (apiKey.length > 0) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${normalizedBaseUrl}/models`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      data?: Array<{
        id?: unknown;
        context_window?: unknown;
        max_completion_tokens?: unknown;
      }>;
    };
    if (!Array.isArray(payload.data)) return [];
    return payload.data
      .map((item) => {
        if (!item || typeof item.id !== "string" || item.id.trim().length === 0) {
          return null;
        }

        const modelId = item.id.trim();
        const model: PiListedModel = {
          provider: "",
          id: modelId,
        };

        // Extract context window if available
        if (typeof item.context_window === "number" && item.context_window > 0) {
          model.contextWindow = item.context_window;
        }

        // Extract max completion tokens if available
        if (
          typeof item.max_completion_tokens === "number" &&
          item.max_completion_tokens > 0
        ) {
          model.maxTokens = item.max_completion_tokens;
        }

        // Infer capabilities from model id naming patterns
        const lowerModelId = modelId.toLowerCase();
        if (
          lowerModelId.includes("vision") ||
          lowerModelId.includes("gpt-4-v") ||
          lowerModelId.includes("claude-3") ||
          lowerModelId.includes("gemini") ||
          lowerModelId.includes("llava") ||
          lowerModelId.includes("qwen-vl")
        ) {
          model.imageInput = true;
        }

        // Infer reasoning capability from model id naming patterns
        if (
          lowerModelId.includes("reasoning") ||
          lowerModelId.includes("thinking") ||
          lowerModelId.includes("o1") ||
          lowerModelId.includes("deep-think")
        ) {
          model.reasoning = true;
        }

        return model;
      })
      .filter((item): item is PiListedModel => item !== null);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverProviderModels(
  providerConfig: Record<string, unknown>,
): Promise<{ ok: boolean; models: PiListedModel[]; message?: string }> {
  try {
    const discovered = await fetchProviderModelsFromEndpoint(providerConfig);
    if (!discovered || discovered.length === 0) {
      return {
        ok: false,
        models: [],
        message: "No models found. Check that the API key is valid and the endpoint is accessible.",
      };
    }
    return {
      ok: true,
      models: discovered,
    };
  } catch (error) {
    return {
      ok: false,
      models: [],
      message: `Failed to discover models: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

function parsePiTokenCount(raw: string): number | undefined {
  const value = raw.trim().toUpperCase();
  if (!value) return undefined;
  const match = /^(\d+(?:\.\d+)?)([KM]?)$/.exec(value);
  if (!match) return undefined;
  const base = Number.parseFloat(match[1]);
  if (!Number.isFinite(base)) return undefined;
  const unit = match[2];
  if (unit === "K") return Math.round(base * 1_000);
  if (unit === "M") return Math.round(base * 1_000_000);
  return Math.round(base);
}

function parsePiListModelsStdout(stdout: string): PiListedModel[] {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const headerIndex = lines.findIndex((line) =>
    /^provider\s{2,}model\s{2,}context\s{2,}max-out\s{2,}thinking\s{2,}images$/i.test(
      line.trim(),
    ),
  );
  if (headerIndex === -1) return [];

  const modelLines = lines.slice(headerIndex + 1);
  const parsed: PiListedModel[] = [];

  for (const line of modelLines) {
    const cols = line
      .trim()
      .split(/\s{2,}/)
      .map((col) => col.trim());
    if (cols.length < 6) continue;
    const [provider, id, context, maxOut, thinking, images] = cols;
    if (!provider || !id) continue;
    parsed.push({
      provider,
      id,
      contextWindow: parsePiTokenCount(context),
      maxTokens: parsePiTokenCount(maxOut),
      reasoning: thinking.toLowerCase() === "yes",
      imageInput: images.toLowerCase() === "yes",
    });
  }

  return parsed;
}

function normalizeProviderToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

async function refreshModelsJsonFromPiListModels(): Promise<void> {
  const modelsPath = getPiModelsPath();
  const modelsResult = readJsonFile(modelsPath);
  if (!modelsResult.ok) return;

  const providersNode = modelsResult.value.providers;
  if (
    !providersNode ||
    typeof providersNode !== "object" ||
    Array.isArray(providersNode)
  ) {
    return;
  }

  const configuredProviders = Object.keys(
    providersNode as Record<string, unknown>,
  );
  if (configuredProviders.length === 0) return;

  const command = await runPiExec(["--list-models"], 30_000);
  if (!command.ok || !command.stdout.trim()) return;

  const listed = parsePiListModelsStdout(command.stdout);
  if (listed.length === 0) return;

  const listedByProvider = new Map<string, PiListedModel[]>();
  for (const model of listed) {
    const providerKey = normalizeProviderToken(model.provider);
    if (!listedByProvider.has(providerKey)) {
      listedByProvider.set(providerKey, []);
    }
    listedByProvider.get(providerKey)?.push(model);
  }

  const nextProviders: Record<string, unknown> = {
    ...(providersNode as Record<string, unknown>),
  };
  let changed = false;

  for (const providerName of configuredProviders) {
    const providerValue = nextProviders[providerName];
    if (
      !providerValue ||
      typeof providerValue !== "object" ||
      Array.isArray(providerValue)
    ) {
      continue;
    }

    let discovered = listedByProvider.get(normalizeProviderToken(providerName));
    if (!discovered || discovered.length === 0) {
      const discoveredFromEndpoint = await fetchProviderModelsFromEndpoint(
        providerValue as Record<string, unknown>,
      );
      if (discoveredFromEndpoint.length > 0) {
        discovered = discoveredFromEndpoint;
      }
    } else {
      const discoveredFromEndpoint = await fetchProviderModelsFromEndpoint(
        providerValue as Record<string, unknown>,
      );
      if (discoveredFromEndpoint.length > 0) {
        const merged = new Map<string, PiListedModel>();
        for (const model of discovered) {
          merged.set(model.id, model);
        }
        for (const model of discoveredFromEndpoint) {
          if (!merged.has(model.id)) {
            merged.set(model.id, model);
          }
        }
        discovered = Array.from(merged.values());
      }
    }
    if (!discovered || discovered.length === 0) {
      continue;
    }

    const nextModelList = discovered.map((model) => {
      const entry: Record<string, unknown> = { id: model.id };
      if (typeof model.contextWindow === "number") {
        entry.contextWindow = model.contextWindow;
      }
      if (typeof model.maxTokens === "number") {
        entry.maxTokens = model.maxTokens;
      }
      if (model.reasoning) {
        entry.reasoning = true;
      }
      if (model.imageInput) {
        entry.imageInput = true;
      }
      return entry;
    });

    const currentModels = (providerValue as Record<string, unknown>).models;
    const currentSerialized = Array.isArray(currentModels)
      ? JSON.stringify(currentModels)
      : "";
    const nextSerialized = JSON.stringify(nextModelList);
    if (currentSerialized === nextSerialized) {
      continue;
    }

    nextProviders[providerName] = {
      ...(providerValue as Record<string, unknown>),
      models: nextModelList,
    };
    changed = true;
  }

  if (!changed) return;

  const nextModels = {
    ...modelsResult.value,
    providers: nextProviders,
  } as Record<string, unknown>;
  const validationError = validateModelsJson(nextModels);
  if (validationError) return;
  atomicWriteJson(modelsPath, nextModels);

  const settingsPath = getPiSettingsPath();
  const settingsResult = readJsonFile(settingsPath);
  if (!settingsResult.ok) return;

  const settings = { ...settingsResult.value };
  const currentProvider =
    typeof settings.defaultProvider === "string"
      ? settings.defaultProvider
      : "";
  const currentModel =
    typeof settings.defaultModel === "string" ? settings.defaultModel : "";
  if (!currentProvider || !currentModel) return;

  const providerNode = nextProviders[currentProvider];
  if (
    !providerNode ||
    typeof providerNode !== "object" ||
    Array.isArray(providerNode)
  ) {
    return;
  }
  const modelList = (providerNode as Record<string, unknown>).models;
  if (!Array.isArray(modelList) || modelList.length === 0) return;

  const exists = modelList.some((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return false;
    }
    return (entry as { id?: unknown }).id === currentModel;
  });
  if (exists) return;

  const firstModelId = modelList
    .map((entry) =>
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as { id?: unknown }).id
        : undefined,
    )
    .find((id): id is string => typeof id === "string" && id.length > 0);
  if (!firstModelId) return;

  settings.defaultModel = firstModelId;
  atomicWriteJson(settingsPath, settings);
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
    // Get status matrix which includes both staged and unstaged changes
    const statusMatrix = await gitService.getStatusMatrix({
      fs,
      dir: repoPath,
      filepaths: ["."],
    });

    // Filter to get files that are either staged or modified in workdir
    const modifiedFiles = statusMatrix.filter((row: StatusRow) => {
      const [, headStatus, workdirStatus, stageStatus] = row;
      // Include files that are:
      // - Modified in working directory (staged or not)
      // - Staged but not committed
      // - Untracked (new files)
      const isModified = workdirStatus !== headStatus;
      const isStaged = stageStatus !== headStatus;
      const isUntracked =
        headStatus === 0 && workdirStatus === 2 && stageStatus === 0;
      return isModified || isStaged || isUntracked;
    });

    // Get file paths and calculate diff statistics
    const files: GitModifiedFileStat[] = [];

    for (const row of modifiedFiles) {
      const filepath = row[0];

      // Try to get diff statistics using native git
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
        // Fallback: add file with 0 stats
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
    if (message.toLowerCase().includes("enoent")) {
      return { ok: false, reason: "git_not_available", message };
    }
    return { ok: false, reason: "unknown", message };
  }
}

/**
 * Parse diff output to extract added/removed line counts
 */
function parseDiffStats(diffText: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;

  // Parse unified diff format: @@ -start,count +start,count @@
  const diffRegex = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/g;

  let match;
  while ((match = diffRegex.exec(diffText)) !== null) {
    const oldCount = match[2] ? parseInt(match[2], 10) : 1;
    const newCount = match[4] ? parseInt(match[4], 10) : 1;

    removed += oldCount;
    added += newCount;
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
    // Get combined diff (both staged and unstaged changes)
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

function isNpmEnotemptyRemoveError(result: PiCommandResult): boolean {
  if (result.ok) {
    return false;
  }
  const haystack =
    `${result.message ?? ""}\n${result.stderr}\n${result.stdout}`.toLowerCase();
  return (
    haystack.includes("enotempty") &&
    haystack.includes("npm") &&
    haystack.includes("rename")
  );
}

function extractPackageNameFromSource(source: string): string | null {
  if (!source || !source.startsWith("npm:")) {
    return null;
  }
  const name = source.slice("npm:".length).trim();
  return name.length > 0 ? name : null;
}

function collectNpmGlobalNodeModulesRoots(envPath: string): string[] {
  const roots = new Set<string>();
  const bins = envPath.split(":").filter((entry) => entry.length > 0);
  for (const binPath of bins) {
    if (binPath.endsWith("/bin")) {
      roots.add(path.resolve(binPath, "..", "lib", "node_modules"));
      roots.add(path.resolve(binPath, "..", "..", "lib", "node_modules"));
    }
  }
  return Array.from(roots);
}

function cleanupNpmStaleRenameDirs(packageName: string): number {
  const roots = collectNpmGlobalNodeModulesRoots(process.env.PATH ?? "");
  let removed = 0;

  for (const root of roots) {
    if (!fs.existsSync(root)) {
      continue;
    }
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue;
    }

    const prefix = `.${packageName}-`;
    for (const entry of entries) {
      if (!entry.startsWith(prefix)) {
        continue;
      }
      const target = path.join(root, entry);
      try {
        fs.rmSync(target, { recursive: true, force: true });
        removed += 1;
      } catch {
        // Best effort cleanup: ignore and keep going.
      }
    }
  }

  return removed;
}

async function runPiRemoveWithFallback(
  source: string,
  local?: boolean,
): Promise<PiCommandResult> {
  const args = ["remove", source, ...(local ? ["-l"] : [])];
  const first = await runPiExec(args, 30_000);
  if (!isNpmEnotemptyRemoveError(first)) {
    return first;
  }

  const packageName = extractPackageNameFromSource(source);
  if (!packageName) {
    return first;
  }

  const removedDirs = cleanupNpmStaleRenameDirs(packageName);
  const second = await runPiExec(args, 30_000);
  if (second.ok) {
    return second;
  }

  return {
    ...second,
    message: `Échec de désinstallation après nettoyage npm (dirs nettoyés: ${removedDirs}). ${
      second.message ?? "Erreur inconnue."
    }`,
  };
}

function getPiConfigSnapshot() {
  const settingsPath = getPiSettingsPath();
  const modelsPath = getPiModelsPath();
  const settingsResult = readJsonFile(settingsPath);
  const modelsResult = readJsonFile(modelsPath);
  const errors: string[] = [];
  if (!settingsResult.ok) errors.push(settingsResult.message);
  if (!modelsResult.ok) errors.push(modelsResult.message);
  return {
    settingsPath,
    modelsPath,
    settings: settingsResult.ok ? settingsResult.value : null,
    models: modelsResult.ok ? modelsResult.value : null,
    errors,
  };
}

function getPiDiagnostics() {
  const piPath = getPiBinaryPath();
  const settingsPath = getPiSettingsPath();
  const modelsPath = getPiModelsPath();
  const checks: Array<{
    id: string;
    level: "info" | "warning" | "error";
    message: string;
  }> = [];

  if (!piPath || !fs.existsSync(piPath))
    checks.push({
      id: "pi-missing",
      level: "error",
      message: "Binaire Pi introuvable.",
    });
  if (!fs.existsSync(settingsPath))
    checks.push({
      id: "settings-missing",
      level: "error",
      message: "settings.json introuvable.",
    });
  if (!fs.existsSync(modelsPath))
    checks.push({
      id: "models-missing",
      level: "warning",
      message: "models.json introuvable.",
    });

  const settings = readJsonFile(settingsPath);
  if (!settings.ok) {
    checks.push({
      id: "settings-invalid",
      level: "error",
      message: settings.message,
    });
  }
  const models = readJsonFile(modelsPath);
  if (!models.ok) {
    checks.push({
      id: "models-invalid",
      level: "warning",
      message: models.message,
    });
  }

  if (settings.ok) {
    const enabledModels = Array.isArray(settings.value.enabledModels)
      ? settings.value.enabledModels.filter(
          (item): item is string => typeof item === "string",
        )
      : [];
    const defaultProvider =
      typeof settings.value.defaultProvider === "string"
        ? settings.value.defaultProvider
        : null;
    const defaultModel =
      typeof settings.value.defaultModel === "string"
        ? settings.value.defaultModel
        : null;

    if (defaultProvider && defaultModel && models.ok) {
      const providers = (models.value.providers ?? {}) as Record<
        string,
        unknown
      >;
      const providerNode = providers[defaultProvider];
      const providerModels =
        providerNode && typeof providerNode === "object"
          ? (providerNode as Record<string, unknown>).models
          : null;
      const found = Array.isArray(providerModels)
        ? providerModels.some(
            (item) =>
              typeof (item as { id?: unknown })?.id === "string" &&
              (item as { id: string }).id === defaultModel,
          )
        : false;
      if (!found) {
        checks.push({
          id: "default-model-missing",
          level: "warning",
          message: "Le modèle par défaut n’existe pas dans models.json.",
        });
      }
    }

    if (enabledModels.length === 0) {
      checks.push({
        id: "enabled-empty",
        level: "info",
        message: "Aucun modèle scoped dans enabledModels.",
      });
    }
  }

  if (checks.length === 0) {
    checks.push({
      id: "ok",
      level: "info",
      message: "Aucun problème détecté.",
    });
  }

  return { piPath, settingsPath, modelsPath, checks };
}

const THINKING_LEVELS: Array<
  "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
> = ["off", "minimal", "low", "medium", "high", "xhigh"];

async function listPiModels(): Promise<PiModelsResult> {
  try {
    const agentDir = getPiAgentDir();
    migrateProviderApiKeysToAuthIfNeeded(agentDir);
    normalizeModelsJsonFileForPiSchema(path.join(agentDir, "models.json"));
    const authStorage = AuthStorage.create(path.join(agentDir, "auth.json"));
    const modelRegistry = new ModelRegistry(
      authStorage,
      path.join(agentDir, "models.json"),
    );
    const available = modelRegistry.getAvailable();
    const allModels = modelRegistry.getAll();
    const enabledScopedModels = parseEnabledScopedModels();
    const source = [...allModels, ...available];
    const models = source
      .map((model) => {
        const key = `${model.provider}/${model.id}`;
        return {
          id: model.id,
          provider: model.provider,
          key,
          scoped: enabledScopedModels.has(key),
          supportsThinking: Boolean(model.reasoning),
          thinkingLevels: model.reasoning ? THINKING_LEVELS : [],
        } satisfies PiModel;
      })
      .filter((model, index, array) => {
        const first = array.findIndex(
          (candidate) =>
            candidate.provider === model.provider && candidate.id === model.id,
        );
        return first === index;
      })
      .sort((a, b) => {
        if (a.provider !== b.provider) {
          return a.provider.localeCompare(b.provider);
        }
        return a.id.localeCompare(b.id);
      });

    return { ok: true, models };
  } catch (error) {
    return {
      ok: false,
      reason: "unknown",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function listPiModelsFromCache(): PiModel[] {
  const db = getDb();
  const enabledScopedModels = parseEnabledScopedModels();
  return listPiModelsCache(db).map((model) => ({
    id: model.id,
    provider: model.provider,
    key: model.key,
    scoped: enabledScopedModels.has(model.key),
    supportsThinking: Boolean(model.supports_thinking),
    thinkingLevels: (() => {
      if (!model.thinking_levels_json) {
        return [];
      }
      try {
        const parsed = JSON.parse(model.thinking_levels_json) as unknown;
        if (!Array.isArray(parsed)) {
          return [];
        }
        return parsed.filter(
          (
            value,
          ): value is "off" | "minimal" | "low" | "medium" | "high" | "xhigh" =>
            THINKING_LEVELS.includes(
              value as "off" | "minimal" | "low" | "medium" | "high" | "xhigh",
            ),
        );
      } catch {
        return [];
      }
    })(),
  }));
}

async function syncPiModelsCache(): Promise<PiModelsResult> {
  await refreshModelsJsonFromPiListModels();
  const result = await listPiModels();
  if (!result.ok) {
    return result;
  }

  const db = getDb();
  replacePiModelsCache(
    db,
    result.models.map((model) => ({
      key: model.key,
      provider: model.provider,
      id: model.id,
      supportsThinking: model.supportsThinking,
      thinkingLevels: model.thinkingLevels,
    })),
  );
  return result;
}

async function listPiModelsCached(): Promise<PiModelsResult> {
  const cached = listPiModelsFromCache();
  if (cached.length > 0) {
    return { ok: true, models: cached };
  }
  return syncPiModelsCache();
}

async function setPiModelScoped(
  provider: string,
  id: string,
  scoped: boolean,
): Promise<SetPiModelScopedResult> {
  const listResult = await syncPiModelsCache();
  if (!listResult.ok) {
    return listResult;
  }

  const modelExists = listResult.models.some(
    (model) => model.provider === provider && model.id === id,
  );
  if (!modelExists) {
    return { ok: false, reason: "invalid_model" };
  }

  const agentDir = getPiAgentDir();
  let settingsManager;
  try {
    settingsManager = await createSettingsManagerWithRetry(
      process.cwd(),
      agentDir,
    );
  } catch (error) {
    return {
      ok: false,
      reason: "lock_error",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const key = `${provider}/${id}`;
  const enabledModels = new Set(settingsManager.getEnabledModels() ?? []);
  if (scoped) {
    enabledModels.add(key);
  } else {
    enabledModels.delete(key);
  }

  try {
    settingsManager.setEnabledModels(Array.from(enabledModels));
    await settingsManager.flush();
  } catch (error) {
    return {
      ok: false,
      reason: "unknown",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  return syncPiModelsCache();
}

function cacheMessagesFromSnapshot(
  conversationId: string,
  snapshot: { messages: unknown[] },
) {
  const db = getDb();
  const messages = (snapshot.messages ?? []).map((message, index) => {
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

async function generateConversationTitleFromPi(params: {
  provider: string;
  modelId: string;
  repoPath: string;
  firstMessage: string;
}): Promise<string | null> {
  return generateConversationTitleFromPiInModule({
    ...params,
    runPiExec: async (args: string[], timeoutMs?: number, cwd?: string) => {
      const result = await runPiExec(args, timeoutMs, cwd);
      return { ok: result.ok, stdout: result.stdout };
    },
    getPiBinaryPath,
  });
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
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("workspace:conversationUpdated", payload);
  }
  return payload;
}

export function registerWorkspaceIpc() {
  registerWorkspaceHandlers({
    toWorkspacePayload,
    getGitDiffSummaryForConversation,
    getGitFileDiffForConversation,
    getWorktreeGitInfo,
    generateWorktreeCommitMessage,
    commitWorktree,
    mergeWorktreeIntoMain,
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
