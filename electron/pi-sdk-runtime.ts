import electron from "electron";
const { app, BrowserWindow } = electron;
import crypto, { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { ImageContent as PiAiImageContent, Model, TextContent } from "@mariozechner/pi-ai";
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionContext,
  ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import {
  AuthStorage,
  type ApiKeyCredential,
  createAgentSession,
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
  type EditOperations,
  type ExtensionUIContext,
  type WriteOperations,
} from "@mariozechner/pi-coding-agent";
import type { ExtensionWidgetOptions } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import {
  findConversationById,
  saveConversationPiRuntime,
  type DbConversation,
} from "./db/repos/conversations.js";
import { getDb } from "./db/index.js";
import { findProjectById } from "./db/repos/projects.js";
import { getSidebarSettings } from "./db/repos/settings.js";
import { createCoreTools } from "./core-tools.js";
import {
  runBeforePiLaunchHooks,
  getChatonsExtensionsBaseDir,
} from "./extensions/manager.js";
import {
  atomicWriteJson,
  getPiModelsPath,
  readJsonFile,
  sanitizeModelsJsonWithResolvedBaseUrls,
  syncProviderApiKeysBetweenModelsAndAuth,
} from "./ipc/workspace-pi.js";
import {
  getBuiltinExtensionTools,
  getExposedToolDetail,
  getLazyDiscoveryExtensionIds,
  getLazyDiscoveryToolNames,
  listExtensionManifests,
  searchExposedTools,
} from "./extensions/runtime.js";
import {
  buildToolCatalogFromManifests,
  getToolCatalogEntry,
  searchToolCatalog,
} from "./extensions/runtime/tool-catalog.js";
import { buildHostToolEnv } from "./lib/env/host-env.js";

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

export type FileContent = {
  type: "file";
  name: string;
  mimeType: string;
  data: string;
  size: number;
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
    | "set_thread_actions"
    | "set_task_list"
    | "update_task_status"
    | "register_subagent"
    | "update_subagent_status"
    | "set_subagent_task_list"
    | "update_subagent_task_status"
    | "set_subagent_result"
    | "requirement_sheet";
  [key: string]: JsonValue | undefined;
};

export type RpcExtensionUiResponse =
  | { type: "extension_ui_response"; id: string; value: string }
  | { type: "extension_ui_response"; id: string; confirmed: boolean }
  | { type: "extension_ui_response"; id: string; cancelled: true }
  | {
      type: "extension_ui_response";
      id: string;
      requirementSheetAction: "confirm" | "dismiss" | "open_settings";
    };

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
      files?: FileContent[];
      streamingBehavior?: "steer" | "followUp";
    }
  | {
      id?: string;
      type: "steer";
      message: string;
      images?: ImageContent[];
      files?: FileContent[];
    }
  | {
      id?: string;
      type: "follow_up";
      message: string;
      images?: ImageContent[];
      files?: FileContent[];
    }
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
  | {
      type: "system_prompt";
      sections: string[];
      model?: { provider: string; id: string } | null;
      accessMode?: string;
      thinkingLevel?: string;
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
  workingDirectory: string;
  session: AgentSession;
  settingsManager: SettingsManager;
  modelRegistry: ModelRegistry;
  authStorage: AuthStorage;
  pendingExtensionUiRequests: Map<
    string,
    { resolve: (response: RpcExtensionUiResponse) => void }
  >;
  pendingRequirementSheets: Map<
    string,
    { resolve: (response: RpcExtensionUiResponse) => void }
  >;
  // Track active tool calls with their AbortControllers so we can cancel them on stop
  activeToolCalls: Map<string, AbortController>;
  status: PiRuntimeStatus;
  snapshotState: RpcSessionState | null;
  snapshotMessages: JsonValue[];
};

type RuntimeSubagentStatus =
  | "pending"
  | "queued"
  | "running"
  | "completed"
  | "error"
  | "cancelled";

type RuntimeSubagentExecutionMode = "sequential" | "parallel";

type RuntimeSubagentResult = {
  summary?: string;
  outputText?: string;
  outputJson?: JsonValue;
  errorMessage?: string;
  producedFiles?: string[];
};

type RuntimeSubagentFileScope = {
  mode: "all" | "allowlist";
  paths?: string[];
};

type RuntimeSubagentToolPolicy = {
  readOnly?: boolean;
  allowedTools?: string[];
  deniedTools?: string[];
};

type RuntimePolicyContext = {
  fileScope?: RuntimeSubagentFileScope;
  toolPolicy?: RuntimeSubagentToolPolicy;
};

type RuntimeSubagentRecord = {
  id: string;
  parentConversationId: string;
  runtimeConversationId: string;
  label: string;
  description?: string;
  objective: string;
  instructions?: string;
  executionMode: RuntimeSubagentExecutionMode;
  fileScope?: RuntimeSubagentFileScope;
  toolPolicy?: RuntimeSubagentToolPolicy;
  status: RuntimeSubagentStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: RuntimeSubagentResult;
  errorMessage?: string;
  cleanupTimer?: NodeJS.Timeout;
};

function getAgentDir() {
  return path.join(app.getPath("userData"), ".pi", "agent");
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

function extractNestedErrorMessage(
  value: unknown,
  seen = new Set<unknown>(),
): string | null {
  if (!value || seen.has(value)) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value !== "object") return null;

  seen.add(value);
  const record = value as Record<string, unknown>;
  const directMessage =
    typeof record.message === "string" ? record.message.trim() : "";
  if (directMessage) return directMessage;

  const nestedCandidates = [record.cause, record.error, record.err, record.reason];
  for (const candidate of nestedCandidates) {
    const nestedMessage = extractNestedErrorMessage(candidate, seen);
    if (nestedMessage) return nestedMessage;
  }
  return null;
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

function normalizeJsonValue(value: unknown): JsonValue | undefined {
  const normalized = safeJson(value);
  return normalized === null && value !== null ? undefined : normalized;
}

function buildSubagentResultFromSnapshot(
  snapshot: { messages?: unknown[] } | null | undefined,
): RuntimeSubagentResult {
  const outputText = extractTextFromSnapshot(snapshot) ?? undefined;
  return {
    ...(outputText ? { outputText, summary: outputText.slice(0, 400) } : {}),
  };
}

function isPathWithinAllowedScope(
  absolutePath: string,
  workingDirectory: string,
  fileScope?: RuntimeSubagentFileScope,
): boolean {
  if (!fileScope || fileScope.mode === "all") return true;
  const allowlist = Array.isArray(fileScope.paths) ? fileScope.paths : [];
  if (allowlist.length === 0) return false;
  const normalizedTarget = path.resolve(absolutePath);
  return allowlist.some((allowed) => {
    const allowedAbsolute = path.resolve(workingDirectory, allowed);
    const relative = path.relative(allowedAbsolute, normalizedTarget);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
}

function isWriteLikeBashCommand(command: string): boolean {
  const lowered = command.toLowerCase();
  return [
    "rm ",
    "mv ",
    "cp ",
    "touch ",
    "mkdir ",
    "rmdir ",
    ">",
    "chmod ",
    "chown ",
    "sed -i",
    "perl -pi",
  ].some((token) => lowered.includes(token));
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

function getManifestToolCatalog() {
  return buildToolCatalogFromManifests(listExtensionManifests())
}

function buildLazyToolDiscoverySection(): string {
  return [
    "## Tool Discovery Mode",
    "",
    "Only builtin tools are always available at session start.",
    "Non-builtin tools should be discovered first through `search_tool` before relying on them.",
    "Tool definitions are not fully inlined in the initial prompt to save context space.",
    "Use `search_tool` to discover available tools by keyword, capability, or intent.",
    "`search_tool.query` accepts either a single text string or an array of text queries/keywords.",
    "When you pass an array to `search_tool`, the search is inclusive: results from all queries are merged and deduplicated, not intersected.",
    "Prefer array queries when the user intent contains multiple useful keywords or variants (for example: product name, action, synonym, language variant).",
    "Some tool families may appear in search results as a single grouped catalog entry instead of exposing every sub-tool individually. If a grouped entry matches the need, inspect it with `tool_detail` or refine the search.",
    "Use `tool_detail` to inspect one tool in depth before calling it when you need its parameters, description, or usage requirements.",
    "When a user request likely requires a tool but the exact name or arguments are unclear, search first, then inspect details, then call the real tool.",
    "Do not guess tool arguments when tool_detail can give you the exact schema.",
  ].join("\n");
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

      // Include tool summaries so the LLM knows what each extension offers
      const tools = Array.isArray(manifest.llm?.tools) ? manifest.llm!.tools : [];
      if (tools.length > 0) {
        const toolSummaries = tools
          .filter((t) => typeof t.name === "string" && (typeof t.promptSnippet === "string" || typeof t.description === "string"))
          .map((t) => {
            const snippet = (typeof t.promptSnippet === "string" && t.promptSnippet.trim()) || t.description;
            return `    - ${t.name}: ${snippet}`;
          });
        if (toolSummaries.length > 0) {
          lines.push("  Tools:");
          lines.push(...toolSummaries);
        }
      }

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

function buildChannelPromptSection(channelExtensionId: string | null): string | null {
  if (!channelExtensionId) {
    return null;
  }

  // First, check if the channel extension defines a custom systemPrompt in its manifest
  try {
    const manifests = listExtensionManifests();
    const channelManifest = manifests.find(
      (m) => m.id === channelExtensionId && m.kind === "channel" && typeof m.systemPrompt === "string",
    );
    if (channelManifest?.systemPrompt?.trim()) {
      return channelManifest.systemPrompt.trim();
    }
  } catch {
    // Fall through to legacy behavior if manifest lookup fails
  }

  // Legacy fallback: hardcoded prompt for Even Realities extension
  // This maintains backward compatibility for extensions that haven't updated their manifest yet
  if (channelExtensionId === "@thibautrey/chatons-channel-even-realities") {
    return [
      "## Channel Context: Even Realities Glasses",
      "",
      "This conversation is being used through a pair of smart glasses.",
      "Optimize for very fast interactions and short on-device readability.",
      "Keep answers brief by default: usually one sentence, at most two short sentences unless the user explicitly asks for more.",
      "Prefer direct answers over preamble, filler, or step-by-step exposition.",
      "If the user asks a yes/no question, answer yes or no first.",
      "Do not mention internal channel rules unless the user asks.",
    ].join("\n");
  }

  return null;
}

export class PiSdkRuntime {
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
    const detailedConnectionMessage =
      this.describeGenericConnectionError(message);
    if (detailedConnectionMessage) {
      return detailedConnectionMessage;
    }
    const lower = message.toLowerCase();
    const isAuthError =
      /\b401\b/.test(lower) ||
      /\bunauthorized\b/.test(lower) ||
      /\bno api key\b/.test(lower) ||
      /\bapi key\b/.test(lower);
    if (!isAuthError) return message;
    return `${message}${this.buildAuthDebugSuffix()}`;
  }

  private describeGenericConnectionError(message: string): string | null {
    if (!this.runtime) return null;
    if (message.trim().toLowerCase() !== "connection error.") return null;

    const messages = this.runtime.session.messages as unknown as Array<
      Record<string, unknown>
    >;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const entry = messages[index];
      if (!entry || typeof entry !== "object") continue;
      if (entry.role !== "assistant") continue;
      if (entry.stopReason !== "error") continue;
      if (typeof entry.errorMessage !== "string") continue;
      if (entry.errorMessage.trim().toLowerCase() !== "connection error.") continue;

      const nested = extractNestedErrorMessage(entry.error);
      if (!nested) return null;
      if (nested.trim().toLowerCase() === "connection error.") return null;
      return `Connection error: ${nested}`;
    }
    return null;
  }

  private rewriteLastAssistantConnectionError(message: string) {
    if (!this.runtime) return;

    const messages = this.runtime.session.messages as unknown as Array<
      Record<string, unknown>
    >;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const entry = messages[index];
      if (!entry || typeof entry !== "object") continue;
      if (entry.role !== "assistant") continue;
      if (entry.stopReason !== "error") continue;
      if (typeof entry.errorMessage !== "string") continue;
      if (entry.errorMessage.trim().toLowerCase() !== "connection error.") continue;
      entry.errorMessage = message;
      break;
    }
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

      if (event.type === "tool_execution_start" && event.toolCallId) {
        // Create and track an AbortController for this tool call
        const controller = new AbortController();
        runtime.activeToolCalls.set(event.toolCallId, controller);

        const setActiveHook = (globalThis as Record<string, unknown>)
          .__chatonsActiveToolCallIdByConversationSet as
          | ((conversationId: string, requestId: string) => void)
          | undefined;
        setActiveHook?.(this.conversationId, event.toolCallId);

        const startHook = (globalThis as Record<string, unknown>)
          .__chatonsToolExecutionContextStart as
          | ((requestId: string, conversationId: string, signal?: AbortSignal) => void)
          | undefined;
        startHook?.(event.toolCallId, this.conversationId, controller.signal);
      }

      if (event.type === "tool_execution_end" && event.toolCallId) {
        // Clean up the AbortController when tool execution ends
        runtime.activeToolCalls.delete(event.toolCallId);

        const clearActiveHook = (globalThis as Record<string, unknown>)
          .__chatonsActiveToolCallIdByConversationClear as
          | ((conversationId: string, requestId: string) => void)
          | undefined;
        clearActiveHook?.(this.conversationId, event.toolCallId);

        const endHook = (globalThis as Record<string, unknown>)
          .__chatonsToolExecutionContextEnd as
          | ((requestId: string) => void)
          | undefined;
        endHook?.(event.toolCallId);
      }

      this.refreshSnapshot();
      const converted = convertEvent(event);
      if (converted) this.emit(converted);

      // Requirement sheets are handled inside tool execution so the tool can
      // remain pending until the user confirms or dismisses the sheet.
    });
  }

  emitExtensionUiRequest(
    method: RpcExtensionUiRequest["method"],
    payload: Record<string, JsonValue | undefined>,
  ) {
    const requestId = crypto.randomUUID();
    this.emit({
      type: "extension_ui_request",
      id: requestId,
      method,
      conversationId: this.conversationId,
      ...payload,
    });
    return requestId;
  }

  private waitForRequirementSheet(
    runtime: RuntimeState,
    payload: {
      html: string;
      title?: string;
      extensionId?: string;
      toolCallId?: string;
    },
  ): Promise<RpcExtensionUiResponse> {
    return new Promise<RpcExtensionUiResponse>((resolve) => {
      const requestId = this.emitExtensionUiRequest("requirement_sheet", {
        html: payload.html,
        ...(payload.title ? { title: payload.title } : {}),
        ...(payload.extensionId ? { extensionId: payload.extensionId } : {}),
        ...(payload.toolCallId ? { toolCallId: payload.toolCallId } : {}),
      });
      runtime.pendingRequirementSheets.set(requestId, { resolve });
    });
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
    syncProviderApiKeysBetweenModelsAndAuth(getAgentDir());
    // Ensure provider base URLs are generation-compatible at runtime startup.
    // This catches existing custom providers saved with a root URL that
    // answers /models but fails /chat/completions without /v1.
    try {
      const modelsPath = getPiModelsPath();
      const current = readJsonFile(modelsPath);
      if (current.ok) {
        const sanitized = await sanitizeModelsJsonWithResolvedBaseUrls(
          current.value,
        );
        if (JSON.stringify(sanitized) !== JSON.stringify(current.value)) {
          atomicWriteJson(modelsPath, sanitized);
        }
      }
    } catch (error) {
      console.warn(
        `[pi] Failed to sanitize provider base URLs at runtime startup: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
    const hostToolEnv = buildHostToolEnv(toolsCwd);
    const settingsManager = await createSettingsManagerWithRetry(
      runtimeCwd,
      getAgentDir(),
    );
    const sidebarSettings = getSidebarSettings(db);
    const behaviorPrompt = sidebarSettings.defaultBehaviorPrompt?.trim() ?? "";
    const channelPromptSection = buildChannelPromptSection(
      conversation.channel_extension_id,
    );

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
      conversation.model_provider ?? settingsManager.getDefaultProvider();
    const desiredModelId =
      conversation.model_id ?? settingsManager.getDefaultModel();

    if (!desiredProvider || !desiredModelId) {
      throw new Error(
        `No model configured for conversation and no default model set. ` +
          `Please select a model in the conversation settings or set a default model.`,
      );
    }

    const model = modelRegistry.find(desiredProvider, desiredModelId);
    if (!model) {
      throw new Error(
        `Model not found: ${desiredProvider}/${desiredModelId}. ` +
          `The model may not be available in your configured providers. ` +
          `Please check your model configuration or select a different model.`,
      );
    }
    const thinkingLevel = (conversation.thinking_level ??
      settingsManager.getDefaultThinkingLevel() ??
      "medium") as ThinkingLevel;

    let systemPromptSections: string[] = [];

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
        if (channelPromptSection) {
          sections.push(channelPromptSection);
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
            "## Task list side panel",
            "You have access to create_task_list and update_task_status tools that display a task checklist in a side panel next to the conversation.",
            "Use create_task_list when the user's request involves **multiple distinct steps** (e.g. implementing a feature across several files, setting up a project, refactoring). Do NOT use it for simple single-step requests like answering a question, running one command, or making a small edit.",
            "After creating a task list, update each task's status as you work:",
            "- Set to `in-progress` when you start working on a task.",
            "- Set to `completed` when it is done.",
            "- Set to `error` only if it genuinely failed (include an errorMessage).",
            "Keep task titles short and specific. Order them in execution sequence.",
          ].join("\n"),
        );
        sections.push(
          [
            "## Subagent tracking in the side panel",
            "When you delegate work to subagents (via the subagent tool), the side panel can track each subagent and its tasks independently.",
            "Use register_subagent to register a subagent before or when it starts work. Each subagent appears as a collapsible section in the side panel.",
            "Use spawn_subagent to create a real runtime-backed child session and run_subagent or run_subagents to execute it.",
            "Use await_subagent to wait for a child run, await_subagents to wait for a batch, and cancel_subagent to stop it when needed.",
            "Use run_subagents when you want the orchestrator to create a batch of runtime-backed subagents with sequential or parallel execution semantics.",
            "When running subagents in parallel, prefer readOnly tool policies and restrict fileScope with allowlists whenever possible.",
            "Use update_subagent_status to update a subagent's status (pending, queued, running, completed, error, cancelled).",
            "Subagents can have their own task lists via set_subagent_task_list and update_subagent_task_status.",
            "Use set_subagent_result to attach a final result payload to a subagent once its work is done.",
            "The orchestrator (you) tasks appear at the top of the panel. Subagent sections appear below with a 'Sub-agents' divider.",
            "This gives the user clear visibility into what each agent is doing at a glance.",
          ].join("\n"),
        );
        sections.push(
          [
            "## Access Mode at Session Start",
            `**Current mode: ${accessMode.toUpperCase()}**`,
            "",
            accessMode === "open"
              ? "**Open Mode**: You can access any file or directory on the system. Use this power responsibly and document changes outside the project scope."
              : "**Secure Mode**: Your filesystem access is limited to the conversation working directory. This protects the user's system and maintains isolation.",
            "",
            "**Important**: Access mode can be changed mid-conversation by the user. To verify the current mode at any time, use the `get_access_mode` command instead of assuming it hasn't changed.",
          ].join("\n"),
        );
        sections.push(
          [
            "## Secure Mode - Filesystem Boundary Constraints",
            "This conversation operates in secure mode, where filesystem access is restricted to the project/conversation context.",
            "",
            "**Current Boundary:**",
            "- File read/write/execute operations are limited to the conversation working directory and its subdirectories",
            "- This protects the rest of your system and maintains conversation isolation",
            "",
            "**When You Encounter Limitations:**",
            "1. **Identify the root cause**: Determine if the limitation is genuinely access-mode related or a different problem",
            "2. **Communicate clearly**: If a task requires broader filesystem access, explain specifically what you need and why",
            "3. **Suggest mode switching**: Propose switching to open mode only when truly necessary, not as a default escape hatch",
            "4. **Use the UI tool**: Leverage thread action suggestions to make mode switching a clear user choice, not a directive",
            "5. **Respect user language**: Frame suggestions and explanations in the language the user is using",
            "",
            "**Example:** Instead of 'I need open mode to do X', say 'This task requires access to [specific path]. Would you like to enable open mode for that?'",
          ].join("\n"),
        );
        sections.push(buildLazyToolDiscoverySection());
        const extensionContext = buildExtensionContextSection();
        if (extensionContext) {
          sections.push(extensionContext);
        }
        sections.push(buildExtensionDevelopmentGuidance());
        if (accessMode === "open") {
          sections.push(
            [
              "## Open Mode - Extended Filesystem Access",
              "This conversation is in open mode. You have unrestricted filesystem and command access.",
              "",
              "**Permissions:**",
              "- Access all files and directories on the system (not restricted to project context)",
              "- Execute any shell command necessary to complete the task",
              "- Read, write, and modify files throughout the filesystem",
              "",
              "**Best Practices for AI Assistants:**",
              "1. **Be explicit about scope**: When accessing files outside the project, explain why and what you're accessing",
              "2. **Prioritize user intent**: Ask for clarification if a request might require filesystem access beyond the project scope",
              "3. **Avoid unintended consequences**: Destructive operations (rm, mv, overwrites) should be justified and non-surprising",
              "4. **Document side effects**: Always summarize any modifications made outside the initial project context",
              "5. **Respect boundaries**: Even in open mode, respect git worktree separation and user data protection",
              "6. **Confirm before destruction**: For irreversible changes, briefly confirm the action aligns with the user's intent",
            ].join("\n"),
          );
        }

        // Store the sections for later emission
        systemPromptSections = sections;

        return sections;
      },
    });
    await resourceLoader.reload();

    const runtimePolicy = ((globalThis as Record<string, unknown>)
      .__chatonsRuntimePolicyByConversation as Map<string, RuntimePolicyContext> | undefined)
      ?.get(this.conversationId);

    const assertAllowedPath = (absolutePath: string) => {
      if (!isPathWithinAllowedScope(absolutePath, runtimeCwd, runtimePolicy?.fileScope)) {
        throw new Error(`Path is outside the subagent file scope: ${absolutePath}`);
      }
    };

    const trackedWriteOperations: WriteOperations = {
      writeFile: async (absolutePath: string, content: string) => {
        if (runtimePolicy?.toolPolicy?.readOnly) {
          throw new Error("This subagent is read-only and cannot write files.");
        }
        assertAllowedPath(absolutePath);
        await fs.promises.writeFile(absolutePath, content, "utf8");
        const trackTouchedPath = (globalThis as Record<string, unknown>)
          .__chatonsToolExecutionTrackPath as
          | ((requestId: string, absolutePath: string) => void)
          | undefined;
        const activeToolCallId = (globalThis as Record<string, unknown>)
          .__chatonsActiveToolCallIdByConversationLookup as
          | ((conversationId: string) => string | undefined)
          | undefined;
        const toolCallId = activeToolCallId?.(this.conversationId);
        if (toolCallId) {
          trackTouchedPath?.(toolCallId, absolutePath);
        }
      },
      mkdir: async (dir: string) => {
        if (runtimePolicy?.toolPolicy?.readOnly) {
          throw new Error("This subagent is read-only and cannot create directories.");
        }
        assertAllowedPath(dir);
        await fs.promises.mkdir(dir, { recursive: true });
      },
    };

    const trackedEditOperations: EditOperations = {
      readFile: async (absolutePath: string) => {
        assertAllowedPath(absolutePath);
        return fs.promises.readFile(absolutePath);
      },
      writeFile: trackedWriteOperations.writeFile,
      access: async (absolutePath: string) => {
        assertAllowedPath(absolutePath);
        await fs.promises.access(absolutePath, fs.constants.R_OK | fs.constants.W_OK);
      },
    };

    const builtinTools = [
      createReadTool(toolsCwd),
      createBashTool(toolsCwd, {
        env: hostToolEnv,
        execute: async (command: string) => {
          if (runtimePolicy?.toolPolicy?.readOnly && isWriteLikeBashCommand(command)) {
            throw new Error("This subagent is read-only and cannot run write-like bash commands.");
          }
          return undefined as never;
        },
      } as any),
      createEditTool(toolsCwd, { operations: trackedEditOperations }),
      createWriteTool(toolsCwd, { operations: trackedWriteOperations }),
    ];
    const builtinExtensionTools = getBuiltinExtensionTools();

    // Core conversation tools (task list, sub-agents, action suggestions, etc.)
    // registered directly on the session, not through the extension system.
    const coreTools = createCoreTools(
      this.conversationId,
      (method, payload) => this.emitExtensionUiRequest(method as RpcExtensionUiRequest["method"], payload as Record<string, JsonValue | undefined>),
      settingsManager,
      modelRegistry,
    );

    // Mutable ref so lazy discovery tools can activate tools on the session
    // after it is created (the session doesn't exist yet at tool definition time).
    let sessionRef: { current: AgentSession | null } = { current: null };
    const lazyToolNames = getLazyDiscoveryToolNames();
    const lazyExtensionIds = getLazyDiscoveryExtensionIds();

    // Build mapping: extensionId -> lazy tool names, and tool name -> extensionId
    const lazyToolsByExtension = new Map<string, string[]>();
    const lazyToolToExtension = new Map<string, string>();
    for (const tool of builtinExtensionTools) {
      if (!lazyToolNames.has(tool.name)) continue;
      const extId = tool.extensionId;
      if (!lazyToolsByExtension.has(extId)) lazyToolsByExtension.set(extId, []);
      lazyToolsByExtension.get(extId)!.push(tool.name);
      lazyToolToExtension.set(tool.name, extId);
    }

    // Activate lazy tools for the matched extension(s) only.
    // Called from search_tool and tool_detail when results reference lazy tools.
    function activateLazyToolsIfNeeded(touchedIdentifiers: string[]) {
      if (!sessionRef.current || lazyToolNames.size === 0) return;

      // Collect extension IDs that were touched
      const matchedExtIds = new Set<string>();
      for (const id of touchedIdentifiers) {
        if (lazyExtensionIds.has(id)) matchedExtIds.add(id);
        const extId = lazyToolToExtension.get(id);
        if (extId) matchedExtIds.add(extId);
      }
      if (matchedExtIds.size === 0) return;

      const currentActive = new Set(sessionRef.current.getActiveToolNames());
      const toAdd: string[] = [];
      for (const extId of matchedExtIds) {
        for (const toolName of lazyToolsByExtension.get(extId) ?? []) {
          if (!currentActive.has(toolName)) toAdd.push(toolName);
        }
      }
      if (toAdd.length === 0) return;
      sessionRef.current.setActiveToolsByName([...currentActive, ...toAdd]);
    }
    const lazyDiscoveryTools = [
      {
        name: "search_tool",
        label: "Search tool catalog",
        description:
          "Search available tools by name, purpose, or usage intent and return a compact catalog. The query can be a text string or an array of text keywords; array queries are inclusive and merged with deduplication.",
        parameters: Type.Object({
          query: Type.Union([
            Type.String({
              description: "Search query describing the desired tool or capability.",
            }),
            Type.Array(Type.String({
              description: "Keyword to search for when combining multiple inclusive search terms.",
            }), {
              description: "Optional array of inclusive search queries or keywords. Results are merged and deduplicated.",
            }),
          ]),
          limit: Type.Optional(
            Type.Number({
              description: "Optional maximum number of matches to return after merging and deduplication.",
            }),
          ),
        }),
        execute: async (_toolCallId: string, params: { query: string | string[]; limit?: number }) => {
          const query = typeof params.query === "string" || Array.isArray(params.query) ? params.query : "";
          const limit = typeof params.limit === "number" ? params.limit : 20;
          const manifestResults = searchToolCatalog(getManifestToolCatalog(), query, limit);
          const exposedResults = searchExposedTools(query, limit);
          const merged = new Map<string, Record<string, unknown>>();

          for (const entry of [...manifestResults, ...exposedResults]) {
            merged.set(entry.name, {
              name: entry.name,
              label: entry.label,
              description: entry.description,
              source: entry.source,
              extensionId: entry.extensionId ?? null,
              extensionName: entry.extensionName ?? null,
            });
          }

          const results = Array.from(merged.values()).slice(0, Math.max(1, limit));

          // Auto-activate lazy tools when search results reference them
          // Check both result names and extensionIds since grouped entries
          // use the group key as name (e.g. "@chaton/browser")
          const touchedIds = results.flatMap((r) => [String(r.name), String(r.extensionId ?? "")]);
          activateLazyToolsIfNeeded(touchedIds);

          return {
            content: [{ type: "text" as const, text: JSON.stringify({ results }, null, 2) }],
            details: { ok: true, results },
          };
        },
      },
      {
        name: "tool_detail",
        label: "Inspect tool details",
        description:
          "Return the detailed schema and usage guidance for one available tool, including parameters and prompt guidance when available.",
        parameters: Type.Object({
          name: Type.String({
            description: "Exact tool name to inspect.",
          }),
        }),
        execute: async (_toolCallId: string, params: { name: string }) => {
          const toolName = typeof params.name === "string" ? params.name : "";
          const manifestEntry = getToolCatalogEntry(getManifestToolCatalog(), toolName);
          const exposedEntry = getExposedToolDetail(toolName);
          const entry = exposedEntry ?? manifestEntry;

          if (!entry) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Tool not found: ${toolName}`,
                },
              ],
              details: { ok: false, toolName },
              isError: true,
            };
          }

          // Auto-activate lazy-discovered tools so the agent can call them
          activateLazyToolsIfNeeded([toolName, entry.extensionId ?? ""]);

          const detail = {
            name: entry.name,
            label: entry.label,
            description: entry.description,
            source: entry.source,
            extensionId: entry.extensionId ?? null,
            extensionName: entry.extensionName ?? null,
            promptSnippet: entry.promptSnippet ?? null,
            promptGuidelines: entry.promptGuidelines ?? [],
            parameters: entry.parameters ?? null,
          };

          return {
            content: [{ type: "text" as const, text: JSON.stringify(detail, null, 2) }],
            details: { ok: true, detail },
          };
        },
      },
    ];

    const blockOnRequirementSheet = async (
      result: AgentToolResult<unknown>,
    ): Promise<AgentToolResult<unknown>> => {
      const details = (result.details ?? null) as Record<string, unknown> | null;
      const sheet = (details?.requirementSheet ?? null) as
        | Record<string, unknown>
        | null;
      if (!details || details.pending !== true || !sheet) {
        return result;
      }

      const html = typeof sheet.html === "string" ? sheet.html : "";
      if (!html) {
        return {
          content: [
            {
              type: "text",
              text: "Requirement sheet requested without HTML content.",
            } satisfies TextContent,
          ],
          details: result.details,
        };
      }

      const response = await this.waitForRequirementSheet(runtime, {
        html,
        title: typeof sheet.title === "string" ? sheet.title : undefined,
        extensionId:
          typeof details.extensionId === "string"
            ? details.extensionId
            : undefined,
        toolCallId:
          typeof details.toolCallId === "string" ? details.toolCallId : undefined,
      });

      if (
        "requirementSheetAction" in response &&
        response.requirementSheetAction === "confirm"
      ) {
        return {
          content: [
            { type: "text", text: "Requirement completed by user." } satisfies TextContent,
          ],
          details: {
            ...details,
            requirementSheetResolved: true,
            pending: false,
          },
        };
      }

      const requirementSheetAction =
        "requirementSheetAction" in response
          ? response.requirementSheetAction
          : "dismiss";

      return {
        content: [
          {
            type: "text",
            text:
              requirementSheetAction === "open_settings"
                ? "Requirement sheet redirected the user to settings before completion."
                : "Requirement sheet was dismissed before completion.",
          } satisfies TextContent,
        ],
        details: {
          ...details,
          requirementSheetResolved: false,
          pending: false,
        },
      };
    };

    const wrappedExtensionTools: ToolDefinition[] = builtinExtensionTools.map(
      (tool) => ({
        ...tool,
        execute: async (
          toolCallId: string,
          params: never,
          signal: AbortSignal | undefined,
          onUpdate: AgentToolUpdateCallback<unknown> | undefined,
          ctx: ExtensionContext,
        ): Promise<AgentToolResult<unknown>> => {
          const result = await tool.execute(
            toolCallId,
            params,
            signal,
            onUpdate,
            ctx,
          );
          return blockOnRequirementSheet(result as AgentToolResult<unknown>);
        },
      }),
    );

    const effectiveThinkingLevel =
      model?.provider === "github-copilot" ? "off" : thinkingLevel;

    const { session } = await createAgentSession({
      cwd: runtimeCwd,
      agentDir: getAgentDir(),
      authStorage,
      modelRegistry,
      settingsManager,
      resourceLoader,
      sessionManager,
      tools: builtinTools,
      customTools: [...coreTools, ...lazyDiscoveryTools, ...wrappedExtensionTools],
      ...(model ? { model } : {}),
      thinkingLevel: effectiveThinkingLevel,
    });

    // Lazy tools: remove from the system prompt (to save context tokens)
    // but keep them callable in agent.state.tools so the LLM can invoke
    // them directly without needing search_tool first.
    sessionRef.current = session;
    if (lazyToolNames.size > 0) {
      // setActiveToolsByName rebuilds the system prompt with only the
      // non-lazy tools listed, which is what we want for prompt brevity.
      const nonLazyNames = session.getActiveToolNames().filter(
        (name: string) => !lazyToolNames.has(name),
      );
      session.setActiveToolsByName(nonLazyNames);

      // Re-inject the lazy tools into agent.state.tools so executeToolCalls
      // in pi-agent-core can find them. This does NOT affect the system
      // prompt (already rebuilt above).
      const registry = (session as any)._toolRegistry as Map<string, any>;
      const currentTools = session.agent.state.tools;
      const currentNames = new Set(currentTools.map((t: any) => t.name));
      const lazyToolObjects: any[] = [];
      for (const name of lazyToolNames) {
        if (!currentNames.has(name)) {
          const tool = registry.get(name);
          if (tool) lazyToolObjects.push(tool);
        }
      }
      if (lazyToolObjects.length > 0) {
        session.agent.setTools([...currentTools, ...lazyToolObjects]);
      }
    }

    const runtime: RuntimeState = {
      conversationId: this.conversationId,
      session,
      settingsManager,
      modelRegistry,
      authStorage,
      pendingExtensionUiRequests: new Map(),
      pendingRequirementSheets: new Map(),
      activeToolCalls: new Map(),
      status: "ready",
      snapshotState: null,
      snapshotMessages: [],
      workingDirectory: runtimeCwd,
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
      setWidget: (key, content) => {
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

    // Emit system prompt information to the renderer.
    this.emit({
      type: "system_prompt",
      sections: systemPromptSections,
      model: session.model ?? null,
      accessMode,
      thinkingLevel: session.thinkingLevel,
    });

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
        // Note: command.files are embedded in command.message via buildMessageWithAttachments.
        // The Pi runtime's prompt() only supports images natively, so file content is
        // included as text in the message. See attachments.ts for file processing logic.
        await this.runtime.session.prompt(command.message, {
          images: command.images?.map(toPiImageContent),
          streamingBehavior: command.streamingBehavior,
        });
      }

      if (command.type === "steer") {
        // Files embedded in message via buildMessageWithAttachments (same as prompt)
        await this.runtime.session.steer(
          command.message,
          command.images?.map(toPiImageContent),
        );
      }

      if (command.type === "follow_up") {
        // Files embedded in message via buildMessageWithAttachments (same as prompt)
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
        if (command.provider === "github-copilot") {
          this.runtime.session.setThinkingLevel("off");
        }
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
      if (message !== baseMessage) {
        this.rewriteLastAssistantConnectionError(message);
      }
      this.refreshSnapshot();
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

    const pendingRequirementSheet = this.runtime.pendingRequirementSheets.get(
      _response.id,
    );
    if (pendingRequirementSheet) {
      this.runtime.pendingRequirementSheets.delete(_response.id);
      pendingRequirementSheet.resolve(_response);
      return { ok: true as const };
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

    // Abort all pending tool calls
    for (const controller of this.runtime.activeToolCalls.values()) {
      controller.abort();
    }
    this.runtime.activeToolCalls.clear();

    for (const pending of this.runtime.pendingExtensionUiRequests.values()) {
      pending.resolve({
        type: "extension_ui_response",
        id: "",
        cancelled: true,
      });
    }
    this.runtime.pendingExtensionUiRequests.clear();
    for (const pending of this.runtime.pendingRequirementSheets.values()) {
      pending.resolve({
        type: "extension_ui_response",
        id: "",
        requirementSheetAction: "dismiss",
      });
    }
    this.runtime.pendingRequirementSheets.clear();
    this.runtime.session.dispose();
    this.runtime = null;
    this.setStatus("stopped");
  }
}

export class PiSessionRuntimeManager {
  private readonly runtimes = new Map<string, PiSdkRuntime>();
  private readonly startingRuntimes = new Map<
    string,
    Promise<
      | { ok: true }
      | { ok: false; reason: "conversation_not_found" | "start_failed"; message: string }
    >
  >();
  /** Ephemeral subagents running for channel ingestion, keyed by real conversation ID. */
  private readonly activeChannelSubagents = new Map<string, PiSdkRuntime>();
  private readonly runtimeSubagents = new Map<string, RuntimeSubagentRecord>();
  private readonly listeners = new Set<(event: PiRendererEvent) => void>();

  private broadcast(event: PiRendererEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }

    // Only notify renderer windows that are still alive and visible enough to matter.
    // Broadcasting every Pi event to every BrowserWindow multiplies Electron IPC and
    // ContextBridge work on sessions with many windows open.
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      const webContents = win.webContents;
      if (webContents.isDestroyed()) continue;
      if (!win.isVisible() && !webContents.isLoadingMainFrame()) continue;
      webContents.send("pi:event", event);
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
    const inFlight = this.startingRuntimes.get(conversationId);
    if (inFlight) {
      return inFlight;
    }

    const startPromise = (async (): Promise<{ ok: true } | { ok: false; reason: "conversation_not_found" | "start_failed"; message: string }> => {
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
      } finally {
        this.startingRuntimes.delete(conversationId);
      }
    })();

    this.startingRuntimes.set(conversationId, startPromise);
    return startPromise;
  }

  async stop(conversationId: string) {
    this.startingRuntimes.delete(conversationId);
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
    const response = await runtime.send(command);
    return response;
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
    const realSessionPath = conversation.pi_session_file?.trim()
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
    const runtime = this.activeChannelSubagents.get(conversationId);
    if (!runtime) return false;
    return runtime.getStatus() !== "stopped";
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
    const status = runtime.getStatus();
    if (status === "starting" || status === "stopped") {
      return false;
    }
    // Fire-and-forget: the steer interrupts the current generation mid-stream.
    // The original runChannelSubagent call awaiting send({ type: "prompt" })
    // will resolve after the steered response completes and return the reply.
    void runtime.send({ type: "steer", message }).catch(() => {
      // If the runtime stops between the status check and the send call,
      // treat it as a missed steer and let the caller enqueue a fresh run.
    });
    return true;
  }

  /**
   * Finds the currently active (streaming) Pi runtime, or returns undefined if none.
   * Used by extensions to emit UI events back to the active conversation.
   */
  getActiveRuntime(): PiSdkRuntime | undefined {
    for (const runtime of this.runtimes.values()) {
      const status = runtime.getStatus();
      if (status === "streaming") {
        return runtime;
      }
    }
    // Fallback: return the first runtime if any exists (tool execution might not be streaming yet)
    return this.runtimes.values().next().value;
  }

  /**
   * Gets the runtime for a specific conversation, if it exists.
   */
  getRuntimeForConversation(conversationId: string): PiSdkRuntime | undefined {
    return this.runtimes.get(conversationId);
  }

  getConversationIdForToolCall(toolCallId: string): string | undefined {
    const lookup = (globalThis as Record<string, unknown>)
      .__chatonsToolExecutionContextLookup as
      | ((requestId: string) => string | undefined)
      | undefined;
    return lookup?.(toolCallId);
  }

  private emitSubagentUiRegistration(record: RuntimeSubagentRecord) {
    this.broadcast({
      conversationId: record.parentConversationId,
      event: {
        type: "extension_ui_request",
        id: crypto.randomUUID(),
        method: "register_subagent",
        conversationId: record.parentConversationId,
        subAgent: {
          id: record.id,
          name: record.label,
          description: record.description,
          status: record.status,
          executionMode: record.executionMode,
          result: record.result,
          taskList: null,
          previousTaskLists: [],
          createdAt: record.createdAt,
          ...(record.startedAt ? { startedAt: record.startedAt } : {}),
          ...(record.completedAt ? { completedAt: record.completedAt } : {}),
          ...(record.errorMessage ? { errorMessage: record.errorMessage } : {}),
        } as Record<string, JsonValue>,
      },
    });
  }

  private scheduleRuntimeSubagentCleanup(record: RuntimeSubagentRecord) {
    if (record.cleanupTimer) {
      clearTimeout(record.cleanupTimer);
    }
    if (!["completed", "error", "cancelled"].includes(record.status)) {
      return;
    }
    record.cleanupTimer = setTimeout(() => {
      const policyMap = (globalThis as Record<string, unknown>)
        .__chatonsRuntimePolicyByConversation as Map<string, RuntimePolicyContext> | undefined;
      policyMap?.delete(record.runtimeConversationId);
      void this.stop(record.runtimeConversationId);
      this.runtimeSubagents.delete(record.id);
    }, 30_000);
  }

  private emitSubagentStatus(record: RuntimeSubagentRecord) {
    this.broadcast({
      conversationId: record.parentConversationId,
      event: {
        type: "extension_ui_request",
        id: crypto.randomUUID(),
        method: "update_subagent_status",
        conversationId: record.parentConversationId,
        subAgentId: record.id,
        status: record.status,
        ...(record.errorMessage ? { errorMessage: record.errorMessage } : {}),
      },
    });
    if (record.result) {
      this.broadcast({
        conversationId: record.parentConversationId,
        event: {
          type: "extension_ui_request",
          id: crypto.randomUUID(),
          method: "set_subagent_result",
          conversationId: record.parentConversationId,
          subAgentId: record.id,
          result: record.result as Record<string, JsonValue>,
        },
      });
    }
    this.scheduleRuntimeSubagentCleanup(record);
  }

  private buildRuntimeSubagentConversation(
    parentConversation: DbConversation,
    subagentId: string,
  ): DbConversation {
    const agentDir = getAgentDir();
    const runtimeConversationId = `__runtime_subagent__:${parentConversation.id}:${subagentId}`;
    return {
      ...parentConversation,
      id: runtimeConversationId,
      pi_session_file: path.join(agentDir, "sessions", "chaton", `${runtimeConversationId}.jsonl`),
      last_runtime_error: null,
    };
  }

  async spawnRuntimeSubagent(params: {
    conversationId: string;
    label: string;
    description?: string;
    objective: string;
    instructions?: string;
    executionMode?: RuntimeSubagentExecutionMode;
    fileScope?: RuntimeSubagentFileScope;
    toolPolicy?: RuntimeSubagentToolPolicy;
  }): Promise<
    | { ok: true; subAgentId: string; runtimeConversationId: string }
    | { ok: false; message: string }
  > {
    const db = getDb();
    const parentConversation = findConversationById(db, params.conversationId);
    if (!parentConversation) {
      return { ok: false, message: "Conversation not found" };
    }

    const subAgentId = `runtime-subagent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const runtimeConversation = this.buildRuntimeSubagentConversation(parentConversation, subAgentId);
    const record: RuntimeSubagentRecord = {
      id: subAgentId,
      parentConversationId: params.conversationId,
      runtimeConversationId: runtimeConversation.id,
      label: params.label,
      ...(params.description ? { description: params.description } : {}),
      objective: params.objective,
      ...(params.instructions ? { instructions: params.instructions } : {}),
      executionMode: params.executionMode ?? "sequential",
      ...(params.fileScope ? { fileScope: params.fileScope } : {}),
      ...(params.toolPolicy ? { toolPolicy: params.toolPolicy } : {}),
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    this.runtimeSubagents.set(subAgentId, record);
    this.emitSubagentUiRegistration(record);

    const policyMap = (((globalThis as Record<string, unknown>).__chatonsRuntimePolicyByConversation as Map<string, RuntimePolicyContext> | undefined)
      ?? new Map<string, RuntimePolicyContext>());
    (globalThis as Record<string, unknown>).__chatonsRuntimePolicyByConversation = policyMap;
    policyMap.set(runtimeConversation.id, {
      fileScope: record.fileScope,
      toolPolicy: record.toolPolicy,
    });

    const runtime = this.getOrCreateRuntime(runtimeConversation.id);
    try {
      await runtime.start(runtimeConversation);
      return {
        ok: true,
        subAgentId,
        runtimeConversationId: runtimeConversation.id,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      record.status = "error";
      record.errorMessage = message;
      record.completedAt = new Date().toISOString();
      this.emitSubagentStatus(record);
      return { ok: false, message };
    }
  }

  async runRuntimeSubagent(params: {
    subAgentId: string;
    prompt?: string;
  }): Promise<{ ok: true; result: RuntimeSubagentResult } | { ok: false; message: string }> {
    const record = this.runtimeSubagents.get(params.subAgentId);
    if (!record) {
      return { ok: false, message: "Subagent not found" };
    }
    const runtime = this.getRuntimeForConversation(record.runtimeConversationId);
    if (!runtime) {
      return { ok: false, message: "Subagent runtime not started" };
    }

    record.status = "running";
    if (!record.startedAt) record.startedAt = new Date().toISOString();
    this.emitSubagentStatus(record);

    const policyLines: string[] = [];
    if (record.toolPolicy?.readOnly) {
      policyLines.push("You are running in read-only mode. Do not modify files or invoke write, edit, or destructive shell commands.");
    }
    if (record.toolPolicy?.allowedTools && record.toolPolicy.allowedTools.length > 0) {
      policyLines.push(`Only use these tools if needed: ${record.toolPolicy.allowedTools.join(", ")}.`);
    }
    if (record.toolPolicy?.deniedTools && record.toolPolicy.deniedTools.length > 0) {
      policyLines.push(`Do not use these tools: ${record.toolPolicy.deniedTools.join(", ")}.`);
    }
    if (record.fileScope?.mode === "allowlist" && record.fileScope.paths && record.fileScope.paths.length > 0) {
      policyLines.push(`Restrict file access to these paths: ${record.fileScope.paths.join(", ")}.`);
    }

    const basePrompt = params.prompt?.trim()
      ? params.prompt.trim()
      : record.instructions?.trim()
        ? `${record.objective}\n\nAdditional instructions:\n${record.instructions}`
        : record.objective;
    const prompt = policyLines.length > 0
      ? `${basePrompt}\n\nRuntime policy:\n- ${policyLines.join("\n- ")}`
      : basePrompt;

    const response = await runtime.send({ type: "prompt", message: prompt });
    if (record.toolPolicy?.readOnly && runtime.getSnapshot().messages.length > 0) {
      // Read-only is currently enforced by instruction-level policy. A future hard guard can inspect tool calls.
    }
    if (!response.success) {
      const message = typeof response.error === "string" ? response.error : "Subagent run failed";
      record.status = "error";
      record.errorMessage = message;
      record.result = { errorMessage: message };
      record.completedAt = new Date().toISOString();
      this.emitSubagentStatus(record);
      return { ok: false, message };
    }

    const snapshot = runtime.getSnapshot();
    const result = buildSubagentResultFromSnapshot(snapshot);
    record.result = result;
    record.status = "completed";
    record.completedAt = new Date().toISOString();
    this.emitSubagentStatus(record);
    return { ok: true, result };
  }

  getRuntimeSubagent(subAgentId: string): RuntimeSubagentRecord | undefined {
    return this.runtimeSubagents.get(subAgentId);
  }

  async awaitRuntimeSubagent(
    subAgentId: string,
    timeoutMs?: number,
  ): Promise<
    | { ok: true; done: boolean; status: RuntimeSubagentStatus; result?: RuntimeSubagentResult; errorMessage?: string }
    | { ok: false; message: string }
  > {
    const record = this.runtimeSubagents.get(subAgentId);
    if (!record) {
      return { ok: false, message: "Subagent not found" };
    }

    const deadline = typeof timeoutMs === "number" && timeoutMs > 0 ? Date.now() + timeoutMs : null;
    while (["pending", "queued", "running"].includes(record.status)) {
      if (deadline !== null && Date.now() > deadline) {
        return { ok: true, done: false, status: record.status, result: record.result, errorMessage: record.errorMessage };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return {
      ok: true,
      done: true,
      status: record.status,
      result: record.result,
      errorMessage: record.errorMessage,
    };
  }

  async cancelRuntimeSubagent(
    subAgentId: string,
  ): Promise<{ ok: true; status: RuntimeSubagentStatus } | { ok: false; message: string }> {
    const record = this.runtimeSubagents.get(subAgentId);
    if (!record) {
      return { ok: false, message: "Subagent not found" };
    }
    const runtime = this.getRuntimeForConversation(record.runtimeConversationId);
    if (runtime && (record.status === "running" || record.status === "queued" || record.status === "pending")) {
      try {
        await runtime.send({ type: "abort" });
      } catch {
        // Best effort.
      }
    }
    record.status = "cancelled";
    record.completedAt = new Date().toISOString();
    this.emitSubagentStatus(record);
    return { ok: true, status: record.status };
  }

  async awaitRuntimeSubagents(params: {
    subAgentIds: string[];
    mode: "all" | "any";
    timeoutMs?: number;
  }): Promise<
    | {
        ok: true;
        done: boolean;
        completed: string[];
        pending: string[];
        errored: string[];
        cancelled: string[];
        results: Array<{
          subAgentId: string;
          status: RuntimeSubagentStatus;
          result?: RuntimeSubagentResult;
          errorMessage?: string;
        }>;
      }
    | { ok: false; message: string }
  > {
    const uniqueIds = Array.from(new Set(params.subAgentIds));
    const records = uniqueIds.map((id) => this.runtimeSubagents.get(id));
    if (records.some((record) => !record)) {
      return { ok: false, message: "One or more subagents were not found" };
    }
    const resolvedRecords = records as RuntimeSubagentRecord[];
    const deadline = typeof params.timeoutMs === "number" && params.timeoutMs > 0
      ? Date.now() + params.timeoutMs
      : null;

    while (true) {
      const terminal = resolvedRecords.filter((record) =>
        ["completed", "error", "cancelled"].includes(record.status),
      );
      const done = params.mode === "all"
        ? terminal.length === resolvedRecords.length
        : terminal.length > 0;
      if (done) {
        break;
      }
      if (deadline !== null && Date.now() > deadline) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const completed = resolvedRecords
      .filter((record) => record.status === "completed")
      .map((record) => record.id);
    const pending = resolvedRecords
      .filter((record) => ["pending", "queued", "running"].includes(record.status))
      .map((record) => record.id);
    const errored = resolvedRecords
      .filter((record) => record.status === "error")
      .map((record) => record.id);
    const cancelled = resolvedRecords
      .filter((record) => record.status === "cancelled")
      .map((record) => record.id);

    return {
      ok: true,
      done: pending.length === 0 && (params.mode === "all" || completed.length + errored.length + cancelled.length > 0),
      completed,
      pending,
      errored,
      cancelled,
      results: resolvedRecords.map((record) => ({
        subAgentId: record.id,
        status: record.status,
        result: record.result,
        errorMessage: record.errorMessage,
      })),
    };
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
    const rawContent = Array.isArray(msg.content)
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
