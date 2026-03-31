/**
 * Core conversation tools: task lists, sub-agents, action suggestions,
 * access mode, and runtime commands.
 *
 * These are first-class Pi tools registered directly on every session,
 * not routed through the extension system.
 */

import electron from "electron";
const { app } = electron;
import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { ModelRegistry, SettingsManager } from "@mariozechner/pi-coding-agent";
import type { Api, Model } from "@mariozechner/pi-ai";
import { getDb } from "./db/index.js";
import { findConversationById } from "./db/repos/conversations.js";
import { piSessionRuntimeManager } from "./pi-runtime-singleton.js";
import {
  listHarnessCandidates as listStoredHarnessCandidates,
  markActiveCandidateInSummaries,
  readActiveCandidate,
  readFrontier,
  writeActiveCandidate,
} from "./meta-harness/archive.js";
import {
  ensureCandidateStored,
  getDefaultHarnessCandidate,
  loadHarnessCandidate,
  validateHarnessCandidate,
} from "./meta-harness/candidate.js";
import { buildDefaultBenchmark } from "./meta-harness/benchmark.js";
import { evaluateHarnessCandidate } from "./meta-harness/evaluator.js";
import type { HarnessCandidate } from "./meta-harness/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type EmitUiRequest = (
  method: string,
  payload: Record<string, unknown>,
) => string;

type SubagentExecutionMode = "sequential" | "parallel";

function textResult(data: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(data, null, 2) },
    ],
    details: { ok: true, data },
  };
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    details: { ok: false, error: message },
    isError: true,
  };
}

function getAgentDirFromElectronUserData() {
  return `${app.getPath("userData")}/.pi/agent`;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build the set of core tools for a single Pi session.
 *
 * @param conversationId - the owning conversation
 * @param emitUiRequest  - bound reference to PiSdkRuntime.emitExtensionUiRequest
 * @param settingsManager - Pi settings manager for accessing scoped models
 * @param modelRegistry  - Pi model registry for accessing providers and models
 * @param harnessCandidate - Optional harness candidate configuration for policy enforcement
 */
export function createCoreTools(
  conversationId: string,
  emitUiRequest: EmitUiRequest,
  settingsManager?: SettingsManager,
  modelRegistry?: ModelRegistry,
  harnessCandidate?: HarnessCandidate | null,
): ToolDefinition[] {
  const agentDir = getAgentDirFromElectronUserData();
  // ---- create_task_list ----
  const createTaskList: ToolDefinition = {
    name: "create_task_list",
    label: "Create task list",
    description:
      "Create a task list displayed in the side panel to break down complex work into visible steps. Each task starts as pending. The panel opens automatically.",
    parameters: Type.Object({
      title: Type.String({
        description:
          'Title of the task list (e.g. "Implementing authentication")',
      }),
      tasks: Type.Array(
        Type.Object({
          title: Type.String({
            description: "Short actionable title for the task",
          }),
        }),
        { minItems: 1, description: "List of tasks to display" },
      ),
    }),
    execute: async (
      _toolCallId: string,
      params: { title: string; tasks: { title: string }[] },
    ) => {
      const title = (params.title ?? "").trim();
      const rawTasks = Array.isArray(params.tasks) ? params.tasks : [];

      if (!title) return errorResult("title is required");
      if (rawTasks.length === 0)
        return errorResult("at least one task is required");

      const now = Date.now();
      const taskListId = `task-list-${now}`;
      const tasks = rawTasks
        .filter(
          (t): t is { title: string } =>
            !!t && typeof t === "object" && typeof t.title === "string",
        )
        .map((t, i) => ({
          id: `${taskListId}-task-${i}`,
          title: t.title.trim(),
          status: "pending" as const,
          order: i,
        }))
        .filter((t) => t.title.length > 0);

      if (tasks.length === 0)
        return errorResult(
          "at least one valid task with a title is required",
        );

      const taskList = {
        id: taskListId,
        title,
        tasks,
        createdAt: new Date(now).toISOString(),
      };

      emitUiRequest("set_task_list", { taskList, conversationId });

      return textResult(taskList);
    },
  };

  // ---- update_task_status ----
  const updateTaskStatus: ToolDefinition = {
    name: "update_task_status",
    label: "Update task status",
    description:
      "Update the status of a task in the side panel task list. Call this as you start or finish each task.",
    parameters: Type.Object({
      taskId: Type.String({
        description:
          "The ID of the task to update (returned by create_task_list)",
      }),
      status: Type.Union(
        [
          Type.Literal("in-progress"),
          Type.Literal("completed"),
          Type.Literal("error"),
        ],
        { description: "New status for the task" },
      ),
      errorMessage: Type.Optional(
        Type.String({
          description: "Error description when status is error",
        }),
      ),
    }),
    execute: async (
      _toolCallId: string,
      params: { taskId: string; status: string; errorMessage?: string },
    ) => {
      const taskId = (params.taskId ?? "").trim();
      const status = (params.status ?? "").trim();
      const errorMessage =
        typeof params.errorMessage === "string"
          ? params.errorMessage.trim()
          : undefined;

      if (!taskId) return errorResult("taskId is required");
      if (
        !["pending", "in-progress", "completed", "error"].includes(status)
      )
        return errorResult(
          "status must be one of: pending, in-progress, completed, error",
        );

      emitUiRequest("update_task_status", {
        taskId,
        status,
        errorMessage,
        conversationId,
      });

      return textResult({ taskId, status });
    },
  };

  // ---- display_action_suggestions ----
  const displayActionSuggestions: ToolDefinition = {
    name: "display_action_suggestions",
    label: "Display action suggestions",
    description:
      "Display a choice menu of action badges in the composer for the user to click. Useful for guiding users through decisions without requiring typed input.",
    parameters: Type.Object({
      suggestions: Type.Array(
        Type.Object({
          label: Type.String({
            description: "Short button text (recommended max 30 chars)",
            maxLength: 50,
          }),
          message: Type.String({
            description:
              "The message to send when user clicks this action",
          }),
          id: Type.Optional(
            Type.String({
              description:
                "Optional unique ID for this suggestion (auto-generated if omitted)",
            }),
          ),
        }),
        {
          minItems: 1,
          maxItems: 4,
          description:
            "Array of action suggestions to display (max 4 for UI fit)",
        },
      ),
    }),
    execute: async (
      _toolCallId: string,
      params: {
        suggestions: {
          label: string;
          message: string;
          id?: string;
        }[];
      },
    ) => {
      const suggestions = Array.isArray(params.suggestions)
        ? params.suggestions
        : [];

      const validated = suggestions
        .filter(
          (s): s is { label: string; message: string; id?: string } =>
            !!s && typeof s === "object" && !Array.isArray(s),
        )
        .slice(0, 4)
        .map((s, i) => ({
          id:
            typeof s.id === "string" && s.id.trim()
              ? s.id.trim()
              : `action_${i}`,
          label:
            typeof s.label === "string"
              ? s.label.trim().slice(0, 50)
              : `Option ${i + 1}`,
          message:
            typeof s.message === "string" ? s.message.trim() : "",
        }))
        .filter((s) => s.label.length > 0 && s.message.length > 0);

      if (validated.length === 0)
        return errorResult(
          "at least one valid suggestion with label and message is required",
        );

      emitUiRequest("set_thread_actions", { actions: validated });

      return textResult({
        count: validated.length,
        suggestions: validated,
      });
    },
  };

  // ---- register_subagent ----
  const registerSubagent: ToolDefinition = {
    name: "register_subagent",
    label: "Register subagent",
    description:
      "Register a subagent in the side panel so the conversation can track delegated work in a dedicated section.",
    parameters: Type.Object({
      subAgentId: Type.String({
        description: "Unique identifier for the subagent",
      }),
      label: Type.String({
        description: "Short human-readable subagent label",
      }),
      description: Type.Optional(
        Type.String({
          description:
            "Optional short description of the delegated work",
        }),
      ),
    }),
    execute: async (
      _toolCallId: string,
      params: {
        subAgentId: string;
        label: string;
        description?: string;
      },
    ) => {
      const subAgentId = (params.subAgentId ?? "").trim();
      const label = (params.label ?? "").trim();
      const description =
        typeof params.description === "string"
          ? params.description.trim()
          : undefined;

      if (!subAgentId) return errorResult("subAgentId is required");
      if (!label) return errorResult("label is required");

      emitUiRequest("register_subagent", {
        subAgent: {
          id: subAgentId,
          name: label,
          description,
          status: "pending",
          taskList: null,
          previousTaskLists: [],
          createdAt: new Date().toISOString(),
        },
        conversationId,
      });

      return textResult({
        subAgentId,
        label,
        status: "pending",
        description: description ?? null,
      });
    },
  };

  // ---- update_subagent_status ----
  const updateSubagentStatus: ToolDefinition = {
    name: "update_subagent_status",
    label: "Update subagent status",
    description:
      "Update a registered subagent status in the side panel.",
    parameters: Type.Object({
      subAgentId: Type.String({
        description: "The registered subagent identifier",
      }),
      status: Type.Union(
        [
          Type.Literal("pending"),
          Type.Literal("queued"),
          Type.Literal("running"),
          Type.Literal("completed"),
          Type.Literal("error"),
          Type.Literal("cancelled"),
        ],
        { description: "New subagent status" },
      ),
      errorMessage: Type.Optional(
        Type.String({
          description: "Optional error details when status is error",
        }),
      ),
    }),
    execute: async (
      _toolCallId: string,
      params: {
        subAgentId: string;
        status: string;
        errorMessage?: string;
      },
    ) => {
      const subAgentId = (params.subAgentId ?? "").trim();
      const status = (params.status ?? "").trim();
      const errorMessage =
        typeof params.errorMessage === "string"
          ? params.errorMessage.trim()
          : undefined;

      if (!subAgentId) return errorResult("subAgentId is required");
      if (
        !["pending", "queued", "running", "completed", "error", "cancelled"].includes(status)
      )
        return errorResult(
          "status must be one of: pending, queued, running, completed, error, cancelled",
        );

      emitUiRequest("update_subagent_status", {
        subAgentId,
        status,
        errorMessage,
        conversationId,
      });

      return textResult({
        subAgentId,
        status,
        errorMessage: errorMessage ?? null,
      });
    },
  };

  // ---- set_subagent_task_list ----
  const setSubagentTaskList: ToolDefinition = {
    name: "set_subagent_task_list",
    label: "Set subagent task list",
    description:
      "Create or replace the task list displayed under a registered subagent in the side panel.",
    parameters: Type.Object({
      subAgentId: Type.String({
        description: "The registered subagent identifier",
      }),
      title: Type.String({ description: "Task list title" }),
      tasks: Type.Array(
        Type.Object({
          title: Type.String({
            description: "Short actionable task title",
          }),
        }),
        {
          minItems: 1,
          description: "List of tasks to display for this subagent",
        },
      ),
    }),
    execute: async (
      _toolCallId: string,
      params: {
        subAgentId: string;
        title: string;
        tasks: { title: string }[];
      },
    ) => {
      const subAgentId = (params.subAgentId ?? "").trim();
      const title = (params.title ?? "").trim();
      const rawTasks = Array.isArray(params.tasks) ? params.tasks : [];

      if (!subAgentId) return errorResult("subAgentId is required");
      if (!title) return errorResult("title is required");
      if (rawTasks.length === 0)
        return errorResult("at least one task is required");

      const now = Date.now();
      const taskListId = `subagent-task-list-${subAgentId}-${now}`;
      const tasks = rawTasks
        .filter(
          (t): t is { title: string } =>
            !!t && typeof t === "object" && typeof t.title === "string",
        )
        .map((t, i) => ({
          id: `${taskListId}-task-${i}`,
          title: t.title.trim(),
          status: "pending" as const,
          order: i,
        }))
        .filter((t) => t.title.length > 0);

      if (tasks.length === 0)
        return errorResult(
          "at least one valid task with a title is required",
        );

      const taskList = {
        id: taskListId,
        title,
        tasks,
        createdAt: new Date(now).toISOString(),
      };

      emitUiRequest("set_subagent_task_list", {
        subAgentId,
        taskList,
        conversationId,
      });

      return textResult({ subAgentId, taskList });
    },
  };

  // ---- update_subagent_task_status ----
  const updateSubagentTaskStatus: ToolDefinition = {
    name: "update_subagent_task_status",
    label: "Update subagent task status",
    description:
      "Update the status of a task inside a registered subagent task list.",
    parameters: Type.Object({
      subAgentId: Type.String({
        description: "The registered subagent identifier",
      }),
      taskId: Type.String({
        description:
          "The task identifier returned by set_subagent_task_list",
      }),
      status: Type.Union(
        [
          Type.Literal("pending"),
          Type.Literal("running"),
          Type.Literal("completed"),
          Type.Literal("error"),
        ],
        { description: "New task status" },
      ),
      errorMessage: Type.Optional(
        Type.String({
          description: "Optional error details when status is error",
        }),
      ),
    }),
    execute: async (
      _toolCallId: string,
      params: {
        subAgentId: string;
        taskId: string;
        status: string;
        errorMessage?: string;
      },
    ) => {
      const subAgentId = (params.subAgentId ?? "").trim();
      const taskId = (params.taskId ?? "").trim();
      const status = (params.status ?? "").trim();
      const errorMessage =
        typeof params.errorMessage === "string"
          ? params.errorMessage.trim()
          : undefined;

      if (!subAgentId) return errorResult("subAgentId is required");
      if (!taskId) return errorResult("taskId is required");
      if (
        !["pending", "running", "completed", "error"].includes(status)
      )
        return errorResult(
          "status must be one of: pending, running, completed, error",
        );

      emitUiRequest("update_subagent_task_status", {
        subAgentId,
        taskId,
        status,
        errorMessage,
        conversationId,
      });

      return textResult({
        subAgentId,
        taskId,
        status,
        errorMessage: errorMessage ?? null,
      });
    },
  };

  // ---- spawn_subagent ----
  const spawnSubagent: ToolDefinition = {
    name: "spawn_subagent",
    label: "Spawn subagent",
    description:
      "Create and start a real runtime-backed subagent session. Returns the subagent ID and runtime conversation ID for later orchestration.",
    parameters: Type.Object({
      label: Type.String({ description: "Short subagent label" }),
      description: Type.Optional(Type.String({ description: "Optional description" })),
      objective: Type.String({ description: "Main objective for the subagent" }),
      instructions: Type.Optional(
        Type.String({ description: "Optional task-specific instructions" }),
      ),
      executionMode: Type.Optional(
        Type.Union([Type.Literal("sequential"), Type.Literal("parallel")]),
      ),
      fileScope: Type.Optional(
        Type.Object({
          mode: Type.Union([Type.Literal("all"), Type.Literal("allowlist")]),
          paths: Type.Optional(Type.Array(Type.String())),
        }),
      ),
      toolPolicy: Type.Optional(
        Type.Object({
          readOnly: Type.Optional(Type.Boolean()),
          allowedTools: Type.Optional(Type.Array(Type.String())),
          deniedTools: Type.Optional(Type.Array(Type.String())),
        }),
      ),
    }),
    execute: async (
      _toolCallId: string,
      params: {
        label: string;
        description?: string;
        objective: string;
        instructions?: string;
        executionMode?: SubagentExecutionMode;
        fileScope?: { mode: 'all' | 'allowlist'; paths?: string[] };
        toolPolicy?: { readOnly?: boolean; allowedTools?: string[]; deniedTools?: string[] };
      },
    ) => {
      const label = (params.label ?? "").trim();
      const objective = (params.objective ?? "").trim();
      const description =
        typeof params.description === "string" ? params.description.trim() : undefined;
      const instructions =
        typeof params.instructions === "string" ? params.instructions.trim() : undefined;
      const executionMode = params.executionMode ?? "sequential";
      const fileScope = params.fileScope;
      const toolPolicy = params.toolPolicy;

      if (!label) return errorResult("label is required");
      if (!objective) return errorResult("objective is required");

      // Check subagent policy from harness configuration
      const subagentPolicy = harnessCandidate?.tools?.subagentPolicy;
      if (subagentPolicy === "restrict") {
        return errorResult(
          "Subagent use is restricted by the active harness policy. " +
            "Prefer solving the task in the main runtime. " +
            "If delegation is clearly required, consider using the main runtime with task lists instead."
        );
      }

      const spawned = await piSessionRuntimeManager.spawnRuntimeSubagent({
        conversationId,
        label,
        description,
        objective,
        instructions,
        executionMode,
        fileScope,
        toolPolicy,
      });

      if (!spawned.ok) return errorResult(spawned.message);

      return textResult({
        subAgentId: spawned.subAgentId,
        runtimeConversationId: spawned.runtimeConversationId,
        executionMode,
      });
    },
  };

  // ---- run_subagent ----
  const runSubagent: ToolDefinition = {
    name: "run_subagent",
    label: "Run subagent",
    description:
      "Execute a previously spawned runtime subagent and wait for its completion.",
    parameters: Type.Object({
      subAgentId: Type.String({ description: "Subagent identifier returned by spawn_subagent" }),
      prompt: Type.Optional(Type.String({ description: "Optional override prompt for the subagent run" })),
    }),
    execute: async (
      _toolCallId: string,
      params: { subAgentId: string; prompt?: string },
    ) => {
      const subAgentId = (params.subAgentId ?? "").trim();
      const prompt = typeof params.prompt === "string" ? params.prompt.trim() : undefined;
      if (!subAgentId) return errorResult("subAgentId is required");

      const result = await piSessionRuntimeManager.runRuntimeSubagent({
        subAgentId,
        prompt,
      });
      if (!result.ok) return errorResult(result.message);
      return textResult({ subAgentId, result: result.result });
    },
  };

  // ---- await_subagent ----
  const awaitSubagent: ToolDefinition = {
    name: "await_subagent",
    label: "Await subagent",
    description:
      "Wait for a runtime subagent to finish, optionally with a timeout.",
    parameters: Type.Object({
      subAgentId: Type.String({ description: "Subagent identifier returned by spawn_subagent" }),
      timeoutMs: Type.Optional(Type.Number({ minimum: 1 })),
    }),
    execute: async (
      _toolCallId: string,
      params: { subAgentId: string; timeoutMs?: number },
    ) => {
      const subAgentId = (params.subAgentId ?? "").trim();
      if (!subAgentId) return errorResult("subAgentId is required");
      const awaited = await piSessionRuntimeManager.awaitRuntimeSubagent(
        subAgentId,
        typeof params.timeoutMs === "number" ? params.timeoutMs : undefined,
      );
      if (!awaited.ok) return errorResult(awaited.message);
      return textResult({ subAgentId, ...awaited });
    },
  };

  // ---- await_subagents ----
  const awaitSubagents: ToolDefinition = {
    name: "await_subagents",
    label: "Await subagents",
    description:
      "Wait for multiple runtime subagents to finish, either until all are done or until any one completes.",
    parameters: Type.Object({
      subAgentIds: Type.Array(Type.String(), { minItems: 1 }),
      mode: Type.Optional(
        Type.Union([Type.Literal("all"), Type.Literal("any")]),
      ),
      timeoutMs: Type.Optional(Type.Number({ minimum: 1 })),
    }),
    execute: async (
      _toolCallId: string,
      params: { subAgentIds: string[]; mode?: 'all' | 'any'; timeoutMs?: number },
    ) => {
      const subAgentIds = Array.isArray(params.subAgentIds)
        ? params.subAgentIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        : [];
      if (subAgentIds.length === 0) return errorResult('at least one subAgentId is required');
      const mode = params.mode === 'any' ? 'any' : 'all';
      const timeoutMs = typeof params.timeoutMs === 'number' ? params.timeoutMs : undefined;
      const awaited = await piSessionRuntimeManager.awaitRuntimeSubagents({ subAgentIds, mode, timeoutMs });
      if (!awaited.ok) return errorResult(awaited.message);
      return textResult(awaited);
    },
  };

  // ---- cancel_subagent ----
  const cancelSubagent: ToolDefinition = {
    name: "cancel_subagent",
    label: "Cancel subagent",
    description:
      "Cancel a runtime subagent if it is pending, queued, or running.",
    parameters: Type.Object({
      subAgentId: Type.String({ description: "Subagent identifier returned by spawn_subagent" }),
    }),
    execute: async (_toolCallId: string, params: { subAgentId: string }) => {
      const subAgentId = (params.subAgentId ?? "").trim();
      if (!subAgentId) return errorResult("subAgentId is required");
      const cancelled = await piSessionRuntimeManager.cancelRuntimeSubagent(subAgentId);
      if (!cancelled.ok) return errorResult(cancelled.message);
      return textResult({ subAgentId, status: cancelled.status });
    },
  };

  // ---- set_subagent_result ----
  const setSubagentResult: ToolDefinition = {
    name: "set_subagent_result",
    label: "Set subagent result",
    description:
      "Attach a final result payload to a registered subagent so the orchestrator and UI can inspect it.",
    parameters: Type.Object({
      subAgentId: Type.String({
        description: "The registered subagent identifier",
      }),
      summary: Type.Optional(
        Type.String({
          description: "Short final summary for the subagent",
        }),
      ),
      outputText: Type.Optional(
        Type.String({
          description: "Optional detailed text output produced by the subagent",
        }),
      ),
      outputJson: Type.Optional(
        Type.Any({
          description: "Optional structured output produced by the subagent",
        }),
      ),
      producedFiles: Type.Optional(
        Type.Array(Type.String(), {
          description: "Optional list of files produced or modified by the subagent",
        }),
      ),
      errorMessage: Type.Optional(
        Type.String({
          description: "Optional error message to associate with the result",
        }),
      ),
    }),
    execute: async (
      _toolCallId: string,
      params: {
        subAgentId: string;
        summary?: string;
        outputText?: string;
        outputJson?: unknown;
        producedFiles?: string[];
        errorMessage?: string;
      },
    ) => {
      const subAgentId = (params.subAgentId ?? "").trim();
      if (!subAgentId) return errorResult("subAgentId is required");

      const result = {
        ...(typeof params.summary === "string" && params.summary.trim()
          ? { summary: params.summary.trim() }
          : {}),
        ...(typeof params.outputText === "string" && params.outputText.trim()
          ? { outputText: params.outputText.trim() }
          : {}),
        ...(params.outputJson !== undefined
          ? { outputJson: params.outputJson }
          : {}),
        ...(Array.isArray(params.producedFiles)
          ? {
              producedFiles: params.producedFiles.filter(
                (value): value is string =>
                  typeof value === "string" && value.trim().length > 0,
              ),
            }
          : {}),
        ...(typeof params.errorMessage === "string" && params.errorMessage.trim()
          ? { errorMessage: params.errorMessage.trim() }
          : {}),
      };

      emitUiRequest("set_subagent_result", {
        subAgentId,
        result,
        conversationId,
      });

      return textResult({ subAgentId, result });
    },
  };

  // ---- run_subagents ----
  const runSubagents: ToolDefinition = {
    name: "run_subagents",
    label: "Run subagents",
    description:
      "Spawn and execute real runtime subagents in sequential or parallel mode, then return their aggregated results to the orchestrator.",
    parameters: Type.Object({
      execution: Type.Object({
        mode: Type.Union([Type.Literal("sequential"), Type.Literal("parallel")]),
        maxConcurrency: Type.Optional(
          Type.Number({
            minimum: 1,
            description: "Optional parallelism cap when mode is parallel",
          }),
        ),
        failFast: Type.Optional(
          Type.Boolean({
            description: "If true, cancel remaining subagents after the first error",
          }),
        ),
      }),
      tasks: Type.Array(
        Type.Object({
          label: Type.String({ description: "Short subagent label" }),
          description: Type.Optional(Type.String({ description: "Optional description" })),
          objective: Type.String({ description: "Main task objective for the subagent" }),
          instructions: Type.Optional(
            Type.String({ description: "Optional task-specific instructions" }),
          ),
          fileScope: Type.Optional(
            Type.Object({
              mode: Type.Union([Type.Literal("all"), Type.Literal("allowlist")]),
              paths: Type.Optional(Type.Array(Type.String())),
            }),
          ),
          toolPolicy: Type.Optional(
            Type.Object({
              readOnly: Type.Optional(Type.Boolean()),
              allowedTools: Type.Optional(Type.Array(Type.String())),
              deniedTools: Type.Optional(Type.Array(Type.String())),
            }),
          ),
        }),
        { minItems: 1, description: "Subagent tasks to run" },
      ),
    }),
    execute: async (
      _toolCallId: string,
      params: {
        execution: { mode: SubagentExecutionMode; maxConcurrency?: number; failFast?: boolean };
        tasks: Array<{
          label: string;
          description?: string;
          objective: string;
          instructions?: string;
          fileScope?: { mode: 'all' | 'allowlist'; paths?: string[] };
          toolPolicy?: { readOnly?: boolean; allowedTools?: string[]; deniedTools?: string[] };
        }>;
      },
    ) => {
      const mode = params.execution?.mode;
      const maxConcurrency =
        typeof params.execution?.maxConcurrency === "number" &&
        Number.isFinite(params.execution.maxConcurrency)
          ? Math.max(1, Math.floor(params.execution.maxConcurrency))
          : undefined;
      const failFast = params.execution?.failFast === true;
      const tasks = Array.isArray(params.tasks) ? params.tasks : [];

      if (mode !== "sequential" && mode !== "parallel") {
        return errorResult("execution.mode must be sequential or parallel");
      }
      if (tasks.length === 0) {
        return errorResult("at least one subagent task is required");
      }

      const spawned = [] as Array<{
        subAgentId: string;
        runtimeConversationId: string;
        label: string;
      }>;

      for (const task of tasks) {
        const label = typeof task.label === "string" ? task.label.trim() : "";
        const objective = typeof task.objective === "string" ? task.objective.trim() : "";
        const description =
          typeof task.description === "string" && task.description.trim().length > 0
            ? task.description.trim()
            : undefined;
        const instructions =
          typeof task.instructions === "string" && task.instructions.trim().length > 0
            ? task.instructions.trim()
            : undefined;
        if (!label || !objective) continue;
        const result = await piSessionRuntimeManager.spawnRuntimeSubagent({
          conversationId,
          label,
          description,
          objective,
          instructions,
          executionMode: mode,
          fileScope: task.fileScope,
          toolPolicy: task.toolPolicy,
        });
        if (!result.ok) return errorResult(result.message);
        spawned.push({
          subAgentId: result.subAgentId,
          runtimeConversationId: result.runtimeConversationId,
          label,
        });
      }

      if (spawned.length === 0) {
        return errorResult("at least one valid subagent task is required");
      }

      const runOne = async (subAgentId: string) => {
        const result = await piSessionRuntimeManager.runRuntimeSubagent({ subAgentId });
        return { subAgentId, ...(result.ok ? { result: result.result, status: 'completed' } : { errorMessage: result.message, status: 'error' }) };
      };

      const results: Array<{ subAgentId: string; status: string; result?: unknown; errorMessage?: string }> = [];
      if (mode === 'sequential') {
        for (const item of spawned) {
          const result = await runOne(item.subAgentId);
          results.push(result);
          if (failFast && result.status === 'error') {
            break;
          }
        }
        if (failFast) {
          const completedIds = new Set(results.map((item) => item.subAgentId));
          for (const item of spawned) {
            if (!completedIds.has(item.subAgentId)) {
              await piSessionRuntimeManager.cancelRuntimeSubagent(item.subAgentId);
            }
          }
        }
      } else {
        const limit = maxConcurrency ?? spawned.length;
        let index = 0;
        let shouldStop = false;
        const workers = Array.from({ length: Math.min(limit, spawned.length) }, async () => {
          while (!shouldStop && index < spawned.length) {
            const current = spawned[index++];
            const result = await runOne(current.subAgentId);
            results.push(result);
            if (failFast && result.status === 'error') {
              shouldStop = true;
            }
          }
        });
        await Promise.all(workers);
        if (failFast && results.some((item) => item.status === 'error')) {
          const completedIds = new Set(results.map((item) => item.subAgentId));
          await Promise.all(
            spawned
              .filter((item) => !completedIds.has(item.subAgentId))
              .map((item) => piSessionRuntimeManager.cancelRuntimeSubagent(item.subAgentId)),
          );
        }
      }

      return textResult({
        execution: {
          mode,
          maxConcurrency: mode === 'parallel' ? maxConcurrency ?? spawned.length : 1,
          failFast,
        },
        subagents: spawned,
        results,
      });
    },
  };

  // ---- get_access_mode ----
  const getAccessMode: ToolDefinition = {
    name: "get_access_mode",
    label: "Get access mode",
    description:
      "Return the current conversation access mode so the agent can verify whether filesystem access is secure or open.",
    parameters: Type.Object({}),
    execute: async () => {
      const db = getDb();
      const conversation = findConversationById(db, conversationId);
      const accessMode =
        conversation?.access_mode === "open" ? "open" : "secure";
      return textResult({ accessMode });
    },
  };

  // ---- get_commands ----
  // ---- meta-harness tools ----
  const listMetaHarnessCandidates: ToolDefinition = {
    name: "meta_harness_list_candidates",
    label: "List meta-harness candidates",
    description:
      "List stored Meta-Harness candidates and their latest known scores for a benchmark.",
    parameters: Type.Object({
      benchmarkId: Type.Optional(Type.String({ description: "Optional benchmark identifier" })),
    }),
    execute: async (_toolCallId: string, params: { benchmarkId?: string }) => {
      const benchmarkId =
        typeof params.benchmarkId === "string" && params.benchmarkId.trim().length > 0
          ? params.benchmarkId.trim()
          : buildDefaultBenchmark().id;
      const summaries = markActiveCandidateInSummaries(
        agentDir,
        listStoredHarnessCandidates(agentDir, benchmarkId),
      );
      return textResult({
        benchmarkId,
        activeCandidateId: readActiveCandidate(agentDir) ?? getDefaultHarnessCandidate().id,
        candidates: summaries,
      });
    },
  };

  const getMetaHarnessFrontier: ToolDefinition = {
    name: "meta_harness_get_frontier",
    label: "Get meta-harness frontier",
    description:
      "List the current ranked frontier for a benchmark from the Meta-Harness archive.",
    parameters: Type.Object({
      benchmarkId: Type.Optional(Type.String({ description: "Optional benchmark identifier" })),
    }),
    execute: async (_toolCallId: string, params: { benchmarkId?: string }) => {
      const benchmarkId =
        typeof params.benchmarkId === "string" && params.benchmarkId.trim().length > 0
          ? params.benchmarkId.trim()
          : buildDefaultBenchmark().id;
      return textResult({ benchmarkId, frontier: readFrontier(agentDir, benchmarkId) });
    },
  };

  const setMetaHarnessActiveCandidate: ToolDefinition = {
    name: "meta_harness_set_active_candidate",
    label: "Set active meta-harness candidate",
    description:
      "Promote a stored Meta-Harness candidate so new local runtimes use it by default.",
    parameters: Type.Object({
      candidateId: Type.String({ description: "Candidate identifier to activate" }),
    }),
    execute: async (_toolCallId: string, params: { candidateId: string }) => {
      const candidateId = (params.candidateId ?? "").trim();
      if (!candidateId) return errorResult("candidateId is required");
      loadHarnessCandidate(agentDir, candidateId);
      writeActiveCandidate(agentDir, candidateId);
      return textResult({ candidateId, active: true });
    },
  };

  const createMetaHarnessCandidate: ToolDefinition = {
    name: "meta_harness_create_candidate",
    label: "Create meta-harness candidate",
    description:
      "Validate and store a typed Meta-Harness candidate in the managed archive.",
    parameters: Type.Object({
      candidate: Type.Any({ description: "Candidate payload to validate and store" }),
    }),
    execute: async (_toolCallId: string, params: { candidate: unknown }) => {
      const validated = validateHarnessCandidate(params.candidate);
      if (!validated.ok) {
        return errorResult(`invalid candidate: ${validated.errors.join(", ")}`);
      }
      ensureCandidateStored(agentDir, validated.value);
      return textResult({ candidate: validated.value, stored: true });
    },
  };

  const evaluateMetaHarnessCandidate: ToolDefinition = {
    name: "meta_harness_evaluate_candidate",
    label: "Evaluate meta-harness candidate",
    description:
      "Run a narrow benchmark against a Meta-Harness candidate and store scores plus traces in the archive.",
    parameters: Type.Object({
      candidateId: Type.String({ description: "Stored candidate identifier" }),
      benchmarkId: Type.Optional(Type.String({ description: "Optional benchmark identifier override" })),
      workspaceRoot: Type.Optional(Type.String({ description: "Optional workspace root used for benchmark tasks" })),
    }),
    execute: async (
      _toolCallId: string,
      params: { candidateId: string; benchmarkId?: string; workspaceRoot?: string },
    ) => {
      const candidateId = (params.candidateId ?? "").trim();
      if (!candidateId) return errorResult("candidateId is required");
      const candidate = loadHarnessCandidate(agentDir, candidateId);
      const db = getDb();
      const conversation = findConversationById(db, conversationId);
      const workspaceRoot =
        typeof params.workspaceRoot === "string" && params.workspaceRoot.trim().length > 0
          ? params.workspaceRoot.trim()
          : conversation?.worktree_path ?? process.cwd();
      if (!workspaceRoot || workspaceRoot.trim().length === 0) {
        return errorResult("workspaceRoot could not be resolved");
      }
      const result = await evaluateHarnessCandidate({
        agentDir,
        candidate,
        benchmarkId: params.benchmarkId,
        workspaceRoot,
      });
      return textResult(result);
    },
  };

  const getCommands: ToolDefinition = {
    name: "get_commands",
    label: "Get runtime commands",
    description:
      "Return the list of runtime commands supported by the current conversation session.",
    parameters: Type.Object({}),
    execute: async () => {
      return textResult({
        commands: [
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
        ],
      });
    },
  };

  // ---- list_providers ----
  const listProviders: ToolDefinition = {
    name: "list_providers",
    label: "List providers",
    description:
      "List all providers, their models, and scoped models. Returns structured data about available models grouped by provider, plus information about which models are currently scoped (enabled for selection).",
    parameters: Type.Object({
      filter: Type.Optional(
        Type.Union([
          Type.Literal("all"),
          Type.Literal("scoped"),
          Type.Literal("available"),
        ]),
      ),
    }),
    execute: async (
      _toolCallId: string,
      params: { filter?: "all" | "scoped" | "available" },
    ) => {
      const filterMode = params.filter ?? "all";

      // Get enabled models (scoped) from settings
      const enabledModelKeys = new Set(
        settingsManager?.getEnabledModels() ?? [],
      );

      // Get all models from registry
      const allModels = modelRegistry?.getAll() ?? [];
      const availableModels = modelRegistry?.getAvailable() ?? [];

      // Build provider -> models mapping
      type ModelInfo = {
        id: string;
        name: string;
        key: string;
        scoped: boolean;
        available: boolean;
        reasoning: boolean;
        input: string[];
        contextWindow: number;
        maxTokens: number;
        cost: {
          input: number;
          output: number;
          cacheRead: number;
          cacheWrite: number;
        };
      };

      type ProviderInfo = {
        id: string;
        models: ModelInfo[];
        scopedCount: number;
        availableCount: number;
      };

      const providerMap = new Map<string, ProviderInfo>();

      const addModelToProvider = (model: Model<Api>) => {
        const provider = model.provider as string;
        const modelKey = `${provider}/${model.id}`;
        const isScoped = enabledModelKeys.has(modelKey);
        const isAvailable = availableModels.some(
          (m) => m.provider === model.provider && m.id === model.id,
        );

        if (!providerMap.has(provider)) {
          providerMap.set(provider, {
            id: provider,
            models: [],
            scopedCount: 0,
            availableCount: 0,
          });
        }

        const providerInfo = providerMap.get(provider)!;
        providerInfo.models.push({
          id: model.id,
          name: model.name,
          key: modelKey,
          scoped: isScoped,
          available: isAvailable,
          reasoning: model.reasoning,
          input: model.input as string[],
          contextWindow: model.contextWindow,
          maxTokens: model.maxTokens,
          cost: model.cost,
        });

        if (isScoped) providerInfo.scopedCount++;
        if (isAvailable) providerInfo.availableCount++;
      };

      // Add all models
      for (const model of allModels) {
        addModelToProvider(model);
      }

      // Convert to array and sort
      let providers = Array.from(providerMap.values()).sort((a, b) =>
        a.id.localeCompare(b.id),
      );

      // Sort models within each provider
      for (const provider of providers) {
        provider.models.sort((a, b) => a.id.localeCompare(b.id));
      }

      // Apply filter
      if (filterMode === "scoped") {
        providers = providers
          .map((p) => ({
            ...p,
            models: p.models.filter((m) => m.scoped),
          }))
          .filter((p) => p.models.length > 0);
      } else if (filterMode === "available") {
        providers = providers
          .map((p) => ({
            ...p,
            models: p.models.filter((m) => m.available),
          }))
          .filter((p) => p.models.length > 0);
      }

      // Compute summary statistics
      const totalModels = allModels.length;
      const totalScoped = enabledModelKeys.size;
      const totalAvailable = availableModels.length;
      const totalProviders = providers.length;

      return textResult({
        filter: filterMode,
        summary: {
          totalProviders,
          totalModels,
          totalScoped,
          totalAvailable,
        },
        providers,
      });
    },
  };

  return [
    createTaskList,
    updateTaskStatus,
    displayActionSuggestions,
    registerSubagent,
    updateSubagentStatus,
    setSubagentTaskList,
    updateSubagentTaskStatus,
    spawnSubagent,
    runSubagent,
    awaitSubagent,
    awaitSubagents,
    cancelSubagent,
    setSubagentResult,
    runSubagents,
    listMetaHarnessCandidates,
    getMetaHarnessFrontier,
    setMetaHarnessActiveCandidate,
    createMetaHarnessCandidate,
    evaluateMetaHarnessCandidate,
    getAccessMode,
    getCommands,
    listProviders,
  ];
}

/** Names of all core tools, for filtering them out of extension manifests. */
export const CORE_TOOL_NAMES = new Set([
  "create_task_list",
  "update_task_status",
  "display_action_suggestions",
  "register_subagent",
  "update_subagent_status",
  "set_subagent_task_list",
  "update_subagent_task_status",
  "spawn_subagent",
  "run_subagent",
  "await_subagent",
  "await_subagents",
  "cancel_subagent",
  "set_subagent_result",
  "run_subagents",
  "meta_harness_list_candidates",
  "meta_harness_get_frontier",
  "meta_harness_set_active_candidate",
  "meta_harness_create_candidate",
  "meta_harness_evaluate_candidate",
  "get_access_mode",
  "get_commands",
  "list_providers",
]);
