import electron from "electron";
const { app, BrowserWindow } = electron;
import crypto, { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type {
  ImageContent as PiAiImageContent,
  Model,
} from "@mariozechner/pi-ai";
import {
  AuthStorage,
  type ApiKeyCredential,
  createAgentSession,
  createCodingTools,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
  type ExtensionUIContext,
} from "@mariozechner/pi-coding-agent";
import type { ExtensionWidgetOptions } from "@mariozechner/pi-coding-agent";

import {
  findConversationById,
  saveConversationPiRuntime,
  type DbConversation,
} from "./db/repos/conversations.js";
import { getDb } from "./db/index.js";
import { findProjectById } from "./db/repos/projects.js";
import { getSidebarSettings } from "./db/repos/settings.js";
import { runBeforePiLaunchHooks, getChatonsExtensionsBaseDir } from "./extensions/manager.js";
import { getExposedExtensionTools, listExtensionManifests } from "./extensions/runtime.js";

export type PiRuntimeStatus =
  | "stopped"
  | "starting"
  | "ready"
  | "streaming"
  | "error";

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

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ImageContent = {
  type: "image";
  data: string;
  mimeType: string;
};

export type RpcExtensionUiRequest = {
  type: "extension_ui_request";
  id: string;
  method:
    | "select"
    | "confirm"
    | "input"
    | "editor"
    | "notify"
    | "setStatus"
    | "setWidget"
    | "setTitle"
    | "set_editor_text"
    | "set_thread_actions";
  [key: string]: JsonValue | undefined;
};

export type RpcExtensionUiResponse =
  | { type: "extension_ui_response"; id: string; value: string }
  | { type: "extension_ui_response"; id: string; confirmed: boolean }
  | { type: "extension_ui_response"; id: string; cancelled: true };

export type RpcCommand =
  | { id?: string; type: "get_state" }
  | { id?: string; type: "get_messages" }
  | { id?: string; type: "get_available_models" }
  | { id?: string; type: "get_access_mode" }
  | { id?: string; type: "get_commands" }
  | {
      id?: string;
      type: "prompt";
      message: string;
      images?: ImageContent[];
      streamingBehavior?: "steer" | "followUp";
    }
  | { id?: string; type: "steer"; message: string; images?: ImageContent[] }
  | { id?: string; type: "follow_up"; message: string; images?: ImageContent[] }
  | { id?: string; type: "abort" }
  | { id?: string; type: "set_model"; provider: string; modelId: string }
  | {
      id?: string;
      type: "set_thinking_level";
      level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
    }
  | { id?: string; type: "cycle_thinking_level" }
  | { id?: string; type: "set_auto_compaction"; enabled: boolean }
  | { id?: string; type: "set_auto_retry"; enabled: boolean }
  | { id?: string; type: "set_steering_mode"; mode: "all" | "one-at-a-time" }
  | { id?: string; type: "set_follow_up_mode"; mode: "all" | "one-at-a-time" };

export type RpcResponse = {
  id?: string;
  type: "response";
  command: string;
  success: boolean;
  data?: JsonValue;
  error?: string;
};

export type RpcEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages?: JsonValue[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message?: JsonValue; toolResults?: JsonValue[] }
  | { type: "message_start"; message: JsonValue }
  | {
      type: "message_update";
      message: JsonValue;
      assistantMessageEvent?: JsonValue;
    }
  | { type: "message_end"; message: JsonValue }
  | {
      type: "tool_execution_start";
      toolCallId?: string;
      toolName?: string;
      args?: JsonValue;
    }
  | {
      type: "tool_execution_update";
      toolCallId?: string;
      toolName?: string;
      partialResult?: JsonValue;
    }
  | {
      type: "tool_execution_end";
      toolCallId?: string;
      toolName?: string;
      result?: JsonValue;
      isError?: boolean;
    }
  | { type: "auto_compaction_start"; reason?: string }
  | {
      type: "auto_compaction_end";
      result?: JsonValue;
      aborted?: boolean;
      willRetry?: boolean;
      errorMessage?: string;
    }
  | {
      type: "auto_retry_start";
      attempt?: number;
      maxAttempts?: number;
      delayMs?: number;
      errorMessage?: string;
    }
  | {
      type: "auto_retry_end";
      success?: boolean;
      attempt?: number;
      finalError?: string;
    }
  | {
      type: "extension_error";
      extensionPath?: string;
      event?: string;
      error?: string;
    }
  | RpcExtensionUiRequest;

export type RpcSessionState = {
  model: { provider: string; id: string } | null;
  thinkingLevel: string;
  isStreaming: boolean;
  isCompacting: boolean;
  steeringMode: "all" | "one-at-a-time";
  followUpMode: "all" | "one-at-a-time";
  sessionFile: string;
  sessionId: string;
  sessionName?: string;
  autoCompactionEnabled: boolean;
  messageCount: number;
  pendingMessageCount: number;
};

export type PiProcessLifecycleEvent =
  | { type: "runtime_status"; status: PiRuntimeStatus; message?: string }
  | { type: "runtime_error"; message: string };

export type PiRendererEvent = {
  conversationId: string;
  event: RpcEvent | RpcResponse | PiProcessLifecycleEvent;
};

type RuntimeState = {
  conversationId: string;
  session: AgentSession;
  settingsManager: SettingsManager;
  modelRegistry: ModelRegistry;
  authStorage: AuthStorage;
  pendingExtensionUiRequests: Map<
    string,
    { resolve: (response: RpcExtensionUiResponse) => void }
  >;
  status: PiRuntimeStatus;
  snapshotState: RpcSessionState | null;
  snapshotMessages: JsonValue[];
};

function getAgentDir() {
  return path.join(app.getPath("userData"), ".pi", "agent");
}

function migrateProviderApiKeysToAuthIfNeeded(agentDir: string) {
  const modelsPath = path.join(agentDir, "models.json");
  const authPath = path.join(agentDir, "auth.json");
  if (!fs.existsSync(modelsPath)) return;

  type ModelsShape = { providers?: Record<string, { apiKey?: unknown }> };
  let models: ModelsShape | null = null;
  try {
    models = JSON.parse(fs.readFileSync(modelsPath, "utf8")) as ModelsShape;
  } catch {
    return;
  }
  if (
    !models ||
    typeof models !== "object" ||
    !models.providers ||
    typeof models.providers !== "object"
  ) {
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
  for (const [provider, cfg] of Object.entries(models.providers)) {
    const key = typeof cfg?.apiKey === "string" ? cfg.apiKey.trim() : "";
    if (!key) continue;

    const existing = auth[provider] as
      | { type?: unknown; key?: unknown }
      | undefined;
    if (
      existing &&
      typeof existing === "object" &&
      existing.type === "api_key" &&
      typeof existing.key === "string" &&
      existing.key.trim().length > 0
    ) {
      continue;
    }
    auth[provider] = { type: "api_key", key };
    changed = true;
  }

  if (!changed) return;
  fs.mkdirSync(path.dirname(authPath), { recursive: true });
  fs.writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`, "utf8");
}

function getGlobalWorkspaceDir() {
  return path.join(app.getPath("userData"), "workspace", "global");
}

function getOpenModeToolsCwd() {
  return process.platform === "win32" ? path.parse(process.cwd()).root : "/";
}

function toPiImageContent(image: ImageContent): PiAiImageContent {
  return {
    type: "image",
    data: image.data,
    mimeType: image.mimeType,
  };
}

function safeJson(value: unknown): JsonValue {
  try {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  } catch {
    return null;
  }
}

function maskValue(value: string, start = 4, end = 2): string {
  const trimmed = value.trim();
  if (trimmed.length <= start + end)
    return "*".repeat(Math.max(1, trimmed.length));
  return `${trimmed.slice(0, start)}...${trimmed.slice(-end)}`;
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 10);
}

function buildState(runtime: RuntimeState): RpcSessionState {
  const model = runtime.session.model;
  return {
    model: model ? { provider: model.provider, id: model.id } : null,
    thinkingLevel: runtime.session.thinkingLevel,
    isStreaming: runtime.session.isStreaming,
    isCompacting: runtime.session.isCompacting,
    steeringMode: runtime.session.steeringMode,
    followUpMode: runtime.session.followUpMode,
    sessionFile: runtime.session.sessionFile ?? "",
    sessionId: runtime.session.sessionId,
    sessionName: runtime.session.sessionName,
    autoCompactionEnabled: runtime.settingsManager.getCompactionEnabled(),
    messageCount: runtime.session.messages.length,
    pendingMessageCount: 0,
  };
}

function listScopedOrAllModels(
  runtime: RuntimeState,
): Array<{ provider: string; id: string }> {
  const all = runtime.modelRegistry.getAvailable();
  const enabled = runtime.settingsManager.getEnabledModels() ?? [];
  const scoped =
    enabled.length > 0
      ? all.filter((model) => enabled.includes(`${model.provider}/${model.id}`))
      : all;
  const source = scoped.length > 0 ? scoped : all;
  return source.map((model) => ({ provider: model.provider, id: model.id }));
}

function convertEvent(event: AgentSessionEvent): RpcEvent | null {
  switch (event.type) {
    case "agent_start":
    case "agent_end":
    case "turn_start":
    case "turn_end":
    case "message_start":
    case "message_update":
    case "message_end":
    case "tool_execution_start":
    case "tool_execution_update":
    case "tool_execution_end":
    case "auto_compaction_start":
    case "auto_compaction_end":
    case "auto_retry_start":
    case "auto_retry_end":
      return safeJson(event) as RpcEvent;
    default:
      return null;
  }
}

function buildExtensionContextSection(): string | null {
  try {
    const manifests = listExtensionManifests();
    if (manifests.length === 0) {
      return null;
    }

    const extensionsBaseDir = getChatonsExtensionsBaseDir();
    const lines = [
      "## Available Extensions",
      "",
      "The following extensions are installed and available to this session:",
      "",
    ];

    for (const manifest of manifests) {
      const extensionPath = path.join(extensionsBaseDir, manifest.id);
      const capabilities = manifest.capabilities?.length
        ? manifest.capabilities.join(", ")
        : "no capabilities declared";

      lines.push(`- **${manifest.name}** (v${manifest.version})`);
      lines.push(`  ID: ${manifest.id}`);
      lines.push(`  Location: ${extensionPath}`);
      lines.push(`  Capabilities: ${capabilities}`);
      lines.push("");
    }

    return lines.join("\n").trim();
  } catch (error) {
    console.warn(
      `Failed to build extension context: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

function buildExtensionDevelopmentGuidance(): string {
  const extensionsBaseDir = getChatonsExtensionsBaseDir();
  return [
    "## Extension Development Guidance",
    "",
    "If the user asks you to create or edit an extension, follow these guidelines:",
    "",
    "1. **Documentation Reference**: For comprehensive extension development documentation, refer to https://docs.chatons.ai/extensions",
    "2. **Extension Location**: Always create new extensions in the user's extension home folder:",
    `   \`${extensionsBaseDir}\``,
    "3. **File Structure**: Follow the standard extension manifest structure as documented in the Chatons extensions guide.",
    "4. **Best Practices**: When editing or creating extensions, ensure proper manifest validation and follow the patterns in the documentation.",
    "5. **User Guidance**: When helping with extensions, provide clear paths and file locations relative to the extension home folder.",
  ].join("\n");
}

class PiSdkRuntime {
  private status: PiRuntimeStatus = "stopped";
  private runtime: RuntimeState | null = null;

  constructor(
    private readonly conversationId: string,
    private readonly onEvent: (payload: PiRendererEvent) => void,
  ) {}

  getStatus() {
    return this.status;
  }

  getSnapshot() {
    return {
      state: this.runtime?.snapshotState ?? null,
      messages: this.runtime?.snapshotMessages ?? [],
      status: this.status,
    };
  }

  private emit(event: RpcEvent | RpcResponse | PiProcessLifecycleEvent) {
    this.onEvent({ conversationId: this.conversationId, event });
  }

  private setStatus(status: PiRuntimeStatus, message?: string) {
    this.status = status;
    this.emit({ type: "runtime_status", status, message });
  }

  private buildAuthDebugSuffix(): string {
    if (!this.runtime) return "";
    const model = this.runtime.session.model;
    if (!model) return "";
    const provider = model.provider;

    const fromAuth = this.runtime.authStorage.get(provider) as
      | ApiKeyCredential
      | undefined;
    const hasAuthEntry = Boolean(fromAuth && typeof fromAuth === "object");
    const hasAuthApiKey =
      hasAuthEntry &&
      fromAuth?.type === "api_key" &&
      typeof fromAuth.key === "string";
    const authKeyRaw = hasAuthApiKey ? String(fromAuth.key).trim() : "";

    let modelApiKey = "";
    try {
      const modelsPath = path.join(getAgentDir(), "models.json");
      if (fs.existsSync(modelsPath)) {
        const raw = JSON.parse(fs.readFileSync(modelsPath, "utf8")) as {
          providers?: Record<string, { apiKey?: unknown }>;
        };
        const providerNode = raw?.providers?.[provider];
        if (
          providerNode &&
          typeof providerNode === "object" &&
          typeof providerNode.apiKey === "string"
        ) {
          modelApiKey = providerNode.apiKey.trim();
        }
      }
    } catch {
      // Best-effort diagnostics only.
    }

    const resolvedViaStorage = hasAuthApiKey
      ? "auth.json"
      : hasAuthEntry
        ? "auth.json(non-api-key)"
        : modelApiKey
          ? "models.json(fallback)"
          : "env-or-none";

    const effectiveKey = authKeyRaw || modelApiKey;
    const masked = effectiveKey ? maskValue(effectiveKey) : "none";
    const fp = effectiveKey ? fingerprint(effectiveKey) : "none";

    return ` [auth-debug provider=${provider} source=${resolvedViaStorage} hasAuth=${hasAuthEntry ? "yes" : "no"} hasModelApiKey=${modelApiKey ? "yes" : "no"} key=${masked} fp=${fp}]`;
  }

  private enrichRuntimeError(message: string): string {
    const lower = message.toLowerCase();
    const isAuthError =
      /\b401\b/.test(lower) ||
      /\bunauthorized\b/.test(lower) ||
      /\bno api key\b/.test(lower) ||
      /\bapi key\b/.test(lower);
    if (!isAuthError) return message;
    return `${message}${this.buildAuthDebugSuffix()}`;
  }

  private refreshSnapshot() {
    if (!this.runtime) return;
    this.runtime.snapshotState = buildState(this.runtime);
    this.runtime.snapshotMessages = safeJson(
      this.runtime.session.messages,
    ) as JsonValue[];
  }

  private attachSessionListener(runtime: RuntimeState) {
    runtime.session.subscribe((event) => {
      if (event.type === "agent_start") this.setStatus("streaming");
      if (event.type === "agent_end") this.setStatus("ready");
      this.refreshSnapshot();
      const converted = convertEvent(event);
      if (converted) this.emit(converted);
    });
  }

  private emitExtensionUiRequest(
    method: RpcExtensionUiRequest["method"],
    payload: Record<string, JsonValue | undefined>,
  ) {
    const requestId = crypto.randomUUID();
    this.emit({
      type: "extension_ui_request",
      id: requestId,
      method,
      ...payload,
    });
    return requestId;
  }

  private requestExtensionUiResponse<T>(
    runtime: RuntimeState,
    method: Extract<
      RpcExtensionUiRequest["method"],
      "select" | "confirm" | "input" | "editor"
    >,
    payload: Record<string, JsonValue | undefined>,
    options: { signal?: AbortSignal; timeout?: number } | undefined,
    mapResponse: (response: RpcExtensionUiResponse) => T,
    fallbackOnCancel: T,
  ): Promise<T> {
    if (options?.signal?.aborted) {
      return Promise.resolve(fallbackOnCancel);
    }

    return new Promise<T>((resolve) => {
      const requestId = this.emitExtensionUiRequest(method, payload);
      let timeoutHandle: NodeJS.Timeout | undefined;

      const cleanup = () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = undefined;
        }
        if (options?.signal && onAbort) {
          options.signal.removeEventListener("abort", onAbort);
        }
        runtime.pendingExtensionUiRequests.delete(requestId);
      };

      const finishWithFallback = () => {
        cleanup();
        resolve(fallbackOnCancel);
      };

      const onAbort = () => finishWithFallback();

      if (
        options?.timeout &&
        Number.isFinite(options.timeout) &&
        options.timeout > 0
      ) {
        timeoutHandle = setTimeout(() => finishWithFallback(), options.timeout);
      }

      if (options?.signal) {
        options.signal.addEventListener("abort", onAbort, { once: true });
      }

      runtime.pendingExtensionUiRequests.set(requestId, {
        resolve: (response) => {
          cleanup();
          resolve(mapResponse(response));
        },
      });
    });
  }

  async start(conversation: DbConversation) {
    if (this.runtime) return;

    const db = getDb();
    migrateProviderApiKeysToAuthIfNeeded(getAgentDir());
    const project =
      conversation.project_id && conversation.project_id.trim().length > 0
        ? findProjectById(db, conversation.project_id)
        : null;
    if (conversation.project_id && !project) {
      this.setStatus("error", "Project not found for conversation");
      throw new Error("Project not found for conversation");
    }

    this.setStatus("starting");

    // Run extension hooks before creating the Pi session. Failures are non-blocking by default.
    const hookResult = runBeforePiLaunchHooks();
    if (hookResult.report.some((item) => !item.ok)) {
      const errors = hookResult.report
        .filter((item) => !item.ok)
        .map((item) => `${item.id}: ${item.message}`);
      this.emit({
        type: "runtime_error",
        message: `Extension hook warning: ${errors.join(" | ")}`,
      });
    }

    const authStorage = AuthStorage.create(
      path.join(getAgentDir(), "auth.json"),
    );
    const modelRegistry = new ModelRegistry(
      authStorage,
      path.join(getAgentDir(), "models.json"),
    );
    fs.mkdirSync(getGlobalWorkspaceDir(), { recursive: true });
    const runtimeCwd =
      conversation.worktree_path && conversation.worktree_path.trim().length > 0
        ? conversation.worktree_path
        : (project?.repo_path ?? getGlobalWorkspaceDir());
    const accessMode = conversation.access_mode === "open" ? "open" : "secure";
    const toolsCwd = accessMode === "open" ? getOpenModeToolsCwd() : runtimeCwd;
    const settingsManager = await createSettingsManagerWithRetry(
      runtimeCwd,
      getAgentDir(),
    );
    const sidebarSettings = getSidebarSettings(db);
    const behaviorPrompt = sidebarSettings.defaultBehaviorPrompt?.trim() ?? "";

    const sessionPath =
      conversation.pi_session_file &&
      conversation.pi_session_file.trim().length > 0
        ? conversation.pi_session_file
        : path.join(
            getAgentDir(),
            "sessions",
            "chaton",
            `${conversation.id}.jsonl`,
          );

    fs.mkdirSync(path.dirname(sessionPath), { recursive: true });

    const sessionManager = fs.existsSync(sessionPath)
      ? SessionManager.open(sessionPath, path.dirname(sessionPath))
      : SessionManager.create(runtimeCwd, path.dirname(sessionPath));

    const desiredProvider =
      conversation.model_provider ??
      settingsManager.getDefaultProvider() ??
      "openai-codex";
    const desiredModelId =
      conversation.model_id ??
      settingsManager.getDefaultModel() ??
      "gpt-5.3-codex";
    const model = modelRegistry.find(desiredProvider, desiredModelId);
    const thinkingLevel = (conversation.thinking_level ??
      settingsManager.getDefaultThinkingLevel() ??
      "medium") as ThinkingLevel;

    const resourceLoader = new DefaultResourceLoader({
      cwd: runtimeCwd,
      agentDir: getAgentDir(),
      settingsManager,
      appendSystemPromptOverride: (base) => {
        const sections = [...base];
        sections.push(
          "If the user mentions creating or editing an extension, first read the project's extension documentation before proposing or applying changes.",
        );
        if (behaviorPrompt) {
          sections.push(`## Comportement par defaut\n${behaviorPrompt}`);
        }
        sections.push(
          [
            "## Thread action suggestions tool",
            "You can use the internal thread action suggestions tool to propose up to 4 clickable actions for the current thread.",
            "Use it when concise next-step choices would help the user respond faster, such as confirmations, mutually exclusive solution paths, or a few clear follow-up options.",
            "Do not overuse it. Avoid suggesting actions for every reply. Prefer it only when it meaningfully reduces friction or clarifies the next decision.",
            "Keep labels short, specific, and easy to click.",
            "If normal text is clearer than buttons, just answer normally without using the tool.",
          ].join("\n"),
        );
        sections.push(
          [
            "## Conversation access mode",
            `Current access mode at session start: ${accessMode}.`,
            accessMode === "open"
              ? "Open mode was enabled when this session was prepared."
              : "Secure mode was enabled when this session was prepared.",
            "If you need to confirm the current mode later, use the internal get_access_mode tool/command instead of assuming it has not changed.",
          ].join("\n"),
        );
        sections.push(
          [
            "## Secure mode limitation handling",
            "If you cannot complete a task because you do not have enough filesystem or project context, consider whether the current access mode may be the reason.",
            "When secure mode is active and that is likely the reason, clearly tell the user what you cannot access or do.",
            "Then suggest switching to open mode so you can inspect broader context or work outside the current conversation scope.",
            "Make that suggestion in the same language as the user.",
            'When helpful, use the thread action suggestions tool to offer a short action such as "Switch to open mode" in the user\'s language.',
            "Do not blame the access mode if the limitation is unrelated.",
          ].join("\n"),
        );
        const extensionContext = buildExtensionContextSection();
        if (extensionContext) {
          sections.push(extensionContext);
        }
        sections.push(buildExtensionDevelopmentGuidance());
        if (accessMode === "open") {
          sections.push(
            [
              "## Mode ouvert",
              "Cette conversation est en mode ouvert.",
              "- Tu peux acceder a des fichiers et dossiers en dehors du contexte initial de la conversation.",
              "- Tu peux executer toutes les commandes necessaires pour resoudre la tache demandee.",
              "- Privilegie les commandes sur le systeme de fichiers avec prudence et explicite ce que tu modifies.",
            ].join("\n"),
          );
        }
        return sections;
      },
    });
    await resourceLoader.reload();

    const { session } = await createAgentSession({
      cwd: runtimeCwd,
      agentDir: getAgentDir(),
      authStorage,
      modelRegistry,
      settingsManager,
      resourceLoader,
      sessionManager,
      tools: createCodingTools(toolsCwd),
      customTools: getExposedExtensionTools(),
      ...(model ? { model } : {}),
      thinkingLevel,
    });

    const runtime: RuntimeState = {
      conversationId: this.conversationId,
      session,
      settingsManager,
      modelRegistry,
      authStorage,
      pendingExtensionUiRequests: new Map(),
      status: "ready",
      snapshotState: null,
      snapshotMessages: [],
    };

    const extensionUiContext: ExtensionUIContext = {
      select: async (title, options, opts) =>
        this.requestExtensionUiResponse(
          runtime,
          "select",
          { title, options: options as unknown as JsonValue[] },
          opts,
          (response) => ("value" in response ? response.value : undefined),
          undefined,
        ),
      confirm: async (title, message, opts) =>
        this.requestExtensionUiResponse(
          runtime,
          "confirm",
          { title, message },
          opts,
          (response) => ("confirmed" in response ? response.confirmed : false),
          false,
        ),
      input: async (title, placeholder, opts) =>
        this.requestExtensionUiResponse(
          runtime,
          "input",
          { title, placeholder },
          opts,
          (response) => ("value" in response ? response.value : undefined),
          undefined,
        ),
      editor: async (title, prefill) =>
        this.requestExtensionUiResponse(
          runtime,
          "editor",
          { title, prefill },
          undefined,
          (response) => ("value" in response ? response.value : undefined),
          undefined,
        ),
      notify: (message, level) => {
        this.emitExtensionUiRequest("notify", { message, level });
      },
      onTerminalInput: () => () => undefined,
      setStatus: (key, text) => {
        this.emitExtensionUiRequest("setStatus", { key, text });
      },
      setWorkingMessage: (message) => {
        this.emitExtensionUiRequest("notify", { message, level: "info" });
      },
      setWidget: (key, content, _options?: ExtensionWidgetOptions) => {
        if (!Array.isArray(content) && content !== undefined) {
          return;
        }
        this.emitExtensionUiRequest("setWidget", {
          key,
          content: (content ?? null) as JsonValue,
        });
      },
      setFooter: () => undefined,
      setHeader: () => undefined,
      setTitle: (title) => {
        this.emitExtensionUiRequest("setTitle", { title });
      },
      custom: async () => undefined as never,
      pasteToEditor: (text) => {
        this.emitExtensionUiRequest("set_editor_text", { text });
      },
      setEditorText: (text) => {
        this.emitExtensionUiRequest("set_editor_text", { text });
      },
      getEditorText: () => "",
      setEditorComponent: () => undefined,
      get theme() {
        return {} as never;
      },
      getAllThemes: () => [],
      getTheme: () => undefined,
      setTheme: () => ({ success: false, error: "not_supported" }),
      getToolsExpanded: () => true,
      setToolsExpanded: () => undefined,
    };
    await session.bindExtensions({
      uiContext: extensionUiContext,
      onError: (error) => {
        this.emit({
          type: "extension_error",
          extensionPath: error.extensionPath,
          event: error.event,
          error: error.error,
        });
      },
    });

    this.runtime = runtime;
    this.attachSessionListener(runtime);
    this.refreshSnapshot();
    this.setStatus("ready");

    saveConversationPiRuntime(db, conversation.id, {
      piSessionFile: session.sessionFile ?? sessionPath,
      modelProvider: session.model?.provider,
      modelId: session.model?.id,
      thinkingLevel: session.thinkingLevel,
    });
  }

  async send(command: RpcCommand): Promise<RpcResponse> {
    if (!this.runtime) {
      throw new Error("Pi session is not started");
    }

    const id = command.id;

    try {
      if (command.type === "get_state") {
        this.refreshSnapshot();
        return {
          id,
          type: "response",
          command: "get_state",
          success: true,
          data: safeJson(this.runtime.snapshotState),
        };
      }

      if (command.type === "get_messages") {
        this.refreshSnapshot();
        return {
          id,
          type: "response",
          command: "get_messages",
          success: true,
          data: {
            messages: safeJson(this.runtime.snapshotMessages) as JsonValue[],
          },
        };
      }

      if (command.type === "get_available_models") {
        const models = listScopedOrAllModels(this.runtime);
        return {
          id,
          type: "response",
          command: "get_available_models",
          success: true,
          data: safeJson({ models }),
        };
      }

      if (command.type === "get_access_mode") {
        const db = getDb();
        const conversation = findConversationById(db, this.conversationId);
        const accessMode =
          conversation?.access_mode === "open" ? "open" : "secure";
        return {
          id,
          type: "response",
          command: "get_access_mode",
          success: true,
          data: safeJson({ accessMode }),
        };
      }

      if (command.type === "get_commands") {
        const commands = [
          "get_state",
          "get_messages",
          "get_available_models",
          "get_access_mode",
          "get_commands",
          "prompt",
          "steer",
          "follow_up",
          "abort",
          "set_model",
          "set_thinking_level",
          "cycle_thinking_level",
          "set_auto_compaction",
          "set_auto_retry",
          "set_steering_mode",
          "set_follow_up_mode",
        ];
        return {
          id,
          type: "response",
          command: "get_commands",
          success: true,
          data: safeJson({ commands }),
        };
      }

      if (command.type === "prompt") {
        await this.runtime.session.prompt(command.message, {
          images: command.images?.map(toPiImageContent),
          streamingBehavior: command.streamingBehavior,
        });
      }

      if (command.type === "steer") {
        await this.runtime.session.steer(
          command.message,
          command.images?.map(toPiImageContent),
        );
      }

      if (command.type === "follow_up") {
        await this.runtime.session.followUp(
          command.message,
          command.images?.map(toPiImageContent),
        );
      }

      if (command.type === "abort") {
        await this.runtime.session.abort();
      }

      if (command.type === "set_model") {
        // Reload auth storage to pick up any OAuth credentials added since runtime start
        // (e.g., GitHub Copilot or OpenAI OAuth connected via settings UI)
        this.runtime.authStorage.reload();
        let model = this.runtime.modelRegistry.find(
          command.provider,
          command.modelId,
        );
        if (!model) {
          // Reload model registry from current models.json so fallback-imported models
          // are immediately selectable without restarting the runtime.
          this.runtime.modelRegistry = new ModelRegistry(
            this.runtime.authStorage,
            path.join(getAgentDir(), "models.json"),
          );
          model = this.runtime.modelRegistry.find(
            command.provider,
            command.modelId,
          );
        }
        if (!model) {
          return {
            id,
            type: "response",
            command: command.type,
            success: false,
            error: `Model not found: ${command.provider}/${command.modelId}`,
          };
        }
        await this.runtime.session.setModel(model as Model<any>);
        const db = getDb();
        saveConversationPiRuntime(db, this.conversationId, {
          modelProvider: command.provider,
          modelId: command.modelId,
        });
      }

      if (command.type === "set_thinking_level") {
        this.runtime.session.setThinkingLevel(command.level);
        const db = getDb();
        saveConversationPiRuntime(db, this.conversationId, {
          thinkingLevel: command.level,
        });
      }

      if (command.type === "cycle_thinking_level") {
        const level = this.runtime.session.cycleThinkingLevel();
        if (level) {
          const db = getDb();
          saveConversationPiRuntime(db, this.conversationId, {
            thinkingLevel: level,
          });
        }
      }

      if (command.type === "set_auto_compaction") {
        this.runtime.settingsManager.setCompactionEnabled(command.enabled);
      }

      if (command.type === "set_auto_retry") {
        this.runtime.settingsManager.setRetryEnabled(command.enabled);
      }

      if (command.type === "set_steering_mode") {
        this.runtime.settingsManager.setSteeringMode(command.mode);
      }

      if (command.type === "set_follow_up_mode") {
        this.runtime.settingsManager.setFollowUpMode(command.mode);
      }

      this.refreshSnapshot();
      return {
        id,
        type: "response",
        command: command.type,
        success: true,
        data: safeJson(this.runtime.snapshotState),
      };
    } catch (error) {
      const baseMessage =
        error instanceof Error ? error.message : String(error);
      const message = this.enrichRuntimeError(baseMessage);
      const db = getDb();
      saveConversationPiRuntime(db, this.conversationId, {
        lastRuntimeError: message,
      });
      this.setStatus("error", message);
      this.emit({ type: "runtime_error", message });
      return {
        id,
        type: "response",
        command: command.type,
        success: false,
        error: message,
      };
    }
  }

  async respondExtensionUi(_response: RpcExtensionUiResponse) {
    if (!this.runtime) {
      return { ok: false as const, reason: "not_started" as const };
    }
    const pending = this.runtime.pendingExtensionUiRequests.get(_response.id);
    if (!pending) {
      return { ok: false as const, reason: "request_not_found" as const };
    }
    pending.resolve(_response);
    return { ok: true as const };
  }

  async stop() {
    if (!this.runtime) {
      this.setStatus("stopped");
      return;
    }

    try {
      await this.runtime.settingsManager.flush();
    } catch {
      // no-op
    }
    for (const pending of this.runtime.pendingExtensionUiRequests.values()) {
      pending.resolve({
        type: "extension_ui_response",
        id: "",
        cancelled: true,
      });
    }
    this.runtime.pendingExtensionUiRequests.clear();
    this.runtime.session.dispose();
    this.runtime = null;
    this.setStatus("stopped");
  }
}

export class PiSessionRuntimeManager {
  private readonly runtimes = new Map<string, PiSdkRuntime>();
  /** Ephemeral subagents running for channel ingestion, keyed by real conversation ID. */
  private readonly activeChannelSubagents = new Map<string, PiSdkRuntime>();
  private readonly listeners = new Set<(event: PiRendererEvent) => void>();

  private broadcast(event: PiRendererEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }

    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send("pi:event", event);
    }
  }

  subscribe(listener: (event: PiRendererEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private getOrCreateRuntime(conversationId: string) {
    let runtime = this.runtimes.get(conversationId);
    if (!runtime) {
      runtime = new PiSdkRuntime(conversationId, (event) =>
        this.broadcast(event),
      );
      this.runtimes.set(conversationId, runtime);
    }
    return runtime;
  }

  async start(conversationId: string) {
    const db = getDb();
    const conversation = findConversationById(db, conversationId);
    if (!conversation) {
      return {
        ok: false as const,
        reason: "conversation_not_found",
        message: "Conversation not found",
      };
    }

    const runtime = this.getOrCreateRuntime(conversationId);
    try {
      await runtime.start(conversation);
      return { ok: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      saveConversationPiRuntime(db, conversationId, {
        lastRuntimeError: message,
      });
      return { ok: false as const, reason: "start_failed", message };
    }
  }

  async stop(conversationId: string) {
    const runtime = this.runtimes.get(conversationId);
    if (!runtime) {
      return { ok: true as const };
    }

    await runtime.stop();
    this.runtimes.delete(conversationId);
    return { ok: true as const };
  }

  async sendCommand(conversationId: string, command: RpcCommand) {
    const started = await this.start(conversationId);
    if (!started.ok) {
      const startError =
        typeof started.message === "string"
          ? started.message
          : "Failed to start Pi session";
      return {
        type: "response",
        command: command.type,
        success: false,
        error: startError,
      } as RpcResponse;
    }

    const runtime = this.getOrCreateRuntime(conversationId);
    return runtime.send(command);
  }

  async getSnapshot(conversationId: string) {
    const runtime = this.getOrCreateRuntime(conversationId);
    const status = runtime.getStatus();
    if (status === "stopped") {
      const started = await this.start(conversationId);
      if (!started.ok) {
        return {
          state: null,
          messages: [],
          status: "stopped" as PiRuntimeStatus,
        };
      }
    }

    return runtime.getSnapshot();
  }

  async respondExtensionUi(
    conversationId: string,
    response: RpcExtensionUiResponse,
  ) {
    const runtime = this.runtimes.get(conversationId);
    if (!runtime) {
      return { ok: false as const, reason: "not_started" };
    }
    return runtime.respondExtensionUi(response);
  }

  async stopAll() {
    const ids = Array.from(this.runtimes.keys());
    for (const id of ids) {
      await this.stop(id);
    }
  }

  /**
   * Runs a channel subagent for the given conversation.
   *
   * The subagent is an ephemeral Pi session that has the conversation's history
   * as context (via a copy of the session file) but runs fully independently.
   * No messages are written to the main conversation's session file.
   * The caller is responsible for persisting the clean result to the DB cache.
   */
  async runChannelSubagent(
    conversationId: string,
    message: string,
  ): Promise<{ ok: true; reply: string } | { ok: false; message: string }> {
    const db = getDb();
    const conversation = findConversationById(db, conversationId);
    if (!conversation) {
      return { ok: false, message: "Conversation not found" };
    }

    const agentDir = getAgentDir();
    const realSessionPath =
      conversation.pi_session_file?.trim()
        ? conversation.pi_session_file.trim()
        : path.join(agentDir, "sessions", "chaton", `${conversation.id}.jsonl`);

    // Copy real session file to a temp location so the subagent has full history
    // without touching the main session file.
    const tempSessionPath = path.join(
      os.tmpdir(),
      `chaton-subagent-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`,
    );
    try {
      if (fs.existsSync(realSessionPath)) {
        fs.copyFileSync(realSessionPath, tempSessionPath);
      }
    } catch {
      // If copy fails, subagent starts with no history — acceptable fallback.
    }

    const ephemeralId = `__channel_subagent__:${conversationId}:${Date.now()}`;
    const ephemeralConversation: DbConversation = {
      ...conversation,
      id: ephemeralId,
      pi_session_file: tempSessionPath,
    };

    // No-op event handler: subagent events must not be broadcast to the renderer.
    const subagentRuntime = new PiSdkRuntime(ephemeralId, () => {});
    // Register so concurrent inbound messages can steer this subagent.
    this.activeChannelSubagents.set(conversationId, subagentRuntime);
    try {
      await subagentRuntime.start(ephemeralConversation);
      const response = await subagentRuntime.send({ type: "prompt", message });
      if (!response.success) {
        return {
          ok: false,
          message:
            typeof response.error === "string"
              ? response.error
              : "Channel subagent failed",
        };
      }
      const snapshot = subagentRuntime.getSnapshot();
      const reply = extractTextFromSnapshot(snapshot);
      return { ok: true, reply: reply ?? "" };
    } finally {
      this.activeChannelSubagents.delete(conversationId);
      try {
        await subagentRuntime.stop();
      } catch {
        // ignore stop errors
      }
      try {
        fs.unlinkSync(tempSessionPath);
      } catch {
        // ignore cleanup errors
      }
    }
  }

  /**
   * Returns true if an active channel subagent is currently processing a
   * message for the given conversation.
   */
  hasActiveChannelSubagent(conversationId: string): boolean {
    return this.activeChannelSubagents.has(conversationId);
  }

  /**
   * Steers the active channel subagent for a conversation with a new message.
   * The steer is sent asynchronously — the running subagent will incorporate
   * it and its final reply will be delivered via the normal outbound path.
   * Returns false if no subagent is currently active for this conversation.
   */
  steerChannelSubagent(conversationId: string, message: string): boolean {
    const runtime = this.activeChannelSubagents.get(conversationId);
    if (!runtime) return false;
    // Fire-and-forget: the steer interrupts the current generation mid-stream.
    // The original runChannelSubagent call awaiting send({ type: "prompt" })
    // will resolve after the steered response completes and return the reply.
    void runtime.send({ type: "steer", message });
    return true;
  }
}

/** Extract the latest assistant text from a Pi session snapshot. */
function extractTextFromSnapshot(
  snapshot: { messages?: unknown[] } | null | undefined,
): string | null {
  const messages = Array.isArray(snapshot?.messages) ? snapshot.messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i] as Record<string, unknown> | null;
    if (!msg) continue;
    const role =
      (typeof msg.role === "string" ? msg.role : null) ??
      ((msg.message as Record<string, unknown> | undefined)?.role as
        | string
        | undefined) ??
      "";
    if (role !== "assistant") continue;
    const rawContent =
      Array.isArray(msg.content)
        ? msg.content
        : Array.isArray(
              (msg.message as Record<string, unknown> | undefined)?.content,
            )
          ? ((msg.message as Record<string, unknown>).content as unknown[])
          : [];
    const parts = rawContent
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const p = part as Record<string, unknown>;
        return p.type === "text" && typeof p.text === "string" ? p.text : "";
      })
      .filter((t) => t.trim().length > 0);
    if (parts.length > 0) return parts.join("\n\n").trim();
  }
  return null;
}
