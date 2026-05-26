/**
 * Icon URL normalization and resolution utilities for the marketplace API.
 *
 * Ensures icon URLs are properly formatted as absolute URLs that can be
 * fetched from the landing page and Chatons app.
 *
 * Strategy:
 * - If iconUrl is already absolute (http/https), use it as-is
 * - If iconUrl is a relative path, convert to API endpoint: /api/icons/...
 * - If iconUrl is null/empty, return null
 */

const API_BASE = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : process.env.API_URL || "http://localhost:3456";

/**
 * Normalize an icon URL to ensure it's absolute and accessible.
 *
 * @param iconUrl - Raw icon URL from the catalog (may be relative, absolute, or null)
 * @returns Absolute HTTPS URL or null if no icon is available
 */
export function normalizeIconUrl(iconUrl: string | null | undefined): string | null {
  if (!iconUrl) return null;

  // Already absolute URL - return as-is
  if (iconUrl.startsWith("http://") || iconUrl.startsWith("https://")) {
    return iconUrl;
  }

  // Relative path like /api/icons/... - make absolute
  if (iconUrl.startsWith("/")) {
    return `${API_BASE}${iconUrl}`;
  }

  // Unknown format - return as-is and let browser handle it
  return iconUrl;
}

/**
 * Normalize all icon URLs in an extension entry.
 */
export function normalizeExtensionIconUrl(entry: any): any {
  if (!entry) return entry;
  return {
    ...entry,
    ...(entry.iconUrl !== undefined ? { iconUrl: normalizeIconUrl(entry.iconUrl) } : {}),
  };
}

/**
 * Normalize all icon URLs in a catalog.
 */
export function normalizeCatalogIconUrls(catalog: any): any {
  if (!catalog) return catalog;
  return {
    ...catalog,
    builtin: (catalog.builtin || []).map(normalizeExtensionIconUrl),
    channel: (catalog.channel || []).map(normalizeExtensionIconUrl),
    tool: (catalog.tool || []).map(normalizeExtensionIconUrl),
  };
}
