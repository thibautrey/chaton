import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { BUILTIN_AUTOMATION_DIR, BUILTIN_AUTOMATION_ID, BUILTIN_BROWSER_DIR, BUILTIN_BROWSER_ID, BUILTIN_IDE_LAUNCHER_DIR, BUILTIN_IDE_LAUNCHER_ID, BUILTIN_MEMORY_DIR, BUILTIN_MEMORY_ID, BUILTIN_TPS_MONITOR_DIR, BUILTIN_TPS_MONITOR_ID, EXTENSIONS_DIR, ICON_EXTENSIONS } from './constants.js'
import { runtimeState } from './state.js'
import type { Capability, ExtensionManifest } from './types.js'

// Create a require function relative to this file's location
const requireFromHere = createRequire(import.meta.url)

// Track extensions we already tried (and failed) to download icons for
// so we don't repeatedly hit the network on every UI refresh
const failedIconDownloads = new Set<string>()

/**
 * Resolve the Node.js command to use for spawning scripts.
 * Uses Electron's bundled Node.js when running in Electron.
 */
function resolveNodeCommand(): { command: string; env: Record<string, string> } {
  const execPath = process.execPath
  if (execPath && fs.existsSync(execPath)) {
    // Inside Electron, process.execPath points at the Electron/runtime binary.
    // Force Node compatibility so callers can safely use `-e` and script paths.
    if (process.versions.electron) {
      return {
        command: execPath,
        env: { ELECTRON_RUN_AS_NODE: '1' },
      }
    }
    return { command: execPath, env: {} }
  }
  // Fallback to system node
  return { command: 'node', env: {} }
}

// Callback to look up marketplace iconUrl for an extension.
// Set by the manager module to avoid circular imports.
let lookupMarketplaceIconUrlRef: ((extensionId: string) => string | null) | null = null

export function setMarketplaceIconUrlLookup(fn: (extensionId: string) => string | null) {
  lookupMarketplaceIconUrlRef = fn
}

export function normalizeManifest(value: unknown): ExtensionManifest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const m = value as Record<string, unknown>
  if (typeof m.id !== 'string' || typeof m.name !== 'string' || typeof m.version !== 'string') return null
  const capabilities = Array.isArray(m.capabilities)
    ? m.capabilities.filter((c): c is Capability => typeof c === 'string')
    : []
  return {
    id: m.id,
    name: m.name,
    version: m.version,
    kind: m.kind === 'channel' ? 'channel' : undefined,
    icon: typeof m.icon === 'string' && m.icon.trim().length > 0 ? m.icon.trim() : undefined,
    entrypoints: m.entrypoints && typeof m.entrypoints === 'object' && !Array.isArray(m.entrypoints)
      ? (m.entrypoints as Record<string, string>)
      : undefined,
    ui: m.ui && typeof m.ui === 'object' && !Array.isArray(m.ui)
      ? (m.ui as ExtensionManifest['ui'])
      : undefined,
    capabilities,
    hooks: m.hooks && typeof m.hooks === 'object' && !Array.isArray(m.hooks)
      ? (m.hooks as ExtensionManifest['hooks'])
      : undefined,
    apis: m.apis && typeof m.apis === 'object' && !Array.isArray(m.apis)
      ? (m.apis as ExtensionManifest['apis'])
      : undefined,
    llm: m.llm && typeof m.llm === 'object' && !Array.isArray(m.llm)
      ? (m.llm as ExtensionManifest['llm'])
      : undefined,
    compat: m.compat && typeof m.compat === 'object' && !Array.isArray(m.compat)
      ? (m.compat as ExtensionManifest['compat'])
      : undefined,
    server: m.server && typeof m.server === 'object' && !Array.isArray(m.server)
      ? (m.server as ExtensionManifest['server'])
      : undefined,
  }
}

export function getExtensionRoot(extensionId: string) {
  return runtimeState.extensionRoots.get(extensionId) ?? path.join(EXTENSIONS_DIR, extensionId)
}

function getBuiltinDir(extensionId: string): string | null {
  if (extensionId === BUILTIN_AUTOMATION_ID) return BUILTIN_AUTOMATION_DIR
  if (extensionId === BUILTIN_MEMORY_ID) return BUILTIN_MEMORY_DIR
  if (extensionId === BUILTIN_BROWSER_ID) return BUILTIN_BROWSER_DIR
  if (extensionId === BUILTIN_IDE_LAUNCHER_ID) return BUILTIN_IDE_LAUNCHER_DIR
  if (extensionId === BUILTIN_TPS_MONITOR_ID) return BUILTIN_TPS_MONITOR_DIR
  return null
}

export function getExtensionRootCandidates(extensionId: string): string[] {
  const scopedParts = extensionId.split('/')
  const builtinDir = getBuiltinDir(extensionId)
  return [
    builtinDir,
    runtimeState.extensionRoots.get(extensionId),
    path.join(EXTENSIONS_DIR, extensionId),
    path.join(EXTENSIONS_DIR, 'extensions', extensionId),
    path.join(EXTENSIONS_DIR, extensionId, 'node_modules', ...scopedParts),
    path.join(EXTENSIONS_DIR, 'extensions', extensionId, 'node_modules', ...scopedParts),
  ].filter((value, index, array): value is string => typeof value === 'string' && value.length > 0 && array.indexOf(value) === index)
}

export function readManifestFromExtensionDir(extensionId: string): { manifest: ExtensionManifest; root: string } | null {
  // List of manifest filenames to try, in priority order
  const manifestFileNames = ['manifest.json', 'chaton.extension.json']

  for (const root of getExtensionRootCandidates(extensionId)) {
    // Try each manifest filename
    for (const fileName of manifestFileNames) {
      const manifestPath = path.join(root, fileName)
      if (!fs.existsSync(manifestPath)) continue
      try {
        const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown
        const manifest = normalizeManifest(raw)
        if (manifest) return { manifest, root }
      } catch {
        // ignore invalid manifest candidates and continue searching
      }
    }
  }
  return null
}

export function resolveIconFilePath(extensionId: string, iconPath: string): string | null {
  const relative = String(iconPath || '').trim()
  if (!relative) return null
  const builtinDir = getBuiltinDir(extensionId)
  const rootsToTry = builtinDir
    ? [
        builtinDir,
        ...getExtensionRootCandidates(extensionId),
      ].filter((value, index, array): value is string => typeof value === 'string' && value.length > 0 && array.indexOf(value) === index)
    : getExtensionRootCandidates(extensionId)

  // Build candidate filenames: the exact path plus variants with
  // other supported icon extensions (covers cases where the
  // marketplace icon was downloaded with a different extension
  // than what the manifest declares, e.g. manifest says icon.png
  // but marketplace had icon.svg)
  const baseName = relative.replace(/\.[^.]+$/, '')
  const candidates = [relative]
  for (const [ext] of ICON_EXTENSIONS) {
    const alt = `${baseName}${ext}`
    if (alt !== relative) candidates.push(alt)
  }

  for (const root of rootsToTry) {
    for (const candidateName of candidates) {
      const candidate = path.resolve(root, candidateName)
      if (!candidate.startsWith(path.resolve(root))) continue
      if (fs.existsSync(candidate)) return candidate
    }
  }
  return null
}

export function resolveIconDataUrl(extensionId: string, iconPath: string): string | null {
  const target = resolveIconFilePath(extensionId, iconPath)
  if (!target) return null
  const ext = path.extname(target).toLowerCase()
  const mime = ICON_EXTENSIONS.get(ext)
  if (!mime) return null
  try {
    const data = fs.readFileSync(target)
    return `data:${mime};base64,${data.toString('base64')}`
  } catch {
    return null
  }
}

/**
 * Resolve an extension icon, downloading from the marketplace if the
 * local icon file is missing. Falls back to the marketplace CDN URL
 * when the icon cannot be saved locally.
 *
 * Returns a data-URL (local file) or an HTTPS CDN URL (marketplace).
 */
export function resolveIconWithMarketplaceFallback(extensionId: string, iconPath: string): string | null {
  // Try local resolution first
  const local = resolveIconDataUrl(extensionId, iconPath)
  if (local) return local

  // Skip builtins — they use static bundled icons in the renderer
  if (extensionId === BUILTIN_AUTOMATION_ID || extensionId === BUILTIN_MEMORY_ID || extensionId === BUILTIN_BROWSER_ID || extensionId === BUILTIN_IDE_LAUNCHER_ID) {
    return null
  }

  // Check if we already failed for this extension (avoid repeated network calls)
  if (failedIconDownloads.has(extensionId)) return null

  // Look up marketplace CDN URL
  const marketplaceUrl = lookupMarketplaceIconUrlRef?.(extensionId)
  if (!marketplaceUrl) {
    failedIconDownloads.add(extensionId)
    return null
  }

  // Try to download the icon into the extension directory
  try {
    const downloaded = downloadIconSync(extensionId, iconPath, marketplaceUrl)
    if (downloaded) return downloaded
  } catch {
    // Download failed; fall through to use CDN URL directly
  }

  // Return the CDN URL so the renderer can load it directly
  return marketplaceUrl
}

/**
 * Synchronously download an icon from a URL and save it to the
 * extension directory. Returns the data-URL on success or null.
 */
function downloadIconSync(extensionId: string, iconPath: string, url: string): string | null {
  try {
    const node = resolveNodeCommand()
    const result = spawnSync(node.command, ['-e', `
      fetch(${JSON.stringify(url)}, { signal: AbortSignal.timeout(10000) })
        .then(r => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.arrayBuffer();
        })
        .then(buf => {
          const b = Buffer.from(buf);
          process.stdout.write(b.toString('base64'));
        })
        .catch(e => { process.stderr.write(e.message); process.exit(1); });
    `], {
      encoding: 'utf8',
      timeout: 15_000,
      maxBuffer: 5 * 1024 * 1024,
      env: { ...process.env, ...node.env },
    })

    if (result.status !== 0 || !result.stdout) {
      failedIconDownloads.add(extensionId)
      return null
    }

    const data = Buffer.from(result.stdout, 'base64')
    if (data.length === 0) {
      failedIconDownloads.add(extensionId)
      return null
    }

    // Determine file extension from the URL (may differ from manifest icon path)
    const urlExt = path.extname(new URL(url).pathname).toLowerCase()
    const mime = ICON_EXTENSIONS.get(urlExt)
    if (!mime) {
      failedIconDownloads.add(extensionId)
      return null
    }

    // Build the save path: use the manifest icon name but replace its
    // extension with the one from the CDN URL (e.g. manifest says "icon.png"
    // but CDN serves .svg -> save as "icon.svg")
    const manifestBase = iconPath.replace(/\.[^.]+$/, '')
    const saveName = `${manifestBase}${urlExt}`

    const extensionRoot = getExtensionRoot(extensionId)
    const targetPath = path.resolve(extensionRoot, saveName)

    // Security: ensure target is within extension root
    if (!targetPath.startsWith(path.resolve(extensionRoot))) {
      failedIconDownloads.add(extensionId)
      return null
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.writeFileSync(targetPath, data)

    return `data:${mime};base64,${data.toString('base64')}`
  } catch {
    failedIconDownloads.add(extensionId)
    return null
  }
}
