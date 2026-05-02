import electron from "electron";

import { getDb } from "../db/index.js";
import {
  getAcpConversationState,
  recordAcpMessage,
  saveAcpTaskList,
  updateAcpTaskStatus,
  upsertAcpAgentState,
} from "./store.js";
import type {
  AcpAgentRole,
  AcpAgentStatus,
  AcpConversationState,
  AcpJsonValue,
  AcpMessageType,
  AcpSubAgentResult,
  AcpTaskList,
  AcpTaskStatus,
  AcpTimelineEntry,
} from "./types.js";

const { BrowserWindow } = electron;
const ACP_BROADCAST_DEBOUNCE_MS = 50;

const pendingAcpBroadcasts = new Map<string, AcpTimelineEntry>();

/**
 * Clears any pending (not-yet-flushed) broadcast for a conversation.
 * Call this when a conversation is deleted to avoid stale entries leaking
 * in the map indefinitely.
 */
export function clearPendingBroadcastsForConversation(conversationId: string) {
  pendingAcpBroadcasts.delete(conversationId);
}

export type AcpRendererEvent = {
  conversationId: string;
  state: AcpConversationState;
  latest: AcpTimelineEntry;
};

function broadcastAcpEvent(event: AcpRendererEvent) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    const webContents = win.webContents;
    if (webContents.isDestroyed()) continue;
    try {
      webContents.send("chaton:acp:event", event);
    } catch (error) {
      console.warn("[acp] Failed to broadcast event:", error);
    }
  }
}

function scheduleAcpBroadcast(conversationId: string, latest: AcpTimelineEntry) {
  if (pendingAcpBroadcasts.has(conversationId)) {
    pendingAcpBroadcasts.set(conversationId, latest);
    return;
  }

  pendingAcpBroadcasts.set(conversationId, latest);
  setTimeout(() => {
    const latestQueued = pendingAcpBroadcasts.get(conversationId);
    if (!latestQueued) return;
    pendingAcpBroadcasts.delete(conversationId);
    try {
      const db = getDb();
      const state = getAcpConversationState(db, conversationId);
      broadcastAcpEvent({ conversationId, state, latest: latestQueued });
    } catch (error) {
      console.warn("[acp] Failed to flush broadcast:", error);
    }
  }, ACP_BROADCAST_DEBOUNCE_MS);
}

function appendMessage(params: {
  conversationId: string;
  from: string;
  to?: string | null;
  role: AcpAgentRole;
  type: AcpMessageType;
  title?: string | null;
  payload?: AcpJsonValue;
  createdAt?: string;
}) {
  const db = getDb();
  const latest = recordAcpMessage(db, {
    conversationId: params.conversationId,
    from: params.from,
    to: params.to,
    role: params.role,
    type: params.type,
    title: params.title,
    payload: params.payload,
    createdAt: params.createdAt,
  });
  scheduleAcpBroadcast(params.conversationId, latest);
  return latest;
}

export function getAcpStateForConversation(
  conversationId: string,
): AcpConversationState {
  return getAcpConversationState(getDb(), conversationId);
}

export function recordAcpTaskList(params: {
  conversationId: string;
  ownerKind: "orchestrator" | "subagent";
  ownerAgentId: string;
  ownerRole: AcpAgentRole;
  from: string;
  title: string;
  taskList: AcpTaskList;
}) {
  saveAcpTaskList(getDb(), {
    conversationId: params.conversationId,
    ownerKind: params.ownerKind,
    ownerAgentId: params.ownerAgentId,
    taskList: params.taskList,
  });
  appendMessage({
    conversationId: params.conversationId,
    from: params.from,
    role: params.ownerRole,
    type: "task",
    title: params.title,
    payload: params.taskList as unknown as AcpJsonValue,
  });
}

export function recordAcpTaskStatus(params: {
  conversationId: string;
  ownerKind: "orchestrator" | "subagent";
  ownerAgentId: string;
  from: string;
  ownerRole: AcpAgentRole;
  taskId: string;
  status: AcpTaskStatus;
  errorMessage?: string;
}) {
  const updated = updateAcpTaskStatus(getDb(), {
    conversationId: params.conversationId,
    ownerKind: params.ownerKind,
    ownerAgentId: params.ownerAgentId,
    taskId: params.taskId,
    status: params.status,
    errorMessage: params.errorMessage,
  });
  if (!updated) return;
  appendMessage({
    conversationId: params.conversationId,
    from: params.from,
    role: params.ownerRole,
    type:
      params.status === "error"
        ? "error"
        : params.status === "completed"
          ? "result"
          : "status",
    title: `Task ${params.status}`,
    payload: {
      taskId: params.taskId,
      status: params.status,
      // errorMessage is only meaningful for error status — guard against misuse
      ...(params.status === "error" && params.errorMessage
        ? { errorMessage: params.errorMessage }
        : {}),
    },
  });
}

export function registerAcpAgent(params: {
  conversationId: string;
  agentId: string;
  role: AcpAgentRole;
  label: string;
  description?: string;
  objective?: string;
  status?: AcpAgentStatus;
  executionMode?: "sequential" | "parallel";
  from?: string;
}) {
  upsertAcpAgentState(getDb(), {
    conversationId: params.conversationId,
    agentId: params.agentId,
    role: params.role,
    label: params.label,
    description: params.description,
    objective: params.objective,
    status: params.status ?? "pending",
    executionMode: params.executionMode,
  });
  appendMessage({
    conversationId: params.conversationId,
    from: params.from ?? "orchestrator",
    to: params.agentId,
    role: params.role,
    type: "task",
    title: `${params.label} registered`,
    payload: {
      agentId: params.agentId,
      label: params.label,
      ...(params.description ? { description: params.description } : {}),
      ...(params.objective ? { objective: params.objective } : {}),
      status: params.status ?? "pending",
      ...(params.executionMode ? { executionMode: params.executionMode } : {}),
    },
  });
}

export function updateAcpAgentStatus(params: {
  conversationId: string;
  agentId: string;
  role: AcpAgentRole;
  label: string;
  description?: string;
  objective?: string;
  status: AcpAgentStatus;
  executionMode?: "sequential" | "parallel";
  result?: AcpSubAgentResult;
  errorMessage?: string;
  from?: string;
}) {
  const now = new Date().toISOString();
  upsertAcpAgentState(getDb(), {
    conversationId: params.conversationId,
    agentId: params.agentId,
    role: params.role,
    label: params.label,
    description: params.description,
    objective: params.objective,
    status: params.status,
    executionMode: params.executionMode,
    result: params.result,
    ...(params.status === "running" ? { startedAt: now } : {}),
    ...(params.status === "completed" ||
    params.status === "error" ||
    params.status === "cancelled"
      ? { completedAt: now }
      : {}),
  });
  appendMessage({
    conversationId: params.conversationId,
    from: params.from ?? params.agentId,
    role: params.role,
    type:
      params.status === "error"
        ? "error"
        : params.status === "completed"
          ? "result"
          : "status",
    title: `${params.label} ${params.status}`,
    payload: {
      agentId: params.agentId,
      status: params.status,
      // errorMessage is only meaningful for error status — guard against misuse
      ...(params.status === "error" && params.errorMessage
        ? { errorMessage: params.errorMessage }
        : {}),
      ...(params.result ? { result: params.result } : {}),
    },
  });
}
