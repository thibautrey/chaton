import {
  Activity,
  Beaker,
  Brain,
  ChevronDown,
  ChevronRight,
  Clock,
  Play,
  RefreshCw,
  Signal,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Square,
  Target,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TrendingUp,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { PiModel } from "@/types/pi-types";
import { createPortal } from "react-dom";
import { useWorkspace } from "@/features/workspace/store";

type MetaHarnessCandidateSummary = Record<string, unknown> & {
  id?: string;
  name?: string;
  description?: string;
  active?: boolean;
  objective?: string;
  latestScore?: Record<string, unknown> | null;
};

type MetaHarnessFrontierEntry = Record<string, unknown> & {
  candidateId?: string;
  score?: Record<string, unknown>;
  rank?: number;
};

type MetaHarnessOptimizerState = Record<string, unknown> & {
  runId?: string | null;
  status?: string;
  phase?: string;
  benchmarkId?: string;
  optimizerModelProvider?: string | null;
  optimizerModelId?: string | null;
  iteration?: number;
  autoPromote?: boolean;
  loop?: boolean;
  activeCandidateId?: string | null;
  bestCandidateId?: string | null;
  lastError?: string;
  startedAt?: string;
  stoppedAt?: string;
  bestScore?: Record<string, unknown>;
};

type MetaHarnessOptimizerAttempt = Record<string, unknown> & {
  attemptId?: string;
  iteration?: number;
  status?: string;
  phase?: string;
  summary?: string;
  errorMessage?: string;
  baseCandidateId?: string;
  startedAt?: string;
  finishedAt?: string;
  candidates?: Array<Record<string, unknown>>;
};

type MetaHarnessAttemptResult = {
  runId: string;
  attemptId: string | null;
  attempt: Record<string, unknown> | null;
  selectedCandidateId: string | null;
  candidate: Record<string, unknown> | null;
  score: Record<string, unknown> | null;
  summary: Record<string, unknown> | null;
  promptText: string | null;
  envSnapshotText: string | null;
  traceText: string | null;
  diffPatch: string | null;
};

type MetaHarnessPanelProps = {
  isOpen: boolean;
  onClose: () => void;
};

function formatPercent(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

function formatNumber(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return value.toFixed(2);
}

function formatLatency(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function getLatencyColor(ms: number | undefined): string {
  if (ms === undefined) return "text-slate-400";
  if (ms < 3000) return "text-emerald-600 dark:text-emerald-400";
  if (ms < 8000) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function getSuccessIcon(rate: number | undefined) {
  if (rate === undefined) return null;
  if (rate >= 0.95)
    return (
      <SignalHigh className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
    );
  if (rate >= 0.8)
    return (
      <SignalMedium className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
    );
  if (rate >= 0.5)
    return (
      <SignalLow className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
    );
  return <Signal className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />;
}

function getScoreColor(score: number | undefined): string {
  if (score === undefined) return "text-slate-400";
  if (score >= 0.8) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 0.6) return "text-amber-600 dark:text-amber-400";
  if (score >= 0.4) return "text-orange-600 dark:text-orange-400";
  return "text-rose-600 dark:text-rose-400";
}

function formatDateTime(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) return "n/a";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function getScoreSummary(score: unknown) {
  const record =
    score && typeof score === "object"
      ? (score as Record<string, unknown>)
      : null;
  const successRate =
    typeof record?.successRate === "number" ? record.successRate : undefined;
  const averageLatencyMs =
    typeof record?.averageLatencyMs === "number"
      ? record.averageLatencyMs
      : undefined;
  const totalToolCalls =
    typeof record?.totalToolCalls === "number"
      ? record.totalToolCalls
      : undefined;
  const robustnessScore =
    typeof record?.robustnessScore === "number"
      ? record.robustnessScore
      : undefined;
  const scoreStddev =
    typeof record?.scoreStddev === "number" ? record.scoreStddev : undefined;
  const worstProfileScore =
    typeof record?.worstProfileScore === "number"
      ? record.worstProfileScore
      : undefined;
  const compositeScore =
    typeof robustnessScore === "number"
      ? robustnessScore
      : typeof successRate === "number" &&
          typeof averageLatencyMs === "number" &&
          typeof totalToolCalls === "number"
        ? successRate - averageLatencyMs / 100000 - totalToolCalls / 10000
        : undefined;

  return {
    successRate,
    averageLatencyMs,
    totalToolCalls,
    compositeScore,
    robustnessScore,
    scoreStddev,
    worstProfileScore,
  };
}

function getOptionalNumber(
  record: Record<string, unknown> | null | undefined,
  key: string,
): number | undefined {
  const value = record?.[key];
  return typeof value === "number" && !Number.isNaN(value) ? value : undefined;
}

function getOptionalString(
  record: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function normalizeModelOption(
  model: Pick<PiModel, "provider" | "id" | "name">,
) {
  const provider = String(model.provider ?? "").trim();
  const rawId = String(model.id ?? "").trim();
  const name = String(model.name ?? rawId).trim();
  if (!provider || !rawId) return null;

  const providerPrefix = `${provider}/`;
  const id = rawId.startsWith(providerPrefix)
    ? rawId.slice(providerPrefix.length)
    : rawId;
  if (!id) return null;

  return {
    provider,
    id,
    key: `${provider}/${id}`,
    label: `${provider} / ${name.startsWith(providerPrefix) ? name.slice(providerPrefix.length) : name}`,
  };
}

export function MetaHarnessPanel({ isOpen, onClose }: MetaHarnessPanelProps) {
  const { state, updateSettings } = useWorkspace();
  const panelRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<number | null>(null);
  const [benchmarkId, setBenchmarkId] = useState("environment-bootstrap-smoke");
  const [resolvedBenchmarkId, setResolvedBenchmarkId] = useState(
    "environment-bootstrap-smoke",
  );
  const [activeCandidateId, setActiveCandidateId] =
    useState<string>("baseline");
  const [candidates, setCandidates] = useState<MetaHarnessCandidateSummary[]>(
    [],
  );
  const [frontier, setFrontier] = useState<MetaHarnessFrontierEntry[]>([]);
  const [optimizerState, setOptimizerState] =
    useState<MetaHarnessOptimizerState | null>(null);
  const [attempts, setAttempts] = useState<MetaHarnessOptimizerAttempt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isTriaging, setIsTriaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triageResult, setTriageResult] = useState<{
    benchmarkId?: string;
    kept?: string[];
    removed?: string[];
    all?: boolean;
    totalKept?: number;
    totalRemoved?: number;
  } | null>(null);
  const [optimizerModel, setOptimizerModel] = useState("");
  const [optimizerThinkingLevel, setOptimizerThinkingLevel] =
    useState("medium");
  const [validationModel, setValidationModel] = useState("");
  const [validationThinkingLevel, setValidationThinkingLevel] =
    useState("medium");
  const [autoPromote, setAutoPromote] = useState(true);
  const [loop, setLoop] = useState(true);
  const [maxIterations, setMaxIterations] = useState("");
  const [maxVariantsPerIteration, setMaxVariantsPerIteration] = useState("2");
  const [minScoreDelta, setMinScoreDelta] = useState("0.01");
  const [sleepMs, setSleepMs] = useState("1500");
  const [availableModels, setAvailableModels] = useState<
    Array<{ provider: string; id: string; key: string; label: string }>
  >([]);
  const [selectedAttemptResult, setSelectedAttemptResult] =
    useState<MetaHarnessAttemptResult | null>(null);
  const [selectedAttemptLabel, setSelectedAttemptLabel] = useState<string>("");
  const [isAttemptResultLoading, setIsAttemptResultLoading] = useState(false);
  const [optimizerLogs, setOptimizerLogs] = useState<
    Array<{
      timestamp: string;
      source: "electron" | "pi" | "frontend";
      level: "info" | "warn" | "error" | "debug";
      message: string;
      data?: unknown;
      conversationId?: string;
    }>
  >([]);
  const [isParamsExpanded, setIsParamsExpanded] = useState(true);
  const resultPanelRef = useRef<HTMLDivElement>(null);

  const refreshAll = useCallback(async () => {
    if (!window.pi) return;
    setIsLoading(true);
    setError(null);
    try {
      const [candidateResult, frontierResult, stateResult, rawModels, rawLogs] =
        await Promise.all([
          window.pi.metaHarnessListCandidates(benchmarkId),
          window.pi.metaHarnessGetFrontier(benchmarkId),
          window.pi.metaHarnessGetOptimizerState(),
          window.pi.getModels(),
          window.logger.getLogs(200),
        ]);
      setResolvedBenchmarkId(candidateResult.benchmarkId);
      setActiveCandidateId(candidateResult.activeCandidateId);
      setCandidates(
        candidateResult.candidates as MetaHarnessCandidateSummary[],
      );
      setFrontier(frontierResult.frontier as MetaHarnessFrontierEntry[]);
      setOptimizerState(stateResult as MetaHarnessOptimizerState);
      setOptimizerLogs(
        Array.isArray(rawLogs)
          ? (rawLogs.filter((entry) => {
              if (!entry || typeof entry !== "object") return false;
              const record = entry as Record<string, unknown>;
              const message = String(record.message ?? "");
              return message.includes("[meta-harness optimizer]");
            }) as Array<{
              timestamp: string;
              source: "electron" | "pi" | "frontend";
              level: "info" | "warn" | "error" | "debug";
              message: string;
              data?: unknown;
              conversationId?: string;
            }>)
          : [],
      );
      const modelOptions = (rawModels ?? [])
        .map((model) => normalizeModelOption(model))
        .filter((model): model is NonNullable<typeof model> => Boolean(model));
      setAvailableModels(modelOptions);

      const stateModelOption =
        stateResult && typeof stateResult === "object"
          ? normalizeModelOption({
              provider: String(
                (stateResult as Record<string, unknown>)
                  .optimizerModelProvider ?? "",
              ),
              id: String(
                (stateResult as Record<string, unknown>).optimizerModelId ?? "",
              ),
              name: String(
                (stateResult as Record<string, unknown>).optimizerModelId ?? "",
              ),
            })
          : null;
      const stateModelKey = stateModelOption?.key ?? "";
      if (!optimizerModel) {
        const fallbackKey =
          stateModelKey && stateModelKey !== "/"
            ? stateModelKey
            : (modelOptions[0]?.key ?? "");
        if (fallbackKey) {
          setOptimizerModel(fallbackKey);
        }
      }

      const validationModelOption =
        stateResult && typeof stateResult === "object"
          ? normalizeModelOption({
              provider: String(
                (stateResult as Record<string, unknown>)
                  .validationModelProvider ?? "",
              ),
              id: String(
                (stateResult as Record<string, unknown>).validationModelId ??
                  "",
              ),
              name: String(
                (stateResult as Record<string, unknown>).validationModelId ??
                  "",
              ),
            })
          : null;
      if (!validationModel && validationModelOption?.key) {
        setValidationModel(validationModelOption.key);
      }

      const runId =
        stateResult && typeof stateResult === "object"
          ? String((stateResult as Record<string, unknown>).runId ?? "")
          : "";
      const nextAttempts = await window.pi.metaHarnessListOptimizerAttempts(
        runId || undefined,
      );
      setAttempts(nextAttempts as MetaHarnessOptimizerAttempt[]);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : String(loadError),
      );
    } finally {
      setIsLoading(false);
    }
  }, [benchmarkId, optimizerModel]);

  useEffect(() => {
    if (!isOpen) return;
    void refreshAll();
  }, [isOpen, refreshAll]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    const handlePointerDown = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
    }
    pollRef.current = window.setInterval(() => {
      void refreshAll();
    }, 2500);
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isOpen, refreshAll]);

  const rankedCandidates = useMemo(() => {
    return [...candidates].sort((left, right) => {
      const leftActive = left.active || left.id === activeCandidateId;
      const rightActive = right.active || right.id === activeCandidateId;
      if (leftActive !== rightActive) return leftActive ? -1 : 1;
      return String(left.id ?? "").localeCompare(String(right.id ?? ""));
    });
  }, [activeCandidateId, candidates]);

  const optimizerStatus = String(optimizerState?.status ?? "idle");
  const optimizerPhase = String(optimizerState?.phase ?? "idle");
  const isOptimizerRunning =
    optimizerStatus === "running" || optimizerStatus === "stopping";
  const recentOptimizerLogs = optimizerLogs.slice(-8).reverse();

  // Collapse parameters when optimizer starts running, expand when stopped
  useEffect(() => {
    if (isOptimizerRunning) {
      setIsParamsExpanded(false);
    } else {
      setIsParamsExpanded(true);
    }
  }, [isOptimizerRunning]);

  const startOptimizer = useCallback(async () => {
    if (!window.pi || !optimizerModel) return;
    const separatorIndex = optimizerModel.indexOf("/");
    if (separatorIndex <= 0) {
      setError("Select an optimizer model first.");
      return;
    }
    const optimizerModelProvider = optimizerModel.slice(0, separatorIndex);
    const optimizerModelId = optimizerModel.slice(separatorIndex + 1);
    const validationSeparatorIndex = validationModel.indexOf("/");
    const validationModelProvider =
      validationSeparatorIndex > 0
        ? validationModel.slice(0, validationSeparatorIndex)
        : null;
    const validationModelId =
      validationSeparatorIndex > 0
        ? validationModel.slice(validationSeparatorIndex + 1)
        : null;
    setIsStarting(true);
    setError(null);
    const startConfig = {
      benchmarkId,
      optimizerModelProvider,
      optimizerModelId,
      optimizerThinkingLevel,
      autoPromote,
      loop,
      maxIterations:
        maxIterations.trim().length > 0 ? Number(maxIterations) : null,
      maxVariantsPerIteration: Number(maxVariantsPerIteration),
      minScoreDelta: Number(minScoreDelta),
      sleepMs: Number(sleepMs),
      validationModelProvider,
      validationModelId,
      validationThinkingLevel,
    };
    window.logger.log("info", "Meta-Harness start button clicked", startConfig);
    try {
      const nextState = await window.pi.metaHarnessStartOptimizer(startConfig);
      window.logger.log("info", "Meta-Harness start returned", nextState);
      await refreshAll();
    } catch (startError) {
      window.logger.log("error", "Meta-Harness start failed", {
        error:
          startError instanceof Error ? startError.message : String(startError),
        startConfig,
      });
      setError(
        startError instanceof Error ? startError.message : String(startError),
      );
      await refreshAll();
    } finally {
      setIsStarting(false);
    }
  }, [
    autoPromote,
    benchmarkId,
    loop,
    maxIterations,
    maxVariantsPerIteration,
    minScoreDelta,
    optimizerModel,
    optimizerThinkingLevel,
    refreshAll,
    sleepMs,
    validationModel,
    validationThinkingLevel,
  ]);

  const stopOptimizer = useCallback(async () => {
    if (!window.pi) return;
    setIsStopping(true);
    setError(null);
    try {
      await window.pi.metaHarnessStopOptimizer();
      await refreshAll();
    } catch (stopError) {
      setError(
        stopError instanceof Error ? stopError.message : String(stopError),
      );
    } finally {
      setIsStopping(false);
    }
  }, [refreshAll]);

  const runTriage = useCallback(async () => {
    if (!window.pi) return;
    setIsTriaging(true);
    setError(null);
    setTriageResult(null);
    try {
      const result = await window.pi.metaHarnessTriageCandidates(benchmarkId);
      if ("all" in result) {
        setTriageResult({
          all: true,
          totalKept: result.totalKept,
          totalRemoved: result.totalRemoved,
        });
      } else {
        setTriageResult({
          benchmarkId: result.benchmarkId,
          kept: result.kept,
          removed: result.removed,
        });
      }
      await refreshAll();
    } catch (triageError) {
      setError(
        triageError instanceof Error ? triageError.message : String(triageError),
      );
    } finally {
      setIsTriaging(false);
    }
  }, [benchmarkId, refreshAll]);

  const openAttemptResult = useCallback(
    async (
      attempt: MetaHarnessOptimizerAttempt,
      candidateId?: string | null,
    ) => {
      if (!window.pi || !attempt.attemptId) return;
      const runId =
        typeof optimizerState?.runId === "string" &&
        optimizerState.runId.trim().length > 0
          ? optimizerState.runId
          : undefined;
      setIsAttemptResultLoading(true);
      setError(null);
      try {
        const result = await window.pi.metaHarnessGetOptimizerAttemptResult({
          runId,
          benchmarkId:
            typeof attempt.benchmarkId === "string"
              ? attempt.benchmarkId
              : undefined,
          attemptId: String(attempt.attemptId),
          candidateId: candidateId ?? undefined,
        });
        setSelectedAttemptResult(result as MetaHarnessAttemptResult);
        setSelectedAttemptLabel(
          candidateId
            ? `Attempt ${String(attempt.iteration ?? "?")} • ${candidateId}`
            : `Attempt ${String(attempt.iteration ?? "?")}`,
        );
        window.requestAnimationFrame(() => {
          resultPanelRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : String(loadError),
        );
      } finally {
        setIsAttemptResultLoading(false);
      }
    },
    [optimizerState?.runId],
  );

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-6 py-8 backdrop-blur-sm dark:bg-black/70">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Meta-Harness"
        className="flex max-h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-violet-100 p-2 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">
              <Beaker className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Meta-Harness
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Hidden maintainer panel for candidates, frontier, and autonomous
                optimizer control.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void runTriage()}
              disabled={isTriaging || isOptimizerRunning}
              title="Triage: keep only best 50 candidates per benchmark"
            >
              <Trash2
                className={`h-4 w-4 ${isTriaging ? "animate-pulse" : ""}`}
              />
              Triage
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refreshAll()}
              disabled={isLoading}
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close Meta-Harness panel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-auto border-b border-slate-200 p-5 dark:border-slate-800 md:border-b-0 md:border-r">
            <div className="space-y-5">
              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                <button
                  type="button"
                  onClick={() => setIsParamsExpanded((v) => !v)}
                  className="mb-3 flex w-full items-center justify-between gap-2 text-left"
                >
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-violet-600 dark:text-violet-300" />
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                      Optimizer Controls
                    </h3>
                  </div>
                  {isParamsExpanded ? (
                    <ChevronDown className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  )}
                </button>
                {!isParamsExpanded && (
                  <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                    <div className="flex justify-between gap-2">
                      <span>Benchmark</span>
                      <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                        {benchmarkId || "—"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>Optimizer</span>
                      <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                        {optimizerModel ? optimizerModel.split("/").pop() : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>Validation</span>
                      <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                        {validationModel
                          ? validationModel.split("/").pop()
                          : "off"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>Variants</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {maxVariantsPerIteration}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>Auto-promote</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {autoPromote ? "on" : "off"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>Loop</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {loop ? "on" : "off"}
                      </span>
                    </div>
                  </div>
                )}
                {isParamsExpanded && (
                  <div className="space-y-3 text-sm">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        Benchmark
                      </label>
                      <input
                        value={benchmarkId}
                        onChange={(event) => setBenchmarkId(event.target.value)}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        placeholder="environment-bootstrap-smoke"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        Optimizer model
                      </label>
                      <select
                        value={optimizerModel}
                        onChange={(event) =>
                          setOptimizerModel(event.target.value)
                        }
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      >
                        <option value="">Select a model</option>
                        {availableModels.map((model) => (
                          <option key={model.key} value={model.key}>
                            {model.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        Thinking level
                      </label>
                      <select
                        value={optimizerThinkingLevel}
                        onChange={(event) =>
                          setOptimizerThinkingLevel(event.target.value)
                        }
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      >
                        <option value="off">off</option>
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        Validation model
                      </label>
                      <select
                        value={validationModel}
                        onChange={(event) =>
                          setValidationModel(event.target.value)
                        }
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      >
                        <option value="">None</option>
                        {availableModels.map((model) => (
                          <option
                            key={`validation-${model.key}`}
                            value={model.key}
                          >
                            {model.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        Validation thinking
                      </label>
                      <select
                        value={validationThinkingLevel}
                        onChange={(event) =>
                          setValidationThinkingLevel(event.target.value)
                        }
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      >
                        <option value="off">off</option>
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                          Max variants
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={4}
                          value={maxVariantsPerIteration}
                          onChange={(event) =>
                            setMaxVariantsPerIteration(event.target.value)
                          }
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                          Sleep ms
                        </label>
                        <input
                          type="number"
                          min={250}
                          step={250}
                          value={sleepMs}
                          onChange={(event) => setSleepMs(event.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                          Max iterations
                        </label>
                        <input
                          type="number"
                          min={1}
                          placeholder="unbounded"
                          value={maxIterations}
                          onChange={(event) =>
                            setMaxIterations(event.target.value)
                          }
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                          Min score delta
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={minScoreDelta}
                          onChange={(event) =>
                            setMinScoreDelta(event.target.value)
                          }
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
                      <div>
                        <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Auto-promote
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Promote better variants automatically.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={autoPromote}
                        onChange={(event) =>
                          setAutoPromote(event.target.checked)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
                      <div>
                        <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Continuous loop
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Keep iterating until stopped.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={loop}
                        onChange={(event) => setLoop(event.target.checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
                      <div>
                        <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Harness UI
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Show harness badge and feedback in conversations.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={state.settings.enableHarnessUI}
                        onChange={(event) => {
                          void updateSettings({
                            ...state.settings,
                            enableHarnessUI: event.target.checked,
                          });
                        }}
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button
                        onClick={() => void startOptimizer()}
                        disabled={
                          isStarting || isOptimizerRunning || !optimizerModel
                        }
                        className="flex-1"
                      >
                        <Play className="h-4 w-4" />
                        Start
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => void stopOptimizer()}
                        disabled={isStopping || !isOptimizerRunning}
                        className="flex-1"
                      >
                        <Square className="h-4 w-4" />
                        Stop
                      </Button>
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                <div className="mb-3 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                    Current Run
                  </h3>
                </div>
                <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                  <div className="flex justify-between gap-3">
                    <span>Status</span>
                    <span className="font-medium">{optimizerStatus}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Phase</span>
                    <span className="font-medium">{optimizerPhase}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Run id</span>
                    <span className="truncate font-mono text-xs">
                      {String(optimizerState?.runId ?? "n/a")}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Iteration</span>
                    <span>{String(optimizerState?.iteration ?? 0)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Benchmark</span>
                    <span>
                      {String(
                        optimizerState?.benchmarkId ?? resolvedBenchmarkId,
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Validation model</span>
                    <span>
                      {optimizerState?.validationModelProvider &&
                      optimizerState?.validationModelId
                        ? `${String(optimizerState.validationModelProvider)}/${String(optimizerState.validationModelId)}`
                        : "none"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Active candidate</span>
                    <span>
                      {String(
                        optimizerState?.activeCandidateId ?? activeCandidateId,
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Best candidate</span>
                    <span>
                      {String(optimizerState?.bestCandidateId ?? "n/a")}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Started</span>
                    <span>{formatDateTime(optimizerState?.startedAt)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Stopped</span>
                    <span>{formatDateTime(optimizerState?.stoppedAt)}</span>
                  </div>
                  {optimizerState?.bestScore &&
                  typeof optimizerState.bestScore === "object" ? (
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/60">
                      {(() => {
                        const bestScoreRecord =
                          optimizerState.bestScore as Record<string, unknown>;
                        const robustnessScore = getOptionalNumber(
                          bestScoreRecord,
                          "robustnessScore",
                        );
                        const successRate = getOptionalNumber(
                          bestScoreRecord,
                          "successRate",
                        );
                        const averageLatencyMs = getOptionalNumber(
                          bestScoreRecord,
                          "averageLatencyMs",
                        );
                        const scoreStddev = getOptionalNumber(
                          bestScoreRecord,
                          "scoreStddev",
                        );
                        const worstProfileScore = getOptionalNumber(
                          bestScoreRecord,
                          "worstProfileScore",
                        );

                        return (
                          <>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900/50">
                                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                  <Target className="h-3 w-3" />
                                  Robust
                                </div>
                                <div
                                  className={`mt-0.5 text-base font-semibold ${getScoreColor(robustnessScore)}`}
                                >
                                  {formatNumber(robustnessScore)}
                                </div>
                              </div>
                              <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900/50">
                                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                  {getSuccessIcon(successRate)}
                                  Success
                                </div>
                                <div
                                  className={`mt-0.5 text-base font-semibold ${successRate !== undefined && successRate >= 0.8 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-700 dark:text-slate-200"}`}
                                >
                                  {formatPercent(successRate)}
                                </div>
                              </div>
                              <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900/50">
                                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                  <Clock className="h-3 w-3" />
                                  Latency
                                </div>
                                <div
                                  className={`mt-0.5 text-base font-semibold ${getLatencyColor(averageLatencyMs)}`}
                                >
                                  {formatLatency(averageLatencyMs)}
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 flex items-center gap-4 border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                              <span>Variance σ{formatNumber(scoreStddev)}</span>
                              <span>
                                Worst {formatNumber(worstProfileScore)}
                              </span>
                              <span className="ml-auto">
                                {String(bestScoreRecord.totalToolCalls ?? "—")}{" "}
                                calls
                              </span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : null}
                  {optimizerState?.lastError ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                      {String(optimizerState.lastError)}
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Optimizer logs
                    </div>
                    <div className="max-h-48 space-y-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] dark:border-slate-800 dark:bg-slate-950/60">
                      {recentOptimizerLogs.length > 0 ? (
                        recentOptimizerLogs.map((entry, index) => (
                          <div
                            key={`${entry.timestamp}-${index}`}
                            className="space-y-1 border-b border-slate-200/70 pb-2 last:border-b-0 last:pb-0 dark:border-slate-800/70"
                          >
                            <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              <span>{entry.level}</span>
                              <span>{formatDateTime(entry.timestamp)}</span>
                            </div>
                            <div className="break-words text-slate-700 dark:text-slate-200">
                              {entry.message}
                            </div>
                            {entry.data !== undefined ? (
                              <pre className="overflow-auto whitespace-pre-wrap break-words rounded-md bg-white/80 p-2 text-[10px] text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                                {JSON.stringify(entry.data, null, 2)}
                              </pre>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div className="text-slate-500 dark:text-slate-400">
                          No optimizer logs yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </aside>

          <main className="grid min-h-0 grid-cols-1 md:grid-cols-[1.05fr_0.95fr]">
            <section className="min-h-0 overflow-auto border-b border-slate-200 p-5 dark:border-slate-800 md:border-b-0 md:border-r">
              <div className="mb-4 flex items-center gap-2">
                <Beaker className="h-4 w-4 text-violet-600 dark:text-violet-300" />
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                  Candidates
                </h3>
              </div>

              {error ? (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                  {error}
                </div>
              ) : null}

              {triageResult ? (
                <div className={`mb-4 rounded-xl border p-4 text-sm ${triageResult.removed && triageResult.removed.length > 0 ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300" : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300"}`}>
                  <div className="flex items-center gap-2">
                    {triageResult.all ? (
                      <>
                        <span className="font-medium">Triage complete (all benchmarks):</span>
                        <span>Kept {triageResult.totalKept} candidates, removed {triageResult.totalRemoved}.</span>
                      </>
                    ) : (
                      <>
                        <span className="font-medium">Triage complete ({triageResult.benchmarkId}):</span>
                        <span>Kept {triageResult.kept?.length ?? 0}, removed {triageResult.removed?.length ?? 0}.</span>
                      </>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                {rankedCandidates.map((candidate) => {
                  const latestScore = candidate.latestScore ?? null;
                  const {
                    compositeScore,
                    successRate,
                    averageLatencyMs,
                    scoreStddev,
                  } = getScoreSummary(latestScore);
                  const humanFeedback =
                    candidate.humanFeedback &&
                    typeof candidate.humanFeedback === "object"
                      ? (candidate.humanFeedback as Record<string, unknown>)
                      : null;
                  const isActive =
                    candidate.active || candidate.id === activeCandidateId;
                  const displayName =
                    candidate.name || candidate.id || "Unnamed";
                  const showId =
                    candidate.id && candidate.id !== candidate.name;

                  return (
                    <article
                      key={String(
                        candidate.id ??
                          `candidate-${candidate.name ?? "unknown"}`,
                      )}
                      className={`rounded-xl border p-3.5 transition ${
                        isActive
                          ? "border-violet-300 bg-violet-50/70 dark:border-violet-700/50 dark:bg-violet-950/25"
                          : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-700"
                      }`}
                    >
                      {/* Header row: Name + Active badge + Score */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <h4
                            className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100"
                            title={displayName}
                          >
                            {displayName}
                          </h4>
                          {isActive && (
                            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                              <Zap className="h-3 w-3" />
                              Active
                            </span>
                          )}
                        </div>
                        <div
                          className={`shrink-0 text-sm font-bold ${getScoreColor(compositeScore)}`}
                        >
                          {formatNumber(compositeScore)}
                        </div>
                      </div>

                      {/* Optional: Show ID if different from name */}
                      {showId && (
                        <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500 truncate">
                          {candidate.id}
                        </p>
                      )}

                      {/* Description - single line, muted */}
                      {candidate.description && (
                        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                          {candidate.description}
                        </p>
                      )}

                      {/* Metrics row - compact horizontal layout */}
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                        {/* Success rate with icon */}
                        <div
                          className="flex items-center gap-1.5"
                          title="Success rate"
                        >
                          {getSuccessIcon(successRate)}
                          <span
                            className={
                              successRate && successRate >= 0.8
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-slate-500 dark:text-slate-400"
                            }
                          >
                            {formatPercent(successRate)}
                          </span>
                        </div>

                        {/* Latency */}
                        <div
                          className="flex items-center gap-1.5"
                          title="Average latency"
                        >
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          <span className={getLatencyColor(averageLatencyMs)}>
                            {formatLatency(averageLatencyMs)}
                          </span>
                        </div>

                        {/* Variance (only show if meaningful) */}
                        {scoreStddev !== undefined && scoreStddev > 0 && (
                          <div
                            className="flex items-center gap-1.5"
                            title="Score variance"
                          >
                            <TrendingUp className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-slate-500 dark:text-slate-400">
                              σ{formatNumber(scoreStddev)}
                            </span>
                          </div>
                        )}

                        {/* Human feedback summary */}
                        {humanFeedback && (
                          <div className="flex items-center gap-1.5 ml-auto">
                            <ThumbsUp className="h-3 w-3 text-emerald-500" />
                            <span className="text-[11px] text-slate-500">
                              {String(humanFeedback.positive ?? 0)}
                            </span>
                            <ThumbsDown className="ml-1.5 h-3 w-3 text-rose-500" />
                            <span className="text-[11px] text-slate-500">
                              {String(humanFeedback.negative ?? 0)}
                            </span>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="min-h-0 overflow-auto p-5">
              <div className="mb-4 flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500 dark:text-amber-300" />
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                  Frontier & Attempts
                </h3>
              </div>

              <div className="mb-5 space-y-2">
                {frontier.map((entry, index) => {
                  const {
                    compositeScore,
                    successRate,
                    averageLatencyMs,
                    scoreStddev,
                  } = getScoreSummary(entry.score);
                  const frontierRunId =
                    typeof entry.score?.runId === "string" &&
                    entry.score.runId.trim().length > 0
                      ? entry.score.runId
                      : undefined;
                  const frontierBenchmarkId =
                    typeof entry.score?.benchmarkId === "string" &&
                    entry.score.benchmarkId.trim().length > 0
                      ? entry.score.benchmarkId
                      : resolvedBenchmarkId;
                  const frontierCandidateId =
                    typeof entry.candidateId === "string" &&
                    entry.candidateId.trim().length > 0
                      ? entry.candidateId
                      : undefined;

                  // Get rank styling
                  const rank = entry.rank ?? index + 1;
                  const rankColor =
                    rank === 1
                      ? "text-amber-600 dark:text-amber-400"
                      : rank === 2
                        ? "text-slate-500 dark:text-slate-400"
                        : rank === 3
                          ? "text-orange-700 dark:text-orange-500"
                          : "text-slate-400 dark:text-slate-500";

                  return (
                    <article
                      key={`${String(entry.candidateId ?? "candidate")}-${index}`}
                      className="cursor-pointer rounded-xl border border-slate-200 bg-white p-3 transition hover:border-violet-300 hover:bg-violet-50/30 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-violet-700 dark:hover:bg-violet-950/20"
                      onClick={async () => {
                        if (
                          !window.pi ||
                          !frontierRunId ||
                          !frontierCandidateId
                        ) {
                          return;
                        }
                        setIsAttemptResultLoading(true);
                        setError(null);
                        try {
                          const result =
                            await window.pi.metaHarnessGetOptimizerAttemptResult(
                              {
                                runId: frontierRunId,
                                benchmarkId: frontierBenchmarkId,
                                candidateId: frontierCandidateId,
                              },
                            );
                          setSelectedAttemptResult(
                            result as MetaHarnessAttemptResult,
                          );
                          setSelectedAttemptLabel(
                            `Frontier • ${frontierCandidateId}`,
                          );
                          window.requestAnimationFrame(() => {
                            resultPanelRef.current?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                          });
                        } catch (loadError) {
                          setError(
                            loadError instanceof Error
                              ? loadError.message
                              : String(loadError),
                          );
                        } finally {
                          setIsAttemptResultLoading(false);
                        }
                      }}
                    >
                      {/* Compact header: Rank badge + Name + Score */}
                      <div className="flex items-center gap-2.5">
                        {/* Rank medal */}
                        <div
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold dark:bg-slate-800 ${rankColor}`}
                        >
                          {rank}
                        </div>

                        {/* Candidate name */}
                        <h4
                          className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-slate-100"
                          title={frontierCandidateId}
                        >
                          {frontierCandidateId}
                        </h4>

                        {/* Score pill */}
                        <div
                          className={`shrink-0 rounded-lg bg-slate-100 px-2 py-0.5 text-sm font-semibold dark:bg-slate-800 ${getScoreColor(compositeScore)}`}
                        >
                          {formatNumber(compositeScore)}
                        </div>
                      </div>

                      {/* Subtle metrics row */}
                      <div className="mt-2 flex items-center gap-4 pl-9 text-xs text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          {getSuccessIcon(successRate)}
                          {formatPercent(successRate)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span className={getLatencyColor(averageLatencyMs)}>
                            {formatLatency(averageLatencyMs)}
                          </span>
                        </span>
                        {scoreStddev !== undefined && scoreStddev > 0 && (
                          <span className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />σ
                            {formatNumber(scoreStddev)}
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="space-y-3">
                {attempts
                  .slice()
                  .reverse()
                  .map((attempt) => (
                    <article
                      key={String(
                        attempt.attemptId ??
                          `attempt-${attempt.iteration ?? 0}`,
                      )}
                      className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-violet-300 hover:bg-violet-50/40 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-violet-700 dark:hover:bg-violet-950/20"
                      onClick={() => void openAttemptResult(attempt)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Iteration {String(attempt.iteration ?? "?")} •{" "}
                            {String(attempt.status ?? "unknown")}
                          </div>
                          <h4 className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {String(
                              attempt.summary ??
                                `Base candidate ${attempt.baseCandidateId ?? "unknown"}`,
                            )}
                          </h4>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Started {formatDateTime(attempt.startedAt)}
                          </div>
                          {attempt.errorMessage ? (
                            <div className="mt-2 text-xs text-red-600 dark:text-red-300">
                              {String(attempt.errorMessage)}
                            </div>
                          ) : null}
                        </div>
                        <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                          <div>Phase {String(attempt.phase ?? "unknown")}</div>
                          <div>
                            {Array.isArray(attempt.candidates)
                              ? attempt.candidates.length
                              : 0}{" "}
                            candidate(s)
                          </div>
                        </div>
                      </div>
                      {Array.isArray(attempt.candidates) &&
                      attempt.candidates.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {attempt.candidates.map((candidateRecord, index) => {
                            const candidate =
                              candidateRecord.candidate &&
                              typeof candidateRecord.candidate === "object"
                                ? (candidateRecord.candidate as Record<
                                    string,
                                    unknown
                                  >)
                                : null;
                            const score =
                              candidateRecord.score &&
                              typeof candidateRecord.score === "object"
                                ? (candidateRecord.score as Record<
                                    string,
                                    unknown
                                  >)
                                : null;
                            const robustnessScore =
                              typeof score?.robustnessScore === "number"
                                ? score.robustnessScore
                                : undefined;
                            const successRate =
                              typeof score?.successRate === "number"
                                ? score.successRate
                                : undefined;
                            const avgLatency =
                              typeof score?.averageLatencyMs === "number"
                                ? score.averageLatencyMs
                                : undefined;
                            const variance =
                              typeof score?.scoreStddev === "number"
                                ? score.scoreStddev
                                : undefined;
                            const rationale = getOptionalString(
                              candidateRecord,
                              "rationale",
                            );
                            const isPromoted =
                              candidateRecord.promoted === true;

                            return (
                              <div
                                key={`${String(candidate?.id ?? "candidate")}-${index}`}
                                className={`rounded-lg border px-3 py-2 text-xs transition hover:bg-violet-50/30 dark:hover:bg-violet-950/20 ${
                                  isPromoted
                                    ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/50 dark:bg-emerald-950/20"
                                    : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50"
                                }`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void openAttemptResult(
                                    attempt,
                                    String(candidate?.id ?? ""),
                                  );
                                }}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                                      {String(candidate?.id ?? "unknown")}
                                    </span>
                                    {isPromoted && (
                                      <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                                        <Target className="h-2.5 w-2.5" />
                                        Promoted
                                      </span>
                                    )}
                                  </div>
                                  <span
                                    className={`shrink-0 font-semibold ${getScoreColor(robustnessScore)}`}
                                  >
                                    {formatNumber(robustnessScore)}
                                  </span>
                                </div>

                                {rationale && (
                                  <p className="mt-1 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
                                    {rationale}
                                  </p>
                                )}

                                <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                                  <span className="flex items-center gap-1">
                                    {getSuccessIcon(successRate)}
                                    {formatPercent(successRate)}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    <span
                                      className={getLatencyColor(avgLatency)}
                                    >
                                      {formatLatency(avgLatency)}
                                    </span>
                                  </span>
                                  {variance !== undefined && variance > 0 && (
                                    <span>σ{formatNumber(variance)}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </article>
                  ))}
              </div>

              <div
                ref={resultPanelRef}
                className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Résultat du harness
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {selectedAttemptLabel ||
                        "Sélectionnez une tentative pour afficher les artefacts."}
                    </p>
                  </div>
                  {isAttemptResultLoading ? (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Chargement…
                    </span>
                  ) : null}
                </div>

                {selectedAttemptResult ? (
                  <div className="space-y-4 text-xs">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Candidate
                        </div>
                        <div className="mt-1 font-mono text-slate-900 dark:text-slate-100">
                          {selectedAttemptResult.selectedCandidateId ?? "n/a"}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Score
                        </div>
                        <div className="mt-1 text-slate-900 dark:text-slate-100">
                          Robust{" "}
                          {formatNumber(
                            (
                              selectedAttemptResult.score as Record<
                                string,
                                unknown
                              > | null
                            )?.robustnessScore,
                          )}{" "}
                          • Success{" "}
                          {formatPercent(
                            selectedAttemptResult.score?.successRate,
                          )}{" "}
                          • Latency{" "}
                          {formatLatency(
                            selectedAttemptResult.score?.averageLatencyMs,
                          )}
                        </div>
                      </div>
                    </div>

                    {selectedAttemptResult.summary ? (
                      <div>
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Summary JSON
                        </div>
                        <pre className="max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-[11px] text-slate-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200">
                          {JSON.stringify(
                            selectedAttemptResult.summary,
                            null,
                            2,
                          )}
                        </pre>
                      </div>
                    ) : null}

                    {selectedAttemptResult.promptText ? (
                      <div>
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Prompt
                        </div>
                        <pre className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-[11px] text-slate-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200">
                          {selectedAttemptResult.promptText}
                        </pre>
                      </div>
                    ) : null}

                    {selectedAttemptResult.envSnapshotText ? (
                      <div>
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Environment snapshot
                        </div>
                        <pre className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-[11px] text-slate-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200">
                          {selectedAttemptResult.envSnapshotText}
                        </pre>
                      </div>
                    ) : null}

                    {selectedAttemptResult.traceText ? (
                      <div>
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Trace
                        </div>
                        <pre className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-[11px] text-slate-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200">
                          {selectedAttemptResult.traceText}
                        </pre>
                      </div>
                    ) : null}

                    {!selectedAttemptResult.summary &&
                    !selectedAttemptResult.promptText &&
                    !selectedAttemptResult.envSnapshotText &&
                    !selectedAttemptResult.traceText ? (
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                        Aucun artefact détaillé trouvé pour cette tentative.
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-4 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                    Aucun résultat sélectionné.
                  </div>
                )}
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>,
    document.body,
  );
}
