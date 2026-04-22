export type AcpAgentRole =
  | "orchestrator"
  | "planner"
  | "coder"
  | "reviewer"
  | "memory"
  | "channel-adapter"
  | "summarizer"
  | "custom";

export type AcpMessageType =
  | "task"
  | "status"
  | "result"
  | "error"
  | "note";

export type AcpAgentStatus =
  | "pending"
  | "queued"
  | "running"
  | "completed"
  | "error"
  | "cancelled";

export type AcpTaskStatus =
  | "pending"
  | "in-progress"
  | "completed"
  | "error";

export type AcpJsonValue =
  | string
  | number
  | boolean
  | null
  | AcpJsonValue[]
  | { [key: string]: AcpJsonValue };

export type AcpTask = {
  id: string;
  title: string;
  description?: string;
  status: AcpTaskStatus;
  order: number;
  completedAt?: string;
  errorMessage?: string;
};

export type AcpTaskList = {
  id: string;
  title: string;
  description?: string;
  tasks: AcpTask[];
  createdAt: string;
  completedAt?: string;
};

export type AcpSubAgentResult = {
  summary?: string;
  outputText?: string;
  outputJson?: AcpJsonValue;
  errorMessage?: string;
  producedFiles?: string[];
};

export type AcpTimelineEntry = {
  id: string;
  conversationId: string;
  threadId: string;
  from: string;
  to: string | null;
  role: AcpAgentRole;
  type: AcpMessageType;
  title: string | null;
  payload: AcpJsonValue;
  createdAt: string;
  updatedAt: string;
};

export type AcpAgentState = {
  id: string;
  role: AcpAgentRole;
  label: string;
  description?: string;
  objective?: string;
  status: AcpAgentStatus;
  executionMode?: "sequential" | "parallel";
  result?: AcpSubAgentResult;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
};

export type AcpConversationState = {
  conversationId: string;
  threadId: string;
  timeline: AcpTimelineEntry[];
  orchestratorTaskList: AcpTaskList | null;
  previousOrchestratorTaskLists: AcpTaskList[];
  subAgents: Array<
    AcpAgentState & {
      taskList: AcpTaskList | null;
      previousTaskLists: AcpTaskList[];
      errorMessage?: string;
    }
  >;
};
