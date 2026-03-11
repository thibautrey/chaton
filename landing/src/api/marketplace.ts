/**
 * Marketplace API client for fetching extensions from marketplace.chatons.ai
 * Provides caching and fallback support for offline/failure scenarios.
 */

const MARKETPLACE_API_BASE = "https://marketplace.chatons.ai/api";
const CACHE_KEY = "chatons-extensions-catalog";
const CACHE_TTL = 3600000; // 1 hour in milliseconds

export type ExtensionCategory = "channel" | "tool" | "builtin";

export interface ExtensionEntry {
  id: string;
  slug: string;
  name: string;
  version: string;
  description: string;
  category: ExtensionCategory;
  author: string;
  license: string;
  keywords: string[];
  capabilities: string[];
  repositoryUrl: string | null;
  npmUrl: string;
  iconUrl: string | null;
}

export interface ExtensionCatalog {
  generatedAt: string;
  totalCount: number;
  builtin: ExtensionEntry[];
  channel: ExtensionEntry[];
  tool: ExtensionEntry[];
}

interface CacheEntry {
  data: ExtensionCatalog;
  timestamp: number;
}

/**
 * Fetch the extension catalog from the marketplace API with in-memory caching.
 * Falls back to returning null if the request fails (client can handle gracefully).
 */
export async function fetchExtensionsCatalog(
  options?: { useCache?: boolean; timeout?: number }
): Promise<ExtensionCatalog | null> {
  const { useCache = true, timeout = 10000 } = options || {};

  // Check in-memory cache
  if (useCache) {
    const cached = getCachedCatalog();
    if (cached) {
      console.log("[Marketplace] Using cached extensions catalog");
      return cached;
    }
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const url = `${MARKETPLACE_API_BASE}/extensions`;
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(
        `[Marketplace] API returned ${response.status} when fetching ${url}`
      );
      return null;
    }

    const catalog: ExtensionCatalog = await response.json();

    // Validate catalog structure
    if (!isCatalogValid(catalog)) {
      console.warn("[Marketplace] Received invalid catalog structure");
      return null;
    }

    // Cache the result
    setCachedCatalog(catalog);

    console.log(
      `[Marketplace] Fetched catalog with ${catalog.totalCount} extensions`
    );
    return catalog;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("[Marketplace] API request timed out");
    } else {
      console.warn("[Marketplace] Failed to fetch extensions catalog:", error);
    }
    return null;
  }
}

/**
 * Search the extension catalog by query string.
 * Returns extensions matching by name, description, id, or keywords.
 */
export async function searchExtensions(
  query: string
): Promise<ExtensionEntry[] | null> {
  const catalog = await fetchExtensionsCatalog();
  if (!catalog) return null;

  const q = query.toLowerCase();
  const results: ExtensionEntry[] = [];

  for (const category of ["builtin", "channel", "tool"] as const) {
    const entries = catalog[category];
    for (const ext of entries) {
      if (
        ext.name.toLowerCase().includes(q) ||
        ext.description.toLowerCase().includes(q) ||
        ext.id.toLowerCase().includes(q) ||
        ext.keywords.some((k) => k.toLowerCase().includes(q))
      ) {
        results.push(ext);
      }
    }
  }

  return results;
}

/**
 * Filter catalog by category.
 */
export async function filterByCategory(
  category: ExtensionCategory
): Promise<ExtensionEntry[] | null> {
  const catalog = await fetchExtensionsCatalog();
  if (!catalog) return null;
  return catalog[category];
}

/**
 * Get a single extension by slug.
 */
export async function getExtensionBySlug(
  slug: string
): Promise<ExtensionEntry | null> {
  const catalog = await fetchExtensionsCatalog();
  if (!catalog) return null;

  for (const category of ["builtin", "channel", "tool"] as const) {
    const ext = catalog[category].find((e) => e.slug === slug);
    if (ext) return ext;
  }

  return null;
}

// ============================================================================
// Private helpers
// ============================================================================

function isCatalogValid(data: unknown): data is ExtensionCatalog {
  if (typeof data !== "object" || data === null) return false;

  const catalog = data as Record<string, unknown>;

  return (
    typeof catalog.generatedAt === "string" &&
    typeof catalog.totalCount === "number" &&
    Array.isArray(catalog.builtin) &&
    Array.isArray(catalog.channel) &&
    Array.isArray(catalog.tool)
  );
}

function getCachedCatalog(): ExtensionCatalog | null {
  try {
    const stored = sessionStorage.getItem(CACHE_KEY);
    if (!stored) return null;

    const entry: CacheEntry = JSON.parse(stored);
    const age = Date.now() - entry.timestamp;

    if (age > CACHE_TTL) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

function setCachedCatalog(catalog: ExtensionCatalog): void {
  try {
    const entry: CacheEntry = {
      data: catalog,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Silently fail if storage is unavailable
  }
}
