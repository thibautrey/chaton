import electron from "electron";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const { app } = electron;

type ExternalSkillEntry = {
  source: string;
  title: string;
  description: string;
  author?: string;
  installs?: number;
  stars?: number;
  highlighted?: boolean;
  category?: string;
  tags?: string[];
  language?: string;
  lastUpdated?: string;
  featured?: boolean;
  popularity?: 'new' | 'trending' | 'popular' | 'recommended'
  repository?: string;
  documentation?: string;
  dependencies?: string[];
  createdAt?: string;
  sourceRepository?: 'skills.sh' | 'cloudhub' | 'unknown';
};

const SKILLS_CACHE_PATH = path.join(app.getPath("userData"), "skills-catalog-cache.json");
const SKILLS_CACHE_TTL_MS = 1000 * 60 * 30;

function normalizeExternalSkill(entry: unknown, source: 'skills.sh' | 'cloudhub' = 'skills.sh'): ExternalSkillEntry | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  const skillSource =
    (typeof e.source === "string" && e.source) ||
    (typeof e.slug === "string" && e.slug) ||
    (typeof e.id === "string" && e.id) ||
    "";
  if (!skillSource) return null;
  
  const title =
    (typeof e.title === "string" && e.title) ||
    (typeof e.name === "string" && e.name) ||
    skillSource;
  
  const keywords = Array.isArray(e.keywords) ? (e.keywords as string[]) : 
                   Array.isArray(e.tags) ? (e.tags as string[]) : [];
  
  const category = detectSkillCategory(keywords, skillSource, title);
  const language = extractLanguage(e);
  const lastUpdated = extractLastUpdated(e);
  const createdAt = extractCreatedAt(e);
  const dependencies = extractDependencies(e);
  const documentation = extractDocumentation(e);
  const repository = extractRepository(e);
  
  // Determine popularity using improved algorithm with time decay
  const popularityTier = calculatePopularity({
    installs: typeof e.installs === "number" ? e.installs : 0,
    stars: typeof e.stars === "number" ? e.stars : 0,
    highlighted: e.highlighted === true,
    createdAt,
    lastUpdated,
  });
  
  return {
    source: skillSource,
    title,
    description:
      (typeof e.description === "string" && e.description) ||
      (typeof e.summary === "string" && e.summary) ||
      "Pi skill package",
    author: typeof e.author === "string" ? e.author : undefined,
    installs: typeof e.installs === "number" ? e.installs : undefined,
    stars: typeof e.stars === "number" ? e.stars : undefined,
    highlighted: e.highlighted === true,
    category,
    tags: keywords.slice(0, 3),
    language,
    lastUpdated,
    createdAt,
    featured: e.highlighted === true || (typeof e.stars === "number" && e.stars > 100),
    popularity: popularityTier,
    repository,
    documentation,
    dependencies,
    sourceRepository: source,
  };
}

interface PopularityInputs {
  installs: number;
  stars: number;
  highlighted: boolean;
  createdAt?: string;
  lastUpdated?: string;
}

function calculatePopularity(inputs: PopularityInputs): 'new' | 'trending' | 'popular' | 'recommended' | undefined {
  const { installs, stars, highlighted, createdAt, lastUpdated } = inputs;
  
  // Time decay scoring
  const now = Date.now();
  let ageScore = 0;
  let activityScore = 0;
  
  if (createdAt) {
    const createdTime = new Date(createdAt).getTime();
    const ageInDays = (now - createdTime) / (1000 * 60 * 60 * 24);
    // Skills created in last 30 days get high score
    if (ageInDays < 30) ageScore = 100;
    else if (ageInDays < 90) ageScore = 60;
  }
  
  if (lastUpdated) {
    const updateTime = new Date(lastUpdated).getTime();
    const daysSinceUpdate = (now - updateTime) / (1000 * 60 * 60 * 24);
    // Recently updated skills get activity bonus
    if (daysSinceUpdate < 7) activityScore = 50;
    else if (daysSinceUpdate < 30) activityScore = 30;
  }
  
  // Engagement scoring
  const engagementScore = (installs / 100) + (stars * 5); // Stars weighted heavier
  
  // Overall score
  const totalScore = ageScore + activityScore + engagementScore;
  
  if (highlighted) return 'recommended';
  if (totalScore > 500) return 'trending';
  if (totalScore > 200) return 'popular';
  if (ageScore > 80) return 'new';
  
  return undefined;
}

function extractCreatedAt(e: Record<string, unknown>): string | undefined {
  if (typeof e.createdAt === "string") return e.createdAt;
  if (typeof e.created_at === "string") return e.created_at;
  if (typeof e.publishedAt === "string") return e.publishedAt;
  if (typeof e.published_at === "string") return e.published_at;
  return undefined;
}

function extractRepository(e: Record<string, unknown>): string | undefined {
  if (typeof e.repository === "string") return e.repository;
  if (typeof e.repo === "string") return e.repo;
  if (typeof e.github === "string") return e.github;
  if (typeof e.repositoryUrl === "string") return e.repositoryUrl;
  return undefined;
}

function extractDocumentation(e: Record<string, unknown>): string | undefined {
  if (typeof e.documentation === "string") return e.documentation;
  if (typeof e.docs === "string") return e.docs;
  if (typeof e.readme === "string") return e.readme;
  if (typeof e.docUrl === "string") return e.docUrl;
  if (typeof e.homepage === "string") return e.homepage;
  return undefined;
}

function extractDependencies(e: Record<string, unknown>): string[] | undefined {
  if (Array.isArray(e.dependencies)) {
    const deps = (e.dependencies as unknown[])
      .map(d => typeof d === "string" ? d : typeof d === "object" && d && typeof (d as any).name === "string" ? (d as any).name : null)
      .filter((d): d is string => d !== null);
    return deps.length > 0 ? deps : undefined;
  }
  if (Array.isArray(e.requires)) {
    const reqs = (e.requires as unknown[]).filter((r): r is string => typeof r === "string");
    return reqs.length > 0 ? reqs : undefined;
  }
  return undefined;
}

function detectSkillCategory(keywords: string[], source: string, title: string): string {
  const keywordStr = keywords.join(' ').toLowerCase();
  const sourceStr = source.toLowerCase();
  const titleStr = title.toLowerCase();
  const combined = `${keywordStr} ${sourceStr} ${titleStr}`;
  
  if (combined.includes('github') || combined.includes('git')) return 'Version Control';
  if (combined.includes('code') || combined.includes('lint') || combined.includes('format')) return 'Code Quality';
  if (combined.includes('ai') || combined.includes('llm') || combined.includes('ml')) return 'AI & ML';
  if (combined.includes('screenshot') || combined.includes('visual') || combined.includes('image')) return 'Visual Tools';
  if (combined.includes('api') || combined.includes('http') || combined.includes('web')) return 'Web & APIs';
  if (combined.includes('pdf') || combined.includes('document')) return 'Document Processing';
  if (combined.includes('database') || combined.includes('sql') || combined.includes('query')) return 'Databases';
  if (combined.includes('test') || combined.includes('debug')) return 'Testing & Debug';
  if (combined.includes('browser') || combined.includes('playwright')) return 'Browser Automation';
  if (combined.includes('security') || combined.includes('scan')) return 'Security';
  if (combined.includes('ci') || combined.includes('deploy') || combined.includes('build')) return 'CI/CD & Deployment';
  if (combined.includes('issue') || combined.includes('project') || combined.includes('task')) return 'Project Management';
  if (combined.includes('write') || combined.includes('read') || combined.includes('file')) return 'File Operations';
  return 'General Tools';
}

function extractLanguage(e: Record<string, unknown>): string | undefined {
  const lang = typeof e.language === "string" ? e.language :
               typeof e.lang === "string" ? e.lang : undefined;
  if (lang && ['typescript', 'python', 'javascript', 'go', 'rust', 'bash', 'shell'].includes(lang.toLowerCase())) {
    return lang;
  }
  return undefined;
}

function extractLastUpdated(e: Record<string, unknown>): string | undefined {
  if (typeof e.lastUpdated === "string") return e.lastUpdated;
  if (typeof e.updated_at === "string") return e.updated_at;
  if (typeof e.updatedAt === "string") return e.updatedAt;
  if (typeof e.publishedAt === "string") return e.publishedAt;
  return undefined;
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
  const skillsShEndpoints = [
    "https://skills.sh/api/skills",
    "https://www.skills.sh/api/skills",
    "https://skills.sh/skills.json",
    "https://www.skills.sh/skills.json",
  ];
  
  const cloudHubEndpoints = [
    "https://api.cloudhub.dev/skills",
    "https://cloudhub.dev/api/skills",
  ];

  const results: { entries: ExternalSkillEntry[]; source: 'skills.sh' | 'cloudhub' }[] = [];

  // Fetch from skills.sh
  for (const endpoint of skillsShEndpoints) {
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
        .map((entry) => normalizeExternalSkill(entry, 'skills.sh'))
        .filter((entry): entry is ExternalSkillEntry => entry !== null);
      if (entries.length > 0) {
        results.push({ entries, source: 'skills.sh' });
        break; // Stop after first successful fetch
      }
    } catch {
      // try next endpoint
    }
  }

  // Fetch from CloudHub (secondary source)
  for (const endpoint of cloudHubEndpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(endpoint, { 
        headers: { 
          accept: "application/json",
          "user-agent": "Chatons/1.0"
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) continue;
      const json = (await response.json()) as unknown;
      const list = Array.isArray(json)
        ? json
        : json && typeof json === "object" && Array.isArray((json as { skills?: unknown }).skills)
          ? ((json as { skills: unknown[] }).skills)
          : json && typeof json === "object" && Array.isArray((json as { items?: unknown }).items)
            ? ((json as { items: unknown[] }).items)
            : [];
      const entries = list
        .map((entry) => normalizeExternalSkill(entry, 'cloudhub'))
        .filter((entry): entry is ExternalSkillEntry => entry !== null);
      if (entries.length > 0) {
        results.push({ entries, source: 'cloudhub' });
        break; // Stop after first successful fetch
      }
    } catch {
      // try next endpoint
    }
  }

  // Merge results, removing duplicates by source identifier
  if (results.length > 0) {
    const mergedMap = new Map<string, ExternalSkillEntry>();
    for (const { entries } of results) {
      for (const entry of entries) {
        // Use source as key to avoid duplicates
        if (!mergedMap.has(entry.source)) {
          mergedMap.set(entry.source, entry);
        }
      }
    }
    const merged = Array.from(mergedMap.values());
    writeSkillsCache(merged);
    return {
      ok: true as const,
      entries: merged,
      source: results.length > 1 ? "hybrid" : results[0]!.source,
      updatedAt: new Date().toISOString(),
    };
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

export type SkillsRating = {
  skillSource: string;
  rating: number; // 1-5
  review?: string;
  createdAt: string;
  userId: string; // hashed/anonymous
};

const RATINGS_CACHE_PATH = path.join(app.getPath("userData"), "skills-ratings.json");

function readSkillsRatings(): SkillsRating[] {
  if (!fs.existsSync(RATINGS_CACHE_PATH)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(RATINGS_CACHE_PATH, "utf8")) as unknown;
    return Array.isArray(data) ? (data as SkillsRating[]) : [];
  } catch {
    return [];
  }
}

function writeSkillsRatings(ratings: SkillsRating[]) {
  fs.writeFileSync(
    RATINGS_CACHE_PATH,
    `${JSON.stringify(ratings, null, 2)}\n`,
    "utf8",
  );
}

export function getSkillsRatings(skillSource?: string): SkillsRating[] {
  const ratings = readSkillsRatings();
  if (!skillSource) return ratings;
  return ratings.filter(r => r.skillSource === skillSource);
}

export function addSkillRating(skillSource: string, rating: number, review?: string): SkillsRating {
  const ratings = readSkillsRatings();
  const userId = crypto.createHash('sha256').update(`${Date.now()}-local`).digest('hex').slice(0, 16);
  
  const entry: SkillsRating = {
    skillSource,
    rating: Math.max(1, Math.min(5, rating)),
    review,
    createdAt: new Date().toISOString(),
    userId,
  };
  
  ratings.push(entry);
  writeSkillsRatings(ratings);
  return entry;
}

export function getSkillAverageRating(skillSource: string): { average: number; count: number } {
  const ratings = getSkillsRatings(skillSource);
  if (ratings.length === 0) return { average: 0, count: 0 };
  
  const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
  return {
    average: sum / ratings.length,
    count: ratings.length,
  };
}

export async function getSkillsMarketplace() {
  const catalogResult = await listSkillsCatalog();
  if (!catalogResult.ok) {
    return {
      ok: false as const,
      message: "Failed to load skills marketplace",
    };
  }

  const entries = catalogResult.entries;

  // Organize by category
  const byCategory: Record<string, ExternalSkillEntry[]> = {};
  for (const entry of entries) {
    const cat = entry.category ?? "General Tools";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(entry);
  }

  // Sort by installs/stars within each category
  Object.keys(byCategory).forEach(cat => {
    byCategory[cat].sort((a, b) => {
      const aScore = (a.installs || 0) + (a.stars || 0) * 10;
      const bScore = (b.installs || 0) + (b.stars || 0) * 10;
      return bScore - aScore;
    });
  });

  // Get featured skills
  const featured = entries
    .filter(e => e.featured === true)
    .sort((a, b) => ((b.stars || 0) - (a.stars || 0)))
    .slice(0, 6);

  // Get new skills (last 30 days)
  const new_skills = entries
    .filter(e => e.popularity === 'new')
    .sort((a, b) => {
      const aTime = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
      const bTime = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 8);

  // Get trending (most installed/starred)
  const trending = entries
    .filter(e => e.popularity === 'trending' || e.popularity === 'popular')
    .sort((a, b) => {
      const aScore = (a.installs || 0) + (a.stars || 0) * 10;
      const bScore = (b.installs || 0) + (b.stars || 0) * 10;
      return bScore - aScore;
    })
    .slice(0, 8);

  return {
    ok: true as const,
    featured,
    new: new_skills,
    trending,
    byCategory: Object.entries(byCategory)
      .map(([name, items]) => ({
        name,
        count: items.length,
        items: items.slice(0, 12),
      }))
      .sort((a, b) => b.count - a.count),
    updatedAt: catalogResult.updatedAt,
    source: catalogResult.source,
  };
}

export interface SkillsFilterOptions {
  query?: string;
  category?: string;
  language?: string;
  minInstalls?: number;
  minStars?: number;
  source?: 'skills.sh' | 'cloudhub' | 'all';
  createdAfter?: string;
  updatedAfter?: string;
  sortBy?: 'installs' | 'stars' | 'recent' | 'rating' | 'trending';
  limit?: number;
}

export async function getSkillsMarketplaceFiltered(options: SkillsFilterOptions) {
  const catalogResult = await listSkillsCatalog();
  if (!catalogResult.ok) {
    return {
      ok: false as const,
      message: "Failed to load skills marketplace",
      results: [],
    };
  }

  let entries = catalogResult.entries;

  // Apply filters
  if (options.query) {
    const query = options.query.toLowerCase();
    entries = entries.filter(e => 
      e.title.toLowerCase().includes(query) ||
      e.description.toLowerCase().includes(query) ||
      e.tags?.some(t => t.toLowerCase().includes(query)) ||
      e.source.toLowerCase().includes(query)
    );
  }

  if (options.category) {
    entries = entries.filter(e => e.category === options.category);
  }

  if (options.language) {
    entries = entries.filter(e => e.language?.toLowerCase() === options.language?.toLowerCase());
  }

  if (options.minInstalls) {
    entries = entries.filter(e => (e.installs || 0) >= options.minInstalls!);
  }

  if (options.minStars) {
    entries = entries.filter(e => (e.stars || 0) >= options.minStars!);
  }

  if (options.source && options.source !== 'all') {
    entries = entries.filter(e => e.sourceRepository === options.source);
  }

  if (options.createdAfter) {
    const afterTime = new Date(options.createdAfter).getTime();
    entries = entries.filter(e => {
      if (!e.createdAt) return false;
      return new Date(e.createdAt).getTime() >= afterTime;
    });
  }

  if (options.updatedAfter) {
    const afterTime = new Date(options.updatedAfter).getTime();
    entries = entries.filter(e => {
      if (!e.lastUpdated) return false;
      return new Date(e.lastUpdated).getTime() >= afterTime;
    });
  }

  // Apply sorting
  const sortBy = options.sortBy || 'trending';
  entries.sort((a, b) => {
    switch (sortBy) {
      case 'installs':
        return (b.installs || 0) - (a.installs || 0);
      case 'stars':
        return (b.stars || 0) - (a.stars || 0);
      case 'recent':
        const aTime = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
        const bTime = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
        return bTime - aTime;
      case 'rating': {
        const aRating = getSkillAverageRating(a.source).average;
        const bRating = getSkillAverageRating(b.source).average;
        return bRating - aRating;
      }
      case 'trending':
      default: {
        const aScore = (a.installs || 0) + (a.stars || 0) * 10;
        const bScore = (b.installs || 0) + (b.stars || 0) * 10;
        return bScore - aScore;
      }
    }
  });

  const limit = options.limit || 100;
  const results = entries.slice(0, limit);

  // Enrich with ratings
  const enrichedResults = results.map(skill => ({
    ...skill,
    rating: getSkillAverageRating(skill.source),
  }));

  return {
    ok: true as const,
    results: enrichedResults,
    total: entries.length,
    returned: results.length,
  };
}
