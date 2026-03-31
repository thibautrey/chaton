import fs from "node:fs";
import path from "node:path";

import type { HarnessCandidate } from "./types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function getMetaHarnessRoot(agentDir: string): string {
  return path.join(agentDir, "meta-harness");
}

export function getCandidatesRoot(agentDir: string): string {
  return path.join(getMetaHarnessRoot(agentDir), "candidates");
}

export function getCandidateDir(agentDir: string, candidateId: string): string {
  return path.join(getCandidatesRoot(agentDir), candidateId);
}

export function candidateFilePath(agentDir: string, candidateId: string): string {
  return path.join(getCandidateDir(agentDir, candidateId), "candidate.json");
}

export function getDefaultHarnessCandidate(): HarnessCandidate {
  return {
    id: "baseline",
    prompt: {},
    bootstrap: {
      environmentSnapshot: {
        enabled: false,
        timeoutMs: 15000,
        maxEntriesPerDir: 20,
      },
    },
    tools: {
      lazyDiscoveryMode: "default",
      subagentPolicy: "default",
    },
    scoring: {
      objectives: ["successRate", "latency", "toolCalls", "tokenCost"],
    },
    description: "Built-in baseline harness candidate",
    createdAt: new Date(0).toISOString(),
  };
}

export function validateHarnessCandidate(value: unknown):
  | { ok: true; value: HarnessCandidate }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isPlainObject(value)) {
    return { ok: false, errors: ["candidate must be an object"] };
  }

  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!id) errors.push("id is required");

  const prompt = isPlainObject(value.prompt) ? value.prompt : {};
  const bootstrap = isPlainObject(value.bootstrap) ? value.bootstrap : {};
  const tools = isPlainObject(value.tools) ? value.tools : {};
  const scoring = isPlainObject(value.scoring) ? value.scoring : {};

  const prependSections = Array.isArray(prompt.prependSections)
    ? prompt.prependSections.filter((item): item is string => typeof item === "string")
    : [];
  const appendSections = Array.isArray(prompt.appendSections)
    ? prompt.appendSections.filter((item): item is string => typeof item === "string")
    : [];

  const environmentSnapshot = isPlainObject(bootstrap.environmentSnapshot)
    ? bootstrap.environmentSnapshot
    : { enabled: false };
  const enabled = environmentSnapshot.enabled === true;
  const timeoutMs =
    typeof environmentSnapshot.timeoutMs === "number" && Number.isFinite(environmentSnapshot.timeoutMs)
      ? Math.max(1, Math.floor(environmentSnapshot.timeoutMs))
      : undefined;
  const maxEntriesPerDir =
    typeof environmentSnapshot.maxEntriesPerDir === "number" && Number.isFinite(environmentSnapshot.maxEntriesPerDir)
      ? Math.max(1, Math.floor(environmentSnapshot.maxEntriesPerDir))
      : undefined;

  const lazyDiscoveryMode =
    tools.lazyDiscoveryMode === "eager" || tools.lazyDiscoveryMode === "minimal"
      ? tools.lazyDiscoveryMode
      : "default";
  const subagentPolicy =
    tools.subagentPolicy === "encourage" || tools.subagentPolicy === "restrict"
      ? tools.subagentPolicy
      : "default";

  const objectives = Array.isArray(scoring.objectives)
    ? scoring.objectives.filter(
        (item): item is "successRate" | "latency" | "toolCalls" | "tokenCost" =>
          item === "successRate" || item === "latency" || item === "toolCalls" || item === "tokenCost",
      )
    : [];

  const parentIds = Array.isArray(value.parentIds)
    ? value.parentIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  const behaviorPrompt =
    typeof value.behaviorPrompt === "string" && value.behaviorPrompt.trim().length > 0
      ? value.behaviorPrompt.trim()
      : undefined;

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      id,
      ...(parentIds.length > 0 ? { parentIds } : {}),
      prompt: {
        ...(prependSections.length > 0 ? { prependSections } : {}),
        ...(appendSections.length > 0 ? { appendSections } : {}),
      },
      bootstrap: {
        environmentSnapshot: {
          enabled,
          ...(timeoutMs ? { timeoutMs } : {}),
          ...(maxEntriesPerDir ? { maxEntriesPerDir } : {}),
        },
      },
      tools: {
        lazyDiscoveryMode,
        subagentPolicy,
      },
      scoring: {
        objectives: objectives.length > 0 ? objectives : ["successRate", "latency", "toolCalls", "tokenCost"],
      },
      ...(behaviorPrompt ? { behaviorPrompt } : {}),
      ...(typeof value.createdAt === "string" ? { createdAt: value.createdAt } : {}),
      ...(typeof value.description === "string" && value.description.trim().length > 0
        ? { description: value.description.trim() }
        : {}),
    },
  };
}

export function ensureCandidateStored(agentDir: string, candidate: HarnessCandidate): void {
  const dir = getCandidateDir(agentDir, candidate.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(candidateFilePath(agentDir, candidate.id), `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
}

export function loadHarnessCandidate(agentDir: string, candidateId?: string | null): HarnessCandidate {
  const defaultCandidate = getDefaultHarnessCandidate();
  if (!candidateId || candidateId.trim().length === 0 || candidateId === defaultCandidate.id) {
    ensureCandidateStored(agentDir, defaultCandidate);
    return defaultCandidate;
  }

  const filePath = candidateFilePath(agentDir, candidateId.trim());
  if (!fs.existsSync(filePath)) {
    throw new Error(`Harness candidate not found: ${candidateId}`);
  }
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  const validated = validateHarnessCandidate(raw);
  if (!validated.ok) {
    throw new Error(`Invalid harness candidate ${candidateId}: ${validated.errors.join(", ")}`);
  }
  return validated.value;
}

export function listStoredHarnessCandidateIds(agentDir: string): string[] {
  const dir = getCandidatesRoot(agentDir);
  const ids = new Set<string>([getDefaultHarnessCandidate().id]);
  if (!fs.existsSync(dir)) return Array.from(ids).sort();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    ids.add(entry.name);
  }
  return Array.from(ids).sort();
}
