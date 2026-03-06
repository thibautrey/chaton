import electron from "electron";
const { app, BrowserWindow, dialog, ipcMain, shell } = electron;
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

import {
  clearConversationWorktreePath,
  deleteConversationById,
  findConversationById,
  insertConversation,
  listConversationsByProjectId,
  listConversationMessagesCache,
  replaceConversationMessagesCache,
  saveConversationPiRuntime,
  updateConversationTitle,
} from "../db/repos/conversations.js";
import { getLanguagePreference, saveLanguagePreference, saveSidebarSettings } from "../db/repos/settings.js";
import { listQuickActionsUsage, recordQuickActionUse } from "../db/repos/quick-actions-usage.js";
import { deleteProjectById, findProjectById, findProjectByRepoPath, insertProject, listProjects } from "../db/repos/projects.js";
import {
  listProjectCustomTerminalCommands,
  saveProjectCustomTerminalCommand,
} from "../db/repos/project-custom-terminal-commands.js";
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
  registerExtensionServer,
  storageFilesRead,
  storageFilesWrite,
  storageKvDeleteEntry,
  storageKvGet,
  storageKvListEntries,
  storageKvSet,
  subscribeExtension,
} from "../extensions/runtime.js";
import {
  cancelChatonsExtensionInstall,
  checkForExtensionUpdates,
  getChatonsExtensionInstallState,
  getChatonsExtensionLogs,
  getChatonsExtensionsBaseDir,
  installChatonsExtension,
  listChatonsExtensionCatalog,
  listChatonsExtensions,
  removeChatonsExtension,
  runChatonsExtensionHealthCheck,
  toggleChatonsExtension,
  updateAllChatonsExtensions,
  updateChatonsExtension,
} from "../extensions/manager.js";
import { getDb } from "../db/index.js";
import type {
  DbConversation,
} from "../db/repos/conversations.js";
import type { DbSidebarSettings } from "../db/repos/settings.js";
import type {
  PiRendererEvent,
  RpcCommand,
  RpcExtensionUiResponse,
  RpcResponse,
} from "../pi-sdk-runtime.js";

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
  events: Array<{ seq: number; stream: "stdout" | "stderr" | "meta"; text: string }>;
  process: import("node:child_process").ChildProcess | null;
};

type RegisterWorkspaceHandlersDeps = {
  toWorkspacePayload: () => Record<string, unknown>;
  getGitDiffSummaryForConversation: (conversationId: string) => Promise<unknown> | unknown;
  getGitFileDiffForConversation: (conversationId: string, filePath: string) => Promise<unknown> | unknown;
  getWorktreeGitInfo: (conversationId: string) => Promise<unknown>;
  generateWorktreeCommitMessage: (conversationId: string) => Promise<unknown>;
  commitWorktree: (conversationId: string, message: string) => Promise<unknown>;
  mergeWorktreeIntoMain: (conversationId: string) => Promise<unknown>;
  pushWorktreeBranch: (conversationId: string) => Promise<unknown>;
  listPiModelsCached: () => Promise<unknown>;
  syncPiModelsCache: () => Promise<unknown>;
  setPiModelScoped: (provider: string, id: string, scoped: boolean) => Promise<unknown>;
  getPiConfigSnapshot: () => unknown;
  sanitizePiSettings: (next: Record<string, unknown>) => { ok: true; value: Record<string, unknown> } | { ok: false; message: string };
  readJsonFile: (filePath: string) => { ok: true; value: Record<string, unknown> } | { ok: false; message: string };
  validateDefaultModelExistsInModels: (settings: Record<string, unknown>, models: Record<string, unknown>) => string | null;
  getPiModelsPath: () => string;
  getPiSettingsPath: () => string;
  backupFile: (filePath: string) => void;
  atomicWriteJson: (filePath: string, value: Record<string, unknown>) => void;
  syncProviderApiKeysBetweenModelsAndAuth: (agentDir: string) => void;
  getPiAgentDir: () => string;
  probeProviderBaseUrl: (rawUrl: string) => Promise<{ resolvedBaseUrl: string; matched: boolean; tested: string[] }>;
  sanitizeModelsJsonWithResolvedBaseUrls: (next: Record<string, unknown>) => Promise<Record<string, unknown>>;
  validateModelsJson: (next: Record<string, unknown>) => string | null;
  runPiExec: (args: string[], timeoutMs?: number, cwd?: string) => Promise<unknown>;
  runPiRemoveWithFallback: (source: string, local?: boolean) => Promise<unknown>;
  getPiDiagnostics: () => unknown;
  listSkillsCatalog: () => Promise<unknown>;
  ensureConversationWorktree: (projectRepoPath: string, conversationId: string) => Promise<string>;
  isGitRepo: (folderPath: string) => Promise<boolean>;
  removeConversationWorktree: (worktreePath: string | null | undefined) => Promise<void>;
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
  }) => Promise<string | null>;
  diffuserTitreConversation: (conversationId: string, title: string) => unknown;
  detectedProjectCommandsCache: Map<string, { timestamp: number; result: any }>;
  DETECTED_PROJECT_COMMANDS_TTL_MS: number;
  getConversationProjectRepoPath: (conversationId: string) =>
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
    sendCommand: (conversationId: string, command: RpcCommand) => Promise<RpcResponse>;
    getSnapshot: (conversationId: string) => Promise<{ messages: unknown[] }>;
    respondExtensionUi: (conversationId: string, response: RpcExtensionUiResponse) => Promise<unknown>;
    subscribe: (listener: (event: PiRendererEvent) => void) => void;
  };
  cacheMessagesFromSnapshot: (conversationId: string, snapshot: { messages: unknown[] }) => void;
  extractLatestAssistantTextFromSnapshot: (snapshot: { messages?: unknown[] } | null | undefined) => string | null;
  gitService: {
    init: (folderPath: string) => Promise<unknown>;
    addAll: (folderPath: string) => Promise<unknown>;
  };
};

let extensionQueueWorker: NodeJS.Timeout | null = null;

function buildHostTerminalEnv(cwd?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const pathKey = process.platform === "win32" ? "Path" : "PATH";
  const currentPath = env[pathKey] ?? env.PATH ?? "";
  const pathEntries = currentPath
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter((entry, index, array) => entry.length > 0 && array.indexOf(entry) === index);

  const addPathEntry = (entry: string | undefined | null) => {
    if (!entry) return;
    const trimmed = entry.trim();
    if (!trimmed) return;
    if (!pathEntries.includes(trimmed)) {
      pathEntries.push(trimmed);
    }
  };

  if (process.platform === "darwin") {
    [
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/opt/local/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
    ].forEach(addPathEntry);

    const home = os.homedir();
    [
      path.join(home, ".nvm", "versions", "node"),
      path.join(home, ".volta", "bin"),
      path.join(home, ".fnm"),
    ].forEach((baseDir) => {
      if (!fs.existsSync(baseDir)) return;
      addPathEntry(baseDir);
      try {
        for (const child of fs.readdirSync(baseDir)) {
          addPathEntry(path.join(baseDir, child, "bin"));
        }
      } catch {
        // Ignore unreadable directories; we still keep known host paths.
      }
    });
  } else if (process.platform === "linux") {
    [
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      "/usr/local/sbin",
      "/usr/sbin",
      "/sbin",
      path.join(os.homedir(), ".local", "bin"),
      path.join(os.homedir(), ".volta", "bin"),
    ].forEach(addPathEntry);
  }

  env[pathKey] = pathEntries.join(path.delimiter);
  env.PATH = env[pathKey];
  if (cwd) {
    env.PWD = cwd;
  }
  return env;
}

function resolveHostExecutable(command: string, env: NodeJS.ProcessEnv): string {
  if (!command.trim() || command.includes(path.sep)) {
    return command;
  }

  const pathValue = env[process.platform === "win32" ? "Path" : "PATH"] ?? env.PATH ?? "";
  const searchDirs = pathValue
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const extensions = process.platform === "win32"
    ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
        .split(";")
        .map((ext) => ext.trim())
        .filter((ext) => ext.length > 0)
    : [""];

  for (const dir of searchDirs) {
    for (const ext of extensions) {
      const candidate = path.join(dir, process.platform === "win32" ? `${command}${ext}` : command);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return command;
}

function checkConversationHasOpenAccessMode(conversationId: string): boolean {
  const db = getDb();
  const conversation = findConversationById(db, conversationId);
  return conversation?.access_mode === "open";
}

export function registerWorkspaceHandlers(deps: RegisterWorkspaceHandlersDeps) {
  deps.syncProviderApiKeysBetweenModelsAndAuth(deps.getPiAgentDir());

  ;(globalThis as Record<string, unknown>).__chatonsInsertConversation = insertConversation;
  ;(globalThis as Record<string, unknown>).__chatonsFindConversationById = findConversationById;
  ;(globalThis as Record<string, unknown>).__chatonsListConversationMessages = (conversationId: string) => listConversationMessagesCache(getDb(), conversationId);
  ;(globalThis as Record<string, unknown>).__chatonsChannelBridge = {
    ingestExternalMessage: async ({ extensionId, conversationId, message, idempotencyKey, metadata }: { extensionId: string; conversationId: string; message: string; idempotencyKey?: string | null; metadata?: Record<string, unknown> | null }) => {
      const db = getDb();
      const conversation = findConversationById(db, conversationId);
      if (!conversation) {
        return { ok: false as const, message: "Conversation not found" };
      }
      if (conversation.project_id !== null) {
        return { ok: false as const, message: "Channel ingestion is allowed only for global conversations" };
      }
      const dedupeKey = idempotencyKey && idempotencyKey.trim().length > 0 ? `channel-ingest:${extensionId}:${idempotencyKey.trim()}` : null;
      if (dedupeKey) {
        const existing = storageKvGet(extensionId, dedupeKey);
        if (existing.ok && existing.data) {
          return { ok: true as const, reply: null };
        }
      }
      const commandResult = await deps.piRuntimeManager.sendCommand(conversationId, {
        type: "prompt",
        message,
      });
      if (!commandResult.success) {
        return { ok: false as const, message: typeof commandResult.error === "string" ? commandResult.error : "Failed to send prompt to Pi runtime" };
      }
      const snapshot = await deps.piRuntimeManager.getSnapshot(conversationId);
      deps.cacheMessagesFromSnapshot(conversationId, snapshot);
      const reply = deps.extractLatestAssistantTextFromSnapshot(snapshot);
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

  ;(globalThis as Record<string, unknown>).__chatonRegisterExtensionServer = (payload: {
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
    runExtensionsQueueWorkerCycle();
  }, 1500);

  deps.piRuntimeManager.subscribe((event: PiRendererEvent) => {
    if (event.event.type === "agent_start") {
      emitHostEvent("conversation.agent.started", {
        conversationId: event.conversationId,
      });
    }
    if (event.event.type === "agent_end") {
      emitHostEvent("conversation.agent.ended", {
        conversationId: event.conversationId,
      });
      void deps.piRuntimeManager
        .getSnapshot(event.conversationId)
        .then((snapshot) => deps.cacheMessagesFromSnapshot(event.conversationId, snapshot))
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

  ipcMain.handle("workspace:getInitialState", async () => {
    try {
      const payload = deps.toWorkspacePayload();
      const updatesResult = await checkForExtensionUpdates();
      return {
        ...payload,
        extensionUpdatesCount: updatesResult.updates.length,
      };
    } catch (error) {
      console.error("Erreur lors de la récupération de l'état initial:", error);
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
        },
        extensionUpdatesCount: 0,
      };
    }
  });

  ipcMain.handle("workspace:getGitDiffSummary", (_event, conversationId: string) =>
    deps.getGitDiffSummaryForConversation(conversationId),
  );
  ipcMain.handle("workspace:getGitFileDiff", (_event, conversationId: string, filePath: string) =>
    deps.getGitFileDiffForConversation(conversationId, filePath),
  );
  ipcMain.handle("workspace:getWorktreeGitInfo", (_event, conversationId: string) =>
    deps.getWorktreeGitInfo(conversationId),
  );
  ipcMain.handle("workspace:generateWorktreeCommitMessage", (_event, conversationId: string) =>
    deps.generateWorktreeCommitMessage(conversationId),
  );
  ipcMain.handle("workspace:commitWorktree", (_event, conversationId: string, message: string) =>
    deps.commitWorktree(conversationId, message),
  );
  ipcMain.handle("workspace:mergeWorktreeIntoMain", (_event, conversationId: string) =>
    deps.mergeWorktreeIntoMain(conversationId),
  );
  ipcMain.handle("workspace:pushWorktreeBranch", (_event, conversationId: string) =>
    deps.pushWorktreeBranch(conversationId),
  );

  ipcMain.handle("workspace:updateSettings", (_event, settings: DbSidebarSettings) => {
    const db = getDb();
    saveSidebarSettings(db, settings);
    return settings;
  });

  ipcMain.handle("models:listPi", async () => deps.listPiModelsCached());
  ipcMain.handle("models:syncPi", async () => deps.syncPiModelsCache());
  ipcMain.handle("models:setPiScoped", async (_event, provider: string, id: string, scoped: boolean) =>
    deps.setPiModelScoped(provider, id, scoped),
  );

  ipcMain.handle("pi:getConfigSnapshot", () => deps.getPiConfigSnapshot());
  ipcMain.handle("pi:updateSettingsJson", (_event, next: unknown) => {
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      return { ok: false as const, message: "settings.json invalide: objet attendu." };
    }
    const valid = deps.sanitizePiSettings(next as Record<string, unknown>);
    if (!valid.ok) {
      return { ok: false as const, message: valid.message };
    }
    const modelsCurrent = deps.readJsonFile(deps.getPiModelsPath());
    if (!modelsCurrent.ok) {
      return { ok: false as const, message: modelsCurrent.message };
    }
    const defaultModelError = deps.validateDefaultModelExistsInModels(valid.value, modelsCurrent.value);
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
      return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("pi:updateAuthJson", (_event, next: unknown) => {
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      return { ok: false as const, message: "auth.json invalide: objet attendu." };
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
      return { ok: false as const, message: writeError instanceof Error ? writeError.message : String(writeError) };
    }
  });

  ipcMain.handle("pi:resolveProviderBaseUrl", async (_event, rawUrl: unknown) => {
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
  });

  ipcMain.handle("pi:updateModelsJson", async (_event, next: unknown) => {
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      return { ok: false as const, message: "models.json invalide: objet attendu." };
    }
    const sanitized = await deps.sanitizeModelsJsonWithResolvedBaseUrls(next as Record<string, unknown>);
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
      deps.syncProviderApiKeysBetweenModelsAndAuth(deps.getPiAgentDir());
      return { ok: true as const };
    } catch (writeError) {
      return { ok: false as const, message: writeError instanceof Error ? writeError.message : String(writeError) };
    }
  });

  ipcMain.handle("pi:runCommand", async (_event, action: any, params: { search?: string; source?: string; local?: boolean }) => {
    switch (action) {
      case "list":
        return deps.runPiExec(["list"]);
      case "list-models":
        return deps.runPiExec(["--list-models", ...(params?.search ? [params.search] : [])]);
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
        return deps.runPiExec(["install", params.source, ...(params.local ? ["-l"] : [])], 30_000);
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
        return deps.runPiExec(["update", ...(params?.source ? [params.source] : [])], 45_000);
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
  });

  ipcMain.handle("pi:getDiagnostics", () => deps.getPiDiagnostics());
  ipcMain.handle("skills:listCatalog", async () => deps.listSkillsCatalog());
  ipcMain.handle("extensions:list", () => {
    const result = listChatonsExtensions();
    return {
      ...result,
      extensions: enrichExtensionsWithRuntimeFields(result.extensions),
    };
  });
  ipcMain.handle("extensions:listCatalog", () => listChatonsExtensionCatalog());
  ipcMain.handle("quickActions:listUsage", () => ({ ok: true as const, rows: listQuickActionsUsage(getDb()) }));
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
      emitHostEvent("extension.installed", { extensionId: id });
    }
    return result;
  });
  ipcMain.handle("extensions:installState", (_event, id: string) => getChatonsExtensionInstallState(id));
  ipcMain.handle("extensions:cancelInstall", (_event, id: string) => cancelChatonsExtensionInstall(id));
  ipcMain.handle("extensions:toggle", (_event, id: string, enabled: boolean) => {
    const result = toggleChatonsExtension(id, enabled);
    if (enabled) {
      emitHostEvent("extension.enabled", { extensionId: id });
    }
    return result;
  });
  ipcMain.handle("extensions:remove", (_event, id: string) => removeChatonsExtension(id));
  ipcMain.handle("extensions:runHealthCheck", () => runChatonsExtensionHealthCheck());
  ipcMain.handle("extensions:getLogs", (_event, id: string) => getChatonsExtensionLogs(id));
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
      return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle("extensions:getManifest", (_event, extensionId: string) => ({ ok: true as const, manifest: getExtensionManifest(extensionId) }));
  ipcMain.handle("extensions:registerUi", () => ({ ok: true as const, entries: listRegisteredExtensionUi() }));
  ipcMain.handle("extensions:getMainViewHtml", (_event, viewId: string) => {
    if (typeof viewId !== "string" || !viewId.trim()) {
      return { ok: false as const, message: "viewId is required" };
    }
    return getExtensionMainViewHtml(viewId.trim());
  });
  ipcMain.handle("extensions:events:subscribe", (_event, extensionId: string, topic: string, options?: { projectId?: string; conversationId?: string }) =>
    subscribeExtension(extensionId, topic, options),
  );
  ipcMain.handle("extensions:events:publish", (_event, extensionId: string, topic: string, payload: unknown, meta?: { idempotencyKey?: string }) =>
    publishExtensionEvent(extensionId, topic, payload, meta),
  );
  ipcMain.handle("extensions:queue:enqueue", (_event, extensionId: string, topic: string, payload: unknown, opts?: { idempotencyKey?: string; availableAt?: string }) =>
    queueEnqueue(extensionId, topic, payload, opts),
  );
  ipcMain.handle("extensions:queue:consume", (_event, extensionId: string, topic: string, consumerId: string, opts?: { limit?: number }) =>
    queueConsume(extensionId, topic, consumerId, opts),
  );
  ipcMain.handle("extensions:queue:ack", (_event, extensionId: string, messageId: string) => queueAck(extensionId, messageId));
  ipcMain.handle("extensions:queue:nack", (_event, extensionId: string, messageId: string, retryAt?: string, errorMessage?: string) =>
    queueNack(extensionId, messageId, retryAt, errorMessage),
  );
  ipcMain.handle("extensions:queue:deadLetter:list", (_event, extensionId: string, topic?: string) => queueListDeadLetters(extensionId, topic));
  ipcMain.handle("extensions:storage:kv:get", (_event, extensionId: string, key: string) => storageKvGet(extensionId, key));
  ipcMain.handle("extensions:storage:kv:set", (_event, extensionId: string, key: string, value: unknown) => storageKvSet(extensionId, key, value));
  ipcMain.handle("extensions:storage:kv:delete", (_event, extensionId: string, key: string) => storageKvDeleteEntry(extensionId, key));
  ipcMain.handle("extensions:storage:kv:list", (_event, extensionId: string) => storageKvListEntries(extensionId));
  ipcMain.handle("extensions:storage:files:read", (_event, extensionId: string, relativePath: string) => storageFilesRead(extensionId, relativePath));
  ipcMain.handle("extensions:storage:files:write", (_event, extensionId: string, relativePath: string, content: string) =>
    storageFilesWrite(extensionId, relativePath, content),
  );
  ipcMain.handle("extensions:hostCall", (_event, extensionId: string, method: string, params?: Record<string, unknown>) =>
    hostCall(extensionId, method, params),
  );
  ipcMain.handle("extensions:call", (_event, callerExtensionId: string, extensionId: string, apiName: string, versionRange: string, payload: unknown) =>
    extensionsCall(callerExtensionId, extensionId, apiName, versionRange, payload),
  );
  ipcMain.handle("extensions:runtime:health", () => getExtensionRuntimeHealth());
  ipcMain.handle("extensions:checkUpdates", () => checkForExtensionUpdates());
  ipcMain.handle("extensions:update", (_event, id: string) => updateChatonsExtension(id));
  ipcMain.handle("extensions:updateAll", () => updateAllChatonsExtensions());

  ipcMain.handle("pi:openPath", async (_event, target: "settings" | "models" | "sessions") => {
    const base = deps.getPiAgentDir();
    const targetPath = target === "settings"
      ? deps.getPiSettingsPath()
      : target === "models"
        ? deps.getPiModelsPath()
        : path.join(base, "sessions");
    try {
      await shell.openPath(targetPath);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("workspace:openProjectFolder", async (_event, projectId: string) => {
    const db = getDb();
    const project = findProjectById(db, projectId);
    if (!project) {
      return { ok: false as const, reason: "project_not_found" as const };
    }
    try {
      // Check if the path exists first
      if (!fs.existsSync(project.repo_path)) {
        return { ok: false as const, message: `Project path does not exist: ${project.repo_path}` };
      }
      await shell.openPath(project.repo_path);
      return { ok: true as const };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { ok: false as const, message: `Failed to open path: ${errorMessage}` };
    }
  });

  ipcMain.handle("pi:exportSessionHtml", async (_event, sessionFile: string, outputFile?: string) => {
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
  });

  ipcMain.handle("conversations:createGlobal", async (_event, options?: { modelProvider?: string; modelId?: string; thinkingLevel?: string; accessMode?: "secure" | "open" }) => {
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
    emitHostEvent("conversation.created", { conversationId, projectId: null });
    return { ok: true as const, conversation: deps.mapConversation(conversation) };
  });

  ipcMain.handle("conversations:createForProject", async (_event, projectId: string, options?: { modelProvider?: string; modelId?: string; thinkingLevel?: string; accessMode?: "secure" | "open" }) => {
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
    emitHostEvent("conversation.created", { conversationId, projectId });
    return { ok: true as const, conversation: deps.mapConversation(conversation) };
  });

  ipcMain.handle("conversations:enableWorktree", async (_event, conversationId: string) => {
    const db = getDb();
    const conversation = findConversationById(db, conversationId);
    if (!conversation) {
      return { ok: false as const, reason: "conversation_not_found" as const };
    }
    if (!conversation.project_id) {
      return { ok: false as const, reason: "project_not_found" as const };
    }

    const project = listProjects(db).find((item) => item.id === conversation.project_id);
    if (!project) {
      return { ok: false as const, reason: "project_not_found" as const };
    }

    if (conversation.worktree_path && conversation.worktree_path.trim().length > 0 && (await deps.isGitRepo(conversation.worktree_path))) {
      return { ok: true as const, conversation: deps.mapConversation(conversation) };
    }

    const worktreePath = await deps.ensureConversationWorktree(project.repo_path, conversationId).catch(() => null);
    if (!worktreePath) {
      return { ok: false as const, reason: "unknown" as const };
    }

    saveConversationPiRuntime(db, conversationId, { worktreePath });
    const updatedConversation = findConversationById(db, conversationId);
    if (!updatedConversation) {
      return { ok: false as const, reason: "unknown" as const };
    }
    const payload = { conversationId, updatedAt: new Date().toISOString(), worktreePath };
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send("workspace:conversationUpdated", payload);
    }
    emitHostEvent("conversation.updated", { conversationId, type: "worktree_enabled" });
    return { ok: true as const, conversation: deps.mapConversation(updatedConversation) };
  });

  ipcMain.handle("conversations:disableWorktree", async (_event, conversationId: string) => {
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

    const hasWorkingChanges = await deps.hasWorkingTreeChanges(conversation.worktree_path);
    const hasStagedChangesResult = await deps.hasStagedChanges(conversation.worktree_path);
    if (hasWorkingChanges || hasStagedChangesResult) {
      return { ok: false as const, reason: "has_uncommitted_changes" as const };
    }

    await deps.removeConversationWorktree(conversation.worktree_path);
    clearConversationWorktreePath(db, conversationId);
    const payload = { conversationId, updatedAt: new Date().toISOString(), worktreePath: "" };
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send("workspace:conversationUpdated", payload);
    }
    emitHostEvent("conversation.updated", { conversationId, type: "worktree_disabled" });
    return { ok: true as const, changed: true as const };
  });

  ipcMain.handle("conversations:setAccessMode", async (_event, conversationId: string, accessMode: "secure" | "open") => {
    const db = getDb();
    const conversation = findConversationById(db, conversationId);
    if (!conversation) {
      return { ok: false as const, reason: "conversation_not_found" as const };
    }
    const nextAccessMode = accessMode === "open" ? "open" : "secure";
    saveConversationPiRuntime(db, conversationId, { accessMode: nextAccessMode });
    return { ok: true as const, accessMode: nextAccessMode };
  });

  ipcMain.handle("conversations:delete", async (_event, conversationId: string, force: boolean = false) => {
    const db = getDb();
    const conversation = findConversationById(db, conversationId);
    if (!conversation) {
      return { ok: false as const, reason: "conversation_not_found" as const };
    }

    if (conversation.worktree_path && conversation.worktree_path.trim()) {
      const hasWorkingChanges = await deps.hasWorkingTreeChanges(conversation.worktree_path);
      const hasStagedChangesResult = await deps.hasStagedChanges(conversation.worktree_path);
      if ((hasWorkingChanges || hasStagedChangesResult) && !force) {
        return { ok: false as const, reason: "has_uncommitted_changes" as const };
      }
    }

    await deps.piRuntimeManager.stop(conversationId);
    const deleted = deleteConversationById(db, conversationId);
    if (!deleted) {
      return { ok: false as const, reason: "conversation_not_found" as const };
    }
    if (conversation.worktree_path && conversation.worktree_path.trim()) {
      await deps.removeConversationWorktree(conversation.worktree_path);
    }
    emitHostEvent("conversation.updated", { conversationId, type: "deleted" });
    return { ok: true as const };
  });

  ipcMain.handle("projects:delete", async (_event, projectId: string) => {
    const db = getDb();
    const project = listProjects(db).find((item) => item.id === projectId);
    if (!project) {
      return { ok: false as const, reason: "project_not_found" as const };
    }

    const projectConversations = listConversationsByProjectId(db, projectId);
    await Promise.all(projectConversations.map((conversation) => deps.piRuntimeManager.stop(conversation.id)));
    await Promise.all(projectConversations.map((conversation) => deps.removeConversationWorktree(conversation.worktree_path)));

    const deleted = deleteProjectById(db, projectId);
    if (!deleted) {
      return { ok: false as const, reason: "unknown" as const };
    }
    emitHostEvent("project.deleted", { projectId });
    return { ok: true as const };
  });

  ipcMain.handle("conversations:getMessageCache", (_event, conversationId: string) => {
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
  });

  ipcMain.handle("conversations:requestAutoTitle", async (_event, conversationId: string, firstMessage: string) => {
    const safeMessage = typeof firstMessage === "string" ? firstMessage.trim() : "";
    if (!safeMessage) {
      return { ok: false as const, reason: "empty_message" as const };
    }

    const db = getDb();
    const conversation = findConversationById(db, conversationId);
    if (!conversation) {
      return { ok: false as const, reason: "conversation_not_found" as const };
    }

    const titreActuel = conversation.title.trim();
    const titreParDefaut = /^Nouveau\s+fil(?:\s*[-–—:\s]*)?/i.test(titreActuel) || /^New\s*[-–—:\s]*/i.test(titreActuel);
    const titreVide = titreActuel.length === 0;
    if (!titreParDefaut && !titreVide) {
      return { ok: true as const, skipped: true as const };
    }

    const titreDeterministe = deps.construireTitreDeterministe(safeMessage);
    const updatedDeterministe = updateConversationTitle(db, conversationId, titreDeterministe);
    if (!updatedDeterministe) {
      return { ok: false as const, reason: "conversation_not_found" as const };
    }
    deps.diffuserTitreConversation(conversationId, titreDeterministe);

    if (!deps.AFFINAGE_TITRE_IA_ACTIVE) {
      return { ok: true as const, title: titreDeterministe, source: "deterministic" as const };
    }

    const project = conversation.project_id ? listProjects(db).find((item) => item.id === conversation.project_id) : null;
    const titleRepoPath = project?.repo_path ?? deps.getGlobalWorkspaceDir();
    const provider = conversation.model_provider ?? "openai-codex";
    const modelId = conversation.model_id ?? "gpt-5.3-codex";
    const titreAffine = await deps.generateConversationTitleFromPi({ provider, modelId, repoPath: titleRepoPath, firstMessage: safeMessage });

    if (!titreAffine || titreAffine === titreDeterministe) {
      return { ok: true as const, title: titreDeterministe, source: "deterministic" as const };
    }

    const updatedAffine = updateConversationTitle(db, conversationId, titreAffine);
    if (!updatedAffine) {
      return { ok: true as const, title: titreDeterministe, source: "deterministic" as const };
    }

    deps.diffuserTitreConversation(conversationId, titreAffine);
    return { ok: true as const, title: titreAffine, source: "ai" as const };
  });

  ipcMain.handle("workspace:detectProjectCommands", async (_event, conversationId: string) => {
    const db = getDb();
    const conversation = findConversationById(db, conversationId);
    if (!conversation) {
      return { ok: false, reason: "conversation_not_found" };
    }
    if (!conversation.project_id) {
      return { ok: false, reason: "project_not_found" };
    }

    const cached = deps.detectedProjectCommandsCache.get(conversationId);
    const customCommands = listProjectCustomTerminalCommands(db, conversation.project_id).map((item) => ({
      id: item.id,
      commandText: item.command_text,
      lastUsedAt: item.last_used_at,
    }));
    if (cached && Date.now() - cached.timestamp < deps.DETECTED_PROJECT_COMMANDS_TTL_MS && cached.result.ok) {
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
  });

  ipcMain.handle("workspace:startProjectCommandTerminal", async (_event, conversationId: string, commandId: string, customCommandText?: string) => {
    const db = getDb();
    const conversation = findConversationById(db, conversationId);
    if (!conversation) {
      return { ok: false as const, reason: "conversation_not_found" as const };
    }
    if (!conversation.project_id) {
      return { ok: false as const, reason: "project_not_found" as const };
    }
    
    // Check if conversation has open access mode for executing host commands
    if (conversation.access_mode !== "open") {
      return { ok: false as const, reason: "access_denied" as const, message: "Host command execution requires open access mode" };
    }

    const repo = deps.getConversationProjectRepoPath(conversationId);
    if (!repo.ok) {
      return repo;
    }
    const detected = deps.buildDetectedProjectCommands(repo.repoPath);
    if (!detected.ok) {
      return detected;
    }
    const savedCustomCommands = listProjectCustomTerminalCommands(db, conversation.project_id);
    const customTarget = commandId.startsWith("custom:")
      ? savedCustomCommands.find((command) => command.id === commandId.slice("custom:".length))
      : null;
    const target = detected.commands.find((command: any) => command.id === commandId)
      ?? (customTarget
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
      (run: any) => run.conversationId === conversationId && run.commandId === commandId && run.status === "running",
    );
    if (alreadyRunning) {
      return { ok: false as const, reason: "already_running" as const };
    }

    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const runCwd = target.cwd ?? repo.repoPath;
    const hostEnv = buildHostTerminalEnv(runCwd);
    const commandPreview = target.isCustom ? (target.commandText ?? target.label) : [target.command, ...target.args].join(" ");
    const resolvedCommand = target.isCustom ? null : resolveHostExecutable(target.command, hostEnv);
    const child = target.isCustom
      ? spawn(target.commandText ?? target.label, { cwd: runCwd, env: hostEnv, shell: true })
      : spawn(resolvedCommand ?? target.command, target.args, { cwd: runCwd, env: hostEnv, shell: false });

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
      saveProjectCustomTerminalCommand(db, conversation.project_id, target.commandText ?? target.label);
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
      deps.appendProjectCommandRunEvent(run, "meta", `\nProcess error: ${error.message}\n`);
    });
    child.on("close", (code) => {
      if (run.status === "running") {
        run.status = code === 0 ? "exited" : "failed";
      }
      run.exitCode = typeof code === "number" ? code : null;
      run.endedAt = new Date().toISOString();
      deps.appendProjectCommandRunEvent(run, "meta", `\nProcess ended with code ${run.exitCode ?? "unknown"}.\n`);
    });

    return { ok: true as const, runId, startedAt };
  });

  ipcMain.handle("workspace:readProjectCommandTerminal", async (_event, runId: string, afterSeq: number = 0) => {
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
  });

  ipcMain.handle("workspace:stopProjectCommandTerminal", async (_event, runId: string) => {
    const run = deps.projectCommandRuns.get(runId);
    if (!run) {
      return { ok: false as const, reason: "run_not_found" as const };
    }
    if (run.process && run.status === "running") {
      run.status = "stopped";
      run.endedAt = new Date().toISOString();
      deps.appendProjectCommandRunEvent(run, "meta", "\nProcess stopped by user.\n");
      run.process.kill("SIGTERM");
    }
    return { ok: true as const };
  });

  ipcMain.handle("pi:startSession", (_event, conversationId: string) => deps.piRuntimeManager.start(conversationId));
  ipcMain.handle("pi:stopSession", (_event, conversationId: string) => deps.piRuntimeManager.stop(conversationId));
  ipcMain.handle("pi:sendCommand", (_event, conversationId: string, command: RpcCommand): Promise<RpcResponse> => {
    if (command.type === "prompt" || command.type === "follow_up" || command.type === "steer") {
      emitHostEvent("conversation.message.received", { conversationId, message: command.message });
    }
    return deps.piRuntimeManager.sendCommand(conversationId, command);
  });
  ipcMain.handle("pi:getSnapshot", (_event, conversationId: string) => deps.piRuntimeManager.getSnapshot(conversationId));
  ipcMain.handle("pi:respondExtensionUi", (_event, conversationId: string, response: RpcExtensionUiResponse) =>
    deps.piRuntimeManager.respondExtensionUi(conversationId, response),
  );

  ipcMain.handle("settings:getLanguagePreference", () => getLanguagePreference(getDb()));
  ipcMain.handle("settings:updateLanguagePreference", (_event, language: string) => {
    saveLanguagePreference(getDb(), language);
  });

  ipcMain.handle("projects:importFromFolder", async (_event, folderPath: string) => {
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

export async function stopWorkspaceHandlers(piRuntimeManager: { stopAll: () => Promise<unknown> }) {
  if (extensionQueueWorker) {
    clearInterval(extensionQueueWorker);
    extensionQueueWorker = null;
  }
  await piRuntimeManager.stopAll();
}

export function registerSystemHandlers() {
  ipcMain.handle("sandbox:executeNodeCommand", async (_event, command: string, args: string[], cwd?: string, timeout?: number) => {
    const { sandboxManager } = await import("../lib/sandbox/sandbox-manager.js");
    return sandboxManager.executeNodeCommand(command, args, cwd, timeout);
  });

  ipcMain.handle("sandbox:executeNpmCommand", async (_event, args: string[], cwd?: string) => {
    const { sandboxManager } = await import("../lib/sandbox/sandbox-manager.js");
    return sandboxManager.executeNpmCommand(args, cwd);
  });

  ipcMain.handle("sandbox:executePythonCommand", async (_event, args: string[], cwd?: string, timeout?: number) => {
    const { sandboxManager } = await import("../lib/sandbox/sandbox-manager.js");
    return sandboxManager.executePythonCommand(args, cwd, timeout);
  });

  ipcMain.handle("sandbox:executePipCommand", async (_event, args: string[], cwd?: string) => {
    const { sandboxManager } = await import("../lib/sandbox/sandbox-manager.js");
    return sandboxManager.executePipCommand(args, cwd);
  });

  ipcMain.handle("sandbox:checkNodeAvailability", async () => {
    const { sandboxManager } = await import("../lib/sandbox/sandbox-manager.js");
    return sandboxManager.checkNodeAvailability();
  });

  ipcMain.handle("sandbox:checkPythonAvailability", async (_event, cwd?: string) => {
    const { sandboxManager } = await import("../lib/sandbox/sandbox-manager.js");
    return sandboxManager.checkPythonAvailability(cwd);
  });

  ipcMain.handle("sandbox:cleanup", async () => {
    const { sandboxManager } = await import("../lib/sandbox/sandbox-manager.js");
    sandboxManager.cleanup();
    return { success: true };
  });

  ipcMain.handle("vscode:detect", async () => {
    try {
      if (process.platform === "darwin") {
        const { execSync } = await import("node:child_process");
        try {
          execSync("which code", { stdio: "pipe" });
          return { detected: true };
        } catch {
          return { detected: false };
        }
      }
      if (process.platform === "win32") {
        const { execSync } = await import("node:child_process");
        try {
          execSync("where code", { stdio: "pipe" });
          return { detected: true };
        } catch {
          return { detected: false };
        }
      }
      const { execSync } = await import("node:child_process");
      try {
        execSync("which code", { stdio: "pipe" });
        return { detected: true };
      } catch {
        return { detected: false };
      }
    } catch {
      return { detected: false };
    }
  });

  ipcMain.handle("ollama:detect", async () => {
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

      return { installed, apiRunning, baseUrl: "http://localhost:11434/v1" };
    } catch {
      return { installed: false, apiRunning: false, baseUrl: "http://localhost:11434/v1" };
    }
  });

  ipcMain.handle("lmstudio:detect", async () => {
    try {
      let installed = false;
      if (process.platform === "darwin") {
        installed = fs.existsSync("/Applications/LM Studio.app");
      } else if (process.platform === "win32") {
        const base = process.env.LOCALAPPDATA ?? "";
        installed = base ? fs.existsSync(path.join(base, "Programs", "LM Studio")) : false;
      } else {
        const home = os.homedir();
        installed = fs.existsSync(path.join(home, "LM-Studio")) || fs.existsSync(path.join(home, "Applications", "LM-Studio"));
      }

      let apiRunning = false;
      try {
        const response = await fetch("http://127.0.0.1:1234/v1/models");
        apiRunning = response.ok;
      } catch {
        apiRunning = false;
      }

      return { installed, apiRunning, baseUrl: "http://localhost:1234/v1" };
    } catch {
      return { installed: false, apiRunning: false, baseUrl: "http://localhost:1234/v1" };
    }
  });

  ipcMain.handle("vscode:openWorktree", async (_event, worktreePath: string) => {
    try {
      if (process.platform === "darwin") {
        const { execSync } = await import("node:child_process");
        execSync(`open -a "Visual Studio Code" "${worktreePath}"`);
      } else if (process.platform === "win32") {
        const { execSync } = await import("node:child_process");
        execSync(`code "${worktreePath}"`);
      } else {
        const { execSync } = await import("node:child_process");
        execSync(`code "${worktreePath}"`);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  });
}
