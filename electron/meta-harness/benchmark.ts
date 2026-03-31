import type {
  HarnessCandidate,
  HarnessEvaluationProfileScore,
  HarnessEvaluationScore,
  HarnessObjective,
  HarnessWorkArea,
  MetaHarnessBenchmarkDefinition,
  MetaHarnessEvaluationProfile,
  MetaHarnessTaskResult,
} from "./types.js";
import { getDb } from "../db/index.js";
import { getHarnessFeedbackStats } from "../db/repos/meta-harness-feedback.js";
import { getBenchmarkForWorkArea } from "./work-area-benchmarks.js";

export function buildDefaultBenchmark(): MetaHarnessBenchmarkDefinition {
  return {
    id: "environment-bootstrap-smoke",
    workArea: "environment-bootstrap",
    name: "Environment Bootstrap",
    description: "Basic workspace awareness and toolchain detection",
    isBuiltIn: true,
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
        difficulty: "easy",
        tags: ["environment", "bootstrap"],
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
        difficulty: "easy",
        tags: ["environment", "exploration"],
      },
    ],
  };
}

/**
 * Build a benchmark for a specific work area.
 */
export function buildBenchmarkForWorkArea(workArea: HarnessWorkArea): MetaHarnessBenchmarkDefinition {
  return getBenchmarkForWorkArea(workArea);
}

/**
 * Build evaluation profiles for a work area.
 */
export function buildEvaluationProfilesForWorkArea(params: {
  workArea: HarnessWorkArea;
  sentinelModelProvider?: string | null;
  sentinelModelId?: string | null;
  sentinelThinkingLevel?: string | null;
}): MetaHarnessEvaluationProfile[] {
  const benchmark = getBenchmarkForWorkArea(params.workArea);
  const profiles: MetaHarnessEvaluationProfile[] = [
    {
      id: `${benchmark.id}:primary`,
      benchmarkId: benchmark.id,
      benchmark,
      weight: 1,
    },
  ];

  if (params.sentinelModelProvider && params.sentinelModelId) {
    profiles.push({
      id: `${benchmark.id}:sentinel`,
      benchmarkId: benchmark.id,
      benchmark,
      modelProvider: params.sentinelModelProvider,
      modelId: params.sentinelModelId,
      thinkingLevel: params.sentinelThinkingLevel ?? null,
      weight: 1,
    });
  }

  return profiles;
}

export function buildEvaluationProfiles(params: {
  benchmark?: MetaHarnessBenchmarkDefinition;
  benchmarkId?: string;
  sentinelModelProvider?: string | null;
  sentinelModelId?: string | null;
  sentinelThinkingLevel?: string | null;
}): MetaHarnessEvaluationProfile[] {
  const benchmark = params.benchmark ?? buildDefaultBenchmark();
  const benchmarkId = params.benchmarkId?.trim() || benchmark.id;
  const profiles: MetaHarnessEvaluationProfile[] = [
    {
      id: `${benchmarkId}:primary`,
      benchmarkId,
      benchmark,
      weight: 1,
    },
  ];

  if (params.sentinelModelProvider && params.sentinelModelId) {
    profiles.push({
      id: `${benchmarkId}:sentinel`,
      benchmarkId,
      benchmark,
      modelProvider: params.sentinelModelProvider,
      modelId: params.sentinelModelId,
      thinkingLevel: params.sentinelThinkingLevel ?? null,
      weight: 1,
    });
  }

  return profiles;
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

function mean(values: number[]): number {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function weightedMean(values: Array<{ value: number; weight: number }>): number {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return 0;
  return values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

function weightedStddev(values: Array<{ value: number; weight: number }>): number {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0 || values.length <= 1) return 0;
  const avg = weightedMean(values);
  const variance = values.reduce((sum, item) => sum + item.weight * ((item.value - avg) ** 2), 0) / totalWeight;
  return Math.sqrt(Math.max(0, variance));
}

export function scalarizeProfileScore(params: {
  successRate: number;
  averageLatencyMs: number;
  totalToolCalls: number;
  humanFeedbackScore?: number | null;
  humanFeedbackCount?: number;
  objectives?: HarnessObjective[];
  objectiveWeights?: Partial<Record<HarnessObjective, number>>;
}): number {
  const objectives = params.objectives ?? ["successRate", "latency", "toolCalls"];
  const weights = params.objectiveWeights ?? {};

  // Default weights
  const defaultWeights: Record<HarnessObjective, number> = {
    successRate: 0.25,
    latency: 0.20,
    toolCalls: 0.15,
    tokenCost: 0.10,
    correctness: 0.30,
    helpfulness: 0.25,
    conciseness: 0.15,
    contextualAwareness: 0.20,
  };

  // Calculate weighted score
  let score = 0;
  let totalWeight = 0;

  for (const objective of objectives) {
    const weight = weights[objective] ?? defaultWeights[objective] ?? 0.1;
    totalWeight += weight;

    switch (objective) {
      case "successRate":
        score += weight * params.successRate;
        break;
      case "latency":
        // Lower is better, normalize: 0ms = 1, 10000ms = 0
        score += weight * Math.max(0, 1 - params.averageLatencyMs / 10000);
        break;
      case "toolCalls":
        // Lower is better, normalize: 0 calls = 1, 50 calls = 0
        score += weight * Math.max(0, 1 - params.totalToolCalls / 50);
        break;
      case "tokenCost":
        // Placeholder - would need actual token count
        score += weight * 0.5;
        break;
      case "correctness":
        // Based on success rate but weighted higher
        score += weight * (params.successRate >= 0.9 ? 1 : params.successRate);
        break;
      case "helpfulness":
        // Based on success rate with bonus for low tool calls (efficiency)
        score += weight * (params.successRate * 0.8 + Math.max(0, 1 - params.totalToolCalls / 30) * 0.2);
        break;
      case "conciseness":
        // Lower tool calls and latency indicate conciseness
        score += weight * Math.max(0, 1 - (params.totalToolCalls * 100 + params.averageLatencyMs) / 5000);
        break;
      case "contextualAwareness":
        // Success with minimal exploration (tool calls) indicates good awareness
        score += weight * (params.successRate * 0.7 + Math.max(0, 1 - params.totalToolCalls / 20) * 0.3);
        break;
    }
  }

  // Normalize by total weight
  const normalizedScore = totalWeight > 0 ? score / totalWeight : 0;

  // Add human feedback boost
  const humanBoost =
    typeof params.humanFeedbackScore === "number"
      ? params.humanFeedbackScore * Math.min(0.2, Math.max(0.05, (params.humanFeedbackCount ?? 0) * 0.02))
      : 0;

  return normalizedScore + humanBoost;
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
  maxLatencyMs?: number;
  maxToolCalls?: number;
  minResponseLength?: number;
  maxResponseLength?: number;
  expectedCodePatterns?: string[];
  forbiddenCodePatterns?: string[];
}): MetaHarnessTaskResult {
  const outputText = params.outputText?.trim();
  let success = !params.errorMessage && !!outputText;
  const failureReasons: string[] = [];

  // Check response length constraints
  if (success && typeof params.minResponseLength === "number" && outputText!.length < params.minResponseLength) {
    success = false;
    failureReasons.push(`Response too short (${outputText!.length} < ${params.minResponseLength})`);
  }
  if (success && typeof params.maxResponseLength === "number" && outputText!.length > params.maxResponseLength) {
    success = false;
    failureReasons.push(`Response too long (${outputText!.length} > ${params.maxResponseLength})`);
  }

  // Check text includes
  if (success && params.expectedIncludes && params.expectedIncludes.length > 0) {
    const lowered = outputText!.toLowerCase();
    const missing = params.expectedIncludes.filter((needle) => !lowered.includes(needle.toLowerCase()));
    if (missing.length > 0) {
      success = false;
      failureReasons.push(`Missing required content: ${missing.join(", ")}`);
    }
  }
  if (success && params.expectedIncludesAny && params.expectedIncludesAny.length > 0) {
    const lowered = outputText!.toLowerCase();
    const hasAny = params.expectedIncludesAny.some((needle) => lowered.includes(needle.toLowerCase()));
    if (!hasAny) {
      success = false;
      failureReasons.push(`Missing any of: ${params.expectedIncludesAny.join(", ")}`);
    }
  }

  // Check regex patterns
  if (success && params.expectedRegex && params.expectedRegex.length > 0) {
    const missing = params.expectedRegex.filter((pattern) => {
      try {
        return !new RegExp(pattern, "i").test(outputText ?? "");
      } catch {
        return false;
      }
    });
    if (missing.length > 0) {
      success = false;
      failureReasons.push(`Missing patterns: ${missing.length}`);
    }
  }
  if (success && params.expectedRegexAny && params.expectedRegexAny.length > 0) {
    const matchCount = countMatchingRegexes(params.expectedRegexAny, outputText ?? "");
    if (matchCount < (params.expectedRegexAnyMin ?? 1)) {
      success = false;
      failureReasons.push(`Matched ${matchCount} patterns, needed ${params.expectedRegexAnyMin ?? 1}`);
    }
  }

  // Check code patterns
  if (success && params.expectedCodePatterns && params.expectedCodePatterns.length > 0) {
    const missing = params.expectedCodePatterns.filter((pattern) => !(outputText ?? "").includes(pattern));
    if (missing.length > 0) {
      success = false;
      failureReasons.push(`Missing code patterns: ${missing.join(", ")}`);
    }
  }
  if (success && params.forbiddenCodePatterns && params.forbiddenCodePatterns.length > 0) {
    const found = params.forbiddenCodePatterns.filter((pattern) => (outputText ?? "").includes(pattern));
    if (found.length > 0) {
      success = false;
      failureReasons.push(`Found forbidden patterns: ${found.join(", ")}`);
    }
  }

  // Check performance constraints
  if (success && typeof params.maxLatencyMs === "number" && params.latencyMs > params.maxLatencyMs) {
    success = false;
    failureReasons.push(`Too slow (${params.latencyMs}ms > ${params.maxLatencyMs}ms)`);
  }
  if (success && typeof params.maxToolCalls === "number" && params.toolCalls > params.maxToolCalls) {
    success = false;
    failureReasons.push(`Too many tool calls (${params.toolCalls} > ${params.maxToolCalls})`);
  }

  return {
    taskId: params.taskId,
    success,
    latencyMs: params.latencyMs,
    toolCalls: params.toolCalls,
    ...(outputText ? { outputText } : {}),
    ...(params.errorMessage ? { errorMessage: params.errorMessage } : {}),
    ...(failureReasons.length > 0 ? { failureReasons } : {}),
  };
}

export function aggregateProfileScore(params: {
  profile: MetaHarnessEvaluationProfile;
  candidate: HarnessCandidate;
  taskResults: MetaHarnessTaskResult[];
  humanFeedbackScore?: number | null;
  humanFeedbackCount?: number;
}): HarnessEvaluationProfileScore {
  const taskResults = params.taskResults;
  const successCount = taskResults.filter((item) => item.success).length;
  const averageLatencyMs =
    taskResults.length > 0
      ? taskResults.reduce((sum, item) => sum + item.latencyMs, 0) / taskResults.length
      : 0;
  const totalToolCalls = taskResults.reduce((sum, item) => sum + item.toolCalls, 0);
  const successRate = taskResults.length > 0 ? successCount / taskResults.length : 0;

  return {
    profileId: params.profile.id,
    benchmarkId: params.profile.benchmarkId,
    modelProvider: params.profile.modelProvider ?? null,
    modelId: params.profile.modelId ?? null,
    thinkingLevel: params.profile.thinkingLevel ?? null,
    weight: params.profile.weight ?? 1,
    successRate,
    averageLatencyMs,
    totalToolCalls,
    tokenCost: null,
    scalarScore: scalarizeProfileScore({
      successRate,
      averageLatencyMs,
      totalToolCalls,
      humanFeedbackScore: params.humanFeedbackScore,
      humanFeedbackCount: params.humanFeedbackCount,
      objectives: params.candidate.scoring?.objectives,
      objectiveWeights: params.candidate.scoring?.weights,
    }),
    taskResults,
  };
}

export function aggregateRobustScore(params: {
  profileScores: HarnessEvaluationProfileScore[];
  baselineProfileScores?: HarnessEvaluationProfileScore[];
}): {
  robustnessScore: number;
  scoreStddev: number;
  worstProfileScore: number;
  regressionPenalty: number;
  worstCasePenalty: number;
} {
  const weightedScores = params.profileScores.map((profile) => ({
    value: profile.scalarScore,
    weight: profile.weight ?? 1,
  }));
  const avg = weightedMean(weightedScores);
  const sd = weightedStddev(weightedScores);
  const worst = params.profileScores.length > 0
    ? Math.min(...params.profileScores.map((profile) => profile.scalarScore))
    : Number.NEGATIVE_INFINITY;

  let regressionPenalty = 0;
  if (params.baselineProfileScores && params.baselineProfileScores.length > 0) {
    const baselineById = new Map(
      params.baselineProfileScores.map((profile) => [profile.profileId, profile.scalarScore]),
    );

    for (const profile of params.profileScores) {
      const baseline = baselineById.get(profile.profileId);
      if (typeof baseline !== "number") continue;
      const delta = profile.scalarScore - baseline;
      if (delta < -0.03) {
        regressionPenalty += Math.abs(delta) * 2.5 * (profile.weight ?? 1);
      }
    }
  }

  const worstCasePenalty = worst < 0.55 ? (0.55 - worst) * 1.5 : 0;
  return {
    robustnessScore: avg - 0.75 * sd - regressionPenalty - worstCasePenalty,
    scoreStddev: sd,
    worstProfileScore: worst,
    regressionPenalty,
    worstCasePenalty,
  };
}

export function aggregateBenchmarkScore(params: {
  benchmarkId: string;
  runId: string;
  candidate: HarnessCandidate;
  taskResults: MetaHarnessTaskResult[];
  profileScores?: HarnessEvaluationProfileScore[];
  baselineProfileScores?: HarnessEvaluationProfileScore[];
}): HarnessEvaluationScore {
  const taskResults = params.taskResults;
  const successCount = taskResults.filter((item) => item.success).length;
  const averageLatencyMs =
    taskResults.length > 0
      ? taskResults.reduce((sum, item) => sum + item.latencyMs, 0) / taskResults.length
      : 0;
  const totalToolCalls = taskResults.reduce((sum, item) => sum + item.toolCalls, 0);
  const humanFeedback = getHarnessFeedbackStats(getDb(), params.candidate.id);
  const profileScores = params.profileScores ?? [];
  const robust = profileScores.length > 0
    ? aggregateRobustScore({
        profileScores,
        baselineProfileScores: params.baselineProfileScores,
      })
    : null;

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
    ...(profileScores.length > 0 ? { profileScores } : {}),
    ...(robust ? {
      robustnessScore: robust.robustnessScore,
      scoreStddev: robust.scoreStddev,
      worstProfileScore: robust.worstProfileScore,
      regressionPenalty: robust.regressionPenalty,
      worstCasePenalty: robust.worstCasePenalty,
    } : {}),
    createdAt: new Date().toISOString(),
  };
}
