import crypto from "node:crypto";
import electron from "electron";
// `ws` ships JS-only in this repo setup; keep the import permissive for Electron main.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error -- no local declaration package installed
import WebSocket from "ws";
import { getDb } from "../../db/index.js";
import {
  findConversationById,
  saveConversationPiRuntime,
  upsertConversation,
} from "../../db/repos/conversations.js";
import {
  clearCloudInstanceSession,
  findCloudInstanceById,
  listCloudInstances,
  saveCloudInstanceSession,
  updateCloudInstanceStatus,
} from "../../db/repos/cloud-instances.js";
import {
  findProjectById,
  updateCloudProjectsStatusByInstance,
  upsertCloudProject,
} from "../../db/repos/projects.js";

const { BrowserWindow } = electron;

const oidcVerifierByState = new Map<string, string>();
const cloudRealtimeSockets = new Map<string, WebSocket>();
const lastRealtimeSeqByInstance = new Map<string, number>();

type CloudRuntimeEndpoints = {
  apiBaseUrl: string;
  realtimeBaseUrl: string;
  runtimeBaseUrl: string;
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
    endpoints?: CloudRuntimeEndpoints;
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

function getCloudApiBaseUrl(
  instance:
    | { base_url: string; endpoints_json: string | null }
    | { baseUrl: string; endpoints?: CloudRuntimeEndpoints }
    | { base_url: string; endpoints?: CloudRuntimeEndpoints }
    | { baseUrl: string; endpoints_json?: string | null },
): string {
  if ('endpoints' in instance && instance.endpoints?.apiBaseUrl) {
    return instance.endpoints.apiBaseUrl;
  }
  if ('endpoints_json' in instance && instance.endpoints_json) {
    try {
      const parsed = JSON.parse(instance.endpoints_json) as CloudRuntimeEndpoints;
      if (parsed.apiBaseUrl) {
        return parsed.apiBaseUrl;
      }
    } catch {
      // Ignore malformed persisted endpoint payload.
    }
  }
  return 'base_url' in instance ? instance.base_url : instance.baseUrl;
}

function getCloudRealtimeBaseUrl(
  instance:
    | { base_url: string; endpoints_json: string | null }
    | { baseUrl: string; endpoints?: CloudRuntimeEndpoints },
): string {
  if ('endpoints' in instance && instance.endpoints?.realtimeBaseUrl) {
    return instance.endpoints.realtimeBaseUrl.replace(/^ws:/i, 'http:').replace(/^wss:/i, 'https:');
  }
  if ('endpoints_json' in instance && instance.endpoints_json) {
    try {
      const parsed = JSON.parse(instance.endpoints_json) as CloudRuntimeEndpoints;
      if (parsed.realtimeBaseUrl) {
        return parsed.realtimeBaseUrl.replace(/^ws:/i, 'http:').replace(/^wss:/i, 'https:');
      }
    } catch {
      // Ignore malformed persisted endpoint payload.
    }
  }
  const baseUrl = 'base_url' in instance ? instance.base_url : instance.baseUrl;
  return baseUrl.replace(/:(4000|80|443)(?=\/|$)/, ':4001');
}

export async function getJson<TResponse>(
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

function emitCloudRealtimeEvent(payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    const webContents = win.webContents;
    if (webContents.isDestroyed()) continue;
    try {
      webContents.send("cloud:realtimeEvent", payload);
    } catch (err) {
      console.warn("[emitCloudRealtimeEvent] Failed to send to window:", err);
    }
  }
}

function emitConversationEvent(conversationId: string, event: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    const webContents = win.webContents;
    if (webContents.isDestroyed()) continue;
    try {
      webContents.send("pi:event", {
        conversationId,
        event,
      });
    } catch (err) {
      console.warn("[cloud conversation event] Failed to send to window:", err);
    }
  }
}

export async function postJson<TResponse>(
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

export function createPkceVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function createPkceChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function setCloudOidcVerifier(state: string, verifier: string): void {
  oidcVerifierByState.set(state, verifier);
}

export function getCloudOidcVerifier(state: string): string | undefined {
  return oidcVerifierByState.get(state);
}

export function deleteCloudOidcVerifier(state: string): void {
  oidcVerifierByState.delete(state);
}

export async function getAuthJson<TResponse>(
  url: string,
  accessToken: string,
): Promise<TResponse> {
  return getJson<TResponse>(url, {
    authorization: `Bearer ${accessToken}`,
  });
}

export async function postAuthJson<TResponse>(
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

export async function deleteRequestWithHeaders(
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

export async function syncCloudInstanceBootstrap(
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
      new URL("/v1/bootstrap", getCloudApiBaseUrl(instance)).toString(),
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

    const cloudInstance =
      bootstrap.cloudInstances.find((entry) => entry.id === instance.id) ??
      bootstrap.cloudInstances[0] ??
      null;
    saveCloudInstanceSession(db, instance.id, {
      userEmail: bootstrap.user.email ?? instance.user_email,
      accessToken: instance.access_token,
      refreshToken: instance.refresh_token,
      tokenExpiresAt: instance.token_expires_at,
      oauthState: null,
      connectionStatus: "connected",
      lastError: null,
      endpoints: cloudInstance?.endpoints
        ? {
            apiBaseUrl: cloudInstance.endpoints.apiBaseUrl,
            realtimeBaseUrl: cloudInstance.endpoints.realtimeBaseUrl,
            runtimeBaseUrl: cloudInstance.endpoints.runtimeBaseUrl,
          }
        : null,
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

export async function syncConnectedCloudInstances(): Promise<void> {
  const db = getDb();
  const instances = listCloudInstances(db).filter((instance) =>
    Boolean(instance.access_token),
  );

  for (const instance of instances) {
    await syncCloudInstanceBootstrap(instance.id);
  }
}

export async function connectCloudRealtime(instanceId: string): Promise<void> {
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

  const realtimeBaseUrl = getCloudRealtimeBaseUrl(instance);

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
            emitConversationEvent(
              replayEvent.conversationId,
              replayEvent.payload.event,
            );
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
        emitConversationEvent(parsed.conversationId, parsed.payload.event);
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

export function disconnectAllCloudRealtime(): void {
  for (const socket of cloudRealtimeSockets.values()) {
    try {
      socket.close();
    } catch {
      // Ignore close failures during shutdown.
    }
  }
  cloudRealtimeSockets.clear();
}

export function getRuntimeHeadlessBaseUrl(
  instance:
    | string
    | { base_url: string; endpoints_json: string | null }
    | { baseUrl: string; endpoints?: CloudRuntimeEndpoints },
): string {
  if (typeof instance === "string") {
    return instance.replace(/:(4000|80|443)(?=\/|$)/, ":4002");
  }
  if ("endpoints" in instance && instance.endpoints?.runtimeBaseUrl) {
    return instance.endpoints.runtimeBaseUrl;
  }
  if ("endpoints_json" in instance && instance.endpoints_json) {
    try {
      const parsed = JSON.parse(instance.endpoints_json) as CloudRuntimeEndpoints;
      if (parsed.runtimeBaseUrl) {
        return parsed.runtimeBaseUrl;
      }
    } catch {
      // Ignore malformed persisted endpoint payload.
    }
  }
  const baseUrl = "base_url" in instance ? instance.base_url : instance.baseUrl;
  return baseUrl.replace(/:(4000|80|443)(?=\/|$)/, ":4002");
}

export async function getPrimaryCloudAccount(): Promise<{
  account: CloudAccountResponse | null;
  users: CloudAdminListUsersResponse["users"];
  reason?: "not_connected" | "session_expired" | "unknown";
}> {
  const db = getDb();
  const instances = listCloudInstances(db);
  const instance = instances.find((entry) => Boolean(entry.access_token));
  if (!instance?.access_token) {
    // Clear stale pending auth rows so the UI does not remain stuck in "connecting"
    // after a failed or abandoned browser auth attempt.
    const staleInstance = instances.find(
      (entry) => entry.connection_status === "connecting" && !entry.access_token,
    );
    if (staleInstance) {
      console.log(
        "[Cloud] No access token found, clearing stale pending instance:",
        staleInstance.id,
      );
      clearCloudInstanceSession(db, staleInstance.id);
    }
    return { account: null, users: [], reason: "not_connected" };
  }

  try {
    if (!(await ensureFreshCloudSession(instance.id))) {
      return { account: null, users: [], reason: "session_expired" };
    }
    const freshInstance = findCloudInstanceById(db, instance.id) ?? instance;
    const account = await getJson<CloudAccountResponse>(
      new URL("/v1/account", getCloudApiBaseUrl(freshInstance)).toString(),
      {
        authorization: `Bearer ${freshInstance.access_token}`,
      },
    );

    let normalizedAccount = account;
    if ((account.organizations?.length ?? 0) === 0) {
      try {
        const bootstrap = await getJson<CloudBootstrapResponse>(
          new URL("/v1/bootstrap", getCloudApiBaseUrl(freshInstance)).toString(),
          {
            authorization: `Bearer ${freshInstance.access_token}`,
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
          new URL("/v1/admin/users", getCloudApiBaseUrl(freshInstance)).toString(),
          {
            authorization: `Bearer ${freshInstance.access_token}`,
          },
        )
      ).users;
    }

    return { account: normalizedAccount, users };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lowered = message.toLowerCase();
    const reason = lowered.includes("401") || lowered.includes("403") || lowered.includes("unauthorized")
      ? "session_expired"
      : "unknown";
    return { account: null, users: [], reason };
  }
}

async function refreshCloudInstanceAccessToken(instanceId: string): Promise<boolean> {
  const db = getDb();
  const instance = findCloudInstanceById(db, instanceId);
  if (!instance?.refresh_token) {
    return false;
  }

  try {
    const exchanged = await postJson<{
      session: { accessToken: string; refreshToken: string; expiresAt: string };
      user: { email: string };
    }>(new URL('/oidc/token', getCloudApiBaseUrl(instance)).toString(), {
      grantType: 'refresh_token',
      clientId: 'chatons-desktop',
      redirectUri: 'chatons://cloud/auth/callback',
      refreshToken: instance.refresh_token,
    });
    saveCloudInstanceSession(db, instance.id, {
      userEmail: exchanged.user.email ?? instance.user_email,
      accessToken: exchanged.session.accessToken,
      refreshToken: exchanged.session.refreshToken,
      tokenExpiresAt: exchanged.session.expiresAt,
      oauthState: null,
      connectionStatus: 'connected',
      lastError: null,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateCloudInstanceStatus(db, instance.id, 'error', message);
    return false;
  }
}

export async function ensureFreshCloudSession(instanceId: string): Promise<boolean> {
  const db = getDb();
  const instance = findCloudInstanceById(db, instanceId);
  if (!instance?.access_token) {
    return false;
  }
  if (!instance.token_expires_at) {
    return true;
  }
  const expiresAt = Date.parse(instance.token_expires_at);
  if (!Number.isFinite(expiresAt)) {
    return true;
  }
  if (expiresAt - Date.now() > 60_000) {
    return true;
  }
  return refreshCloudInstanceAccessToken(instanceId);
}

export async function ensureCloudRuntimeSession(
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

  if (!(await ensureFreshCloudSession(instance.id))) {
    return { ok: false, reason: "unknown", message: "Cloud session expired. Please reconnect." };
  }

  const freshInstance = findCloudInstanceById(db, instance.id) ?? instance;

  if (conversation.cloud_runtime_session_id) {
    return { ok: true, sessionId: conversation.cloud_runtime_session_id };
  }

  try {
    const createdResponse = await fetch(
      new URL("/v1/runtime/sessions", getRuntimeHeadlessBaseUrl(freshInstance)).toString(),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${freshInstance.access_token}`,
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

export async function getCloudRuntimeSnapshot(
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

  if (!(await ensureFreshCloudSession(instance.id))) {
    return { status: "error", state: null, messages: [] };
  }

  const freshInstance = findCloudInstanceById(db, instance.id) ?? instance;
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
        getRuntimeHeadlessBaseUrl(freshInstance),
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
          getRuntimeHeadlessBaseUrl(freshInstance),
        ).toString(),
      );
    }
    return { status: "error", state: null, messages: [] };
  }
}

export async function resetExpiredCloudRuntimeSession(
  conversationId: string,
): Promise<void> {
  const db = getDb();
  saveConversationPiRuntime(db, conversationId, {
    cloudRuntimeSessionId: null,
  });
}
