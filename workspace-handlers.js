import { summarizeAndStoreConversation, consolidateMemory, buildMemoryContextMessage, getMemoryModelPreference, setMemoryModelPreference, } from "../extensions/runtime/memory-lifecycle.js";
import { maybeSuggestAutomationForConversation } from "../extensions/runtime/automation-suggestions.js";
import { cancelChatonsExtensionInstall, checkForExtensionUpdates, checkStoredNpmToken, clearStoredNpmToken, getChatonsExtensionInstallState, getChatonsExtensionLogs, getChatonsExtensionsBaseDir, getExtensionMarketplaceAsync, installChatonsExtension, listChatonsExtensionCatalog, listChatonsExtensions, publishChatonsExtension, removeChatonsExtension, runChatonsExtensionHealthCheck, toggleChatonsExtension, updateAllChatonsExtensions, updateChatonsExtension, } from "../extensions/manager.js";
import { clearConversationWorktreePath, findConversationById, insertConversation, listConversationMessagesCache, listConversationsByProjectId, replaceConversationMessagesCache, saveConversationPiRuntime, updateConversationStatus, updateConversationTitle, } from "../db/repos/conversations.js";
import { deleteProjectById, findProjectById, findProjectByRepoPath, insertProject, listProjects, updateProjectIcon, updateProjectIsArchived, } from "../db/repos/projects.js";
import { emitHostEvent, enrichExtensionsWithRuntimeFields, ensureExtensionServerStarted, extensionsCall, getExtensionMainViewHtml, getExtensionManifest, getExtensionRuntimeHealth, hostCall, initializeExtensionsRuntime, listRegisteredExtensionUi, loadExtensionManifestIntoRegistry, publishExtensionEvent, queueAck, queueConsume, queueEnqueue, queueListDeadLetters, queueNack, registerExtensionServer, runExtensionsQueueWorkerCycle, shutdownExtensionWorkers, storageFilesRead, storageFilesWrite, storageKvDeleteEntry, storageKvGet, storageKvListEntries, storageKvSet, subscribeExtension, } from "../extensions/runtime.js";
import { getLanguagePreference, saveLanguagePreference, saveSidebarSettings, } from "../db/repos/settings.js";
import { listProjectCustomTerminalCommands, saveProjectCustomTerminalCommand, } from "../db/repos/project-custom-terminal-commands.js";
import { listQuickActionsUsage, recordQuickActionUse, } from "../db/repos/quick-actions-usage.js";
import crypto from "node:crypto";
import electron from "electron";
import fs from "node:fs";
import { getDb } from "../db/index.js";
import { getSentryTelemetry } from "../lib/telemetry/sentry.js";
import { getOAuthProvider } from "@mariozechner/pi-ai";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
const { app, BrowserWindow, contentTracing, dialog, ipcMain, shell } = electron;
let extensionQueueWorker = null;
let extensionQueueWorkerInFlight = false;
let memoryConsolidationWorker = null;
// Track which conversations have already had memory context injected
const memoryInjectedConversations = new Set();
function buildHostTerminalEnv(cwd) {
    const env = { ...process.env };
    const pathKey = process.platform === "win32" ? "Path" : "PATH";
    const currentPath = env[pathKey] ?? env.PATH ?? "";
    const pathEntries = currentPath
        .split(path.delimiter)
        .map((entry) => entry.trim())
        .filter((entry, index, array) => entry.length > 0 && array.indexOf(entry) === index);
    const addPathEntry = (entry) => {
        if (!entry)
            return;
        const trimmed = entry.trim();
        if (!trimmed)
            return;
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
            if (!fs.existsSync(baseDir))
                return;
            addPathEntry(baseDir);
            try {
                for (const child of fs.readdirSync(baseDir)) {
                    addPathEntry(path.join(baseDir, child, "bin"));
                }
            }
            catch {
                // Ignore unreadable directories; we still keep known host paths.
            }
        });
    }
    else if (process.platform === "linux") {
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
function resolveHostExecutable(command, env) {
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
export function registerWorkspaceHandlers(deps) {
    deps.syncProviderApiKeysBetweenModelsAndAuth(deps.getPiAgentDir());
    globalThis.__chatonsInsertConversation =
        insertConversation;
    globalThis.__chatonsFindConversationById =
        findConversationById;
    globalThis.__chatonsListConversationMessages = (conversationId) => listConversationMessagesCache(getDb(), conversationId);
    globalThis.__chatonsChannelBridge = {
        ingestExternalMessage: async ({ extensionId, conversationId, message, idempotencyKey, metadata, }) => {
            const db = getDb();
            const conversation = findConversationById(db, conversationId);
            if (!conversation) {
                return { ok: false, message: "Conversation not found" };
            }
            if (conversation.project_id !== null) {
                return {
                    ok: false,
                    message: "Channel ingestion is allowed only for global conversations",
                };
            }
            const dedupeKey = idempotencyKey && idempotencyKey.trim().length > 0
                ? `channel-ingest:${extensionId}:${idempotencyKey.trim()}`
                : null;
            if (dedupeKey) {
                const existing = storageKvGet(extensionId, dedupeKey);
                if (existing.ok && existing.data) {
                    return { ok: true, reply: null };
                }
            }
            // If a subagent is already processing a previous message for this
            // conversation, steer it with the new message instead of queuing a
            // second independent run. The steered subagent will deliver the reply
            // through the normal outbound path.
            if (deps.piRuntimeManager.hasActiveChannelSubagent(conversationId)) {
                const steered = deps.piRuntimeManager.steerChannelSubagent(conversationId, message);
                if (steered) {
                    return { ok: true, reply: null };
                }
            }
            // Run the user's message through an ephemeral subagent that shares the
            // conversation's history but never writes to the main session file.
            // This keeps the main conversation clean: only the final user message
            // and the final assistant reply are stored in the DB cache.
            const subagentResult = await deps.piRuntimeManager.runChannelSubagent(conversationId, message);
            if (!subagentResult.ok) {
                return { ok: false, message: subagentResult.message };
            }
            const reply = subagentResult.reply;
            // Cache only the clean user message + assistant reply (no tool calls or
            // intermediate steps from the subagent session).
            const existingMessages = listConversationMessagesCache(db, conversationId);
            const userMsgId = `channel-user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const assistantMsgId = `channel-asst-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            replaceConversationMessagesCache(db, conversationId, [
                ...existingMessages.map((m) => ({
                    id: m.id,
                    role: m.role,
                    payloadJson: m.payload_json ??
                        m.payloadJson ??
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
            return { ok: true, reply };
        },
    };
    // Store for active tool execution context (conversationId currently executing)
    const activeToolExecutionContext = new Map(); // requestId -> conversationId
    const activeToolExecutionSignals = new Map(); // requestId -> AbortSignal
    const activeToolCallIdByConversation = new Map(); // conversationId -> requestId
    const touchedPathsByToolCall = new Map(); // requestId -> relative repo paths
    globalThis.__chatonsToolExecutionContextStart = (requestId, conversationId, signal) => {
        activeToolExecutionContext.set(requestId, conversationId);
        touchedPathsByToolCall.set(requestId, new Set());
        if (signal) {
            activeToolExecutionSignals.set(requestId, signal);
        }
    };
    globalThis.__chatonsToolExecutionContextEnd = (requestId) => {
        activeToolExecutionContext.delete(requestId);
        activeToolExecutionSignals.delete(requestId);
    };
    globalThis.__chatonsActiveToolCallIdByConversationSet = (conversationId, requestId) => {
        activeToolCallIdByConversation.set(conversationId, requestId);
    };
    globalThis.__chatonsActiveToolCallIdByConversationClear = (conversationId, requestId) => {
        if (activeToolCallIdByConversation.get(conversationId) === requestId) {
            activeToolCallIdByConversation.delete(conversationId);
        }
    };
    globalThis.__chatonsActiveToolCallIdByConversationLookup = (conversationId) => activeToolCallIdByConversation.get(conversationId);
    globalThis.__chatonsToolExecutionTrackPath = (requestId, absolutePath) => {
        const conversationId = activeToolExecutionContext.get(requestId);
        if (!conversationId || typeof absolutePath !== "string" || !absolutePath.trim()) {
            return;
        }
        const runtime = deps.piRuntimeManager.getRuntimeForConversation(conversationId);
        const cwd = runtime?.workingDirectory;
        if (!cwd) {
            return;
        }
        const normalizedCwd = require("node:path").resolve(cwd);
        const normalizedAbsolutePath = require("node:path").resolve(absolutePath);
        const relativePath = require("node:path").relative(normalizedCwd, normalizedAbsolutePath);
        if (!relativePath ||
            relativePath.startsWith("..") ||
            require("node:path").isAbsolute(relativePath)) {
            return;
        }
        const touched = touchedPathsByToolCall.get(requestId) ?? new Set();
        touched.add(relativePath.replace(/\\/g, "/"));
        touchedPathsByToolCall.set(requestId, touched);
    };
    globalThis.__chatonsToolExecutionTouchedPathsLookup = (requestId) => Array.from(touchedPathsByToolCall.get(requestId) ?? []);
    globalThis.__chatonsToolExecutionContextLookup = (requestId) => activeToolExecutionContext.get(requestId);
    globalThis.__chatonsToolExecutionSignalLookup = (requestId) => activeToolExecutionSignals.get(requestId);
    globalThis.__chatonRegisterExtensionServer =
        (payload) => registerExtensionServer(payload);
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
    // Memory consolidation runs every 30 minutes
    if (memoryConsolidationWorker) {
        clearInterval(memoryConsolidationWorker);
    }
    const CONSOLIDATION_INTERVAL_MS = 30 * 60 * 1000;
    memoryConsolidationWorker = setInterval(() => {
        void consolidateMemory(deps.piRuntimeManager).catch((err) => console.warn("[Memory] Consolidation cycle failed:", err));
    }, CONSOLIDATION_INTERVAL_MS);
    deps.piRuntimeManager.subscribe((event) => {
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
            // Auto-summarize conversation to memory (fire-and-forget)
            // Skip ephemeral/hidden conversations (automations, memory tasks, channels)
            const convForMemory = findConversationById(getDb(), event.conversationId);
            const isEphemeral = !convForMemory ||
                convForMemory.hidden_from_sidebar === 1 ||
                event.conversationId.startsWith("automation-") ||
                event.conversationId.startsWith("memory-") ||
                event.conversationId.startsWith("__channel_subagent__");
            if (!isEphemeral) {
                // Notify renderer that memory save is starting
                for (const win of BrowserWindow.getAllWindows()) {
                    win.webContents.send("memory:saving", {
                        conversationId: event.conversationId,
                        status: "started",
                    });
                }
                void summarizeAndStoreConversation(event.conversationId, deps.piRuntimeManager)
                    .then((memoryId) => {
                    for (const win of BrowserWindow.getAllWindows()) {
                        win.webContents.send("memory:saving", {
                            conversationId: event.conversationId,
                            status: memoryId ? "completed" : "skipped",
                            memoryId,
                        });
                    }
                })
                    .catch((err) => {
                    console.warn("[Memory] Auto-summarize failed:", err);
                    for (const win of BrowserWindow.getAllWindows()) {
                        win.webContents.send("memory:saving", {
                            conversationId: event.conversationId,
                            status: "error",
                        });
                    }
                });
                void Promise.resolve(maybeSuggestAutomationForConversation(event.conversationId, hostCall)).catch((err) => {
                    console.warn("[AutomationSuggestion] analysis failed:", err);
                });
            }
        }
        // Emit turn_end with usage data for token tracking extensions
        if (event.event.type === "turn_end") {
            const turnEvt = event.event;
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
            const toolEvt = event.event;
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
            const payload = deps.toWorkspacePayload();
            const updatesResult = await checkForExtensionUpdates();
            return {
                ...payload,
                extensionUpdatesCount: updatesResult.updates.length,
            };
        }
        catch (error) {
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
                    anonymousInstallId: null,
                },
                extensionUpdatesCount: 0,
            };
        }
    });
    ipcMain.handle("workspace:getGitDiffSummary", (_event, conversationId) => deps.getGitDiffSummaryForConversation(conversationId));
    ipcMain.handle("workspace:getGitFileDiff", (_event, conversationId, filePath) => deps.getGitFileDiffForConversation(conversationId, filePath));
    ipcMain.handle("workspace:getTouchedFilesForToolCall", (_event, toolCallId) => Array.from(touchedPathsByToolCall.get(toolCallId) ?? []));
    ipcMain.handle("workspace:getWorktreeGitInfo", (_event, conversationId) => deps.getWorktreeGitInfo(conversationId));
    ipcMain.handle("workspace:generateWorktreeCommitMessage", (_event, conversationId) => deps.generateWorktreeCommitMessage(conversationId));
    ipcMain.handle("workspace:stageWorktreeFile", (_event, conversationId, filePath) => deps.stageWorktreeFile(conversationId, filePath));
    ipcMain.handle("workspace:unstageWorktreeFile", (_event, conversationId, filePath) => deps.unstageWorktreeFile(conversationId, filePath));
    ipcMain.handle("workspace:commitWorktree", (_event, conversationId, message) => deps.commitWorktree(conversationId, message));
    ipcMain.handle("workspace:mergeWorktreeIntoMain", (_event, conversationId) => deps.mergeWorktreeIntoMain(conversationId));
    ipcMain.handle("workspace:pullWorktreeBranch", (_event, conversationId) => deps.pullWorktreeBranch(conversationId));
    ipcMain.handle("workspace:pushWorktreeBranch", (_event, conversationId) => deps.pushWorktreeBranch(conversationId));
    ipcMain.handle("workspace:updateSettings", (_event, settings) => {
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
            }
            else {
                telemetry.clearUser();
            }
        }
        return settings;
    });
    ipcMain.handle("models:listPi", async () => deps.listPiModelsCached());
    ipcMain.handle("models:syncPi", async () => deps.syncPiModelsCache());
    ipcMain.handle("models:discoverProvider", async (_event, providerConfig, providerId) => {
        if (!providerConfig ||
            typeof providerConfig !== "object" ||
            Array.isArray(providerConfig)) {
            return {
                ok: false,
                models: [],
                message: "Invalid provider configuration",
            };
        }
        return deps.discoverProviderModels(providerConfig, typeof providerId === "string" ? providerId : undefined);
    });
    ipcMain.handle("models:setPiScoped", async (_event, provider, id, scoped) => deps.setPiModelScoped(provider, id, scoped));
    ipcMain.handle("pi:getConfigSnapshot", () => deps.getPiConfigSnapshot());
    ipcMain.handle("pi:updateSettingsJson", (_event, next) => {
        if (!next || typeof next !== "object" || Array.isArray(next)) {
            return {
                ok: false,
                message: "settings.json invalide: objet attendu.",
            };
        }
        const valid = deps.sanitizePiSettings(next);
        if (!valid.ok) {
            return { ok: false, message: valid.message };
        }
        const modelsCurrent = deps.readJsonFile(deps.getPiModelsPath());
        if (!modelsCurrent.ok) {
            return { ok: false, message: modelsCurrent.message };
        }
        const defaultModelError = deps.validateDefaultModelExistsInModels(valid.value, modelsCurrent.value);
        if (defaultModelError) {
            return { ok: false, message: defaultModelError };
        }
        const settingsPath = deps.getPiSettingsPath();
        try {
            if (fs.existsSync(settingsPath)) {
                deps.backupFile(settingsPath);
            }
            deps.atomicWriteJson(settingsPath, valid.value);
            return { ok: true };
        }
        catch (error) {
            return {
                ok: false,
                message: error instanceof Error ? error.message : String(error),
            };
        }
    });
    ipcMain.handle("pi:updateAuthJson", (_event, next) => {
        if (!next || typeof next !== "object" || Array.isArray(next)) {
            return {
                ok: false,
                message: "auth.json invalide: objet attendu.",
            };
        }
        const authPath = path.join(deps.getPiAgentDir(), "auth.json");
        try {
            if (fs.existsSync(authPath)) {
                deps.backupFile(authPath);
            }
            deps.atomicWriteJson(authPath, next);
            deps.syncProviderApiKeysBetweenModelsAndAuth(deps.getPiAgentDir());
            return { ok: true };
        }
        catch (writeError) {
            return {
                ok: false,
                message: writeError instanceof Error ? writeError.message : String(writeError),
            };
        }
    });
    ipcMain.handle("pi:resolveProviderBaseUrl", async (_event, rawUrl) => {
        if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
            return { ok: false, message: "URL invalide." };
        }
        const resolved = await deps.probeProviderBaseUrl(rawUrl);
        return {
            ok: true,
            baseUrl: resolved.resolvedBaseUrl,
            matched: resolved.matched,
            tested: resolved.tested,
        };
    });
    ipcMain.handle("pi:updateModelsJson", async (_event, next) => {
        if (!next || typeof next !== "object" || Array.isArray(next)) {
            return {
                ok: false,
                message: "models.json invalide: objet attendu.",
            };
        }
        const incoming = next;
        const incomingProviders = incoming.providers &&
            typeof incoming.providers === "object" &&
            !Array.isArray(incoming.providers)
            ? incoming.providers
            : {};
        const enrichedProviders = { ...incomingProviders };
        await Promise.all(Object.entries(incomingProviders).map(async ([providerName, providerValue]) => {
            if (!providerValue ||
                typeof providerValue !== "object" ||
                Array.isArray(providerValue)) {
                return;
            }
            const providerConfig = providerValue;
            const existingModels = providerConfig.models;
            if (Array.isArray(existingModels) && existingModels.length > 0) {
                return;
            }
            const discovered = await deps.discoverProviderModels(providerConfig, providerName);
            if (!discovered || typeof discovered !== "object" || !("ok" in discovered)) {
                return;
            }
            const typedDiscovered = discovered;
            if (!typedDiscovered.ok || !Array.isArray(typedDiscovered.models) || typedDiscovered.models.length === 0) {
                console.info(`[pi] updateModelsJson discovery produced no models for "${providerName}"`);
                return;
            }
            console.info(`[pi] updateModelsJson discovered ${typedDiscovered.models.length} model(s) for "${providerName}"`);
            enrichedProviders[providerName] = {
                ...providerConfig,
                models: typedDiscovered.models.map((model) => {
                    const entry = { id: model.id };
                    if (typeof model.contextWindow === "number" &&
                        model.contextWindowSource === "provider") {
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
        }));
        const sanitized = await deps.sanitizeModelsJsonWithResolvedBaseUrls({
            ...incoming,
            providers: enrichedProviders,
        });
        const error = deps.validateModelsJson(sanitized);
        if (error) {
            return { ok: false, message: error };
        }
        const modelsPath = deps.getPiModelsPath();
        try {
            if (fs.existsSync(modelsPath)) {
                deps.backupFile(modelsPath);
            }
            deps.atomicWriteJson(modelsPath, sanitized);
            const persistedProviders = sanitized.providers &&
                typeof sanitized.providers === "object" &&
                !Array.isArray(sanitized.providers)
                ? sanitized.providers
                : {};
            for (const [providerName, providerValue] of Object.entries(persistedProviders)) {
                if (!providerValue ||
                    typeof providerValue !== "object" ||
                    Array.isArray(providerValue)) {
                    continue;
                }
                const providerConfig = providerValue;
                const modelCount = Array.isArray(providerConfig.models)
                    ? providerConfig.models.length
                    : 0;
                console.info(`[pi] Persisted provider "${providerName}" with baseUrl="${String(providerConfig.baseUrl ?? "")}" and ${modelCount} model(s)`);
            }
            deps.syncProviderApiKeysBetweenModelsAndAuth(deps.getPiAgentDir());
            // Sync database cache with newly written models.json
            // This ensures that discovered models from custom providers are immediately available
            await deps.syncPiModelsCache();
            return { ok: true };
        }
        catch (writeError) {
            return {
                ok: false,
                message: writeError instanceof Error ? writeError.message : String(writeError),
            };
        }
    });
    ipcMain.handle("pi:runCommand", async (_event, action, params) => {
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
    ipcMain.handle("pi:getAuthJson", () => {
        const authJson = deps.getAuthJson();
        return { ok: true, auth: authJson };
    });
    ipcMain.handle("pi:oauthLogin", async (event, providerId) => {
        if (typeof providerId !== "string" || !providerId.trim()) {
            return { ok: false, message: "providerId requis" };
        }
        const provider = getOAuthProvider(providerId.trim());
        if (!provider) {
            return {
                ok: false,
                message: `Provider OAuth inconnu: ${providerId}`,
            };
        }
        let promptResolve = null;
        let promptReject = null;
        const promptListener = (_e, value) => {
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
                onAuth: ({ url, instructions }) => {
                    shell.openExternal(url);
                    event.sender.send("pi:oauthEvent", {
                        type: "auth",
                        url,
                        instructions,
                    });
                },
                onPrompt: ({ message, placeholder, allowEmpty }) => {
                    return new Promise((resolve, reject) => {
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
                onProgress: (msg) => {
                    event.sender.send("pi:oauthEvent", {
                        type: "progress",
                        message: msg,
                    });
                },
                signal: abortController.signal,
            });
            // Save credentials to auth.json
            const authPath = path.join(deps.getPiAgentDir(), "auth.json");
            let authData = {};
            try {
                const existing = deps.readJsonFile(authPath);
                if (existing.ok)
                    authData = existing.value;
            }
            catch {
                /* use empty */
            }
            // AuthStorage.getApiKey() requires { type: "oauth", ...credentials } — must wrap explicitly
            authData[providerId] = {
                type: "oauth",
                ...credentials,
            };
            deps.atomicWriteJson(authPath, authData);
            // Ensure provider entry exists in models.json
            const OAUTH_PROVIDER_DEFAULTS = {
                "github-copilot": {
                    api: "openai-completions",
                    baseUrl: "https://api.individual.githubcopilot.com",
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
                deps.upsertProviderInModelsJson(providerId, OAUTH_PROVIDER_DEFAULTS[providerId]);
            }
            // Discover and populate models for the newly connected OAuth provider
            // so the provider entry includes a models array immediately.
            await deps.syncPiModelsCache();
            event.sender.send("pi:oauthEvent", { type: "success" });
            return { ok: true, providerId };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            event.sender.send("pi:oauthEvent", { type: "error", message });
            return { ok: false, message };
        }
        finally {
            ipcMain.off("pi:oauthPromptReply", promptListener);
            ipcMain.off("pi:oauthPromptCancel", promptCancelListener);
            ipcMain.off("pi:oauthLoginCancel", cancelLoginListener);
        }
    });
    ipcMain.handle("skills:listCatalog", async () => deps.listSkillsCatalog());
    ipcMain.handle("skills:getMarketplace", async () => deps.getSkillsMarketplace());
    ipcMain.handle("skills:getMarketplaceFiltered", async (_event, options) => deps.getSkillsMarketplaceFiltered(options));
    ipcMain.handle("skills:getRatings", (_event, skillSource) => deps.getSkillsRatings(skillSource));
    ipcMain.handle("skills:addRating", (_event, skillSource, rating, review) => deps.addSkillRating(skillSource, rating, review));
    ipcMain.handle("skills:getAverageRating", (_event, skillSource) => deps.getSkillAverageRating(skillSource));
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
        ok: true,
        rows: listQuickActionsUsage(getDb()),
    }));
    ipcMain.handle("quickActions:recordUse", (_event, actionId) => {
        if (typeof actionId !== "string" || !actionId.trim()) {
            return { ok: false, message: "actionId is required" };
        }
        const row = recordQuickActionUse(getDb(), actionId.trim());
        return { ok: true, row };
    });
    ipcMain.handle("extensions:install", (_event, id) => {
        const result = installChatonsExtension(id);
        if (result.ok) {
            loadExtensionManifestIntoRegistry(id);
            emitHostEvent("extension.installed", { extensionId: id });
            void ensureExtensionServerStarted(id);
        }
        return result;
    });
    ipcMain.handle("extensions:installState", (_event, id) => getChatonsExtensionInstallState(id));
    ipcMain.handle("extensions:cancelInstall", (_event, id) => cancelChatonsExtensionInstall(id));
    ipcMain.handle("extensions:toggle", async (_event, id, enabled) => {
        const result = toggleChatonsExtension(id, enabled);
        if (enabled) {
            loadExtensionManifestIntoRegistry(id);
            emitHostEvent("extension.enabled", { extensionId: id });
            await ensureExtensionServerStarted(id);
        }
        return result;
    });
    ipcMain.handle("extensions:remove", (_event, id) => removeChatonsExtension(id));
    ipcMain.handle("extensions:runHealthCheck", () => runChatonsExtensionHealthCheck());
    ipcMain.handle("extensions:getLogs", (_event, id) => getChatonsExtensionLogs(id));
    ipcMain.handle("extensions:restartApp", () => {
        app.relaunch();
        app.exit(0);
        return { ok: true };
    });
    ipcMain.handle("extensions:openExtensionsFolder", async () => {
        const baseDir = getChatonsExtensionsBaseDir();
        try {
            await shell.openPath(baseDir);
            return { ok: true };
        }
        catch (error) {
            return {
                ok: false,
                message: error instanceof Error ? error.message : String(error),
            };
        }
    });
    ipcMain.handle("extensions:getManifest", (_event, extensionId) => ({
        ok: true,
        manifest: getExtensionManifest(extensionId),
    }));
    ipcMain.handle("extensions:registerUi", () => ({
        ok: true,
        entries: listRegisteredExtensionUi(),
    }));
    ipcMain.handle("extensions:getMainViewHtml", (_event, viewId) => {
        if (typeof viewId !== "string" || !viewId.trim()) {
            return { ok: false, message: "viewId is required" };
        }
        return getExtensionMainViewHtml(viewId.trim());
    });
    ipcMain.handle("extensions:events:subscribe", (_event, extensionId, topic, options) => subscribeExtension(extensionId, topic, options));
    ipcMain.handle("extensions:events:publish", (_event, extensionId, topic, payload, meta) => publishExtensionEvent(extensionId, topic, payload, meta));
    ipcMain.handle("extensions:queue:enqueue", (_event, extensionId, topic, payload, opts) => queueEnqueue(extensionId, topic, payload, opts));
    ipcMain.handle("extensions:queue:consume", (_event, extensionId, topic, consumerId, opts) => queueConsume(extensionId, topic, consumerId, opts));
    ipcMain.handle("extensions:queue:ack", (_event, extensionId, messageId) => queueAck(extensionId, messageId));
    ipcMain.handle("extensions:queue:nack", (_event, extensionId, messageId, retryAt, errorMessage) => queueNack(extensionId, messageId, retryAt, errorMessage));
    ipcMain.handle("extensions:queue:deadLetter:list", (_event, extensionId, topic) => queueListDeadLetters(extensionId, topic));
    ipcMain.handle("extensions:storage:kv:get", (_event, extensionId, key) => storageKvGet(extensionId, key));
    ipcMain.handle("extensions:storage:kv:set", (_event, extensionId, key, value) => storageKvSet(extensionId, key, value));
    ipcMain.handle("extensions:storage:kv:delete", (_event, extensionId, key) => storageKvDeleteEntry(extensionId, key));
    ipcMain.handle("extensions:storage:kv:list", (_event, extensionId) => storageKvListEntries(extensionId));
    ipcMain.handle("extensions:storage:files:read", (_event, extensionId, relativePath) => storageFilesRead(extensionId, relativePath));
    ipcMain.handle("extensions:storage:files:write", (_event, extensionId, relativePath, content) => storageFilesWrite(extensionId, relativePath, content));
    ipcMain.handle("extensions:hostCall", (_event, extensionId, method, params) => hostCall(extensionId, method, params));
    ipcMain.handle("extensions:call", (_event, callerExtensionId, extensionId, apiName, versionRange, payload) => extensionsCall(callerExtensionId, extensionId, apiName, versionRange, payload));
    ipcMain.handle("extensions:runtime:health", () => getExtensionRuntimeHealth());
    ipcMain.handle("extensions:checkUpdates", () => checkForExtensionUpdates());
    ipcMain.handle("extensions:update", (_event, id) => updateChatonsExtension(id));
    ipcMain.handle("extensions:updateAll", () => updateAllChatonsExtensions());
    ipcMain.handle("extensions:publish", (_event, id, npmToken) => publishChatonsExtension(id, npmToken));
    ipcMain.handle("extensions:checkStoredNpmToken", () => checkStoredNpmToken());
    ipcMain.handle("extensions:clearStoredNpmToken", () => clearStoredNpmToken());
    ipcMain.handle("pi:openPath", async (_event, target) => {
        const base = deps.getPiAgentDir();
        const targetPath = target === "settings"
            ? deps.getPiSettingsPath()
            : target === "models"
                ? deps.getPiModelsPath()
                : path.join(base, "sessions");
        try {
            await shell.openPath(targetPath);
            return { ok: true };
        }
        catch (error) {
            return {
                ok: false,
                message: error instanceof Error ? error.message : String(error),
            };
        }
    });
    ipcMain.handle("workspace:openProjectFolder", async (_event, projectId) => {
        const db = getDb();
        const project = findProjectById(db, projectId);
        if (!project) {
            return { ok: false, reason: "project_not_found" };
        }
        try {
            // Check if the path exists first
            if (!fs.existsSync(project.repo_path)) {
                return {
                    ok: false,
                    message: `Project path does not exist: ${project.repo_path}`,
                };
            }
            await shell.openPath(project.repo_path);
            return { ok: true };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                ok: false,
                message: `Failed to open path: ${errorMessage}`,
            };
        }
    });
    ipcMain.handle("pi:exportSessionHtml", async (_event, sessionFile, outputFile) => {
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
    ipcMain.handle("conversations:createGlobal", async (_event, options) => {
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
            return { ok: false, reason: "unknown" };
        }
        emitHostEvent("conversation.created", {
            conversationId,
            projectId: null,
        });
        return {
            ok: true,
            conversation: deps.mapConversation(conversation),
        };
    });
    ipcMain.handle("conversations:createForProject", async (_event, projectId, options) => {
        const db = getDb();
        const project = listProjects(db).find((item) => item.id === projectId);
        if (!project) {
            return { ok: false, reason: "project_not_found" };
        }
        const conversationId = crypto.randomUUID();
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
        });
        const conversation = findConversationById(db, conversationId);
        if (!conversation) {
            return { ok: false, reason: "unknown" };
        }
        emitHostEvent("conversation.created", { conversationId, projectId });
        return {
            ok: true,
            conversation: deps.mapConversation(conversation),
        };
    });
    ipcMain.handle("conversations:enableWorktree", async (_event, conversationId) => {
        const db = getDb();
        const conversation = findConversationById(db, conversationId);
        if (!conversation) {
            return {
                ok: false,
                reason: "conversation_not_found",
            };
        }
        if (!conversation.project_id) {
            return { ok: false, reason: "project_not_found" };
        }
        const project = listProjects(db).find((item) => item.id === conversation.project_id);
        if (!project) {
            return { ok: false, reason: "project_not_found" };
        }
        if (conversation.worktree_path &&
            conversation.worktree_path.trim().length > 0 &&
            (await deps.isGitRepo(conversation.worktree_path))) {
            return {
                ok: true,
                conversation: deps.mapConversation(conversation),
            };
        }
        const worktreePath = await deps
            .ensureConversationWorktree(project.repo_path, conversationId)
            .catch(() => null);
        if (!worktreePath) {
            return { ok: false, reason: "unknown" };
        }
        saveConversationPiRuntime(db, conversationId, { worktreePath });
        const updatedConversation = findConversationById(db, conversationId);
        if (!updatedConversation) {
            return { ok: false, reason: "unknown" };
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
            ok: true,
            conversation: deps.mapConversation(updatedConversation),
        };
    });
    ipcMain.handle("conversations:disableWorktree", async (_event, conversationId) => {
        const db = getDb();
        const conversation = findConversationById(db, conversationId);
        if (!conversation) {
            return {
                ok: false,
                reason: "conversation_not_found",
            };
        }
        if (!conversation.project_id) {
            return { ok: false, reason: "project_not_found" };
        }
        if (!conversation.worktree_path ||
            conversation.worktree_path.trim().length === 0) {
            return { ok: true, changed: false };
        }
        const hasWorkingChanges = await deps.hasWorkingTreeChanges(conversation.worktree_path);
        const hasStagedChangesResult = await deps.hasStagedChanges(conversation.worktree_path);
        if (hasWorkingChanges || hasStagedChangesResult) {
            return {
                ok: false,
                reason: "has_uncommitted_changes",
            };
        }
        await deps.removeConversationWorktree(conversation.worktree_path);
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
        return { ok: true, changed: true };
    });
    ipcMain.handle("conversations:setAccessMode", async (_event, conversationId, accessMode) => {
        const db = getDb();
        const conversation = findConversationById(db, conversationId);
        if (!conversation) {
            return {
                ok: false,
                reason: "conversation_not_found",
            };
        }
        const nextAccessMode = accessMode === "open" ? "open" : "secure";
        saveConversationPiRuntime(db, conversationId, {
            accessMode: nextAccessMode,
        });
        return { ok: true, accessMode: nextAccessMode };
    });
    ipcMain.handle("conversations:delete", async (_event, conversationId, force = false) => {
        const db = getDb();
        const conversation = findConversationById(db, conversationId);
        if (!conversation) {
            return {
                ok: false,
                reason: "conversation_not_found",
            };
        }
        if (conversation.worktree_path && conversation.worktree_path.trim()) {
            const hasWorkingChanges = await deps.hasWorkingTreeChanges(conversation.worktree_path);
            const hasStagedChangesResult = await deps.hasStagedChanges(conversation.worktree_path);
            if ((hasWorkingChanges || hasStagedChangesResult) && !force) {
                return {
                    ok: false,
                    reason: "has_uncommitted_changes",
                };
            }
        }
        await deps.piRuntimeManager.stop(conversationId);
        const archived = updateConversationStatus(db, conversationId, "archived");
        if (!archived) {
            return {
                ok: false,
                reason: "conversation_not_found",
            };
        }
        if (conversation.worktree_path && conversation.worktree_path.trim()) {
            await deps.removeConversationWorktree(conversation.worktree_path);
        }
        emitHostEvent("conversation.updated", {
            conversationId,
            type: "archived",
        });
        return { ok: true };
    });
    ipcMain.handle("projects:delete", async (_event, projectId) => {
        const db = getDb();
        const project = listProjects(db).find((item) => item.id === projectId);
        if (!project) {
            return { ok: false, reason: "project_not_found" };
        }
        const projectConversations = listConversationsByProjectId(db, projectId);
        await Promise.all(projectConversations.map((conversation) => deps.piRuntimeManager.stop(conversation.id)));
        await Promise.all(projectConversations.map((conversation) => deps.removeConversationWorktree(conversation.worktree_path)));
        const deleted = deleteProjectById(db, projectId);
        if (!deleted) {
            return { ok: false, reason: "unknown" };
        }
        emitHostEvent("project.deleted", { projectId });
        return { ok: true };
    });
    ipcMain.handle("projects:setArchived", async (_event, projectId, isArchived) => {
        const db = getDb();
        const project = findProjectById(db, projectId);
        if (!project) {
            return { ok: false, reason: "project_not_found" };
        }
        const updated = updateProjectIsArchived(db, projectId, isArchived);
        if (!updated) {
            return { ok: false, reason: "unknown" };
        }
        emitHostEvent("project.archived", { projectId, isArchived });
        return { ok: true };
    });
    ipcMain.handle("projects:setIcon", async (_event, projectId, icon) => {
        const db = getDb();
        const project = findProjectById(db, projectId);
        if (!project) {
            return { ok: false, reason: "project_not_found" };
        }
        const updated = updateProjectIcon(db, projectId, icon);
        if (!updated) {
            return { ok: false, reason: "unknown" };
        }
        emitHostEvent("project.icon_updated", { projectId, icon: icon ?? null });
        return { ok: true };
    });
    // Scan project folder for image files (png, jpg, jpeg, gif, webp, svg, ico)
    ipcMain.handle("projects:scanImages", async (_event, projectId) => {
        const db = getDb();
        const project = findProjectById(db, projectId);
        if (!project) {
            return { ok: false, reason: "project_not_found", images: [] };
        }
        const repoPath = project.repo_path;
        const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico"]);
        const images = [];
        const maxDepth = 3;
        const maxResults = 60;
        function scanDir(dirPath, depth) {
            if (depth > maxDepth || images.length >= maxResults)
                return;
            try {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                for (const entry of entries) {
                    if (images.length >= maxResults)
                        break;
                    // Skip hidden dirs / node_modules / .git
                    if (entry.name.startsWith(".") || entry.name === "node_modules")
                        continue;
                    const fullPath = path.join(dirPath, entry.name);
                    if (entry.isDirectory()) {
                        scanDir(fullPath, depth + 1);
                    }
                    else if (entry.isFile()) {
                        const ext = path.extname(entry.name).toLowerCase();
                        if (imageExtensions.has(ext)) {
                            images.push(fullPath);
                        }
                    }
                }
            }
            catch {
                // Permission errors, etc.
            }
        }
        scanDir(repoPath, 0);
        return { ok: true, images };
    });
    // Open a native file dialog to pick an image
    ipcMain.handle("projects:pickIconImage", async () => {
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
        return result.filePaths[0];
    });
    // Convert image file to base64 data URL for display in <img> tags
    ipcMain.handle("projects:imageToDataUrl", async (_event, imagePath) => {
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
            const mimeTypes = {
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
        }
        catch {
            return null;
        }
    });
    ipcMain.handle("conversations:getMessageCache", (_event, conversationId) => {
        const db = getDb();
        const rows = listConversationMessagesCache(db, conversationId);
        return rows
            .map((row) => {
            try {
                return JSON.parse(row.payload_json);
            }
            catch {
                return null;
            }
        })
            .filter((item) => item !== null);
    });
    ipcMain.handle("conversations:requestAutoTitle", async (_event, conversationId, firstMessage) => {
        const safeMessage = typeof firstMessage === "string" ? firstMessage.trim() : "";
        if (!safeMessage) {
            return { ok: false, reason: "empty_message" };
        }
        const db = getDb();
        const conversation = findConversationById(db, conversationId);
        if (!conversation) {
            return {
                ok: false,
                reason: "conversation_not_found",
            };
        }
        if (conversation.title_source !== "placeholder") {
            return { ok: true, skipped: true };
        }
        const titreDeterministe = deps.construireTitreDeterministe(safeMessage);
        const updatedDeterministe = updateConversationTitle(db, conversationId, titreDeterministe, "auto-deterministic");
        if (!updatedDeterministe) {
            return {
                ok: false,
                reason: "conversation_not_found",
            };
        }
        deps.diffuserTitreConversation(conversationId, titreDeterministe);
        if (!deps.AFFINAGE_TITRE_IA_ACTIVE) {
            return {
                ok: true,
                title: titreDeterministe,
                source: "deterministic",
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
        });
        if (!titreAffine || titreAffine === titreDeterministe) {
            if (!titreAffine) {
                console.warn("[conversation-title] AI refinement unavailable", {
                    conversationId,
                    provider,
                    modelId,
                });
            }
            return {
                ok: true,
                title: titreDeterministe,
                source: "deterministic",
            };
        }
        const updatedAffine = updateConversationTitle(db, conversationId, titreAffine, "auto-ai");
        if (!updatedAffine) {
            return {
                ok: true,
                title: titreDeterministe,
                source: "deterministic",
            };
        }
        deps.diffuserTitreConversation(conversationId, titreAffine);
        return { ok: true, title: titreAffine, source: "ai" };
    });
    ipcMain.handle("workspace:detectProjectCommands", async (_event, conversationId) => {
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
        if (cached &&
            Date.now() - cached.timestamp < deps.DETECTED_PROJECT_COMMANDS_TTL_MS &&
            cached.result.ok) {
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
    ipcMain.handle("workspace:startProjectCommandTerminal", async (_event, conversationId, commandId, customCommandText) => {
        const db = getDb();
        const conversation = findConversationById(db, conversationId);
        if (!conversation) {
            return {
                ok: false,
                reason: "conversation_not_found",
            };
        }
        if (!conversation.project_id) {
            return { ok: false, reason: "project_not_found" };
        }
        // Check if conversation has open access mode for executing host commands
        if (conversation.access_mode !== "open") {
            return {
                ok: false,
                reason: "access_denied",
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
        const savedCustomCommands = listProjectCustomTerminalCommands(db, conversation.project_id);
        const customTarget = commandId.startsWith("custom:")
            ? savedCustomCommands.find((command) => command.id === commandId.slice("custom:".length))
            : null;
        const target = detected.commands.find((command) => command.id === commandId) ??
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
            return { ok: false, reason: "command_not_found" };
        }
        const alreadyRunning = Array.from(deps.projectCommandRuns.values()).some((run) => run.conversationId === conversationId &&
            run.commandId === commandId &&
            run.status === "running");
        if (alreadyRunning) {
            return { ok: false, reason: "already_running" };
        }
        const runId = crypto.randomUUID();
        const startedAt = new Date().toISOString();
        const runCwd = target.cwd ?? repo.repoPath;
        const hostEnv = buildHostTerminalEnv(runCwd);
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
        const run = {
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
        return { ok: true, runId, startedAt };
    });
    ipcMain.handle("workspace:readProjectCommandTerminal", async (_event, runId, afterSeq = 0) => {
        const run = deps.projectCommandRuns.get(runId);
        if (!run) {
            return { ok: false, reason: "run_not_found" };
        }
        return {
            ok: true,
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
            events: run.events.filter((event) => event.seq > afterSeq),
        };
    });
    ipcMain.handle("workspace:stopProjectCommandTerminal", async (_event, runId) => {
        const run = deps.projectCommandRuns.get(runId);
        if (!run) {
            return { ok: false, reason: "run_not_found" };
        }
        if (run.process && run.status === "running") {
            run.status = "stopped";
            run.endedAt = new Date().toISOString();
            deps.appendProjectCommandRunEvent(run, "meta", "\nProcess stopped by user.\n");
            run.process.kill("SIGTERM");
        }
        return { ok: true };
    });
    ipcMain.handle("pi:startSession", (_event, conversationId) => deps.piRuntimeManager.start(conversationId));
    ipcMain.handle("pi:stopSession", (_event, conversationId) => deps.piRuntimeManager.stop(conversationId));
    ipcMain.handle("pi:sendCommand", async (_event, conversationId, command) => {
        if (command.type === "prompt" ||
            command.type === "follow_up" ||
            command.type === "steer") {
            emitHostEvent("conversation.message.received", {
                conversationId,
                message: command.message,
            });
        }
        // Inject memory context as a hidden steer before the first prompt
        if (command.type === "prompt") {
            const alreadyInjected = memoryInjectedConversations.has(conversationId);
            if (!alreadyInjected) {
                memoryInjectedConversations.add(conversationId);
                try {
                    const memoryContext = buildMemoryContextMessage(conversationId, command.message);
                    if (memoryContext) {
                        // Send memory context as a steer (hidden from user)
                        await deps.piRuntimeManager.sendCommand(conversationId, {
                            type: "steer",
                            message: memoryContext,
                        });
                    }
                }
                catch (err) {
                    console.warn("[Memory] Failed to inject memory context:", err);
                }
            }
        }
        return deps.piRuntimeManager.sendCommand(conversationId, command);
    });
    ipcMain.handle("pi:getSnapshot", (_event, conversationId) => deps.piRuntimeManager.getSnapshot(conversationId));
    ipcMain.handle("pi:respondExtensionUi", (_event, conversationId, response) => deps.piRuntimeManager.respondExtensionUi(conversationId, response));
    ipcMain.handle("settings:getLanguagePreference", () => getLanguagePreference(getDb()));
    ipcMain.handle("settings:updateLanguagePreference", (_event, language) => {
        saveLanguagePreference(getDb(), language);
    });
    // Memory model preference
    ipcMain.handle("memory:getModelPreference", () => ({
        ok: true,
        modelKey: getMemoryModelPreference(),
    }));
    ipcMain.handle("memory:setModelPreference", (_event, modelKey) => {
        setMemoryModelPreference(typeof modelKey === "string" && modelKey.trim() ? modelKey.trim() : null);
        return { ok: true };
    });
    ipcMain.handle("projects:importFromFolder", async (_event, folderPath) => {
        const db = getDb();
        if (!folderPath) {
            return { ok: false, reason: "invalid_path" };
        }
        const isGit = await deps.isGitRepo(folderPath);
        if (!isGit) {
            try {
                console.log(`Initializing git repository for project: ${folderPath}`);
                await deps.gitService.init(folderPath);
                await deps.gitService.addAll(folderPath);
                console.log(`Successfully initialized git repository for: ${folderPath}`);
            }
            catch (error) {
                console.error(`Failed to initialize git repository: ${error}`);
                return { ok: false, reason: "git_init_failed" };
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
            return { ok: false, reason: "unknown" };
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
export async function stopWorkspaceHandlers(piRuntimeManager) {
    if (extensionQueueWorker) {
        clearInterval(extensionQueueWorker);
        extensionQueueWorker = null;
    }
    if (memoryConsolidationWorker) {
        clearInterval(memoryConsolidationWorker);
        memoryConsolidationWorker = null;
    }
    // Terminate all sandboxed extension workers
    shutdownExtensionWorkers();
    await piRuntimeManager.stopAll();
}
export function registerSystemHandlers() {
    ipcMain.handle("sandbox:executeNodeCommand", async (_event, command, args, cwd, timeout) => {
        const { sandboxManager } = await import("../lib/sandbox/sandbox-manager.js");
        return sandboxManager.executeNodeCommand(command, args, cwd, timeout);
    });
    ipcMain.handle("sandbox:executeNpmCommand", async (_event, args, cwd) => {
        const { sandboxManager } = await import("../lib/sandbox/sandbox-manager.js");
        return sandboxManager.executeNpmCommand(args, cwd);
    });
    ipcMain.handle("sandbox:executePythonCommand", async (_event, args, cwd, timeout) => {
        const { sandboxManager } = await import("../lib/sandbox/sandbox-manager.js");
        return sandboxManager.executePythonCommand(args, cwd, timeout);
    });
    ipcMain.handle("sandbox:executePipCommand", async (_event, args, cwd) => {
        const { sandboxManager } = await import("../lib/sandbox/sandbox-manager.js");
        return sandboxManager.executePipCommand(args, cwd);
    });
    ipcMain.handle("sandbox:checkNodeAvailability", async () => {
        const { sandboxManager } = await import("../lib/sandbox/sandbox-manager.js");
        return sandboxManager.checkNodeAvailability();
    });
    ipcMain.handle("sandbox:checkPythonAvailability", async (_event, cwd) => {
        const { sandboxManager } = await import("../lib/sandbox/sandbox-manager.js");
        return sandboxManager.checkPythonAvailability(cwd);
    });
    ipcMain.handle("sandbox:cleanup", async () => {
        const { sandboxManager } = await import("../lib/sandbox/sandbox-manager.js");
        sandboxManager.cleanup();
        return { success: true };
    });
    const detectExternalCommand = async (command) => {
        try {
            if (typeof command !== "string" || !command.trim()) {
                return { detected: false };
            }
            const { execSync } = await import("node:child_process");
            try {
                if (process.platform === "win32") {
                    execSync(`where ${command}`, { stdio: "pipe" });
                }
                else {
                    execSync(`command -v ${command}`, { stdio: "pipe", shell: "/bin/sh" });
                }
                return { detected: true };
            }
            catch {
                return { detected: false };
            }
        }
        catch {
            return { detected: false };
        }
    };
    ipcMain.handle("vscode:detect", async () => detectExternalCommand("code"));
    ipcMain.handle("app:detectExternalCommand", async (_event, command) => detectExternalCommand(command));
    ipcMain.handle("ollama:detect", async () => {
        try {
            const { execSync } = await import("node:child_process");
            let installed = false;
            try {
                if (process.platform === "win32") {
                    execSync("where ollama", { stdio: "pipe" });
                }
                else {
                    execSync("command -v ollama", { stdio: "pipe", shell: "/bin/sh" });
                }
                installed = true;
            }
            catch {
                installed = false;
            }
            let apiRunning = false;
            try {
                const response = await fetch("http://127.0.0.1:11434/api/tags");
                apiRunning = response.ok;
            }
            catch {
                apiRunning = false;
            }
            return { installed, apiRunning, baseUrl: "http://localhost:11434/v1" };
        }
        catch {
            return {
                installed: false,
                apiRunning: false,
                baseUrl: "http://localhost:11434/v1",
            };
        }
    });
    ipcMain.handle("lmstudio:detect", async () => {
        try {
            let installed = false;
            if (process.platform === "darwin") {
                installed = fs.existsSync("/Applications/LM Studio.app");
            }
            else if (process.platform === "win32") {
                const base = process.env.LOCALAPPDATA ?? "";
                installed = base
                    ? fs.existsSync(path.join(base, "Programs", "LM Studio"))
                    : false;
            }
            else {
                const home = os.homedir();
                installed =
                    fs.existsSync(path.join(home, "LM-Studio")) ||
                        fs.existsSync(path.join(home, "Applications", "LM-Studio"));
            }
            let apiRunning = false;
            try {
                const response = await fetch("http://127.0.0.1:1234/v1/models");
                apiRunning = response.ok;
            }
            catch {
                apiRunning = false;
            }
            return { installed, apiRunning, baseUrl: "http://localhost:1234/v1" };
        }
        catch {
            return {
                installed: false,
                apiRunning: false,
                baseUrl: "http://localhost:1234/v1",
            };
        }
    });
    ipcMain.handle("vscode:openWorktree", async (_event, worktreePath) => {
        try {
            if (process.platform === "darwin") {
                const { execSync } = await import("node:child_process");
                execSync(`open -a "Visual Studio Code" "${worktreePath}"`);
            }
            else if (process.platform === "win32") {
                const { execSync } = await import("node:child_process");
                execSync(`code "${worktreePath}"`);
            }
            else {
                const { execSync } = await import("node:child_process");
                execSync(`code "${worktreePath}"`);
            }
            return { success: true };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    });
    ipcMain.handle("app:openExternalApplication", async (_event, command, args) => {
        try {
            if (typeof command !== "string" || !command.trim()) {
                return { success: false, error: "Missing command" };
            }
            const normalizedArgs = Array.isArray(args)
                ? args.filter((arg) => typeof arg === "string")
                : [];
            const { spawn } = await import("node:child_process");
            const child = spawn(command, normalizedArgs, {
                detached: true,
                stdio: "ignore",
                shell: process.platform === "win32",
            });
            child.unref();
            return { success: true };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    });
    // Composer drafts handlers
    ipcMain.handle("composer:saveDraft", async (_event, key, content) => {
        try {
            const { saveComposerDraft } = await import("../db/repos/conversations.js");
            saveComposerDraft(getDb(), key, content);
            return { ok: true };
        }
        catch (error) {
            console.error("Failed to save composer draft:", error);
            return {
                ok: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    });
    ipcMain.handle("composer:getDraft", async (_event, key) => {
        try {
            const { getComposerDraft } = await import("../db/repos/conversations.js");
            const draft = getComposerDraft(getDb(), key);
            return { ok: true, draft: draft?.content ?? null };
        }
        catch (error) {
            console.error("Failed to get composer draft:", error);
            return {
                ok: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    });
    ipcMain.handle("composer:getAllDrafts", async () => {
        try {
            const { getComposerDrafts } = await import("../db/repos/conversations.js");
            const drafts = getComposerDrafts(getDb());
            const result = {};
            for (const draft of drafts) {
                result[draft.key] = draft.content;
            }
            return { ok: true, drafts: result };
        }
        catch (error) {
            console.error("Failed to get all composer drafts:", error);
            return {
                ok: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    });
    ipcMain.handle("composer:deleteDraft", async (_event, key) => {
        try {
            const { deleteComposerDraft } = await import("../db/repos/conversations.js");
            deleteComposerDraft(getDb(), key);
            return { ok: true };
        }
        catch (error) {
            console.error("Failed to delete composer draft:", error);
            return {
                ok: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    });
    ipcMain.handle("composer:saveQueuedMessages", async (_event, key, messages) => {
        try {
            const { saveComposerQueuedMessages } = await import("../db/repos/conversations.js");
            saveComposerQueuedMessages(getDb(), key, messages);
            return { ok: true };
        }
        catch (error) {
            console.error("Failed to save queued composer messages:", error);
            return {
                ok: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    });
    ipcMain.handle("composer:getQueuedMessages", async (_event, key) => {
        try {
            const { getComposerQueuedMessages } = await import("../db/repos/conversations.js");
            const queued = getComposerQueuedMessages(getDb(), key);
            return {
                ok: true,
                messages: queued ? JSON.parse(queued.messages_json) : [],
            };
        }
        catch (error) {
            console.error("Failed to get queued composer messages:", error);
            return {
                ok: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    });
    ipcMain.handle("composer:getAllQueuedMessages", async () => {
        try {
            const { getAllComposerQueuedMessages } = await import("../db/repos/conversations.js");
            const queuedEntries = getAllComposerQueuedMessages(getDb());
            const result = {};
            for (const entry of queuedEntries) {
                result[entry.key] = JSON.parse(entry.messages_json);
            }
            return { ok: true, queuedMessages: result };
        }
        catch (error) {
            console.error("Failed to get all queued composer messages:", error);
            return {
                ok: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    });
    ipcMain.handle("composer:deleteQueuedMessages", async (_event, key) => {
        try {
            const { deleteComposerQueuedMessages } = await import("../db/repos/conversations.js");
            deleteComposerQueuedMessages(getDb(), key);
            return { ok: true };
        }
        catch (error) {
            console.error("Failed to delete queued composer messages:", error);
            return {
                ok: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    });
    // Performance tracing (dev mode)
    let tracingActive = false;
    ipcMain.handle("tracing:start", async () => {
        if (tracingActive) {
            return { ok: false, message: "Tracing already active" };
        }
        try {
            await contentTracing.startRecording({
                included_categories: ["*"],
            });
            tracingActive = true;
            return { ok: true };
        }
        catch (error) {
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
            // Stop recording into a temp file first
            const tempPath = await contentTracing.stopRecording();
            tracingActive = false;
            // Ask the user where to save the trace file
            const win = BrowserWindow.getFocusedWindow();
            const result = await dialog.showSaveDialog(win ?? BrowserWindow.getAllWindows()[0], {
                title: "Save performance trace",
                defaultPath: `chaton-trace-${Date.now()}.json`,
                filters: [{ name: "JSON Trace", extensions: ["json"] }],
            });
            // @ts-ignore - Electron dialog type issue
            if (result.canceled || !result.filePath) {
                // User cancelled, clean up temp file
                try {
                    fs.unlinkSync(tempPath);
                }
                catch { /* ignore */ }
                return { ok: true, cancelled: true };
            }
            // Move temp trace to chosen location
            // @ts-ignore - Electron dialog type issue
            fs.copyFileSync(tempPath, result.filePath);
            try {
                fs.unlinkSync(tempPath);
            }
            catch { /* ignore */ }
            // @ts-ignore - Electron dialog type issue
            return { ok: true, filePath: result.filePath };
        }
        catch (error) {
            tracingActive = false;
            console.error("Failed to stop tracing:", error);
            return {
                ok: false,
                message: error instanceof Error ? error.message : "Unknown error",
            };
        }
    });
}
//# sourceMappingURL=workspace-handlers.js.map