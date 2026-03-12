import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import { AuthStorage, ModelRegistry, SettingsManager, } from "@mariozechner/pi-coding-agent";
import { createRequire } from "node:module";
import { getDb } from "../db/index.js";
import { listPiModelsCache, replacePiModelsCache, } from "../db/repos/pi-models-cache.js";
const execFileAsync = promisify(execFile);
const requireFromHere = createRequire(import.meta.url);
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];
function getChatonsPiAgentDir() {
    return path.join(app.getPath("userData"), ".pi", "agent");
}
export function getGlobalWorkspaceDir() {
    return path.join(app.getPath("userData"), "workspace", "global");
}
function getDefaultPiSettings() {
    return {
        defaultProvider: null,
        defaultModel: null,
        enabledModels: [],
    };
}
function getDefaultPiModels() {
    return {
        providers: {},
    };
}
function ensurePiAuthJsonExists(agentDir) {
    const authPath = path.join(agentDir, "auth.json");
    if (fs.existsSync(authPath)) {
        return;
    }
    fs.mkdirSync(path.dirname(authPath), { recursive: true });
    fs.writeFileSync(authPath, "{}\n", "utf8");
}
function cleanupStaleLocks(agentDir) {
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
    }
    catch (error) {
        console.warn(`Failed to cleanup stale locks: ${error instanceof Error ? error.message : String(error)}`);
    }
}
async function createSettingsManagerWithRetry(cwd, agentDir, maxRetries = 3) {
    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            cleanupStaleLocks(agentDir);
            return SettingsManager.create(cwd, agentDir);
        }
        catch (error) {
            lastError = error;
            if (attempt < maxRetries) {
                const delay = 100 * Math.pow(2, attempt - 1);
                console.warn(`Attempt ${attempt} failed to create SettingsManager, retrying in ${delay}ms...`);
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
    syncProviderApiKeysBetweenModelsAndAuth(agentDir);
    migrateOpenAICodexBaseUrl(agentDir);
}
function migrateOpenAICodexBaseUrl(agentDir) {
    const modelsPath = path.join(agentDir, "models.json");
    if (!fs.existsSync(modelsPath))
        return;
    let models;
    try {
        models = JSON.parse(fs.readFileSync(modelsPath, "utf8"));
    }
    catch {
        return;
    }
    const providers = models.providers;
    if (!providers || typeof providers !== "object")
        return;
    const codexProvider = providers["openai-codex"];
    if (!codexProvider || typeof codexProvider !== "object")
        return;
    const WRONG_BASE_URL = "https://api.openai.com/v1";
    const CORRECT_BASE_URL = "https://chatgpt.com/backend-api";
    if (typeof codexProvider.baseUrl === "string" &&
        codexProvider.baseUrl.replace(/\/+$/, "") === WRONG_BASE_URL) {
        codexProvider.baseUrl = CORRECT_BASE_URL;
        if (codexProvider.api === "openai-responses") {
            codexProvider.api = "openai-codex-responses";
        }
        try {
            atomicWriteJson(modelsPath, models);
            console.info(`[pi] Migrated openai-codex provider baseUrl from "${WRONG_BASE_URL}" to "${CORRECT_BASE_URL}"`);
        }
        catch (error) {
            console.error(`[pi] Failed to migrate openai-codex baseUrl:`, error instanceof Error ? error.message : error);
        }
    }
}
export function parseEnabledScopedModels() {
    const settingsPath = path.join(getChatonsPiAgentDir(), "settings.json");
    if (!settingsPath || !fs.existsSync(settingsPath)) {
        return new Set();
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        if (!Array.isArray(parsed.enabledModels)) {
            return new Set();
        }
        return new Set(parsed.enabledModels.filter((value) => typeof value === "string"));
    }
    catch {
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
export function getAuthJson() {
    const result = readJsonFile(getPiAuthPath());
    return result.ok ? result.value : {};
}
export function upsertProviderInModelsJson(providerId, config) {
    const modelsPath = getPiModelsPath();
    const existing = readJsonFile(modelsPath);
    const current = existing.ok
        ? { ...existing.value }
        : {};
    const providers = current.providers ?? {};
    if (!providers[providerId]) {
        providers[providerId] = config;
        const next = { ...current, providers };
        try {
            if (fs.existsSync(modelsPath))
                backupFile(modelsPath);
            atomicWriteJson(modelsPath, next);
            syncProviderApiKeysBetweenModelsAndAuth(getChatonsPiAgentDir());
        }
        catch (error) {
            return {
                ok: false,
                message: error instanceof Error ? error.message : String(error),
            };
        }
    }
    return { ok: true };
}
function getBundledPiCliPath() {
    const candidates = new Set();
    try {
        const piEntrypoint = requireFromHere.resolve("@mariozechner/pi-coding-agent");
        const distDir = path.dirname(piEntrypoint);
        candidates.add(path.join(distDir, "cli.js"));
    }
    catch {
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
        candidates.add(path.join(root, "node_modules", "@mariozechner", "pi-coding-agent", "dist", "cli.js"));
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
function migrateProviderApiKeysToAuthIfNeeded(agentDir) {
    const modelsPath = path.join(agentDir, "models.json");
    const authPath = path.join(agentDir, "auth.json");
    ensurePiAuthJsonExists(agentDir);
    if (!fs.existsSync(modelsPath)) {
        return;
    }
    let models = null;
    try {
        models = JSON.parse(fs.readFileSync(modelsPath, "utf8"));
    }
    catch {
        return;
    }
    if (!models || typeof models !== "object") {
        return;
    }
    const providers = models.providers && typeof models.providers === "object"
        ? models.providers
        : {};
    const apiKeys = Object.entries(providers)
        .map(([provider, cfg]) => {
        const key = cfg?.apiKey;
        return {
            provider,
            key: typeof key === "string" && key.trim().length > 0 ? key.trim() : null,
        };
    })
        .filter((entry) => entry.key !== null);
    if (apiKeys.length === 0) {
        return;
    }
    let auth = {};
    if (fs.existsSync(authPath)) {
        try {
            const raw = JSON.parse(fs.readFileSync(authPath, "utf8"));
            if (raw && typeof raw === "object" && !Array.isArray(raw)) {
                auth = raw;
            }
        }
        catch {
            auth = {};
        }
    }
    let changed = false;
    for (const { provider, key } of apiKeys) {
        const existing = auth[provider];
        if (existing &&
            typeof existing === "object" &&
            !Array.isArray(existing) &&
            existing.type === "api_key" &&
            typeof existing.key === "string" &&
            existing.key.trim().length > 0) {
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
export function syncProviderApiKeysBetweenModelsAndAuth(agentDir) {
    migrateProviderApiKeysToAuthIfNeeded(agentDir);
    const modelsPath = path.join(agentDir, "models.json");
    const authPath = path.join(agentDir, "auth.json");
    if (!fs.existsSync(modelsPath) || !fs.existsSync(authPath)) {
        return;
    }
    let models = null;
    let auth = null;
    try {
        models = JSON.parse(fs.readFileSync(modelsPath, "utf8"));
        auth = JSON.parse(fs.readFileSync(authPath, "utf8"));
    }
    catch {
        return;
    }
    if (!models || typeof models !== "object")
        return;
    if (!auth || typeof auth !== "object" || Array.isArray(auth))
        return;
    if (!models.providers || typeof models.providers !== "object")
        return;
    const modelsChanged = false;
    let authChanged = false;
    const nextProviders = {
        ...models.providers,
    };
    const nextAuth = { ...auth };
    const currentProviderNames = new Set(Object.keys(models.providers));
    for (const [providerName] of Object.entries(auth)) {
        if (!currentProviderNames.has(providerName)) {
            delete nextAuth[providerName];
            authChanged = true;
            console.log(`[pi] Removed auth entry for deleted provider: ${providerName}`);
        }
    }
    for (const [providerName, providerConfig] of Object.entries(nextProviders)) {
        const modelKey = typeof providerConfig?.apiKey === "string"
            ? providerConfig.apiKey.trim()
            : "";
        const authEntry = nextAuth[providerName];
        const authType = authEntry &&
            typeof authEntry === "object" &&
            !Array.isArray(authEntry) &&
            "type" in authEntry &&
            typeof authEntry.type === "string"
            ? authEntry.type
            : null;
        if (!modelKey) {
            if (authType === "api_key") {
                delete nextAuth[providerName];
                authChanged = true;
                console.log(`[pi] Removed stale API-key auth entry for provider without API key: ${providerName}`);
            }
            continue;
        }
        const authKey = authEntry &&
            typeof authEntry === "object" &&
            !Array.isArray(authEntry) &&
            "type" in authEntry &&
            authEntry.type === "api_key" &&
            "key" in authEntry &&
            typeof authEntry.key === "string"
            ? authEntry.key.trim()
            : null;
        if (!authKey || authKey !== modelKey) {
            nextAuth[providerName] = { type: "api_key", key: modelKey };
            authChanged = true;
            console.log(`[pi] Updated auth.json for ${providerName}: ${authKey ? "key changed" : "entry added"}`);
        }
    }
    if (modelsChanged || authChanged) {
        const nextModels = {
            ...models,
            providers: nextProviders,
        };
        fs.writeFileSync(modelsPath, `${JSON.stringify(nextModels, null, 2)}\n`, "utf8");
        fs.writeFileSync(authPath, `${JSON.stringify(nextAuth, null, 2)}\n`, "utf8");
    }
}
export function readJsonFile(filePath) {
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
        return { ok: true, value: raw };
    }
    catch (error) {
        return {
            ok: false,
            message: `JSON invalide dans ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}
export function backupFile(filePath) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${filePath}.bak.${stamp}`;
    fs.copyFileSync(filePath, backupPath);
}
export function atomicWriteJson(filePath, data) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = path.join(dir, `${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`);
    fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    fs.renameSync(tmpPath, filePath);
}
export function validateModelsJson(next) {
    const providers = next.providers;
    if (providers !== undefined) {
        if (!providers ||
            typeof providers !== "object" ||
            Array.isArray(providers)) {
            return 'models.json: "providers" doit être un objet.';
        }
        for (const [providerName, providerConfig] of Object.entries(providers)) {
            if (!providerConfig ||
                typeof providerConfig !== "object" ||
                Array.isArray(providerConfig)) {
                return `models.json: provider "${providerName}" invalide (objet attendu).`;
            }
            const modelList = providerConfig.models;
            if (modelList !== undefined && !Array.isArray(modelList)) {
                return `models.json: provider "${providerName}" -> "models" doit être un tableau.`;
            }
            if (Array.isArray(modelList)) {
                for (const model of modelList) {
                    if (!model || typeof model !== "object" || Array.isArray(model)) {
                        return `models.json: provider "${providerName}" contient un modèle invalide.`;
                    }
                    const id = model.id;
                    if (typeof id !== "string" || id.trim().length === 0) {
                        return `models.json: provider "${providerName}" contient un modèle sans id valide.`;
                    }
                }
            }
        }
    }
    return null;
}
function normalizeModelsJsonForPiSchema(next) {
    const providersNode = next.providers;
    if (!providersNode ||
        typeof providersNode !== "object" ||
        Array.isArray(providersNode)) {
        return { value: next, changed: false };
    }
    const providers = providersNode;
    const nextProviders = { ...providers };
    let changed = false;
    for (const [providerName, providerValue] of Object.entries(providers)) {
        if (!providerValue ||
            typeof providerValue !== "object" ||
            Array.isArray(providerValue)) {
            continue;
        }
        const providerConfig = {
            ...providerValue,
        };
        let providerChanged = false;
        if (typeof providerConfig.apiKey === "string") {
            const trimmed = providerConfig.apiKey.trim();
            if (trimmed.length === 0) {
                delete providerConfig.apiKey;
                providerChanged = true;
            }
            else if (trimmed !== providerConfig.apiKey) {
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
function normalizeModelsJsonFileForPiSchema(modelsPath) {
    const modelsResult = readJsonFile(modelsPath);
    if (!modelsResult.ok)
        return;
    const normalized = normalizeModelsJsonForPiSchema(modelsResult.value);
    if (!normalized.changed)
        return;
    atomicWriteJson(modelsPath, normalized.value);
}
function normalizeHttpBaseUrlShape(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return "";
    return trimmed.replace(/\/+$/, "");
}
function buildBaseUrlCandidates(raw) {
    const normalized = normalizeHttpBaseUrlShape(raw);
    if (!normalized)
        return [];
    let parsed;
    try {
        parsed = new URL(normalized);
    }
    catch {
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
    }
    else if (pathName === "/v1") {
        ordered.push(withoutV1);
    }
    else {
        ordered.push(withV1, withoutV1);
    }
    const dedup = new Set();
    for (const entry of ordered) {
        const value = normalizeHttpBaseUrlShape(entry);
        if (value)
            dedup.add(value);
    }
    return Array.from(dedup);
}
export async function probeProviderBaseUrl(baseUrl) {
    const candidates = buildBaseUrlCandidates(baseUrl);
    if (candidates.length === 0) {
        return { resolvedBaseUrl: baseUrl.trim(), tested: [], matched: false };
    }
    const isReachableStatus = (status) => status < 500 && status !== 404 && status !== 410;
    const probeReachable = async (url, options) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1500);
        try {
            const response = await fetch(url, {
                method: options?.method ?? "HEAD",
                signal: controller.signal,
                headers: {
                    accept: "application/json",
                    ...(options?.body ? { "content-type": "application/json" } : {}),
                },
                ...(options?.body ? { body: options.body } : {}),
            });
            return isReachableStatus(response.status);
        }
        catch {
            return false;
        }
        finally {
            clearTimeout(timeout);
        }
    };
    const results = await Promise.all(candidates.map(async (candidate) => {
        const [modelsReachable, chatReachable, responsesReachable] = await Promise.all([
            probeReachable(`${candidate}/models`, { method: "GET" }),
            probeReachable(`${candidate}/chat/completions`, {
                method: "POST",
                body: JSON.stringify({
                    model: "probe-model",
                    messages: [{ role: "user", content: "probe" }],
                    max_tokens: 1,
                }),
            }),
            probeReachable(`${candidate}/responses`, {
                method: "POST",
                body: JSON.stringify({
                    model: "probe-model",
                    input: "probe",
                    max_output_tokens: 1,
                }),
            }),
        ]);
        const score = (modelsReachable ? 1 : 0) +
            (chatReachable ? 4 : 0) +
            (responsesReachable ? 4 : 0);
        return {
            candidate,
            reachable: score > 0,
            score,
            modelsReachable,
            chatReachable,
            responsesReachable,
        };
    }));
    const winner = results.reduce((best, current) => {
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
        if (current.score === best.score &&
            current.candidate.endsWith("/v1") &&
            !best.candidate.endsWith("/v1")) {
            return current;
        }
        return best;
    }, null);
    return {
        resolvedBaseUrl: winner ? winner.candidate : candidates[0],
        tested: candidates,
        matched: Boolean(winner),
    };
}
export async function sanitizeModelsJsonWithResolvedBaseUrls(next) {
    const normalized = normalizeModelsJsonForPiSchema(next).value;
    const providersNode = normalized.providers;
    if (!providersNode ||
        typeof providersNode !== "object" ||
        Array.isArray(providersNode)) {
        return normalized;
    }
    const providers = providersNode;
    const nextProviders = { ...providers };
    await Promise.all(Object.entries(providers).map(async ([providerName, providerValue]) => {
        if (!providerValue ||
            typeof providerValue !== "object" ||
            Array.isArray(providerValue)) {
            return;
        }
        const providerConfig = providerValue;
        const baseUrl = typeof providerConfig.baseUrl === "string"
            ? providerConfig.baseUrl.trim()
            : "";
        if (!baseUrl)
            return;
        const resolved = await probeProviderBaseUrl(baseUrl);
        if (!resolved.resolvedBaseUrl || resolved.resolvedBaseUrl === baseUrl) {
            return;
        }
        console.info(`[pi] Auto-corrected provider baseUrl for "${providerName}": "${baseUrl}" -> "${resolved.resolvedBaseUrl}" (tested: ${resolved.tested.join(", ")})`);
        nextProviders[providerName] = {
            ...providerConfig,
            baseUrl: resolved.resolvedBaseUrl,
        };
    }));
    return {
        ...normalized,
        providers: nextProviders,
    };
}
export function sanitizePiSettings(next) {
    const sanitized = { ...next };
    if (sanitized.enabledModels !== undefined) {
        if (!Array.isArray(sanitized.enabledModels)) {
            return {
                ok: false,
                message: 'settings.json: "enabledModels" doit être un tableau.',
            };
        }
        sanitized.enabledModels = sanitized.enabledModels.filter((item) => typeof item === "string");
    }
    return { ok: true, value: sanitized };
}
export function validateDefaultModelExistsInModels(settings, models) {
    const defaultProvider = typeof settings.defaultProvider === "string"
        ? settings.defaultProvider.trim()
        : "";
    const defaultModel = typeof settings.defaultModel === "string"
        ? settings.defaultModel.trim()
        : "";
    if (!defaultProvider || !defaultModel) {
        return null;
    }
    const providers = models.providers;
    if (!providers || typeof providers !== "object" || Array.isArray(providers)) {
        return 'models.json invalide: "providers" doit être un objet.';
    }
    const providerNode = providers[defaultProvider];
    if (!providerNode ||
        typeof providerNode !== "object" ||
        Array.isArray(providerNode)) {
        return `settings.json invalide: defaultProvider "${defaultProvider}" absent de models.json.`;
    }
    const modelList = providerNode.models;
    if (!Array.isArray(modelList)) {
        return `models.json invalide: provider "${defaultProvider}" -> "models" doit être un tableau.`;
    }
    const exists = modelList.some((model) => {
        if (!model || typeof model !== "object" || Array.isArray(model)) {
            return false;
        }
        return model.id === defaultModel;
    });
    if (!exists) {
        return `settings.json invalide: defaultModel "${defaultModel}" absent du provider "${defaultProvider}" dans models.json.`;
    }
    return null;
}
export async function runPiExec(args, timeout = 20_000, cwd) {
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
    const env = {
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
    }
    catch (error) {
        const typedError = error;
        const stderr = [typedError.stderr, typedError.message]
            .filter((part) => typeof part === "string" && part.length > 0)
            .join("\n");
        return {
            ok: false,
            code: typeof typedError.code === "number" ? typedError.code : 1,
            command: [command, ...commandArgs],
            stdout: typedError.stdout ?? "",
            stderr,
            ranAt: new Date().toISOString(),
            message: typedError.signal === "SIGTERM"
                ? "Commande Pi expirée."
                : stderr || "Command failed",
        };
    }
}
async function fetchProviderModelsFromEndpoint(providerConfig, providerId) {
    const baseUrl = typeof providerConfig.baseUrl === "string"
        ? providerConfig.baseUrl.trim()
        : "";
    if (!baseUrl)
        return [];
    const candidates = buildBaseUrlCandidates(baseUrl);
    if (candidates.length === 0)
        return [];
    let apiKey = typeof providerConfig.apiKey === "string"
        ? providerConfig.apiKey.trim()
        : "";
    if (!apiKey && providerId) {
        const auth = getAuthJson();
        const entry = auth[providerId];
        if (entry) {
            if (entry.type === "oauth" && typeof entry.access === "string") {
                apiKey = entry.access;
            }
            else if (entry.type === "api_key" && typeof entry.key === "string") {
                apiKey = entry.key;
            }
        }
    }
    const headers = { accept: "application/json" };
    if (apiKey.length > 0) {
        headers.authorization = `Bearer ${apiKey}`;
    }
    // Try each base URL candidate (e.g., http://host:port, http://host:port/v1, etc.)
    for (const candidate of candidates) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5_000);
        try {
            const response = await fetch(`${candidate}/models`, {
                method: "GET",
                headers,
                signal: controller.signal,
            });
            if (!response.ok) {
                clearTimeout(timeout);
                continue; // Try next candidate
            }
            let payload;
            try {
                payload = (await response.json());
            }
            catch {
                clearTimeout(timeout);
                continue; // Try next candidate if JSON parsing fails
            }
            if (!Array.isArray(payload.data)) {
                clearTimeout(timeout);
                continue; // Try next candidate if no data array
            }
            clearTimeout(timeout);
            // Successfully got models, return them
            return payload.data
                .map((item) => {
                if (!item ||
                    typeof item.id !== "string" ||
                    item.id.trim().length === 0) {
                    return null;
                }
                const modelId = item.id.trim();
                const model = {
                    provider: "",
                    id: modelId,
                };
                if (typeof item.context_window === "number" &&
                    item.context_window > 0) {
                    model.contextWindow = item.context_window;
                    model.contextWindowSource = "provider";
                }
                if (typeof item.max_completion_tokens === "number" &&
                    item.max_completion_tokens > 0) {
                    model.maxTokens = item.max_completion_tokens;
                }
                const lowerModelId = modelId.toLowerCase();
                if (lowerModelId.includes("vision") ||
                    lowerModelId.includes("gpt-4-v") ||
                    lowerModelId.includes("claude-3") ||
                    lowerModelId.includes("gemini") ||
                    lowerModelId.includes("llava") ||
                    lowerModelId.includes("qwen-vl")) {
                    model.imageInput = true;
                }
                if (lowerModelId.includes("reasoning") ||
                    lowerModelId.includes("thinking") ||
                    lowerModelId.includes("o1") ||
                    lowerModelId.includes("deep-think")) {
                    model.reasoning = true;
                }
                return model;
            })
                .filter((item) => item !== null);
        }
        catch {
            clearTimeout(timeout);
            // Continue to next candidate on network error
            continue;
        }
    }
    // No candidates worked
    return [];
}
export async function discoverProviderModels(providerConfig, providerId) {
    try {
        const discovered = await fetchProviderModelsFromEndpoint(providerConfig, providerId);
        if (!discovered || discovered.length === 0) {
            return {
                ok: false,
                models: [],
                message: "No models found. Check that the API key is valid and the endpoint is accessible.",
            };
        }
        return {
            ok: true,
            models: discovered.map((model) => ({
                ...model,
                contextWindow: model.contextWindowSource === "provider"
                    ? model.contextWindow
                    : undefined,
            })),
        };
    }
    catch (error) {
        return {
            ok: false,
            models: [],
            message: `Failed to discover models: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
    }
}
export async function testProviderConnection(providerConfig) {
    const startTime = Date.now();
    try {
        const baseUrl = typeof providerConfig.baseUrl === "string"
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
        const apiKey = typeof providerConfig.apiKey === "string"
            ? providerConfig.apiKey.trim()
            : "";
        const headers = { accept: "application/json" };
        if (apiKey.length > 0) {
            headers.authorization = `Bearer ${apiKey}`;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        try {
            const response = await fetch(`${normalizedBaseUrl}/models`, {
                method: "HEAD",
                headers,
                signal: controller.signal,
            });
            const latency = Date.now() - startTime;
            if (response.ok || response.status === 401 || response.status === 403) {
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
        }
        finally {
            clearTimeout(timeout);
        }
    }
    catch (error) {
        const latency = Date.now() - startTime;
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message.includes("aborted")) {
            return {
                ok: false,
                latency,
                message: "Connection timeout (10s) - server may be unreachable or very slow",
            };
        }
        return {
            ok: false,
            latency,
            message: `Connection test failed: ${message}`,
        };
    }
}
function parsePiTokenCount(raw) {
    const value = raw.trim().toUpperCase();
    if (!value)
        return undefined;
    const match = /^(\d+(?:\.\d+)?)([KM]?)$/.exec(value);
    if (!match)
        return undefined;
    const base = Number.parseFloat(match[1]);
    if (!Number.isFinite(base))
        return undefined;
    const unit = match[2];
    if (unit === "K")
        return Math.round(base * 1_000);
    if (unit === "M")
        return Math.round(base * 1_000_000);
    return Math.round(base);
}
function parsePiListModelsStdout(stdout) {
    const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.trim().length > 0);
    if (lines.length === 0)
        return [];
    const headerIndex = lines.findIndex((line) => /^provider\s{2,}model\s{2,}context\s{2,}max-out\s{2,}thinking\s{2,}images$/i.test(line.trim()));
    if (headerIndex === -1)
        return [];
    const modelLines = lines.slice(headerIndex + 1);
    const parsed = [];
    for (const line of modelLines) {
        const cols = line
            .trim()
            .split(/\s{2,}/)
            .map((col) => col.trim());
        if (cols.length < 6)
            continue;
        const [provider, id, context, maxOut, thinking, images] = cols;
        if (!provider || !id)
            continue;
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
function normalizeProviderToken(value) {
    return value.trim().toLowerCase().replace(/\s+/g, "-");
}
async function refreshModelsJsonFromPiListModels() {
    const modelsPath = getPiModelsPath();
    const modelsResult = readJsonFile(modelsPath);
    if (!modelsResult.ok)
        return;
    const providersNode = modelsResult.value.providers;
    if (!providersNode ||
        typeof providersNode !== "object" ||
        Array.isArray(providersNode)) {
        return;
    }
    const configuredProviders = Object.keys(providersNode);
    if (configuredProviders.length === 0)
        return;
    const command = await runPiExec(["--list-models"], 30_000);
    const listedByProvider = new Map();
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
    const nextProviders = {
        ...providersNode,
    };
    let changed = false;
    for (const providerName of configuredProviders) {
        const providerValue = nextProviders[providerName];
        if (!providerValue ||
            typeof providerValue !== "object" ||
            Array.isArray(providerValue)) {
            continue;
        }
        let discovered = listedByProvider.get(normalizeProviderToken(providerName));
        if (!discovered || discovered.length === 0) {
            const discoveredFromEndpoint = await fetchProviderModelsFromEndpoint(providerValue, providerName);
            if (discoveredFromEndpoint.length > 0) {
                discovered = discoveredFromEndpoint;
            }
        }
        else {
            const discoveredFromEndpoint = await fetchProviderModelsFromEndpoint(providerValue, providerName);
            if (discoveredFromEndpoint.length > 0) {
                const merged = new Map();
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
                        contextWindow: typeof model.contextWindow === "number"
                            ? model.contextWindow
                            : existing.contextWindow,
                        contextWindowSource: model.contextWindowSource ?? existing.contextWindowSource,
                    });
                }
                discovered = Array.from(merged.values());
            }
        }
        if (!discovered || discovered.length === 0) {
            continue;
        }
        const nextModelList = discovered.map((model) => {
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
        });
        const currentModels = providerValue.models;
        const currentSerialized = Array.isArray(currentModels)
            ? JSON.stringify(currentModels)
            : "";
        const nextSerialized = JSON.stringify(nextModelList);
        if (currentSerialized === nextSerialized) {
            continue;
        }
        nextProviders[providerName] = {
            ...providerValue,
            models: nextModelList,
        };
        changed = true;
    }
    if (!changed)
        return;
    const nextModels = {
        ...modelsResult.value,
        providers: nextProviders,
    };
    const validationError = validateModelsJson(nextModels);
    if (validationError)
        return;
    atomicWriteJson(modelsPath, nextModels);
    const settingsPath = getPiSettingsPath();
    const settingsResult = readJsonFile(settingsPath);
    if (!settingsResult.ok)
        return;
    const settings = { ...settingsResult.value };
    const currentProvider = typeof settings.defaultProvider === "string"
        ? settings.defaultProvider
        : "";
    const currentModel = typeof settings.defaultModel === "string" ? settings.defaultModel : "";
    if (!currentProvider || !currentModel)
        return;
    const providerNode = nextProviders[currentProvider];
    if (!providerNode ||
        typeof providerNode !== "object" ||
        Array.isArray(providerNode)) {
        return;
    }
    const modelList = providerNode.models;
    if (!Array.isArray(modelList) || modelList.length === 0)
        return;
    const exists = modelList.some((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return false;
        }
        return entry.id === currentModel;
    });
    if (exists)
        return;
    const firstModelId = modelList
        .map((entry) => entry && typeof entry === "object" && !Array.isArray(entry)
        ? entry.id
        : undefined)
        .find((id) => typeof id === "string" && id.length > 0);
    if (!firstModelId)
        return;
    settings.defaultModel = firstModelId;
    atomicWriteJson(settingsPath, settings);
}
export function getPiConfigSnapshot() {
    const settingsPath = getPiSettingsPath();
    const modelsPath = getPiModelsPath();
    const settingsResult = readJsonFile(settingsPath);
    const modelsResult = readJsonFile(modelsPath);
    const errors = [];
    if (!settingsResult.ok)
        errors.push(settingsResult.message);
    if (!modelsResult.ok)
        errors.push(modelsResult.message);
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
    const checks = [];
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
            ? settings.value.enabledModels.filter((item) => typeof item === "string")
            : [];
        const defaultProvider = typeof settings.value.defaultProvider === "string"
            ? settings.value.defaultProvider
            : null;
        const defaultModel = typeof settings.value.defaultModel === "string"
            ? settings.value.defaultModel
            : null;
        if (defaultProvider && defaultModel && models.ok) {
            const providers = (models.value.providers ?? {});
            const providerNode = providers[defaultProvider];
            const providerModels = providerNode && typeof providerNode === "object"
                ? providerNode.models
                : null;
            const found = Array.isArray(providerModels)
                ? providerModels.some((item) => typeof item?.id === "string" &&
                    item.id === defaultModel)
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
function filterModelsToConfiguredProviders(discoveredModels, configuredProviders) {
    return discoveredModels.filter((model) => {
        const isConfigured = Array.from(configuredProviders).some((p) => p.toLowerCase() === model.provider.toLowerCase());
        if (!isConfigured) {
            console.warn(`[Pi Config] Model from discovery discarded: ${model.key} (provider ${model.provider} not in configured providers)`);
        }
        return isConfigured;
    });
}
export async function listPiModels() {
    try {
        const agentDir = getPiAgentDir();
        migrateProviderApiKeysToAuthIfNeeded(agentDir);
        normalizeModelsJsonFileForPiSchema(path.join(agentDir, "models.json"));
        const modelsPath = getPiModelsPath();
        const modelsResult = readJsonFile(modelsPath);
        const configuredProviders = new Set();
        if (modelsResult.ok &&
            modelsResult.value &&
            typeof modelsResult.value === "object" &&
            "providers" in modelsResult.value &&
            typeof modelsResult.value.providers === "object") {
            const providers = modelsResult.value.providers;
            Object.keys(providers).forEach((p) => configuredProviders.add(p));
        }
        const enabledScopedModels = parseEnabledScopedModels();
        let models = [];
        try {
            const authStorage = AuthStorage.create(path.join(agentDir, "auth.json"));
            const modelRegistry = new ModelRegistry(authStorage, path.join(agentDir, "models.json"));
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
                };
            })
                .filter((model, index, array) => {
                const first = array.findIndex((candidate) => candidate.provider === model.provider &&
                    candidate.id === model.id);
                return first === index;
            });
        }
        catch (error) {
            const fallbackReason = error instanceof Error ? error.message : String(error);
            console.warn(`[pi] ModelRegistry failed, falling back to models.json only: ${fallbackReason}`);
            if (modelsResult.ok) {
                const providers = modelsResult.value.providers;
                models = Object.entries(providers).flatMap(([providerName, provider]) => {
                    const modelList = Array.isArray(provider.models)
                        ? provider.models
                        : [];
                    const nextEntries = [];
                    for (const entry of modelList) {
                        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
                            continue;
                        }
                        const id = entry.id;
                        if (typeof id !== "string" || id.trim().length === 0) {
                            continue;
                        }
                        const key = `${providerName}/${id}`;
                        nextEntries.push({
                            id,
                            provider: providerName,
                            key,
                            scoped: enabledScopedModels.has(key),
                            supportsThinking: Boolean(entry.reasoning),
                            thinkingLevels: Boolean(entry.reasoning)
                                ? THINKING_LEVELS
                                : [],
                            contextWindow: typeof entry.contextWindow ===
                                "number"
                                ? entry.contextWindow
                                : undefined,
                        });
                    }
                    return nextEntries;
                });
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
    }
    catch (error) {
        return {
            ok: false,
            reason: "unknown",
            message: error instanceof Error ? error.message : String(error),
        };
    }
}
function listPiModelsFromCache() {
    const db = getDb();
    const enabledScopedModels = parseEnabledScopedModels();
    const modelsPath = getPiModelsPath();
    const modelsResult = readJsonFile(modelsPath);
    const configuredProviders = new Set();
    if (modelsResult.ok &&
        modelsResult.value &&
        typeof modelsResult.value === "object" &&
        "providers" in modelsResult.value &&
        typeof modelsResult.value.providers === "object") {
        const providers = modelsResult.value.providers;
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
                const parsed = JSON.parse(model.thinking_levels_json);
                if (!Array.isArray(parsed)) {
                    return [];
                }
                return parsed.filter((value) => THINKING_LEVELS.includes(value));
            }
            catch {
                return [];
            }
        })(),
        contextWindow: model.context_window,
    }));
    models = filterModelsToConfiguredProviders(models, configuredProviders);
    return models;
}
export async function syncPiModelsCache() {
    await refreshModelsJsonFromPiListModels();
    const result = await listPiModels();
    if (!result.ok) {
        return result;
    }
    const db = getDb();
    replacePiModelsCache(db, result.models.map((model) => ({
        key: model.key,
        provider: model.provider,
        id: model.id,
        supportsThinking: model.supportsThinking,
        thinkingLevels: model.thinkingLevels,
        contextWindow: model.contextWindow ?? undefined,
    })));
    return result;
}
export async function listPiModelsCached() {
    const cached = listPiModelsFromCache();
    if (cached.length > 0) {
        return { ok: true, models: cached };
    }
    return syncPiModelsCache();
}
export async function setPiModelScoped(provider, id, scoped) {
    console.log(`Setting model scope: ${provider}/${id}, scoped: ${scoped}`);
    const listResult = await syncPiModelsCache();
    if (!listResult.ok) {
        console.error("Failed to sync models cache:", listResult);
        return {
            ok: false,
            reason: "sync_error",
            message: listResult.message || "Failed to sync models cache",
        };
    }
    const modelExists = listResult.models.some((model) => model.provider === provider && model.id === id);
    if (!modelExists) {
        console.error(`Model ${provider}/${id} not found in models list`);
        return { ok: false, reason: "invalid_model", message: `Model ${provider}/${id} not found` };
    }
    const agentDir = getPiAgentDir();
    console.log(`Creating SettingsManager for agent dir: ${agentDir}`);
    let settingsManager;
    try {
        settingsManager = await createSettingsManagerWithRetry(process.cwd(), agentDir);
    }
    catch (error) {
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
    }
    else {
        enabledModels.delete(key);
    }
    console.log(`Updated enabled models:`, Array.from(enabledModels));
    try {
        settingsManager.setEnabledModels(Array.from(enabledModels));
        console.log("Flushing settings...");
        await settingsManager.flush();
        console.log("Settings flushed successfully");
    }
    catch (error) {
        console.error("Failed to flush settings:", error);
        return {
            ok: false,
            reason: "flush_error",
            message: `Failed to save settings: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
    console.log("Syncing models cache after scope change...");
    const syncResult = await syncPiModelsCache();
    if (!syncResult.ok) {
        console.error("Failed to sync models cache after scope change:", syncResult);
        return syncResult;
    }
    console.log(`Successfully set model scope: ${provider}/${id}`);
    return syncResult;
}
function isNpmEnotemptyRemoveError(result) {
    if (result.ok) {
        return false;
    }
    const haystack = `${result.message ?? ""}\n${result.stderr}\n${result.stdout}`.toLowerCase();
    return (haystack.includes("enotempty") &&
        haystack.includes("npm") &&
        haystack.includes("rename"));
}
function extractPackageNameFromSource(source) {
    if (!source || !source.startsWith("npm:")) {
        return null;
    }
    const name = source.slice("npm:".length).trim();
    return name.length > 0 ? name : null;
}
function collectNpmGlobalNodeModulesRoots(envPath) {
    const roots = new Set();
    const bins = envPath.split(":").filter((entry) => entry.length > 0);
    for (const binPath of bins) {
        if (binPath.endsWith("/bin")) {
            roots.add(path.resolve(binPath, "..", "lib", "node_modules"));
            roots.add(path.resolve(binPath, "..", "..", "lib", "node_modules"));
        }
    }
    return Array.from(roots);
}
function cleanupNpmStaleRenameDirs(packageName) {
    const roots = collectNpmGlobalNodeModulesRoots(process.env.PATH ?? "");
    let removed = 0;
    for (const root of roots) {
        if (!fs.existsSync(root)) {
            continue;
        }
        let entries = [];
        try {
            entries = fs.readdirSync(root);
        }
        catch {
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
            }
            catch {
                // Best effort cleanup: ignore and keep going.
            }
        }
    }
    return removed;
}
export async function runPiRemoveWithFallback(source, local) {
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
        message: `Échec de désinstallation après nettoyage npm (dirs nettoyés: ${removedDirs}). ${second.message ?? "Erreur inconnue."}`,
    };
}
//# sourceMappingURL=workspace-pi.js.map