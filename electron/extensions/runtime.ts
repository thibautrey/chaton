import crypto from 'node:crypto'
import { listQueueMessages } from '../db/repos/extension-queue.js'
import { getDb } from '../db/index.js'
import { hasCapability, trackCapability } from './runtime/capabilities.js'
import { BUILTIN_AUTOMATION_ID, BUILTIN_MEMORY_ID } from './runtime/constants.js'
import { createHostCall } from './runtime/host.js'
import { getExtensionMainViewHtml } from './runtime/html.js'
import { asRecord } from './runtime/helpers.js'
import { appendExtensionLog } from './runtime/logging.js'
import { memoryDelete, memoryGet, memoryList, memorySearch, memoryUpdate, memoryUpsert } from './runtime/memory.js'
import { publishExtensionEvent, queueAck, queueConsume, queueEnqueue, queueListDeadLetters, queueNack } from './runtime/queue.js'
import { configureRegistryRuntime, enrichExtensionsWithRuntimeFields, getBuiltinAutomationExtensionId, getExtensionManifest, getExtensionRuntimeHealth as getRegistryRuntimeHealth, initializeExtensionsRuntime as initializeRegistry, listExtensionManifests, listRegisteredExtensionUi, loadExtensionManifestIntoRegistry } from './runtime/registry.js'
import { registerExtensionServer, ensureExtensionServerStarted } from './runtime/server.js'
import { runtimeState } from './runtime/state.js'
import { storageFilesRead, storageFilesWrite, storageKvDeleteEntry, storageKvGet, storageKvListEntries, storageKvSet } from './runtime/storage.js'
import { buildExtensionToolDefinitions } from './runtime/tools.js'
import type { ChatonsExtensionRegistryEntry } from './manager.js'
import type { ExposedExtensionToolDefinition, ExtensionHostCallResult, ExtensionManifest, HostEventTopic } from './runtime/types.js'
import { createAutomationRuntime } from './runtime/automation.js'

const hostCallInternal = createHostCall(emitHostEvent)
const automationRuntime = createAutomationRuntime({ hostCall: hostCallInternal, queueEnqueue })

configureRegistryRuntime({
  emitHostEvent,
  subscribeExtension,
  ensureExtensionServerStarted,
})

export type * from './runtime/types.js'

export function getExposedExtensionTools(): ExposedExtensionToolDefinition[] {
  return Array.from(runtimeState.manifests.keys()).flatMap((extensionId) => buildExtensionToolDefinitions(extensionId, extensionsCall as never))
}

export function initializeExtensionsRuntime() {
  initializeRegistry()
}

export function subscribeExtension(
  extensionId: string,
  topic: string,
  options?: { projectId?: string; conversationId?: string },
): { ok: true; subscriptionId: string } | { ok: false; message: string } {
  if (!hasCapability(extensionId, 'events.subscribe')) {
    return { ok: false, message: `Extension ${extensionId} missing capability events.subscribe` }
  }
  trackCapability(extensionId, 'events.subscribe')
  const id = crypto.randomUUID()
  runtimeState.subscriptions.set(id, { id, extensionId, topic, options })
  return { ok: true, subscriptionId: id }
}

export function emitHostEvent(topic: HostEventTopic | string, payload: unknown) {
  const now = new Date().toISOString()
  const event = { topic, payload, publishedAt: now }

  for (const subscription of runtimeState.subscriptions.values()) {
    if (subscription.topic !== topic) continue
    if (subscription.options?.conversationId && typeof payload === 'object' && payload && !Array.isArray(payload)) {
      const p = payload as Record<string, unknown>
      if (p.conversationId !== subscription.options.conversationId) continue
    }
    if (subscription.options?.projectId && typeof payload === 'object' && payload && !Array.isArray(payload)) {
      const p = payload as Record<string, unknown>
      if (p.projectId !== subscription.options.projectId) continue
    }

    automationRuntime.runAutomationOnEvent(subscription.extensionId, topic, payload)
  }

  return { ok: true as const, event }
}

export function hostCallProxy(extensionId: string, method: string, params?: Record<string, unknown>): ExtensionHostCallResult | Promise<ExtensionHostCallResult> {
  return hostCallInternal(extensionId, method, params)
}

export { registerExtensionServer, ensureExtensionServerStarted }
export { getExtensionManifest, listExtensionManifests, listRegisteredExtensionUi, loadExtensionManifestIntoRegistry }
export { publishExtensionEvent, queueEnqueue, queueConsume, queueAck, queueNack, queueListDeadLetters }
export { storageKvGet, storageKvSet, storageKvDeleteEntry, storageKvListEntries, storageFilesRead, storageFilesWrite }
export { enrichExtensionsWithRuntimeFields, getBuiltinAutomationExtensionId, getExtensionMainViewHtml }

export function hostCall(extensionId: string, method: string, params?: Record<string, unknown>): ExtensionHostCallResult | Promise<ExtensionHostCallResult> {
  return hostCallProxy(extensionId, method, params)
}

export function extensionsCall(
  callerExtensionId: string,
  extensionId: string,
  apiName: string,
  versionRange: string,
  payload: unknown,
): ExtensionHostCallResult {
  void callerExtensionId
  void versionRange

  if (extensionId === BUILTIN_AUTOMATION_ID) {
    return automationRuntime.extensionsCallAutomation(apiName, payload) ?? { ok: false, error: { code: 'not_found', message: `API ${apiName} not found on ${extensionId}` } }
  }

  if (extensionId === BUILTIN_MEMORY_ID) {
    if (apiName === 'memory.upsert') return memoryUpsert(payload)
    if (apiName === 'memory.search') return memorySearch(payload)
    if (apiName === 'memory.get') return memoryGet(payload)
    if (apiName === 'memory.update') return memoryUpdate(payload)
    if (apiName === 'memory.delete') return memoryDelete(payload)
    if (apiName === 'memory.list') return memoryList(payload)
  }

  return { ok: false, error: { code: 'not_found', message: `API ${apiName} not found on ${extensionId}` } }
}

export function runExtensionsQueueWorkerCycle() {
  automationRuntime.runExtensionsQueueWorkerCycle(queueConsume, queueAck, queueNack)
}

export function getExtensionRuntimeHealth() {
  const base = getRegistryRuntimeHealth()
  const deadLetters = listQueueMessages(getDb(), { status: 'dead', limit: 50 })
  return {
    ...base,
    deadLetters: deadLetters.length,
    byExtension: listExtensionManifests().map((manifest) => ({
      extensionId: manifest.id,
      capabilitiesDeclared: manifest.capabilities,
      capabilitiesUsed: Array.from(runtimeState.capabilityUsage.get(manifest.id) ?? new Set()),
    })),
  }
}
