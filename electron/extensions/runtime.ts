import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { BrowserWindow } from 'electron'
import { listQueueMessages } from '../db/repos/extension-queue.js'
import { getDb } from '../db/index.js'
import { hasCapability, trackCapability } from './runtime/capabilities.js'
import { BUILTIN_AUTOMATION_ID, BUILTIN_BROWSER_ID, BUILTIN_EXTENSION_MANAGER_ID, BUILTIN_MEMORY_ID, BUILTIN_PROJECTS_ID } from './runtime/constants.js'
import { createHostCall } from './runtime/host.js'
import { getExtensionMainViewHtml } from './runtime/html.js'
import { asRecord } from './runtime/helpers.js'
import { browserBack, browserClick, browserClose, browserForward, browserList, browserNavigate, browserOpen, browserPress, browserReload, browserSnapshot, browserType, browserWait, closeAllBrowserSessions } from './runtime/browser.js'
import { memoryDelete, memoryGet, memoryList, memorySearch, memoryUpdate, memoryUpsert } from './runtime/memory.js'
import { chatonsGetHiddenProjects, chatonsGetProject, chatonsGetProjectConversations, chatonsGetVisibleProjects, chatonsListProjects, chatonsUpdateProjectVisibility } from './runtime/projects.js'
import { startMemoryCleanupScheduler, stopMemoryCleanupScheduler } from './runtime/memory-lifecycle.js'
import { publishExtensionEvent, queueAck, queueConsume, queueEnqueue, queueListDeadLetters, queueNack } from './runtime/queue.js'
import { configureRegistryRuntime, enrichExtensionsWithRuntimeFields, getBuiltinAutomationExtensionId, getExtensionManifest, getExtensionRuntimeHealth as getRegistryRuntimeHealth, initializeExtensionsRuntime as initializeRegistry, listExtensionManifests, listRegisteredExtensionUi, loadExtensionManifestIntoRegistry } from './runtime/registry.js'
import { registerExtensionServer, ensureExtensionServerStarted } from './runtime/server.js'
import { runtimeState } from './runtime/state.js'
import { storageFilesRead, storageFilesWrite, storageKvDeleteEntry, storageKvGet, storageKvListEntries, storageKvSet } from './runtime/storage.js'
import { buildExtensionToolDefinitions } from './runtime/tools.js'
import { buildToolCatalogFromExposedTools, getToolCatalogEntry, searchToolCatalog } from './runtime/tool-catalog.js'
import { extensionKvGet, extensionKvSet } from '../db/repos/extension-kv.js'
import { listProjects, findProjectById } from '../db/repos/projects.js'
import { listConversations } from '../db/repos/conversations.js'
import type { ChatonsExtensionRegistryEntry } from './manager.js'
import { 
  lookupMarketplaceIconUrl,
  listChatonsExtensions,
  installChatonsExtension,
  removeChatonsExtension,
  getChatonsExtensionLogs,
  checkForExtensionUpdates,
  updateChatonsExtension,
  toggleChatonsExtension,
  listChatonsExtensionCatalog,
} from './manager.js'
import { setMarketplaceIconUrlLookup } from './runtime/manifest.js'
import type { ExposedExtensionToolDefinition, ExtensionHostCallResult, ExtensionManifest, HostEventTopic } from './runtime/types.js'
import { createAutomationRuntime } from './runtime/automation.js'
import { createPiInstructionExecutor } from './runtime/automation-pi-bridge.js'
import type { PiSessionRuntimeManager } from '../pi-sdk-runtime.js'

let piRuntimeManagerInstance: PiSessionRuntimeManager | null = null

// In-memory event buffer for batched writes to extension KV storage.
// Groups events by extensionId+key, flushed periodically.
const eventBuffer = new Map<string, { extensionId: string; key: string; items: unknown[] }>()
let eventFlushTimer: ReturnType<typeof setTimeout> | null = null
const EVENT_FLUSH_INTERVAL_MS = 3000

function flushEventBuffer() {
  eventFlushTimer = null
  if (eventBuffer.size === 0) return
  try {
    const db = getDb()
    for (const entry of eventBuffer.values()) {
      const existing = extensionKvGet(db, entry.extensionId, entry.key)
      const arr = Array.isArray(existing) ? existing : []
      const merged = arr.concat(entry.items)
      extensionKvSet(db, entry.extensionId, entry.key, merged)
    }
  } catch (_) { /* non-critical -- ignore storage errors */ }
  eventBuffer.clear()
}

function scheduleEventFlush() {
  if (eventFlushTimer) return
  eventFlushTimer = setTimeout(flushEventBuffer, EVENT_FLUSH_INTERVAL_MS)
}

/** Append event payload to an extension's KV array, batched for performance. */
async function appendEventToExtensionKv(extensionId: string, topic: string, payload: unknown) {
  // Map known topics to storage keys
  let key: string
  if (topic === 'conversation.turn.ended') {
    key = 'usage_records_v1'
  } else if (topic === 'conversation.tool.executed') {
    key = 'tool_records_v1'
  } else {
    key = 'events_' + topic.replace(/\./g, '_')
  }

  const bufferKey = extensionId + ':' + key
  let entry = eventBuffer.get(bufferKey)
  if (!entry) {
    entry = { extensionId, key, items: [] }
    eventBuffer.set(bufferKey, entry)
  }
  entry.items.push(payload)
  scheduleEventFlush()
}

const require = createRequire(import.meta.url)

function getPiRuntimeManager(): PiSessionRuntimeManager {
  if (!piRuntimeManagerInstance) {
    // Lazy import to avoid circular dependencies - use dynamic import for ESM
    const workspace = require('../ipc/workspace.js') as typeof import('../ipc/workspace.js')
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

// Allow manifest icon resolution to look up CDN URLs from the marketplace catalog
setMarketplaceIconUrlLookup(lookupMarketplaceIconUrl)

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
  const alwaysActiveIds = new Set([BUILTIN_AUTOMATION_ID, BUILTIN_MEMORY_ID, BUILTIN_EXTENSION_MANAGER_ID])
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
  const alwaysActiveIds = new Set([BUILTIN_AUTOMATION_ID, BUILTIN_MEMORY_ID, BUILTIN_EXTENSION_MANAGER_ID])
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
  // Initialize cron scheduler for automation tasks
  void automationRuntime.initializeCronTasks()
  // Initialize memory cleanup scheduler (Chetna-inspired Ebbinghaus curve)
  startMemoryCleanupScheduler()
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

  // Track which extension IDs have active subscriptions for this event
  // so we can broadcast to their webviews
  const subscribedExtensionIds: string[] = []

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

    // For non-automation extensions, persist the event into KV for later retrieval
    if (subscription.extensionId !== BUILTIN_AUTOMATION_ID) {
      void appendEventToExtensionKv(subscription.extensionId, topic, payload)
      // Track this extension for webview broadcast
      if (!subscribedExtensionIds.includes(subscription.extensionId)) {
        subscribedExtensionIds.push(subscription.extensionId)
      }
    }
  }

  // Broadcast event to all renderer windows so webviews can receive real-time updates
  if (subscribedExtensionIds.length > 0) {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('chaton:extension:event', {
          topic,
          payload,
          publishedAt: now,
          subscribedExtensionIds,
        })
      }
    }
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

  if (extensionId === BUILTIN_PROJECTS_ID) {
    if (apiName === 'chatons_list_projects') return chatonsListProjects(payload)
    if (apiName === 'chatons_get_project') return chatonsGetProject(payload)
    if (apiName === 'chatons_get_project_conversations') return chatonsGetProjectConversations(payload)
    if (apiName === 'chatons_get_hidden_projects') return chatonsGetHiddenProjects()
    if (apiName === 'chatons_get_visible_projects') return chatonsGetVisibleProjects()
    if (apiName === 'chatons_update_project_visibility') return chatonsUpdateProjectVisibility(payload)
    return { ok: false, error: { code: 'not_found', message: `API ${apiName} not found on ${extensionId}` } }
  }

  if (extensionId === BUILTIN_EXTENSION_MANAGER_ID) {
    if (apiName === 'extension.search_marketplace') {
      const params = payload as Record<string, unknown>
      const query = typeof params?.query === 'string' ? params.query : undefined
      const category = typeof params?.category === 'string' ? params.category : undefined
      const limit = typeof params?.limit === 'number' ? params.limit : 20
      
      const catalog = listChatonsExtensionCatalog()
      if (!catalog.ok) {
        return { ok: false, error: { code: 'internal', message: 'Failed to load extension catalog' } }
      }
      
      let entries = catalog.entries
      
      // Filter by query
      if (query) {
        const q = query.toLowerCase()
        entries = entries.filter(e => 
          e.name.toLowerCase().includes(q) || 
          e.description.toLowerCase().includes(q) ||
          (e.tags && e.tags.some(t => t.toLowerCase().includes(q)))
        )
      }
      
      // Filter by category
      if (category) {
        entries = entries.filter(e => e.category === category)
      }
      
      // Limit results
      entries = entries.slice(0, limit)
      
      // Check which are installed
      const installed = listChatonsExtensions()
      const installedIds = new Set(installed.extensions.map(e => e.id))
      
      return { 
        ok: true, 
        data: {
          entries: entries.map(e => ({
            ...e,
            installed: installedIds.has(e.id),
          })),
          total: entries.length,
          source: catalog.source,
          updatedAt: catalog.updatedAt,
        }
      }
    }
    
    if (apiName === 'extension.list_installed') {
      const result = listChatonsExtensions()
      return { ok: true, data: { extensions: result.extensions } }
    }
    
    if (apiName === 'extension.install') {
      const params = payload as Record<string, unknown>
      const id = typeof params?.id === 'string' ? params.id : ''
      if (!id) {
        return { ok: false, error: { code: 'invalid_args', message: 'Extension ID is required' } }
      }
      const result = installChatonsExtension(id)
      return result.ok 
        ? { ok: true, data: { message: result.started ? 'Installation started' : 'Extension enabled', state: result.state } }
        : { ok: false, error: { code: 'internal', message: result.message || 'Installation failed' } }
    }
    
    if (apiName === 'extension.uninstall') {
      const params = payload as Record<string, unknown>
      const id = typeof params?.id === 'string' ? params.id : ''
      if (!id) {
        return { ok: false, error: { code: 'invalid_args', message: 'Extension ID is required' } }
      }
      const result = removeChatonsExtension(id)
      return result.ok 
        ? { ok: true, data: { message: 'Extension uninstalled', id: result.id } }
        : { ok: false, error: { code: 'internal', message: result.message || 'Uninstall failed' } }
    }
    
    if (apiName === 'extension.get_logs') {
      const params = payload as Record<string, unknown>
      const id = typeof params?.id === 'string' ? params.id : ''
      const lines = typeof params?.lines === 'number' ? params.lines : 500

      if (!id) {
        return { ok: false, error: { code: 'invalid_args', message: 'Extension ID is required' } }
      }

      const result = getChatonsExtensionLogs(id)
      if (!result.ok) {
        return { ok: false, error: { code: 'internal', message: 'Failed to get logs' } }
      }
      
      // Limit lines if requested
      let content = result.content
      if (lines > 0) {
        const allLines = content.split('\n')
        content = allLines.slice(-lines).join('\n')
      }
      
      return { ok: true, data: { id, content, lines: content.split('\n').length } }
    }
    
    if (apiName === 'extension.check_updates') {
      const result = checkForExtensionUpdates()
      return result.ok 
        ? { ok: true, data: { updates: result.updates } }
        : { ok: false, error: { code: 'internal', message: 'Failed to check for updates' } }
    }
    
    if (apiName === 'extension.update') {
      const params = payload as Record<string, unknown>
      const id = typeof params?.id === 'string' ? params.id : ''
      if (!id) {
        return { ok: false, error: { code: 'invalid_args', message: 'Extension ID is required' } }
      }
      const result = updateChatonsExtension(id)
      return result.ok 
        ? { ok: true, data: { message: 'Update started', state: result.state } }
        : { ok: false, error: { code: 'internal', message: result.message || 'Update failed' } }
    }
    
    if (apiName === 'extension.toggle') {
      const params = payload as Record<string, unknown>
      const id = typeof params?.id === 'string' ? params.id : ''
      const enabled = params?.enabled === true

      if (!id) {
        return { ok: false, error: { code: 'invalid_args', message: 'Extension ID is required' } }
      }

      const result = toggleChatonsExtension(id, enabled)
      return result.ok 
        ? { ok: true, data: { id, enabled: result.enabled, message: `Extension ${enabled ? 'enabled' : 'disabled'}` } }
        : { ok: false, error: { code: 'internal', message: result.message || 'Toggle failed' } }
    }
  }

  if (extensionId === BUILTIN_PROJECTS_ID) {
    if (apiName === 'chatons_list_projects') {
      return handleListProjects(payload)
    }
    if (apiName === 'chatons_get_project') {
      return handleGetProject(payload)
    }
    if (apiName === 'chatons_get_project_conversations') {
      return handleGetProjectConversations(payload)
    }
    if (apiName === 'chatons_get_hidden_projects') {
      return handleGetHiddenProjects(payload)
    }
    if (apiName === 'chatons_get_visible_projects') {
      return handleGetVisibleProjects(payload)
    }
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
  // Shutdown cron scheduler
  void automationRuntime.shutdownCronScheduler()
  // Shutdown memory cleanup scheduler
  stopMemoryCleanupScheduler()
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

// ---- Projects Extension Handlers ----

async function handleListProjects(payload: unknown): Promise<ExtensionHostCallResult> {
  const params = (payload as Record<string, unknown>) ?? {}
  const includeArchived = params?.includeArchived === true
  const limit = typeof params?.limit === 'number' && params.limit > 0 ? params.limit : null

  try {
    const db = getDb()
    let projects = listProjects(db)

    // Apply limit if specified
    if (limit && projects.length > limit) {
      projects = projects.slice(0, limit)
    }

    // Sort by updatedAt (most recent first)
    projects.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

    return {
      ok: true,
      data: {
        projects: projects.map((row) => ({
          id: row.id,
          name: row.name,
          repoPath: row.repo_path,
          repoName: row.repo_name,
          isArchived: row.is_archived === 1,
          isHidden: row.is_hidden === 1,
          icon: row.icon,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
        total: projects.length,
        includeArchived,
      },
    }
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'internal',
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

async function handleGetProject(payload: unknown): Promise<ExtensionHostCallResult> {
  const params = (payload as Record<string, unknown>) ?? {}
  const projectId = typeof params?.projectId === 'string' ? params.projectId.trim() : ''

  if (!projectId) {
    return {
      ok: false,
      error: {
        code: 'invalid_args',
        message: 'projectId is required',
      },
    }
  }

  try {
    const db = getDb()
    const project = findProjectById(db, projectId)

    if (!project) {
      return {
        ok: false,
        error: {
          code: 'not_found',
          message: `Project with ID "${projectId}" not found`,
        },
      }
    }

    // Get conversations for this project
    const conversations = listConversations(db)
      .filter((c) => c.project_id === projectId)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

    return {
      ok: true,
      data: {
        project: {
          id: project.id,
          name: project.name,
          repoPath: project.repo_path,
          repoName: project.repo_name,
          isArchived: project.is_archived === 1,
          isHidden: project.is_hidden === 1,
          icon: project.icon,
          createdAt: project.created_at,
          updatedAt: project.updated_at,
        },
        conversationCount: conversations.length,
        conversations: conversations.map((c) => ({
          id: c.id,
          title: c.title,
          updatedAt: c.updated_at,
          lastMessageAt: c.last_message_at,
          modelProvider: c.model_provider,
          modelId: c.model_id,
          thinkingLevel: c.thinking_level,
        })),
      },
    }
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'internal',
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

async function handleGetProjectConversations(payload: unknown): Promise<ExtensionHostCallResult> {
  const params = (payload as Record<string, unknown>) ?? {}
  const projectId = typeof params?.projectId === 'string' ? params.projectId.trim() : ''

  if (!projectId) {
    return {
      ok: false,
      error: {
        code: 'invalid_args',
        message: 'projectId is required',
      },
    }
  }

  try {
    const db = getDb()
    const project = findProjectById(db, projectId)

    if (!project) {
      return {
        ok: false,
        error: {
          code: 'not_found',
          message: `Project with ID "${projectId}" not found`,
        },
      }
    }

    const conversations = listConversations(db)
      .filter((c) => c.project_id === projectId)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

    return {
      ok: true,
      data: {
        projectId,
        projectName: project.name,
        repoPath: project.repo_path,
        totalConversations: conversations.length,
        conversations: conversations.map((c) => ({
          id: c.id,
          title: c.title,
          updatedAt: c.updated_at,
          lastMessageAt: c.last_message_at,
          modelProvider: c.model_provider,
          modelId: c.model_id,
          thinkingLevel: c.thinking_level,
        })),
      },
    }
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'internal',
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

async function handleGetHiddenProjects(_payload: unknown): Promise<ExtensionHostCallResult> {
  try {
    const db = getDb()
    const projects = listProjects(db)
      .filter((p) => p.is_hidden === 1)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

    return {
      ok: true,
      data: {
        projects: projects.map((row) => ({
          id: row.id,
          name: row.name,
          repoPath: row.repo_path,
          repoName: row.repo_name,
          isArchived: row.is_archived === 1,
          isHidden: true,
          icon: row.icon,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
        total: projects.length,
        note: 'These projects are hidden from the sidebar but still accessible.',
      },
    }
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'internal',
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

async function handleGetVisibleProjects(_payload: unknown): Promise<ExtensionHostCallResult> {
  try {
    const db = getDb()
    const projects = listProjects(db)
      .filter((p) => p.is_hidden === 0)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

    return {
      ok: true,
      data: {
        projects: projects.map((row) => ({
          id: row.id,
          name: row.name,
          repoPath: row.repo_path,
          repoName: row.repo_name,
          isArchived: row.is_archived === 1,
          isHidden: false,
          icon: row.icon,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
        total: projects.length,
        note: 'These projects are currently visible in the sidebar.',
      },
    }
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'internal',
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
}
