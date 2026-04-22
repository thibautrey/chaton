import crypto from "node:crypto";

import type Database from "better-sqlite3";

import type {
  AcpAgentRole,
  AcpAgentState,
  AcpAgentStatus,
  AcpConversationState,
  AcpJsonValue,
  AcpMessageType,
  AcpSubAgentResult,
  AcpTaskList,
  AcpTaskStatus,
  AcpTimelineEntry,
} from "./types.js";

type DbAcpMessageRow = {
  id: string;
  conversation_id: string;
  thread_id: string;
  from_agent: string;
  to_agent: string | null;
  agent_role: string;
  message_type: string;
  title: string | null;
  payload_json: string;
  created_at: string;
  updated_at: string;
};

type DbAcpAgentRow = {
  conversation_id: string;
  agent_id: string;
  role: string;
  label: string;
  description: string | null;
  objective: string | null;
  status: string;
  execution_mode: string | null;
  result_json: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

type DbAcpTaskListRow = {
  conversation_id: string;
  task_list_id: string;
  owner_kind: string;
  owner_agent_id: string;
  title: string;
  description: string | null;
  tasks_json: string;
  is_current: number;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
};

function parseJsonValue(value: string | null): AcpJsonValue | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as AcpJsonValue;
  } catch {
    return undefined;
  }
}

function parseTaskList(row: DbAcpTaskListRow): AcpTaskList {
  const tasks = parseJsonValue(row.tasks_json);
  return {
    id: row.task_list_id,
    title: row.title,
    ...(row.description ? { description: row.description } : {}),
    tasks: Array.isArray(tasks) ? (tasks as AcpTaskList["tasks"]) : [],
    createdAt: row.created_at,
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
  };
}

function mapAgentRow(row: DbAcpAgentRow): AcpAgentState {
  const result = parseJsonValue(row.result_json);
  return {
    id: row.agent_id,
    role: row.role as AcpAgentRole,
    label: row.label,
    ...(row.description ? { description: row.description } : {}),
    ...(row.objective ? { objective: row.objective } : {}),
    status: row.status as AcpAgentStatus,
    ...(row.execution_mode === "sequential" || row.execution_mode === "parallel"
      ? { executionMode: row.execution_mode }
      : {}),
    ...(result && typeof result === "object" && !Array.isArray(result)
      ? { result: result as AcpSubAgentResult }
      : {}),
    createdAt: row.created_at,
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
  };
}

export function recordAcpMessage(
  db: Database.Database,
  params: {
    id?: string;
    conversationId: string;
    threadId?: string;
    from: string;
    to?: string | null;
    role: AcpAgentRole;
    type: AcpMessageType;
    title?: string | null;
    payload?: AcpJsonValue;
    createdAt?: string;
  },
): AcpTimelineEntry {
  const now = params.createdAt ?? new Date().toISOString();
  const entry: AcpTimelineEntry = {
    id: params.id ?? crypto.randomUUID(),
    conversationId: params.conversationId,
    threadId: params.threadId ?? params.conversationId,
    from: params.from,
    to: params.to ?? null,
    role: params.role,
    type: params.type,
    title: params.title ?? null,
    payload: params.payload ?? null,
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(
    `INSERT INTO acp_messages(
      id, conversation_id, thread_id, from_agent, to_agent, agent_role,
      message_type, title, payload_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.id,
    entry.conversationId,
    entry.threadId,
    entry.from,
    entry.to,
    entry.role,
    entry.type,
    entry.title,
    JSON.stringify(entry.payload),
    entry.createdAt,
    entry.updatedAt,
  );

  return entry;
}

export function upsertAcpAgentState(
  db: Database.Database,
  params: {
    conversationId: string;
    agentId: string;
    role: AcpAgentRole;
    label: string;
    description?: string;
    objective?: string;
    status: AcpAgentStatus;
    executionMode?: "sequential" | "parallel";
    result?: AcpSubAgentResult;
    createdAt?: string;
    startedAt?: string;
    completedAt?: string;
  },
): void {
  const existing = db
    .prepare(
      `SELECT * FROM acp_agent_states WHERE conversation_id = ? AND agent_id = ?`,
    )
    .get(params.conversationId, params.agentId) as DbAcpAgentRow | undefined;
  const now = new Date().toISOString();
  const createdAt = params.createdAt ?? existing?.created_at ?? now;
  const startedAt = params.startedAt ?? existing?.started_at ?? null;
  const completedAt = params.completedAt ?? existing?.completed_at ?? null;
  const label = params.label.trim();

  db.prepare(
    `INSERT INTO acp_agent_states(
      conversation_id, agent_id, role, label, description, objective, status,
      execution_mode, result_json, created_at, started_at, completed_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(conversation_id, agent_id) DO UPDATE SET
      role = excluded.role,
      label = excluded.label,
      description = excluded.description,
      objective = excluded.objective,
      status = excluded.status,
      execution_mode = excluded.execution_mode,
      result_json = excluded.result_json,
      started_at = COALESCE(excluded.started_at, acp_agent_states.started_at),
      completed_at = COALESCE(excluded.completed_at, acp_agent_states.completed_at),
      updated_at = excluded.updated_at`,
  ).run(
    params.conversationId,
    params.agentId,
    params.role,
    label,
    params.description ?? existing?.description ?? null,
    params.objective ?? existing?.objective ?? null,
    params.status,
    params.executionMode ?? existing?.execution_mode ?? null,
    params.result ? JSON.stringify(params.result) : existing?.result_json ?? null,
    createdAt,
    startedAt,
    completedAt,
    now,
  );
}

export function saveAcpTaskList(
  db: Database.Database,
  params: {
    conversationId: string;
    ownerKind: "orchestrator" | "subagent";
    ownerAgentId: string;
    taskList: AcpTaskList;
  },
): void {
  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    db.prepare(
      `UPDATE acp_task_lists
       SET is_current = 0, updated_at = ?
       WHERE conversation_id = ? AND owner_kind = ? AND owner_agent_id = ? AND is_current = 1`,
    ).run(now, params.conversationId, params.ownerKind, params.ownerAgentId);

    db.prepare(
      `INSERT INTO acp_task_lists(
        conversation_id, task_list_id, owner_kind, owner_agent_id, title,
        description, tasks_json, is_current, created_at, completed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT(conversation_id, task_list_id) DO UPDATE SET
        owner_kind = excluded.owner_kind,
        owner_agent_id = excluded.owner_agent_id,
        title = excluded.title,
        description = excluded.description,
        tasks_json = excluded.tasks_json,
        is_current = excluded.is_current,
        completed_at = excluded.completed_at,
        updated_at = excluded.updated_at`,
    ).run(
      params.conversationId,
      params.taskList.id,
      params.ownerKind,
      params.ownerAgentId,
      params.taskList.title,
      params.taskList.description ?? null,
      JSON.stringify(params.taskList.tasks),
      params.taskList.createdAt,
      params.taskList.completedAt ?? null,
      now,
    );
  });

  transaction();
}

export function updateAcpTaskStatus(
  db: Database.Database,
  params: {
    conversationId: string;
    ownerKind: "orchestrator" | "subagent";
    ownerAgentId: string;
    taskId: string;
    status: AcpTaskStatus;
    errorMessage?: string;
  },
): boolean {
  const row = db
    .prepare(
      `SELECT * FROM acp_task_lists
       WHERE conversation_id = ? AND owner_kind = ? AND owner_agent_id = ? AND is_current = 1
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(
      params.conversationId,
      params.ownerKind,
      params.ownerAgentId,
    ) as DbAcpTaskListRow | undefined;
  if (!row) return false;

  const taskList = parseTaskList(row);
  let changed = false;
  const now = new Date().toISOString();
  const nextTasks = taskList.tasks.map((task) => {
    if (task.id !== params.taskId) return task;
    changed = true;
    return {
      ...task,
      status: params.status,
      ...(params.status === "completed" ? { completedAt: now } : {}),
      ...(params.status === "error" && params.errorMessage
        ? { errorMessage: params.errorMessage }
        : {}),
    };
  });
  if (!changed) return false;

  const allDone = nextTasks.every(
    (task) => task.status === "completed" || task.status === "error",
  );
  db.prepare(
    `UPDATE acp_task_lists
     SET tasks_json = ?, completed_at = ?, updated_at = ?
     WHERE conversation_id = ? AND task_list_id = ?`,
  ).run(
    JSON.stringify(nextTasks),
    allDone ? now : row.completed_at,
    now,
    params.conversationId,
    row.task_list_id,
  );
  return true;
}

export function listAcpTimeline(
  db: Database.Database,
  conversationId: string,
): AcpTimelineEntry[] {
  const rows = db
    .prepare(
      `SELECT * FROM acp_messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC`,
    )
    .all(conversationId) as DbAcpMessageRow[];
  return rows.map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    threadId: row.thread_id,
    from: row.from_agent,
    to: row.to_agent,
    role: row.agent_role as AcpAgentRole,
    type: row.message_type as AcpMessageType,
    title: row.title,
    payload: parseJsonValue(row.payload_json) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function getAcpConversationState(
  db: Database.Database,
  conversationId: string,
): AcpConversationState {
  const threadId =
    (db
      .prepare(
        `SELECT thread_id FROM acp_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 1`,
      )
      .get(conversationId) as { thread_id: string } | undefined)?.thread_id ??
    conversationId;

  const timeline = listAcpTimeline(db, conversationId);
  const agentRows = db
    .prepare(
      `SELECT * FROM acp_agent_states WHERE conversation_id = ? ORDER BY created_at ASC, updated_at ASC`,
    )
    .all(conversationId) as DbAcpAgentRow[];
  const taskRows = db
    .prepare(
      `SELECT * FROM acp_task_lists WHERE conversation_id = ? ORDER BY created_at DESC, updated_at DESC`,
    )
    .all(conversationId) as DbAcpTaskListRow[];

  const orchestratorCurrent =
    taskRows.find(
      (row) =>
        row.owner_kind === "orchestrator" &&
        row.owner_agent_id === "orchestrator" &&
        row.is_current === 1,
    ) ?? null;
  const previousOrchestratorTaskLists = taskRows
    .filter(
      (row) =>
        row.owner_kind === "orchestrator" &&
        row.owner_agent_id === "orchestrator" &&
        row.is_current === 0,
    )
    .map(parseTaskList);

  const subAgents = agentRows
    .filter((row) => row.role !== "orchestrator")
    .map((row) => {
      const currentTaskRow =
        taskRows.find(
          (taskRow) =>
            taskRow.owner_kind === "subagent" &&
            taskRow.owner_agent_id === row.agent_id &&
            taskRow.is_current === 1,
        ) ?? null;
      const previousTaskRows = taskRows
        .filter(
          (taskRow) =>
            taskRow.owner_kind === "subagent" &&
            taskRow.owner_agent_id === row.agent_id &&
            taskRow.is_current === 0,
        )
        .map(parseTaskList);
      const result = parseJsonValue(row.result_json);
      const errorMessage =
        result &&
        typeof result === "object" &&
        !Array.isArray(result) &&
        typeof (result as Record<string, unknown>).errorMessage === "string"
          ? String((result as Record<string, unknown>).errorMessage)
          : undefined;

      return {
        ...mapAgentRow(row),
        ...(errorMessage ? { errorMessage } : {}),
        taskList: currentTaskRow ? parseTaskList(currentTaskRow) : null,
        previousTaskLists: previousTaskRows,
      };
    });

  return {
    conversationId,
    threadId,
    timeline,
    orchestratorTaskList: orchestratorCurrent
      ? parseTaskList(orchestratorCurrent)
      : null,
    previousOrchestratorTaskLists,
    subAgents,
  };
}
