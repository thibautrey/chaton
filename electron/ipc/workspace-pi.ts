import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import {
  AuthStorage,
  ModelRegistry,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { createRequire } from "node:module";
import { getDb } from "../db/index.js";
import {
  listPiModelsCache,
  replacePiModelsCache,
} from "../db/repos/pi-models-cache.js";
import { getLogManager } from "../lib/logging/log-manager.js";
import { buildHostToolEnv } from "../lib/env/host-env.js";

const execFileAsync = promisify(execFile);
const requireFromHere = createRequire(import.meta.url);
const PI_COMPAT_API_KEY_PLACEHOLDER = "!";
const KNOWN_NO_AUTH_PROVIDERS = ["lmstudio", "ollama", "local", "localhost"];

export function isKnownNoAuthProvider(providerId?: string): boolean {
  const normalizedProviderId = providerId?.toLowerCase();
  if (!normalizedProviderId) return false;
  return KNOWN_NO_AUTH_PROVIDERS.some((provider) =>
    normalizedProviderId.includes(provider),
  );
}

function nodeRequest(
  url: string,
  options?: {
    method?: "GET" | "HEAD" | "POST";
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  },
): Promise<{
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (error) {
      reject(error);
      return;
    }

    const client = parsed.protocol === "https:" ? https : http;
    const req = client.request(
      parsed,
      {
        method: options?.method ?? "GET",
        headers: options?.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: res.headers,
          });
        });
      },
    );

    req.on("error", reject);
    req.setTimeout(options?.timeoutMs ?? 5_000, () => {
      req.destroy(new Error("Request timeout"));
    });

    if (options?.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function isPiCompatApiKeyPlaceholder(value: unknown): boolean {
  return (
    typeof value === "string" && value.trim() === PI_COMPAT_API_KEY_PLACEHOLDER
  );
}

function hasProviderModelDefinitions(
  providerConfig: Record<string, unknown>,
): boolean {
  return (
    Array.isArray(providerConfig.models) && providerConfig.models.length > 0
  );
}

function readProviderApiKey(providerConfig: Record<string, unknown>): string {
  if (typeof providerConfig.apiKey !== "string") {
    return "";
  }
  const trimmed = providerConfig.apiKey.trim();
  if (!trimmed || isPiCompatApiKeyPlaceholder(trimmed)) {
    return "";
  }
  return trimmed;
}

function getProviderApiKeyFromAuth(providerId?: string): string {
  if (!providerId) return "";
  const auth = getAuthJson();
  const entry = auth[providerId] as
    | { type?: string; access?: string; key?: string }
    | undefined;
  if (!entry || typeof entry !== "object") {
    console.log(`[pi] No auth entry found for provider ${providerId}`);
    return "";
  }
  if (entry.type === "oauth" && typeof entry.access === "string") {
    const key = entry.access.trim();
    console.log(`[pi] Found OAuth access token for provider ${providerId}`);
    return key;
  }
  if (entry.type === "api_key" && typeof entry.key === "string") {
    const key = entry.key.trim();
    console.log(`[pi] Found API key for provider ${providerId}`);
    return key;
  }
  console.log(
    `[pi] Auth entry for provider ${providerId} has no valid credential type`,
  );
  return "";
}

function resolveProviderApiKey(
  providerConfig: Record<string, unknown>,
  providerId?: string,
): string {
  // First check if the provider explicitly doesn't require authentication
  const explicitApiKey = readProviderApiKey(providerConfig);
  if (explicitApiKey === PI_COMPAT_API_KEY_PLACEHOLDER) {
    // Provider explicitly marked as not requiring API key
    console.log(
      `[pi] Provider ${providerId ?? "unknown"} explicitly configured to not require API key`,
    );
    return "";
  }

  // Check if this is a known provider that doesn't require authentication
  if (isKnownNoAuthProvider(providerId)) {
    console.log(
      `[pi] Provider ${providerId} is a known no-auth provider, skipping authentication`,
    );
    return "";
  }

  // If provider has an explicit API key, use it
  if (explicitApiKey) {
    console.log(
      `[pi] Using explicit API key for provider ${providerId ?? "unknown"}`,
    );
    return explicitApiKey;
  }

  // For providers without explicit API key configuration, check auth.json
  // but only if the provider has model definitions (indicating it's a real provider)
  if (hasProviderModelDefinitions(providerConfig)) {
    const authKey = getProviderApiKeyFromAuth(providerId);
    // Only use auth.json key if it's not a placeholder
    if (authKey && authKey !== PI_COMPAT_API_KEY_PLACEHOLDER) {
      console.log(
        `[pi] Using API key from auth.json for provider ${providerId ?? "unknown"}`,
      );
      return authKey;
    }
    // If we have model definitions but no valid API key, this provider doesn't require authentication
    console.log(
      `[pi] Provider ${providerId ?? "unknown"} has model definitions but no valid API key - treating as no-auth provider`,
    );
    return "";
  }

  // No valid API key found
  console.log(`[pi] No API key found for provider ${providerId ?? "unknown"}`);
  return "";
}

export type PiCommandResult = {
  ok: boolean;
  code: number;
  command: string[];
  stdout: string;
  stderr: string;
  ranAt: string;
  message: string;
};

export type PiModel = {
  key: string;
  provider: string;
  id: string;
  scoped: boolean;
  supportsThinking: boolean;
  thinkingLevels: Array<
    "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
  >;
  contextWindow?: number;
};

export type PiModelsResult =
  | { ok: true; models: PiModel[] }
  | {
      ok: false;
      reason:
        | "unknown"
        | "invalid_model"
        | "lock_error"
        | "sync_error"
        | "flush_error";
      message?: string;
    };

export type SetPiModelScopedResult = PiModelsResult;

type PiListedModel = {
  provider: string;
  id: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  imageInput?: boolean;
  contextWindowSource?: "provider" | "pi";
};

const CUSTOM_REASONING_HINTS = ["reasoning", "thinking", "o1", "deep-think"];

// Cache for native reasoning model index to avoid reloading models.json on every discovery
let cachedNativeReasoningModels: Set<string> | null = null;
let cachedModelsJsonMtime: number | null = null;

const KNOWN_REASONING_MODEL_ALIASES = new Set([
  // OpenAI reasoning models
  "o1",
  "o1-mini",
  "o1-preview",
  "o2",
  "o2-mini",
  "o3",
  "o3-mini",
  "o3-pro",
  "o4-mini",
  // Anthropic reasoning models (claude with thinking)
  "claude-sonnet-4",
  "claude-opus-4",
  "claude-sonnet-5",
  "claude-opus-5",
  "claude-3-7-sonnet-thinking",
  "claude-3-5-sonnet-thinking",
  // DeepSeek reasoning models
  "deepseek-r1",
  "deepseek-r1-lite",
  "deepseek-r1-distill",
  "deepseek-r2",
  // Google Gemini reasoning models
  "gemini-2-5-flash-thinking",
  "gemini-2-5-pro-thinking",
  // xAI Grok reasoning models
  "grok-3-thinking",
  "grok-3",
  "grok-2-1212",
  // Mistral reasoning models
  "mistral-large-thinking",
  "mistral-nemo-thinking",
  // Others
  "qwq-32b",
  "r1-蒸馏",
  "sonar-reasoning",
  "re3-32b",
]);

const THINKING_LEVELS: Array<
  "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
> = ["off", "minimal", "low", "medium", "high", "xhigh"];

export function getChatonsPiAgentDir() {
  return path.join(app.getPath("userData"), ".pi", "agent");
}

export function getGlobalWorkspaceDir() {
  return path.join(app.getPath("userData"), "workspace", "global");
}

function normalizeModelIdentifierForReasoningMatch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z0-9-]+[/:]/, "")
    .replace(/([a-z])([0-9])/g, "$1-$2")
    .replace(/([0-9])([a-z])/g, "$1-$2")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildNativeReasoningModelIndex(
  modelRegistry: ModelRegistry,
): Set<string> {
  const matches = new Set<string>();

  // Add known reasoning model aliases (normalized)
  for (const alias of KNOWN_REASONING_MODEL_ALIASES) {
    matches.add(normalizeModelIdentifierForReasoningMatch(alias));
  }

  // Add models from the registry that have reasoning enabled
  for (const model of modelRegistry.getAll()) {
    if (!model.reasoning) {
      continue;
    }
    matches.add(normalizeModelIdentifierForReasoningMatch(model.id));
    matches.add(
      normalizeModelIdentifierForReasoningMatch(
        `${model.provider}/${model.id}`,
      ),
    );
    matches.add(
      normalizeModelIdentifierForReasoningMatch(
        `${model.provider}:${model.id}`,
      ),
    );
    if (typeof model.name === "string" && model.name.trim().length > 0) {
      matches.add(normalizeModelIdentifierForReasoningMatch(model.name));
    }
  }
  matches.delete("");
  return matches;
}

/**
 * Returns the cached native reasoning model index, rebuilding it if models.json has changed.
 * This avoids reloading the registry on every provider discovery.
 */
function getCachedNativeReasoningModels(): Set<string> {
  const modelsJsonPath = path.join(getChatonsPiAgentDir(), "models.json");

  try {
    if (fs.existsSync(modelsJsonPath)) {
      const stats = fs.statSync(modelsJsonPath);
      const currentMtime = stats.mtime.getTime();

      // Return cached index if models.json hasn't changed
      if (
        cachedNativeReasoningModels !== null &&
        cachedModelsJsonMtime !== null &&
        cachedModelsJsonMtime >= currentMtime
      ) {
        return cachedNativeReasoningModels;
      }

      // Rebuild the cache
      const authStorage = AuthStorage.create(
        path.join(getChatonsPiAgentDir(), "auth.json"),
      );
      const modelRegistry = new ModelRegistry(authStorage, modelsJsonPath);
      cachedNativeReasoningModels =
        buildNativeReasoningModelIndex(modelRegistry);
      cachedModelsJsonMtime = currentMtime;

      return cachedNativeReasoningModels;
    }
  } catch {
    // If anything fails, return the known aliases as a fallback
  }

  // Fallback: return just the known aliases
  if (cachedNativeReasoningModels === null) {
    cachedNativeReasoningModels = new Set<string>();
    for (const alias of KNOWN_REASONING_MODEL_ALIASES) {
      cachedNativeReasoningModels.add(
        normalizeModelIdentifierForReasoningMatch(alias),
      );
    }
  }
  return cachedNativeReasoningModels;
}

function inferReasoningSupport(
  provider: string,
  modelId: string,
  nativeReasoningModels: Set<string>,
  explicitReasoning?: boolean,
): boolean {
  if (explicitReasoning !== undefined) {
    return explicitReasoning;
  }

  const normalizedId = normalizeModelIdentifierForReasoningMatch(modelId);
  const normalizedProviderId = normalizeModelIdentifierForReasoningMatch(
    `${provider}/${modelId}`,
  );
  const normalizedProviderColonId = normalizeModelIdentifierForReasoningMatch(
    `${provider}:${modelId}`,
  );

  if (
    nativeReasoningModels.has(normalizedId) ||
    nativeReasoningModels.has(normalizedProviderId) ||
    nativeReasoningModels.has(normalizedProviderColonId)
  ) {
    return true;
  }

  return CUSTOM_REASONING_HINTS.some((hint) => normalizedId.includes(hint));
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

function ensurePiAuthJsonExists(agentDir: string): void {
  const authPath = path.join(agentDir, "auth.json");
  if (fs.existsSync(authPath)) {
    return;
  }
  fs.mkdirSync(path.dirname(authPath), { recursive: true });
  atomicWriteJson(authPath, {});
}

function cleanupStaleLocks(agentDir: string): void {
  const settingsPath = path.join(agentDir, "settings.json");
  const lockPath = `${settingsPath}.lock`;

  try {
    if (fs.existsSync(lockPath)) {
      const stats = fs.statSync(lockPath);
      const lockAge = Date.now() - stats.mtime.getTime();
      const staleThreshold = 5 * 60 * 1000;

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

async function createSettingsManagerWithRetry(
  cwd: string,
  agentDir: string,
  maxRetries = 3,
): Promise<SettingsManager> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      cleanupStaleLocks(agentDir);
      return SettingsManager.create(cwd, agentDir);
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
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

export function ensurePiAgentBootstrapped() {
  const agentDir = getChatonsPiAgentDir();
  const settingsPath = path.join(agentDir, "settings.json");
  const modelsPath = path.join(agentDir, "models.json");
  const sessionsDir = path.join(agentDir, "sessions");
  const worktreesDir = path.join(agentDir, "worktrees", "chaton");
  const binDir = path.join(agentDir, "bin");
  const globalWorkspaceDir = getGlobalWorkspaceDir();

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
  cleanupNoAuthProviderKeys(agentDir); // Clean up any existing no-auth provider keys
  syncProviderApiKeysBetweenModelsAndAuth(agentDir);
  migrateOpenAICodexBaseUrl(agentDir);
}

function migrateOpenAICodexBaseUrl(agentDir: string): void {
  const modelsPath = path.join(agentDir, "models.json");
  if (!fs.existsSync(modelsPath)) return;

  let models: Record<string, unknown>;
  try {
    models = JSON.parse(fs.readFileSync(modelsPath, "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return;
  }

  const providers = models.providers as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!providers || typeof providers !== "object") return;

  const codexProvider = providers["openai-codex"];
  if (!codexProvider || typeof codexProvider !== "object") return;

  const WRONG_BASE_URL = "https://api.openai.com/v1";
  const CORRECT_BASE_URL = "https://chatgpt.com/backend-api";

  if (
    typeof codexProvider.baseUrl === "string" &&
    codexProvider.baseUrl.replace(/\/+$/, "") === WRONG_BASE_URL
  ) {
    codexProvider.baseUrl = CORRECT_BASE_URL;
    if (codexProvider.api === "openai-responses") {
      codexProvider.api = "openai-codex-responses";
    }
    try {
      atomicWriteJson(modelsPath, models);
      console.info(
        `[pi] Migrated openai-codex provider baseUrl from "${WRONG_BASE_URL}" to "${CORRECT_BASE_URL}"`,
      );
    } catch (error) {
      console.error(
        `[pi] Failed to migrate openai-codex baseUrl:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}

export function parseEnabledScopedModels(): Set<string> {
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

export function getPiSettingsPath() {
  return path.join(getChatonsPiAgentDir(), "settings.json");
}

export function getPiModelsPath() {
  return path.join(getChatonsPiAgentDir(), "models.json");
}

function getPiAuthPath() {
  return path.join(getChatonsPiAgentDir(), "auth.json");
}

export function getAuthJson(): Record<string, unknown> {
  const result = readJsonFile(getPiAuthPath());
  return result.ok ? result.value : {};
}

export function upsertProviderInModelsJson(
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

export function getPiBinaryPath() {
  const bundledPiCli = getBundledPiCliPath();
  if (bundledPiCli) {
    return bundledPiCli;
  }
  return null;
}

export function getPiAgentDir() {
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
          typeof key === "string" &&
          key.trim().length > 0 &&
          !isPiCompatApiKeyPlaceholder(key)
            ? key.trim()
            : null,
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
    // Skip migration for known no-auth providers
    if (isKnownNoAuthProvider(provider)) {
      continue;
    }

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
  atomicWriteJson(authPath, auth);
}

function cleanupNoAuthProviderKeys(agentDir: string): void {
  const authPath = path.join(agentDir, "auth.json");
  if (!fs.existsSync(authPath)) {
    return;
  }

  let auth: Record<string, unknown> = {};
  try {
    const raw = JSON.parse(fs.readFileSync(authPath, "utf8"));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      auth = raw as Record<string, unknown>;
    }
  } catch {
    return;
  }

  let changed = false;
  for (const providerName of Object.keys(auth)) {
    if (isKnownNoAuthProvider(providerName)) {
      console.log(
        `[pi] Cleaning up API key for known no-auth provider: ${providerName}`,
      );
      delete auth[providerName];
      changed = true;
    }
  }

  if (changed) {
    atomicWriteJson(authPath, auth);
  }
}

export function syncProviderApiKeysBetweenModelsAndAuth(
  agentDir: string,
): void {
  migrateProviderApiKeysToAuthIfNeeded(agentDir);
  cleanupNoAuthProviderKeys(agentDir);

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

  const modelsChanged = false;
  let authChanged = false;
  const nextProviders: Record<string, { apiKey?: unknown }> = {
    ...(models.providers as Record<string, { apiKey?: unknown }>),
  };
  const nextAuth: Record<string, unknown> = { ...auth };

  const currentProviderNames = new Set(Object.keys(models.providers));

  for (const [providerName] of Object.entries(auth)) {
    if (!currentProviderNames.has(providerName)) {
      delete nextAuth[providerName];
      authChanged = true;
      console.log(
        `[pi] Removed auth entry for deleted provider: ${providerName}`,
      );
    }
  }

  for (const [providerName, providerConfig] of Object.entries(nextProviders)) {
    const modelKey =
      typeof providerConfig?.apiKey === "string"
        ? isPiCompatApiKeyPlaceholder(providerConfig.apiKey)
          ? ""
          : providerConfig.apiKey.trim()
        : "";

    // Check if this is a known no-auth provider
    const isNoAuthProvider = isKnownNoAuthProvider(providerName);

    const authEntry = nextAuth[providerName];
    const authType =
      authEntry &&
      typeof authEntry === "object" &&
      !Array.isArray(authEntry) &&
      "type" in authEntry &&
      typeof authEntry.type === "string"
        ? authEntry.type
        : null;

    if (!modelKey || isNoAuthProvider) {
      if (authType === "api_key") {
        delete nextAuth[providerName];
        authChanged = true;
        console.log(
          `[pi] Removed stale API-key auth entry for provider without API key: ${providerName}`,
        );
      }
      if (isNoAuthProvider) {
        console.log(
          `[pi] Ensuring no auth entry for known no-auth provider: ${providerName}`,
        );
      }
      continue;
    }

    const authKey =
      authEntry &&
      typeof authEntry === "object" &&
      !Array.isArray(authEntry) &&
      "type" in authEntry &&
      authEntry.type === "api_key" &&
      "key" in authEntry &&
      typeof authEntry.key === "string"
        ? (authEntry.key as string).trim()
        : null;

    if (!authKey || authKey !== modelKey) {
      nextAuth[providerName] = { type: "api_key", key: modelKey };
      authChanged = true;
      console.log(
        `[pi] Updated auth.json for ${providerName}: ${authKey ? "key changed" : "entry added"}`,
      );
    }
  }

  if (modelsChanged || authChanged) {
    const nextModels = {
      ...models,
      providers: nextProviders,
    } as Record<string, unknown>;
    atomicWriteJson(modelsPath, nextModels);
    atomicWriteJson(authPath, nextAuth as Record<string, unknown>);
  }
}

export function readJsonFile(
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

export function backupFile(filePath: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${filePath}.bak.${stamp}`;
  fs.copyFileSync(filePath, backupPath);
}

export function atomicWriteJson(
  filePath: string,
  data: Record<string, unknown>,
) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(
    dir,
    `${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`,
  );
  fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tmpPath, filePath);
}

export function validateModelsJson(
  next: Record<string, unknown>,
): string | null {
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
    let providerConfig = {
      ...(providerValue as Record<string, unknown>),
    };
    let providerChanged = false;

    const headerNormalized = withProviderDefaultHeaders(
      providerName,
      providerConfig,
    );
    providerConfig = headerNormalized.value;
    if (headerNormalized.changed) {
      providerChanged = true;
    }

    const hasModels = hasProviderModelDefinitions(providerConfig);
    if (typeof providerConfig.apiKey === "string") {
      const trimmed = providerConfig.apiKey.trim();
      if (trimmed.length === 0) {
        if (hasModels) {
          providerConfig.apiKey = PI_COMPAT_API_KEY_PLACEHOLDER;
        } else {
          delete providerConfig.apiKey;
        }
        providerChanged = true;
      } else if (trimmed !== providerConfig.apiKey) {
        providerConfig.apiKey = trimmed;
        providerChanged = true;
      }
    } else if (hasModels) {
      providerConfig.apiKey = PI_COMPAT_API_KEY_PLACEHOLDER;
      providerChanged = true;
    }

    if (
      hasModels &&
      isPiCompatApiKeyPlaceholder(providerConfig.apiKey) &&
      providerConfig.apiKey !== PI_COMPAT_API_KEY_PLACEHOLDER
    ) {
      providerConfig.apiKey = PI_COMPAT_API_KEY_PLACEHOLDER;
      providerChanged = true;
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

function withProviderDefaultHeaders(
  providerName: string,
  providerConfig: Record<string, unknown>,
): { value: Record<string, unknown>; changed: boolean } {
  const nextProvider = { ...providerConfig };
  let changed = false;

  if (providerName === "github-copilot") {
    const defaultHeaders: Record<string, string> = {
      "User-Agent": "GitHubCopilotChat/0.35.0",
      "Editor-Version": "vscode/1.107.0",
      "Editor-Plugin-Version": "copilot-chat/0.35.0",
      "Copilot-Integration-Id": "vscode-chat",
    };
    const existingHeaders =
      nextProvider.headers &&
      typeof nextProvider.headers === "object" &&
      !Array.isArray(nextProvider.headers)
        ? { ...(nextProvider.headers as Record<string, unknown>) }
        : {};

    for (const [headerName, headerValue] of Object.entries(defaultHeaders)) {
      if (
        typeof existingHeaders[headerName] !== "string" ||
        !String(existingHeaders[headerName]).trim()
      ) {
        existingHeaders[headerName] = headerValue;
        changed = true;
      }
    }

    if (changed || nextProvider.headers !== existingHeaders) {
      nextProvider.headers = existingHeaders;
    }
  }

  return { value: nextProvider, changed };
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
  const pathName = parsed.pathname.replace(/\/+$/, "");
  const withV1 = `${origin}/v1`;
  const withoutV1 = origin;
  const ordered = [normalized];

  if (pathName === "" || pathName === "/") {
    ordered.push(withV1);
  } else if (pathName === "/v1") {
    ordered.push(withoutV1);
  } else {
    ordered.push(withV1, withoutV1);
  }

  const dedup = new Set<string>();
  for (const entry of ordered) {
    const value = normalizeHttpBaseUrlShape(entry);
    if (value) dedup.add(value);
  }
  return Array.from(dedup);
}

export async function probeProviderBaseUrl(baseUrl: string): Promise<{
  resolvedBaseUrl: string;
  tested: string[];
  matched: boolean;
}> {
  const candidates = buildBaseUrlCandidates(baseUrl);
  if (candidates.length === 0) {
    return { resolvedBaseUrl: baseUrl.trim(), tested: [], matched: false };
  }

  const isReachableStatus = (status: number): boolean => {
    // Consider 2xx (success), 401 (unauthorized but endpoint exists), and 400 (bad request) as reachable.
    // 400 indicates the endpoint exists but the request was invalid (expected for test probes).
    // Exclude 403 (forbidden), 404 (not found), 405 (method not allowed), 410 (gone), and 5xx (server errors).
    return (status >= 200 && status < 300) || status === 401 || status === 400;
  };

  const probeReachable = async (
    url: string,
    options?: { method?: "GET" | "HEAD" | "POST"; body?: string },
  ): Promise<boolean> => {
    try {
      const response = await nodeRequest(url, {
        method: options?.method ?? "HEAD",
        headers: {
          accept: "application/json",
          ...(options?.body ? { "content-type": "application/json" } : {}),
        },
        body: options?.body,
        timeoutMs: 1_500,
      });
      return isReachableStatus(response.status);
    } catch {
      return false;
    }
  };

  const results = await Promise.all(
    candidates.map(async (candidate) => {
      // Use POST with minimal body for generation endpoints to better detect actual compatibility.
      // Some providers return 405 for HEAD but work correctly with POST.
      const [modelsReachable, chatReachable, responsesReachable] =
        await Promise.all([
          probeReachable(`${candidate}/models`, { method: "GET" }),
          probeReachable(`${candidate}/chat/completions`, {
            method: "POST",
            body: JSON.stringify({ model: "test", messages: [] }),
          }),
          probeReachable(`${candidate}/responses`, {
            method: "POST",
            body: JSON.stringify({ model: "test", input: [] }),
          }),
        ]);
      const score =
        (modelsReachable ? 1 : 0) +
        (chatReachable ? 4 : 0) +
        (responsesReachable ? 4 : 0);
      const result = {
        candidate,
        reachable: score > 0,
        score,
        modelsReachable,
        chatReachable,
        responsesReachable,
      };
      // console.log(
      //   `[pi] probeProviderBaseUrl candidate="${candidate}" score=${score} models=${modelsReachable} chat=${chatReachable} responses=${responsesReachable}`,
      // );
      return result;
    }),
  );

  const winner = results.reduce<(typeof results)[number] | null>(
    (best, current) => {
      if (!current.reachable) {
        return best;
      }
      if (!best) {
        return current;
      }
      if (current.score > best.score) {
        return current;
      }
      // Tie-breaker: if scores are equal, prefer /v1 candidate because
      // most OpenAI-compatible providers mount generation endpoints there.
      if (
        current.score === best.score &&
        current.candidate.endsWith("/v1") &&
        !best.candidate.endsWith("/v1")
      ) {
        return current;
      }
      return best;
    },
    null,
  );
  // console.log(
  //   `[pi] probeProviderBaseUrl winner="${winner?.candidate ?? "none"}" original="${baseUrl}" matched=${Boolean(winner)}`,
  // );
  return {
    resolvedBaseUrl: winner ? winner.candidate : candidates[0],
    tested: candidates,
    matched: Boolean(winner),
  };
}

export async function sanitizeModelsJsonWithResolvedBaseUrls(
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

export function sanitizePiSettings(
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

export function validateDefaultModelExistsInModels(
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

export async function runPiExec(
  args: string[],
  timeout = 20_000,
  cwd?: string,
): Promise<PiCommandResult> {
  const piPath = getPiBinaryPath();
  if (!piPath) {
    const errorMessage = `Pi CLI introuvable: ${piPath || "inconnu"}`;
    console.error(errorMessage);
    getLogManager().log("error", "electron", errorMessage, { command: args });
    return {
      ok: false,
      code: 1,
      command: [piPath || "pi", ...args],
      stdout: "",
      stderr: "",
      ranAt: new Date().toISOString(),
      message: errorMessage,
    };
  }

  const command = process.execPath;
  const commandArgs = [piPath, ...args];
  const workdir = cwd ?? getGlobalWorkspaceDir();
  const env: NodeJS.ProcessEnv = {
    ...buildHostToolEnv(workdir),
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

    // Log skill installation errors to the console
    const isSkillInstall =
      args.includes("install") &&
      args.some((arg) => arg.includes("/") || arg.includes(":"));
    const isSkillRemove =
      args.includes("remove") &&
      args.some((arg) => arg.includes("/") || arg.includes(":"));

    if (isSkillInstall || isSkillRemove) {
      const action = isSkillInstall ? "installation" : "removal";
      const skillSource =
        args.find((arg) => arg.includes("/") || arg.includes(":")) || "unknown";
      const errorMessage = `Skill ${action} failed for ${skillSource}: ${stderr || typedError.message || "Command failed"}`;
      console.error(errorMessage);
      getLogManager().log("error", "electron", errorMessage, {
        skillSource,
        action,
        exitCode: typedError.code,
        command: args,
      });
    }

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

async function fetchProviderModelsFromEndpoint(
  providerConfig: Record<string, unknown>,
  providerId?: string,
): Promise<PiListedModel[]> {
  const baseUrl =
    typeof providerConfig.baseUrl === "string"
      ? providerConfig.baseUrl.trim()
      : "";
  if (!baseUrl) return [];

  const candidates = buildBaseUrlCandidates(baseUrl);
  if (candidates.length === 0) return [];

  const nativeReasoningModels = getCachedNativeReasoningModels();

  const apiKey = resolveProviderApiKey(providerConfig, providerId);
  const headers: Record<string, string> = { accept: "application/json" };
  if (apiKey.length > 0) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  // Try each base URL candidate (e.g., http://host:port, http://host:port/v1, etc.)
  for (const candidate of candidates) {
    try {
      const response = await nodeRequest(`${candidate}/models`, {
        method: "GET",
        headers,
        timeoutMs: 5_000,
      });
      if (response.status < 200 || response.status >= 300) {
        continue; // Try next candidate
      }

      let payload: {
        data?: Array<{
          id?: unknown;
          context_window?: unknown;
          max_completion_tokens?: unknown;
        }>;
      };
      try {
        payload = JSON.parse(response.body) as {
          data?: Array<{
            id?: unknown;
            context_window?: unknown;
            max_completion_tokens?: unknown;
          }>;
        };
      } catch {
        continue; // Try next candidate if JSON parsing fails
      }

      if (!Array.isArray(payload.data)) {
        continue; // Try next candidate if no data array
      }
      // Successfully got models, return them
      return payload.data
        .map((item) => {
          if (
            !item ||
            typeof item.id !== "string" ||
            item.id.trim().length === 0
          ) {
            return null;
          }

          const modelId = item.id.trim();
          const model: PiListedModel = {
            provider: "",
            id: modelId,
          };

          if (
            typeof item.context_window === "number" &&
            item.context_window > 0
          ) {
            model.contextWindow = item.context_window;
            model.contextWindowSource = "provider";
          }

          if (
            typeof item.max_completion_tokens === "number" &&
            item.max_completion_tokens > 0
          ) {
            model.maxTokens = item.max_completion_tokens;
          }

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

          model.reasoning = inferReasoningSupport(
            providerId ?? "",
            modelId,
            nativeReasoningModels,
          );

          return model;
        })
        .filter((item): item is PiListedModel => item !== null);
    } catch {
      // Continue to next candidate on network error
      continue;
    }
  }

  // No candidates worked
  return [];
}

export async function discoverProviderModels(
  providerConfig: Record<string, unknown>,
  providerId?: string,
): Promise<{ ok: boolean; models: PiListedModel[]; message?: string }> {
  try {
    const discovered = await fetchProviderModelsFromEndpoint(
      providerConfig,
      providerId,
    );
    if (!discovered || discovered.length === 0) {
      return {
        ok: false,
        models: [],
        message:
          "No models found. Check that the API key is valid and the endpoint is accessible.",
      };
    }
    return {
      ok: true,
      models: discovered.map((model) => ({
        ...model,
        contextWindow:
          model.contextWindowSource === "provider"
            ? model.contextWindow
            : undefined,
      })),
    };
  } catch (error) {
    return {
      ok: false,
      models: [],
      message: `Failed to discover models: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

export async function testProviderConnection(
  providerConfig: Record<string, unknown>,
): Promise<{
  ok: boolean;
  latency: number;
  statusCode?: number;
  message: string;
}> {
  const startTime = Date.now();
  try {
    const baseUrl =
      typeof providerConfig.baseUrl === "string"
        ? providerConfig.baseUrl.trim()
        : "";
    if (!baseUrl) {
      return {
        ok: false,
        latency: 0,
        message: "No base URL provided",
      };
    }

    const normalizedBaseUrl = normalizeHttpBaseUrlShape(baseUrl);
    if (!normalizedBaseUrl) {
      return {
        ok: false,
        latency: 0,
        message: "Invalid base URL format",
      };
    }

    const apiKey = resolveProviderApiKey(providerConfig);
    const headers: Record<string, string> = { accept: "application/json" };
    if (apiKey.length > 0) {
      headers.authorization = `Bearer ${apiKey}`;
    }

    const response = await nodeRequest(`${normalizedBaseUrl}/models`, {
      method: "HEAD",
      headers,
      timeoutMs: 10_000,
    });
    const latency = Date.now() - startTime;

    if (
      (response.status >= 200 && response.status < 300) ||
      response.status === 401 ||
      response.status === 403
    ) {
      return {
        ok: true,
        latency,
        statusCode: response.status,
        message: `Connection successful (${response.status}) - ${latency}ms`,
      };
    }

    return {
      ok: false,
      latency,
      statusCode: response.status,
      message: `Connection failed with status ${response.status}`,
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("aborted")) {
      return {
        ok: false,
        latency,
        message:
          "Connection timeout (10s) - server may be unreachable or very slow",
      };
    }
    return {
      ok: false,
      latency,
      message: `Connection test failed: ${message}`,
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
      contextWindowSource: "pi",
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
  const listedByProvider = new Map<string, PiListedModel[]>();
  if (command.ok && command.stdout.trim()) {
    const listed = parsePiListModelsStdout(command.stdout);
    for (const model of listed) {
      const providerKey = normalizeProviderToken(model.provider);
      if (!listedByProvider.has(providerKey)) {
        listedByProvider.set(providerKey, []);
      }
      listedByProvider.get(providerKey)?.push(model);
    }
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
        providerName,
      );
      if (discoveredFromEndpoint.length > 0) {
        discovered = discoveredFromEndpoint;
      }
    } else {
      const discoveredFromEndpoint = await fetchProviderModelsFromEndpoint(
        providerValue as Record<string, unknown>,
        providerName,
      );
      if (discoveredFromEndpoint.length > 0) {
        const merged = new Map<string, PiListedModel>();
        for (const model of discovered) {
          merged.set(model.id, model);
        }
        for (const model of discoveredFromEndpoint) {
          const existing = merged.get(model.id);
          if (!existing) {
            merged.set(model.id, model);
            continue;
          }
          merged.set(model.id, {
            ...existing,
            ...model,
            contextWindow:
              typeof model.contextWindow === "number"
                ? model.contextWindow
                : existing.contextWindow,
            contextWindowSource:
              model.contextWindowSource ?? existing.contextWindowSource,
          });
        }
        discovered = Array.from(merged.values());
      }
    }
    if (!discovered || discovered.length === 0) {
      continue;
    }

    const nextModelList = discovered.map((model) => {
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

export function getPiConfigSnapshot() {
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

export function getPiDiagnostics() {
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

function filterModelsToConfiguredProviders(
  discoveredModels: PiModel[],
  configuredProviders: Set<string>,
): PiModel[] {
  return discoveredModels.filter((model) => {
    const isConfigured = Array.from(configuredProviders).some(
      (p) => p.toLowerCase() === model.provider.toLowerCase(),
    );

    return isConfigured;
  });
}

export async function listPiModels(): Promise<PiModelsResult> {
  try {
    const agentDir = getPiAgentDir();
    migrateProviderApiKeysToAuthIfNeeded(agentDir);
    normalizeModelsJsonFileForPiSchema(path.join(agentDir, "models.json"));

    const modelsPath = getPiModelsPath();
    const modelsResult = readJsonFile(modelsPath);
    const configuredProviders: Set<string> = new Set<string>();
    if (
      modelsResult.ok &&
      modelsResult.value &&
      typeof modelsResult.value === "object" &&
      "providers" in modelsResult.value &&
      typeof modelsResult.value.providers === "object"
    ) {
      const providers = modelsResult.value.providers as Record<string, unknown>;
      Object.keys(providers).forEach((p) => configuredProviders.add(p));
    }

    const enabledScopedModels = parseEnabledScopedModels();
    let models: PiModel[] = [];

    try {
      const authStorage = AuthStorage.create(path.join(agentDir, "auth.json"));
      const modelRegistry = new ModelRegistry(
        authStorage,
        path.join(agentDir, "models.json"),
      );
      const registryError = modelRegistry.getError();
      if (registryError) {
        throw new Error(registryError);
      }
      const available = modelRegistry.getAvailable();
      const allModels = modelRegistry.getAll();
      const source = [...allModels, ...available];
      models = source
        .map((model) => {
          const key = `${model.provider}/${model.id}`;
          return {
            id: model.id,
            provider: model.provider,
            key,
            scoped: enabledScopedModels.has(key),
            supportsThinking: Boolean(model.reasoning),
            thinkingLevels: model.reasoning ? THINKING_LEVELS : [],
            contextWindow: model.contextWindow,
          } satisfies PiModel;
        })
        .filter((model, index, array) => {
          const first = array.findIndex(
            (candidate) =>
              candidate.provider === model.provider &&
              candidate.id === model.id,
          );
          return first === index;
        });
    } catch (error) {
      const fallbackReason =
        error instanceof Error ? error.message : String(error);
      console.warn(
        `[pi] ModelRegistry failed, falling back to models.json only: ${fallbackReason}`,
      );
      if (modelsResult.ok) {
        const providers = modelsResult.value.providers as Record<
          string,
          Record<string, unknown>
        >;
        models = Object.entries(providers).flatMap(
          ([providerName, provider]) => {
            const modelList = Array.isArray(provider.models)
              ? provider.models
              : [];
            const nextEntries: PiModel[] = [];
            for (const entry of modelList) {
              if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
                continue;
              }
              const id = (entry as Record<string, unknown>).id;
              if (typeof id !== "string" || id.trim().length === 0) {
                continue;
              }
              const key = `${providerName}/${id}`;
              nextEntries.push({
                id,
                provider: providerName,
                key,
                scoped: enabledScopedModels.has(key),
                supportsThinking: Boolean(
                  (entry as Record<string, unknown>).reasoning,
                ),
                thinkingLevels: (entry as Record<string, unknown>).reasoning
                  ? THINKING_LEVELS
                  : [],
                contextWindow:
                  typeof (entry as Record<string, unknown>).contextWindow ===
                  "number"
                    ? ((entry as Record<string, unknown>)
                        .contextWindow as number)
                    : undefined,
              });
            }
            return nextEntries;
          },
        );
      }
    }

    models = filterModelsToConfiguredProviders(models, configuredProviders);

    models = models.sort((a, b) => {
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

  const modelsPath = getPiModelsPath();
  const modelsResult = readJsonFile(modelsPath);
  const configuredProviders: Set<string> = new Set<string>();
  if (
    modelsResult.ok &&
    modelsResult.value &&
    typeof modelsResult.value === "object" &&
    "providers" in modelsResult.value &&
    typeof modelsResult.value.providers === "object"
  ) {
    const providers = modelsResult.value.providers as Record<string, unknown>;
    Object.keys(providers).forEach((p) => configuredProviders.add(p));
  }

  let models = listPiModelsCache(db).map((model) => ({
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
    contextWindow: model.context_window,
  })) as PiModel[];

  models = filterModelsToConfiguredProviders(models, configuredProviders);
  return models;
}

export async function syncPiModelsCache(): Promise<PiModelsResult> {
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
      contextWindow: model.contextWindow ?? undefined,
    })),
  );
  return result;
}

export async function listPiModelsCached(): Promise<PiModelsResult> {
  const cached = listPiModelsFromCache();
  if (cached.length > 0) {
    return { ok: true, models: cached };
  }
  return syncPiModelsCache();
}

export async function setPiModelScoped(
  provider: string,
  id: string,
  scoped: boolean,
): Promise<SetPiModelScopedResult> {
  console.log(`Setting model scope: ${provider}/${id}, scoped: ${scoped}`);

  // Use cached models instead of syncing to avoid expensive CLI calls
  const cachedModels = listPiModelsFromCache();

  const modelExists = cachedModels.some(
    (model) => model.provider === provider && model.id === id,
  );
  if (!modelExists) {
    console.error(`Model ${provider}/${id} not found in models list`);
    return {
      ok: false,
      reason: "invalid_model",
      message: `Model ${provider}/${id} not found`,
    };
  }

  const agentDir = getPiAgentDir();
  console.log(`Creating SettingsManager for agent dir: ${agentDir}`);
  let settingsManager;
  try {
    settingsManager = await createSettingsManagerWithRetry(
      process.cwd(),
      agentDir,
    );
  } catch (error) {
    console.error("Failed to create SettingsManager:", error);
    return {
      ok: false,
      reason: "lock_error",
      message: `Failed to create SettingsManager: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const key = `${provider}/${id}`;
  console.log(`Current enabled models:`, settingsManager.getEnabledModels());
  const enabledModels = new Set(settingsManager.getEnabledModels() ?? []);
  if (scoped) {
    enabledModels.add(key);
  } else {
    enabledModels.delete(key);
  }
  console.log(`Updated enabled models:`, Array.from(enabledModels));

  try {
    settingsManager.setEnabledModels(Array.from(enabledModels));
    console.log("Flushing settings...");
    await settingsManager.flush();
    console.log("Settings flushed successfully");
  } catch (error) {
    console.error("Failed to flush settings:", error);
    return {
      ok: false,
      reason: "flush_error",
      message: `Failed to save settings: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Update the cached models directly instead of calling syncPiModelsCache()
  // This avoids expensive Pi CLI calls and provides immediate feedback
  console.log("Updating cache directly after scope change...");
  const db = getDb();
  const updatedModels = cachedModels.map((model) =>
    model.provider === provider && model.id === id
      ? { ...model, scoped }
      : model,
  );

  replacePiModelsCache(
    db,
    updatedModels.map((model) => ({
      key: model.key,
      provider: model.provider,
      id: model.id,
      supportsThinking: model.supportsThinking,
      thinkingLevels: model.thinkingLevels,
      contextWindow: model.contextWindow ?? undefined,
    })),
  );

  console.log(`Successfully set model scope: ${provider}/${id}`);
  return { ok: true, models: updatedModels };
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

export async function runPiRemoveWithFallback(
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
