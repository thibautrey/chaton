import crypto from 'node:crypto'
import fs from 'node:fs'
import { listChatonsExtensions, type ChatonsExtensionRegistryEntry } from '../manager.js'
import { AUTOMATION_MANIFEST, AUTOMATION_TRIGGER_TOPICS, BUILTIN_AUTOMATION_DIR, BUILTIN_AUTOMATION_ID, BUILTIN_BROWSER_DIR, BUILTIN_BROWSER_ID, BUILTIN_IDE_LAUNCHER_DIR, BUILTIN_IDE_LAUNCHER_ID, BUILTIN_MEMORY_DIR, BUILTIN_MEMORY_ID } from './constants.js'
import { ensureDirs } from './logging.js'
import { normalizeManifest, readManifestFromExtensionDir, resolveIconWithMarketplaceFallback } from './manifest.js'
import { runtimeState } from './state.js'
import type { ExtensionManifest } from './types.js'

let emitHostEventRef: ((topic: string, payload: unknown) => unknown) | null = null
let subscribeExtensionRef: ((extensionId: string, topic: string, options?: { projectId?: string; conversationId?: string }) => { ok: true; subscriptionId: string } | { ok: false; message: string }) | null = null
let ensureExtensionServerStartedRef: ((extensionId: string) => Promise<void>) | null = null

export function configureRegistryRuntime(deps: {
  emitHostEvent: (topic: string, payload: unknown) => unknown
  subscribeExtension: (extensionId: string, topic: string, options?: { projectId?: string; conversationId?: string }) => { ok: true; subscriptionId: string } | { ok: false; message: string }
  ensureExtensionServerStarted: (extensionId: string) => Promise<void>
}) {
  emitHostEventRef = deps.emitHostEvent
  subscribeExtensionRef = deps.subscribeExtension
  ensureExtensionServerStartedRef = deps.ensureExtensionServerStarted
}

export function initializeExtensionsRuntime() {
  // Initialize runtime state synchronously (fast, ~5ms)
  initializeExtensionsRuntimeSync()

  // Schedule async loading in background (non-blocking, ~5-10s)
  // Use setImmediate to yield to event loop, allowing UI to render first
  setImmediate(() => {
    initializeExtensionsRuntimeAsync().catch((error) => {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('Failed to load extensions asynchronously:', msg)
      emitHostEventRef?.('extensions.loading_failed', {
        error: msg,
        timestamp: new Date().toISOString(),
      })
    })
  })
}

export function initializeExtensionsRuntimeSync() {
  // Phase 1: Clear and initialize state (fast)
  ensureDirs()
  runtimeState.manifests.clear()
  runtimeState.extensionRoots.clear()
  runtimeState.subscriptions.clear()
  runtimeState.capabilityUsage.clear()
  runtimeState.isLoading = true
  runtimeState.loadingStartedAt = Date.now()

  // Kill existing server processes
  runtimeState.serverProcesses.forEach((child) => {
    try {
      child.kill('SIGTERM')
    } catch {
      // ignore
    }
  })
  runtimeState.serverProcesses.clear()
  runtimeState.serverStatus.clear()

  // Phase 2: Load builtin extensions synchronously (they're required immediately)
  const builtinManifest = (() => {
    const manifestPath = `${BUILTIN_AUTOMATION_DIR}/chaton.extension.json`
    try {
      const raw = fs.readFileSync(manifestPath, 'utf8')
      return normalizeManifest(JSON.parse(raw) as unknown)
    } catch {
      return null
    }
  })()
  runtimeState.manifests.set(BUILTIN_AUTOMATION_ID, builtinManifest ?? AUTOMATION_MANIFEST)
  runtimeState.extensionRoots.set(BUILTIN_AUTOMATION_ID, BUILTIN_AUTOMATION_DIR)

  const builtinMemoryManifest = (() => {
    const manifestPath = `${BUILTIN_MEMORY_DIR}/chaton.extension.json`
    try {
      const raw = fs.readFileSync(manifestPath, 'utf8')
      return normalizeManifest(JSON.parse(raw) as unknown)
    } catch {
      return null
    }
  })()
  if (builtinMemoryManifest) {
    runtimeState.manifests.set(BUILTIN_MEMORY_ID, builtinMemoryManifest)
  }
  runtimeState.extensionRoots.set(BUILTIN_MEMORY_ID, BUILTIN_MEMORY_DIR)

  const builtinBrowserManifest = (() => {
    const manifestPath = `${BUILTIN_BROWSER_DIR}/chaton.extension.json`
    try {
      const raw = fs.readFileSync(manifestPath, 'utf8')
      return normalizeManifest(JSON.parse(raw) as unknown)
    } catch {
      return null
    }
  })()
  if (builtinBrowserManifest) {
    runtimeState.manifests.set(BUILTIN_BROWSER_ID, builtinBrowserManifest)
  }
  runtimeState.extensionRoots.set(BUILTIN_BROWSER_ID, BUILTIN_BROWSER_DIR)

  const builtinIdeLauncherManifest = (() => {
    const manifestPath = `${BUILTIN_IDE_LAUNCHER_DIR}/chaton.extension.json`
    try {
      const raw = fs.readFileSync(manifestPath, 'utf8')
      return normalizeManifest(JSON.parse(raw) as unknown)
    } catch {
      return null
    }
  })()
  if (builtinIdeLauncherManifest) {
    runtimeState.manifests.set(BUILTIN_IDE_LAUNCHER_ID, builtinIdeLauncherManifest)
  }
  runtimeState.extensionRoots.set(BUILTIN_IDE_LAUNCHER_ID, BUILTIN_IDE_LAUNCHER_DIR)

  // Phase 3: Subscribe to automation topics (fast)
  if (subscribeExtensionRef) {
    for (const topic of AUTOMATION_TRIGGER_TOPICS) {
      subscribeExtensionRef(BUILTIN_AUTOMATION_ID, topic)
    }
  }

  runtimeState.started = true
  emitHostEventRef?.('app.started', { startedAt: new Date().toISOString() })
}

export async function initializeExtensionsRuntimeAsync() {
  // Phase 4: Load installed channel/other extensions asynchronously (slow)
  try {
    const installed = listChatonsExtensions().extensions
    
    for (const extension of installed) {
      // Skip built-ins (already loaded)
      if (extension.id === BUILTIN_AUTOMATION_ID || extension.id === BUILTIN_MEMORY_ID || extension.id === BUILTIN_BROWSER_ID || extension.id === BUILTIN_IDE_LAUNCHER_ID) {
        continue
      }
      
      // Skip disabled extensions
      if (!extension.enabled) {
        continue
      }

      // Load each extension manifest
      const fromDir = readManifestFromExtensionDir(extension.id)
      if (fromDir) {
        runtimeState.manifests.set(extension.id, fromDir.manifest)
        runtimeState.extensionRoots.set(extension.id, fromDir.root)
      }

      // Yield to event loop periodically to avoid blocking
      // After every 5 extensions, give UI a chance to update
      if (installed.indexOf(extension) % 5 === 0) {
        await new Promise((resolve) => setImmediate(resolve))
      }
    }

    // Phase 5: Start extension servers (also slow, can fail)
    if (ensureExtensionServerStartedRef) {
      const extensionsToStart = Array.from(runtimeState.manifests.values()).filter(
        (manifest) => manifest.server?.start && manifest.id !== BUILTIN_AUTOMATION_ID && manifest.id !== BUILTIN_MEMORY_ID && manifest.id !== BUILTIN_BROWSER_ID && manifest.id !== BUILTIN_IDE_LAUNCHER_ID,
      )

      for (const manifest of extensionsToStart) {
        try {
          void ensureExtensionServerStartedRef(manifest.id)
        } catch (error) {
          // Log but don't block others
          const msg = error instanceof Error ? error.message : String(error)
          console.warn(`Failed to start extension server for ${manifest.id}: ${msg}`)
        }

        // Yield to event loop between starts
        await new Promise((resolve) => setImmediate(resolve))
      }
    }

    // Mark loading as complete
    const loadDuration = Date.now() - (runtimeState.loadingStartedAt ?? Date.now())
    runtimeState.isLoading = false
    
    emitHostEventRef?.('extensions.loaded', {
      count: runtimeState.manifests.size,
      duration: loadDuration,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    runtimeState.isLoading = false
    throw error
  }
}

export function getExtensionManifest(extensionId: string): ExtensionManifest | null {
  return runtimeState.manifests.get(extensionId) ?? null
}

export function listExtensionManifests(): ExtensionManifest[] {
  return Array.from(runtimeState.manifests.values())
}

export function listRegisteredExtensionUi() {
  const installed = listChatonsExtensions().extensions
  const installedById = new Map(installed.map((entry) => [entry.id, entry]))
  return listExtensionManifests().map((manifest) => {
    const installedEntry = installedById.get(manifest.id)
    const usage = Array.from(runtimeState.capabilityUsage.get(manifest.id) ?? new Set())
    // Extract sidebar menu items from all extensions (not just channels)
    const sidebarMenuItems = (manifest.ui?.menuItems ?? []).filter(
      (item) => item.location === 'sidebar'
    )
    const topbarItems = manifest.ui?.topbarItems ?? []
    const serverStatus = runtimeState.serverStatus.get(manifest.id) ?? null
    const channelStatus = runtimeState.channelStatus.get(manifest.id) ?? null
    const icon = manifest.icon
    return {
      extensionId: manifest.id,
      kind: manifest.kind ?? null,
      icon,
      iconUrl: icon ? resolveIconWithMarketplaceFallback(manifest.id, icon) ?? icon : undefined,
      sidebarMenuItems,
      topbarItems,
      mainViews: (manifest.ui?.mainViews ?? []).map((mainView) => ({
        ...mainView,
        icon: mainView.icon ?? manifest.icon,
      })),
      capabilitiesDeclared: manifest.capabilities,
      capabilitiesUsed: usage,
      enabled: installedEntry?.enabled ?? (manifest.id === BUILTIN_AUTOMATION_ID || manifest.id === BUILTIN_MEMORY_ID || manifest.id === BUILTIN_BROWSER_ID || manifest.id === BUILTIN_IDE_LAUNCHER_ID),
      serverStatus,
      channelStatus,
    }
  })
}

export function getExtensionRuntimeHealth() {
  return {
    ok: true as const,
    started: runtimeState.started,
    manifests: listExtensionManifests().length,
    subscriptions: runtimeState.subscriptions.size,
  }
}

export function enrichExtensionsWithRuntimeFields(entries: ChatonsExtensionRegistryEntry[]) {
  return entries.map((entry) => {
    const manifest = getExtensionManifest(entry.id)
    const manifestName = typeof manifest?.name === 'string' ? manifest.name.trim() : ''
    const icon = typeof manifest?.icon === 'string' && manifest.icon.trim() ? manifest.icon.trim() : undefined
    return {
      ...entry,
      name: manifestName || entry.name,
      config: {
        ...(entry.config ?? {}),
        ...(manifest?.kind === 'channel' ? { kind: 'channel' } : {}),
        ...(icon ? { icon } : {}),
        ...(icon ? (() => { const url = resolveIconWithMarketplaceFallback(entry.id, icon); return url ? { iconUrl: url } : {}; })() : {}),
      },
      capabilitiesDeclared: manifest?.capabilities ?? [],
      capabilitiesUsed: Array.from(runtimeState.capabilityUsage.get(entry.id) ?? new Set()),
      healthDetails: {
        runtimeStarted: runtimeState.started,
        subscriptions: Array.from(runtimeState.subscriptions.values()).filter((s) => s.extensionId === entry.id).length,
      },
      apiContracts: manifest?.apis ?? { exposes: [], consumes: [] },
      manifestDigest: manifest ? crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex') : null,
      installed: true,
    }
  })
}

export function loadExtensionManifestIntoRegistry(extensionId: string): boolean {
  if (extensionId === BUILTIN_AUTOMATION_ID || extensionId === BUILTIN_MEMORY_ID || extensionId === BUILTIN_IDE_LAUNCHER_ID) {
    return true
  }
  
  const extension = listChatonsExtensions().extensions.find((e) => e.id === extensionId)
  if (!extension || !extension.enabled) {
    return false
  }
  
  const fromDir = readManifestFromExtensionDir(extensionId)
  if (fromDir) {
    runtimeState.manifests.set(extensionId, fromDir.manifest)
    runtimeState.extensionRoots.set(extensionId, fromDir.root)
    return true
  }
  return false
}

export function getBuiltinAutomationExtensionId() {
  return BUILTIN_AUTOMATION_ID
}
