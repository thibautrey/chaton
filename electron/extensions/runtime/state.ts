import type { ExtensionRuntimeState } from './types.js'
import type { ChildProcess } from 'node:child_process'

const stoppingServerProcesses = new Set<ChildProcess>()
const DEFAULT_EXTENSION_SERVER_FORCE_KILL_MS = 1500

export const runtimeState: ExtensionRuntimeState = {
  manifests: new Map(),
  extensionRoots: new Map(),
  subscriptions: new Map(),
  capabilityUsage: new Map(),
  serverProcesses: new Map(),
  serverStatus: new Map(),
  channelStatus: new Map(),
  started: false,
  isLoading: false,
  loadingStartedAt: undefined,
}

function trackStoppingServerProcess(child: ChildProcess) {
  stoppingServerProcesses.add(child)
  child.once?.('exit', () => {
    stoppingServerProcesses.delete(child)
  })
}

export function forceKillStoppingExtensionServers() {
  for (const child of Array.from(stoppingServerProcesses)) {
    if (child.exitCode !== null || child.signalCode != null) {
      stoppingServerProcesses.delete(child)
      continue
    }
    try {
      child.kill('SIGKILL')
    } catch {
      // ignore
    }
    stoppingServerProcesses.delete(child)
  }
}

export function stopAllExtensionServers(
  signal: NodeJS.Signals = 'SIGTERM',
  options: { forceAfterMs?: number; unrefForceTimer?: boolean } = {},
) {
  const children = Array.from(runtimeState.serverProcesses.entries())
  for (const [extensionId, child] of children) {
    stopExtensionServerProcess(child, signal, { forceAfterMs: -1, unrefForceTimer: true })
    runtimeState.serverProcesses.delete(extensionId)
  }

  const forceAfterMs = options.forceAfterMs
  if (signal !== 'SIGKILL' && typeof forceAfterMs === 'number' && Number.isFinite(forceAfterMs) && forceAfterMs >= 0) {
    const timer = setTimeout(() => forceKillStoppingExtensionServers(), forceAfterMs)
    if (options.unrefForceTimer === true) {
      timer.unref?.()
    }
  }
}

export function stopExtensionServerProcess(
  child: ChildProcess,
  signal: NodeJS.Signals = 'SIGTERM',
  options: { forceAfterMs?: number; unrefForceTimer?: boolean } = {},
) {
  trackStoppingServerProcess(child)
  try {
    child.kill(signal)
  } catch {
    // ignore
  }

  const forceAfterMs = options.forceAfterMs ?? DEFAULT_EXTENSION_SERVER_FORCE_KILL_MS
  if (signal !== 'SIGKILL' && typeof forceAfterMs === 'number' && Number.isFinite(forceAfterMs) && forceAfterMs >= 0) {
    const timer = setTimeout(() => forceKillStoppingExtensionServers(), forceAfterMs)
    if (options.unrefForceTimer === true) {
      timer.unref?.()
    }
  }
}

/**
 * Clears all runtime state for an extension.
 * Call this when an extension is uninstalled to prevent memory leaks from
 * stale entries in the manifests, extensionRoots, subscriptions,
 * capabilityUsage, serverProcesses, serverStatus, and channelStatus Maps.
 *
 * This also kills any running server process before removing its entry.
 */
export function clearExtensionRuntimeState(extensionId: string) {
  // Kill the running server process if one exists
  const child = runtimeState.serverProcesses.get(extensionId)
  if (child) {
    stopExtensionServerProcess(child)
    runtimeState.serverProcesses.delete(extensionId)
  }

  // Clear all other Maps keyed by extensionId
  runtimeState.manifests.delete(extensionId)
  runtimeState.extensionRoots.delete(extensionId)
  runtimeState.subscriptions.delete(extensionId)
  runtimeState.capabilityUsage.delete(extensionId)
  runtimeState.serverStatus.delete(extensionId)
  runtimeState.channelStatus.delete(extensionId)
}
