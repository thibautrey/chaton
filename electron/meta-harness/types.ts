export type HarnessObjective =
  | "successRate"
  | "latency"
  | "toolCalls"
  | "tokenCost"
  | "correctness"
  | "helpfulness"
  | "conciseness"
  | "contextualAwareness";

export type HarnessLazyDiscoveryMode = "default" | "eager" | "minimal";
export type HarnessSubagentPolicy = "default" | "encourage" | "restrict";

/**
 * Work areas define different domains where harness optimization can be applied.
 * Each area has specialized benchmarks, objectives, and candidate configurations.
 */
export type HarnessWorkArea =
  | "environment-bootstrap"  // Current: workspace awareness, tool discovery
  | "code-generation"        // Writing new code, scaffolding, boilerplate
  | "code-refactoring"       // Restructuring, renaming, moving code
  | "debugging"              // Finding and fixing bugs, error analysis
  | "code-review"            // Reviewing PRs, suggesting improvements
  | "exploration"            // Understanding unfamiliar codebases
  | "testing"                // Writing tests, test strategies
  | "documentation"          // Writing docs, READMEs, inline comments
  | "api-design"             // Interface design, type definitions
  | "performance"            // Optimization, profiling, bottlenecks
  | "security"               // Security review, vulnerability detection
  | "migration"              // Upgrading dependencies, language versions
  | "onboarding";            // Helping new team members understand the project

export const HARNESS_WORK_AREAS: HarnessWorkArea[] = [
  "environment-bootstrap",
  "code-generation",
  "code-refactoring",
  "debugging",
  "code-review",
  "exploration",
  "testing",
  "documentation",
  "api-design",
  "performance",
  "security",
  "migration",
  "onboarding",
];

export const WORK_AREA_DISPLAY_NAMES: Record<HarnessWorkArea, string> = {
  "environment-bootstrap": "Environment Bootstrap",
  "code-generation": "Code Generation",
  "code-refactoring": "Code Refactoring",
  "debugging": "Debugging",
  "code-review": "Code Review",
  "exploration": "Exploration",
  "testing": "Testing",
  "documentation": "Documentation",
  "api-design": "API Design",
  "performance": "Performance",
  "security": "Security",
  "migration": "Migration",
  "onboarding": "Onboarding",
};

export const WORK_AREA_DESCRIPTIONS: Record<HarnessWorkArea, string> = {
  "environment-bootstrap": "Workspace awareness, toolchain detection, and tool discovery patterns",
  "code-generation": "Writing new code, scaffolding, and generating boilerplate from requirements",
  "code-refactoring": "Restructuring code, renaming symbols, moving files while preserving behavior",
  "debugging": "Diagnosing errors, analyzing stack traces, finding root causes",
  "code-review": "Reviewing changes, suggesting improvements, catching issues before merge",
  "exploration": "Understanding unfamiliar codebases, finding relevant files, mapping dependencies",
  "testing": "Writing unit tests, integration tests, and test strategies",
  "documentation": "Writing READMEs, inline documentation, and usage examples",
  "api-design": "Designing interfaces, type definitions, and public APIs",
  "performance": "Identifying bottlenecks, optimization strategies, profiling",
  "security": "Security review, vulnerability detection, secure coding patterns",
  "migration": "Upgrading dependencies, language versions, framework migrations",
  "onboarding": "Helping new team members understand the project structure",
};

export const WORK_AREA_DEFAULT_OBJECTIVES: Record<HarnessWorkArea, HarnessObjective[]> = {
  "environment-bootstrap": ["successRate", "latency", "toolCalls"],
  "code-generation": ["correctness", "contextualAwareness", "latency", "tokenCost"],
  "code-refactoring": ["correctness", "contextualAwareness", "toolCalls"],
  "debugging": ["successRate", "helpfulness", "latency"],
  "code-review": ["correctness", "helpfulness", "conciseness"],
  "exploration": ["successRate", "contextualAwareness", "latency"],
  "testing": ["correctness", "contextualAwareness", "conciseness"],
  "documentation": ["helpfulness", "conciseness", "contextualAwareness"],
  "api-design": ["correctness", "contextualAwareness", "helpfulness"],
  "performance": ["successRate", "contextualAwareness", "latency"],
  "security": ["correctness", "contextualAwareness", "helpfulness"],
  "migration": ["successRate", "correctness", "toolCalls"],
  "onboarding": ["helpfulness", "conciseness", "contextualAwareness"],
};

export type HarnessEnvironmentSnapshotConfig = {
  enabled: boolean;
  timeoutMs?: number;
  maxEntriesPerDir?: number;
};

export type HarnessCandidate = {
  id: string;
  parentIds?: string[];
  /** The work area this candidate is optimized for. Defaults to "environment-bootstrap". */
  workArea?: HarnessWorkArea;
  prompt: {
    prependSections?: string[];
    appendSections?: string[];
  };
  bootstrap: {
    environmentSnapshot?: HarnessEnvironmentSnapshotConfig;
    /** Additional context files to load for this area */
    contextFiles?: string[];
    /** Whether to include project-specific conventions in the prompt */
    includeProjectConventions?: boolean;
  };
  tools?: {
    lazyDiscoveryMode?: HarnessLazyDiscoveryMode;
    subagentPolicy?: HarnessSubagentPolicy;
    /** Area-specific tool preferences */
    preferredTools?: string[];
    /** Tools to avoid for this area */
    avoidedTools?: string[];
  };
  scoring?: {
    objectives?: HarnessObjective[];
    /** Area-specific scoring weights */
    weights?: Partial<Record<HarnessObjective, number>>;
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
  workArea: HarnessWorkArea;
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
  
  // Text-based assertions
  expectedIncludes?: string[];
  expectedIncludesAny?: string[];
  expectedRegex?: string[];
  expectedRegexAny?: string[];
  expectedRegexAnyMin?: number;
  
  // File-based assertions
  expectedFilesCreated?: string[];
  expectedFilesModified?: string[];
  expectedFileContents?: Array<{
    path: string;
    includes?: string[];
    excludes?: string[];
    regex?: string[];
  }>;
  
  // Behavior assertions
  expectedToolCalls?: string[];
  expectedToolCallsMin?: number;
  forbiddenToolCalls?: string[];
  
  // Quality assertions
  maxLatencyMs?: number;
  maxToolCalls?: number;
  maxTokens?: number;
  minResponseLength?: number;
  maxResponseLength?: number;
  
  // Code quality assertions
  expectedCodePatterns?: string[];
  forbiddenCodePatterns?: string[];
  expectedImports?: string[];
  
  modelProvider?: string;
  modelId?: string;
  thinkingLevel?: string;
  
  /** Difficulty level for this task */
  difficulty?: "easy" | "medium" | "hard" | "expert";
  /** Tags for categorizing tasks */
  tags?: string[];
  /** Human-readable description of what success looks like */
  successCriteria?: string;
};

export type MetaHarnessBenchmarkDefinition = {
  id: string;
  /** The work area this benchmark evaluates */
  workArea: HarnessWorkArea;
  /** Human-readable name */
  name: string;
  /** Description of what this benchmark tests */
  description: string;
  tasks: MetaHarnessBenchmarkTask[];
  /** Default objectives for this benchmark */
  defaultObjectives?: HarnessObjective[];
  /** Whether this is a built-in benchmark or user-defined */
  isBuiltIn?: boolean;
};

export type MetaHarnessEvaluationProfile = {
  id: string;
  benchmarkId: string;
  benchmark?: MetaHarnessBenchmarkDefinition;
  modelProvider?: string | null;
  modelId?: string | null;
  thinkingLevel?: string | null;
  weight?: number;
};

export type MetaHarnessTaskResult = {
  taskId: string;
  success: boolean;
  latencyMs: number;
  toolCalls: number;
  outputText?: string;
  errorMessage?: string;
};

export type HarnessEvaluationProfileScore = {
  profileId: string;
  benchmarkId: string;
  modelProvider?: string | null;
  modelId?: string | null;
  thinkingLevel?: string | null;
  weight?: number;
  successRate: number;
  averageLatencyMs: number;
  totalToolCalls: number;
  tokenCost?: number | null;
  scalarScore: number;
  taskResults: MetaHarnessTaskResult[];
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
  profileScores?: HarnessEvaluationProfileScore[];
  robustnessScore?: number;
  scoreStddev?: number;
  worstProfileScore?: number;
  regressionPenalty?: number;
  worstCasePenalty?: number;
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
  profileId?: string;
  taskId?: string;
  event: unknown;
};
