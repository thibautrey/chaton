import type {
  PiRendererEvent,
  RpcCommand,
  RpcExtensionUiResponse,
  RpcResponse,
} from "../pi-sdk-runtime.js";
import {
  captureConversationMemoryNow,
  enqueueConversationMemoryCapture,
  flushQueuedMemoryCaptures,
  getMemoryModelPreference,
  setMemoryModelPreference,
} from "../extensions/runtime/memory-lifecycle.js";
import {
  getTitleModelPreference,
  setTitleModelPreference,
} from "./workspace-title.js";
import {
  getAutocompleteModelPreference,
  setAutocompleteModelPreference,
  generateAutocompleteSuggestions,
  type AutocompleteSuggestion,
} from "./workspace-autocomplete.js";
import { maybeSuggestAutomationForConversation } from "../extensions/runtime/automation-suggestions.js";
import {
  cancelChatonsExtensionInstall,
  checkForExtensionUpdates,
  checkStoredNpmToken,
  clearStoredNpmToken,
  getChatonsExtensionInstallState,
  getChatonsExtensionLogs,
  getChatonsExtensionsBaseDir,
  getExtensionMarketplace,
  getExtensionMarketplaceAsync,
  installChatonsExtension,
  listChatonsExtensionCatalog,
  listChatonsExtensions,
  publishChatonsExtension,
  removeChatonsExtension,
  runChatonsExtensionHealthCheck,
  toggleChatonsExtension,
  updateAllChatonsExtensions,
  updateChatonsExtension,
} from "../extensions/manager.js";
import {
  clearConversationWorktreePath,
  findConversationById,
  insertConversation,
  listConversationMessagesCache,
  listConversationsByProjectId,
  replaceConversationMessagesCache,
  saveConversationPiRuntime,
  updateConversationStatus,
  updateConversationTitle,
} from "../db/repos/conversations.js";
import {
  getConversationHarnessFeedback,
  upsertConversationHarnessFeedback,
} from "../db/repos/meta-harness-feedback.js";
import {
  deleteProjectById,
  findProjectById,
  findProjectByRepoPath,
  insertProject,
  listProjects,
  updateProjectIcon,
  updateProjectIsArchived,
  updateProjectIsHidden,
} from "../db/repos/projects.js";
import {
  listCloudInstances,
  findCloudInstanceByBaseUrl,
  clearCloudInstanceSession,
  findCloudInstanceById,
  findCloudInstanceByOauthState,
  insertCloudInstance,
  saveCloudInstanceSession,
  updateCloudInstanceAuthState,
  updateCloudInstanceStatus,
} from "../db/repos/cloud-instances.js";
import {
  emitHostEvent,
  enrichExtensionsWithRuntimeFields,
  ensureExtensionServerStarted,
  extensionsCall,
  getExtensionMainViewHtml,
  getExtensionManifest,
  getExtensionRuntimeHealth,
  hostCall,
  initializeExtensionsRuntime,
  listRegisteredExtensionUi,
  loadExtensionManifestIntoRegistry,
  publishExtensionEvent,
  queueAck,
  queueConsume,
  queueEnqueue,
  queueListDeadLetters,
  queueNack,
  registerExtensionServer,
  runExtensionsQueueWorkerCycle,
  shutdownExtensionWorkers,
  storageFilesRead,
  storageFilesWrite,
  storageKvDeleteEntry,
  storageKvGet,
  storageKvListEntries,
  storageKvSet,
  subscribeExtension,
} from "../extensions/runtime.js";
import {
  getLanguagePreference,
  getSidebarSettings,
  saveLanguagePreference,
  saveSidebarSettings,
} from "../db/repos/settings.js";
import {
  listProjectCustomTerminalCommands,
  saveProjectCustomTerminalCommand,
} from "../db/repos/project-custom-terminal-commands.js";
import {
  listQuickActionsUsage,
  recordQuickActionUse,
} from "../db/repos/quick-actions-usage.js";

import type { DbConversation } from "../db/repos/conversations.js";
import type { DbSidebarSettings } from "../db/repos/settings.js";
import crypto from "node:crypto";
import electron from "electron";
import fs from "node:fs";
import { getDb } from "../db/index.js";
import { clearPendingBroadcastsForConversation } from "../acp/router.js";
import { getSentryTelemetry } from "../lib/telemetry/sentry.js";
import { OAuthProvider } from "@mariozechner/pi-ai";
import { getOAuthProvider } from "@mariozechner/pi-ai/oauth";
import type { GitDiffSummaryResult } from "./workspace.js";
import path from "node:path";
import { spawn } from "node:child_process";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { buildHostToolEnv, resolveHostExecutable } from "../lib/env/host-env.js";
import {
  connectCloudRealtime,
  createPkceChallenge,
  createPkceVerifier,
  deleteCloudOidcVerifier,
  deleteRequestWithHeaders,
  ensureCloudRuntimeSession,
  ensureFreshCloudSession,
  getAuthJson,
  getCloudOidcVerifier,
  getCloudRuntimeSnapshot,
  getJson,
  getPrimaryCloudAccount,
  getRuntimeHeadlessBaseUrl,
  postAuthJson,
  postJson,
  resetExpiredCloudRuntimeSession,
  setCloudOidcVerifier,
  syncCloudInstanceBootstrap,
  syncConnectedCloudInstances,
  disconnectAllCloudRealtime,
} from "./workspace-handlers/cloud.js";
import { getDefaultHarnessCandidate, loadHarnessCandidate } from "../meta-harness/candidate.js";
import { readActiveCandidate } from "../meta-harness/archive.js";
import { registerComposerHandlers } from "./workspace-handlers/composer-handlers.js";
import { registerSystemUtilityHandlers } from "./workspace-handlers/system-utils.js";
const { app, BrowserWindow, dialog, ipcMain, shell } = electron;

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
  process: ChildProcess | null;
};

const PROJECT_TERMINAL_FORCE_KILL_AFTER_MS = 1_500;

function hasChildProcessExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function canSignalProjectTerminalProcessGroup(child: ChildProcess): child is ChildProcess & { pid: number } {
  return process.platform !== "win32" && typeof child.pid === "number" && child.pid > 0;
}

function signalProjectTerminalProcess(
  child: ChildProcess,
  signal: NodeJS.Signals,
  options: { allowExitedProcessGroup?: boolean } = {},
): boolean {
  const hasExited = hasChildProcessExited(child);

  if (canSignalProjectTerminalProcessGroup(child) && (!hasExited || options.allowExitedProcessGroup)) {
    try {
      process.kill(-child.pid, signal);
      return true;
    } catch {
      // Fall back to the direct child below. The process group may already be gone.
    }
  }

  if (hasExited) return false;

  try {
    return child.kill(signal);
  } catch {
    return false;
  }
}

function terminateProjectTerminalProcess(
  child: ChildProcess | null,
  signal: NodeJS.Signals = "SIGTERM",
  forceAfterMs = PROJECT_TERMINAL_FORCE_KILL_AFTER_MS,
) {
  if (!child || hasChildProcessExited(child)) return;

  const targetsProcessGroup = canSignalProjectTerminalProcessGroup(child);
  signalProjectTerminalProcess(child, signal);
  if (forceAfterMs < 0 || signal === "SIGKILL") return;

  const forceTimer = setTimeout(() => {
    if (targetsProcessGroup) {
      signalProjectTerminalProcess(child, "SIGKILL", { allowExitedProcessGroup: true });
    } else if (!hasChildProcessExited(child)) {
      signalProjectTerminalProcess(child, "SIGKILL");
    }
  }, forceAfterMs);
  forceTimer.unref?.();

  if (!targetsProcessGroup) {
    child.once("exit", () => clearTimeout(forceTimer));
  }
}

function getProjectTerminalSpawnOptions(
  cwd: string,
  env: NodeJS.ProcessEnv,
  shell: boolean,
): SpawnOptions {
  return {
    cwd,
    env,
    shell,
    detached: process.platform !== "win32",
  };
}


type RegisterWorkspaceHandlersDeps = {
  toWorkspacePayload: () => Record<string, unknown>;
  getConversationAcpStatePayload?: (
    conversationId: string,
  ) => { ok: true; state: unknown } | { ok: false; reason: "conversation_not_found" };
  getGitDiffSummaryForConversation: (
    conversationId: string,
  ) => Promise<GitDiffSummaryResult>;
  getGitFileDiffForConversation: (
    conversationId: string,
    filePath: string,
  ) => Promise<unknown> | unknown;
  getWorktreeGitInfo: (conversationId: string) => Promise<unknown>;
  generateWorktreeCommitMessage: (conversationId: string) => Promise<unknown>;
  stageWorktreeFile: (
    conversationId: string,
    filePath: string,
  ) => Promise<unknown>;
  unstageWorktreeFile: (
    conversationId: string,
    filePath: string,
  ) => Promise<unknown>;
  commitWorktree: (conversationId: string, message: string) => Promise<unknown>;
  mergeWorktreeIntoMain: (conversationId: string) => Promise<unknown>;
  pullWorktreeBranch: (conversationId: string) => Promise<unknown>;
  pushWorktreeBranch: (conversationId: string) => Promise<unknown>;
  listPiModelsCached: () => Promise<unknown>;
  syncPiModelsCache: () => Promise<unknown>;
  discoverProviderModels: (
    providerConfig: Record<string, unknown>,
    providerId?: string,
  ) => Promise<unknown>;
  testProviderConnection: (
    providerConfig: Record<string, unknown>,
  ) => Promise<unknown>;
  setPiModelScoped: (
    provider: string,
    id: string,
    scoped: boolean,
  ) => Promise<unknown>;
  getPiConfigSnapshot: () => unknown;
  sanitizePiSettings: (
    next: Record<string, unknown>,
  ) =>
    | { ok: true; value: Record<string, unknown> }
    | { ok: false; message: string };
  readJsonFile: (
    filePath: string,
  ) =>
    | { ok: true; value: Record<string, unknown> }
    | { ok: false; message: string };
  validateDefaultModelExistsInModels: (
    settings: Record<string, unknown>,
    models: Record<string, unknown>,
  ) => string | null;
  getPiModelsPath: () => string;
  getPiSettingsPath: () => string;
  backupFile: (filePath: string) => void;
  atomicWriteJson: (filePath: string, value: Record<string, unknown>) => void;
  syncProviderApiKeysBetweenModelsAndAuth: (agentDir: string) => void;
  getPiAgentDir: () => string;
  probeProviderBaseUrl: (
    rawUrl: string,
  ) => Promise<{ resolvedBaseUrl: string; matched: boolean; tested: string[] }>;
  sanitizeModelsJsonWithResolvedBaseUrls: (
    next: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  validateModelsJson: (next: Record<string, unknown>) => string | null;
  runPiExec: (
    args: string[],
    timeoutMs?: number,
    cwd?: string,
  ) => Promise<unknown>;
  runPiRemoveWithFallback: (
    source: string,
    local?: boolean,
  ) => Promise<unknown>;
  getPiDiagnostics: () => unknown;
  listSkillsCatalog: () => Promise<unknown>;
  getSkillsMarketplace: () => Promise<unknown>;
  getSkillsMarketplaceFiltered: (options: unknown) => Promise<unknown>;
  getSkillsRatings: (skillSource?: string) => unknown;
  addSkillRating: (
    skillSource: string,
    rating: number,
    review?: string,
  ) => unknown;
  getSkillAverageRating: (skillSource: string) => unknown;
  getAuthJson: () => Record<string, unknown>;
  upsertProviderInModelsJson: (
    providerId: string,
    config: Record<string, unknown>,
  ) => { ok: true } | { ok: false; message: string };
  ensureConversationWorktree: (
    projectRepoPath: string,
    conversationId: string,
  ) => Promise<string>;
  isGitRepo: (folderPath: string) => Promise<boolean>;
  removeConversationWorktree: (
    worktreePath: string | null | undefined,
    projectRepoPath?: string | null,
  ) => Promise<void>;
  hasWorkingTreeChanges: (repoPath: string) => Promise<boolean>;
  hasStagedChanges: (repoPath: string) => Promise<boolean>;
  mapConversation: (conversation: DbConversation) => unknown;
  getGlobalWorkspaceDir: () => string;
  construireTitreDeterministe: (firstMessage: string) => string;
  AFFINAGE_TITRE_IA_ACTIVE: boolean;
  generateConversationTitleFromPi: (params: {
    provider: string;
    modelId: string;
    repoPath: string;
    firstMessage: string;
    projectId?: string | null;
  }) => Promise<string | null>;
  diffuserTitreConversation: (conversationId: string, title: string) => unknown;
  detectedProjectCommandsCache: Map<string, { timestamp: number; result: any }>;
  DETECTED_PROJECT_COMMANDS_TTL_MS: number;
  getConversationProjectRepoPath: (
    conversationId: string,
  ) =>
    | { ok: true; repoPath: string }
    | { ok: false; reason: "conversation_not_found" | "project_not_found" };
  buildDetectedProjectCommands: (repoPath: string) => any;
  projectCommandRuns: Map<string, ProjectTerminalRun>;
  appendProjectCommandRunEvent: (
    run: ProjectTerminalRun,
    stream: "stdout" | "stderr" | "meta",
    text: string,
  ) => void;
  piRuntimeManager: {
    start: (conversationId: string) => Promise<unknown>;
    stop: (conversationId: string) => Promise<unknown>;
    stopAll: () => Promise<unknown>;
    sendCommand: (
      conversationId: string,
      command: RpcCommand,
    ) => Promise<RpcResponse>;
    getSnapshot: (conversationId: string) => Promise<{ messages: unknown[] }>;
    respondExtensionUi: (
      conversationId: string,
      response: RpcExtensionUiResponse,
    ) => Promise<unknown>;
    subscribe: (listener: (event: PiRendererEvent) => void) => () => void;
    runChannelSubagent: (
      conversationId: string,
      message: string,
    ) => Promise<{ ok: true; reply: string } | { ok: false; message: string }>;
    hasActiveChannelSubagent: (conversationId: string) => boolean;
    steerChannelSubagent: (conversationId: string, message: string) => boolean;
    getActiveRuntime: () => any;
    getRuntimeForConversation: (conversationId: string) => any;
  };
  cacheMessagesFromSnapshot: (
    conversationId: string,
    snapshot: { messages: unknown[] },
  ) => void;
  extractLatestAssistantTextFromSnapshot: (
    snapshot: { messages?: unknown[] } | null | undefined,
  ) => string | null;
  gitService: {
    init: (folderPath: string) => Promise<unknown>;
    addAll: (folderPath: string) => Promise<unknown>;
  };
};

let extensionQueueWorker: NodeJS.Timeout | null = null;
let extensionQueueWorkerInFlight = false;
let memoryCaptureWorker: NodeJS.Timeout | null = null;
let unsubscribePiRuntimeEvents: (() => void) | null = null;

/**
 * Builds a system message informing the agent about an access mode change.
 * This message is sent as a hidden prompt when the user switches between secure and open mode.
 */
function buildAccessModeChangeMessage(
  previousMode: "secure" | "open",
  newMode: "secure" | "open",
): string {
  const now = new Date().toISOString();

  if (newMode === "open") {
    return [
      "[SYSTEM: Access Mode Change]",
      "",
      `The user has just switched the conversation from **${previousMode.toUpperCase()}** mode to **OPEN** mode at ${now}.`,
      "",
      "## What Changed",
      "- Your filesystem access is no longer restricted to the project directory",
      "- You can now access any file or directory on the system",
      "- Shell commands can operate anywhere on the filesystem",
      "",
      "## Guidelines for Open Mode",
      "1. Be explicit when accessing files outside the project scope",
      "2. Prioritize user intent and ask for clarification when needed",
      "3. Avoid unintended consequences with destructive operations",
      "4. Document any modifications made outside the initial project context",
      "5. Respect git worktree separation and user data protection",
      "",
      "The conversation history has been preserved. Please continue assisting the user with this expanded capability.",
    ].join("\n");
  } else {
    return [
      "[SYSTEM: Access Mode Change]",
      "",
      `The user has just switched the conversation from **${previousMode.toUpperCase()}** mode to **SECURE** mode at ${now}.`,
      "",
      "## What Changed",
      "- Your filesystem access is now restricted to the conversation working directory",
      "- File operations (read, write, bash) are limited to the project context",
      "- This protects the user's system and maintains conversation isolation",
      "",
      "## Guidelines for Secure Mode",
      "1. If a task requires access outside the project scope, explain what you need and why",
      "2. Use thread action suggestions to propose switching to open mode when necessary",
      "3. Frame requests clearly: 'This task requires access to [specific path]. Would you like to enable open mode?'",
      "4. Do not ask the user to switch modes for tasks that can be completed within the project scope",
      "",
      "The conversation history has been preserved. Please continue assisting the user within these constraints.",
    ].join("\n");
  }
}

export function registerWorkspaceHandlers(deps: RegisterWorkspaceHandlersDeps) {
  deps.syncProviderApiKeysBetweenModelsAndAuth(deps.getPiAgentDir());

  (globalThis as Record<string, unknown>).__chatonsInsertConversation =
    insertConversation;
  (globalThis as Record<string, unknown>).__chatonsFindConversationById =
    findConversationById;
  (globalThis as Record<string, unknown>).__chatonsListConversationMessages = (
    conversationId: string,
  ) => listConversationMessagesCache(getDb(), conversationId);
  (globalThis as Record<string, unknown>).__chatonsChannelBridge = {
    ingestExternalMessage: async ({
      extensionId,
      conversationId,
      message,
      idempotencyKey,
      metadata,
    }: {
      extensionId: string;
      conversationId: string;
      message: string;
      idempotencyKey?: string | null;
      metadata?: Record<string, unknown> | null;
    }) => {
      const db = getDb();
      const conversation = findConversationById(db, conversationId);
      if (!conversation) {
        return { ok: false as const, message: "Conversation not found" };
      }
      if (conversation.project_id !== null) {
        return {
          ok: false as const,
          message: "Channel ingestion is allowed only for global conversations",
        };
      }
      const dedupeKey =
        idempotencyKey && idempotencyKey.trim().length > 0
          ? `channel-ingest:${extensionId}:${idempotencyKey.trim()}`
          : null;
      if (dedupeKey) {
        const existing = storageKvGet(extensionId, dedupeKey);
        if (existing.ok && existing.data) {
          return { ok: true as const, reply: null };
        }
      }

      // If a subagent is already processing a previous message for this
      // conversation, steer it with the new message instead of queuing a
      // second independent run. The steered subagent will deliver the reply
      // through the normal outbound path.
      if (deps.piRuntimeManager.hasActiveChannelSubagent(conversationId)) {
        const steered = deps.piRuntimeManager.steerChannelSubagent(
          conversationId,
          message,
        );
        if (steered) {
          return { ok: true as const, reply: null };
        }
      }

      // Run the user's message through an ephemeral subagent that shares the
      // conversation's history but never writes to the main session file.
      // This keeps the main conversation clean: only the final user message
      // and the final assistant reply are stored in the DB cache.
      // Wrap in try/catch: runChannelSubagent's internal try/finally guards stop,
      // but external errors (DB, temp file) could still throw and must not propagate
      // as unhandled IPC rejections.
      let subagentResult: Awaited<ReturnType<typeof deps.piRuntimeManager.runChannelSubagent>>;
      try {
        subagentResult = await deps.piRuntimeManager.runChannelSubagent(
          conversationId,
          message,
        );
      } catch (err) {
        console.warn("[ingestExternalMessage] runChannelSubagent threw unexpectedly:", err);
        return {
          ok: false as const,
          message: err instanceof Error ? err.message : String(err),
        };
      }
      if (!subagentResult.ok) {
        return { ok: false as const, message: subagentResult.message };
      }

      const reply = subagentResult.reply;

      // Wrap post-subagent persistence steps: DB writes and KV storage can also
      // throw (e.g. disk full, corrupted SQLite). The subagent already delivered
      // its reply — surface the persistence failure gracefully rather than letting
      // it become an unhandled rejection.
      try {
        // Cache only the clean user message + assistant reply (no tool calls or
        // intermediate steps from the subagent session).
        const existingMessages = listConversationMessagesCache(
          db,
          conversationId,
        );
        const userMsgId = `channel-user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const assistantMsgId = `channel-asst-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        replaceConversationMessagesCache(db, conversationId, [
          ...existingMessages.map((m) => ({
            id: m.id,
            role: m.role,
            payloadJson:
              m.payload_json ??
              ((m as Record<string, unknown>).payloadJson as string) ??
              "{}",
          })),
          {
            id: userMsgId,
            role: "user",
            payloadJson: JSON.stringify({ role: "user", content: message }),
          },
          {
            id: assistantMsgId,
            role: "assistant",
            payloadJson: JSON.stringify({
              role: "assistant",
              content: [{ type: "text", text: reply }],
            }),
          },
        ]);

        if (dedupeKey) {
          storageKvSet(extensionId, dedupeKey, {
            conversationId,
            metadata: metadata ?? null,
            processedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.warn("[ingestExternalMessage] persistence step threw:", err);
        // Subagent already produced a reply — surface the DB/storage error but
        // still return the reply so the caller has a usable response.
      }
      return { ok: true as const, reply };
    },
  };

  // Store for active tool execution context (conversationId currently executing)
  type ToolExecutionAbortHandle = {
    signal: AbortSignal;
    abort: () => void;
  };

  const activeToolExecutionContext = new Map<string, string>(); // requestId -> conversationId
  const activeToolExecutionAborts = new Map<string, ToolExecutionAbortHandle>(); // requestId -> abort handle
  const activeToolCallIdByConversation = new Map<string, string>(); // conversationId -> requestId
  const touchedPathsByToolCall = new Map<string, Set<string>>(); // requestId -> relative repo paths

  const toAbortHandle = (
    signalOrController: AbortSignal | AbortController,
  ): ToolExecutionAbortHandle => {
    if ("signal" in signalOrController) {
      return {
        signal: signalOrController.signal,
        abort: () => signalOrController.abort(),
      };
    }
    return {
      signal: signalOrController,
      abort: () => signalOrController.dispatchEvent(new Event("abort")),
    };
  };

  (globalThis as Record<string, unknown>).__chatonsToolExecutionContextStart = (
    requestId: string,
    conversationId: string,
    signalOrController?: AbortSignal | AbortController,
  ) => {
    activeToolExecutionContext.set(requestId, conversationId);
    touchedPathsByToolCall.set(requestId, new Set());
    if (signalOrController) {
      activeToolExecutionAborts.set(
        requestId,
        toAbortHandle(signalOrController),
      );
    }
  };

  (globalThis as Record<string, unknown>).__chatonsToolExecutionContextEnd = (
    requestId: string,
  ) => {
    activeToolExecutionContext.delete(requestId);
    activeToolExecutionAborts.delete(requestId);
    touchedPathsByToolCall.delete(requestId);
  };

  /**
   * Cleans up all tool-execution Maps for a given conversation.
   * Aborts live tool executions and removes entries from all 4 Maps.
   * Call this when a conversation is deleted to prevent memory leaks from
   * stale tool-call state lingering in the Maps.
   */
  function clearToolExecutionMapsForConversation(conversationId: string) {
    // Collect matching keys first to avoid mutating the Map during iteration.
    const matchingKeys = Array.from(activeToolCallIdByConversation.keys()).filter(
      (key) => key === conversationId,
    );
    for (const key of matchingKeys) {
      activeToolCallIdByConversation.delete(key);
    }
    // Collect matching requestIds first to avoid mutating activeToolExecutionContext during iteration.
    const matchingRequestIds = Array.from(activeToolExecutionContext.entries())
      .filter(([, cid]) => cid === conversationId)
      .map(([requestId]) => requestId);

    for (const requestId of matchingRequestIds) {
      const abortHandle = activeToolExecutionAborts.get(requestId);
      if (abortHandle && !abortHandle.signal.aborted) {
        try {
          abortHandle.abort();
        } catch {
          // ignore abort errors
        }
      }
      activeToolExecutionContext.delete(requestId);
      activeToolExecutionAborts.delete(requestId);
      touchedPathsByToolCall.delete(requestId);
    }
  }

  /**
   * Cleans up all conversation-scoped Maps in a single call.
   * Includes: pending ACP broadcasts, tool-execution Maps, detected project commands,
   * and active terminal runs (SIGTERM, bounded SIGKILL escalation + Map removal).
   * Call this whenever a conversation session is stopped without being deleted.
   */
  function clearConversationMaps(
    deps: RegisterWorkspaceHandlersDeps,
    conversationId: string,
  ) {
    clearPendingBroadcastsForConversation(conversationId);
    clearToolExecutionMapsForConversation(conversationId);
    deps.detectedProjectCommandsCache.delete(conversationId);
    // Collect runIds first to avoid mutating the Map during iteration.
    const runIds = Array.from(deps.projectCommandRuns.entries())
      .filter(([, run]) => run.conversationId === conversationId)
      .map(([runId]) => runId);
    for (const runId of runIds) {
      const run = deps.projectCommandRuns.get(runId);
      if (run?.process && run.status === "running") {
        terminateProjectTerminalProcess(run.process);
      }
      deps.projectCommandRuns.delete(runId);
    }
  }

  (globalThis as Record<string, unknown>).__chatonsActiveToolCallIdByConversationSet = (
    conversationId: string,
    requestId: string,
  ) => {
    activeToolCallIdByConversation.set(conversationId, requestId);
  };

  (globalThis as Record<string, unknown>).__chatonsActiveToolCallIdByConversationClear = (
    conversationId: string,
    requestId: string,
  ) => {
    if (activeToolCallIdByConversation.get(conversationId) === requestId) {
      activeToolCallIdByConversation.delete(conversationId);
    }
  };

  (globalThis as Record<string, unknown>).__chatonsActiveToolCallIdByConversationLookup = (
    conversationId: string,
  ): string | undefined => activeToolCallIdByConversation.get(conversationId);

  (globalThis as Record<string, unknown>).__chatonsToolExecutionTrackPath = (
    requestId: string,
    absolutePath: string,
  ) => {
    const conversationId = activeToolExecutionContext.get(requestId);
    if (!conversationId || typeof absolutePath !== "string" || !absolutePath.trim()) {
      return;
    }

    const runtime = deps.piRuntimeManager.getRuntimeForConversation(conversationId) as {
      workingDirectory?: string;
    } | null;
    const cwd = runtime?.workingDirectory;
    if (!cwd) {
      return;
    }

    const normalizedCwd = require("node:path").resolve(cwd);
    const normalizedAbsolutePath = require("node:path").resolve(absolutePath);
    const relativePath = require("node:path").relative(normalizedCwd, normalizedAbsolutePath);
    if (
      !relativePath ||
      relativePath.startsWith("..") ||
      require("node:path").isAbsolute(relativePath)
    ) {
      return;
    }

    const touched = touchedPathsByToolCall.get(requestId) ?? new Set<string>();
    touched.add(relativePath.replace(/\\/g, "/"));
    touchedPathsByToolCall.set(requestId, touched);
  };

  (globalThis as Record<string, unknown>).__chatonsToolExecutionTouchedPathsLookup = (
    requestId: string,
  ): string[] => Array.from(touchedPathsByToolCall.get(requestId) ?? []);

  (globalThis as Record<string, unknown>).__chatonsToolExecutionContextLookup = (
    requestId: string,
  ): string | undefined => activeToolExecutionContext.get(requestId);

  (globalThis as Record<string, unknown>).__chatonsToolExecutionSignalLookup = (
    requestId: string,
  ): AbortSignal | undefined => activeToolExecutionAborts.get(requestId)?.signal;



  (globalThis as Record<string, unknown>).__chatonRegisterExtensionServer =
    (payload: {
      extensionId: string;
      command: string;
      args?: string[];
      cwd?: string;
      env?: Record<string, string>;
      readyUrl?: string;
      healthUrl?: string;
      expectExit?: boolean;
      startTimeoutMs?: number;
      readyTimeoutMs?: number;
    }) => registerExtensionServer(payload);

  initializeExtensionsRuntime();
  if (extensionQueueWorker) {
    clearInterval(extensionQueueWorker);
  }
  extensionQueueWorker = setInterval(() => {
    if (extensionQueueWorkerInFlight) {
      return;
    }
    extensionQueueWorkerInFlight = true;
    Promise.resolve(runExtensionsQueueWorkerCycle()).finally(() => {
      extensionQueueWorkerInFlight = false;
    });
  }, 1500);

  if (memoryCaptureWorker) {
    clearInterval(memoryCaptureWorker);
  }
  const MEMORY_CAPTURE_POLL_MS = 60 * 1000;
  memoryCaptureWorker = setInterval(() => {
    void flushQueuedMemoryCaptures(
      deps.piRuntimeManager as unknown as Parameters<typeof flushQueuedMemoryCaptures>[0],
    ).catch((err) =>
      console.warn("[Memory] Capture queue flush failed:", err),
    );
  }, MEMORY_CAPTURE_POLL_MS);

  unsubscribePiRuntimeEvents?.();
  unsubscribePiRuntimeEvents = deps.piRuntimeManager.subscribe((event: PiRendererEvent) => {
    if (event.event.type === "agent_start") {
      emitHostEvent("conversation.agent.started", {
        conversationId: event.conversationId,
      });
    }
    if (event.event.type === "agent_end") {
      emitHostEvent("conversation.agent.ended", {
        conversationId: event.conversationId,
      });
      // Save messages to cache asynchronously after agent_end.
      // This ensures the database cache is updated even if other operations fail.
      void deps.piRuntimeManager
        .getSnapshot(event.conversationId)
        .then((snapshot) => {
          deps.cacheMessagesFromSnapshot(event.conversationId, snapshot);
        })
        .catch((err) => {
          console.warn("[agent_end] Failed to cache messages from snapshot:", err);
        });

      // Queue structured memory capture for normal conversations.
      const convForMemory = findConversationById(getDb(), event.conversationId);
      const isEphemeral =
        !convForMemory ||
        convForMemory.hidden_from_sidebar === 1 ||
        event.conversationId.startsWith("automation-") ||
        event.conversationId.startsWith("memory-") ||
        event.conversationId.startsWith("__channel_subagent__");
      if (!isEphemeral) {
        for (const win of BrowserWindow.getAllWindows()) {
          if (win.isDestroyed()) continue;
          const webContents = win.webContents;
          if (webContents.isDestroyed()) continue;
          try {
            webContents.send("memory:saving", {
              conversationId: event.conversationId,
              status: "started",
            });
          } catch (err) {
            console.warn("[memory capture] Failed to send memory:saving (started) to window:", err);
          }
        }
        const queued = enqueueConversationMemoryCapture(event.conversationId);
        if (!queued.queued) {
          for (const win of BrowserWindow.getAllWindows()) {
            if (win.isDestroyed()) continue;
            const webContents = win.webContents;
            if (webContents.isDestroyed()) continue;
            try {
              webContents.send("memory:saving", {
                conversationId: event.conversationId,
                status: "skipped",
              });
            } catch (err) {
              console.warn("[memory capture] Failed to send memory:saving (skipped) to window:", err);
            }
          }
        }

        void Promise.resolve(
          maybeSuggestAutomationForConversation(event.conversationId, hostCall),
        ).catch((err) => {
          console.warn("[AutomationSuggestion] analysis failed:", err);
        });
      }
    }
    // Emit turn_end with usage data for token tracking extensions
    if (event.event.type === "turn_end") {
      const turnEvt = event.event as { type: "turn_end"; message?: any; toolResults?: any[] };
      const msg = turnEvt.message;
      const usage = msg?.usage ?? null;
      emitHostEvent("conversation.turn.ended", {
        conversationId: event.conversationId,
        provider: msg?.provider ?? null,
        model: msg?.model ?? null,
        usage,
        toolCallCount: turnEvt.toolResults?.length ?? 0,
        timestamp: Date.now(),
      });
    }
    // Emit tool execution events for tool call tracking
    if (event.event.type === "tool_execution_end") {
      const toolEvt = event.event as {
        type: "tool_execution_end";
        toolCallId?: string;
        toolName?: string;
        isError?: boolean;
      };
      emitHostEvent("conversation.tool.executed", {
        conversationId: event.conversationId,
        toolName: toolEvt.toolName ?? "unknown",
        toolCallId: toolEvt.toolCallId ?? null,
        isError: toolEvt.isError ?? false,
        timestamp: Date.now(),
      });
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

  ipcMain.handle("workspace:getInitialState", async () => {
    // Sync cloud instances. Network failures here should not wipe the local workspace.
    try {
      await syncConnectedCloudInstances();
    } catch (err) {
      console.warn("[getInitialState] syncConnectedCloudInstances failed:", err);
    }

    // Connect cloud realtime for any already-authenticated instances.
    try {
      const db = getDb();
      for (const instance of listCloudInstances(db)) {
        if (instance.access_token) {
          void connectCloudRealtime(instance.id);
        }
      }
    } catch (err) {
      console.warn("[getInitialState] connectCloudRealtime loop failed:", err);
    }

    // Fetch cloud account. Network errors are non-fatal — return null account.
    let cloudAccountResult: { account: unknown; users: unknown[] } = {
      account: null,
      users: [],
    };
    try {
      cloudAccountResult = await getPrimaryCloudAccount();
    } catch (err) {
      console.warn("[getInitialState] getPrimaryCloudAccount failed:", err);
    }

    // Build the core workspace payload (projects, conversations, settings).
    // This reads from local SQLite — failure here indicates a real problem.
    const payload = deps.toWorkspacePayload();

    // Check for extension updates. This is non-critical.
    let updatesCount = 0;
    try {
      const updatesResult = await checkForExtensionUpdates();
      updatesCount = updatesResult.updates.length;
    } catch {
      // Extension update check is non-critical — default to 0 on failure.
    }

    return {
      ...payload,
      cloudAccount: cloudAccountResult.account,
      cloudAdminUsers: cloudAccountResult.users,
      extensionUpdatesCount: updatesCount,
    };
  });

  ipcMain.handle("workspace:getConversationAcpState", async (_event, conversationId: string) => {
    if (typeof conversationId !== "string" || !conversationId.trim()) {
      return { ok: false as const, reason: "conversationId is required" as const };
    }
    if (!deps.getConversationAcpStatePayload) {
      return { ok: false as const, reason: "conversation_not_found" as const };
    }
    return deps.getConversationAcpStatePayload(conversationId.trim());
  });

  ipcMain.handle(
    "workspace:getGitDiffSummary",
    async (_event, conversationId: string) => {
      if (typeof conversationId !== 'string' || !conversationId.trim()) {
        return { ok: false, reason: 'project_not_found' as const };
      }
      return deps.getGitDiffSummaryForConversation(conversationId.trim());
    },
  );
  ipcMain.handle(
    "workspace:getGitFileDiff",
    (_event, conversationId: string, filePath: string) => {
      if (typeof conversationId !== 'string' || !conversationId.trim()) {
        return { ok: false, reason: 'project_not_found' as const };
      }
      if (typeof filePath !== 'string' || !filePath.trim()) {
        return { ok: false, reason: 'project_not_found' as const };
      }
      return deps.getGitFileDiffForConversation(conversationId.trim(), filePath.trim());
    },
  );
  ipcMain.handle(
    "workspace:getTouchedFilesForToolCall",
    (_event, toolCallId: string) => {
      if (typeof toolCallId !== 'string' || !toolCallId.trim()) {
        return [];
      }
      return Array.from(touchedPathsByToolCall.get(toolCallId.trim()) ?? []);
    },
  );
  ipcMain.handle(
    "workspace:getWorktreeGitInfo",
    (_event, conversationId: string) => {
      if (typeof conversationId !== 'string' || !conversationId.trim()) {
        return Promise.resolve({ ok: false as const, reason: 'conversation_not_found' as const });
      }
      return deps.getWorktreeGitInfo(conversationId.trim());
    },
  );
  ipcMain.handle(
    "workspace:generateWorktreeCommitMessage",
    (_event, conversationId: string) => {
      if (typeof conversationId !== 'string' || !conversationId.trim()) {
        return Promise.resolve({ ok: false as const, reason: 'conversation_not_found' as const });
      }
      return deps.generateWorktreeCommitMessage(conversationId.trim());
    },
  );
  ipcMain.handle(
    "workspace:stageWorktreeFile",
    (_event, conversationId: string, filePath: string) => {
      if (typeof conversationId !== 'string' || !conversationId.trim()) {
        return Promise.resolve({ ok: false as const, reason: 'conversation_not_found' as const });
      }
      if (typeof filePath !== 'string' || !filePath.trim()) {
        return Promise.resolve({ ok: false as const, reason: 'file_not_found' as const });
      }
      return deps.stageWorktreeFile(conversationId.trim(), filePath.trim());
    },
  );
  ipcMain.handle(
    "workspace:unstageWorktreeFile",
    (_event, conversationId: string, filePath: string) => {
      if (typeof conversationId !== 'string' || !conversationId.trim()) {
        return Promise.resolve({ ok: false as const, reason: 'conversation_not_found' as const });
      }
      if (typeof filePath !== 'string' || !filePath.trim()) {
        return Promise.resolve({ ok: false as const, reason: 'file_not_found' as const });
      }
      return deps.unstageWorktreeFile(conversationId.trim(), filePath.trim());
    },
  );
  ipcMain.handle(
    "workspace:commitWorktree",
    (_event, conversationId: string, message: string) => {
      if (typeof conversationId !== 'string' || !conversationId.trim()) {
        return Promise.resolve({ ok: false as const, reason: 'conversation_not_found' as const });
      }
      if (typeof message !== 'string' || !message.trim()) {
        return Promise.resolve({ ok: false as const, reason: 'unknown' as const });
      }
      return deps.commitWorktree(conversationId.trim(), message.trim());
    },
  );
  ipcMain.handle(
    "workspace:mergeWorktreeIntoMain",
    (_event, conversationId: string) => {
      if (typeof conversationId !== 'string' || !conversationId.trim()) {
        return Promise.resolve({ ok: false as const, reason: 'conversation_not_found' as const });
      }
      return deps.mergeWorktreeIntoMain(conversationId.trim());
    },
  );
  ipcMain.handle(
    "workspace:pullWorktreeBranch",
    (_event, conversationId: string) => {
      if (typeof conversationId !== 'string' || !conversationId.trim()) {
        return Promise.resolve({ ok: false as const, reason: 'conversation_not_found' as const });
      }
      return deps.pullWorktreeBranch(conversationId.trim());
    },
  );
  ipcMain.handle(
    "workspace:pushWorktreeBranch",
    (_event, conversationId: string) => {
      if (typeof conversationId !== 'string' || !conversationId.trim()) {
        return Promise.resolve({ ok: false as const, reason: 'conversation_not_found' as const });
      }
      return deps.pushWorktreeBranch(conversationId.trim());
    },
  );

  ipcMain.handle(
    "workspace:updateSettings",
    (_event, settings: DbSidebarSettings) => {
      // Generate a random anonymous install ID when telemetry is first enabled
      if (settings.allowAnonymousTelemetry && !settings.anonymousInstallId) {
        settings.anonymousInstallId = crypto.randomUUID();
      }
      // Clear the anonymous ID when telemetry is revoked
      if (!settings.allowAnonymousTelemetry && settings.anonymousInstallId) {
        settings.anonymousInstallId = null;
      }

      const db = getDb();
      saveSidebarSettings(db, settings);

      // Sync Sentry user identity with the current consent state
      const telemetry = getSentryTelemetry();
      if (telemetry) {
        if (settings.allowAnonymousTelemetry && settings.anonymousInstallId) {
          telemetry.setAnonymousUser(settings.anonymousInstallId);
        } else {
          telemetry.clearUser();
        }
      }

      return settings;
    },
  );

  ipcMain.handle(
    "cloud:connectInstance",
    async (
      _event,
      input: { name?: string; baseUrl?: string } | null | undefined,
    ) => {
      const rawBaseUrl =
        typeof input?.baseUrl === "string" ? input.baseUrl.trim() : "";
      if (!rawBaseUrl) {
        return {
          ok: false as const,
          reason: "invalid_base_url" as const,
          message: "Cloud base URL is required",
        };
      }

      let normalizedBaseUrl = rawBaseUrl.replace(/\/+$/, "");
      try {
        normalizedBaseUrl = new URL(normalizedBaseUrl).toString().replace(/\/+$/, "");
      } catch {
        return {
          ok: false as const,
          reason: "invalid_base_url" as const,
          message: "Cloud base URL is invalid",
        };
      }

      const db = getDb();
      const existing = findCloudInstanceByBaseUrl(db, normalizedBaseUrl);
      if (existing) {
        updateCloudInstanceStatus(db, existing.id, "connected", null);
        return { ok: true as const, duplicate: true, id: existing.id };
      }

      const id = crypto.randomUUID();
      const derivedName =
        typeof input?.name === "string" && input.name.trim().length > 0
          ? input.name.trim()
          : new URL(normalizedBaseUrl).host;
      insertCloudInstance(db, {
        id,
        name: derivedName,
        baseUrl: normalizedBaseUrl,
        authMode: "oauth",
        connectionStatus: "connected",
      });
      return { ok: true as const, duplicate: false, id };
    },
  );

  ipcMain.handle(
    "cloud:startAuth",
    async (
      _event,
      input: { name?: string; baseUrl?: string } | null | undefined,
    ) => {
      const rawBaseUrl =
        typeof input?.baseUrl === "string" && input.baseUrl.trim().length > 0
          ? input.baseUrl.trim()
          : "https://cloud.chatons.ai";

      let normalizedBaseUrl = rawBaseUrl.replace(/\/+$/, "");
      try {
        normalizedBaseUrl = new URL(normalizedBaseUrl).toString().replace(/\/+$/, "");
      } catch {
        return {
          ok: false as const,
          reason: "invalid_base_url" as const,
          message: "Cloud base URL is invalid",
        };
      }

      const db = getDb();
      const existing = findCloudInstanceByBaseUrl(db, normalizedBaseUrl);
      const instanceId = existing?.id ?? crypto.randomUUID();
      const state = crypto.randomUUID();
      const verifier = createPkceVerifier();
      const challenge = createPkceChallenge(verifier);

      if (!existing) {
        insertCloudInstance(db, {
          id: instanceId,
          name:
            typeof input?.name === "string" && input.name.trim().length > 0
              ? input.name.trim()
              : new URL(normalizedBaseUrl).host,
          baseUrl: normalizedBaseUrl,
          authMode: "oauth",
          connectionStatus: "connecting",
          oauthState: state,
        });
      } else {
        updateCloudInstanceAuthState(db, existing.id, state);
        updateCloudInstanceStatus(db, existing.id, "connecting", null);
      }

      setCloudOidcVerifier(state, verifier);

      let discovery: { issuer: string; authorization_endpoint: string };
      try {
        discovery = await getJson<{ issuer: string; authorization_endpoint: string }>(
          new URL("/.well-known/openid-configuration", normalizedBaseUrl).toString(),
        );
      } catch (err) {
        // OIDC discovery failed — clean up DB state and verifier before returning.
        // The cloud instance is left with "connecting" status; mark it as error so
        // the UI can show a meaningful failure rather than a stale in-progress state.
        deleteCloudOidcVerifier(state);
        updateCloudInstanceStatus(
          db,
          instanceId,
          "error",
          err instanceof Error ? err.message : String(err),
        );
        return {
          ok: false as const,
          reason: "discovery_failed" as const,
          message: err instanceof Error ? err.message : String(err),
        };
      }

      const authUrl = new URL(discovery.authorization_endpoint);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", "chatons-desktop");
      authUrl.searchParams.set("redirect_uri", "chatons://cloud/auth/callback");
      authUrl.searchParams.set("scope", "openid profile email offline_access");
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("nonce", crypto.randomUUID());
      authUrl.searchParams.set("base_url", normalizedBaseUrl);
      authUrl.searchParams.set("code_challenge", challenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      try {
        await shell.openExternal(authUrl.toString());
      } catch (error) {
        deleteCloudOidcVerifier(state);
        updateCloudInstanceStatus(
          db,
          instanceId,
          "error",
          error instanceof Error ? error.message : String(error),
        );
        return {
          ok: false as const,
          reason: "open_failed" as const,
          message: error instanceof Error ? error.message : String(error),
        };
      }

      return {
        ok: true as const,
        instanceId,
        authUrl: authUrl.toString(),
      };
    },
  );

  ipcMain.handle(
    "cloud:completeAuth",
    async (
      _event,
      payload: {
        code?: string | null;
        state?: string | null;
        error?: string | null;
        baseUrl?: string | null;
      },
    ) => {
      const db = getDb();
      const state =
        typeof payload.state === "string" && payload.state.trim().length > 0
          ? payload.state.trim()
          : "";
      if (!state) {
        return {
          ok: false as const,
          reason: "invalid_state" as const,
          message: "Missing cloud auth state",
        };
      }

      const instance = findCloudInstanceByOauthState(db, state);
      if (!instance) {
        return {
          ok: false as const,
          reason: "invalid_state" as const,
          message: "Unknown cloud auth state",
        };
      }

      if (typeof payload.error === "string" && payload.error.trim().length > 0) {
        updateCloudInstanceStatus(db, instance.id, "error", payload.error.trim());
        return {
          ok: false as const,
          reason: "provider_error" as const,
          message: payload.error.trim(),
        };
      }

      const code =
        typeof payload.code === "string" && payload.code.trim().length > 0
          ? payload.code.trim()
          : "";
      const verifier = getCloudOidcVerifier(state) ?? "";
      if (!code) {
        updateCloudInstanceStatus(db, instance.id, "error", "Missing auth code");
        return {
          ok: false as const,
          reason: "unknown" as const,
          message: "Missing cloud auth code",
        };
      }
      if (!verifier) {
        updateCloudInstanceStatus(db, instance.id, "error", "Missing PKCE verifier");
        return {
          ok: false as const,
          reason: "unknown" as const,
          message: "Missing PKCE verifier",
        };
      }

      const tokenUrl = new URL("/oidc/token", instance.base_url).toString();
      let exchange:
        | {
            user: {
              id: string;
              email: string;
              displayName: string;
            };
            session: {
              accessToken: string;
              refreshToken: string;
              expiresAt: string;
            };
            idToken?: string;
          }
        | null = null;
      try {
        exchange = await postJson(tokenUrl, {
          grantType: "authorization_code",
          clientId: "chatons-desktop",
          code,
          redirectUri: "chatons://cloud/auth/callback",
          codeVerifier: verifier,
        });
      } catch (error) {
        deleteCloudOidcVerifier(state);
        const message =
          error instanceof Error ? error.message : String(error);
        updateCloudInstanceStatus(db, instance.id, "error", message);
        return {
          ok: false as const,
          reason: "unknown" as const,
          message,
        };
      }

      if (!exchange) {
        deleteCloudOidcVerifier(state);
        updateCloudInstanceStatus(db, instance.id, "error", "Missing cloud session payload");
        return {
          ok: false as const,
          reason: "unknown" as const,
          message: "Missing cloud session payload",
        };
      }

      deleteCloudOidcVerifier(state);
      saveCloudInstanceSession(db, instance.id, {
        userEmail: exchange.user.email,
        accessToken: exchange.session.accessToken,
        refreshToken: exchange.session.refreshToken,
        tokenExpiresAt: exchange.session.expiresAt,
        oauthState: null,
        connectionStatus: "connected",
        lastError: null,
      });

      const syncResult = await syncCloudInstanceBootstrap(instance.id);
      if (!syncResult.ok) {
        return {
          ok: false as const,
          reason: syncResult.reason,
          message: syncResult.message,
        };
      }

      void connectCloudRealtime(instance.id);

      return {
        ok: true as const,
        instanceId: instance.id,
      };
    },
  );

  ipcMain.handle(
    "cloud:updateInstanceStatus",
    async (
      _event,
      instanceId: string,
      status: "connected" | "connecting" | "disconnected" | "error",
      lastError?: string | null,
    ) => {
      if (typeof instanceId !== "string" || !instanceId.trim()) {
        return { ok: false as const, reason: "instance_not_found" as const };
      }
      const validStatuses = ["connected", "connecting", "disconnected", "error"] as const;
      if (!validStatuses.includes(status as typeof validStatuses[number])) {
        return { ok: false as const, reason: "instance_not_found" as const };
      }
      const db = getDb();
      const updated = updateCloudInstanceStatus(db, instanceId.trim(), status, lastError);
      if (!updated) {
        return { ok: false as const, reason: "instance_not_found" as const };
      }
      return { ok: true as const };
    },
  );

  ipcMain.handle("cloud:getAccount", async () => {
    const { account, users, reason } = await getPrimaryCloudAccount();
    if (!account) {
      return { ok: false as const, reason: (reason ?? "not_connected") as "not_connected" | "session_expired" | "unknown" };
    }
    return { ok: true as const, account, users };
  });

  ipcMain.handle("cloud:logout", async () => {
    const db = getDb();
    const instance = listCloudInstances(db).find((entry) => Boolean(entry.access_token));
    if (!instance) {
      return { ok: false as const, reason: "not_connected" as const };
    }
    clearCloudInstanceSession(db, instance.id);
    return { ok: true as const };
  });

  ipcMain.handle(
    "cloud:updateUser",
    async (
      _event,
      userId: string,
      updates: { subscriptionPlan?: "plus" | "pro" | "max"; isAdmin?: boolean },
    ) => {
      if (typeof userId !== "string" || !userId.trim()) {
        return { ok: false as const, reason: "invalid_user_id" as const };
      }
      const trimmedUserId = userId.trim();
      if (
        !updates ||
        typeof updates !== "object" ||
        Array.isArray(updates)
      ) {
        return { ok: false as const, reason: "invalid_updates" as const };
      }
      const validPlans = ["plus", "pro", "max"] as const;
      if (
        updates.subscriptionPlan !== undefined &&
        !validPlans.includes(updates.subscriptionPlan)
      ) {
        return { ok: false as const, reason: "invalid_updates" as const };
      }
      if (
        updates.isAdmin !== undefined &&
        typeof updates.isAdmin !== "boolean"
      ) {
        return { ok: false as const, reason: "invalid_updates" as const };
      }

      const db = getDb();
      const instance = listCloudInstances(db).find((entry) => Boolean(entry.access_token));
      if (!instance?.access_token) {
        return { ok: false as const, reason: "not_connected" as const };
      }

      if (!(await ensureFreshCloudSession(instance.id))) {
        return { ok: false as const, reason: "unknown" as const, message: "Cloud session expired. Please reconnect." };
      }
      const freshInstance = findCloudInstanceById(db, instance.id) ?? instance;

      const response = await fetch(
        new URL(`/v1/admin/users/${encodeURIComponent(trimmedUserId)}`, freshInstance.base_url).toString(),
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${freshInstance.access_token}`,
          },
          body: JSON.stringify(updates),
        },
      );

      if (response.status === 403) {
        return { ok: false as const, reason: "forbidden" as const };
      }
      if (!response.ok) {
        return {
          ok: false as const,
          reason: "unknown" as const,
          message: await response.text(),
        };
      }

      const refreshed = await getPrimaryCloudAccount();
      return { ok: true as const, account: refreshed.account, users: refreshed.users };
    },
  );

  ipcMain.handle(
    "cloud:grantSubscription",
    async (
      _event,
      userId: string,
      grant: { planId: "plus" | "pro" | "max"; durationDays?: number | null },
    ) => {
      if (typeof userId !== "string" || !userId.trim()) {
        return { ok: false as const, reason: "invalid_user_id" as const };
      }
      const trimmedUserId = userId.trim();
      if (
        !grant ||
        typeof grant !== "object" ||
        Array.isArray(grant)
      ) {
        return { ok: false as const, reason: "invalid_grant" as const };
      }
      const validPlans = ["plus", "pro", "max"] as const;
      if (!validPlans.includes(((grant as { planId?: string }).planId ?? "") as typeof validPlans[number])) {
        return { ok: false as const, reason: "invalid_grant" as const };
      }
      if (
        (grant as { durationDays?: unknown }).durationDays !== undefined &&
        (grant as { durationDays?: unknown }).durationDays !== null &&
        typeof (grant as { durationDays?: number }).durationDays !== "number"
      ) {
        return { ok: false as const, reason: "invalid_grant" as const };
      }

      const db = getDb();
      const instance = listCloudInstances(db).find((entry) => Boolean(entry.access_token));
      if (!instance?.access_token) {
        return { ok: false as const, reason: "not_connected" as const };
      }

      if (!(await ensureFreshCloudSession(instance.id))) {
        return { ok: false as const, reason: "unknown" as const, message: "Cloud session expired. Please reconnect." };
      }
      const freshInstance = findCloudInstanceById(db, instance.id) ?? instance;

      const response = await fetch(
        new URL(`/v1/admin/users/${encodeURIComponent(trimmedUserId)}/grant-subscription`, freshInstance.base_url).toString(),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${freshInstance.access_token}`,
          },
          body: JSON.stringify(grant),
        },
      );

      if (response.status === 403) {
        return { ok: false as const, reason: "forbidden" as const };
      }
      if (!response.ok) {
        return {
          ok: false as const,
          reason: "unknown" as const,
          message: await response.text(),
        };
      }

      const refreshed = await getPrimaryCloudAccount();
      return { ok: true as const, account: refreshed.account, users: refreshed.users };
    },
  );

  ipcMain.handle(
    "cloud:updatePlan",
    async (
      _event,
      planId: unknown,
      updates: unknown,
    ) => {
      // Validate planId: must be one of the allowed plan identifiers.
      if (
        typeof planId !== "string" ||
        !(["plus", "pro", "max"] as readonly string[]).includes(planId)
      ) {
        return { ok: false as const, reason: "invalid_plan_id" as const };
      }
      // Validate updates: must be a plain object (not null, array, or primitive).
      if (
        updates !== undefined &&
        updates !== null &&
        (typeof updates !== "object" || Array.isArray(updates))
      ) {
        return { ok: false as const, reason: "invalid_updates" as const };
      }
      const typedUpdates = (updates ?? {}) as {
        label?: unknown;
        parallelSessionsLimit?: unknown;
        isDefault?: unknown;
      };
      // Validate updates fields: all optional, each must be the correct type if present.
      if (
        typedUpdates.label !== undefined &&
        typeof typedUpdates.label !== "string"
      ) {
        return { ok: false as const, reason: "invalid_updates" as const };
      }
      if (
        typedUpdates.parallelSessionsLimit !== undefined &&
        typeof typedUpdates.parallelSessionsLimit !== "number"
      ) {
        return { ok: false as const, reason: "invalid_updates" as const };
      }
      if (
        typedUpdates.isDefault !== undefined &&
        typeof typedUpdates.isDefault !== "boolean"
      ) {
        return { ok: false as const, reason: "invalid_updates" as const };
      }

      const db = getDb();
      const instance = listCloudInstances(db).find((entry) => Boolean(entry.access_token));
      if (!instance?.access_token) {
        return { ok: false as const, reason: "not_connected" as const };
      }

      if (!(await ensureFreshCloudSession(instance.id))) {
        return { ok: false as const, reason: "unknown" as const, message: "Cloud session expired. Please reconnect." };
      }
      const freshInstance = findCloudInstanceById(db, instance.id) ?? instance;

      const response = await fetch(
        new URL(`/v1/admin/plans/${encodeURIComponent(planId)}`, freshInstance.base_url).toString(),
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${freshInstance.access_token}`,
          },
          body: JSON.stringify(updates),
        },
      );

      if (response.status === 403) {
        return { ok: false as const, reason: "forbidden" as const };
      }
      if (!response.ok) {
        return {
          ok: false as const,
          reason: "unknown" as const,
          message: await response.text(),
        };
      }

      const refreshed = await getPrimaryCloudAccount();
      return { ok: true as const, account: refreshed.account, users: refreshed.users };
    },
  );

  ipcMain.handle(
    "projects:createCloud",
    async (
      _event,
      params: {
        cloudInstanceId: string;
        name: string;
        organizationId: string;
        kind: "repository" | "conversation_only";
        repository?: {
          cloneUrl: string;
          defaultBranch: string | null;
          authMode: "none" | "token";
          accessToken: string | null;
        } | null;
      },
    ) => {
      const db = getDb();
      const instance = findCloudInstanceById(db, params.cloudInstanceId);
      if (!instance) {
        return {
          ok: false as const,
          reason: "cloud_instance_not_found" as const,
        };
      }

      const trimmedName = params.name.trim();
      if (!trimmedName) {
        return { ok: false as const, reason: "invalid_name" as const };
      }

      if (!instance.access_token) {
        return {
          ok: false as const,
          reason: "unknown" as const,
        };
      }

      if (!(await ensureFreshCloudSession(instance.id))) {
        return {
          ok: false as const,
          reason: "unknown" as const,
          message: "Cloud session expired. Please reconnect.",
        };
      }
      const freshInstance = findCloudInstanceById(db, instance.id) ?? instance;

      let createdProjectId: string | null = null;
      try {
        const created = await postAuthJson<{ project: { id: string } }>(
          new URL("/v1/projects", freshInstance.base_url).toString(),
          freshInstance.access_token!,
          {
            name: trimmedName,
            organizationId: params.organizationId.trim() || "",
            kind: params.kind,
            repository: params.repository ?? null,
          },
        );
        createdProjectId = created.project?.id ?? null;
      } catch (error) {
        return {
          ok: false as const,
          reason: "unknown" as const,
          message: error instanceof Error ? error.message : String(error),
        };
      }

      const syncResult = await syncCloudInstanceBootstrap(instance.id);
      if (!syncResult.ok) {
        return { ok: false as const, reason: "unknown" as const };
      }

      const projects = listProjects(db);
      const project = projects.find((entry) => entry.id === createdProjectId) ??
        projects.find(
          (entry) =>
            entry.cloud_instance_id === instance.id &&
            entry.name === trimmedName &&
            entry.location === "cloud",
        );
      if (!project) {
        return { ok: false as const, reason: "unknown" as const };
      }

      return {
        ok: true as const,
        project: {
          id: project.id,
          name: project.name,
          repoPath: project.repo_path,
          repoName: project.repo_name,
          location: project.location,
          cloudInstanceId: project.cloud_instance_id,
          organizationId: project.organization_id,
          organizationName: project.organization_name,
          cloudStatus: project.cloud_status,
          isArchived: project.is_archived === 1,
          isHidden: project.is_hidden === 1,
          icon: project.icon,
          createdAt: project.created_at,
          updatedAt: project.updated_at,
        },
      };
    },
  );

  ipcMain.handle("models:listPi", async () => deps.listPiModelsCached());
  ipcMain.handle("models:syncPi", async () => deps.syncPiModelsCache());
  ipcMain.handle(
    "models:discoverProvider",
    async (_event, providerConfig: unknown, providerId?: string) => {
      if (
        !providerConfig ||
        typeof providerConfig !== "object" ||
        Array.isArray(providerConfig)
      ) {
        return {
          ok: false,
          models: [],
          message: "Invalid provider configuration",
        };
      }
      return deps.discoverProviderModels(
        providerConfig as Record<string, unknown>,
        typeof providerId === "string" ? providerId : undefined,
      );
    },
  );
  ipcMain.handle(
    "models:setPiScoped",
    async (_event, provider: unknown, id: unknown, scoped: unknown) => {
      if (typeof provider !== "string" || !provider.trim()) {
        return { ok: false as const, message: "provider is required" };
      }
      if (typeof id !== "string" || !id.trim()) {
        return { ok: false as const, message: "model id is required" };
      }
      if (typeof scoped !== "boolean") {
        return { ok: false as const, message: "scoped must be a boolean" };
      }
      return deps.setPiModelScoped(provider.trim(), id.trim(), scoped);
    },
  );

  ipcMain.handle("pi:getConfigSnapshot", () => deps.getPiConfigSnapshot());
  ipcMain.handle("pi:updateSettingsJson", (_event, next: unknown) => {
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      return {
        ok: false as const,
        message: "settings.json invalide: objet attendu.",
      };
    }
    const valid = deps.sanitizePiSettings(next as Record<string, unknown>);
    if (!valid.ok) {
      return { ok: false as const, message: valid.message };
    }
    const modelsCurrent = deps.readJsonFile(deps.getPiModelsPath());
    if (!modelsCurrent.ok) {
      return { ok: false as const, message: modelsCurrent.message };
    }
    const defaultModelError = deps.validateDefaultModelExistsInModels(
      valid.value,
      modelsCurrent.value,
    );
    if (defaultModelError) {
      return { ok: false as const, message: defaultModelError };
    }
    const settingsPath = deps.getPiSettingsPath();
    try {
      if (fs.existsSync(settingsPath)) {
        deps.backupFile(settingsPath);
      }
      deps.atomicWriteJson(settingsPath, valid.value);
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
    const authPath = path.join(deps.getPiAgentDir(), "auth.json");
    try {
      if (fs.existsSync(authPath)) {
        deps.backupFile(authPath);
      }
      deps.atomicWriteJson(authPath, next as Record<string, unknown>);
      deps.syncProviderApiKeysBetweenModelsAndAuth(deps.getPiAgentDir());
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
    "pi:resolveProviderBaseUrl",
    async (_event, rawUrl: unknown) => {
      if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
        return { ok: false as const, message: "URL invalide." };
      }
      const resolved = await deps.probeProviderBaseUrl(rawUrl);
      return {
        ok: true as const,
        baseUrl: resolved.resolvedBaseUrl,
        matched: resolved.matched,
        tested: resolved.tested,
      };
    },
  );

  ipcMain.handle("pi:updateModelsJson", async (_event, next: unknown) => {
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      return {
        ok: false as const,
        message: "models.json invalide: objet attendu.",
      };
    }
    const incoming = next as Record<string, unknown>;
    const incomingProviders =
      incoming.providers &&
      typeof incoming.providers === "object" &&
      !Array.isArray(incoming.providers)
        ? (incoming.providers as Record<string, unknown>)
        : {};
    const enrichedProviders: Record<string, unknown> = { ...incomingProviders };

    await Promise.all(
      Object.entries(incomingProviders).map(async ([providerName, providerValue]) => {
        if (
          !providerValue ||
          typeof providerValue !== "object" ||
          Array.isArray(providerValue)
        ) {
          return;
        }
        const providerConfig = providerValue as Record<string, unknown>;
        const existingModels = providerConfig.models;
        if (Array.isArray(existingModels) && existingModels.length > 0) {
          return;
        }
        const discovered = await deps.discoverProviderModels(
          providerConfig,
          providerName,
        );
        if (!discovered || typeof discovered !== "object" || !("ok" in discovered)) {
          return;
        }
        const typedDiscovered = discovered as {
          ok: boolean;
          models?: Array<{
            id: string;
            contextWindow?: number;
            contextWindowSource?: "provider" | "pi";
            maxTokens?: number;
            reasoning?: boolean;
            imageInput?: boolean;
          }>;
        };
        if (!typedDiscovered.ok || !Array.isArray(typedDiscovered.models) || typedDiscovered.models.length === 0) {
          return;
        }
        enrichedProviders[providerName] = {
          ...providerConfig,
          models: typedDiscovered.models.map((model) => {
            const entry: Record<string, unknown> = { id: model.id };
            if (
              typeof model.contextWindow === "number" &&
              model.contextWindowSource === "provider"
            ) {
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
          }),
        };
      }),
    );

    const sanitized = await deps.sanitizeModelsJsonWithResolvedBaseUrls({
      ...incoming,
      providers: enrichedProviders,
    });
    const error = deps.validateModelsJson(sanitized);
    if (error) {
      return { ok: false as const, message: error };
    }
    const modelsPath = deps.getPiModelsPath();
    try {
      if (fs.existsSync(modelsPath)) {
        deps.backupFile(modelsPath);
      }
      deps.atomicWriteJson(modelsPath, sanitized);
      const persistedProviders =
        sanitized.providers &&
        typeof sanitized.providers === "object" &&
        !Array.isArray(sanitized.providers)
          ? (sanitized.providers as Record<string, unknown>)
          : {};
      for (const [providerName, providerValue] of Object.entries(
        persistedProviders,
      )) {
        if (
          !providerValue ||
          typeof providerValue !== "object" ||
          Array.isArray(providerValue)
        ) {
          continue;
        }
        const providerConfig = providerValue as Record<string, unknown>;
        const modelCount = Array.isArray(providerConfig.models)
          ? providerConfig.models.length
          : 0;
        console.info(
          `[pi] Persisted provider "${providerName}" with baseUrl="${String(providerConfig.baseUrl ?? "")}" and ${modelCount} model(s)`,
        );
      }
      deps.syncProviderApiKeysBetweenModelsAndAuth(deps.getPiAgentDir());

      // Sync database cache with newly written models.json
      // This ensures that discovered models from custom providers are immediately available
      await deps.syncPiModelsCache();

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
      action: any,
      params: { search?: string; source?: string; local?: boolean },
    ) => {
      switch (action) {
        case "list":
          return deps.runPiExec(["list"]);
        case "list-models":
          return deps.runPiExec([
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
              message: "source is required",
            };
          }
          return deps.runPiExec(
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
              message: "source is required",
            };
          }
          return deps.runPiRemoveWithFallback(params.source, params.local);
        case "update":
          return deps.runPiExec(
            ["update", ...(params?.source ? [params.source] : [])],
            45_000,
          );
        case "config":
          return deps.runPiExec(["config"], 15_000);
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

  ipcMain.handle("pi:getDiagnostics", () => deps.getPiDiagnostics());

  ipcMain.handle("pi:getAuthJson", () => {
    const authJson = deps.getAuthJson();
    return { ok: true as const, auth: authJson };
  });

  ipcMain.handle("pi:oauthLogin", async (event, providerId: string) => {
    if (typeof providerId !== "string" || !providerId.trim()) {
      return { ok: false as const, message: "providerId is required" };
    }
    const provider = getOAuthProvider(providerId.trim());
    if (!provider) {
      return {
        ok: false as const,
        message: `Unknown OAuth provider: ${providerId}`,
      };
    }

    let promptResolve: ((value: string) => void) | null = null;
    let promptReject: ((err: Error) => void) | null = null;

    const promptListener = (_e: Electron.IpcMainEvent, value: string) => {
      if (promptResolve) {
        promptResolve(value);
        promptResolve = null;
        promptReject = null;
      }
    };
    const promptCancelListener = () => {
      if (promptReject) {
        promptReject(new Error("Cancelled by user"));
        promptResolve = null;
        promptReject = null;
      }
    };
    ipcMain.on("pi:oauthPromptReply", promptListener);
    ipcMain.on("pi:oauthPromptCancel", promptCancelListener);

    const abortController = new AbortController();
    const cancelLoginListener = () => {
      abortController.abort();
      promptCancelListener();
    };
    ipcMain.once("pi:oauthLoginCancel", cancelLoginListener);

    try {
      const credentials = await provider.login({
        onAuth: ({ url, instructions }: { url: string; instructions?: string }) => {
          shell.openExternal(url);
          event.sender.send("pi:oauthEvent", {
            type: "auth",
            url,
            instructions,
          });
        },
        onPrompt: ({ message, placeholder, allowEmpty }: { message: string; placeholder?: string; allowEmpty?: boolean }) => {
          return new Promise<string>((resolve, reject) => {
            promptResolve = resolve;
            promptReject = reject;
            event.sender.send("pi:oauthEvent", {
              type: "prompt",
              message,
              placeholder,
              allowEmpty,
            });
          });
        },
        onProgress: (msg: string) => {
          event.sender.send("pi:oauthEvent", {
            type: "progress",
            message: msg,
          });
        },
        signal: abortController.signal,
      });

      // Save credentials to auth.json
      const authPath = path.join(deps.getPiAgentDir(), "auth.json");
      let authData: Record<string, unknown> = {};
      try {
        const existing = deps.readJsonFile(authPath);
        if (existing.ok) authData = existing.value;
      } catch {
        /* use empty */
      }
      // AuthStorage.getApiKey() requires { type: "oauth", ...credentials } — must wrap explicitly
      authData[providerId] = {
        type: "oauth",
        ...(credentials as Record<string, unknown>),
      };
      deps.atomicWriteJson(authPath, authData);

      // Ensure provider entry exists in models.json
      const OAUTH_PROVIDER_DEFAULTS: Record<
        string,
        { api: string; baseUrl: string; headers?: Record<string, string> }
      > = {
        "github-copilot": {
          api: "anthropic-messages",
          baseUrl: "https://api.individual.githubcopilot.com",
          headers: {
            "User-Agent": "GitHubCopilotChat/0.35.0",
            "Editor-Version": "vscode/1.107.0",
            "Editor-Plugin-Version": "copilot-chat/0.35.0",
            "Copilot-Integration-Id": "vscode-chat",
          },
        },
        "openai-codex": {
          api: "openai-codex-responses",
          baseUrl: "https://chatgpt.com/backend-api",
        },
        anthropic: {
          api: "openai-completions",
          baseUrl: "https://api.anthropic.com/v1",
        },
      };
      if (OAUTH_PROVIDER_DEFAULTS[providerId]) {
        deps.upsertProviderInModelsJson(
          providerId,
          OAUTH_PROVIDER_DEFAULTS[providerId],
        );
      }

      // Discover and populate models for the newly connected OAuth provider
      // so the provider entry includes a models array immediately.
      await deps.syncPiModelsCache();

      event.sender.send("pi:oauthEvent", { type: "success" });
      return { ok: true as const, providerId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      event.sender.send("pi:oauthEvent", { type: "error", message });
      return { ok: false as const, message };
    } finally {
      ipcMain.off("pi:oauthPromptReply", promptListener);
      ipcMain.off("pi:oauthPromptCancel", promptCancelListener);
      ipcMain.off("pi:oauthLoginCancel", cancelLoginListener);
    }
  });

  ipcMain.handle("skills:listCatalog", async () => deps.listSkillsCatalog());
  ipcMain.handle("skills:getMarketplace", async () =>
    deps.getSkillsMarketplace(),
  );
  ipcMain.handle(
    "skills:getMarketplaceFiltered",
    async (_event, options: unknown) => {
      // Validate options shape before delegation
      if (options !== undefined && options !== null && (typeof options !== "object" || Array.isArray(options))) {
        return {
          ok: false as const,
          message: "options must be an object",
          results: [],
        };
      }
      if (options !== undefined && options !== null) {
        const opts = options as Record<string, unknown>;
        const validSortBy = ["installs", "stars", "recent", "rating", "trending"] as const;
        const validSource = ["skills.sh", "cloudhub", "all"] as const;
        if (
          opts.sortBy !== undefined &&
          typeof opts.sortBy !== "string"
        ) {
          return { ok: false as const, message: "sortBy must be a string", results: [] };
        }
        if (
          opts.sortBy !== undefined &&
          !(validSortBy as readonly string[]).includes(opts.sortBy)
        ) {
          return {
            ok: false as const,
            message: `sortBy must be one of: ${validSortBy.join(", ")}`,
            results: [],
          };
        }
        if (
          opts.source !== undefined &&
          typeof opts.source !== "string"
        ) {
          return { ok: false as const, message: "source must be a string", results: [] };
        }
        if (
          opts.source !== undefined &&
          !(validSource as readonly string[]).includes(opts.source)
        ) {
          return {
            ok: false as const,
            message: `source must be one of: ${validSource.join(", ")}`,
            results: [],
          };
        }
        if (opts.query !== undefined && typeof opts.query !== "string") {
          return { ok: false as const, message: "query must be a string", results: [] };
        }
        if (opts.category !== undefined && typeof opts.category !== "string") {
          return { ok: false as const, message: "category must be a string", results: [] };
        }
        if (opts.language !== undefined && typeof opts.language !== "string") {
          return { ok: false as const, message: "language must be a string", results: [] };
        }
        if (opts.createdAfter !== undefined && typeof opts.createdAfter !== "string") {
          return { ok: false as const, message: "createdAfter must be a string", results: [] };
        }
        if (opts.updatedAfter !== undefined && typeof opts.updatedAfter !== "string") {
          return { ok: false as const, message: "updatedAfter must be a string", results: [] };
        }
        if (opts.minInstalls !== undefined && typeof opts.minInstalls !== "number") {
          return { ok: false as const, message: "minInstalls must be a number", results: [] };
        }
        if (opts.minStars !== undefined && typeof opts.minStars !== "number") {
          return { ok: false as const, message: "minStars must be a number", results: [] };
        }
        if (opts.limit !== undefined && typeof opts.limit !== "number") {
          return { ok: false as const, message: "limit must be a number", results: [] };
        }
      }
      return deps.getSkillsMarketplaceFiltered(
        (options ?? {}) as Parameters<typeof deps.getSkillsMarketplaceFiltered>[0],
      );
    },
  );
  ipcMain.handle("skills:getRatings", (_event, skillSource?: unknown) => {
    // Reject invalid types: number, boolean, object, array, function.
    // undefined is intentionally allowed (returns all ratings).
    // string is allowed (filters by skillSource).
    if (
      skillSource !== undefined &&
      (typeof skillSource !== 'string' || !skillSource.trim())
    ) {
      return [] as unknown[];
    }
    return deps.getSkillsRatings(
      typeof skillSource === 'string' && skillSource.trim()
        ? skillSource.trim()
        : undefined,
    );
  });
  ipcMain.handle(
    "skills:addRating",
    (_event, skillSource: unknown, rating: unknown, review?: unknown) => {
      if (typeof skillSource !== "string" || !skillSource.trim()) {
        return { ok: false as const, message: "skillSource is required" };
      }
      if (typeof rating !== "number" || !Number.isFinite(rating)) {
        return { ok: false as const, message: "rating must be a finite number" };
      }
      return deps.addSkillRating(
        skillSource.trim(),
        Math.max(1, Math.min(5, Math.round(rating))),
        typeof review === "string" ? review : undefined,
      );
    },
  );
  ipcMain.handle("skills:getAverageRating", (_event, skillSource: string) => {
    if (typeof skillSource !== "string" || !skillSource.trim()) {
      return { ok: false as const, message: "skillSource is required" };
    }
    return deps.getSkillAverageRating(skillSource.trim());
  });
  ipcMain.handle("extensions:list", () => {
    const result = listChatonsExtensions();
    return {
      ...result,
      extensions: enrichExtensionsWithRuntimeFields(result.extensions),
    };
  });
  ipcMain.handle("extensions:listCatalog", () => listChatonsExtensionCatalog());
  ipcMain.handle("extensions:getMarketplace", async () => {
    return await getExtensionMarketplaceAsync();
  });
  ipcMain.handle("quickActions:listUsage", () => ({
    ok: true as const,
    rows: listQuickActionsUsage(getDb()),
  }));
  ipcMain.handle("quickActions:recordUse", (_event, actionId: string) => {
    if (typeof actionId !== "string" || !actionId.trim()) {
      return { ok: false as const, message: "actionId is required" };
    }
    const row = recordQuickActionUse(getDb(), actionId.trim());
    return { ok: true as const, row };
  });
  ipcMain.handle("extensions:install", (_event, id: string) => {
    if (typeof id !== "string" || !id.trim()) {
      return { ok: false as const, message: "extension id is required" };
    }
    const trimmedId = id.trim();
    const result = installChatonsExtension(trimmedId);
    if (result.ok) {
      // loadExtensionManifestIntoRegistry can throw on malformed manifest or
      // missing extension directory — wrap so a broken manifest never corrupts
      // the install result returned to the renderer.
      try {
        loadExtensionManifestIntoRegistry(trimmedId);
      } catch (err) {
        console.warn("[extensions:install] loadExtensionManifestIntoRegistry threw:", err);
      }
      emitHostEvent("extension.installed", { extensionId: trimmedId });
      void ensureExtensionServerStarted(trimmedId);
    }
    return result;
  });
  ipcMain.handle("extensions:installState", (_event, id: string) => {
    if (typeof id !== "string" || !id.trim()) {
      return { ok: false as const, message: "extension id is required" };
    }
    return getChatonsExtensionInstallState(id.trim());
  });
  ipcMain.handle("extensions:cancelInstall", (_event, id: string) => {
    if (typeof id !== "string" || !id.trim()) {
      return { ok: false as const, message: "extension id is required" };
    }
    return cancelChatonsExtensionInstall(id.trim());
  });
  ipcMain.handle(
    "extensions:toggle",
    async (_event, id: string, enabled: boolean) => {
      if (typeof id !== "string" || !id.trim()) {
        return { ok: false as const, message: "extension id is required" };
      }
      const trimmedId = id.trim();
      // toggleChatonsExtension reads/writes the registry file — wrap so disk
      // errors (full, permissions) don't become unhandled IPC rejections.
      let result: Awaited<ReturnType<typeof toggleChatonsExtension>>;
      try {
        result = toggleChatonsExtension(trimmedId, enabled);
      } catch (err) {
        console.warn("[extensions:toggle] toggleChatonsExtension threw:", err);
        return {
          ok: false as const,
          message: err instanceof Error ? err.message : String(err),
        };
      }
      if (enabled) {
        // loadExtensionManifestIntoRegistry can throw on malformed manifest —
        // wrap so a broken manifest doesn't prevent the toggle result from
        // reaching the renderer.
        try {
          loadExtensionManifestIntoRegistry(trimmedId);
        } catch (err) {
          console.warn("[extensions:toggle] loadExtensionManifestIntoRegistry threw:", err);
        }
        emitHostEvent("extension.enabled", { extensionId: trimmedId });
        await ensureExtensionServerStarted(trimmedId);
      } else {
        emitHostEvent("extension.disabled", { extensionId: trimmedId });
      }
      return result;
    },
  );
  ipcMain.handle("extensions:remove", (_event, id: string) => {
    if (typeof id !== "string" || !id.trim()) {
      return { ok: false as const, message: "extension id is required" };
    }
    return removeChatonsExtension(id.trim());
  });
  ipcMain.handle("extensions:runHealthCheck", () =>
    runChatonsExtensionHealthCheck(),
  );
  ipcMain.handle("extensions:getLogs", (_event, id: string) => {
    if (typeof id !== "string" || !id.trim()) {
      return { ok: false as const, message: "extension id is required" };
    }
    return getChatonsExtensionLogs(id.trim());
  });
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
    if (typeof extensionId !== "string" || !extensionId.trim()) {
      return { ok: false as const, message: "extension id is required" };
    }
    return {
      ok: true as const,
      manifest: getExtensionManifest(extensionId.trim()),
    };
  });
  ipcMain.handle("extensions:registerUi", () => ({
    ok: true as const,
    entries: listRegisteredExtensionUi(),
  }));
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
      extensionId: unknown,
      topic: unknown,
      options?: { projectId?: string; conversationId?: string },
    ) => {
      if (typeof extensionId !== "string" || !extensionId.trim()) {
        return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
      }
      if (typeof topic !== "string" || !topic.trim()) {
        return { ok: false, error: { code: "bad_request", message: "topic is required" } };
      }
      return subscribeExtension(extensionId.trim(), topic.trim(), options);
    },
  );
  ipcMain.handle(
    "extensions:events:publish",
    (
      _event,
      extensionId: string,
      topic: string,
      payload: unknown,
      meta?: { idempotencyKey?: string },
    ) => {
      if (typeof extensionId !== "string" || !extensionId.trim()) {
        return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
      }
      if (typeof topic !== "string" || !topic.trim()) {
        return { ok: false, error: { code: "bad_request", message: "topic is required" } };
      }
      return publishExtensionEvent(extensionId.trim(), topic.trim(), payload, meta);
    },
  );
  ipcMain.handle(
    "extensions:queue:enqueue",
    (
      _event,
      extensionId: string,
      topic: string,
      payload: unknown,
      opts?: { idempotencyKey?: string; availableAt?: string },
    ) => {
      if (typeof extensionId !== "string" || !extensionId.trim()) {
        return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
      }
      if (typeof topic !== "string" || !topic.trim()) {
        return { ok: false, error: { code: "bad_request", message: "topic is required" } };
      }
      return queueEnqueue(extensionId.trim(), topic.trim(), payload, opts);
    },
  );
  ipcMain.handle(
    "extensions:queue:consume",
    (
      _event,
      extensionId: string,
      topic: string,
      consumerId: string,
      opts?: { limit?: number },
    ) => {
      if (typeof extensionId !== "string" || !extensionId.trim()) {
        return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
      }
      if (typeof topic !== "string" || !topic.trim()) {
        return { ok: false, error: { code: "bad_request", message: "topic is required" } };
      }
      if (typeof consumerId !== "string" || !consumerId.trim()) {
        return { ok: false, error: { code: "bad_request", message: "consumerId is required" } };
      }
      return queueConsume(extensionId.trim(), topic.trim(), consumerId.trim(), opts);
    },
  );
  ipcMain.handle(
    "extensions:queue:ack",
    (_event, extensionId: string, messageId: string) => {
      if (typeof extensionId !== "string" || !extensionId.trim()) {
        return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
      }
      if (typeof messageId !== "string" || !messageId.trim()) {
        return { ok: false, error: { code: "bad_request", message: "messageId is required" } };
      }
      return queueAck(extensionId.trim(), messageId.trim());
    },
  );
  ipcMain.handle(
    "extensions:queue:nack",
    (
      _event,
      extensionId: string,
      messageId: string,
      retryAt?: string,
      errorMessage?: string,
    ) => {
      if (typeof extensionId !== "string" || !extensionId.trim()) {
        return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
      }
      if (typeof messageId !== "string" || !messageId.trim()) {
        return { ok: false, error: { code: "bad_request", message: "messageId is required" } };
      }
      return queueNack(extensionId.trim(), messageId.trim(), retryAt, errorMessage);
    },
  );
  ipcMain.handle(
    "extensions:queue:deadLetter:list",
    (_event, extensionId: string, topic?: string) => {
      if (typeof extensionId !== "string" || !extensionId.trim()) {
        return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
      }
      return queueListDeadLetters(extensionId.trim(), topic);
    },
  );
  ipcMain.handle(
    "extensions:storage:kv:get",
    (_event, extensionId: string, key: string) => {
      if (typeof extensionId !== "string" || !extensionId.trim()) {
        return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
      }
      if (typeof key !== "string") {
        return { ok: false, error: { code: "bad_request", message: "key must be a string" } };
      }
      return storageKvGet(extensionId.trim(), key);
    },
  );
  ipcMain.handle(
    "extensions:storage:kv:set",
    (_event, extensionId: string, key: string, value: unknown) => {
      if (typeof extensionId !== "string" || !extensionId.trim()) {
        return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
      }
      if (typeof key !== "string") {
        return { ok: false, error: { code: "bad_request", message: "key must be a string" } };
      }
      return storageKvSet(extensionId.trim(), key, value);
    },
  );
  ipcMain.handle(
    "extensions:storage:kv:delete",
    (_event, extensionId: string, key: string) => {
      if (typeof extensionId !== "string" || !extensionId.trim()) {
        return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
      }
      if (typeof key !== "string") {
        return { ok: false, error: { code: "bad_request", message: "key must be a string" } };
      }
      return storageKvDeleteEntry(extensionId.trim(), key);
    },
  );
  ipcMain.handle("extensions:storage:kv:list", (_event, extensionId: string) => {
    if (typeof extensionId !== "string" || !extensionId.trim()) {
      return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
    }
    return storageKvListEntries(extensionId.trim());
  });
  ipcMain.handle(
    "extensions:storage:files:read",
    (_event, extensionId: string, relativePath: string) => {
      if (typeof extensionId !== "string" || !extensionId.trim()) {
        return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
      }
      if (typeof relativePath !== "string") {
        return { ok: false, error: { code: "bad_request", message: "relativePath must be a string" } };
      }
      return storageFilesRead(extensionId.trim(), relativePath);
    },
  );
  ipcMain.handle(
    "extensions:storage:files:write",
    (_event, extensionId: string, relativePath: string, content: string) => {
      if (typeof extensionId !== "string" || !extensionId.trim()) {
        return { ok: false, error: { code: "bad_request", message: "extensionId is required" } };
      }
      if (typeof relativePath !== "string") {
        return { ok: false, error: { code: "bad_request", message: "relativePath must be a string" } };
      }
      if (typeof content !== "string") {
        return { ok: false, error: { code: "bad_request", message: "content must be a string" } };
      }
      return storageFilesWrite(extensionId.trim(), relativePath, content);
    },
  );
  ipcMain.handle(
    "extensions:hostCall",
    (
      _event,
      extensionId: string,
      method: string,
      params?: Record<string, unknown>,
    ) => {
      if (typeof extensionId !== "string" || !extensionId.trim()) {
        return {
          ok: false as const,
          error: { code: "bad_request" as const, message: "extensionId is required" },
        };
      }
      if (typeof method !== "string" || !method.trim()) {
        return {
          ok: false as const,
          error: { code: "bad_request" as const, message: "method is required" },
        };
      }
      return hostCall(extensionId.trim(), method.trim(), params);
    },
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
    ) => {
      if (typeof callerExtensionId !== "string" || !callerExtensionId.trim()) {
        return {
          ok: false as const,
          error: { code: "bad_request" as const, message: "callerExtensionId is required" },
        };
      }
      if (typeof extensionId !== "string" || !extensionId.trim()) {
        return {
          ok: false as const,
          error: { code: "bad_request" as const, message: "extensionId is required" },
        };
      }
      if (typeof apiName !== "string" || !apiName.trim()) {
        return {
          ok: false as const,
          error: { code: "bad_request" as const, message: "apiName is required" },
        };
      }
      if (typeof versionRange !== "string" || !versionRange.trim()) {
        return {
          ok: false as const,
          error: { code: "bad_request" as const, message: "versionRange is required" },
        };
      }
      return extensionsCall(
        callerExtensionId.trim(),
        extensionId.trim(),
        apiName.trim(),
        versionRange.trim(),
        payload,
      );
    },
  );
  ipcMain.handle("extensions:runtime:health", () =>
    getExtensionRuntimeHealth(),
  );
  ipcMain.handle("extensions:checkUpdates", () => {
    try {
      return checkForExtensionUpdates();
    } catch (err) {
      console.warn("[extensions:checkUpdates] threw unexpectedly:", err);
      return { ok: false as const, updates: [], message: err instanceof Error ? err.message : String(err) };
    }
  });
  ipcMain.handle("extensions:update", (_event, id: string) => {
    if (typeof id !== "string" || !id.trim()) {
      return { ok: false as const, message: "extension id is required" };
    }
    return updateChatonsExtension(id.trim());
  });
  ipcMain.handle("extensions:updateAll", () => {
    try {
      return updateAllChatonsExtensions();
    } catch (err) {
      console.warn("[extensions:updateAll] threw unexpectedly:", err);
      return { ok: false as const, results: [], message: err instanceof Error ? err.message : String(err) };
    }
  });
  ipcMain.handle(
    "extensions:publish",
    (_event, id: string, npmToken?: string) => {
      if (typeof id !== "string" || !id.trim()) {
        return { ok: false as const, message: "extension id is required" };
      }
      const trimmedId = id.trim();
      // publishChatonsExtension uses fs.appendFileSync and spawnResolvedCommand which
      // can throw on disk-full, permission errors, or missing npm. Wrap so these
      // never become unhandled IPC rejections.
      try {
        return publishChatonsExtension(trimmedId, npmToken);
      } catch (err) {
        console.warn("[extensions:publish] threw unexpectedly:", err);
        return {
          ok: false as const,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle("extensions:checkStoredNpmToken", () => checkStoredNpmToken());

  ipcMain.handle("extensions:clearStoredNpmToken", () => clearStoredNpmToken());

  ipcMain.handle(
    "pi:openPath",
    async (_event, target: unknown) => {
      if (
        target !== "settings" &&
        target !== "models" &&
        target !== "sessions"
      ) {
        return {
          ok: false as const,
          message:
            "Invalid target: must be 'settings', 'models', or 'sessions'.",
        };
      }
      const base = deps.getPiAgentDir();
      const targetPath =
        target === "settings"
          ? deps.getPiSettingsPath()
          : target === "models"
            ? deps.getPiModelsPath()
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
    "workspace:openProjectFolder",
    async (_event, projectId: string) => {
      if (typeof projectId !== "string" || !projectId.trim()) {
        return { ok: false as const, reason: "projectId is required" as const };
      }
      const trimmedId = projectId.trim();
      const db = getDb();
      const project = findProjectById(db, trimmedId);
      if (!project) {
        return { ok: false as const, reason: "project_not_found" as const };
      }
      try {
        if (project.location === "cloud" || !project.repo_path) {
          return {
            ok: false as const,
            message: "Cloud projects do not expose a local folder on this desktop.",
          };
        }
        // Check if the path exists first
        if (!fs.existsSync(project.repo_path)) {
          return {
            ok: false as const,
            message: `Project path does not exist: ${project.repo_path}`,
          };
        }
        await shell.openPath(project.repo_path);
        return { ok: true as const };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          ok: false as const,
          message: `Failed to open path: ${errorMessage}`,
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
          message: "sessionFile is required",
        };
      }
      const args = ["--export", sessionFile];
      if (outputFile && outputFile.trim().length > 0) {
        args.push(outputFile);
      }
      return deps.runPiExec(args, 45_000);
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
        channelExtensionId?: string;
      },
    ) => {
      const db = getDb();
      const conversationId = crypto.randomUUID();
      insertConversation(db, {
        id: conversationId,
        projectId: null,
        title: "Nouveau fil",
        titleSource: "placeholder",
        modelProvider: options?.modelProvider ?? null,
        modelId: options?.modelId ?? null,
        thinkingLevel: options?.thinkingLevel ?? null,
        worktreePath: null,
        accessMode: options?.accessMode === "open" ? "open" : "secure",
        channelExtensionId: options?.channelExtensionId ?? null,
      });

      const conversation = findConversationById(db, conversationId);
      if (!conversation) {
        return { ok: false as const, reason: "unknown" as const };
      }
      const sidebarSettings = getSidebarSettings(db);
      if (sidebarSettings.enableMetaHarnessFeedback) {
        const activeCandidateId = readActiveCandidate(app.getPath("userData") + "/.pi/agent") ?? getDefaultHarnessCandidate().id;
        const harnessCandidate = loadHarnessCandidate(app.getPath("userData") + "/.pi/agent", activeCandidateId);
        upsertConversationHarnessFeedback(db, {
          conversationId,
          harnessCandidateId: harnessCandidate.id,
          harnessSnapshot: harnessCandidate,
          enabled: true,
        });
      } else {
        upsertConversationHarnessFeedback(db, {
          conversationId,
          harnessCandidateId: null,
          harnessSnapshot: null,
          enabled: false,
        });
      }
      emitHostEvent("conversation.created", {
        conversationId,
        projectId: null,
      });
      return {
        ok: true as const,
        conversation: deps.mapConversation(conversation),
      };
    },
  );

  ipcMain.handle(
    "conversations:createForProject",
    async (
      _event,
      projectId: unknown,
      options?: {
        modelProvider?: string;
        modelId?: string;
        thinkingLevel?: string;
        accessMode?: "secure" | "open";
        channelExtensionId?: string;
      },
    ) => {
      if (typeof projectId !== "string" || !projectId.trim()) {
        return { ok: false as const, reason: "project_not_found" as const };
      }
      const trimmedId = projectId.trim();
      const db = getDb();
      const project = listProjects(db).find((item) => item.id === trimmedId);
      if (!project) {
        return { ok: false as const, reason: "project_not_found" as const };
      }

      if (project.location === "cloud") {
        if (!project.cloud_instance_id) {
          return { ok: false as const, reason: "project_not_found" as const };
        }

        const instance = findCloudInstanceById(db, project.cloud_instance_id);
        if (!instance?.access_token) {
          return { ok: false as const, reason: "unknown" as const };
        }

        if (!(await ensureFreshCloudSession(instance.id))) {
          return { ok: false as const, reason: "unknown" as const, message: "Cloud session expired. Please reconnect." };
        }
        const freshInstance = findCloudInstanceById(db, instance.id) ?? instance;

        const title = `New - ${project.name}`;
        let createdConversationId: string | null = null;
        try {
          const created = await postAuthJson<{ conversation: { id: string } }>(
            new URL("/v1/conversations", freshInstance.base_url).toString(),
            freshInstance.access_token!,
            {
              projectId: project.id,
              title,
              modelProvider: options?.modelProvider ?? null,
              modelId: options?.modelId ?? null,
            },
          );
          createdConversationId = created.conversation?.id ?? null;
        } catch (error) {
          return { ok: false as const, reason: "unknown" as const, message: error instanceof Error ? error.message : String(error) };
        }

        const syncResult = await syncCloudInstanceBootstrap(instance.id);
        if (!syncResult.ok) {
          return { ok: false as const, reason: "unknown" as const };
        }

        const conversation = listConversationsByProjectId(db, project.id).find(
          (entry) => entry.id === createdConversationId,
        ) ?? listConversationsByProjectId(db, project.id).find(
          (entry) => entry.title === title,
        );
        if (!conversation) {
          return { ok: false as const, reason: "unknown" as const };
        }

        emitHostEvent("conversation.created", { conversationId: conversation.id, projectId: trimmedId });
        return {
          ok: true as const,
          conversation: deps.mapConversation(conversation),
        };
      }

      const conversationId = crypto.randomUUID();
      const runtimeLocation = project.cloud_instance_id ? "cloud" : "local";
      insertConversation(db, {
        id: conversationId,
        projectId: trimmedId,
        title: `New - ${project.name}`,
        titleSource: "placeholder",
        modelProvider: options?.modelProvider ?? null,
        modelId: options?.modelId ?? null,
        thinkingLevel: options?.thinkingLevel ?? null,
        worktreePath: null,
        accessMode: options?.accessMode === "open" ? "open" : "secure",
        channelExtensionId: options?.channelExtensionId ?? null,
        runtimeLocation,
        cloudRuntimeSessionId: null,
      });

      const conversation = findConversationById(db, conversationId);
      if (!conversation) {
        return { ok: false as const, reason: "unknown" as const };
      }
      const sidebarSettings = getSidebarSettings(db);
      if (runtimeLocation === "local" && sidebarSettings.enableMetaHarnessFeedback) {
        const agentDir = app.getPath("userData") + "/.pi/agent";
        const activeCandidateId = readActiveCandidate(agentDir) ?? getDefaultHarnessCandidate().id;
        const harnessCandidate = loadHarnessCandidate(agentDir, activeCandidateId);
        upsertConversationHarnessFeedback(db, {
          conversationId,
          harnessCandidateId: harnessCandidate.id,
          harnessSnapshot: harnessCandidate,
          enabled: true,
        });
      } else {
        upsertConversationHarnessFeedback(db, {
          conversationId,
          harnessCandidateId: null,
          harnessSnapshot: null,
          enabled: false,
        });
      }
      emitHostEvent("conversation.created", { conversationId, projectId: trimmedId });
      return {
        ok: true as const,
        conversation: deps.mapConversation(conversation),
      };
    },
  );

  ipcMain.handle(
    "conversations:enableWorktree",
    async (_event, conversationId: string) => {
      if (typeof conversationId !== "string" || !conversationId.trim()) {
        return { ok: false as const, reason: "conversationId is required" as const };
      }
      const db = getDb();
      const conversation = findConversationById(db, conversationId.trim());
      if (!conversation) {
        return {
          ok: false as const,
          reason: "conversation_not_found" as const,
        };
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
      if (project.location === "cloud" || !project.repo_path) {
        return {
          ok: false as const,
          reason: "project_not_found" as const,
          message: project.location === "cloud"
            ? "Worktrees are not available for cloud projects."
            : "Project has no repository path.",
        };
      }

      if (
        conversation.worktree_path &&
        conversation.worktree_path.trim().length > 0 &&
        (await deps.isGitRepo(conversation.worktree_path))
      ) {
        return {
          ok: true as const,
          conversation: deps.mapConversation(conversation),
        };
      }

      const worktreePath = await deps
        .ensureConversationWorktree(project.repo_path, conversationId)
        .catch(() => null);
      if (!worktreePath) {
        return { ok: false as const, reason: "unknown" as const };
      }

      // Guard DB writes and reads: if either throws, surface the error gracefully
      // so the renderer always gets a typed response (not an unhandled rejection).
      // The worktree was already created — failing to persist is still an error worth
      // reporting rather than silently returning success.
      let updatedConversation: Awaited<ReturnType<typeof findConversationById>>;
      try {
        saveConversationPiRuntime(db, conversationId, { worktreePath });
        updatedConversation = findConversationById(db, conversationId);
      } catch (err) {
        console.warn("[enableWorktree] persistence step threw:", err);
        return { ok: false as const, reason: "unknown" as const };
      }
      if (!updatedConversation) {
        return { ok: false as const, reason: "unknown" as const };
      }
      const payload = {
        conversationId,
        updatedAt: new Date().toISOString(),
        worktreePath,
      };
      for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed()) continue;
        const webContents = win.webContents;
        if (webContents.isDestroyed()) continue;
        try {
          webContents.send("workspace:conversationUpdated", payload);
        } catch (err) {
          console.warn("[enableWorktree] Failed to send workspace:conversationUpdated to window:", err);
        }
      }
      emitHostEvent("conversation.updated", {
        conversationId,
        type: "worktree_enabled",
      });
      return {
        ok: true as const,
        conversation: deps.mapConversation(updatedConversation),
      };
    },
  );

  ipcMain.handle(
    "conversations:disableWorktree",
    async (_event, conversationId: string) => {
      if (typeof conversationId !== "string" || !conversationId.trim()) {
        return { ok: false as const, reason: "conversationId is required" as const };
      }
      const db = getDb();
      const conversation = findConversationById(db, conversationId.trim());
      if (!conversation) {
        return {
          ok: false as const,
          reason: "conversation_not_found" as const,
        };
      }
      if (!conversation.project_id) {
        return { ok: false as const, reason: "project_not_found" as const };
      }
      if (
        !conversation.worktree_path ||
        conversation.worktree_path.trim().length === 0
      ) {
        return { ok: true as const, changed: false as const };
      }

      const hasWorkingChanges = await deps.hasWorkingTreeChanges(
        conversation.worktree_path,
      );
      const hasStagedChangesResult = await deps.hasStagedChanges(
        conversation.worktree_path,
      );
      if (hasWorkingChanges || hasStagedChangesResult) {
        return {
          ok: false as const,
          reason: "has_uncommitted_changes" as const,
        };
      }

      const project = listProjects(db).find(
        (item) => item.id === conversation.project_id,
      );
      // Best-effort cleanup — the DB worktree_path is cleared regardless of
      // filesystem errors. removeConversationWorktree's internal try/catch covers
      // the removal step; this outer try/catch guards hasWorkingTreeChanges and
      // hasStagedChanges which run before it and can also throw.
      try {
        await deps.removeConversationWorktree(
          conversation.worktree_path,
          project?.repo_path ?? null,
        );
      } catch (err) {
        console.warn("[conversations:disableWorktree] removeConversationWorktree threw:", err);
      }
      clearConversationWorktreePath(db, conversationId);
      // Use clearConversationMaps (not the partial clearToolExecutionMapsForConversation)
      // so pending ACP broadcasts, detected project commands, and active terminal runs
      // are also cleaned up. The session continues running, but the worktree context
      // is gone so these are all stale.
      clearConversationMaps(deps, conversationId);
      const payload = {
        conversationId,
        updatedAt: new Date().toISOString(),
        worktreePath: "",
      };
      for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed()) continue;
        const webContents = win.webContents;
        if (webContents.isDestroyed()) continue;
        try {
          webContents.send("workspace:conversationUpdated", payload);
        } catch (err) {
          console.warn("[disableWorktree] Failed to send workspace:conversationUpdated to window:", err);
        }
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
        return {
          ok: false as const,
          reason: "conversation_not_found" as const,
        };
      }

      const previousAccessMode = conversation.access_mode === "open" ? "open" : "secure";
      const nextAccessMode = accessMode === "open" ? "open" : "secure";

      // If the mode hasn't changed, just return success
      if (previousAccessMode === nextAccessMode) {
        return { ok: true as const, accessMode: nextAccessMode };
      }

      // Check if the conversation has an active session
      const hasActiveSession = deps.piRuntimeManager.getRuntimeForConversation(conversationId) !== undefined;

      // Update the database with the new access mode
      saveConversationPiRuntime(db, conversationId, {
        accessMode: nextAccessMode,
      });

      // Only restart the session and notify the agent if the conversation is currently running
      if (hasActiveSession) {
        // Always clean up Maps even if stop() throws — stale entries are worse than
        // a failed stop. The stop error still propagates.
        try {
          await deps.piRuntimeManager.stop(conversationId);
        } finally {
          clearConversationMaps(deps, conversationId);
        }

        // Restart the Pi session with the new access mode
        const startResult = (await deps.piRuntimeManager.start(conversationId)) as
          | { ok: true }
          | { ok: false; reason: string; message: string };
        if (!startResult.ok) {
          return {
            ok: false as const,
            reason: "restart_failed" as const,
            message: startResult.message || "Failed to restart session with new access mode",
          };
        }

        // Send a system message informing the agent about the mode change.
        // Wrap in try/catch: if sendCommand fails, the session is already restarted
        // and the DB is updated — the agent simply won't receive the system prompt.
        // Window notifications below still fire so the UI is consistent.
        const modeChangeMessage = buildAccessModeChangeMessage(previousAccessMode, nextAccessMode);
        try {
          await deps.piRuntimeManager.sendCommand(conversationId, {
            type: "prompt",
            message: modeChangeMessage,
            streamingBehavior: "steer",
          });
        } catch (err) {
          console.warn("[setAccessMode] sendCommand failed — agent missed mode-change prompt:", err);
        }
      }

      // Notify all windows about the access mode change
      const payload = {
        conversationId,
        updatedAt: new Date().toISOString(),
        accessMode: nextAccessMode,
      };
      for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed()) continue;
        const webContents = win.webContents;
        if (webContents.isDestroyed()) continue;
        try {
          webContents.send("workspace:conversationUpdated", payload);
        } catch (err) {
          console.warn("[setAccessMode] Failed to send workspace:conversationUpdated to window:", err);
        }
      }

      emitHostEvent("conversation.updated", {
        conversationId,
        type: "access_mode_changed",
        previousMode: previousAccessMode,
        newMode: nextAccessMode,
      });

      return { ok: true as const, accessMode: nextAccessMode };
    },
  );

  ipcMain.handle(
    "conversations:delete",
    async (_event, conversationId: string, force: boolean = false) => {
      if (typeof conversationId !== "string" || !conversationId.trim()) {
        return {
          ok: false as const,
          reason: "conversation_not_found" as const,
        };
      }
      const trimmedId = conversationId.trim();
      const db = getDb();
      const conversation = findConversationById(db, trimmedId);
      if (!conversation) {
        return {
          ok: false as const,
          reason: "conversation_not_found" as const,
        };
      }

      if (conversation.worktree_path && conversation.worktree_path.trim()) {
        const hasWorkingChanges = await deps.hasWorkingTreeChanges(
          conversation.worktree_path,
        );
        const hasStagedChangesResult = await deps.hasStagedChanges(
          conversation.worktree_path,
        );
        if ((hasWorkingChanges || hasStagedChangesResult) && !force) {
          return {
            ok: false as const,
            reason: "has_uncommitted_changes" as const,
          };
        }
      }

      // Always clean up Maps even if stop() throws — stale entries are worse than
      // a failed stop. The stop error still propagates.
      try {
        await deps.piRuntimeManager.stop(trimmedId);
      } finally {
        clearConversationMaps(deps, trimmedId);
      }
      const archived = updateConversationStatus(db, trimmedId, "archived");
      if (!archived) {
        return {
          ok: false as const,
          reason: "conversation_not_found" as const,
        };
      }
      void captureConversationMemoryNow(
        trimmedId,
        deps.piRuntimeManager as unknown as Parameters<typeof captureConversationMemoryNow>[1],
      )
        .then((result) => {
          for (const win of BrowserWindow.getAllWindows()) {
            if (win.isDestroyed()) continue;
            const webContents = win.webContents;
            if (webContents.isDestroyed()) continue;
            try {
              webContents.send("memory:saving", {
                conversationId: trimmedId,
                status: result.stored > 0 ? "completed" : "skipped",
              });
            } catch (err) {
              console.warn("[captureConversationMemoryNow] Failed to send memory:saving to window:", err);
            }
          }
        })
        .catch(() => {
          for (const win of BrowserWindow.getAllWindows()) {
            if (win.isDestroyed()) continue;
            const webContents = win.webContents;
            if (webContents.isDestroyed()) continue;
            try {
              webContents.send("memory:saving", {
                conversationId: trimmedId,
                status: "error",
              });
            } catch (err) {
              console.warn("[captureConversationMemoryNow] Failed to send memory:saving (error) to window:", err);
            }
          }
        });
      if (conversation.worktree_path && conversation.worktree_path.trim()) {
        const project = conversation.project_id
          ? listProjects(db).find((item) => item.id === conversation.project_id)
          : null;
        // Best-effort cleanup — filesystem errors must not prevent archiving.
        // removeConversationWorktree's internal try/catch covers the removal step;
        // this outer try/catch guards hasWorkingTreeChanges and hasStagedChanges.
        try {
          await deps.removeConversationWorktree(
            conversation.worktree_path,
            project?.repo_path ?? null,
          );
        } catch (err) {
          console.warn("[conversations:archive] removeConversationWorktree threw:", err);
        }
      }
      emitHostEvent("conversation.updated", {
        conversationId: trimmedId,
        type: "archived",
      });
      return { ok: true as const };
    },
  );

  ipcMain.handle("projects:delete", async (_event, projectId: string) => {
    if (typeof projectId !== "string" || !projectId.trim()) {
      return { ok: false as const, reason: "project_not_found" as const };
    }
    const trimmedId = projectId.trim();
    const db = getDb();
    const project = listProjects(db).find((item) => item.id === trimmedId);
    if (!project) {
      return { ok: false as const, reason: "project_not_found" as const };
    }

    const projectConversations = listConversationsByProjectId(db, trimmedId);
    // Always clean up Maps even if stop() throws — stale entries are worse than
    // a failed stop. The stop errors are swallowed so the deletion proceeds.
    try {
      await Promise.all(
        projectConversations.map((conversation) =>
          deps.piRuntimeManager.stop(conversation.id).catch(() => {}),
        ),
      );
    } finally {
      // Clean up all conversation-scoped Maps for each project conversation
      for (const conversation of projectConversations) {
        clearConversationMaps(deps, conversation.id);
      }
    }
    // Best-effort worktree cleanup — filesystem errors must not prevent the
    // project from being deleted from the DB or the host event from firing.
    try {
      await Promise.all(
        projectConversations.map((conversation) =>
          deps.removeConversationWorktree(
            conversation.worktree_path,
            project.repo_path,
          ).catch((err) => {
            console.warn("[projects:delete] removeConversationWorktree failed for conversation",
              conversation.id, err);
          }),
        ),
      );
    } catch (err) {
      console.warn("[projects:delete] removeConversationWorktree batch threw:", err);
    }

    const deleted = deleteProjectById(db, trimmedId);
    if (!deleted) {
      return { ok: false as const, reason: "unknown" as const };
    }
    emitHostEvent("project.deleted", { projectId: trimmedId });
    return { ok: true as const };
  });

  ipcMain.handle(
    "projects:setArchived",
    async (_event, projectId: string, isArchived: boolean) => {
      if (typeof projectId !== "string" || !projectId.trim()) {
        return { ok: false as const, reason: "project_not_found" as const };
      }
      const trimmedId = projectId.trim();
      const db = getDb();
      const project = findProjectById(db, trimmedId);
      if (!project) {
        return { ok: false as const, reason: "project_not_found" as const };
      }

      const updated = updateProjectIsArchived(db, trimmedId, isArchived);
      if (!updated) {
        return { ok: false as const, reason: "unknown" as const };
      }

      emitHostEvent("project.archived", { projectId, isArchived });
      return { ok: true as const };
    }
  );

  ipcMain.handle(
    "projects:setIcon",
    async (_event, projectId: string, icon: string | null) => {
      if (typeof projectId !== "string" || !projectId.trim()) {
        return { ok: false as const, reason: "project_not_found" as const };
      }
      const trimmedId = projectId.trim();
      const db = getDb();
      const project = findProjectById(db, trimmedId);
      if (!project) {
        return { ok: false as const, reason: "project_not_found" as const };
      }

      const updated = updateProjectIcon(db, trimmedId, icon);
      if (!updated) {
        return { ok: false as const, reason: "unknown" as const };
      }

      emitHostEvent("project.icon_updated", { projectId, icon: icon ?? null });
      return { ok: true as const };
    }
  );

  ipcMain.handle(
    "projects:setHidden",
    async (_event, projectId: string, isHidden: boolean) => {
      if (typeof projectId !== "string" || !projectId.trim()) {
        return { ok: false as const, reason: "project_not_found" as const };
      }
      const trimmedId = projectId.trim();
      const db = getDb();
      const project = findProjectById(db, trimmedId);
      if (!project) {
        return { ok: false as const, reason: "project_not_found" as const };
      }

      const updated = updateProjectIsHidden(db, trimmedId, isHidden);
      if (!updated) {
        return { ok: false as const, reason: "unknown" as const };
      }

      emitHostEvent("project.visibility_changed", { projectId, isHidden });
      return { ok: true as const };
    }
  );

  // Scan project folder for image files (png, jpg, jpeg, gif, webp, svg, ico)
  ipcMain.handle(
    "projects:scanImages",
    async (_event, projectId: string) => {
      if (typeof projectId !== "string" || !projectId.trim()) {
        return { ok: false as const, reason: "project_not_found" as const, images: [] as string[] };
      }
      const trimmedId = projectId.trim();
      const db = getDb();
      const project = findProjectById(db, trimmedId);
      if (!project) {
        return { ok: false as const, reason: "project_not_found" as const, images: [] as string[] };
      }

      const repoPath = project.repo_path;
      if (!repoPath) {
        return { ok: false as const, reason: "project_not_found" as const, images: [] as string[] };
      }
      const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico"]);
      const images: string[] = [];
      const maxDepth = 3;
      const maxResults = 60;

      function scanDir(dirPath: string, depth: number) {
        if (depth > maxDepth || images.length >= maxResults) return;
        try {
          const entries = fs.readdirSync(dirPath, { withFileTypes: true });
          for (const entry of entries) {
            if (images.length >= maxResults) break;
            // Skip hidden dirs / node_modules / .git
            if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
              scanDir(fullPath, depth + 1);
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              if (imageExtensions.has(ext)) {
                images.push(fullPath);
              }
            }
          }
        } catch {
          // Permission errors, etc.
        }
      }

      scanDir(repoPath, 0);
      return { ok: true as const, images };
    }
  );

  // Open a native file dialog to pick an image
  ipcMain.handle(
    "projects:pickIconImage",
    async () => {
      const result = await dialog.showOpenDialog({
        title: "Choose an icon image",
        filters: [
          { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"] },
        ],
        properties: ["openFile"],
      });

      // @ts-ignore - Electron dialog type issue
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return null;
      }

      // @ts-ignore - Electron dialog type issue
      return result.filePaths[0] as string;
    }
  );

  // Convert image file to base64 data URL for display in <img> tags
  ipcMain.handle(
    "projects:imageToDataUrl",
    async (_event, imagePath: string) => {
      try {
        if (!imagePath || typeof imagePath !== 'string') {
          return null;
        }
        // Security: only allow reading from common project/user directories
        const normalizedPath = path.normalize(imagePath);
        if (normalizedPath.includes('..') || normalizedPath.startsWith('/etc') || normalizedPath.startsWith('/sys')) {
          return null;
        }
        const fileBuffer = fs.readFileSync(normalizedPath);
        const base64 = fileBuffer.toString('base64');
        const ext = path.extname(normalizedPath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
        };
        const mimeType = mimeTypes[ext] || 'image/png';
        return `data:${mimeType};base64,${base64}`;
      } catch {
        return null;
      }
    }
  );

  ipcMain.handle(
    "conversations:getHarnessFeedback",
    async (_event, conversationId: string) => {
      if (typeof conversationId !== "string" || !conversationId.trim()) {
        return { ok: false as const, reason: "conversation_not_found" as const };
      }
      const trimmed = conversationId.trim();
      const db = getDb();
      const conversation = findConversationById(db, trimmed);
      if (!conversation) {
        return { ok: false as const, reason: "conversation_not_found" as const };
      }
      return {
        ok: true as const,
        feedback: getConversationHarnessFeedback(db, trimmed),
      };
    },
  );

  ipcMain.handle(
    "conversations:setHarnessFeedback",
    async (
      _event,
      conversationId: string,
      input: { enabled?: boolean; userRating?: -1 | 1 | null } | null | undefined,
    ) => {
      if (typeof conversationId !== "string" || !conversationId.trim()) {
        return { ok: false as const, reason: "conversation_not_found" as const };
      }
      const trimmed = conversationId.trim();
      const db = getDb();
      const conversation = findConversationById(db, trimmed);
      if (!conversation) {
        return { ok: false as const, reason: "conversation_not_found" as const };
      }

      const existing = getConversationHarnessFeedback(db, trimmed);
      const enabled = typeof input?.enabled === "boolean" ? input.enabled : (existing?.enabled ?? false);
      const userRating = Object.prototype.hasOwnProperty.call(input ?? {}, "userRating")
        ? (input?.userRating ?? null)
        : (existing?.userRating ?? null);
      const agentDir = app.getPath("userData") + "/.pi/agent";
      const activeCandidateId = enabled
        ? (readActiveCandidate(agentDir) ?? getDefaultHarnessCandidate().id)
        : null;
      const harnessCandidate = enabled && activeCandidateId
        ? loadHarnessCandidate(agentDir, activeCandidateId)
        : null;
      const feedback = upsertConversationHarnessFeedback(db, {
        conversationId: trimmed,
        harnessCandidateId: harnessCandidate?.id ?? null,
        harnessSnapshot: harnessCandidate,
        enabled,
        userRating,
        userFeedbackSubmittedAt: Object.prototype.hasOwnProperty.call(input ?? {}, "userRating")
          ? new Date().toISOString()
          : (existing?.userFeedbackSubmittedAt ?? null),
      });

      for (const win of BrowserWindow.getAllWindows()) {
        try {
          win.webContents.send("workspace:conversationUpdated", {
            conversationId: trimmed,
            updatedAt: feedback.updatedAt,
          });
        } catch {
          // best effort
        }
      }

      return { ok: true as const, feedback };
    },
  );

  ipcMain.handle(
    "conversations:getMessageCache",
    async (_event, conversationId: string) => {
      if (typeof conversationId !== "string" || !conversationId.trim()) {
        return [];
      }
      const trimmed = conversationId.trim();
      const db = getDb();
      const conversation = findConversationById(db, trimmed);
      if (
        conversation?.runtime_location === "cloud" &&
        conversation.project_id
      ) {
        const project = findProjectById(db, conversation.project_id);
        const instance =
          project?.cloud_instance_id
            ? findCloudInstanceById(db, project.cloud_instance_id)
            : null;

        if (instance?.access_token) {
          try {
            if (!(await ensureFreshCloudSession(instance.id))) {
              throw new Error('Cloud session expired');
            }
            const freshInstance = findCloudInstanceById(db, instance.id) ?? instance;
            const response = await getAuthJson<{
              conversationId: string;
              messages: Array<{
                id: string;
                role: string;
                timestamp: number;
                content: string;
              }>;
            }>(
              new URL(
                `/v1/conversations/${encodeURIComponent(trimmed)}/messages`,
                freshInstance.base_url,
              ).toString(),
              freshInstance.access_token!,
            );

            replaceConversationMessagesCache(
              db,
              trimmed,
              response.messages.map((message) => ({
                id: message.id,
                role: message.role,
                payloadJson: JSON.stringify(message),
              })),
            );
          } catch {
            // Fall through to local cache if remote fetch fails.
          }
        }
      }

      const rows = listConversationMessagesCache(db, trimmed);
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

      if (conversation.title_source !== "placeholder") {
        return { ok: true as const, skipped: true as const };
      }

      const titreDeterministe = deps.construireTitreDeterministe(safeMessage);
      const updatedDeterministe = updateConversationTitle(
        db,
        conversationId,
        titreDeterministe,
        "auto-deterministic",
      );
      if (!updatedDeterministe) {
        return {
          ok: false as const,
          reason: "conversation_not_found" as const,
        };
      }
      deps.diffuserTitreConversation(conversationId, titreDeterministe);

      if (!deps.AFFINAGE_TITRE_IA_ACTIVE) {
        return {
          ok: true as const,
          title: titreDeterministe,
          source: "deterministic" as const,
        };
      }

      const project = conversation.project_id
        ? listProjects(db).find((item) => item.id === conversation.project_id)
        : null;
      const titleRepoPath = project?.repo_path ?? deps.getGlobalWorkspaceDir();
      const provider = conversation.model_provider ?? "litellm";
      const modelId = conversation.model_id ?? "gpt-5.5";
      const titreAffine = await deps.generateConversationTitleFromPi({
        provider,
        modelId,
        repoPath: titleRepoPath,
        firstMessage: safeMessage,
        projectId: conversation.project_id,
      });

      if (!titreAffine || titreAffine === titreDeterministe) {
        if (!titreAffine) {
          console.warn("[conversation-title] AI refinement returned no usable title", {
            conversationId,
            provider,
            modelId,
          });
        }
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
        "auto-ai",
      );
      if (!updatedAffine) {
        return {
          ok: true as const,
          title: titreDeterministe,
          source: "deterministic" as const,
        };
      }

      deps.diffuserTitreConversation(conversationId, titreAffine);
      return { ok: true as const, title: titreAffine, source: "ai" as const };
    },
  );

  ipcMain.handle(
    "workspace:detectProjectCommands",
    async (_event, conversationId: string) => {
      const db = getDb();
      const conversation = findConversationById(db, conversationId);
      if (!conversation) {
        return { ok: false, reason: "conversation_not_found" };
      }
      if (!conversation.project_id) {
        return { ok: false, reason: "project_not_found" };
      }

      const cached = deps.detectedProjectCommandsCache.get(conversationId);
      const customCommands = listProjectCustomTerminalCommands(
        db,
        conversation.project_id,
      ).map((item) => ({
        id: item.id,
        commandText: item.command_text,
        lastUsedAt: item.last_used_at,
      }));
      if (
        cached &&
        Date.now() - cached.timestamp < deps.DETECTED_PROJECT_COMMANDS_TTL_MS &&
        cached.result.ok
      ) {
        return { ...cached.result, customCommands };
      }
      const repo = deps.getConversationProjectRepoPath(conversationId);
      if (!repo.ok) {
        return repo;
      }
      const result = deps.buildDetectedProjectCommands(repo.repoPath);
      const finalResult = result.ok ? { ...result, customCommands } : result;
      deps.detectedProjectCommandsCache.set(conversationId, {
        timestamp: Date.now(),
        result: finalResult,
      });
      return finalResult;
    },
  );

  ipcMain.handle(
    "workspace:startProjectCommandTerminal",
    async (
      _event,
      conversationId: string,
      commandId: string,
      customCommandText?: string,
    ) => {
      const db = getDb();
      const conversation = findConversationById(db, conversationId);
      if (!conversation) {
        return {
          ok: false as const,
          reason: "conversation_not_found" as const,
        };
      }
      if (!conversation.project_id) {
        return { ok: false as const, reason: "project_not_found" as const };
      }

      // Check if conversation has open access mode for executing host commands
      if (conversation.access_mode !== "open") {
        return {
          ok: false as const,
          reason: "access_denied" as const,
          message: "Host command execution requires open access mode",
        };
      }

      const repo = deps.getConversationProjectRepoPath(conversationId);
      if (!repo.ok) {
        return repo;
      }
      const detected = deps.buildDetectedProjectCommands(repo.repoPath);
      if (!detected.ok) {
        return detected;
      }
      const savedCustomCommands = listProjectCustomTerminalCommands(
        db,
        conversation.project_id,
      );
      const customTarget = commandId.startsWith("custom:")
        ? savedCustomCommands.find(
            (command) => command.id === commandId.slice("custom:".length),
          )
        : null;
      const target =
        detected.commands.find((command: any) => command.id === commandId) ??
        (customTarget
          ? {
              id: commandId,
              label: customTarget.command_text,
              command: customTarget.command_text,
              args: [],
              source: "custom-history",
              cwd: repo.repoPath,
              isCustom: true,
              commandText: customTarget.command_text,
            }
          : commandId === "custom:new" && customCommandText?.trim()
            ? {
                id: commandId,
                label: customCommandText.trim(),
                command: customCommandText.trim(),
                args: [],
                source: "custom-input",
                cwd: repo.repoPath,
                isCustom: true,
                commandText: customCommandText.trim(),
              }
            : null);
      if (!target) {
        return { ok: false as const, reason: "command_not_found" as const };
      }
      const alreadyRunning = Array.from(deps.projectCommandRuns.values()).some(
        (run: any) =>
          run.conversationId === conversationId &&
          run.commandId === commandId &&
          run.status === "running",
      );
      if (alreadyRunning) {
        return { ok: false as const, reason: "already_running" as const };
      }

      // Wrap spawn + setup in try/catch: spawn() can throw synchronously
      // (malformed path, invalid args) and must not produce an unhandled IPC
      // rejection. saveProjectCustomTerminalCommand is also inside so its
      // potential throw is handled. Event listeners are set up afterward — they
      // cannot throw synchronously and exist as async callbacks.
      try {
        const runId = crypto.randomUUID();
        const startedAt = new Date().toISOString();
        const runCwd = target.cwd ?? repo.repoPath;
        const hostEnv = buildHostToolEnv(runCwd);
        const commandPreview = target.isCustom
          ? (target.commandText ?? target.label)
          : [target.command, ...target.args].join(" ");
        const resolvedCommand = target.isCustom
          ? null
          : resolveHostExecutable(target.command, hostEnv);
        const child = target.isCustom
          ? spawn(
              target.commandText ?? target.label,
              getProjectTerminalSpawnOptions(runCwd, hostEnv, true),
            )
          : spawn(
              resolvedCommand ?? target.command,
              target.args,
              getProjectTerminalSpawnOptions(runCwd, hostEnv, false),
            );

        const run: ProjectTerminalRun = {
          id: runId,
          conversationId,
          commandId,
          title: `${target.label} · ${runId.slice(0, 6)}`,
          commandLabel: target.label,
          commandPreview,
          cwd: runCwd,
          status: "running",
          exitCode: null,
          startedAt,
          endedAt: null,
          nextSeq: 1,
          events: [],
          process: child,
        };
        deps.projectCommandRuns.set(runId, run);
        // Capture Map reference in closure so cleanup works even if deps are reassigned
        const projectCommandRuns = deps.projectCommandRuns;
        if (target.isCustom && conversation.project_id) {
          saveProjectCustomTerminalCommand(
            db,
            conversation.project_id,
            target.commandText ?? target.label,
          );
        }
        deps.appendProjectCommandRunEvent(run, "meta", `$ ${commandPreview}\n`);

        child.stdout?.on("data", (chunk) => {
          deps.appendProjectCommandRunEvent(run, "stdout", String(chunk));
        });
        child.stderr?.on("data", (chunk) => {
          deps.appendProjectCommandRunEvent(run, "stderr", String(chunk));
        });
        child.on("error", (error) => {
          run.status = "failed";
          run.endedAt = new Date().toISOString();
          deps.appendProjectCommandRunEvent(
            run,
            "meta",
            `\nProcess error: ${error.message}\n`,
          );
          // Remove from Map after terminal process ends to prevent unbounded growth
          projectCommandRuns.delete(runId);
        });
        child.on("close", (code) => {
          if (run.status === "running") {
            run.status = code === 0 ? "exited" : "failed";
          }
          run.exitCode = typeof code === "number" ? code : null;
          run.endedAt = new Date().toISOString();
          deps.appendProjectCommandRunEvent(
            run,
            "meta",
            `\nProcess ended with code ${run.exitCode ?? "unknown"}.\n`,
          );
          // Remove from Map after terminal process ends to prevent unbounded growth
          projectCommandRuns.delete(runId);
        });

        return { ok: true as const, runId, startedAt };
      } catch (err) {
        console.warn(
          "[workspace:startProjectCommandTerminal] spawn threw unexpectedly:",
          err,
        );
        return {
          ok: false as const,
          reason: "spawn_failed" as const,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle(
    "workspace:readProjectCommandTerminal",
    async (_event, runId: string, afterSeq: number = 0) => {
      const run = deps.projectCommandRuns.get(runId);
      if (!run) {
        return { ok: false as const, reason: "run_not_found" as const };
      }
      return {
        ok: true as const,
        run: {
          id: run.id,
          title: run.title,
          commandLabel: run.commandLabel,
          commandPreview: run.commandPreview,
          status: run.status,
          exitCode: run.exitCode,
          startedAt: run.startedAt,
          endedAt: run.endedAt,
        },
        events: run.events.filter((event: any) => event.seq > afterSeq),
      };
    },
  );

  ipcMain.handle(
    "workspace:stopProjectCommandTerminal",
    async (_event, runId: string) => {
      const run = deps.projectCommandRuns.get(runId);
      if (!run) {
        return { ok: false as const, reason: "run_not_found" as const };
      }
      if (run.process && run.status === "running") {
        run.status = "stopped";
        run.endedAt = new Date().toISOString();
        deps.appendProjectCommandRunEvent(
          run,
          "meta",
          "\nProcess stopped by user.\n",
        );
        terminateProjectTerminalProcess(run.process);
      }
      const stoppedRun = {
        id: run.id,
        title: run.title,
        commandLabel: run.commandLabel,
        commandPreview: run.commandPreview,
        status: run.status,
        exitCode: run.exitCode,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
      };
      const events = run.events.slice();
      deps.projectCommandRuns.delete(runId);
      return { ok: true as const, run: stoppedRun, events };
    },
  );

  ipcMain.handle("pi:startSession", async (_event, conversationId: string) => {
    if (typeof conversationId !== "string" || !conversationId.trim()) {
      return { ok: false as const, reason: "conversationId is required" as const };
    }
    const db = getDb();
    const conversation = findConversationById(db, conversationId);
    if (!conversation) {
      return { ok: false as const, reason: "conversation_not_found" as const };
    }

    if (conversation.runtime_location === "cloud") {
      const ensured = await ensureCloudRuntimeSession(conversationId);
      if (!ensured.ok) {
        return ensured;
      }

      for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed()) continue;
        const webContents = win.webContents;
        if (webContents.isDestroyed()) continue;
        try {
          webContents.send("pi:event", {
            conversationId,
            event: {
              type: "runtime_status",
              status: "ready",
              message: "Cloud runtime ready",
            },
          });
        } catch (err) {
          console.warn("[startSession cloud] Failed to send pi:event to window:", err);
        }
      }

      return { ok: true as const, runtime: "cloud" as const };
    }

    const result = (await deps.piRuntimeManager.start(conversationId)) as
      | { ok: true }
      | { ok: false; reason: string; message: string };
    return result;
  });
  ipcMain.handle("pi:stopSession", async (_event, conversationId: string) => {
    if (typeof conversationId !== "string" || !conversationId.trim()) {
      return { ok: false as const, reason: "conversationId is required" as const };
    }
    const db = getDb();
    const conversation = findConversationById(db, conversationId);
    if (!conversation) {
      return { ok: false as const, reason: "conversation_not_found" as const };
    }

    if (conversation.runtime_location === "cloud") {
      const project = conversation.project_id
        ? findProjectById(db, conversation.project_id)
        : null;
      const instance =
        project?.cloud_instance_id
          ? findCloudInstanceById(db, project.cloud_instance_id)
          : null;

      if (instance && conversation.cloud_runtime_session_id) {
        const hasFreshSession = await ensureFreshCloudSession(instance.id);
        const freshInstance = findCloudInstanceById(db, instance.id) ?? instance;
        if (hasFreshSession && freshInstance.access_token) {
          await deleteRequestWithHeaders(
            new URL(
              `/v1/runtime/sessions/${encodeURIComponent(conversation.cloud_runtime_session_id)}`,
              getRuntimeHeadlessBaseUrl(freshInstance),
            ).toString(),
            {
              authorization: `Bearer ${freshInstance.access_token}`,
            },
          ).catch(() => undefined);
        }
      }

      saveConversationPiRuntime(db, conversationId, {
        cloudRuntimeSessionId: null,
      });
      return { ok: true as const, runtime: "cloud" as const };
    }

    // Always clean up Maps even if stop() throws — stale entries are worse than
    // a failed stop. The stop error still propagates.
    try {
      await deps.piRuntimeManager.stop(conversationId);
    } finally {
      clearConversationMaps(deps, conversationId);
    }

    return { ok: true as const };
  });
  ipcMain.handle(
    "pi:sendCommand",
    async (
      _event,
      conversationId: string,
      command: RpcCommand,
    ): Promise<RpcResponse> => {
      if (typeof conversationId !== "string" || !conversationId.trim()) {
        return {
          id: command.id,
          type: "response" as const,
          command: command.type,
          success: false,
          error: "conversationId is required",
        };
      }
      const db = getDb();
      const currentConversation = findConversationById(db, conversationId);
      if (!currentConversation) {
        return {
          id: command.id,
          type: "response",
          command: command.type,
          success: false,
          error: "conversation_not_found",
        };
      }

      if (currentConversation.runtime_location === "cloud") {
        const project = currentConversation.project_id
          ? findProjectById(db, currentConversation.project_id)
          : null;
        const instance =
          project?.cloud_instance_id
            ? findCloudInstanceById(db, project.cloud_instance_id)
            : null;
        const ensured = await ensureCloudRuntimeSession(conversationId);

        if (!instance || !ensured.ok) {
          return {
            id: command.id,
            type: "response",
            command: command.type,
            success: false,
            error: ensured.ok ? "cloud_instance_not_found" : ensured.message ?? ensured.reason,
          };
        }

        if (!(await ensureFreshCloudSession(instance.id))) {
          return {
            id: command.id,
            type: "response",
            command: command.type,
            success: false,
            error: "Cloud session expired. Please reconnect.",
          };
        }
        const freshInstance = findCloudInstanceById(db, instance.id) ?? instance;

        const response = await postJson<RpcResponse>(
          new URL(
            `/v1/runtime/sessions/${encodeURIComponent(ensured.sessionId)}/commands`,
            getRuntimeHeadlessBaseUrl(freshInstance),
          ).toString(),
          command,
          {
            authorization: `Bearer ${freshInstance.access_token}`,
          },
        ).catch(async (error) => {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes("404")) {
            await resetExpiredCloudRuntimeSession(conversationId);
            const retried = await ensureCloudRuntimeSession(conversationId);
            if (retried.ok) {
              return postJson<RpcResponse>(
                new URL(
                  `/v1/runtime/sessions/${encodeURIComponent(retried.sessionId)}/commands`,
                  getRuntimeHeadlessBaseUrl(freshInstance),
                ).toString(),
                command,
                {
                  authorization: `Bearer ${instance.access_token}`,
                },
              ).catch((retryError) => ({
                id: command.id,
                type: "response" as const,
                command: command.type,
                success: false,
                error:
                  retryError instanceof Error ? retryError.message : String(retryError),
              }));
            }
          }
          return {
            id: command.id,
            type: "response" as const,
            command: command.type,
            success: false,
            error: message,
          };
        });

          return response;
        }

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

      try {
        const response = await deps.piRuntimeManager.sendCommand(conversationId, command);
        return response;
      } catch (err) {
        console.warn("[pi:sendCommand] sendCommand threw:", err);
        return {
          id: command.id,
          type: "response" as const,
          command: command.type,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );
  ipcMain.handle("pi:getSnapshot", async (_event, conversationId: string) => {
    if (typeof conversationId !== "string" || !conversationId.trim()) {
      return { status: "error" as const, state: null, messages: [] };
    }
    const trimmedId = conversationId.trim();
    const db = getDb();
    const conversation = findConversationById(db, trimmedId);
    if (!conversation) {
      return { status: "error", state: null, messages: [] };
    }
    if (conversation.runtime_location === "cloud") {
      // Wrap cloud path: getCloudRuntimeSnapshot can throw (e.g. network error,
      // or the retry getJson at cloud.ts:933 for non-404 failures). The handler
      // must never produce an unhandled IPC rejection.
      try {
        return await getCloudRuntimeSnapshot(trimmedId);
      } catch (err) {
        console.warn("[pi:getSnapshot] getCloudRuntimeSnapshot threw unexpectedly:", err);
        return { status: "error", state: null, messages: [] };
      }
    }
    // Local path: piRuntimeManager.getSnapshot can also throw if the session is
    // in a bad state (e.g. process exited, DB corruption).
    try {
      return await deps.piRuntimeManager.getSnapshot(trimmedId);
    } catch (err) {
      console.warn("[pi:getSnapshot] piRuntimeManager.getSnapshot threw unexpectedly:", err);
      return { status: "error", state: null, messages: [] };
    }
  });
  ipcMain.handle(
    "pi:respondExtensionUi",
    (_event, conversationId: string, response: RpcExtensionUiResponse) => {
      if (typeof conversationId !== "string" || !conversationId.trim()) {
        return;
      }
      return deps.piRuntimeManager.respondExtensionUi(conversationId.trim(), response);
    },
  );

  ipcMain.handle("settings:getLanguagePreference", () =>
    getLanguagePreference(getDb()),
  );
  ipcMain.handle(
    "settings:updateLanguagePreference",
    (_event, language: unknown) => {
      if (typeof language !== "string" || !language.trim()) {
        return { ok: false as const, message: "language must be a non-empty string" };
      }
      const trimmed = language.trim();
      if (trimmed !== "fr" && trimmed !== "en") {
        return { ok: false as const, message: "unsupported language: use 'fr' or 'en'" };
      }
      saveLanguagePreference(getDb(), trimmed);
      return { ok: true as const };
    },
  );

  // Memory model preference
  ipcMain.handle("memory:getModelPreference", () => ({
    ok: true as const,
    modelKey: getMemoryModelPreference(),
  }));
  ipcMain.handle(
    "memory:setModelPreference",
    (_event, modelKey: string | null) => {
      setMemoryModelPreference(
        typeof modelKey === "string" && modelKey.trim() ? modelKey.trim() : null,
      );
      return { ok: true as const };
    },
  );

  // Title model preference
  ipcMain.handle("title:getModelPreference", () => ({
    ok: true as const,
    modelKey: getTitleModelPreference(),
  }));
  ipcMain.handle(
    "title:setModelPreference",
    (_event, modelKey: string | null) => {
      setTitleModelPreference(
        typeof modelKey === "string" && modelKey.trim() ? modelKey.trim() : null,
      );
      return { ok: true as const };
    },
  );

  // Autocomplete model preference
  ipcMain.handle("autocomplete:getModelPreference", () => {
    const prefs = getAutocompleteModelPreference();
    return {
      ok: true as const,
      enabled: prefs.enabled,
      modelKey: prefs.modelKey,
    };
  });
  ipcMain.handle(
    "autocomplete:setModelPreference",
    (_event, enabled: boolean, modelKey: string | null) => {
      setAutocompleteModelPreference(
        Boolean(enabled),
        typeof modelKey === "string" && modelKey.trim() ? modelKey.trim() : null,
      );
      return { ok: true as const };
    },
  );

  // Autocomplete suggestions
  ipcMain.handle(
    "autocomplete:getSuggestions",
    async (
      _event,
      params: {
        text: string;
        cursorPosition: number;
        conversationId?: string | null;
        maxSuggestions?: number;
      },
    ) => {
      try {
        const prefs = getAutocompleteModelPreference();
        if (!prefs.enabled) {
          return { ok: true as const, suggestions: [] };
        }

        // Get available models for fallback
        const modelsResult = await deps.listPiModelsCached();
        const availableModels = Array.isArray(modelsResult)
          ? (modelsResult as Array<{ key: string }>).map((m) => m.key)
          : [];

        const suggestions = await generateAutocompleteSuggestions({
          text: params.text,
          cursorPosition: params.cursorPosition,
          maxSuggestions: params.maxSuggestions ?? 3,
          modelKey: prefs.modelKey,
          availableModelKeys: availableModels,
        });

        return { ok: true as const, suggestions };
      } catch (error) {
        // Fail silently - autocomplete is a bonus feature
        console.warn("[Autocomplete] Failed to generate suggestions:", error);
        return {
          ok: false as const,
          suggestions: [],
          message: "Autocomplete unavailable",
        };
      }
    },
  );

  ipcMain.handle(
    "projects:importFromFolder",
    async (_event, folderPath: string) => {
      const db = getDb();
      if (!folderPath) {
        return { ok: false, reason: "invalid_path" as const };
      }

      const isGit = await deps.isGitRepo(folderPath);
      if (!isGit) {
        try {
          console.log(`Initializing git repository for project: ${folderPath}`);
          await deps.gitService.init(folderPath);
          await deps.gitService.addAll(folderPath);
          console.log(
            `Successfully initialized git repository for: ${folderPath}`,
          );
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
    },
  );
}

export async function stopWorkspaceHandlers(piRuntimeManager: {
  stopAll: () => Promise<unknown>;
}) {
  if (extensionQueueWorker) {
    clearInterval(extensionQueueWorker);
    extensionQueueWorker = null;
  }
  extensionQueueWorkerInFlight = false;
  if (memoryCaptureWorker) {
    clearInterval(memoryCaptureWorker);
    memoryCaptureWorker = null;
  }
  if (unsubscribePiRuntimeEvents) {
    unsubscribePiRuntimeEvents();
    unsubscribePiRuntimeEvents = null;
  }
  disconnectAllCloudRealtime();
  // Terminate all sandboxed extension workers
  shutdownExtensionWorkers();
  await piRuntimeManager.stopAll();
}

export function registerSystemHandlers() {
  ipcMain.handle(
    "sandbox:executeNodeCommand",
    async (
      _event,
      command: unknown,
      args: unknown,
      cwd?: unknown,
      timeout?: unknown,
    ) => {
      // Validate command: must be a non-empty string.
      if (typeof command !== "string" || !command.trim()) {
        return {
          success: false,
          stdout: "",
          stderr: "command must be a non-empty string",
          exitCode: 1,
        };
      }
      // Validate args: must be an array of strings.
      if (
        !Array.isArray(args) ||
        !args.every((a) => typeof a === "string")
      ) {
        return {
          success: false,
          stdout: "",
          stderr: "args must be an array of strings",
          exitCode: 1,
        };
      }
      // Validate cwd: if provided, must be a non-empty string.
      if (cwd !== undefined && (typeof cwd !== "string" || !cwd.trim())) {
        return {
          success: false,
          stdout: "",
          stderr: "cwd must be a non-empty string",
          exitCode: 1,
        };
      }
      // Validate timeout: if provided, must be a positive number.
      if (
        timeout !== undefined &&
        (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0)
      ) {
        return {
          success: false,
          stdout: "",
          stderr: "timeout must be a positive number",
          exitCode: 1,
        };
      }
      const { sandboxManager } =
        await import("../lib/sandbox/sandbox-manager.js");
      return sandboxManager.executeNodeCommand(
        command.trim(),
        args,
        typeof cwd === "string" ? cwd.trim() : undefined,
        typeof timeout === "number" ? timeout : undefined,
      );
    },
  );

  ipcMain.handle(
    "sandbox:executeNpmCommand",
    async (_event, args: unknown, cwd?: unknown) => {
      // Validate args: must be an array of strings.
      if (
        !Array.isArray(args) ||
        !args.every((a) => typeof a === "string")
      ) {
        return {
          success: false,
          stdout: "",
          stderr: "args must be an array of strings",
          exitCode: 1,
        };
      }
      // Validate cwd: if provided, must be a non-empty string.
      if (cwd !== undefined && (typeof cwd !== "string" || !cwd.trim())) {
        return {
          success: false,
          stdout: "",
          stderr: "cwd must be a non-empty string",
          exitCode: 1,
        };
      }
      const { sandboxManager } =
        await import("../lib/sandbox/sandbox-manager.js");
      return sandboxManager.executeNpmCommand(
        args,
        typeof cwd === "string" ? cwd.trim() : undefined,
      );
    },
  );

  ipcMain.handle(
    "sandbox:executePythonCommand",
    async (_event, args: unknown, cwd?: unknown, timeout?: unknown) => {
      // Validate args: must be an array of strings.
      if (
        !Array.isArray(args) ||
        !args.every((a) => typeof a === "string")
      ) {
        return {
          success: false,
          stdout: "",
          stderr: "args must be an array of strings",
          exitCode: 1,
        };
      }
      // Validate cwd: if provided, must be a non-empty string.
      if (cwd !== undefined && (typeof cwd !== "string" || !cwd.trim())) {
        return {
          success: false,
          stdout: "",
          stderr: "cwd must be a non-empty string",
          exitCode: 1,
        };
      }
      // Validate timeout: if provided, must be a positive number.
      if (
        timeout !== undefined &&
        (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0)
      ) {
        return {
          success: false,
          stdout: "",
          stderr: "timeout must be a positive number",
          exitCode: 1,
        };
      }
      const { sandboxManager } =
        await import("../lib/sandbox/sandbox-manager.js");
      return sandboxManager.executePythonCommand(
        args,
        typeof cwd === "string" ? cwd.trim() : undefined,
        typeof timeout === "number" ? timeout : undefined,
      );
    },
  );

  ipcMain.handle(
    "sandbox:executePipCommand",
    async (_event, args: unknown, cwd?: unknown) => {
      // Validate args: must be an array of strings.
      if (
        !Array.isArray(args) ||
        !args.every((a) => typeof a === "string")
      ) {
        return {
          success: false,
          stdout: "",
          stderr: "args must be an array of strings",
          exitCode: 1,
        };
      }
      // Validate cwd: if provided, must be a non-empty string.
      if (cwd !== undefined && (typeof cwd !== "string" || !cwd.trim())) {
        return {
          success: false,
          stdout: "",
          stderr: "cwd must be a non-empty string",
          exitCode: 1,
        };
      }
      const { sandboxManager } =
        await import("../lib/sandbox/sandbox-manager.js");
      return sandboxManager.executePipCommand(
        args,
        typeof cwd === "string" ? cwd.trim() : undefined,
      );
    },
  );

  ipcMain.handle("sandbox:checkNodeAvailability", async () => {
    // Dynamic import and delegation can both throw: module-not-found, syntax
    // error in the module graph, or the manager method itself. Wrap so the
    // renderer always gets a safe typed response, never an unhandled rejection.
    try {
      const { sandboxManager } =
        await import("../lib/sandbox/sandbox-manager.js");
      return await sandboxManager.checkNodeAvailability();
    } catch (err) {
      console.warn("[sandbox:checkNodeAvailability] failed:", err);
      return {
        available: false as const,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle(
    "sandbox:checkPythonAvailability",
    async (_event, cwd?: string) => {
      // Validate cwd if provided (must be a non-empty string path).
      if (cwd !== undefined && (typeof cwd !== "string" || !cwd.trim())) {
        return { available: false as const, error: "cwd must be a non-empty string" };
      }
      try {
        const { sandboxManager } =
          await import("../lib/sandbox/sandbox-manager.js");
        return await sandboxManager.checkPythonAvailability(
          cwd?.trim() ?? undefined,
        );
      } catch (err) {
        console.warn("[sandbox:checkPythonAvailability] failed:", err);
        return {
          available: false as const,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle("sandbox:cleanup", async () => {
    try {
      const { sandboxManager } =
        await import("../lib/sandbox/sandbox-manager.js");
      sandboxManager.cleanup();
    } catch (error) {
      // Defensive: cleanup should never fail from the caller's perspective.
      // Underlying sandbox.cleanup() methods have internal try/catch, but
      // we wrap the outer call here to guarantee { success: true } is
      // returned regardless of unexpected synchronous errors.
      console.warn("[sandbox:cleanup] Unexpected error during cleanup:", error);
    }
    return { success: true };
  });

  registerSystemUtilityHandlers();
  registerComposerHandlers();

  // Performance tracing (dev mode)
  let tracingActive = false;

  ipcMain.handle("tracing:start", async () => {
    if (tracingActive) {
      return { ok: false, message: "Tracing already active" };
    }
    try {
      const { contentTracing } = electron;
      await contentTracing.startRecording({
        included_categories: ["*"],
      });
      tracingActive = true;
      return { ok: true };
    } catch (error) {
      console.error("Failed to start tracing:", error);
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("tracing:stop", async () => {
    if (!tracingActive) {
      return { ok: false, message: "No active tracing session" };
    }
    try {
      const { BrowserWindow, contentTracing, dialog } = electron;
      const tempPath = await contentTracing.stopRecording();
      tracingActive = false;

      const win = BrowserWindow.getFocusedWindow();
      const result = await dialog.showSaveDialog(win ?? BrowserWindow.getAllWindows()[0], {
        title: "Save performance trace",
        defaultPath: `chaton-trace-${Date.now()}.json`,
        filters: [{ name: "JSON Trace", extensions: ["json"] }],
      });

      // @ts-ignore - Electron dialog type issue
      if (result.canceled || !result.filePath) {
        try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
        return { ok: true, cancelled: true };
      }

      // @ts-ignore - Electron dialog type issue
      fs.copyFileSync(tempPath, result.filePath);
      try { fs.unlinkSync(tempPath); } catch { /* ignore */ }

      // @ts-ignore - Electron dialog type issue
      return { ok: true, filePath: result.filePath };
    } catch (error) {
      tracingActive = false;
      console.error("Failed to stop tracing:", error);
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });
}
