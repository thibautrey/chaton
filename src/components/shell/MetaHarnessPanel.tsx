import {
  Activity,
  Beaker,
  Brain,
  Play,
  RefreshCw,
  Square,
  ThumbsDown,
  ThumbsUp,
  Trophy,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { createPortal } from "react-dom";
import type { PiModel } from "@/types/pi-types";
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
  if (typeof value !== "number" || Number.isNaN(value)) return "n/a";
  return `${Math.round(value * 100)}%`;
}

function formatNumber(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) return "n/a";
  return value.toFixed(2);
}

function formatLatency(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) return "n/a";
  return `${Math.round(value)} ms`;
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
  const compositeScore =
    typeof successRate === "number" &&
    typeof averageLatencyMs === "number" &&
    typeof totalToolCalls === "number"
      ? successRate - averageLatencyMs / 100000 - totalToolCalls / 10000
      : undefined;

  return {
    successRate,
    averageLatencyMs,
    totalToolCalls,
    compositeScore,
  };
}

function normalizeModelOption(model: Pick<PiModel, "provider" | "id" | "name">) {
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
  const { state, persistSettings } = useWorkspace();
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
  const [error, setError] = useState<string | null>(null);
  const [optimizerModel, setOptimizerModel] = useState("");
  const [optimizerThinkingLevel, setOptimizerThinkingLevel] =
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
  const resultPanelRef = useRef<HTMLDivElement>(null);

  const refreshAll = useCallback(async () => {
    if (!window.pi) return;
    setIsLoading(true);
    setError(null);
    try {
      const [candidateResult, frontierResult, stateResult, rawModels] =
        await Promise.all([
          window.pi.metaHarnessListCandidates(benchmarkId),
          window.pi.metaHarnessGetFrontier(benchmarkId),
          window.pi.metaHarnessGetOptimizerState(),
          window.pi.getModels(),
        ]);
      setResolvedBenchmarkId(candidateResult.benchmarkId);
      setActiveCandidateId(candidateResult.activeCandidateId);
      setCandidates(
        candidateResult.candidates as MetaHarnessCandidateSummary[],
      );
      setFrontier(frontierResult.frontier as MetaHarnessFrontierEntry[]);
      setOptimizerState(stateResult as MetaHarnessOptimizerState);
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

  const startOptimizer = useCallback(async () => {
    if (!window.pi || !optimizerModel) return;
    const separatorIndex = optimizerModel.indexOf("/");
    if (separatorIndex <= 0) {
      setError("Select an optimizer model first.");
      return;
    }
    const optimizerModelProvider = optimizerModel.slice(0, separatorIndex);
    const optimizerModelId = optimizerModel.slice(separatorIndex + 1);
    setIsStarting(true);
    setError(null);
    try {
      await window.pi.metaHarnessStartOptimizer({
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
      });
      await refreshAll();
    } catch (startError) {
      setError(
        startError instanceof Error ? startError.message : String(startError),
      );
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

  const openAttemptResult = useCallback(
    async (attempt: MetaHarnessOptimizerAttempt, candidateId?: string | null) => {
      if (!window.pi || !attempt.attemptId) return;
      const runId =
        typeof optimizerState?.runId === "string" && optimizerState.runId.trim().length > 0
          ? optimizerState.runId
          : undefined;
      setIsAttemptResultLoading(true);
      setError(null);
      try {
        const result =
          await window.pi.metaHarnessGetOptimizerAttemptResult({
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
                <div className="mb-3 flex items-center gap-2">
                  <Brain className="h-4 w-4 text-violet-600 dark:text-violet-300" />
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                    Optimizer Controls
                  </h3>
                </div>
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
                      onChange={(event) => setAutoPromote(event.target.checked)}
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
                        void persistSettings({ ...state.settings, enableHarnessUI: event.target.checked });
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
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950/60">
                      <div>
                        Best success{" "}
                        {formatPercent(
                          (optimizerState.bestScore as Record<string, unknown>)
                            .successRate,
                        )}
                      </div>
                      <div>
                        Best latency{" "}
                        {formatLatency(
                          (optimizerState.bestScore as Record<string, unknown>)
                            .averageLatencyMs,
                        )}
                      </div>
                      <div>
                        Best tool calls{" "}
                        {String(
                          (optimizerState.bestScore as Record<string, unknown>)
                            .totalToolCalls ?? "n/a",
                        )}
                      </div>
                    </div>
                  ) : null}
                  {optimizerState?.lastError ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                      {String(optimizerState.lastError)}
                    </div>
                  ) : null}
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

              <div className="space-y-3">
                {rankedCandidates.map((candidate) => {
                  const latestScore = candidate.latestScore ?? null;
                  const { compositeScore, successRate, averageLatencyMs } =
                    getScoreSummary(latestScore);
                  const humanFeedback =
                    candidate.humanFeedback && typeof candidate.humanFeedback === 'object'
                      ? (candidate.humanFeedback as Record<string, unknown>)
                      : null;
                  const isActive =
                    candidate.active || candidate.id === activeCandidateId;

                  return (
                    <article
                      key={String(
                        candidate.id ??
                          `candidate-${candidate.name ?? "unknown"}`,
                      )}
                      className={`rounded-2xl border p-4 ${
                        isActive
                          ? "border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30"
                          : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {candidate.name ||
                                candidate.id ||
                                "Unnamed candidate"}
                            </h4>
                            {isActive ? (
                              <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                                Active
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {candidate.id || "unknown-id"}
                          </p>
                          {candidate.description ? (
                            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                              {candidate.description}
                            </p>
                          ) : null}
                        </div>
                        <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                          <div>Score {formatNumber(compositeScore)}</div>
                          <div>Success {formatPercent(successRate)}</div>
                          <div>Latency {formatLatency(averageLatencyMs)}</div>
                          {humanFeedback ? (
                            <div className="mt-1 inline-flex items-center gap-1">
                              <ThumbsUp className="h-3 w-3" />
                              {String(humanFeedback.positive ?? 0)}
                              <ThumbsDown className="ml-1 h-3 w-3" />
                              {String(humanFeedback.negative ?? 0)}
                            </div>
                          ) : null}
                        </div>
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

              <div className="mb-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                Cliquez sur une tentative ou sur un candidat proposé pour voir le résultat détaillé du harness.
              </div>

              <div className="mb-5 space-y-3">
                {frontier.map((entry, index) => {
                  const { compositeScore, successRate, averageLatencyMs } =
                    getScoreSummary(entry.score);
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
                  return (
                    <article
                      key={`${String(entry.candidateId ?? "candidate")}-${index}`}
                      className="cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-violet-300 hover:bg-violet-50/40 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-violet-700 dark:hover:bg-violet-950/20"
                      onClick={async () => {
                        if (!window.pi || !frontierRunId || !frontierCandidateId) {
                          return;
                        }
                        setIsAttemptResultLoading(true);
                        setError(null);
                        try {
                          const result =
                            await window.pi.metaHarnessGetOptimizerAttemptResult({
                              runId: frontierRunId,
                              benchmarkId: frontierBenchmarkId,
                              candidateId: frontierCandidateId,
                            });
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
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Rank #{entry.rank ?? index + 1}
                          </div>
                          <h4 className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {entry.candidateId || "unknown-candidate"}
                          </h4>
                        </div>
                        <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                          <div>Score {formatNumber(compositeScore)}</div>
                          <div>Success {formatPercent(successRate)}</div>
                          <div>Latency {formatLatency(averageLatencyMs)}</div>
                        </div>
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
                            return (
                              <div
                                key={`${String(candidate?.id ?? "candidate")}-${index}`}
                                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs transition hover:border-violet-300 hover:bg-violet-50 dark:border-slate-800 dark:bg-slate-950/50 dark:hover:border-violet-700 dark:hover:bg-violet-950/30"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void openAttemptResult(
                                    attempt,
                                    String(candidate?.id ?? ""),
                                  );
                                }}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <div className="font-medium text-slate-900 dark:text-slate-100">
                                      {String(
                                        candidate?.id ?? "unknown-candidate",
                                      )}
                                    </div>
                                    <div className="text-slate-500 dark:text-slate-400">
                                      {String(candidateRecord.rationale ?? "")}
                                    </div>
                                  </div>
                                  <div className="text-right text-slate-500 dark:text-slate-400">
                                    <div>
                                      Success{" "}
                                      {formatPercent(score?.successRate)}
                                    </div>
                                    <div>
                                      Latency{" "}
                                      {formatLatency(score?.averageLatencyMs)}
                                    </div>
                                    <div>
                                      {candidateRecord.promoted
                                        ? "Promoted"
                                        : "Not promoted"}
                                    </div>
                                  </div>
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
                      {selectedAttemptLabel || "Sélectionnez une tentative pour afficher les artefacts."}
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
                          Success {formatPercent(selectedAttemptResult.score?.successRate)} • Latency {formatLatency(selectedAttemptResult.score?.averageLatencyMs)}
                        </div>
                      </div>
                    </div>

                    {selectedAttemptResult.summary ? (
                      <div>
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Summary JSON
                        </div>
                        <pre className="max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-[11px] text-slate-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200">{JSON.stringify(selectedAttemptResult.summary, null, 2)}</pre>
                      </div>
                    ) : null}

                    {selectedAttemptResult.promptText ? (
                      <div>
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Prompt
                        </div>
                        <pre className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-[11px] text-slate-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200">{selectedAttemptResult.promptText}</pre>
                      </div>
                    ) : null}

                    {selectedAttemptResult.envSnapshotText ? (
                      <div>
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Environment snapshot
                        </div>
                        <pre className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-[11px] text-slate-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200">{selectedAttemptResult.envSnapshotText}</pre>
                      </div>
                    ) : null}

                    {selectedAttemptResult.traceText ? (
                      <div>
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Trace
                        </div>
                        <pre className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-[11px] text-slate-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200">{selectedAttemptResult.traceText}</pre>
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
