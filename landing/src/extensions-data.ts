/**
 * Extension data loader for Chatons landing page.
 *
 * Fetches extensions from marketplace.chatons.ai at runtime.
 * Falls back to the bundled static catalog if the API is unavailable.
 *
 * Migration note: This was previously generated at build time by fetch-extensions.js.
 * Now it fetches dynamically for real-time updates without rebuilding.
 */

import type {
  ExtensionCategory,
  ExtensionEntry,
  ExtensionCatalog,
} from "./api/marketplace";
import {
  fetchExtensionsCatalog as fetchFromMarketplace,
  searchExtensions,
  filterByCategory,
  getExtensionBySlug,
} from "./api/marketplace";

// Fallback static catalog (bundled for when API is unavailable)
import fallbackCatalog from "./generated/extensions-catalog.json";

// ============================================================================
// Runtime fetchers with fallback
// ============================================================================

let catalogCache: ExtensionCatalog | null = null;
let catalogLoadError: Error | null = null;

/**
 * Fetch the complete extension catalog.
 * Returns live data from marketplace.chatons.ai, falling back to bundled catalog.
 */
export async function getExtensionsCatalog(): Promise<ExtensionCatalog> {
  if (catalogCache) {
    return catalogCache;
  }

  // Try to fetch from live API
  const liveCatalog = await fetchFromMarketplace();

  if (liveCatalog) {
    catalogCache = liveCatalog;
    catalogLoadError = null;
    return liveCatalog;
  }

  // Fall back to bundled static catalog
  console.warn(
    "[Extensions] Marketplace API unavailable, using bundled catalog"
  );
  const typedFallback = fallbackCatalog as ExtensionCatalog;
  catalogCache = typedFallback;
  return typedFallback;
}

/**
 * Get flattened array of all extensions across categories.
 * Useful for landing page carousel and listings.
 */
export async function getAllExtensions(): Promise<ExtensionEntry[]> {
  const catalog = await getExtensionsCatalog();
  return [
    ...catalog.builtin,
    ...catalog.tool,
    ...catalog.channel,
  ];
}

/**
 * Get extensions by category.
 */
export async function getExtensionsByCategory(
  category: ExtensionCategory
): Promise<ExtensionEntry[]> {
  const catalog = await getExtensionsCatalog();
  return catalog[category];
}

/**
 * Get builtin extensions.
 */
export async function getBuiltinExtensions(): Promise<ExtensionEntry[]> {
  return getExtensionsByCategory("builtin");
}

/**
 * Get channel extensions.
 */
export async function getChannelExtensions(): Promise<ExtensionEntry[]> {
  return getExtensionsByCategory("channel");
}

/**
 * Get tool extensions.
 */
export async function getToolExtensions(): Promise<ExtensionEntry[]> {
  return getExtensionsByCategory("tool");
}

/**
 * Get a single extension by slug (the URL-friendly identifier).
 */
export async function getExtension(slug: string): Promise<ExtensionEntry | null> {
  return getExtensionBySlug(slug);
}

/**
 * Search extensions by query string.
 */
export async function searchExtensionsBy(
  query: string
): Promise<ExtensionEntry[] | null> {
  return searchExtensions(query);
}

/**
 * Get category label (e.g., "builtin" → "Built-in").
 */
export function getCategoryLabel(category: ExtensionCategory): string {
  switch (category) {
    case "builtin":
      return "Built-in";
    case "channel":
      return "Channel";
    case "tool":
      return "Tool";
  }
}

/**
 * Get category description for marketing text.
 */
export function getCategoryDescription(category: ExtensionCategory): string {
  switch (category) {
    case "builtin":
      return "Core extensions included with every Chatons installation";
    case "channel":
      return "Connect your favorite messaging platforms to Chatons";
    case "tool":
      return "Add new capabilities and integrations to your workspace";
  }
}

// ============================================================================
// Type exports (for compatibility with existing code)
// ============================================================================

export type { ExtensionCategory, ExtensionEntry, ExtensionCatalog };
