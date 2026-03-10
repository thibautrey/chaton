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
