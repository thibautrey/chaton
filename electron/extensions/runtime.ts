import crypto from 'node:crypto'
import { listQueueMessages } from '../db/repos/extension-queue.js'
import { getDb } from '../db/index.js'
import { hasCapability, trackCapability } from './runtime/capabilities.js'
import { BUILTIN_AUTOMATION_ID, BUILTIN_BROWSER_ID, BUILTIN_MEMORY_ID } from './runtime/constants.js'
import { createHostCall } from './runtime/host.js'
import { getExtensionMainViewHtml } from './runtime/html.js'
import { asRecord } from './runtime/helpers.js'
import { browserBack, browserClick, browserClose, browserForward, browserList, browserNavigate, browserOpen, browserPress, browserReload, browserSnapshot, browserType, browserWait, closeAllBrowserSessions } from './runtime/browser.js'
import { memoryDelete, memoryGet, memoryList, memorySearch, memoryUpdate, memoryUpsert } from './runtime/memory.js'
import { publishExtensionEvent, queueAck, queueConsume, queueEnqueue, queueListDeadLetters, queueNack } from './runtime/queue.js'
import { configureRegistryRuntime, enrichExtensionsWithRuntimeFields, getBuiltinAutomationExtensionId, getExtensionManifest, getExtensionRuntimeHealth as getRegistryRuntimeHealth, initializeExtensionsRuntime as initializeRegistry, listExtensionManifests, listRegisteredExtensionUi, loadExtensionManifestIntoRegistry } from './runtime/registry.js'
import { registerExtensionServer, ensureExtensionServerStarted } from './runtime/server.js'
import { runtimeState } from './runtime/state.js'
import { storageFilesRead, storageFilesWrite, storageKvDeleteEntry, storageKvGet, storageKvListEntries, storageKvSet } from './runtime/storage.js'
import { buildExtensionToolDefinitions } from './runtime/tools.js'
import { buildToolCatalogFromExposedTools, getToolCatalogEntry, searchToolCatalog } from './runtime/tool-catalog.js'
import type { ChatonsExtensionRegistryEntry } from './manager.js'
import type { ExposedExtensionToolDefinition, ExtensionHostCallResult, ExtensionManifest, HostEventTopic } from './runtime/types.js'
import { createAutomationRuntime } from './runtime/automation.js'
import { createPiInstructionExecutor } from './runtime/automation-pi-bridge.js'
import type { PiSessionRuntimeManager } from '../pi-sdk-runtime.js'

let piRuntimeManagerInstance: PiSessionRuntimeManager | null = null

function getPiRuntimeManager(): PiSessionRuntimeManager {
  if (!piRuntimeManagerInstance) {
    // Lazy import to avoid circular dependencies
    const workspace = require('../ipc/workspace.js')
    piRuntimeManagerInstance = workspace.piRuntimeManager as PiSessionRuntimeManager
  }
  return piRuntimeManagerInstance
}

const hostCallInternal = createHostCall(emitHostEvent)
const automationRuntime = createAutomationRuntime({
  hostCall: hostCallInternal,
  queueEnqueue,
  executePiInstruction: (instruction: string, modelKey?: string) => {
    try {
      const piRuntimeManager = getPiRuntimeManager()
      const executor = createPiInstructionExecutor(piRuntimeManager)
      return executor(instruction, modelKey)
    } catch (error) {
      return Promise.resolve({
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to initialize Pi executor',
      })
    }
  },
})

configureRegistryRuntime({
  emitHostEvent,
  subscribeExtension,
  ensureExtensionServerStarted,
})

export type * from './runtime/types.js'

export function getExposedExtensionTools(): ExposedExtensionToolDefinition[] {
  return Array.from(runtimeState.manifests.keys()).flatMap((extensionId) => buildExtensionToolDefinitions(extensionId, extensionsCall as never))
}

export function getBuiltinExtensionTools(): ExposedExtensionToolDefinition[] {
  // Return ALL extension tools (builtin + third-party) so they are all
  // registered in the Pi session tool registry and callable by the agent.
  return getExposedExtensionTools()
}

/**
 * Return extension tool names that should be lazy-discovered via
 * search_tool / tool_detail rather than shown directly in the agent tool list.
 * This includes browser tools (too many individual tools) and all third-party
 * extension tools (discovered on demand).
 */
export function getLazyDiscoveryToolNames(): Set<string> {
  const alwaysActiveIds = new Set([BUILTIN_AUTOMATION_ID, BUILTIN_MEMORY_ID])
  const lazyTools = getExposedExtensionTools().filter(
    (tool) => !alwaysActiveIds.has(tool.extensionId),
  )
  return new Set(lazyTools.map((tool) => tool.name))
}

/**
 * Return extension IDs whose tools are lazy-discovered (for matching
 * grouped catalog entries by extensionId).
 */
export function getLazyDiscoveryExtensionIds(): Set<string> {
  const alwaysActiveIds = new Set([BUILTIN_AUTOMATION_ID, BUILTIN_MEMORY_ID])
  const lazyTools = getExposedExtensionTools().filter(
    (tool) => !alwaysActiveIds.has(tool.extensionId),
  )
  return new Set(lazyTools.map((tool) => tool.extensionId))
}

export function searchExposedTools(query: string | string[], limit = 20) {
  const catalog = buildToolCatalogFromExposedTools(getExposedExtensionTools())
  return searchToolCatalog(catalog, query, limit)
}

export function getExposedToolDetail(toolName: string) {
  const catalog = buildToolCatalogFromExposedTools(getExposedExtensionTools())
  return getToolCatalogEntry(catalog, toolName)
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

    // Fire-and-forget: run automation in background, don't block event emission
    void automationRuntime.runAutomationOnEvent(subscription.extensionId, topic, payload)
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

// Sandboxed extension handler dispatch.
// Each non-builtin extension runs in its own worker_threads Worker with
// capped CPU time and memory limits so a misbehaving extension cannot
// block or crash the main process.
import { callExtensionHandler, hasExtensionHandler, terminateAllWorkers, getWorkerStats } from './runtime/sandbox.js'

export function extensionsCall(
  callerExtensionId: string,
  extensionId: string,
  apiName: string,
  versionRange: string,
  payload: unknown,
  context?: { conversationId?: string; toolCallId?: string },
): ExtensionHostCallResult | Promise<ExtensionHostCallResult> {
  void callerExtensionId
  void versionRange

  if (extensionId === '@thibautrey/chatons-extension-linear') {
    console.warn(
      `[linear-debug] extensionsCall start extensionId=${extensionId} apiName=${apiName} payloadType=${payload === null ? 'null' : Array.isArray(payload) ? 'array' : typeof payload}`,
    )
  }

  if (extensionId === BUILTIN_AUTOMATION_ID) {
    const inferredConversationId =
      typeof context?.conversationId === 'string' && context.conversationId.trim()
        ? context.conversationId.trim()
        : typeof context?.toolCallId === 'string'
          ? getPiRuntimeManager().getConversationIdForToolCall(context.toolCallId)
          : undefined
    return automationRuntime.extensionsCallAutomation(apiName, payload, { conversationId: inferredConversationId }) ?? { ok: false, error: { code: 'not_found', message: `API ${apiName} not found on ${extensionId}` } }
  }

  if (extensionId === BUILTIN_MEMORY_ID) {
    if (apiName === 'memory.upsert') return memoryUpsert(payload)
    if (apiName === 'memory.search') return memorySearch(payload)
    if (apiName === 'memory.get') return memoryGet(payload)
    if (apiName === 'memory.update') return memoryUpdate(payload)
    if (apiName === 'memory.delete') return memoryDelete(payload)
    if (apiName === 'memory.list') return memoryList(payload)
  }

  if (extensionId === BUILTIN_BROWSER_ID) {
    if (apiName === 'browser.open') return browserOpen(payload)
    if (apiName === 'browser.navigate') return browserNavigate(payload)
    if (apiName === 'browser.back') return browserBack(payload)
    if (apiName === 'browser.forward') return browserForward(payload)
    if (apiName === 'browser.reload') return browserReload(payload)
    if (apiName === 'browser.snapshot') return browserSnapshot(payload)
    if (apiName === 'browser.click') return browserClick(payload)
    if (apiName === 'browser.type') return browserType(payload)
    if (apiName === 'browser.press') return browserPress(payload)
    if (apiName === 'browser.wait') return browserWait(payload)
    if (apiName === 'browser.close') return browserClose(payload)
    if (apiName === 'browser.list') return browserList()
  }

  // Non-builtin extensions run in sandboxed workers with resource limits
  const hasHandler = hasExtensionHandler(extensionId)
  if (extensionId === '@thibautrey/chatons-extension-linear') {
    console.warn(`[linear-debug] extensionsCall hasExtensionHandler extensionId=${extensionId} apiName=${apiName} hasHandler=${String(hasHandler)}`)
  }
  if (hasHandler) {
    const result = callExtensionHandler(extensionId, apiName, payload)
    if (extensionId === '@thibautrey/chatons-extension-linear') {
      return result.then((resolved) => {
        console.warn(
          `[linear-debug] extensionsCall resolved extensionId=${extensionId} apiName=${apiName} ok=${String(Boolean(resolved?.ok))} errorCode=${resolved?.ok ? '' : String(resolved?.error?.code ?? '')}`,
        )
        return resolved
      })
    }
    return result
  }

  if (extensionId === '@thibautrey/chatons-extension-linear') {
    console.warn(`[linear-debug] extensionsCall not_found extensionId=${extensionId} apiName=${apiName}`)
  }
  return { ok: false, error: { code: 'not_found', message: `API ${apiName} not found on ${extensionId}` } }
}

export function runExtensionsQueueWorkerCycle() {
  void automationRuntime.runExtensionsQueueWorkerCycle(queueConsume, queueAck, queueNack)
}

// Shut down all sandboxed extension workers (called during app quit)
export function shutdownExtensionWorkers() {
  closeAllBrowserSessions()
  terminateAllWorkers()
}

export function getExtensionRuntimeHealth() {
  const base = getRegistryRuntimeHealth()
  const deadLetters = listQueueMessages(getDb(), { status: 'dead', limit: 50 })
  return {
    ...base,
    deadLetters: deadLetters.length,
    sandboxedWorkers: getWorkerStats(),
    byExtension: listExtensionManifests().map((manifest) => ({
      extensionId: manifest.id,
      capabilitiesDeclared: manifest.capabilities,
      capabilitiesUsed: Array.from(runtimeState.capabilityUsage.get(manifest.id) ?? new Set()),
    })),
  }
}
