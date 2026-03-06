import { runtimeState } from './state.js'
import type { Capability, ExtensionHostCallResult } from './types.js'

export function hasCapability(extensionId: string, capability: Capability): boolean {
  const manifest = runtimeState.manifests.get(extensionId)
  if (!manifest) return false
  return manifest.capabilities.includes(capability)
}

export function trackCapability(extensionId: string, capability: Capability) {
  const current = runtimeState.capabilityUsage.get(extensionId) ?? new Set<Capability>()
  current.add(capability)
  runtimeState.capabilityUsage.set(extensionId, current)
}

export function capabilityUnauthorized(extensionId: string, capability: Capability): ExtensionHostCallResult {
  return { ok: false, error: { code: 'unauthorized', message: `Extension ${extensionId} missing capability ${capability}` } }
}
