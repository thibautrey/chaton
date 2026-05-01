import type { ExtensionRuntimeState } from './types.js'

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
    try {
      child.kill('SIGTERM')
    } catch {
      // ignore
    }
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
