import type {
  PiRendererEvent,
  RpcCommand,
  RpcExtensionUiResponse,
  RpcResponse,
} from "../pi-sdk-runtime.js";
import {
  summarizeAndStoreConversation,
  consolidateMemory,
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
  upsertConversation,
  updateConversationStatus,
  updateConversationTitle,
} from "../db/repos/conversations.js";
import {
  deleteProjectById,
  findProjectById,
  findProjectByRepoPath,
  insertProject,
  listProjects,
  upsertCloudProject,
  updateCloudProjectsStatusByInstance,
  updateProjectIcon,
  updateProjectIsArchived,
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
// `ws` ships JS-only in this repo setup; keep the import permissive for Electron main.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error no local declaration package installed
import WebSocket from "ws";
import { getDb } from "../db/index.js";
import { getSentryTelemetry } from "../lib/telemetry/sentry.js";
import { OAuthProvider } from "@mariozechner/pi-ai";
import { getOAuthProvider } from "@mariozechner/pi-ai/oauth";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
const { app, BrowserWindow, contentTracing, dialog, ipcMain, shell } = electron;

const oidcVerifierByState = new Map<string, string>();

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

type CloudBootstrapResponse = {
  user: {
    id: string;
    email: string;
    displayName: string;
    isAdmin: boolean;
    createdAt: string;
    subscription: {
      id: "plus" | "pro" | "max";
      label: string;
      parallelSessionsLimit: number;
      isDefault?: boolean;
    };
    complimentaryGrant?: {
      plan: {
        id: "plus" | "pro" | "max";
        label: string;
        parallelSessionsLimit: number;
        isDefault?: boolean;
      };
      grantedAt: string;
      expiresAt: string | null;
    } | null;
  };
  organizations: Array<{
    id: string;
    slug: string;
    name: string;
    role: "owner" | "admin" | "member" | "billing_viewer";
  }>;
  cloudInstances: Array<{
    id: string;
    name: string;
    baseUrl: string;
    authMode: "oauth";
    connectionStatus: "connected" | "connecting" | "disconnected" | "error";
    lastError: string | null;
  }>;
  projects: Array<{
    id: string;
    organizationId: string;
    organizationName: string;
    name: string;
    repoName: string;
    kind: "repository" | "conversation_only";
    workspaceCapability: "full_tools" | "chat_only";
    repository?: {
      cloneUrl: string;
      defaultBranch: string | null;
      authMode: "none" | "token";
    } | null;
    location: "cloud";
    cloudStatus: "connected" | "connecting" | "disconnected" | "error";
  }>;
  conversations: Array<{
    id: string;
    projectId: string;
    runtimeLocation: "cloud";
    title: string;
    status: "active" | "done" | "archived";
    modelProvider: string | null;
    modelId: string | null;
  }>;
  usage: {
    activeParallelSessions: number;
    parallelSessionsLimit: number;
    remainingParallelSessions: number;
  };
};

type CloudAccountResponse = {
  user: CloudBootstrapResponse["user"];
  usage: CloudBootstrapResponse["usage"];
  organizations: CloudBootstrapResponse["organizations"];
  activeOrganizationId: string | null;
  plans: Array<{
    id: "plus" | "pro" | "max";
    label: string;
    parallelSessionsLimit: number;
    isDefault?: boolean;
  }>;
};

type CloudAdminListUsersResponse = {
  users: CloudAccountResponse["user"][];
  plans: CloudAccountResponse["plans"];
};

type RuntimeSessionSnapshot = {
  status: string;
  state: unknown;
  messages: unknown[];
};

async function postJson<TResponse>(
  url: string,
  payload: unknown,
  headers?: Record<string, string>,
): Promise<TResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(headers ?? {}),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `HTTP ${response.status} ${response.statusText}: ${text || "request failed"}`,
    );
  }
  return (await response.json()) as TResponse;
}

function createPkceVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function createPkceChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

async function getJson<TResponse>(
  url: string,
  headers?: Record<string, string>,
): Promise<TResponse> {
  const response = await fetch(url, {
    method: "GET",
    headers,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `HTTP ${response.status} ${response.statusText}: ${text || "request failed"}`,
    );
  }
  return (await response.json()) as TResponse;
}

async function deleteRequest(url: string): Promise<void> {
  const response = await fetch(url, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(
      `HTTP ${response.status} ${response.statusText}: ${text || "request failed"}`,
    );
  }
}

async function deleteRequestWithHeaders(
  url: string,
  headers?: Record<string, string>,
): Promise<void> {
  const response = await fetch(url, {
    method: "DELETE",
    headers,
  });
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(
      `HTTP ${response.status} ${response.statusText}: ${text || "request failed"}`,
    );
  }
}

async function syncCloudInstanceBootstrap(
  instanceId: string,
): Promise<
  | { ok: true; syncedProjects: number }
  | {
      ok: false;
      reason: "instance_not_found" | "missing_session" | "subscription_required" | "unknown";
      message?: string;
    }
> {
  const db = getDb();
  const instance = findCloudInstanceById(db, instanceId);
  if (!instance) {
    return { ok: false, reason: "instance_not_found" };
  }

  if (!instance.access_token) {
    return {
      ok: false,
      reason: "missing_session",
      message: "Missing cloud access token",
    };
  }

  try {
    const bootstrap = await getJson<CloudBootstrapResponse>(
      new URL("/v1/bootstrap", instance.base_url).toString(),
      {
        authorization: `Bearer ${instance.access_token}`,
      },
    );

    for (const project of bootstrap.projects) {
      upsertCloudProject(db, {
        id: project.id,
        name: project.name,
        repoName: project.repoName,
        cloudInstanceId: instance.id,
        organizationId: project.organizationId,
        organizationName: project.organizationName,
        cloudStatus: project.cloudStatus,
        cloudProjectKind: project.kind ?? null,
        cloudWorkspaceCapability: project.workspaceCapability ?? null,
        cloudRepositoryCloneUrl: project.repository?.cloneUrl ?? null,
        cloudRepositoryDefaultBranch: project.repository?.defaultBranch ?? null,
        cloudRepositoryAuthMode: project.repository?.authMode ?? null,
      });
    }

    for (const conversation of bootstrap.conversations) {
      upsertConversation(db, {
        id: conversation.id,
        projectId: conversation.projectId,
        title: conversation.title,
        status: conversation.status,
        modelProvider: conversation.modelProvider ?? null,
        modelId: conversation.modelId ?? null,
        accessMode: "secure",
        runtimeLocation: "cloud",
        cloudRuntimeSessionId: null,
      });
    }

    saveCloudInstanceSession(db, instance.id, {
      userEmail: bootstrap.user.email ?? instance.user_email,
      accessToken: instance.access_token,
      refreshToken: instance.refresh_token,
      tokenExpiresAt: instance.token_expires_at,
      oauthState: null,
      connectionStatus: "connected",
      lastError: null,
    });

    return { ok: true, syncedProjects: bootstrap.projects.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("subscription_required")) {
      updateCloudInstanceStatus(db, instance.id, "error", message);
      return { ok: false, reason: "subscription_required", message };
    }
    updateCloudInstanceStatus(db, instance.id, "error", message);
    return { ok: false, reason: "unknown", message };
  }
}

async function syncConnectedCloudInstances(): Promise<void> {
  const db = getDb();
  const instances = listCloudInstances(db).filter((instance) =>
    Boolean(instance.access_token),
  );

  for (const instance of instances) {
    await syncCloudInstanceBootstrap(instance.id);
  }
}

function emitCloudRealtimeEvent(payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("cloud:realtimeEvent", payload);
  }
}

async function getAuthJson<TResponse>(
  url: string,
  accessToken: string,
): Promise<TResponse> {
  return getJson<TResponse>(url, {
    authorization: `Bearer ${accessToken}`,
  });
}

async function postAuthJson<TResponse>(
  url: string,
  accessToken: string,
  payload: unknown,
): Promise<TResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `HTTP ${response.status} ${response.statusText}: ${text || "request failed"}`,
    );
  }
  return (await response.json()) as TResponse;
}

async function connectCloudRealtime(instanceId: string): Promise<void> {
  const db = getDb();
  const instance = findCloudInstanceById(db, instanceId);
  if (!instance?.access_token) {
    return;
  }

  const existing = cloudRealtimeSockets.get(instanceId);
  if (
    existing &&
    (existing.readyState === WebSocket.OPEN ||
      existing.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  const realtimeBaseUrl = instance.base_url.replace(
    /:(4000|80|443)(?=\/|$)/,
    ":4001",
  );

  let tokenResponse:
    | { token: string; expiresAt: string; websocketUrl: string }
    | undefined;

  try {
    tokenResponse = await getAuthJson(
      new URL(
        `/v1/realtime/token?cloudInstanceId=${encodeURIComponent(instance.id)}`,
        realtimeBaseUrl,
      ).toString(),
      instance.access_token,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateCloudInstanceStatus(db, instance.id, "error", message);
    updateCloudProjectsStatusByInstance(db, instance.id, "error");
    emitCloudRealtimeEvent({
      instanceId: instance.id,
      type: "cloud.instance.status",
      status: "error",
      message,
    });
    return;
  }
  if (!tokenResponse) {
    return;
  }

  const separator = tokenResponse.websocketUrl.includes("?") ? "&" : "?";
  const socket = new WebSocket(
    `${tokenResponse.websocketUrl}${separator}token=${encodeURIComponent(tokenResponse.token)}`,
  );
  cloudRealtimeSockets.set(instance.id, socket);
  const lastRealtimeSeqByInstance = (connectCloudRealtime as typeof connectCloudRealtime & {
    _lastRealtimeSeqByInstance?: Map<string, number>;
  })._lastRealtimeSeqByInstance ?? new Map<string, number>();
  (connectCloudRealtime as typeof connectCloudRealtime & {
    _lastRealtimeSeqByInstance?: Map<string, number>;
  })._lastRealtimeSeqByInstance = lastRealtimeSeqByInstance;

  updateCloudInstanceStatus(db, instance.id, "connecting", null);
  updateCloudProjectsStatusByInstance(db, instance.id, "connecting");
  emitCloudRealtimeEvent({
    instanceId: instance.id,
    type: "cloud.instance.status",
    status: "connecting",
    message: "Connecting realtime",
  });

  socket.on("open", () => {
    updateCloudInstanceStatus(db, instance.id, "connected", null);
    updateCloudProjectsStatusByInstance(db, instance.id, "connected");
    emitCloudRealtimeEvent({
      instanceId: instance.id,
      type: "cloud.instance.status",
      status: "connected",
      message: "Realtime connected",
    });

    void getAuthJson<{
      cloudInstanceId: string;
      lastSeq: number;
      events: Array<{
        seq?: number;
        type?: string;
        conversationId?: string;
        payload?: {
          event?: {
            type: string;
            [key: string]: unknown;
          };
        };
      }>;
    }>(
      new URL(
        `/v1/realtime/replay?cloudInstanceId=${encodeURIComponent(instance.id)}&afterSeq=${encodeURIComponent(String(lastRealtimeSeqByInstance.get(instance.id) ?? 0))}`,
        realtimeBaseUrl,
      ).toString(),
      instance.access_token!,
    )
      .then((replay) => {
        if (typeof replay.lastSeq === "number") {
          lastRealtimeSeqByInstance.set(instance.id, replay.lastSeq);
        }
        for (const replayEvent of replay.events ?? []) {
          if (typeof replayEvent.seq === "number") {
            const currentSeq = lastRealtimeSeqByInstance.get(instance.id) ?? 0;
            if (replayEvent.seq > currentSeq) {
              lastRealtimeSeqByInstance.set(instance.id, replayEvent.seq);
            }
          }
          if (
            replayEvent.type === "conversation.event" &&
            replayEvent.conversationId &&
            replayEvent.payload?.event
          ) {
            for (const window of BrowserWindow.getAllWindows()) {
              window.webContents.send("pi:event", {
                conversationId: replayEvent.conversationId,
                event: replayEvent.payload.event,
              });
            }
          }
          emitCloudRealtimeEvent({
            instanceId: instance.id,
            ...replayEvent,
          });
        }
      })
      .catch(() => undefined);
  });

  socket.on("message", (data: unknown) => {
    try {
      const rawData =
        typeof data === "string" || Buffer.isBuffer(data) ? data.toString() : String(data);
      const parsed = JSON.parse(rawData) as {
        seq?: number;
        type?: string;
        conversationId?: string;
        payload?: {
          cloudInstanceId?: string;
          status?: "connected" | "connecting" | "disconnected" | "error";
          message?: string;
          event?: {
            type: string;
            [key: string]: unknown;
          };
        };
      };

      if (typeof parsed.seq === "number") {
        const currentSeq = lastRealtimeSeqByInstance.get(instance.id) ?? 0;
        if (parsed.seq > currentSeq) {
          lastRealtimeSeqByInstance.set(instance.id, parsed.seq);
        }
      }

      if (parsed.type === "cloud.instance.status" && parsed.payload?.status) {
        const targetInstanceId = parsed.payload.cloudInstanceId ?? instance.id;
        updateCloudInstanceStatus(
          db,
          targetInstanceId,
          parsed.payload.status,
          parsed.payload.status === "error"
            ? parsed.payload.message ?? null
            : null,
        );
        updateCloudProjectsStatusByInstance(
          db,
          targetInstanceId,
          parsed.payload.status,
        );
      }

      if (
        parsed.type === "conversation.event" &&
        parsed.conversationId &&
        parsed.payload?.event
      ) {
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send("pi:event", {
            conversationId: parsed.conversationId,
            event: parsed.payload.event,
          });
        }
      }

      emitCloudRealtimeEvent({
        instanceId: instance.id,
        ...parsed,
      });
    } catch {
      // Ignore malformed realtime payloads for now.
    }
  });

  socket.on("close", () => {
    cloudRealtimeSockets.delete(instance.id);
    updateCloudInstanceStatus(db, instance.id, "disconnected", null);
    updateCloudProjectsStatusByInstance(db, instance.id, "disconnected");
    emitCloudRealtimeEvent({
      instanceId: instance.id,
      type: "cloud.instance.status",
      status: "disconnected",
      message: "Realtime disconnected",
    });
  });

  socket.on("error", (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    updateCloudInstanceStatus(db, instance.id, "error", message);
    updateCloudProjectsStatusByInstance(db, instance.id, "error");
    emitCloudRealtimeEvent({
      instanceId: instance.id,
      type: "cloud.instance.status",
      status: "error",
      message,
    });
  });
}

function disconnectAllCloudRealtime(): void {
  for (const socket of cloudRealtimeSockets.values()) {
    try {
      socket.close();
    } catch {
      // Ignore close failures during shutdown.
    }
  }
  cloudRealtimeSockets.clear();
}

function getRuntimeHeadlessBaseUrl(instanceBaseUrl: string): string {
  return instanceBaseUrl.replace(/:(4000|80|443)(?=\/|$)/, ":4002");
}

async function getPrimaryCloudAccount(): Promise<{
  account: CloudAccountResponse | null;
  users: CloudAdminListUsersResponse["users"];
}> {
  const db = getDb();
  const instance = listCloudInstances(db).find((entry) => Boolean(entry.access_token));
  if (!instance?.access_token) {
    return { account: null, users: [] };
  }

  try {
    const account = await getJson<CloudAccountResponse>(
      new URL("/v1/account", instance.base_url).toString(),
      {
        authorization: `Bearer ${instance.access_token}`,
      },
    );

    let normalizedAccount = account;
    if ((account.organizations?.length ?? 0) === 0) {
      try {
        const bootstrap = await getJson<CloudBootstrapResponse>(
          new URL("/v1/bootstrap", instance.base_url).toString(),
          {
            authorization: `Bearer ${instance.access_token}`,
          },
        );
        normalizedAccount = {
          ...account,
          organizations: bootstrap.organizations ?? [],
          activeOrganizationId:
            account.activeOrganizationId ??
            bootstrap.organizations[0]?.id ??
            null,
        };
      } catch {
        normalizedAccount = account;
      }
    }

    let users: CloudAdminListUsersResponse["users"] = [];
    if (normalizedAccount.user.isAdmin) {
      users = (
        await getJson<CloudAdminListUsersResponse>(
          new URL("/v1/admin/users", instance.base_url).toString(),
          {
            authorization: `Bearer ${instance.access_token}`,
          },
        )
      ).users;
    }

    return { account: normalizedAccount, users };
  } catch {
    return { account: null, users: [] };
  }
}

async function ensureCloudRuntimeSession(
  conversationId: string,
): Promise<
  | { ok: true; sessionId: string }
  | { ok: false; reason: "conversation_not_found" | "project_not_found" | "cloud_instance_not_found" | "unknown"; message?: string }
> {
  const db = getDb();
  const conversation = findConversationById(db, conversationId);
  if (!conversation) {
    return { ok: false, reason: "conversation_not_found" };
  }

  const project = conversation.project_id
    ? findProjectById(db, conversation.project_id)
    : null;
  if (!project || project.location !== "cloud" || !project.cloud_instance_id) {
    return { ok: false, reason: "project_not_found" };
  }

  const instance = findCloudInstanceById(db, project.cloud_instance_id);
  if (!instance) {
    return { ok: false, reason: "cloud_instance_not_found" };
  }

  if (conversation.cloud_runtime_session_id) {
    return { ok: true, sessionId: conversation.cloud_runtime_session_id };
  }

  try {
    const createdResponse = await fetch(
      new URL("/v1/runtime/sessions", getRuntimeHeadlessBaseUrl(instance.base_url)).toString(),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${instance.access_token}`,
        },
        body: JSON.stringify({
          conversationId: conversation.id,
          projectId: conversation.project_id,
          cloudInstanceId: instance.id,
          modelProvider: conversation.model_provider,
          modelId: conversation.model_id,
          thinkingLevel: conversation.thinking_level,
        }),
      },
    );
    const created = (await createdResponse.json().catch(() => null)) as
      | { id: string; status: string; usage?: unknown }
      | { error?: string; message?: string; usage?: unknown }
      | null;
    if (!createdResponse.ok || !created || !("id" in created)) {
      const createdError =
        created && "message" in created && typeof created.message === "string"
          ? created.message
          : null;
      throw new Error(
        createdError && createdError.trim().length > 0
          ? createdError
          : `HTTP ${createdResponse.status} while creating cloud runtime session`,
      );
    }

    saveConversationPiRuntime(db, conversation.id, {
      runtimeLocation: "cloud",
      cloudRuntimeSessionId: created.id,
      lastRuntimeError: null,
    });

    return { ok: true, sessionId: created.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    saveConversationPiRuntime(db, conversation.id, {
      runtimeLocation: "cloud",
      lastRuntimeError: message,
    });
    return { ok: false, reason: "unknown", message };
  }
}

async function getCloudRuntimeSnapshot(
  conversationId: string,
): Promise<RuntimeSessionSnapshot> {
  const db = getDb();
  const conversation = findConversationById(db, conversationId);
  if (!conversation) {
    return { status: "error", state: null, messages: [] };
  }
  const project = conversation.project_id
    ? findProjectById(db, conversation.project_id)
    : null;
  const instance =
    project?.cloud_instance_id
      ? findCloudInstanceById(db, project.cloud_instance_id)
      : null;

  if (!project || project.location !== "cloud" || !instance) {
    return { status: "error", state: null, messages: [] };
  }

  const session = await ensureCloudRuntimeSession(conversationId);
  if (!session.ok) {
    return {
      status: "error",
      state: null,
      messages: [],
    };
  }

  try {
    return await getJson<RuntimeSessionSnapshot>(
      new URL(
        `/v1/runtime/sessions/${encodeURIComponent(session.sessionId)}`,
        getRuntimeHeadlessBaseUrl(instance.base_url),
      ).toString(),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("404")) {
      await resetExpiredCloudRuntimeSession(conversationId);
      const retried = await ensureCloudRuntimeSession(conversationId);
      if (!retried.ok) {
        return { status: "error", state: null, messages: [] };
      }
      return getJson<RuntimeSessionSnapshot>(
        new URL(
          `/v1/runtime/sessions/${encodeURIComponent(retried.sessionId)}`,
          getRuntimeHeadlessBaseUrl(instance.base_url),
        ).toString(),
      );
    }
    return { status: "error", state: null, messages: [] };
  }
}

async function resetExpiredCloudRuntimeSession(conversationId: string): Promise<void> {
  const db = getDb();
  saveConversationPiRuntime(db, conversationId, {
    cloudRuntimeSessionId: null,
  });
}

type RegisterWorkspaceHandlersDeps = {
  toWorkspacePayload: () => Record<string, unknown>;
  getGitDiffSummaryForConversation: (
    conversationId: string,
  ) => Promise<unknown> | unknown;
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
let memoryConsolidationWorker: NodeJS.Timeout | null = null;
let unsubscribePiRuntimeEvents: (() => void) | null = null;
const cloudRealtimeSockets = new Map<string, WebSocket>();

function buildHostTerminalEnv(cwd?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const pathKey = process.platform === "win32" ? "Path" : "PATH";
  const currentPath = env[pathKey] ?? env.PATH ?? "";
  const pathEntries = currentPath
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(
      (entry, index, array) =>
        entry.length > 0 && array.indexOf(entry) === index,
    );

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

function resolveHostExecutable(
  command: string,
  env: NodeJS.ProcessEnv,
): string {
  if (!command.trim() || command.includes(path.sep)) {
    return command;
  }

  const pathValue =
    env[process.platform === "win32" ? "Path" : "PATH"] ?? env.PATH ?? "";
  const searchDirs = pathValue
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const extensions =
    process.platform === "win32"
      ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
          .split(";")
          .map((ext) => ext.trim())
          .filter((ext) => ext.length > 0)
      : [""];

  for (const dir of searchDirs) {
    for (const ext of extensions) {
      const candidate = path.join(
        dir,
        process.platform === "win32" ? `${command}${ext}` : command,
      );
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return command;
}

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

  // Memory consolidation runs every 30 minutes
  if (memoryConsolidationWorker) {
    clearInterval(memoryConsolidationWorker);
  }
  const CONSOLIDATION_INTERVAL_MS = 30 * 60 * 1000;
  memoryConsolidationWorker = setInterval(() => {
    void consolidateMemory(
      deps.piRuntimeManager as unknown as Parameters<typeof consolidateMemory>[0],
    ).catch((err) =>
      console.warn("[Memory] Consolidation cycle failed:", err),
    );
  }, CONSOLIDATION_INTERVAL_MS);

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
      void deps.piRuntimeManager
        .getSnapshot(event.conversationId)
        .then((snapshot) =>
          deps.cacheMessagesFromSnapshot(event.conversationId, snapshot),
        )
        .catch(() => undefined);

      // Auto-summarize conversation to memory (fire-and-forget)
      // Skip ephemeral/hidden conversations (automations, memory tasks, channels)
      const convForMemory = findConversationById(getDb(), event.conversationId);
      const isEphemeral =
        !convForMemory ||
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
        void summarizeAndStoreConversation(
          event.conversationId,
          deps.piRuntimeManager as unknown as Parameters<typeof summarizeAndStoreConversation>[1],
        )
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
      const payload = deps.toWorkspacePayload();
      const cloudAccount = await getPrimaryCloudAccount();
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
    (_event, conversationId: string) =>
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

      oidcVerifierByState.set(state, verifier);

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
        oidcVerifierByState.delete(state);
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
      const verifier = oidcVerifierByState.get(state) ?? "";
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
        oidcVerifierByState.delete(state);
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
        oidcVerifierByState.delete(state);
        updateCloudInstanceStatus(db, instance.id, "error", "Missing cloud session payload");
        return {
          ok: false as const,
          reason: "unknown" as const,
          message: "Missing cloud session payload",
        };
      }

      oidcVerifierByState.delete(state);
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
    const { account, users } = await getPrimaryCloudAccount();
    console.log("[Cloud] getPrimaryCloudAccount result", { hasAccount: !!account, usersCount: users.length });
    if (!account) {
      return { ok: false as const, reason: "not_connected" as const };
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
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("workspace:conversationUpdated", payload);
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
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("workspace:conversationUpdated", payload);
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
          console.warn("[conversation-title] AI refinement unavailable", {
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

      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("pi:event", {
          conversationId,
          event: {
            type: "runtime_status",
            status: "ready",
            message: "Cloud runtime ready",
          },
        });
      }

      return { ok: true as const, runtime: "cloud" as const };
    }

    return deps.piRuntimeManager.start(conversationId);
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

      return deps.piRuntimeManager.sendCommand(conversationId, command);
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
  if (memoryConsolidationWorker) {
    clearInterval(memoryConsolidationWorker);
    memoryConsolidationWorker = null;
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

  const detectExternalCommand = async (command: string) => {
    try {
      if (typeof command !== "string" || !command.trim()) {
        return { detected: false };
      }
      const { execSync } = await import("node:child_process");
      try {
        if (process.platform === "win32") {
          execSync(`where ${command}`, { stdio: "pipe" });
        } else {
          execSync(`command -v ${command}`, { stdio: "pipe", shell: "/bin/sh" });
        }
        return { detected: true };
      } catch {
        return { detected: false };
      }
    } catch {
      return { detected: false };
    }
  };

  ipcMain.handle("vscode:detect", async () => detectExternalCommand("code"));

  ipcMain.handle("app:detectExternalCommand", async (_event, command: string) =>
    detectExternalCommand(command),
  );

  ipcMain.handle("app:openExternal", async (_event, url: string) => {
    try {
      if (typeof url !== "string" || !url.trim()) {
        return { success: false, error: "Missing URL" };
      }
      new URL(url);
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
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

      return { installed, apiRunning, baseUrl: "http://localhost:1234/v1" };
    } catch {
      return {
        installed: false,
        apiRunning: false,
        baseUrl: "http://localhost:1234/v1",
      };
    }
  });

  ipcMain.handle(
    "vscode:openWorktree",
    async (_event, worktreePath: string) => {
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
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  ipcMain.handle(
    "app:openExternalApplication",
    async (_event, command: string, args: string[]) => {
      try {
        if (typeof command !== "string" || !command.trim()) {
          return { success: false, error: "Missing command" };
        }
        const normalizedArgs = Array.isArray(args)
          ? args.filter((arg): arg is string => typeof arg === "string")
          : [];
        const { spawn } = await import("node:child_process");
        const child = spawn(command, normalizedArgs, {
          detached: true,
          stdio: "ignore",
          shell: process.platform === "win32",
        });
        child.unref();
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  // Composer drafts handlers
  ipcMain.handle(
    "composer:saveDraft",
    async (_event, key: string, content: string) => {
      try {
        const { saveComposerDraft } =
          await import("../db/repos/conversations.js");
        saveComposerDraft(getDb(), key, content);
        return { ok: true };
      } catch (error) {
        console.error("Failed to save composer draft:", error);
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  ipcMain.handle("composer:getDraft", async (_event, key: string) => {
    try {
      const { getComposerDraft } = await import("../db/repos/conversations.js");
      const draft = getComposerDraft(getDb(), key);
      return { ok: true, draft: draft?.content ?? null };
    } catch (error) {
      console.error("Failed to get composer draft:", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("composer:getAllDrafts", async () => {
    try {
      const { getComposerDrafts } =
        await import("../db/repos/conversations.js");
      const drafts = getComposerDrafts(getDb());
      const result: Record<string, string> = {};
      for (const draft of drafts) {
        result[draft.key] = draft.content;
      }
      return { ok: true, drafts: result };
    } catch (error) {
      console.error("Failed to get all composer drafts:", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("composer:deleteDraft", async (_event, key: string) => {
    try {
      const { deleteComposerDraft } =
        await import("../db/repos/conversations.js");
      deleteComposerDraft(getDb(), key);
      return { ok: true };
    } catch (error) {
      console.error("Failed to delete composer draft:", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle(
    "composer:saveQueuedMessages",
    async (_event, key: string, messages: string[]) => {
      try {
        const { saveComposerQueuedMessages } =
          await import("../db/repos/conversations.js");
        saveComposerQueuedMessages(getDb(), key, messages);
        return { ok: true };
      } catch (error) {
        console.error("Failed to save queued composer messages:", error);
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  ipcMain.handle("composer:getQueuedMessages", async (_event, key: string) => {
    try {
      const { getComposerQueuedMessages } =
        await import("../db/repos/conversations.js");
      const queued = getComposerQueuedMessages(getDb(), key);
      return {
        ok: true,
        messages: queued ? JSON.parse(queued.messages_json) : [],
      };
    } catch (error) {
      console.error("Failed to get queued composer messages:", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("composer:getAllQueuedMessages", async () => {
    try {
      const { getAllComposerQueuedMessages } =
        await import("../db/repos/conversations.js");
      const queuedEntries = getAllComposerQueuedMessages(getDb());
      const result: Record<string, string[]> = {};
      for (const entry of queuedEntries) {
        result[entry.key] = JSON.parse(entry.messages_json);
      }
      return { ok: true, queuedMessages: result };
    } catch (error) {
      console.error("Failed to get all queued composer messages:", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("composer:deleteQueuedMessages", async (_event, key: string) => {
    try {
      const { deleteComposerQueuedMessages } =
        await import("../db/repos/conversations.js");
      deleteComposerQueuedMessages(getDb(), key);
      return { ok: true };
    } catch (error) {
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
        try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
        return { ok: true, cancelled: true };
      }

      // Move temp trace to chosen location
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

  ipcMain.handle(
    "setConversationMemoryInjected",
    async (_event, conversationId: string, injected: boolean) => {
      try {
        // Update the conversation in the database to mark memory as injected
        const db = getDb();
        db.prepare(
          `UPDATE conversations SET memory_injected = ? WHERE id = ?`
        ).run(injected ? 1 : 0, conversationId);
        
        // Also update the in-memory conversation cache
        const conversation = findConversationById(db, conversationId);
        if (conversation) {
          conversation.memory_injected = injected ? 1 : 0;
        }
        
        return { ok: true };
      } catch (error) {
        console.error("Failed to set conversation memory injected:", error);
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );
}
