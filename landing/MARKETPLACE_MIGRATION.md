# Landing Page Extension Catalog Migration

**Migration Date:** March 11, 2026  
**Status:** Complete

## Overview

The landing page extension carousel and marketplace pages have been migrated from using a **build-time generated catalog** to **runtime fetching from marketplace.chatons.ai API**.

### Before (Build-Time Generation)
- Script `scripts/fetch-extensions.js` ran during build
- Fetched extension metadata from npm registry
- Generated static JSON catalog: `src/generated/extensions-catalog.json`
- Bundled catalog into the landing site
- Extensions shown were frozen at build time

### After (Runtime API Fetching)
- Landing page fetches catalog at runtime from `https://marketplace.chatons.ai/api/extensions`
- Falls back to bundled static catalog if API is unavailable
- Extensions update automatically without rebuilding
- In-memory caching (1 hour TTL) with sessionStorage persistence
- Real-time extension metadata from marketplace service

## Files Changed

### New Files
- `landing/src/api/marketplace.ts` — API client for marketplace.chatons.ai
  - Implements fetch with timeout, error handling, and validation
  - Provides helper functions: `fetchExtensionsCatalog()`, `searchExtensions()`, `filterByCategory()`, `getExtensionBySlug()`
  - In-memory + sessionStorage caching

### Modified Files
- `landing/src/extensions-data.ts` — **Complete rewrite**
  - Now exports async functions instead of static constants
  - Retains `getAllExtensions()`, `getExtensionsByCategory()`, `getBuiltinExtensions()`, `getChannelExtensions()`, `getToolExtensions()`, `getExtension()`, `searchExtensionsBy()`
  - Falls back to bundled catalog if API fails
  - Exports types for compatibility

- `landing/src/LandingPage.tsx` — Updated ExtensionCarousel component
  - Added `useEffect` to load extensions on mount
  - Shows loading skeleton while fetching
  - Handles errors gracefully (shows empty carousel)
  - Async extension loading with cleanup

- `landing/src/ExtensionsPage.tsx` — Full async refactoring
  - Loads all extensions on mount
  - Computes category counts from loaded extensions
  - Shows loading skeletons during fetch
  - State management for extensions and loading state

- `landing/src/ExtensionDetailPage.tsx` — Async extension detail loading
  - Loads single extension + all extensions in parallel
  - Shows loading state during fetch
  - Handles not found gracefully
  - Passes allExtensions to RelatedExtensions component

- `landing/package.json` — Build pipeline update
  - Removed `node scripts/fetch-extensions.js &&` from build script
  - Removed `sharp` dependency (no longer needed at build time)
  - Kept `fetch-extensions` script for manual fallback catalog updates

### Static Catalog Retention
- `landing/src/generated/extensions-catalog.json` — Kept as fallback
  - Bundled into the landing site
  - Used when marketplace.chatons.ai is unavailable
  - No longer auto-generated during build (can be manually updated if needed)

## API Contract

### Endpoint
`GET https://marketplace.chatons.ai/api/extensions`

### Response Shape
```json
{
  "generatedAt": "2026-03-11T12:00:00.000Z",
  "totalCount": 24,
  "builtin": [...],
  "channel": [...],
  "tool": [...]
}
```

### Query Parameters (Optional)
- `?category=builtin|channel|tool` — Filter by category
- `?q=search+term` — Search by name/description/keywords

### Caching
- API response: 5-minute CDN cache (via `Cache-Control` headers)
- Client-side: 1-hour session cache (sessionStorage)

## Performance Impact

### Positive
- **No build-time fetch** — Landing build is now faster (no npm registry access)
- **Real-time updates** — Extension changes visible immediately (within 5 min for CDN)
- **Smaller build** — Removed `sharp` dependency
- **No stale data** — Always fetches latest metadata

### Tradeoffs
- **First load slightly slower** — ~500ms to fetch catalog (cached afterward)
- **Network dependency** — Requires connectivity to marketplace.chatons.ai
- **Fallback latency** — Fallback catalog is whatever was last bundled

### Optimization Already In Place
- Session caching (1 hour)
- Abort timeout (10 seconds)
- Parallel loading (ExtensionDetailPage loads extension + related in parallel)
- Skeleton loading UI during fetch

## Error Handling

### API Unavailable
- Client logs warning
- Falls back to bundled static catalog
- User sees slightly stale extension list (but functional)
- No broken UI or blank pages

### Network Timeout
- Timeout after 10 seconds (configurable)
- Falls back to static catalog
- Carousel or page still renders

### Invalid Response
- Response validation checks for required fields
- Malformed responses are rejected
- Falls back to static catalog

## Rollback Plan

If issues arise:

1. **Revert to build-time generation:**
   ```bash
   cd landing
   # Restore build script in package.json:
   "build": "node scripts/fetch-extensions.js && vite build && ..."
   
   npm install sharp  # Re-add sharp dependency
   npm run build
   ```

2. **Disable API fetching (use only static):**
   - Comment out `fetchFromMarketplace()` call in `extensions-data.ts`
   - Uncomment fallback catalog return

3. **Update fallback catalog manually:**
   ```bash
   cd landing
   npm run fetch-extensions
   git add src/generated/extensions-catalog.json
   git commit -m "chore: update fallback extensions catalog"
   ```

## Testing Checklist

- [ ] Landing page loads and extension carousel displays
- [ ] ExtensionsPage loads and filters work
- [ ] Extension detail page loads correctly
- [ ] Search functionality works
- [ ] Category filters work
- [ ] Fallback catalog displays if marketplace.chatons.ai is down
- [ ] Loading states show while fetching
- [ ] No console errors
- [ ] Network DevTools shows fetch to `/api/extensions`
- [ ] Cache works (second load is faster)
- [ ] Mobile responsive

## Documentation Updates

Update the following docs (if they exist):

- `docs/CONTRIBUTING.md` — Note that extension catalog is no longer build-time generated
- `docs/DEPLOYMENT.md` — Mention marketplace.chatons.ai availability requirement
- `docs/README.md` — Update architecture section

## Related Services

- **Extension Registry:** `https://github.com/thibautrey/chaton/tree/main/extension-registry`
- **Marketplace API:** Served at `https://marketplace.chatons.ai/api/extensions`

## Future Improvements

1. **Predictive fetching** — Pre-fetch catalog when user navigates to Extensions page
2. **Category-specific endpoints** — Fetch only needed category (reduce payload)
3. **Icon CDN** — Serve icons from marketplace API instead of npm tarballs
4. **Versioned API** — Support multiple API versions for backward compatibility
5. **Search backend** — Move search to API (enable full-text search, faceting)
6. **Offline support** — Service worker caching for offline extension browsing
7. **Real-time updates** — WebSocket for live catalog updates (new extensions appear without reload)
