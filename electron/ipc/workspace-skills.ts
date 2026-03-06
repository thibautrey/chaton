import electron from "electron";
import fs from "node:fs";
import path from "node:path";

const { app } = electron;

type ExternalSkillEntry = {
  source: string;
  title: string;
  description: string;
  author?: string;
  installs?: number;
  stars?: number;
  highlighted?: boolean;
};

const SKILLS_CACHE_PATH = path.join(app.getPath("userData"), "skills-catalog-cache.json");
const SKILLS_CACHE_TTL_MS = 1000 * 60 * 30;

function normalizeExternalSkill(entry: unknown): ExternalSkillEntry | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  const source =
    (typeof e.source === "string" && e.source) ||
    (typeof e.slug === "string" && e.slug) ||
    (typeof e.id === "string" && e.id) ||
    "";
  if (!source) return null;
  return {
    source,
    title:
      (typeof e.title === "string" && e.title) ||
      (typeof e.name === "string" && e.name) ||
      source,
    description:
      (typeof e.description === "string" && e.description) ||
      (typeof e.summary === "string" && e.summary) ||
      "Pi skill package",
    author: typeof e.author === "string" ? e.author : undefined,
    installs: typeof e.installs === "number" ? e.installs : undefined,
    stars: typeof e.stars === "number" ? e.stars : undefined,
    highlighted: e.highlighted === true,
  };
}

function readSkillsCache():
  | { updatedAt: string; entries: ExternalSkillEntry[] }
  | null {
  if (!fs.existsSync(SKILLS_CACHE_PATH)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(SKILLS_CACHE_PATH, "utf8")) as {
      updatedAt?: unknown;
      entries?: unknown;
    };
    if (
      !parsed ||
      typeof parsed.updatedAt !== "string" ||
      !Array.isArray(parsed.entries)
    ) {
      return null;
    }
    return {
      updatedAt: parsed.updatedAt,
      entries: parsed.entries
        .map((entry) => normalizeExternalSkill(entry))
        .filter((entry): entry is ExternalSkillEntry => entry !== null),
    };
  } catch {
    return null;
  }
}

function writeSkillsCache(entries: ExternalSkillEntry[]) {
  fs.writeFileSync(
    SKILLS_CACHE_PATH,
    `${JSON.stringify({ updatedAt: new Date().toISOString(), entries }, null, 2)}\n`,
    "utf8",
  );
}

function isSkillsCacheFresh(cache: { updatedAt: string } | null): boolean {
  if (!cache) return false;
  const ts = Date.parse(cache.updatedAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < SKILLS_CACHE_TTL_MS;
}

async function fetchSkillsCatalogFromWeb() {
  const endpoints = [
    "https://skills.sh/api/skills",
    "https://www.skills.sh/api/skills",
    "https://skills.sh/skills.json",
    "https://www.skills.sh/skills.json",
  ];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { headers: { accept: "application/json" } });
      if (!response.ok) continue;
      const json = (await response.json()) as unknown;
      const list = Array.isArray(json)
        ? json
        : json && typeof json === "object" && Array.isArray((json as { skills?: unknown }).skills)
          ? ((json as { skills: unknown[] }).skills)
          : [];
      const entries = list
        .map((entry) => normalizeExternalSkill(entry))
        .filter((entry): entry is ExternalSkillEntry => entry !== null);
      if (entries.length > 0) {
        writeSkillsCache(entries);
        return {
          ok: true as const,
          entries,
          source: "remote" as const,
          updatedAt: new Date().toISOString(),
        };
      }
    } catch {
      // try next endpoint
    }
  }
  return null;
}

export async function listSkillsCatalog() {
  const cache = readSkillsCache();
  if (cache && isSkillsCacheFresh(cache)) {
    return {
      ok: true as const,
      entries: cache.entries,
      source: "cache" as const,
      updatedAt: cache.updatedAt,
    };
  }

  const remote = await fetchSkillsCatalogFromWeb();
  if (remote) return remote;

  return {
    ok: true as const,
    entries: cache?.entries ?? [],
    source: "cache" as const,
    updatedAt: cache?.updatedAt ?? new Date(0).toISOString(),
  };
}
