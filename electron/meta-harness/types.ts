export type HarnessObjective =
  | "successRate"
  | "latency"
  | "toolCalls"
  | "tokenCost";

export type HarnessLazyDiscoveryMode = "default" | "eager" | "minimal";
export type HarnessSubagentPolicy = "default" | "encourage" | "restrict";

export type HarnessEnvironmentSnapshotConfig = {
  enabled: boolean;
  timeoutMs?: number;
  maxEntriesPerDir?: number;
};

export type HarnessCandidate = {
  id: string;
  parentIds?: string[];
  prompt: {
    prependSections?: string[];
    appendSections?: string[];
  };
  bootstrap: {
    environmentSnapshot?: HarnessEnvironmentSnapshotConfig;
  };
  tools?: {
    lazyDiscoveryMode?: HarnessLazyDiscoveryMode;
    subagentPolicy?: HarnessSubagentPolicy;
  };
  scoring?: {
    objectives?: HarnessObjective[];
  };
  /** Custom behavior prompt that takes precedence over the app-level defaultBehaviorPrompt when set. */
  behaviorPrompt?: string;
  createdAt?: string;
  description?: string;
};

export type HarnessFeedbackSummary = {
  total: number;
  positive: number;
  negative: number;
  score: number | null;
};

export type HarnessCandidateSummary = {
  id: string;
  parentIds: string[];
  description?: string;
  createdAt?: string;
  environmentSnapshotEnabled: boolean;
  objectives: HarnessObjective[];
  benchmarkId?: string;
  latestScore?: HarnessEvaluationScore;
  latestRunId?: string;
  isActive?: boolean;
  humanFeedback?: HarnessFeedbackSummary;
};

export type HarnessBootstrapResult = {
  promptPrependSections: string[];
  promptAppendSections: string[];
  envSnapshotText?: string;
  /** Behavior prompt from the harness candidate, if any. */
  behaviorPrompt?: string;
};

export type HarnessRuntimeMetadata = {
  candidateId: string | null;
  parentIds: string[];
  archiveRoot: string;
  environmentSnapshotEnabled: boolean;
  environmentSnapshotCaptured: boolean;
  candidate?: HarnessCandidate | null;
  enabled?: boolean;
  userRating?: -1 | 1 | null;
  userFeedbackSubmittedAt?: string | null;
};

export type MetaHarnessBenchmarkTask = {
  id: string;
  prompt: string;
  workingDirectory?: string;
  accessMode?: "secure" | "open";
  expectedIncludes?: string[];
  expectedIncludesAny?: string[];
  expectedRegex?: string[];
  expectedRegexAny?: string[];
  expectedRegexAnyMin?: number;
  modelProvider?: string;
  modelId?: string;
  thinkingLevel?: string;
};

export type MetaHarnessBenchmarkDefinition = {
  id: string;
  tasks: MetaHarnessBenchmarkTask[];
};

export type MetaHarnessTaskResult = {
  taskId: string;
  success: boolean;
  latencyMs: number;
  toolCalls: number;
  outputText?: string;
  errorMessage?: string;
};

export type HarnessEvaluationScore = {
  benchmarkId: string;
  runId: string;
  candidateId: string;
  objectives: HarnessObjective[];
  successRate: number;
  averageLatencyMs: number;
  totalToolCalls: number;
  tokenCost?: number | null;
  humanFeedbackScore?: number | null;
  humanFeedbackCount?: number;
  taskResults: MetaHarnessTaskResult[];
  createdAt: string;
};

export type HarnessFrontierEntry = {
  candidateId: string;
  benchmarkId?: string;
  rank: number;
  score: HarnessEvaluationScore;
};

export type HarnessEvaluationTraceEvent = {
  timestamp: string;
  taskId?: string;
  event: unknown;
};
