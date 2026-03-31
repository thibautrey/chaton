import fs from "node:fs";
import path from "node:path";

import type { HarnessCandidate, HarnessWorkArea } from "./types.js";
import { HARNESS_WORK_AREAS, WORK_AREA_DEFAULT_OBJECTIVES } from "./types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isValidWorkArea(value: unknown): value is HarnessWorkArea {
  return typeof value === "string" && HARNESS_WORK_AREAS.includes(value as HarnessWorkArea);
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

export function getDefaultHarnessCandidate(workArea: HarnessWorkArea = "environment-bootstrap"): HarnessCandidate {
  return {
    id: `baseline-${workArea}`,
    workArea,
    prompt: {},
    bootstrap: {
      environmentSnapshot: {
        enabled: true,
        timeoutMs: 15000,
        maxEntriesPerDir: 20,
      },
      includeProjectConventions: true,
    },
    tools: {
      lazyDiscoveryMode: "minimal",
      subagentPolicy: "restrict",
    },
    scoring: {
      objectives: WORK_AREA_DEFAULT_OBJECTIVES[workArea],
    },
    description: `Optimized baseline for ${workArea}: environment snapshot enabled, minimal lazy discovery, restrict subagents`,
    createdAt: new Date(0).toISOString(),
  };
}

/**
 * Get all default candidates for all work areas.
 */
export function getAllDefaultCandidates(): HarnessCandidate[] {
  return HARNESS_WORK_AREAS.map(workArea => getDefaultHarnessCandidate(workArea));
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

  const workArea = isValidWorkArea(value.workArea) ? value.workArea : "environment-bootstrap";

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

  const contextFiles = Array.isArray(bootstrap.contextFiles)
    ? bootstrap.contextFiles.filter((item): item is string => typeof item === "string")
    : [];
  const includeProjectConventions = bootstrap.includeProjectConventions === true;

  const lazyDiscoveryMode =
    tools.lazyDiscoveryMode === "eager" || tools.lazyDiscoveryMode === "minimal"
      ? tools.lazyDiscoveryMode
      : "default";
  const subagentPolicy =
    tools.subagentPolicy === "encourage" || tools.subagentPolicy === "restrict"
      ? tools.subagentPolicy
      : "default";

  const preferredTools = Array.isArray(tools.preferredTools)
    ? tools.preferredTools.filter((item): item is string => typeof item === "string")
    : [];
  const avoidedTools = Array.isArray(tools.avoidedTools)
    ? tools.avoidedTools.filter((item): item is string => typeof item === "string")
    : [];

  const validObjectives = [
    "successRate", "latency", "toolCalls", "tokenCost",
    "correctness", "helpfulness", "conciseness", "contextualAwareness"
  ] as const;
  const objectives = Array.isArray(scoring.objectives)
    ? scoring.objectives.filter(
        (item): item is typeof validObjectives[number] => validObjectives.includes(item as typeof validObjectives[number]),
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
      workArea,
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
        ...(contextFiles.length > 0 ? { contextFiles } : {}),
        ...(includeProjectConventions ? { includeProjectConventions } : {}),
      },
      tools: {
        lazyDiscoveryMode,
        subagentPolicy,
        ...(preferredTools.length > 0 ? { preferredTools } : {}),
        ...(avoidedTools.length > 0 ? { avoidedTools } : {}),
      },
      scoring: {
        objectives: objectives.length > 0 ? objectives : WORK_AREA_DEFAULT_OBJECTIVES[workArea],
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

export function loadHarnessCandidate(
  agentDir: string,
  candidateId?: string | null,
  workArea?: string | null,
): HarnessCandidate {
  // Handle baseline candidates for specific work areas
  const workAreaValue = workArea && isValidWorkArea(workArea) ? workArea : "environment-bootstrap";
  const defaultCandidate = getDefaultHarnessCandidate(workAreaValue);

  if (!candidateId || candidateId.trim().length === 0) {
    ensureCandidateStored(agentDir, defaultCandidate);
    return defaultCandidate;
  }

  // Handle explicit baseline requests
  if (candidateId === "baseline" || candidateId.startsWith("baseline-")) {
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

/**
 * Load the best candidate for a specific work area.
 * Returns the active candidate if it matches the work area, otherwise returns the baseline.
 */
export function loadBestCandidateForWorkArea(
  agentDir: string,
  workArea: HarnessWorkArea,
  activeCandidateId?: string | null,
): HarnessCandidate {
  // If there's an active candidate for this work area, use it
  if (activeCandidateId) {
    try {
      const candidate = loadHarnessCandidate(agentDir, activeCandidateId);
      if (candidate.workArea === workArea) {
        return candidate;
      }
    } catch {
      // Fall through to default
    }
  }

  // Otherwise return the baseline for this work area
  return getDefaultHarnessCandidate(workArea);
}

export function listStoredHarnessCandidateIds(agentDir: string): string[] {
  const dir = getCandidatesRoot(agentDir);
  // Include baseline candidates for all work areas
  const ids = new Set<string>(getAllDefaultCandidates().map(c => c.id));
  if (!fs.existsSync(dir)) return Array.from(ids).sort();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    ids.add(entry.name);
  }
  return Array.from(ids).sort();
}

/**
 * Get candidate IDs filtered by work area.
 */
export function listHarnessCandidateIdsForWorkArea(
  agentDir: string,
  workArea: HarnessWorkArea,
): string[] {
  const allIds = listStoredHarnessCandidateIds(agentDir);
  const result: string[] = [];

  for (const id of allIds) {
    try {
      const candidate = loadHarnessCandidate(agentDir, id);
      if (candidate.workArea === workArea) {
        result.push(id);
      }
    } catch {
      // Skip invalid candidates
    }
  }

  return result;
}
