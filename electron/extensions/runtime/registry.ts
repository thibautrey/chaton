import crypto from 'node:crypto'
import fs from 'node:fs'
import { listChatonsExtensions, type ChatonsExtensionRegistryEntry } from '../manager.js'
import { AUTOMATION_MANIFEST, AUTOMATION_TRIGGER_TOPICS, BUILTIN_AUTOMATION_DIR, BUILTIN_AUTOMATION_ID, BUILTIN_MEMORY_DIR, BUILTIN_MEMORY_ID } from './constants.js'
import { ensureDirs } from './logging.js'
import { normalizeManifest, readManifestFromExtensionDir, resolveIconDataUrl } from './manifest.js'
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
  ensureDirs()
  runtimeState.manifests.clear()
  runtimeState.extensionRoots.clear()
  runtimeState.subscriptions.clear()
  runtimeState.capabilityUsage.clear()
  runtimeState.serverProcesses.forEach((child) => {
    try {
      child.kill('SIGTERM')
    } catch {
      // ignore
    }
  })
  runtimeState.serverProcesses.clear()
  runtimeState.serverStatus.clear()

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

  const installed = listChatonsExtensions().extensions
  for (const extension of installed) {
    if (extension.id === BUILTIN_AUTOMATION_ID || extension.id === BUILTIN_MEMORY_ID) {
      continue
    }
    const fromDir = readManifestFromExtensionDir(extension.id)
    if (fromDir) {
      runtimeState.manifests.set(extension.id, fromDir.manifest)
      runtimeState.extensionRoots.set(extension.id, fromDir.root)
    }
  }

  if (subscribeExtensionRef) {
    for (const topic of AUTOMATION_TRIGGER_TOPICS) {
      subscribeExtensionRef(BUILTIN_AUTOMATION_ID, topic)
    }
  }

  runtimeState.started = true
  emitHostEventRef?.('app.started', { startedAt: new Date().toISOString() })

  if (ensureExtensionServerStartedRef) {
    for (const manifest of runtimeState.manifests.values()) {
      if (manifest.server?.start) {
        void ensureExtensionServerStartedRef(manifest.id)
      }
    }
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
    const menuItems = manifest.kind === 'channel'
      ? []
      : (manifest.ui?.menuItems ?? [])
    const serverStatus = runtimeState.serverStatus.get(manifest.id) ?? null
    const icon = manifest.icon
    return {
      extensionId: manifest.id,
      kind: manifest.kind ?? null,
      icon,
      iconUrl: icon ? resolveIconDataUrl(manifest.id, icon) ?? icon : undefined,
      menuItems,
      mainViews: (manifest.ui?.mainViews ?? []).map((mainView) => ({
        ...mainView,
        icon: mainView.icon ?? manifest.icon,
      })),
      capabilitiesDeclared: manifest.capabilities,
      capabilitiesUsed: usage,
      enabled: installedEntry?.enabled ?? manifest.id === BUILTIN_AUTOMATION_ID,
      serverStatus,
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
        ...(icon ? { iconUrl: resolveIconDataUrl(entry.id, icon) ?? icon } : {}),
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

export function getBuiltinAutomationExtensionId() {
  return BUILTIN_AUTOMATION_ID
}
