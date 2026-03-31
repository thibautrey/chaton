import crypto from "node:crypto";

import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { Model } from "@mariozechner/pi-ai";

import { getDb } from "../db/index.js";
import { insertConversation } from "../db/repos/conversations.js";
import type { DbConversation } from "../db/repos/conversations.js";
import type { PiRendererEvent } from "../pi-sdk-runtime.js";
import { getAgentDir } from "../pi-sdk-runtime.js";
import { readActiveCandidate, updateFrontierForScore, writeActiveCandidate } from "./archive.js";
import { buildDefaultBenchmark } from "./benchmark.js";
import { ensureCandidateStored, getDefaultHarnessCandidate, loadHarnessCandidate, validateHarnessCandidate } from "./candidate.js";
import { evaluateHarnessCandidate } from "./evaluator.js";
import type { HarnessCandidate, HarnessEvaluationScore } from "./types.js";
import type {
  MetaHarnessOptimizerAttempt,
  MetaHarnessOptimizerAttemptCandidate,
  MetaHarnessOptimizerConfig,
  MetaHarnessOptimizerProposal,
  MetaHarnessOptimizerRunState,
} from "./optimizer-types.js";
import {
  appendOptimizerAttempt,
  buildDefaultOptimizerConfig,
  listOptimizerAttempts,
  readOptimizerState,
  writeOptimizerState,
} from "./optimizer-store.js";

type RuntimeFacade = {
  start: (
    conversation: DbConversation,
    options?: { harnessCandidate?: HarnessCandidate | null },
  ) => Promise<void>;
  send: (command: { type: "prompt"; message: string }) => Promise<{ success: boolean; error?: string }>;
  getSnapshot: () => { state: unknown; messages: unknown[]; status: string };
  stop: () => Promise<void>;
};

function getRuntimeFactory() {
  return (globalThis as Record<string, unknown>).__chatonsMetaHarnessRuntimeFactory as
    | ((conversationId: string, onEvent: (payload: PiRendererEvent) => void) => RuntimeFacade)
    | undefined;
}

function createRunId(): string {
  return `optimizer-${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
}

function createAttemptId(iteration: number): string {
  return `attempt-${String(iteration).padStart(4, "0")}-${crypto.randomUUID().slice(0, 8)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scoreValue(score?: HarnessEvaluationScore | null): number {
  if (!score) return Number.NEGATIVE_INFINITY;
  const humanBoost = typeof score.humanFeedbackScore === 'number'
    ? score.humanFeedbackScore * Math.min(0.2, Math.max(0.05, (score.humanFeedbackCount ?? 0) * 0.02))
    : 0;
  return score.successRate - score.averageLatencyMs / 100000 - score.totalToolCalls / 10000 + humanBoost;
}

function sanitizeCandidateId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || `candidate-${Date.now()}`;
}

function resolveOptimizerModel(config: MetaHarnessOptimizerConfig): Model<any> | null {
  if (!config.optimizerModelProvider || !config.optimizerModelId) return null;
  const authStorage = AuthStorage.create(`${getAgentDir()}/auth.json`);
  const modelRegistry = new ModelRegistry(authStorage, `${getAgentDir()}/models.json`);
  return modelRegistry.find(config.optimizerModelProvider, config.optimizerModelId) as Model<any> | null;
}

function buildOptimizerConversation(params: {
  runId: string;
  iteration: number;
  config: MetaHarnessOptimizerConfig;
}): DbConversation {
  const now = new Date().toISOString();
  return {
    id: `__meta_harness_optimizer__:${params.runId}:${params.iteration}:${crypto.randomUUID()}`,
    project_id: null,
    title: `Meta-Harness Optimizer ${params.iteration}`,
    title_source: "manual",
    status: "active",
    is_relevant: 0,
    created_at: now,
    updated_at: now,
    last_message_at: now,
    pi_session_file: null,
    model_provider: params.config.optimizerModelProvider,
    model_id: params.config.optimizerModelId,
    thinking_level: params.config.optimizerThinkingLevel ?? null,
    last_runtime_error: null,
    worktree_path: process.cwd(),
    access_mode: "secure",
    channel_extension_id: null,
    hidden_from_sidebar: 1,
    memory_injected: 0,
    runtime_location: "local",
    cloud_runtime_session_id: null,
  };
}

function extractTextPartsFromMessage(message: unknown): string[] {
  if (!message || typeof message !== "object") return [];
  const record = message as Record<string, unknown>;
  const content = Array.isArray(record.content) ? record.content : [];
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const contentPart = part as Record<string, unknown>;
      if (contentPart.type === "text" && typeof contentPart.text === "string") return contentPart.text;
      if (contentPart.type === "reasoning" && typeof contentPart.text === "string") return contentPart.text;
      return "";
    })
    .filter((value) => value.trim().length > 0);
}

function extractJsonArraySubstring(text: string): string | null {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaping) {
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "[") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === "]" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function extractJsonCandidate(text: string): string | null {
  const fencedMatches = Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi));
  for (const match of fencedMatches) {
    const block = match[1]?.trim();
    if (!block) continue;
    if (block.startsWith("[") || block.startsWith("{")) return block;
    const nestedArray = extractJsonArraySubstring(block);
    if (nestedArray) return nestedArray;
  }

  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return trimmed;
  return extractJsonArraySubstring(text);
}

function coercePromptSections(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sections = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return sections.length > 0 ? sections : undefined;
}

function buildCandidateFromPatch(params: {
  baseCandidate: HarnessCandidate;
  iteration: number;
  index: number;
  patch: Record<string, unknown>;
}): HarnessCandidate | null {
  const id =
    typeof params.patch.id === "string" && params.patch.id.trim().length > 0
      ? sanitizeCandidateId(params.patch.id)
      : sanitizeCandidateId(`${params.baseCandidate.id}-iter${params.iteration}-v${params.index + 1}`);

  const promptPatch = params.patch.prompt && typeof params.patch.prompt === "object"
    ? (params.patch.prompt as Record<string, unknown>)
    : {};
  const bootstrapPatch = params.patch.bootstrap && typeof params.patch.bootstrap === "object"
    ? (params.patch.bootstrap as Record<string, unknown>)
    : {};
  const envPatch = bootstrapPatch.environmentSnapshot && typeof bootstrapPatch.environmentSnapshot === "object"
    ? (bootstrapPatch.environmentSnapshot as Record<string, unknown>)
    : {};
  const toolsPatch = params.patch.tools && typeof params.patch.tools === "object"
    ? (params.patch.tools as Record<string, unknown>)
    : {};
  const scoringPatch = params.patch.scoring && typeof params.patch.scoring === "object"
    ? (params.patch.scoring as Record<string, unknown>)
    : {};

  /** behaviorPrompt can be explicitly null/undefined to clear the base value, or a string to override it. */
  const behaviorPrompt =
    params.patch.behaviorPrompt === null || params.patch.behaviorPrompt === undefined
      ? params.baseCandidate.behaviorPrompt
      : (typeof params.patch.behaviorPrompt === "string" && params.patch.behaviorPrompt.trim().length > 0
          ? params.patch.behaviorPrompt.trim()
          : params.baseCandidate.behaviorPrompt);

  const candidate: HarnessCandidate = {
    id,
    parentIds: Array.from(new Set([...(params.baseCandidate.parentIds ?? []), params.baseCandidate.id])),
    prompt: {
      prependSections: coercePromptSections(promptPatch.prependSections) ?? params.baseCandidate.prompt.prependSections,
      appendSections: coercePromptSections(promptPatch.appendSections) ?? params.baseCandidate.prompt.appendSections,
    },
    bootstrap: {
      environmentSnapshot: {
        enabled:
          typeof envPatch.enabled === "boolean"
            ? envPatch.enabled
            : params.baseCandidate.bootstrap.environmentSnapshot?.enabled === true,
        timeoutMs:
          typeof envPatch.timeoutMs === "number"
            ? Math.max(1000, Math.floor(envPatch.timeoutMs))
            : params.baseCandidate.bootstrap.environmentSnapshot?.timeoutMs,
        maxEntriesPerDir:
          typeof envPatch.maxEntriesPerDir === "number"
            ? Math.max(1, Math.floor(envPatch.maxEntriesPerDir))
            : params.baseCandidate.bootstrap.environmentSnapshot?.maxEntriesPerDir,
      },
    },
    tools: {
      lazyDiscoveryMode:
        toolsPatch.lazyDiscoveryMode === "default" ||
        toolsPatch.lazyDiscoveryMode === "eager" ||
        toolsPatch.lazyDiscoveryMode === "minimal"
          ? toolsPatch.lazyDiscoveryMode
          : params.baseCandidate.tools?.lazyDiscoveryMode,
      subagentPolicy:
        toolsPatch.subagentPolicy === "default" ||
        toolsPatch.subagentPolicy === "encourage" ||
        toolsPatch.subagentPolicy === "restrict"
          ? toolsPatch.subagentPolicy
          : params.baseCandidate.tools?.subagentPolicy,
    },
    scoring: {
      objectives: Array.isArray(scoringPatch.objectives)
        ? scoringPatch.objectives.filter(
            (item): item is "successRate" | "latency" | "toolCalls" | "tokenCost" =>
              item === "successRate" || item === "latency" || item === "toolCalls" || item === "tokenCost",
          )
        : params.baseCandidate.scoring?.objectives,
    },
    ...(behaviorPrompt ? { behaviorPrompt } : {}),
    createdAt: new Date().toISOString(),
    description:
      typeof params.patch.description === "string" && params.patch.description.trim().length > 0
        ? params.patch.description.trim()
        : `Optimizer variant from ${params.baseCandidate.id} at iteration ${params.iteration}`,
  };

  const validated = validateHarnessCandidate(candidate);
  return validated.ok ? validated.value : null;
}

function buildFallbackProposal(params: {
  baseCandidate: HarnessCandidate;
  iteration: number;
  index: number;
  failureReason?: string;
}): MetaHarnessOptimizerProposal {
  const envSnapshot = params.baseCandidate.bootstrap.environmentSnapshot ?? {
    enabled: false,
    timeoutMs: 15000,
    maxEntriesPerDir: 20,
  };
  const candidate = buildCandidateFromPatch({
    baseCandidate: params.baseCandidate,
    iteration: params.iteration,
    index: params.index,
    patch: {
      id: `${params.baseCandidate.id}-iter${params.iteration}-fallback-${params.index + 1}`,
      description: `Fallback optimizer variant ${params.index + 1} for iteration ${params.iteration}`,
      bootstrap: {
        environmentSnapshot: {
          enabled: params.index % 2 === 0 ? !envSnapshot.enabled : envSnapshot.enabled,
          timeoutMs: Math.max(2000, Math.min(30000, (envSnapshot.timeoutMs ?? 15000) + (params.index % 2 === 0 ? 2000 : -2000))),
          maxEntriesPerDir: Math.max(5, Math.min(40, (envSnapshot.maxEntriesPerDir ?? 20) + (params.index % 2 === 0 ? 5 : -5))),
        },
      },
      tools: {
        lazyDiscoveryMode: params.index % 3 === 0 ? "eager" : params.index % 3 === 1 ? "minimal" : "default",
        subagentPolicy: params.index % 3 === 0 ? "encourage" : params.index % 3 === 1 ? "restrict" : "default",
      },
    },
  });
  const failureSuffix = params.failureReason?.trim()
    ? ` Failure: ${params.failureReason.trim()}`
    : "";
  return {
    candidate: candidate ?? getDefaultHarnessCandidate(),
    rationale: `Fallback heuristic proposal used because the optimizer model did not return valid JSON proposals.${failureSuffix}`,
  };
}

function buildProposalPrompt(params: {
  baseCandidate: HarnessCandidate;
  benchmarkId: string;
  attemptSummary: string[];
  maxVariantsPerIteration: number;
}): string {
  return [
    "You are operating as a Meta-Harness optimizer for Chatons.",
    "Your job is to propose bounded HarnessCandidate variants that may improve benchmark performance.",
    "Do not propose arbitrary file edits or anything outside the HarnessCandidate schema.",
    "Return ONLY JSON as an array.",
    "Each array item must be an object with:",
    '- "rationale": short string',
    '- "candidate": object shaped like a HarnessCandidate or a patch-compatible subset containing prompt/bootstrap/tools/scoring/description/id',
    "Focus on bounded changes such as environmentSnapshot, lazyDiscoveryMode, subagentPolicy, and short prompt hints.",
    `Generate up to ${Math.max(1, Math.min(4, params.maxVariantsPerIteration))} variants.`,
    "",
    `Benchmark: ${params.benchmarkId}`,
    "Base candidate:",
    JSON.stringify(params.baseCandidate, null, 2),
    params.attemptSummary.length > 0 ? `Recent attempt summaries:\n${params.attemptSummary.map((item) => `- ${item}`).join("\n")}` : "Recent attempt summaries: none",
    "Human feedback is available indirectly through candidate scores. Prefer variants that improve satisfaction without overfitting to one benchmark.",
  ].join("\n\n");
}

async function askOptimizerModel(params: {
  runId: string;
  iteration: number;
  config: MetaHarnessOptimizerConfig;
  baseCandidate: HarnessCandidate;
  attemptSummary: string[];
}): Promise<{ proposals: MetaHarnessOptimizerProposal[]; failureReason?: string }> {
  const runtimeFactory = getRuntimeFactory();
  if (!runtimeFactory) {
    return { proposals: [], failureReason: "Meta-Harness runtime factory is not available." };
  }

  const conversation = buildOptimizerConversation({
    runId: params.runId,
    iteration: params.iteration,
    config: params.config,
  });
  insertConversation(getDb(), {
    id: conversation.id,
    title: conversation.title,
    titleSource: "manual",
    isRelevant: false,
    modelProvider: conversation.model_provider,
    modelId: conversation.model_id,
    thinkingLevel: conversation.thinking_level,
    worktreePath: conversation.worktree_path,
    accessMode: conversation.access_mode,
    hiddenFromSidebar: true,
    memoryInjected: false,
    runtimeLocation: "local",
  });

  const runtime = runtimeFactory(conversation.id, () => undefined);
  try {
    await runtime.start(conversation, { harnessCandidate: null });
    const response = await runtime.send({
      type: "prompt",
      message: `${buildProposalPrompt({
        baseCandidate: params.baseCandidate,
        benchmarkId: params.config.benchmarkId,
        attemptSummary: params.attemptSummary,
        maxVariantsPerIteration: params.config.maxVariantsPerIteration,
      })}\n\nIf you cannot comply perfectly, return a JSON object with a \"proposals\" array anyway. Do not include markdown fencing.`,
    });
    if (!response.success) {
      return {
        proposals: [],
        failureReason: typeof response.error === "string" && response.error.trim().length > 0
          ? response.error
          : "Optimizer model prompt failed.",
      };
    }
    const snapshot = runtime.getSnapshot();
    const assistantMessages = snapshot.messages.filter((entry) => {
      if (!entry || typeof entry !== "object") return false;
      return (entry as Record<string, unknown>).role === "assistant";
    });
    const text = assistantMessages
      .flatMap((entry) => extractTextPartsFromMessage(entry))
      .join("\n\n");
    const jsonBlock = extractJsonCandidate(text);
    if (!jsonBlock) {
      return {
        proposals: [],
        failureReason: "Optimizer model returned no parseable JSON payload.",
      };
    }
    const parsed = JSON.parse(jsonBlock) as unknown;
    const proposalRecords = Array.isArray(parsed)
      ? parsed
      : (parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).proposals)
        ? (parsed as Record<string, unknown>).proposals
        : []);
    if (!Array.isArray(proposalRecords) || proposalRecords.length === 0) {
      return {
        proposals: [],
        failureReason: "Optimizer model JSON did not contain a proposal array.",
      };
    }
    const proposals = proposalRecords
      .map((item, index) => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const candidatePatch = record.candidate && typeof record.candidate === "object"
          ? (record.candidate as Record<string, unknown>)
          : record;
        const candidate = buildCandidateFromPatch({
          baseCandidate: params.baseCandidate,
          iteration: params.iteration,
          index,
          patch: candidatePatch,
        });
        if (!candidate) return null;
        return {
          candidate,
          rationale:
            typeof record.rationale === "string" && record.rationale.trim().length > 0
              ? record.rationale.trim()
              : `Model-generated optimizer proposal ${index + 1}`,
        } satisfies MetaHarnessOptimizerProposal;
      })
      .filter((item): item is MetaHarnessOptimizerProposal => !!item)
      .slice(0, Math.max(1, Math.min(4, params.config.maxVariantsPerIteration)));

    if (proposals.length === 0) {
      return {
        proposals: [],
        failureReason: "Optimizer model JSON parsed, but no valid candidate proposals matched the schema.",
      };
    }

    return { proposals };
  } catch (error) {
    return {
      proposals: [],
      failureReason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await runtime.stop();
  }
}

class MetaHarnessOptimizerRunner {
  private currentRun: Promise<void> | null = null;

  getState(): MetaHarnessOptimizerRunState {
    return readOptimizerState(getAgentDir());
  }

  listAttempts(runId?: string | null): MetaHarnessOptimizerAttempt[] {
    return listOptimizerAttempts(getAgentDir(), runId);
  }

  async start(
    configInput: Partial<MetaHarnessOptimizerConfig> & {
      optimizerModelProvider: string;
      optimizerModelId: string;
    },
  ): Promise<MetaHarnessOptimizerRunState> {
    const current = this.getState();
    if (current.status === "running" || current.status === "stopping") {
      return current;
    }

    const config: MetaHarnessOptimizerConfig = {
      ...buildDefaultOptimizerConfig(),
      ...configInput,
      optimizerModelProvider: configInput.optimizerModelProvider,
      optimizerModelId: configInput.optimizerModelId,
    };
    const model = resolveOptimizerModel(config);
    if (!model) {
      throw new Error(`Optimizer model not found: ${config.optimizerModelProvider}/${config.optimizerModelId}`);
    }

    const activeCandidateId = readActiveCandidate(getAgentDir()) ?? getDefaultHarnessCandidate().id;
    const state = writeOptimizerState(getAgentDir(), {
      runId: createRunId(),
      status: "running",
      phase: "planning",
      benchmarkId: config.benchmarkId || buildDefaultBenchmark().id,
      optimizerModelProvider: config.optimizerModelProvider,
      optimizerModelId: config.optimizerModelId,
      optimizerThinkingLevel: config.optimizerThinkingLevel ?? "medium",
      startedAt: new Date().toISOString(),
      stoppedAt: undefined,
      iteration: 0,
      stopRequested: false,
      autoPromote: config.autoPromote,
      loop: config.loop,
      maxIterations: config.maxIterations ?? null,
      maxVariantsPerIteration: Math.max(1, config.maxVariantsPerIteration),
      minScoreDelta: config.minScoreDelta,
      sleepMs: Math.max(250, config.sleepMs),
      activeCandidateId,
      bestCandidateId: activeCandidateId,
      bestScore: undefined,
      lastError: undefined,
      lastAttemptId: undefined,
    });

    this.currentRun = this.runLoop().finally(() => {
      this.currentRun = null;
    });
    return state;
  }

  stop(): MetaHarnessOptimizerRunState {
    const state = this.getState();
    return writeOptimizerState(getAgentDir(), {
      ...state,
      status: "stopping",
      stopRequested: true,
    });
  }

  private async runLoop(): Promise<void> {
    let state = this.getState();
    while (state.status === "running" || state.status === "stopping") {
      if (state.stopRequested) {
        writeOptimizerState(getAgentDir(), {
          ...state,
          status: "stopped",
          phase: "stopped",
          stoppedAt: new Date().toISOString(),
        });
        return;
      }

      if (state.maxIterations && state.iteration >= state.maxIterations) {
        writeOptimizerState(getAgentDir(), {
          ...state,
          status: "completed",
          phase: "idle",
          stoppedAt: new Date().toISOString(),
        });
        return;
      }

      const nextIteration = state.iteration + 1;
      state = writeOptimizerState(getAgentDir(), {
        ...state,
        status: "running",
        phase: "planning",
        iteration: nextIteration,
      });

      const attemptId = createAttemptId(nextIteration);
      const baseCandidateId = state.activeCandidateId ?? readActiveCandidate(getAgentDir()) ?? getDefaultHarnessCandidate().id;
      const baseCandidate = loadHarnessCandidate(getAgentDir(), baseCandidateId);
      const attempt: MetaHarnessOptimizerAttempt = {
        runId: state.runId!,
        attemptId,
        iteration: nextIteration,
        startedAt: new Date().toISOString(),
        status: "running",
        phase: "planning",
        baseCandidateId,
        benchmarkId: state.benchmarkId,
        candidates: [],
      };
      appendOptimizerAttempt(getAgentDir(), attempt);

      try {
        state = writeOptimizerState(getAgentDir(), {
          ...state,
          phase: "proposing",
          lastAttemptId: attemptId,
        });
        attempt.phase = "proposing";
        appendOptimizerAttempt(getAgentDir(), attempt);

        const previousSummaries = this.listAttempts(state.runId)
          .slice(-3)
          .map((entry) => entry.summary)
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

        const optimizerResult = await askOptimizerModel({
          runId: state.runId!,
          iteration: nextIteration,
          config: {
            benchmarkId: state.benchmarkId,
            optimizerModelProvider: state.optimizerModelProvider ?? "",
            optimizerModelId: state.optimizerModelId ?? "",
            optimizerThinkingLevel: state.optimizerThinkingLevel ?? null,
            autoPromote: state.autoPromote,
            loop: state.loop,
            maxIterations: state.maxIterations ?? null,
            maxVariantsPerIteration: state.maxVariantsPerIteration,
            minScoreDelta: state.minScoreDelta,
            sleepMs: state.sleepMs,
          },
          baseCandidate,
          attemptSummary: previousSummaries,
        });

        let proposals = optimizerResult.proposals;
        if (proposals.length === 0) {
          proposals = Array.from({ length: Math.max(1, state.maxVariantsPerIteration) }, (_, index) =>
            buildFallbackProposal({
              baseCandidate,
              iteration: nextIteration,
              index,
              failureReason: optimizerResult.failureReason,
            }),
          );
        }

        state = writeOptimizerState(getAgentDir(), {
          ...state,
          phase: "evaluating",
        });
        attempt.phase = "evaluating";
        appendOptimizerAttempt(getAgentDir(), attempt);

        const evaluated: MetaHarnessOptimizerAttemptCandidate[] = [];
        for (const proposal of proposals.slice(0, Math.max(1, state.maxVariantsPerIteration))) {
          ensureCandidateStored(getAgentDir(), proposal.candidate);
          const result = await evaluateHarnessCandidate({
            agentDir: getAgentDir(),
            candidate: proposal.candidate,
            benchmarkId: state.benchmarkId,
            workspaceRoot: process.cwd(),
          });
          evaluated.push({
            candidate: proposal.candidate,
            parentCandidateId: baseCandidate.id,
            rationale: proposal.rationale,
            score: result.score,
            promoted: false,
          });
        }

        attempt.candidates = evaluated;
        attempt.phase = "ranking";
        state = writeOptimizerState(getAgentDir(), {
          ...state,
          phase: "ranking",
        });
        appendOptimizerAttempt(getAgentDir(), attempt);

        const baselineScore = state.bestScore ?? null;
        let best = evaluated
          .filter((item) => item.score)
          .sort((left, right) => scoreValue(right.score ?? null) - scoreValue(left.score ?? null))[0];

        if (best?.score && state.autoPromote) {
          const improvement = scoreValue(best.score) - scoreValue(baselineScore);
          if (improvement >= state.minScoreDelta) {
            writeActiveCandidate(getAgentDir(), best.candidate.id);
            updateFrontierForScore(getAgentDir(), state.benchmarkId, best.score);
            best = { ...best, promoted: true };
            attempt.candidates = attempt.candidates.map((item) =>
              item.candidate.id === best?.candidate.id ? best! : item,
            );
            state = writeOptimizerState(getAgentDir(), {
              ...state,
              phase: "promoting",
              activeCandidateId: best.candidate.id,
              bestCandidateId: best.candidate.id,
              bestScore: best.score,
            });
          }
        }

        attempt.phase = "sleeping";
        attempt.status = "completed";
        attempt.summary = best?.score
          ? `Best candidate ${best.candidate.id} success ${(best.score.successRate * 100).toFixed(0)}%, latency ${Math.round(best.score.averageLatencyMs)}ms${best.promoted ? ", promoted" : ""}.`
          : "No valid benchmark score was produced.";
        attempt.finishedAt = new Date().toISOString();
        appendOptimizerAttempt(getAgentDir(), attempt);

        state = writeOptimizerState(getAgentDir(), {
          ...state,
          phase: state.loop ? "sleeping" : "idle",
          bestCandidateId: best?.candidate.id ?? state.bestCandidateId,
          bestScore: best?.score ?? state.bestScore,
        });

        if (!state.loop) {
          writeOptimizerState(getAgentDir(), {
            ...readOptimizerState(getAgentDir()),
            status: "completed",
            phase: "idle",
            stoppedAt: new Date().toISOString(),
          });
          return;
        }

        await sleep(state.sleepMs);
        state = readOptimizerState(getAgentDir());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        attempt.status = "error";
        attempt.phase = "error";
        attempt.errorMessage = message;
        attempt.finishedAt = new Date().toISOString();
        appendOptimizerAttempt(getAgentDir(), attempt);
        writeOptimizerState(getAgentDir(), {
          ...state,
          status: "error",
          phase: "error",
          lastError: message,
          stoppedAt: new Date().toISOString(),
        });
        return;
      }
    }
  }
}

export const metaHarnessOptimizerRunner = new MetaHarnessOptimizerRunner();
