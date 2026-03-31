import fs from "node:fs";
import path from "node:path";

import type {
  HarnessCandidate,
  HarnessCandidateSummary,
  HarnessEvaluationScore,
  HarnessEvaluationTraceEvent,
  HarnessFrontierEntry,
} from "./types.js";
import {
  ensureCandidateStored,
  getCandidateDir,
  getCandidatesRoot,
  getDefaultHarnessCandidate,
  getMetaHarnessRoot,
  listStoredHarnessCandidateIds,
  loadHarnessCandidate,
} from "./candidate.js";
import { getDb } from "../db/index.js";
import { getHarnessFeedbackStats } from "../db/repos/meta-harness-feedback.js";
import { getLogManager } from "../lib/logging/log-manager.js";

function safeReadJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function safeWriteJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function safeDeleteDir(dirPath: string): void {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch {
    // Ignore deletion errors
  }
}

function safeDeleteFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore deletion errors
  }
}

/** Maximum number of candidates to keep per benchmark type. */
const MAX_CANDIDATES_PER_BENCHMARK = 50;

/**
 * Gets the score value for ranking candidates. Higher is better.
 * Uses robustnessScore if available, otherwise falls back to composite calculation.
 */
function getCandidateScoreValue(score?: HarnessEvaluationScore | null): number {
  if (!score) return Number.NEGATIVE_INFINITY;
  if (typeof score.robustnessScore === "number") {
    return score.robustnessScore;
  }
  const humanBoost = typeof score.humanFeedbackScore === "number"
    ? score.humanFeedbackScore * Math.min(0.2, Math.max(0.05, (score.humanFeedbackCount ?? 0) * 0.02))
    : 0;
  return score.successRate - score.averageLatencyMs / 100000 - score.totalToolCalls / 10000 + humanBoost;
}

/**
 * Triages candidates for a specific benchmark, keeping only the best MAX_CANDIDATES_PER_BENCHMARK.
 * Removes:
 * - Low-scoring candidate runs from the benchmark directory
 * - Candidate definitions that are no longer referenced by any remaining runs
 * - Removes entries from frontier.json for deleted candidates
 *
 * The baseline candidate is always preserved regardless of score.
 */
export function triageCandidatesForBenchmark(agentDir: string, benchmarkId: string): {
  kept: string[];
  removed: string[];
} {
  const benchmarkRoot = getBenchmarkRoot(agentDir, benchmarkId);
  if (!fs.existsSync(benchmarkRoot)) {
    return { kept: [], removed: [] };
  }

  const defaultCandidate = getDefaultHarnessCandidate();
  const baselineId = defaultCandidate.id;

  // Collect all runs with their scores per candidate
  type CandidateRun = { runId: string; score: HarnessEvaluationScore; scoreValue: number };
  const candidateRuns = new Map<string, CandidateRun[]>();

  for (const entry of fs.readdirSync(benchmarkRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const runId = entry.name;
    const candidatesDir = path.join(benchmarkRoot, runId, "candidates");
    if (!fs.existsSync(candidatesDir)) continue;

    for (const candidateEntry of fs.readdirSync(candidatesDir, { withFileTypes: true })) {
      if (!candidateEntry.isDirectory()) continue;
      const candidateId = candidateEntry.name;
      const scorePath = path.join(candidatesDir, candidateId, "score.json");
      const score = safeReadJson<HarnessEvaluationScore>(scorePath);
      if (!score) continue;

      const scoreValue = getCandidateScoreValue(score);
      if (!candidateRuns.has(candidateId)) {
        candidateRuns.set(candidateId, []);
      }
      candidateRuns.get(candidateId)!.push({ runId, score, scoreValue });
    }
  }

  // Calculate best score per candidate for ranking
  const candidateBestScores = new Map<string, number>();
  for (const [candidateId, runs] of candidateRuns) {
    const bestScore = Math.max(...runs.map((r) => r.scoreValue));
    candidateBestScores.set(candidateId, bestScore);
  }

  // Sort candidates by best score (descending)
  const sortedCandidates = Array.from(candidateBestScores.entries())
    .sort((a, b) => b[1] - a[1]);

  // Determine which candidates to keep (top N, always including baseline)
  const candidatesToKeep = new Set<string>();
  const candidatesToRemove = new Set<string>();

  // Always keep baseline
  candidatesToKeep.add(baselineId);

  // Add top candidates up to MAX_CANDIDATES_PER_BENCHMARK
  for (let i = 0; i < sortedCandidates.length && candidatesToKeep.size < MAX_CANDIDATES_PER_BENCHMARK; i++) {
    const [candidateId] = sortedCandidates[i];
    candidatesToKeep.add(candidateId);
  }

  // Mark remaining candidates for removal
  for (const [candidateId] of sortedCandidates) {
    if (!candidatesToKeep.has(candidateId)) {
      candidatesToRemove.add(candidateId);
    }
  }

  // Remove runs for candidates marked for deletion
  for (const candidateId of candidatesToRemove) {
    const runs = candidateRuns.get(candidateId) ?? [];
    for (const { runId } of runs) {
      const candidateDir = path.join(benchmarkRoot, runId, "candidates", candidateId);
      safeDeleteDir(candidateDir);
    }
  }

  // Check which candidates are still referenced by any remaining runs across ALL benchmarks
  // This prevents deleting a candidate that might be used by other benchmarks
  const allBenchmarkRoots: string[] = [];
  const metaHarnessRoot = getMetaHarnessRoot(agentDir);
  if (fs.existsSync(metaHarnessRoot)) {
    for (const entry of fs.readdirSync(metaHarnessRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "candidates" && entry.name !== "optimizer") {
        allBenchmarkRoots.push(path.join(metaHarnessRoot, entry.name));
      }
    }
  }

  // Find candidates still referenced by any benchmark
  const referencedCandidates = new Set<string>();
  referencedCandidates.add(baselineId); // Baseline is always referenced

  for (const otherBenchmarkRoot of allBenchmarkRoots) {
    if (!fs.existsSync(otherBenchmarkRoot)) continue;
    for (const entry of fs.readdirSync(otherBenchmarkRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidatesDir = path.join(otherBenchmarkRoot, entry.name, "candidates");
      if (!fs.existsSync(candidatesDir)) continue;
      for (const candidateEntry of fs.readdirSync(candidatesDir, { withFileTypes: true })) {
        if (candidateEntry.isDirectory()) {
          referencedCandidates.add(candidateEntry.name);
        }
      }
    }
  }

  // Remove candidate definitions that are no longer referenced
  const candidatesRoot = getCandidatesRoot(agentDir);
  for (const candidateId of candidatesToRemove) {
    if (!referencedCandidates.has(candidateId)) {
      const candidateDir = path.join(candidatesRoot, candidateId);
      safeDeleteDir(candidateDir);
    }
  }

  // Update frontier.json to remove deleted candidates
  const frontier = readFrontier(agentDir, benchmarkId);
  const updatedFrontier = frontier.filter((entry) => !candidatesToRemove.has(entry.candidateId));
  if (updatedFrontier.length !== frontier.length) {
    // Re-rank the frontier
    const ranked = updatedFrontier.map((entry, index) => ({ ...entry, rank: index + 1 }));
    writeFrontier(agentDir, benchmarkId, ranked);
  }

  return {
    kept: Array.from(candidatesToKeep),
    removed: Array.from(candidatesToRemove),
  };
}

/**
 * Triages candidates across all benchmarks, keeping only the best MAX_CANDIDATES_PER_BENCHMARK per benchmark.
 * This is useful for manual cleanup or periodic maintenance.
 */
export function triageAllCandidates(agentDir: string): Map<string, { kept: string[]; removed: string[] }> {
  const results = new Map<string, { kept: string[]; removed: string[] }>();
  const metaHarnessRoot = getMetaHarnessRoot(agentDir);

  if (!fs.existsSync(metaHarnessRoot)) {
    return results;
  }

  for (const entry of fs.readdirSync(metaHarnessRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    // Skip non-benchmark directories
    if (entry.name === "candidates" || entry.name === "optimizer") continue;

    const benchmarkId = entry.name;
    const result = triageCandidatesForBenchmark(agentDir, benchmarkId);
    results.set(benchmarkId, result);
  }

  return results;
}

export function getBenchmarkRoot(agentDir: string, benchmarkId: string): string {
  return path.join(getMetaHarnessRoot(agentDir), benchmarkId);
}

export function getRunRoot(agentDir: string, benchmarkId: string, runId: string): string {
  return path.join(getBenchmarkRoot(agentDir, benchmarkId), runId);
}

export function createRunId(): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `run-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ensureArchiveRoots(agentDir: string, benchmarkId: string, runId: string): string {
  const runRoot = getRunRoot(agentDir, benchmarkId, runId);
  fs.mkdirSync(path.join(runRoot, "candidates"), { recursive: true });
  return runRoot;
}

export function archiveHarnessArtifacts(params: {
  agentDir: string;
  benchmarkId: string;
  runId: string;
  candidate: HarnessCandidate;
  promptSections: string[];
  envSnapshotText?: string;
  score?: HarnessEvaluationScore;
  traceEvents?: HarnessEvaluationTraceEvent[];
  summary?: Record<string, unknown>;
  diffPatch?: string;
}): string {
  ensureCandidateStored(params.agentDir, params.candidate);
  const runRoot = ensureArchiveRoots(params.agentDir, params.benchmarkId, params.runId);
  const candidateRoot = path.join(runRoot, "candidates", params.candidate.id);
  fs.mkdirSync(candidateRoot, { recursive: true });

  safeWriteJson(path.join(candidateRoot, "candidate.json"), params.candidate);
  fs.writeFileSync(path.join(candidateRoot, "prompt.txt"), `${params.promptSections.join("\n\n")}\n`, "utf8");
  if (params.envSnapshotText) {
    fs.writeFileSync(path.join(candidateRoot, "env-snapshot.txt"), `${params.envSnapshotText}\n`, "utf8");
  }
  if (params.score) {
    safeWriteJson(path.join(candidateRoot, "score.json"), params.score);
  }
  if (params.summary) {
    safeWriteJson(path.join(candidateRoot, "summary.json"), params.summary);
  }
  if (params.traceEvents) {
    const traceJsonl = params.traceEvents.map((entry) => JSON.stringify(entry)).join("\n");
    fs.writeFileSync(path.join(candidateRoot, "trace.jsonl"), traceJsonl ? `${traceJsonl}\n` : "", "utf8");
  }
  if (typeof params.diffPatch === "string") {
    fs.writeFileSync(path.join(candidateRoot, "diff.patch"), params.diffPatch.endsWith("\n") ? params.diffPatch : `${params.diffPatch}\n`, "utf8");
  }

  safeWriteJson(path.join(runRoot, "run.json"), {
    benchmarkId: params.benchmarkId,
    runId: params.runId,
    candidateId: params.candidate.id,
    createdAt: new Date().toISOString(),
  });

  return candidateRoot;
}

export function listHarnessCandidates(agentDir: string, benchmarkId?: string): HarnessCandidateSummary[] {
  const candidateIds = listStoredHarnessCandidateIds(agentDir);
  const defaultCandidate = getDefaultHarnessCandidate();
  return candidateIds.map((candidateId) => {
    const candidate = candidateId === defaultCandidate.id
      ? defaultCandidate
      : loadHarnessCandidate(agentDir, candidateId);
    const latest = benchmarkId ? getLatestCandidateScore(agentDir, benchmarkId, candidateId) : null;
    return {
      id: candidate.id,
      parentIds: candidate.parentIds ?? [],
      ...(candidate.description ? { description: candidate.description } : {}),
      ...(candidate.createdAt ? { createdAt: candidate.createdAt } : {}),
      environmentSnapshotEnabled: candidate.bootstrap.environmentSnapshot?.enabled === true,
      objectives: candidate.scoring?.objectives ?? [],
      ...(benchmarkId ? { benchmarkId } : {}),
      ...(latest?.score ? { latestScore: latest.score, latestRunId: latest.runId } : {}),
      humanFeedback: getHarnessFeedbackStats(getDb(), candidate.id),
      isActive: false,
    };
  });
}

export function getLatestCandidateScore(
  agentDir: string,
  benchmarkId: string,
  candidateId: string,
): { runId: string; score: HarnessEvaluationScore } | null {
  const benchmarkRoot = getBenchmarkRoot(agentDir, benchmarkId);
  if (!fs.existsSync(benchmarkRoot)) return null;
  let latest: { runId: string; score: HarnessEvaluationScore } | null = null;
  for (const entry of fs.readdirSync(benchmarkRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const score = safeReadJson<HarnessEvaluationScore>(
      path.join(benchmarkRoot, entry.name, "candidates", candidateId, "score.json"),
    );
    if (!score) continue;
    if (!latest || score.createdAt > latest.score.createdAt) {
      latest = { runId: entry.name, score };
    }
  }
  return latest;
}

export function readFrontier(agentDir: string, benchmarkId: string): HarnessFrontierEntry[] {
  return safeReadJson<HarnessFrontierEntry[]>(
    path.join(getBenchmarkRoot(agentDir, benchmarkId), "frontier.json"),
  ) ?? [];
}

export function writeFrontier(agentDir: string, benchmarkId: string, frontier: HarnessFrontierEntry[]): void {
  safeWriteJson(path.join(getBenchmarkRoot(agentDir, benchmarkId), "frontier.json"), frontier);
}

export function updateFrontierForScore(
  agentDir: string,
  benchmarkId: string,
  score: HarnessEvaluationScore,
): HarnessFrontierEntry[] {
  const current = readFrontier(agentDir, benchmarkId).filter((entry) => entry.candidateId !== score.candidateId);
  current.push({
    candidateId: score.candidateId,
    benchmarkId,
    rank: 0,
    score,
  });
  current.sort((a, b) => {
    const leftRobust = typeof a.score.robustnessScore === "number" ? a.score.robustnessScore : null;
    const rightRobust = typeof b.score.robustnessScore === "number" ? b.score.robustnessScore : null;
    if (leftRobust !== null || rightRobust !== null) {
      if (leftRobust === null) return 1;
      if (rightRobust === null) return -1;
      if (rightRobust !== leftRobust) return rightRobust - leftRobust;
    }
    if (b.score.successRate !== a.score.successRate) return b.score.successRate - a.score.successRate;
    if (a.score.averageLatencyMs !== b.score.averageLatencyMs) return a.score.averageLatencyMs - b.score.averageLatencyMs;
    return a.score.totalToolCalls - b.score.totalToolCalls;
  });
  const ranked = current.map((entry, index) => ({ ...entry, rank: index + 1 }));
  writeFrontier(agentDir, benchmarkId, ranked);

  // Automatically triage candidates to keep only the best MAX_CANDIDATES_PER_BENCHMARK
  const triageResult = triageCandidatesForBenchmark(agentDir, benchmarkId);
  if (triageResult.removed.length > 0) {
    getLogManager().log("info", "electron", `[meta-harness] Auto-triage removed ${triageResult.removed.length} low-performing candidates for benchmark ${benchmarkId}.`, {
      benchmarkId,
      removedCount: triageResult.removed.length,
      keptCount: triageResult.kept.length,
      removed: triageResult.removed,
    });
  }

  return ranked;
}

export function readActiveCandidate(agentDir: string): string | null {
  const value = safeReadJson<{ candidateId?: string }>(path.join(getMetaHarnessRoot(agentDir), "active.json"));
  return typeof value?.candidateId === "string" ? value.candidateId : null;
}

export function writeActiveCandidate(agentDir: string, candidateId: string): void {
  safeWriteJson(path.join(getMetaHarnessRoot(agentDir), "active.json"), {
    candidateId,
    updatedAt: new Date().toISOString(),
  });
}

export function markActiveCandidateInSummaries(
  agentDir: string,
  summaries: HarnessCandidateSummary[],
): HarnessCandidateSummary[] {
  const activeCandidateId = readActiveCandidate(agentDir) ?? getDefaultHarnessCandidate().id;
  return summaries.map((summary) => ({
    ...summary,
    isActive: summary.id === activeCandidateId,
  }));
}
