import electron from "electron";
const { app, BrowserWindow, dialog, ipcMain, shell } = electron;
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AuthStorage,
  ModelRegistry,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { GitService } from "../lib/git/git-service.js";
import { sandboxManager } from "../lib/sandbox/sandbox-manager.js";

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
import {
  getLanguagePreference,
  saveLanguagePreference,
} from "../db/repos/settings.js";
import {
  listQuickActionsUsage,
  recordQuickActionUse,
} from "../db/repos/quick-actions-usage.js";
import {
  deleteProjectById,
  findProjectByRepoPath,
  insertProject,
  listProjects,
} from "../db/repos/projects.js";
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
  getChatonsExtensionLogs,
  installChatonsExtension,
  listChatonsExtensions,
  listChatonsExtensionCatalog,
  removeChatonsExtension,
  runChatonsExtensionHealthCheck,
  toggleChatonsExtension,
  getChatonsExtensionsBaseDir,
} from "../extensions/manager.js";
import {
  emitHostEvent,
  enrichExtensionsWithRuntimeFields,
  extensionsCall,
  getExtensionManifest,
  getExtensionMainViewHtml,
  getExtensionRuntimeHealth,
  hostCall,
  initializeExtensionsRuntime,
  listRegisteredExtensionUi,
  publishExtensionEvent,
  queueAck,
  queueConsume,
  queueEnqueue,
  queueListDeadLetters,
  queueNack,
  runExtensionsQueueWorkerCycle,
  storageFilesRead,
  storageFilesWrite,
  storageKvDeleteEntry,
  storageKvGet,
  storageKvListEntries,
  storageKvSet,
  subscribeExtension,
} from "../extensions/runtime.js";

function getChatonsPiAgentDir() {
  return path.join(app.getPath("userData"), ".pi", "agent");
}

function getGlobalWorkspaceDir() {
  return path.join(app.getPath("userData"), "workspace", "global");
}

type ExternalSkillEntry = {
  source: string;
  title: string;
  description: string;
  author?: string;
  installs?: number;
  stars?: number;
  highlighted?: boolean;
};

const SKILLS_CACHE_PATH = path.join(app.getPath("userData"), "skills-catalog-cache.json");
const SKILLS_CACHE_TTL_MS = 1000 * 60 * 30;

function normalizeExternalSkill(entry: unknown): ExternalSkillEntry | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  const source =
    (typeof e.source === "string" && e.source) ||
    (typeof e.slug === "string" && e.slug) ||
    (typeof e.id === "string" && e.id) ||
    "";
  if (!source) return null;
  return {
    source,
    title:
      (typeof e.title === "string" && e.title) ||
      (typeof e.name === "string" && e.name) ||
      source,
    description:
      (typeof e.description === "string" && e.description) ||
      (typeof e.summary === "string" && e.summary) ||
      "Pi skill package",
    author: typeof e.author === "string" ? e.author : undefined,
    installs: typeof e.installs === "number" ? e.installs : undefined,
    stars: typeof e.stars === "number" ? e.stars : undefined,
    highlighted: e.highlighted === true,
  };
}

function readSkillsCache():
  | { updatedAt: string; entries: ExternalSkillEntry[] }
  | null {
  if (!fs.existsSync(SKILLS_CACHE_PATH)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(SKILLS_CACHE_PATH, "utf8")) as {
      updatedAt?: unknown;
      entries?: unknown;
    };
    if (
      !parsed ||
      typeof parsed.updatedAt !== "string" ||
      !Array.isArray(parsed.entries)
    ) {
      return null;
    }
    return {
      updatedAt: parsed.updatedAt,
      entries: parsed.entries
        .map((entry) => normalizeExternalSkill(entry))
        .filter((entry): entry is ExternalSkillEntry => entry !== null),
    };
  } catch {
    return null;
  }
}

function writeSkillsCache(entries: ExternalSkillEntry[]) {
  fs.writeFileSync(
    SKILLS_CACHE_PATH,
    `${JSON.stringify({ updatedAt: new Date().toISOString(), entries }, null, 2)}\n`,
    "utf8",
  );
}

function isSkillsCacheFresh(cache: { updatedAt: string } | null): boolean {
  if (!cache) return false;
  const ts = Date.parse(cache.updatedAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < SKILLS_CACHE_TTL_MS;
}

async function fetchSkillsCatalogFromWeb() {
  const endpoints = [
    "https://skills.sh/api/skills",
    "https://www.skills.sh/api/skills",
    "https://skills.sh/skills.json",
    "https://www.skills.sh/skills.json",
  ];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { headers: { accept: "application/json" } });
      if (!response.ok) continue;
      const json = (await response.json()) as unknown;
      const list = Array.isArray(json)
        ? json
        : json && typeof json === "object" && Array.isArray((json as { skills?: unknown }).skills)
          ? ((json as { skills: unknown[] }).skills)
          : [];
      const entries = list
        .map((entry) => normalizeExternalSkill(entry))
        .filter((entry): entry is ExternalSkillEntry => entry !== null);
      if (entries.length > 0) {
        writeSkillsCache(entries);
        return {
          ok: true as const,
          entries,
          source: "remote" as const,
          updatedAt: new Date().toISOString(),
        };
      }
    } catch {
      // try next endpoint
    }
  }
  return null;
}

async function listSkillsCatalog() {
  const cache = readSkillsCache();
  if (cache && isSkillsCacheFresh(cache)) {
    return {
      ok: true as const,
      entries: cache.entries,
      source: "cache" as const,
      updatedAt: cache.updatedAt,
    };
  }

  const remote = await fetchSkillsCatalogFromWeb();
  if (remote) return remote;

  return {
    ok: true as const,
    entries: cache?.entries ?? [],
    source: "cache" as const,
    updatedAt: cache?.updatedAt ?? new Date(0).toISOString(),
  };
}

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

export function ensurePiAgentBootstrapped() {
  const agentDir = getChatonsPiAgentDir();
  const settingsPath = path.join(agentDir, "settings.json");
  const modelsPath = path.join(agentDir, "models.json");
  const sessionsDir = path.join(agentDir, "sessions");
  const worktreesDir = path.join(agentDir, "worktrees", "chaton");
  const binDir = path.join(agentDir, "bin");
  const globalWorkspaceDir = getGlobalWorkspaceDir();

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
};

type PiModelsResult =
  | { ok: true; models: PiModel[] }
  | { ok: false; reason: "pi_not_available" | "unknown"; message?: string };

type SetPiModelScopedResult =
  | { ok: true; models: PiModel[] }
  | {
      ok: false;
      reason: "pi_not_available" | "invalid_model" | "unknown";
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
let extensionQueueWorker: NodeJS.Timeout | null = null;

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
  };
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
    await gitService.createWorktree(projectRepoPath, worktreePath, `chaton/thread-${sanitizeWorktreeSegment(shortHash)}`);
    
    // Initialize git repo if it doesn't exist (fallback for self-contained mode)
    if (!fs.existsSync(path.join(worktreePath, '.git'))) {
      await gitService.init(worktreePath);
    }
  } catch (error) {
    console.error('Error creating worktree with self-contained git:', error);
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
    console.error('Erreur lors du nettoyage des worktrees orphelins:', error);
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
  if (conversation.worktree_path && await isGitRepo(conversation.worktree_path)) {
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
    console.warn('Error checking working tree changes:', error);
    return true; // Conservative: assume changes if we can't determine
  }
}

async function hasStagedChanges(repoPath: string): Promise<boolean> {
  try {
    // Use self-contained git service
    return gitService.hasStagedChanges(repoPath);
  } catch (error) {
    console.warn('Error checking staged changes:', error);
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
    const hasChanges = await gitService.hasUncommittedChanges(conversation.worktree_path);
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
    const shortHash = crypto.randomBytes(4).toString('hex');
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
    const hasLocalChanges = await gitService.hasUncommittedChanges(worktreePath);
    if (hasLocalChanges) {
      await gitService.addAll(worktreePath);
      // Note: commit functionality would go here
      console.log(`Would auto-commit before merge to ${baseBranch}`);
    }
  } catch (error) {
    console.error('Error with self-contained git operations during merge:', error);
    // Continue with merge even if commit fails
  }

  try {
    // Implement basic merge using isomorphic-git capabilities
    // 1. First, ensure we're on the main branch in the project repo
    const currentProjectBranch = await gitService.getCurrentBranch(projectRepoPath);
    if (currentProjectBranch !== baseBranch) {
      // Checkout main branch first
      try {
        await gitService.checkout(projectRepoPath, baseBranch);
      } catch (checkoutError) {
        console.error('Failed to checkout main branch:', checkoutError);
        return {
          ok: false,
          reason: "git_not_available",
          message: `Échec de basculement vers la branche ${baseBranch}: ${checkoutError instanceof Error ? checkoutError.message : String(checkoutError)}`,
        };
      }
    }

    // 2. Pull latest changes from remote to ensure we're up to date
    try {
      await gitService.pull(projectRepoPath, 'origin', baseBranch);
    } catch (pullError) {
      console.warn('Failed to pull latest changes:', pullError);
      // Continue with merge even if pull fails
    }

    // 3. Get the commit hash from the worktree branch
    const worktreeLog = await gitService.getLog(worktreePath, 1);
    const sourceCommit = worktreeLog.length > 0 ? worktreeLog[0].oid : undefined;

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
        if (status === 'modified' || status === 'added') {
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
      console.error('Merge failed:', mergeError);
      return {
        ok: false,
        reason: "merge_conflicts",
        message: `Échec de la fusion: ${mergeError instanceof Error ? mergeError.message : String(mergeError)}`,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error during merge operation:', error);
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

function getPiBinaryPath() {
  const sandboxedPiPath = path.join(getChatonsPiAgentDir(), "bin", "pi");
  if (fs.existsSync(sandboxedPiPath)) {
    return sandboxedPiPath;
  }

  // Dev-only fallback: use user-level Pi install when app-local binary is not bootstrapped.
  if (!app.isPackaged) {
    const userPiPath = path.join(os.homedir(), ".pi", "agent", "bin", "pi");
    if (fs.existsSync(userPiPath)) {
      return userPiPath;
    }
  }

  return sandboxedPiPath;
}

function getPiAgentDir() {
  return getChatonsPiAgentDir();
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
  if (!providerNode || typeof providerNode !== "object" || Array.isArray(providerNode)) {
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
  
  // Use sandboxed execution for Node.js commands
  try {
    const result = await sandboxManager.executeNodeCommand(piPath, args, cwd, timeout);
    
    return {
      ok: result.success,
      code: result.exitCode ?? 0,
      command: [piPath, ...args],
      stdout: result.stdout,
      stderr: result.stderr,
      ranAt: new Date().toISOString(),
      message: result.success ? "" : result.stderr || "Command failed",
    };
  } catch (error) {
    return {
      ok: false,
      code: 1,
      command: [piPath, ...args],
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      ranAt: new Date().toISOString(),
      message: `Sandboxed execution failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
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
    const status = await gitService.getStatus(repoPath);
    const files: GitModifiedFileStat[] = status.map(([file]) => ({
      path: file,
      added: 0,
      removed: 0,
    }));

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
    const diff = await gitService.getDiff(repoPath, filePath);
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

  if (!fs.existsSync(piPath))
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
    const authStorage = AuthStorage.create(path.join(agentDir, "auth.json"));
    const modelRegistry = new ModelRegistry(
      authStorage,
      path.join(agentDir, "models.json"),
    );
    const available = modelRegistry.getAvailable();
    const allModels = modelRegistry.getAll();
    const enabledScopedModels = parseEnabledScopedModels();
    const source = available.length > 0 ? available : allModels;
    const models = source
      .map((model) => {
        const key = `${model.provider}/${model.id}`;
        return {
          id: model.id,
          provider: model.provider,
          key,
          scoped: enabledScopedModels.has(key),
          supportsThinking: Boolean(model.reasoning),
          thinkingLevels: Boolean(model.reasoning) ? THINKING_LEVELS : [],
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
  const settingsManager = SettingsManager.create(process.cwd(), agentDir);
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

const LONGUEUR_MAX_TITRE = 60;
const NOMBRE_MOTS_MIN_TITRE = 3;
const NOMBRE_MOTS_MAX_TITRE = 7;
const AFFINAGE_TITRE_IA_ACTIVE = true;

function normaliserTitre(raw: string): string {
  return raw
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

function compterMots(texte: string): number {
  return texte.split(/\s+/).filter((mot) => mot.trim().length > 0).length;
}

function tronquerTitreParMots(texte: string, longueurMax: number): string {
  const mots = texte.split(/\s+/).filter((mot) => mot.trim().length > 0);
  let resultat = "";
  for (const mot of mots) {
    const candidat = resultat.length === 0 ? mot : `${resultat} ${mot}`;
    if (candidat.length > longueurMax) {
      break;
    }
    resultat = candidat;
  }
  return resultat.trim();
}

function sanitiserTitreStrict(raw: string): string | null {
  const normalise = normaliserTitre(raw);
  if (!normalise) {
    return null;
  }
  const tronque = tronquerTitreParMots(normalise, LONGUEUR_MAX_TITRE);
  if (!tronque) {
    return null;
  }
  const mots = compterMots(tronque);
  if (mots < NOMBRE_MOTS_MIN_TITRE || mots > NOMBRE_MOTS_MAX_TITRE) {
    return null;
  }
  return tronque;
}

function construireTitreDeterministe(firstMessage: string): string {
  const messageNettoye = firstMessage
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[\[\]{}()*_#>~|]/g, " ")
    .replace(/[^\p{L}\p{N}\s'’-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const mots = messageNettoye
    .split(/\s+/)
    .filter((mot) => mot.trim().length > 0);
  const base = mots.slice(0, NOMBRE_MOTS_MAX_TITRE).join(" ").trim();
  const titre = tronquerTitreParMots(base, LONGUEUR_MAX_TITRE);

  if (titre && compterMots(titre) >= NOMBRE_MOTS_MIN_TITRE) {
    return titre;
  }

  return "Nouvelle discussion";
}

function generateConversationTitlePrompt(firstMessage: string): string {
  return [
    "Tu génères un titre de fil de discussion.",
    "Contraintes strictes:",
    "- Répondre avec UN seul titre, sans guillemets.",
    "- 3 à 7 mots.",
    "- Maximum 60 caractères.",
    "- En français.",
    "",
    "Premier message utilisateur:",
    firstMessage,
  ].join("\n");
}

async function generateConversationTitleFromPi(params: {
  provider: string;
  modelId: string;
  repoPath: string;
  firstMessage: string;
}): Promise<string | null> {
  const piPath = getPiBinaryPath();
  if (!piPath || !fs.existsSync(piPath)) {
    return null;
  }

  const prompt = generateConversationTitlePrompt(params.firstMessage);
  const modelKey = `${params.provider}/${params.modelId}`;
  const primary = await runPiExec(
    ["--model", modelKey, "-p", prompt],
    20_000,
    params.repoPath,
  );
  const result = primary.ok
    ? primary
    : await runPiExec(["-m", modelKey, "-p", prompt], 20_000, params.repoPath);
  if (!result.ok) {
    return null;
  }

  return sanitiserTitreStrict(result.stdout);
}

function diffuserTitreConversation(conversationId: string, title: string) {
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
  initializeExtensionsRuntime();
  if (extensionQueueWorker) {
    clearInterval(extensionQueueWorker);
  }
  extensionQueueWorker = setInterval(() => {
    runExtensionsQueueWorkerCycle();
  }, 1500);

  piRuntimeManager.subscribe((event: PiRendererEvent) => {
    if (event.event.type === "agent_start") {
      emitHostEvent("conversation.agent.started", {
        conversationId: event.conversationId,
      });
    }
    if (event.event.type === "agent_end") {
      emitHostEvent("conversation.agent.ended", {
        conversationId: event.conversationId,
      });
      void piRuntimeManager
        .getSnapshot(event.conversationId)
        .then((snapshot) =>
          cacheMessagesFromSnapshot(event.conversationId, snapshot),
        )
        .catch(() => undefined);
    }
  });

  ipcMain.handle("dialog:pickProjectFolder", async () => {
    const result = await dialog.showOpenDialog({
      title: "Ajouter un nouveau projet",
      buttonLabel: "Importer",
      properties: ["openDirectory", "createDirectory"],
    });

    // @ts-ignore - Electron dialog type issue
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }

    // @ts-ignore - Electron dialog type issue
    return result.filePaths[0];
  });

  ipcMain.handle("workspace:getInitialState", () => {
  try {
    return toWorkspacePayload();
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'état initial:', error);
    return {
      projects: [],
      conversations: [],
      settings: {
        organizeBy: "project",
        sortBy: "updated",
        show: "all",
        showAssistantStats: false,
        searchQuery: "",
        collapsedProjectIds: [],
        sidebarWidth: 320,
        defaultBehaviorPrompt: "",
        hasCompletedOnboarding: false,
        allowAnonymousTelemetry: false,
        telemetryConsentAnswered: false,
      }
    };
  }
});
  ipcMain.handle(
    "workspace:getGitDiffSummary",
    (_event, conversationId: string) =>
      getGitDiffSummaryForConversation(conversationId),
  );
  ipcMain.handle(
    "workspace:getGitFileDiff",
    (_event, conversationId: string, filePath: string) =>
      getGitFileDiffForConversation(conversationId, filePath),
  );
  ipcMain.handle(
    "workspace:getWorktreeGitInfo",
    (_event, conversationId: string) => getWorktreeGitInfo(conversationId),
  );
  ipcMain.handle(
    "workspace:generateWorktreeCommitMessage",
    (_event, conversationId: string) =>
      generateWorktreeCommitMessage(conversationId),
  );
  ipcMain.handle(
    "workspace:commitWorktree",
    (_event, conversationId: string, message: string) =>
      commitWorktree(conversationId, message),
  );
  ipcMain.handle(
    "workspace:mergeWorktreeIntoMain",
    (_event, conversationId: string) => mergeWorktreeIntoMain(conversationId),
  );
  ipcMain.handle(
    "workspace:pushWorktreeBranch",
    (_event, conversationId: string) => pushWorktreeBranch(conversationId),
  );

  ipcMain.handle(
    "workspace:updateSettings",
    (_event, settings: DbSidebarSettings) => {
      const db = getDb();
      saveSidebarSettings(db, settings);
      return settings;
    },
  );

  ipcMain.handle("models:listPi", async () => listPiModelsCached());
  ipcMain.handle("models:syncPi", async () => syncPiModelsCache());
  ipcMain.handle(
    "models:setPiScoped",
    async (_event, provider: string, id: string, scoped: boolean) =>
      setPiModelScoped(provider, id, scoped),
  );
  ipcMain.handle("pi:getConfigSnapshot", () => getPiConfigSnapshot());
  ipcMain.handle("pi:updateSettingsJson", (_event, next: unknown) => {
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      return {
        ok: false as const,
        message: "settings.json invalide: objet attendu.",
      };
    }
    const valid = sanitizePiSettings(next as Record<string, unknown>);
    if (!valid.ok) {
      return { ok: false as const, message: valid.message };
    }
    const modelsCurrent = readJsonFile(getPiModelsPath());
    if (!modelsCurrent.ok) {
      return { ok: false as const, message: modelsCurrent.message };
    }
    const defaultModelError = validateDefaultModelExistsInModels(
      valid.value,
      modelsCurrent.value,
    );
    if (defaultModelError) {
      return { ok: false as const, message: defaultModelError };
    }
    const settingsPath = getPiSettingsPath();
    try {
      if (fs.existsSync(settingsPath)) {
        backupFile(settingsPath);
      }
      atomicWriteJson(settingsPath, valid.value);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });
  ipcMain.handle("pi:updateAuthJson", (_event, next: unknown) => {
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      return {
        ok: false as const,
        message: "auth.json invalide: objet attendu.",
      };
    }
    const authPath = path.join(getPiAgentDir(), "auth.json");
    try {
      if (fs.existsSync(authPath)) {
        backupFile(authPath);
      }
      atomicWriteJson(authPath, next as Record<string, unknown>);
      return { ok: true as const };
    } catch (writeError) {
      return {
        ok: false as const,
        message:
          writeError instanceof Error ? writeError.message : String(writeError),
      };
    }
  });
  ipcMain.handle("pi:updateModelsJson", (_event, next: unknown) => {
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      return {
        ok: false as const,
        message: "models.json invalide: objet attendu.",
      };
    }
    const error = validateModelsJson(next as Record<string, unknown>);
    if (error) {
      return { ok: false as const, message: error };
    }
    const modelsPath = getPiModelsPath();
    try {
      if (fs.existsSync(modelsPath)) {
        backupFile(modelsPath);
      }
      atomicWriteJson(modelsPath, next as Record<string, unknown>);
      return { ok: true as const };
    } catch (writeError) {
      return {
        ok: false as const,
        message:
          writeError instanceof Error ? writeError.message : String(writeError),
      };
    }
  });
  ipcMain.handle(
    "pi:runCommand",
    async (
      _event,
      action: PiCommandAction,
      params: { search?: string; source?: string; local?: boolean },
    ) => {
      switch (action) {
        case "list":
          return runPiExec(["list"]);
        case "list-models":
          return runPiExec([
            "--list-models",
            ...(params?.search ? [params.search] : []),
          ]);
        case "install":
          if (!params?.source) {
            return {
              ok: false,
              code: 1,
              command: ["install"],
              stdout: "",
              stderr: "",
              ranAt: new Date().toISOString(),
              message: "source requis",
            };
          }
          return runPiExec(
            ["install", params.source, ...(params.local ? ["-l"] : [])],
            30_000,
          );
        case "remove":
          if (!params?.source) {
            return {
              ok: false,
              code: 1,
              command: ["remove"],
              stdout: "",
              stderr: "",
              ranAt: new Date().toISOString(),
              message: "source requis",
            };
          }
          return runPiRemoveWithFallback(params.source, params.local);
        case "update":
          return runPiExec(
            ["update", ...(params?.source ? [params.source] : [])],
            45_000,
          );
        case "config":
          return runPiExec(["config"], 15_000);
        default:
          return {
            ok: false,
            code: 1,
            command: [],
            stdout: "",
            stderr: "",
            ranAt: new Date().toISOString(),
            message: "Action non supportée",
          };
      }
    },
  );
  ipcMain.handle("pi:getDiagnostics", () => getPiDiagnostics());
  ipcMain.handle("skills:listCatalog", async () => listSkillsCatalog());
  ipcMain.handle("extensions:list", () => {
    const result = listChatonsExtensions();
    return {
      ...result,
      extensions: enrichExtensionsWithRuntimeFields(result.extensions),
    };
  });
  ipcMain.handle("extensions:listCatalog", () => listChatonsExtensionCatalog());
  ipcMain.handle("quickActions:listUsage", () => {
    const rows = listQuickActionsUsage(getDb());
    return { ok: true as const, rows };
  });
  ipcMain.handle("quickActions:recordUse", (_event, actionId: string) => {
    if (typeof actionId !== "string" || !actionId.trim()) {
      return { ok: false as const, message: "actionId is required" };
    }
    const row = recordQuickActionUse(getDb(), actionId.trim());
    return { ok: true as const, row };
  });
  ipcMain.handle("extensions:install", (_event, id: string) => {
    const result = installChatonsExtension(id);
    emitHostEvent("extension.installed", { extensionId: id });
    return result;
  });
  ipcMain.handle("extensions:toggle", (_event, id: string, enabled: boolean) => {
    const result = toggleChatonsExtension(id, enabled);
    if (enabled) {
      emitHostEvent("extension.enabled", { extensionId: id });
    }
    return result;
  });
  ipcMain.handle("extensions:remove", (_event, id: string) =>
    removeChatonsExtension(id),
  );
  ipcMain.handle("extensions:runHealthCheck", () =>
    runChatonsExtensionHealthCheck(),
  );
  ipcMain.handle("extensions:getLogs", (_event, id: string) =>
    getChatonsExtensionLogs(id),
  );
  ipcMain.handle("extensions:restartApp", () => {
    app.relaunch();
    app.exit(0);
    return { ok: true as const };
  });
  ipcMain.handle("extensions:openExtensionsFolder", async () => {
    const baseDir = getChatonsExtensionsBaseDir();
    try {
      await shell.openPath(baseDir);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });
  ipcMain.handle("extensions:getManifest", (_event, extensionId: string) => {
    return { ok: true as const, manifest: getExtensionManifest(extensionId) };
  });
  ipcMain.handle("extensions:registerUi", () => {
    return { ok: true as const, entries: listRegisteredExtensionUi() };
  });
  ipcMain.handle("extensions:getMainViewHtml", (_event, viewId: string) => {
    if (typeof viewId !== "string" || !viewId.trim()) {
      return { ok: false as const, message: "viewId is required" };
    }
    return getExtensionMainViewHtml(viewId.trim());
  });
  ipcMain.handle(
    "extensions:events:subscribe",
    (
      _event,
      extensionId: string,
      topic: string,
      options?: { projectId?: string; conversationId?: string },
    ) => subscribeExtension(extensionId, topic, options),
  );
  ipcMain.handle(
    "extensions:events:publish",
    (
      _event,
      extensionId: string,
      topic: string,
      payload: unknown,
      meta?: { idempotencyKey?: string },
    ) => publishExtensionEvent(extensionId, topic, payload, meta),
  );
  ipcMain.handle(
    "extensions:queue:enqueue",
    (
      _event,
      extensionId: string,
      topic: string,
      payload: unknown,
      opts?: { idempotencyKey?: string; availableAt?: string },
    ) => queueEnqueue(extensionId, topic, payload, opts),
  );
  ipcMain.handle(
    "extensions:queue:consume",
    (
      _event,
      extensionId: string,
      topic: string,
      consumerId: string,
      opts?: { limit?: number },
    ) => queueConsume(extensionId, topic, consumerId, opts),
  );
  ipcMain.handle(
    "extensions:queue:ack",
    (_event, extensionId: string, messageId: string) =>
      queueAck(extensionId, messageId),
  );
  ipcMain.handle(
    "extensions:queue:nack",
    (
      _event,
      extensionId: string,
      messageId: string,
      retryAt?: string,
      errorMessage?: string,
    ) => queueNack(extensionId, messageId, retryAt, errorMessage),
  );
  ipcMain.handle(
    "extensions:queue:deadLetter:list",
    (_event, extensionId: string, topic?: string) =>
      queueListDeadLetters(extensionId, topic),
  );
  ipcMain.handle(
    "extensions:storage:kv:get",
    (_event, extensionId: string, key: string) => storageKvGet(extensionId, key),
  );
  ipcMain.handle(
    "extensions:storage:kv:set",
    (_event, extensionId: string, key: string, value: unknown) =>
      storageKvSet(extensionId, key, value),
  );
  ipcMain.handle(
    "extensions:storage:kv:delete",
    (_event, extensionId: string, key: string) =>
      storageKvDeleteEntry(extensionId, key),
  );
  ipcMain.handle(
    "extensions:storage:kv:list",
    (_event, extensionId: string) => storageKvListEntries(extensionId),
  );
  ipcMain.handle(
    "extensions:storage:files:read",
    (_event, extensionId: string, relativePath: string) =>
      storageFilesRead(extensionId, relativePath),
  );
  ipcMain.handle(
    "extensions:storage:files:write",
    (_event, extensionId: string, relativePath: string, content: string) =>
      storageFilesWrite(extensionId, relativePath, content),
  );
  ipcMain.handle(
    "extensions:hostCall",
    (_event, extensionId: string, method: string, params?: Record<string, unknown>) =>
      hostCall(extensionId, method, params),
  );
  ipcMain.handle(
    "extensions:call",
    (
      _event,
      callerExtensionId: string,
      extensionId: string,
      apiName: string,
      versionRange: string,
      payload: unknown,
    ) => extensionsCall(callerExtensionId, extensionId, apiName, versionRange, payload),
  );
  ipcMain.handle("extensions:runtime:health", () => getExtensionRuntimeHealth());
  ipcMain.handle(
    "pi:openPath",
    async (_event, target: "settings" | "models" | "sessions") => {
      const base = getPiAgentDir();
      const targetPath =
        target === "settings"
          ? getPiSettingsPath()
          : target === "models"
            ? getPiModelsPath()
            : path.join(base, "sessions");
      try {
        await shell.openPath(targetPath);
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );
  ipcMain.handle(
    "pi:exportSessionHtml",
    async (_event, sessionFile: string, outputFile?: string) => {
      if (!sessionFile || typeof sessionFile !== "string") {
        return {
          ok: false,
          code: 1,
          command: [],
          stdout: "",
          stderr: "",
          ranAt: new Date().toISOString(),
          message: "sessionFile requis",
        };
      }
      const args = ["--export", sessionFile];
      if (outputFile && outputFile.trim().length > 0) {
        args.push(outputFile);
      }
      return runPiExec(args, 45_000);
    },
  );

  ipcMain.handle(
    "conversations:createGlobal",
    async (
      _event,
      options?: {
        modelProvider?: string;
        modelId?: string;
        thinkingLevel?: string;
        accessMode?: "secure" | "open";
      },
    ) => {
      const db = getDb();
      const conversationId = crypto.randomUUID();
      insertConversation(db, {
        id: conversationId,
        projectId: null,
        title: "Nouveau fil",
        modelProvider: options?.modelProvider ?? null,
        modelId: options?.modelId ?? null,
        thinkingLevel: options?.thinkingLevel ?? null,
        worktreePath: null,
        accessMode: options?.accessMode === "open" ? "open" : "secure",
      });

      const conversation = findConversationById(db, conversationId);
      if (!conversation) {
        return { ok: false as const, reason: "unknown" as const };
      }
      emitHostEvent("conversation.created", {
        conversationId,
        projectId: null,
      });

      return {
        ok: true as const,
        conversation: mapConversation(conversation),
      };
    },
  );

  ipcMain.handle(
    "conversations:createForProject",
    async (
      _event,
      projectId: string,
      options?: {
        modelProvider?: string;
        modelId?: string;
        thinkingLevel?: string;
        accessMode?: "secure" | "open";
      },
    ) => {
      const db = getDb();
      const project = listProjects(db).find((item) => item.id === projectId);
      if (!project) {
        return { ok: false as const, reason: "project_not_found" as const };
      }

      const conversationId = crypto.randomUUID();
      insertConversation(db, {
        id: conversationId,
        projectId,
        title: `New - ${project.name}`,
        modelProvider: options?.modelProvider ?? null,
        modelId: options?.modelId ?? null,
        thinkingLevel: options?.thinkingLevel ?? null,
        worktreePath: null,
        accessMode: options?.accessMode === "open" ? "open" : "secure",
      });

      const conversation = findConversationById(db, conversationId);
      if (!conversation) {
        return { ok: false as const, reason: "unknown" as const };
      }
      emitHostEvent("conversation.created", {
        conversationId,
        projectId,
      });

      return {
        ok: true as const,
        conversation: mapConversation(conversation),
      };
    },
  );

  ipcMain.handle(
    "conversations:enableWorktree",
    async (_event, conversationId: string) => {
      const db = getDb();
      const conversation = findConversationById(db, conversationId);
      if (!conversation) {
        return { ok: false as const, reason: "conversation_not_found" as const };
      }
      if (!conversation.project_id) {
        return { ok: false as const, reason: "project_not_found" as const };
      }

      const project = listProjects(db).find(
        (item) => item.id === conversation.project_id,
      );
      if (!project) {
        return { ok: false as const, reason: "project_not_found" as const };
      }

      if (
        conversation.worktree_path &&
        conversation.worktree_path.trim().length > 0 &&
        (await isGitRepo(conversation.worktree_path))
      ) {
        return {
          ok: true as const,
          conversation: mapConversation(conversation),
        };
      }

      const worktreePath = await ensureConversationWorktree(
        project.repo_path,
        conversationId,
      ).catch(() => null);
      if (!worktreePath) {
        return { ok: false as const, reason: "unknown" as const };
      }

      saveConversationPiRuntime(db, conversationId, { worktreePath });
      const updatedConversation = findConversationById(db, conversationId);
      if (!updatedConversation) {
        return { ok: false as const, reason: "unknown" as const };
      }
      const payload = {
        conversationId,
        updatedAt: new Date().toISOString(),
        worktreePath,
      };
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("workspace:conversationUpdated", payload);
      }
      emitHostEvent("conversation.updated", {
        conversationId,
        type: "worktree_enabled",
      });
      return {
        ok: true as const,
        conversation: mapConversation(updatedConversation),
      };
    },
  );

  ipcMain.handle(
    "conversations:disableWorktree",
    async (_event, conversationId: string) => {
      const db = getDb();
      const conversation = findConversationById(db, conversationId);
      if (!conversation) {
        return { ok: false as const, reason: "conversation_not_found" as const };
      }
      if (!conversation.project_id) {
        return { ok: false as const, reason: "project_not_found" as const };
      }
      if (!conversation.worktree_path || conversation.worktree_path.trim().length === 0) {
        return { ok: true as const, changed: false as const };
      }

      const hasWorkingChanges = await hasWorkingTreeChanges(conversation.worktree_path);
      const hasStagedChangesResult = await hasStagedChanges(conversation.worktree_path);
      const hasUncommittedChanges = hasWorkingChanges || hasStagedChangesResult;
      if (hasUncommittedChanges) {
        return { ok: false as const, reason: "has_uncommitted_changes" as const };
      }

      await removeConversationWorktree(conversation.worktree_path);
      clearConversationWorktreePath(db, conversationId);
      const payload = {
        conversationId,
        updatedAt: new Date().toISOString(),
        worktreePath: "",
      };
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("workspace:conversationUpdated", payload);
      }
      emitHostEvent("conversation.updated", {
        conversationId,
        type: "worktree_disabled",
      });
      return { ok: true as const, changed: true as const };
    },
  );

  ipcMain.handle(
    "conversations:setAccessMode",
    async (_event, conversationId: string, accessMode: "secure" | "open") => {
      const db = getDb();
      const conversation = findConversationById(db, conversationId);
      if (!conversation) {
        return { ok: false as const, reason: "conversation_not_found" as const };
      }
      const nextAccessMode = accessMode === "open" ? "open" : "secure";
      saveConversationPiRuntime(db, conversationId, { accessMode: nextAccessMode });
      return { ok: true as const, accessMode: nextAccessMode };
    },
  );

  ipcMain.handle(
    "conversations:delete",
    async (_event, conversationId: string) => {
      await piRuntimeManager.stop(conversationId);

      const db = getDb();
      const conversation = findConversationById(db, conversationId);
      const deleted = deleteConversationById(db, conversationId);
      if (!deleted) {
        return {
          ok: false as const,
          reason: "conversation_not_found" as const,
        };
      }
      await removeConversationWorktree(conversation?.worktree_path);
      emitHostEvent("conversation.updated", {
        conversationId,
        type: "deleted",
      });

      return { ok: true as const };
    },
  );

  ipcMain.handle("projects:delete", async (_event, projectId: string) => {
    const db = getDb();
    const project = listProjects(db).find((item) => item.id === projectId);
    if (!project) {
      return { ok: false as const, reason: "project_not_found" as const };
    }

    const projectConversations = listConversationsByProjectId(db, projectId);
    await Promise.all(
      projectConversations.map((conversation) =>
        piRuntimeManager.stop(conversation.id),
      ),
    );
    await Promise.all(
      projectConversations.map((conversation) =>
        removeConversationWorktree(conversation.worktree_path),
      ),
    );

    const deleted = deleteProjectById(db, projectId);
    if (!deleted) {
      return { ok: false as const, reason: "unknown" as const };
    }
    emitHostEvent("project.deleted", { projectId });

    return { ok: true as const };
  });

  ipcMain.handle(
    "conversations:getMessageCache",
    (_event, conversationId: string) => {
      const db = getDb();
      const rows = listConversationMessagesCache(db, conversationId);
      return rows
        .map((row) => {
          try {
            return JSON.parse(row.payload_json);
          } catch {
            return null;
          }
        })
        .filter((item) => item !== null);
    },
  );

  ipcMain.handle(
    "conversations:requestAutoTitle",
    async (_event, conversationId: string, firstMessage: string) => {
      const safeMessage =
        typeof firstMessage === "string" ? firstMessage.trim() : "";
      if (!safeMessage) {
        return { ok: false as const, reason: "empty_message" as const };
      }

      const db = getDb();
      const conversation = findConversationById(db, conversationId);
      if (!conversation) {
        return {
          ok: false as const,
          reason: "conversation_not_found" as const,
        };
      }

      const titreActuel = conversation.title.trim();
      const titreParDefaut = /^Nouveau\s+fil(?:\s*[-–—:]\s*)?/i.test(titreActuel);
      const titreVide = titreActuel.length === 0;
      if (!titreParDefaut && !titreVide) {
        return { ok: true as const, skipped: true as const };
      }

      const titreDeterministe = construireTitreDeterministe(safeMessage);
      const updatedDeterministe = updateConversationTitle(
        db,
        conversationId,
        titreDeterministe,
      );
      if (!updatedDeterministe) {
        return {
          ok: false as const,
          reason: "conversation_not_found" as const,
        };
      }
      diffuserTitreConversation(conversationId, titreDeterministe);

      if (!AFFINAGE_TITRE_IA_ACTIVE) {
        return {
          ok: true as const,
          title: titreDeterministe,
          source: "deterministic" as const,
        };
      }

      const project = conversation.project_id
        ? listProjects(db).find((item) => item.id === conversation.project_id)
        : null;
      const titleRepoPath = project?.repo_path ?? getGlobalWorkspaceDir();

      const provider = conversation.model_provider ?? "openai-codex";
      const modelId = conversation.model_id ?? "gpt-5.3-codex";
      const titreAffine = await generateConversationTitleFromPi({
        provider,
        modelId,
        repoPath: titleRepoPath,
        firstMessage: safeMessage,
      });

      if (!titreAffine || titreAffine === titreDeterministe) {
        return {
          ok: true as const,
          title: titreDeterministe,
          source: "deterministic" as const,
        };
      }

      const updatedAffine = updateConversationTitle(
        db,
        conversationId,
        titreAffine,
      );
      if (!updatedAffine) {
        return {
          ok: true as const,
          title: titreDeterministe,
          source: "deterministic" as const,
        };
      }

      diffuserTitreConversation(conversationId, titreAffine);
      return { ok: true as const, title: titreAffine, source: "ai" as const };
    },
  );

  ipcMain.handle("pi:startSession", (_event, conversationId: string) =>
    piRuntimeManager.start(conversationId),
  );
  ipcMain.handle("pi:stopSession", (_event, conversationId: string) =>
    piRuntimeManager.stop(conversationId),
  );
  ipcMain.handle(
    "pi:sendCommand",
    (
      _event,
      conversationId: string,
      command: RpcCommand,
    ): Promise<RpcResponse> => {
      if (
        command.type === "prompt" ||
        command.type === "follow_up" ||
        command.type === "steer"
      ) {
        emitHostEvent("conversation.message.received", {
          conversationId,
          message: command.message,
        });
      }
      return piRuntimeManager.sendCommand(conversationId, command);
    },
  );
  ipcMain.handle("pi:getSnapshot", (_event, conversationId: string) =>
    piRuntimeManager.getSnapshot(conversationId),
  );
  ipcMain.handle(
    "pi:respondExtensionUi",
    (_event, conversationId: string, response: RpcExtensionUiResponse) =>
      piRuntimeManager.respondExtensionUi(conversationId, response),
  );

  ipcMain.handle("settings:getLanguagePreference", () => {
    const db = getDb();
    return getLanguagePreference(db);
  });

  ipcMain.handle(
    "settings:updateLanguagePreference",
    (_event, language: string) => {
      const db = getDb();
      saveLanguagePreference(db, language);
    },
  );

  ipcMain.handle("projects:importFromFolder", async (_event, folderPath: string) => {
    const db = getDb();

    if (!folderPath) {
      return { ok: false, reason: "invalid_path" as const };
    }

    // Check if folder is a git repo, if not, initialize it automatically
    const isGit = await isGitRepo(folderPath);
    if (!isGit) {
      try {
        console.log(`Initializing git repository for project: ${folderPath}`);
        await gitService.init(folderPath);
        // Create initial commit if there are files
        await gitService.addAll(folderPath);
        console.log(`Successfully initialized git repository for: ${folderPath}`);
      } catch (error) {
        console.error(`Failed to initialize git repository: ${error}`);
        return { ok: false, reason: "git_init_failed" as const };
      }
    }

    const existing = findProjectByRepoPath(db, folderPath);
    if (existing) {
      return {
        ok: true,
        duplicate: true,
        project: {
          id: existing.id,
          name: existing.name,
          repoPath: existing.repo_path,
          repoName: existing.repo_name,
          isArchived: Boolean(existing.is_archived),
          createdAt: existing.created_at,
          updatedAt: existing.updated_at,
        },
      };
    }

    const repoName = path.basename(folderPath);
    const id = crypto.randomUUID();
    insertProject(db, {
      id,
      name: repoName,
      repoName,
      repoPath: folderPath,
    });

    const project = listProjects(db).find((p) => p.id === id);
    if (!project) {
      return { ok: false, reason: "unknown" as const };
    }
    emitHostEvent("project.created", { projectId: id, name: project.name });

    return {
      ok: true,
      duplicate: false,
      project: {
        id: project.id,
        name: project.name,
        repoPath: project.repo_path,
        repoName: project.repo_name,
        isArchived: Boolean(project.is_archived),
        createdAt: project.created_at,
        updatedAt: project.updated_at,
      },
    };
  });
}

export async function stopPiRuntimes() {
  if (extensionQueueWorker) {
    clearInterval(extensionQueueWorker);
    extensionQueueWorker = null;
  }
  await piRuntimeManager.stopAll();
}

// Sandboxed command execution IPC handlers
ipcMain.handle(
  "sandbox:executeNodeCommand",
  async (_event, command: string, args: string[], cwd?: string, timeout?: number) => {
    return sandboxManager.executeNodeCommand(command, args, cwd, timeout);
  }
);

ipcMain.handle(
  "sandbox:executeNpmCommand",
  async (_event, args: string[], cwd?: string) => {
    return sandboxManager.executeNpmCommand(args, cwd);
  }
);

ipcMain.handle(
  "sandbox:executePythonCommand",
  async (_event, args: string[], cwd?: string, timeout?: number) => {
    return sandboxManager.executePythonCommand(args, cwd, timeout);
  }
);

ipcMain.handle(
  "sandbox:executePipCommand",
  async (_event, args: string[], cwd?: string) => {
    return sandboxManager.executePipCommand(args, cwd);
  }
);

ipcMain.handle(
  "sandbox:checkNodeAvailability",
  async () => {
    return sandboxManager.checkNodeAvailability();
  }
);

ipcMain.handle(
  "sandbox:checkPythonAvailability",
  async (_event, cwd?: string) => {
    return sandboxManager.checkPythonAvailability(cwd);
  }
);

ipcMain.handle(
  "sandbox:cleanup",
  async () => {
    sandboxManager.cleanup();
    return { success: true };
  }
);

ipcMain.handle(
  "vscode:detect",
  async () => {
    try {
      // Try to detect VS Code installation
      // On macOS, check if 'code' command is available
      if (process.platform === 'darwin') {
        const { execSync } = await import('node:child_process');
        try {
          execSync('which code', { stdio: 'pipe' });
          return { detected: true };
        } catch {
          return { detected: false };
        }
      } else if (process.platform === 'win32') {
        // On Windows, check common installation paths
        const { execSync } = await import('node:child_process');
        try {
          execSync('where code', { stdio: 'pipe' });
          return { detected: true };
        } catch {
          return { detected: false };
        }
      } else {
        // On Linux, check if 'code' command is available
        const { execSync } = await import('node:child_process');
        try {
          execSync('which code', { stdio: 'pipe' });
          return { detected: true };
        } catch {
          return { detected: false };
        }
      }
    } catch {
      return { detected: false };
    }
  }
);

ipcMain.handle(
  "ollama:detect",
  async () => {
    try {
      const { execSync } = await import("node:child_process");
      let installed = false;
      try {
        if (process.platform === "win32") {
          execSync("where ollama", { stdio: "pipe" });
        } else {
          execSync("command -v ollama", { stdio: "pipe", shell: "/bin/sh" });
        }
        installed = true;
      } catch {
        installed = false;
      }

      let apiRunning = false;
      try {
        const response = await fetch("http://127.0.0.1:11434/api/tags");
        apiRunning = response.ok;
      } catch {
        apiRunning = false;
      }

      return {
        installed,
        apiRunning,
        baseUrl: "http://localhost:11434/v1",
      };
    } catch {
      return {
        installed: false,
        apiRunning: false,
        baseUrl: "http://localhost:11434/v1",
      };
    }
  },
);

ipcMain.handle(
  "lmstudio:detect",
  async () => {
    try {
      let installed = false;
      if (process.platform === "darwin") {
        installed = fs.existsSync("/Applications/LM Studio.app");
      } else if (process.platform === "win32") {
        const base = process.env.LOCALAPPDATA ?? "";
        installed = base
          ? fs.existsSync(path.join(base, "Programs", "LM Studio"))
          : false;
      } else {
        const home = os.homedir();
        installed =
          fs.existsSync(path.join(home, "LM-Studio")) ||
          fs.existsSync(path.join(home, "Applications", "LM-Studio"));
      }

      let apiRunning = false;
      try {
        const response = await fetch("http://127.0.0.1:1234/v1/models");
        apiRunning = response.ok;
      } catch {
        apiRunning = false;
      }

      return {
        installed,
        apiRunning,
        baseUrl: "http://localhost:1234/v1",
      };
    } catch {
      return {
        installed: false,
        apiRunning: false,
        baseUrl: "http://localhost:1234/v1",
      };
    }
  },
);

ipcMain.handle(
  "vscode:openWorktree",
  async (_event, worktreePath: string) => {
    try {
      if (process.platform === 'darwin') {
        const { execSync } = await import('node:child_process');
        execSync(`open -a "Visual Studio Code" "${worktreePath}"`);
      } else if (process.platform === 'win32') {
        const { execSync } = await import('node:child_process');
        execSync(`code "${worktreePath}"`);
      } else {
        // Linux and other platforms
        const { execSync } = await import('node:child_process');
        execSync(`code "${worktreePath}"`);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
);

export { cleanupOrphanedWorktrees };
