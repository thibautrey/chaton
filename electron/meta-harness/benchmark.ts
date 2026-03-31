import type { HarnessCandidate, HarnessEvaluationScore, MetaHarnessBenchmarkDefinition, MetaHarnessTaskResult } from "./types.js";
import { getDb } from "../db/index.js";
import { getHarnessFeedbackStats } from "../db/repos/meta-harness-feedback.js";

export function buildDefaultBenchmark(): MetaHarnessBenchmarkDefinition {
  return {
    id: "environment-bootstrap-smoke",
    tasks: [
      {
        id: "cwd-and-toolchain",
        prompt:
          "Briefly report the current working directory and mention at least one detected toolchain version if available.",
        expectedIncludesAny: ["directory", "working directory", "cwd"],
        expectedRegexAny: [
          String.raw`(/users/|/home/|/workspace/|/tmp/|/var/|[a-z]:\\)`,
          String.raw`\b(node(\.js)?|npm|pnpm|python|rust|cargo|git|ruby|java)\b[^\n]*\b(v?\d+[\w.:-]*)`,
        ],
        expectedRegexAnyMin: 2,
      },
      {
        id: "repo-shape",
        prompt:
          "Briefly summarize the top-level repository contents or workspace shape before making any changes.",
        expectedIncludesAny: ["repository", "repo", "workspace", "monorepo", "project"],
        expectedRegexAny: [
          String.raw`\b(src|electron|docs|apps|packages|landing|extension-registry|scripts|dist)\b`,
          String.raw`\b(repository|repo|workspace|monorepo|project)\b`,
        ],
        expectedRegexAnyMin: 2,
      },
    ],
  };
}

function countMatchingRegexes(patterns: string[] | undefined, outputText: string): number {
  if (!patterns || patterns.length === 0) return 0;
  return patterns.reduce((count, pattern) => {
    try {
      return new RegExp(pattern, "i").test(outputText) ? count + 1 : count;
    } catch {
      return count;
    }
  }, 0);
}

export function scoreTaskResult(params: {
  taskId: string;
  latencyMs: number;
  toolCalls: number;
  outputText?: string;
  errorMessage?: string;
  expectedIncludes?: string[];
  expectedIncludesAny?: string[];
  expectedRegex?: string[];
  expectedRegexAny?: string[];
  expectedRegexAnyMin?: number;
}): MetaHarnessTaskResult {
  const outputText = params.outputText?.trim();
  let success = !params.errorMessage && !!outputText;

  if (success && params.expectedIncludes && params.expectedIncludes.length > 0) {
    const lowered = outputText!.toLowerCase();
    success = params.expectedIncludes.every((needle) => lowered.includes(needle.toLowerCase()));
  }
  if (success && params.expectedIncludesAny && params.expectedIncludesAny.length > 0) {
    const lowered = outputText!.toLowerCase();
    success = params.expectedIncludesAny.some((needle) => lowered.includes(needle.toLowerCase()));
  }
  if (success && params.expectedRegex && params.expectedRegex.length > 0) {
    success = params.expectedRegex.every((pattern) => {
      try {
        return new RegExp(pattern, "i").test(outputText ?? "");
      } catch {
        return true;
      }
    });
  }
  if (success && params.expectedRegexAny && params.expectedRegexAny.length > 0) {
    const matchCount = countMatchingRegexes(params.expectedRegexAny, outputText ?? "");
    success = matchCount >= (params.expectedRegexAnyMin ?? 1);
  }

  return {
    taskId: params.taskId,
    success,
    latencyMs: params.latencyMs,
    toolCalls: params.toolCalls,
    ...(outputText ? { outputText } : {}),
    ...(params.errorMessage ? { errorMessage: params.errorMessage } : {}),
  };
}

export function aggregateBenchmarkScore(params: {
  benchmarkId: string;
  runId: string;
  candidate: HarnessCandidate;
  taskResults: MetaHarnessTaskResult[];
}): HarnessEvaluationScore {
  const taskResults = params.taskResults;
  const successCount = taskResults.filter((item) => item.success).length;
  const averageLatencyMs =
    taskResults.length > 0
      ? taskResults.reduce((sum, item) => sum + item.latencyMs, 0) / taskResults.length
      : 0;
  const totalToolCalls = taskResults.reduce((sum, item) => sum + item.toolCalls, 0);
  const humanFeedback = getHarnessFeedbackStats(getDb(), params.candidate.id);
  return {
    benchmarkId: params.benchmarkId,
    runId: params.runId,
    candidateId: params.candidate.id,
    objectives: params.candidate.scoring?.objectives ?? ["successRate", "latency", "toolCalls", "tokenCost"],
    successRate: taskResults.length > 0 ? successCount / taskResults.length : 0,
    averageLatencyMs,
    totalToolCalls,
    tokenCost: null,
    humanFeedbackScore: humanFeedback.score,
    humanFeedbackCount: humanFeedback.total,
    taskResults,
    createdAt: new Date().toISOString(),
  };
}
