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
  getDefaultHarnessCandidate,
  getMetaHarnessRoot,
  listStoredHarnessCandidateIds,
  loadHarnessCandidate,
} from "./candidate.js";
import { getDb } from "../db/index.js";
import { getHarnessFeedbackStats } from "../db/repos/meta-harness-feedback.js";

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
    if (b.score.successRate !== a.score.successRate) return b.score.successRate - a.score.successRate;
    if (a.score.averageLatencyMs !== b.score.averageLatencyMs) return a.score.averageLatencyMs - b.score.averageLatencyMs;
    return a.score.totalToolCalls - b.score.totalToolCalls;
  });
  const ranked = current.map((entry, index) => ({ ...entry, rank: index + 1 }));
  writeFrontier(agentDir, benchmarkId, ranked);
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
