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
import { getSentryTelemetry } from "../lib/telemetry/sentry.js";
import { OAuthProvider } from "@mariozechner/pi-ai";
import { getOAuthProvider } from "@mariozechner/pi-ai/oauth";
import type { GitDiffSummaryResult } from "./workspace.js";
import path from "node:path";
import { spawn } from "node:child_process";
import { buildHostToolEnv, resolveHostExecutable } from "../lib/env/host-env.js";
import {
  connectCloudRealtime,
  createPkceChallenge,
  createPkceVerifier,
  deleteCloudOidcVerifier,
  deleteRequestWithHeaders,
  ensureCloudRuntimeSession,
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
  process: import("node:child_process").ChildProcess | null;
};


type RegisterWorkspaceHandlersDeps = {
  toWorkspacePayload: () => Record<string, unknown>;
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
      const subagentResult = await deps.piRuntimeManager.runChannelSubagent(
        conversationId,
        message,
      );
      if (!subagentResult.ok) {
        return { ok: false as const, message: subagentResult.message };
      }

      const reply = subagentResult.reply;

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
      return { ok: true as const, reply };
    },
  };

  // Store for active tool execution context (conversationId currently executing)
  const activeToolExecutionContext = new Map<string, string>(); // requestId -> conversationId
  const activeToolExecutionSignals = new Map<string, AbortSignal>(); // requestId -> AbortSignal
  const activeToolCallIdByConversation = new Map<string, string>(); // conversationId -> requestId
  const touchedPathsByToolCall = new Map<string, Set<string>>(); // requestId -> relative repo paths

  (globalThis as Record<string, unknown>).__chatonsToolExecutionContextStart = (
    requestId: string,
    conversationId: string,
    signal?: AbortSignal,
  ) => {
    activeToolExecutionContext.set(requestId, conversationId);
    touchedPathsByToolCall.set(requestId, new Set());
    if (signal) {
      activeToolExecutionSignals.set(requestId, signal);
    }
  };

  (globalThis as Record<string, unknown>).__chatonsToolExecutionContextEnd = (
    requestId: string,
  ) => {
    activeToolExecutionContext.delete(requestId);
    activeToolExecutionSignals.delete(requestId);
  };

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
  ): AbortSignal | undefined => activeToolExecutionSignals.get(requestId);



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
    try {
      await syncConnectedCloudInstances();
      const db = getDb();
      for (const instance of listCloudInstances(db)) {
        if (instance.access_token) {
          void connectCloudRealtime(instance.id);
        }
      }
      const cloudAccount = await getPrimaryCloudAccount();
      const payload = deps.toWorkspacePayload();
      const updatesResult = await checkForExtensionUpdates();
      return {
        ...payload,
        cloudAccount: cloudAccount.account,
        cloudAdminUsers: cloudAccount.users,
        extensionUpdatesCount: updatesResult.updates.length,
      };
    } catch (error) {
      console.error("Erreur lors de la récupération de l'état initial:", error);
      return {
        projects: [],
        conversations: [],
        cloudInstances: [],
        cloudAccount: null,
        cloudAdminUsers: [],
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
          anonymousInstallId: null,
        },
        extensionUpdatesCount: 0,
      };
    }
  });

  ipcMain.handle(
    "workspace:getGitDiffSummary",
    async (_event, conversationId: string) =>
      deps.getGitDiffSummaryForConversation(conversationId),
  );
  ipcMain.handle(
    "workspace:getGitFileDiff",
    (_event, conversationId: string, filePath: string) =>
      deps.getGitFileDiffForConversation(conversationId, filePath),
  );
  ipcMain.handle(
    "workspace:getTouchedFilesForToolCall",
    (_event, toolCallId: string) => Array.from(touchedPathsByToolCall.get(toolCallId) ?? []),
  );
  ipcMain.handle(
    "workspace:getWorktreeGitInfo",
    (_event, conversationId: string) => deps.getWorktreeGitInfo(conversationId),
  );
  ipcMain.handle(
    "workspace:generateWorktreeCommitMessage",
    (_event, conversationId: string) =>
      deps.generateWorktreeCommitMessage(conversationId),
  );
  ipcMain.handle(
    "workspace:stageWorktreeFile",
    (_event, conversationId: string, filePath: string) =>
      deps.stageWorktreeFile(conversationId, filePath),
  );
  ipcMain.handle(
    "workspace:unstageWorktreeFile",
    (_event, conversationId: string, filePath: string) =>
      deps.unstageWorktreeFile(conversationId, filePath),
  );
  ipcMain.handle(
    "workspace:commitWorktree",
    (_event, conversationId: string, message: string) =>
      deps.commitWorktree(conversationId, message),
  );
  ipcMain.handle(
    "workspace:mergeWorktreeIntoMain",
    (_event, conversationId: string) =>
      deps.mergeWorktreeIntoMain(conversationId),
  );
  ipcMain.handle(
    "workspace:pullWorktreeBranch",
    (_event, conversationId: string) => deps.pullWorktreeBranch(conversationId),
  );
  ipcMain.handle(
    "workspace:pushWorktreeBranch",
    (_event, conversationId: string) => deps.pushWorktreeBranch(conversationId),
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
      console.log("[Cloud] cloud:connectInstance called", { input });
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
      console.log("[Cloud] cloud:startAuth called", { input });
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

      const discovery = await getJson<{
        issuer: string;
        authorization_endpoint: string;
      }>(
        new URL("/.well-known/openid-configuration", normalizedBaseUrl).toString(),
      );

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
      console.log("[Cloud] cloud:completeAuth called", { payload });
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
      console.log("[Cloud] cloud:updateInstanceStatus", { instanceId, status, lastError });
      const db = getDb();
      const updated = updateCloudInstanceStatus(db, instanceId, status, lastError);
      if (!updated) {
        return { ok: false as const, reason: "instance_not_found" as const };
      }
      return { ok: true as const };
    },
  );

  ipcMain.handle("cloud:getAccount", async () => {
    console.log("[Cloud] cloud:getAccount called");
    const { account, users, reason } = await getPrimaryCloudAccount();
    console.log("[Cloud] getPrimaryCloudAccount result", { hasAccount: !!account, usersCount: users.length, reason });
    if (!account) {
      return { ok: false as const, reason: (reason ?? "not_connected") as "not_connected" | "session_expired" | "unknown" };
    }
    return { ok: true as const, account, users };
  });

  ipcMain.handle("cloud:logout", async () => {
    console.log("[Cloud] cloud:logout called");
    const db = getDb();
    const instance = listCloudInstances(db).find((entry) => Boolean(entry.access_token));
    console.log("[Cloud] logout - found instance", { instanceId: instance?.id, hasToken: !!instance?.access_token });
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
      const db = getDb();
      const instance = listCloudInstances(db).find((entry) => Boolean(entry.access_token));
      if (!instance?.access_token) {
        return { ok: false as const, reason: "not_connected" as const };
      }

      const response = await fetch(
        new URL(`/v1/admin/users/${encodeURIComponent(userId)}`, instance.base_url).toString(),
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${instance.access_token}`,
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
      const db = getDb();
      const instance = listCloudInstances(db).find((entry) => Boolean(entry.access_token));
      if (!instance?.access_token) {
        return { ok: false as const, reason: "not_connected" as const };
      }

      const response = await fetch(
        new URL(`/v1/admin/users/${encodeURIComponent(userId)}/grant-subscription`, instance.base_url).toString(),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${instance.access_token}`,
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
      planId: "plus" | "pro" | "max",
      updates: { label?: string; parallelSessionsLimit?: number; isDefault?: boolean },
    ) => {
      const db = getDb();
      const instance = listCloudInstances(db).find((entry) => Boolean(entry.access_token));
      if (!instance?.access_token) {
        return { ok: false as const, reason: "not_connected" as const };
      }

      const response = await fetch(
        new URL(`/v1/admin/plans/${encodeURIComponent(planId)}`, instance.base_url).toString(),
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${instance.access_token}`,
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

      try {
        await postAuthJson(
          new URL("/v1/projects", instance.base_url).toString(),
          instance.access_token,
          {
            name: trimmedName,
            organizationId: params.organizationId.trim() || "",
            kind: params.kind,
            repository: params.repository ?? null,
          },
        );
      } catch {
        return { ok: false as const, reason: "unknown" as const };
      }

      const syncResult = await syncCloudInstanceBootstrap(instance.id);
      if (!syncResult.ok) {
        return { ok: false as const, reason: "unknown" as const };
      }

      const projects = listProjects(db);
      const project = projects.find(
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
    async (_event, provider: string, id: string, scoped: boolean) =>
      deps.setPiModelScoped(provider, id, scoped),
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
        console.log(
          `[pi] updateModelsJson inspecting provider "${providerName}" with api="${String(providerConfig.api ?? "")}" baseUrl="${String(providerConfig.baseUrl ?? "")}" hasApiKey=${typeof providerConfig.apiKey === "string" && providerConfig.apiKey.trim().length > 0}`,
        );
        const existingModels = providerConfig.models;
        if (Array.isArray(existingModels) && existingModels.length > 0) {
          console.log(
            `[pi] updateModelsJson skipping discovery for "${providerName}" because ${existingModels.length} model(s) are already present`,
          );
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
          console.log(
            `[pi] updateModelsJson discovery produced no models for "${providerName}" message="${String(("message" in typedDiscovered && typedDiscovered.message) || "")}"`,
          );
          return;
        }
        console.log(
          `[pi] updateModelsJson discovered ${typedDiscovered.models.length} model(s) for "${providerName}"`,
        );
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
              message: "source requis",
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
              message: "source requis",
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
      return { ok: false as const, message: "providerId requis" };
    }
    const provider = getOAuthProvider(providerId.trim());
    if (!provider) {
      return {
        ok: false as const,
        message: `Provider OAuth inconnu: ${providerId}`,
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
        promptReject(new Error("Annulé par l'utilisateur"));
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
  ipcMain.handle("skills:getMarketplaceFiltered", async (_event, options) =>
    deps.getSkillsMarketplaceFiltered(options),
  );
  ipcMain.handle("skills:getRatings", (_event, skillSource?: string) =>
    deps.getSkillsRatings(skillSource),
  );
  ipcMain.handle(
    "skills:addRating",
    (_event, skillSource: string, rating: number, review?: string) =>
      deps.addSkillRating(skillSource, rating, review),
  );
  ipcMain.handle("skills:getAverageRating", (_event, skillSource: string) =>
    deps.getSkillAverageRating(skillSource),
  );
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
    const result = installChatonsExtension(id);
    if (result.ok) {
      loadExtensionManifestIntoRegistry(id);
      emitHostEvent("extension.installed", { extensionId: id });
      void ensureExtensionServerStarted(id);
    }
    return result;
  });
  ipcMain.handle("extensions:installState", (_event, id: string) =>
    getChatonsExtensionInstallState(id),
  );
  ipcMain.handle("extensions:cancelInstall", (_event, id: string) =>
    cancelChatonsExtensionInstall(id),
  );
  ipcMain.handle(
    "extensions:toggle",
    async (_event, id: string, enabled: boolean) => {
      const result = toggleChatonsExtension(id, enabled);
      if (enabled) {
        loadExtensionManifestIntoRegistry(id);
        emitHostEvent("extension.enabled", { extensionId: id });
        await ensureExtensionServerStarted(id);
      }
      return result;
    },
  );
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
  ipcMain.handle("extensions:getManifest", (_event, extensionId: string) => ({
    ok: true as const,
    manifest: getExtensionManifest(extensionId),
  }));
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
    (_event, extensionId: string, key: string) =>
      storageKvGet(extensionId, key),
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
  ipcMain.handle("extensions:storage:kv:list", (_event, extensionId: string) =>
    storageKvListEntries(extensionId),
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
    (
      _event,
      extensionId: string,
      method: string,
      params?: Record<string, unknown>,
    ) => hostCall(extensionId, method, params),
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
    ) =>
      extensionsCall(
        callerExtensionId,
        extensionId,
        apiName,
        versionRange,
        payload,
      ),
  );
  ipcMain.handle("extensions:runtime:health", () =>
    getExtensionRuntimeHealth(),
  );
  ipcMain.handle("extensions:checkUpdates", () => checkForExtensionUpdates());
  ipcMain.handle("extensions:update", (_event, id: string) =>
    updateChatonsExtension(id),
  );
  ipcMain.handle("extensions:updateAll", () => updateAllChatonsExtensions());
  ipcMain.handle(
    "extensions:publish",
    (_event, id: string, npmToken?: string) =>
      publishChatonsExtension(id, npmToken),
  );

  ipcMain.handle("extensions:checkStoredNpmToken", () => checkStoredNpmToken());

  ipcMain.handle("extensions:clearStoredNpmToken", () => clearStoredNpmToken());

  ipcMain.handle(
    "pi:openPath",
    async (_event, target: "settings" | "models" | "sessions") => {
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
      const db = getDb();
      const project = findProjectById(db, projectId);
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
          message: "sessionFile requis",
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
      projectId: string,
      options?: {
        modelProvider?: string;
        modelId?: string;
        thinkingLevel?: string;
        accessMode?: "secure" | "open";
        channelExtensionId?: string;
      },
    ) => {
      const db = getDb();
      const project = listProjects(db).find((item) => item.id === projectId);
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

        const title = `New - ${project.name}`;
        try {
          await postAuthJson(
            new URL("/v1/conversations", instance.base_url).toString(),
            instance.access_token,
            {
              projectId: project.id,
              title,
              modelProvider: options?.modelProvider ?? null,
              modelId: options?.modelId ?? null,
            },
          );
        } catch {
          return { ok: false as const, reason: "unknown" as const };
        }

        const syncResult = await syncCloudInstanceBootstrap(instance.id);
        if (!syncResult.ok) {
          return { ok: false as const, reason: "unknown" as const };
        }

        const conversation = listConversationsByProjectId(db, project.id).find(
          (entry) => entry.title === title,
        );
        if (!conversation) {
          return { ok: false as const, reason: "unknown" as const };
        }

        emitHostEvent("conversation.created", { conversationId: conversation.id, projectId });
        return {
          ok: true as const,
          conversation: deps.mapConversation(conversation),
        };
      }

      const conversationId = crypto.randomUUID();
      const runtimeLocation = project.cloud_instance_id ? "cloud" : "local";
      insertConversation(db, {
        id: conversationId,
        projectId,
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
      emitHostEvent("conversation.created", { conversationId, projectId });
      return {
        ok: true as const,
        conversation: deps.mapConversation(conversation),
      };
    },
  );

  ipcMain.handle(
    "conversations:enableWorktree",
    async (_event, conversationId: string) => {
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
      await deps.removeConversationWorktree(
        conversation.worktree_path,
        project?.repo_path ?? null,
      );
      clearConversationWorktreePath(db, conversationId);
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
        // Stop the current Pi session
        await deps.piRuntimeManager.stop(conversationId);

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

        // Send a system message informing the agent about the mode change
        const modeChangeMessage = buildAccessModeChangeMessage(previousAccessMode, nextAccessMode);
        await deps.piRuntimeManager.sendCommand(conversationId, {
          type: "prompt",
          message: modeChangeMessage,
          streamingBehavior: "steer",
        });
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
      const db = getDb();
      const conversation = findConversationById(db, conversationId);
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

      await deps.piRuntimeManager.stop(conversationId);
      const archived = updateConversationStatus(db, conversationId, "archived");
      if (!archived) {
        return {
          ok: false as const,
          reason: "conversation_not_found" as const,
        };
      }
      void captureConversationMemoryNow(
        conversationId,
        deps.piRuntimeManager as unknown as Parameters<typeof captureConversationMemoryNow>[1],
      )
        .then((result) => {
          for (const win of BrowserWindow.getAllWindows()) {
            if (win.isDestroyed()) continue;
            const webContents = win.webContents;
            if (webContents.isDestroyed()) continue;
            try {
              webContents.send("memory:saving", {
                conversationId,
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
                conversationId,
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
        await deps.removeConversationWorktree(
          conversation.worktree_path,
          project?.repo_path ?? null,
        );
      }
      emitHostEvent("conversation.updated", {
        conversationId,
        type: "archived",
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
        deps.piRuntimeManager.stop(conversation.id),
      ),
    );
    await Promise.all(
      projectConversations.map((conversation) =>
        deps.removeConversationWorktree(
          conversation.worktree_path,
          project.repo_path,
        ),
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
    "projects:setArchived",
    async (_event, projectId: string, isArchived: boolean) => {
      const db = getDb();
      const project = findProjectById(db, projectId);
      if (!project) {
        return { ok: false as const, reason: "project_not_found" as const };
      }

      const updated = updateProjectIsArchived(db, projectId, isArchived);
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
      const db = getDb();
      const project = findProjectById(db, projectId);
      if (!project) {
        return { ok: false as const, reason: "project_not_found" as const };
      }

      const updated = updateProjectIcon(db, projectId, icon);
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
      const db = getDb();
      const project = findProjectById(db, projectId);
      if (!project) {
        return { ok: false as const, reason: "project_not_found" as const };
      }

      const updated = updateProjectIsHidden(db, projectId, isHidden);
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
      const db = getDb();
      const project = findProjectById(db, projectId);
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
    "conversations:getMessageCache",
    async (_event, conversationId: string) => {
      const db = getDb();
      const conversation = findConversationById(db, conversationId);
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
                `/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
                instance.base_url,
              ).toString(),
              instance.access_token,
            );

            replaceConversationMessagesCache(
              db,
              conversationId,
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
      const provider = conversation.model_provider ?? "openai-codex";
      const modelId = conversation.model_id ?? "gpt-5.3-codex";
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
        ? spawn(target.commandText ?? target.label, {
            cwd: runCwd,
            env: hostEnv,
            shell: true,
          })
        : spawn(resolvedCommand ?? target.command, target.args, {
            cwd: runCwd,
            env: hostEnv,
            shell: false,
          });

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
      });

      return { ok: true as const, runId, startedAt };
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
        run.process.kill("SIGTERM");
      }
      return { ok: true as const };
    },
  );

  ipcMain.handle("pi:startSession", async (_event, conversationId: string) => {
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
        await deleteRequestWithHeaders(
          new URL(
            `/v1/runtime/sessions/${encodeURIComponent(conversation.cloud_runtime_session_id)}`,
            getRuntimeHeadlessBaseUrl(instance.base_url),
          ).toString(),
          {
            authorization: `Bearer ${instance.access_token}`,
          },
        ).catch(() => undefined);
      }

      saveConversationPiRuntime(db, conversationId, {
        cloudRuntimeSessionId: null,
      });
      return { ok: true as const, runtime: "cloud" as const };
    }

    return deps.piRuntimeManager.stop(conversationId);
  });
  ipcMain.handle(
    "pi:sendCommand",
    async (
      _event,
      conversationId: string,
      command: RpcCommand,
    ): Promise<RpcResponse> => {
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

        const response = await postJson<RpcResponse>(
          new URL(
            `/v1/runtime/sessions/${encodeURIComponent(ensured.sessionId)}/commands`,
            getRuntimeHeadlessBaseUrl(instance.base_url),
          ).toString(),
          command,
          {
            authorization: `Bearer ${instance.access_token}`,
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
                  getRuntimeHeadlessBaseUrl(instance.base_url),
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

      const response = await deps.piRuntimeManager.sendCommand(conversationId, command);
      return response;
    },
  );
  ipcMain.handle("pi:getSnapshot", async (_event, conversationId: string) => {
    const db = getDb();
    const conversation = findConversationById(db, conversationId);
    if (!conversation) {
      return { status: "error", state: null, messages: [] };
    }
    if (conversation.runtime_location === "cloud") {
      return getCloudRuntimeSnapshot(conversationId);
    }
    return deps.piRuntimeManager.getSnapshot(conversationId);
  });
  ipcMain.handle(
    "pi:respondExtensionUi",
    (_event, conversationId: string, response: RpcExtensionUiResponse) =>
      deps.piRuntimeManager.respondExtensionUi(conversationId, response),
  );

  ipcMain.handle("settings:getLanguagePreference", () =>
    getLanguagePreference(getDb()),
  );
  ipcMain.handle(
    "settings:updateLanguagePreference",
    (_event, language: string) => {
      saveLanguagePreference(getDb(), language);
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
      command: string,
      args: string[],
      cwd?: string,
      timeout?: number,
    ) => {
      const { sandboxManager } =
        await import("../lib/sandbox/sandbox-manager.js");
      return sandboxManager.executeNodeCommand(command, args, cwd, timeout);
    },
  );

  ipcMain.handle(
    "sandbox:executeNpmCommand",
    async (_event, args: string[], cwd?: string) => {
      const { sandboxManager } =
        await import("../lib/sandbox/sandbox-manager.js");
      return sandboxManager.executeNpmCommand(args, cwd);
    },
  );

  ipcMain.handle(
    "sandbox:executePythonCommand",
    async (_event, args: string[], cwd?: string, timeout?: number) => {
      const { sandboxManager } =
        await import("../lib/sandbox/sandbox-manager.js");
      return sandboxManager.executePythonCommand(args, cwd, timeout);
    },
  );

  ipcMain.handle(
    "sandbox:executePipCommand",
    async (_event, args: string[], cwd?: string) => {
      const { sandboxManager } =
        await import("../lib/sandbox/sandbox-manager.js");
      return sandboxManager.executePipCommand(args, cwd);
    },
  );

  ipcMain.handle("sandbox:checkNodeAvailability", async () => {
    const { sandboxManager } =
      await import("../lib/sandbox/sandbox-manager.js");
    return sandboxManager.checkNodeAvailability();
  });

  ipcMain.handle(
    "sandbox:checkPythonAvailability",
    async (_event, cwd?: string) => {
      const { sandboxManager } =
        await import("../lib/sandbox/sandbox-manager.js");
      return sandboxManager.checkPythonAvailability(cwd);
    },
  );

  ipcMain.handle("sandbox:cleanup", async () => {
    const { sandboxManager } =
      await import("../lib/sandbox/sandbox-manager.js");
    sandboxManager.cleanup();
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
