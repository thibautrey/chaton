import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

import { getDb } from '../db/index.js'
import { listConversations } from '../db/repos/conversations.js'
import { listProjects } from '../db/repos/projects.js'
import { extensionKvDelete, extensionKvGet, extensionKvList, extensionKvSet } from '../db/repos/extension-kv.js'
import { ackQueueMessage, claimQueueMessages, enqueueExtensionMessage, listQueueMessages, nackQueueMessage } from '../db/repos/extension-queue.js'
import { deleteAutomationRule, insertAutomationRun, listAutomationRules, listAutomationRuns, markAutomationRuleTriggered, saveAutomationRule } from '../db/repos/automation.js'
import { listChatonsExtensions, type ChatonsExtensionRegistryEntry } from './manager.js'
import { Type } from '@sinclair/typebox'
import type { ToolDefinition } from '@mariozechner/pi-coding-agent'

const { BrowserWindow } = electron

export type Capability =
  | 'ui.menu'
  | 'ui.mainView'
  | 'llm.tools'
  | 'events.subscribe'
  | 'events.publish'
  | 'queue.publish'
  | 'queue.consume'
  | 'storage.kv'
  | 'storage.files'
  | 'host.notifications'
  | 'host.conversations.read'
  | 'host.projects.read'

export type HostEventTopic =
  | 'app.started'
  | 'conversation.created'
  | 'conversation.updated'
  | 'conversation.message.received'
  | 'conversation.agent.started'
  | 'conversation.agent.ended'
  | 'project.created'
  | 'project.deleted'
  | 'extension.installed'
  | 'extension.enabled'

export type ExtensionApiContract = {
  name: string
  version: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
}

export type ExtensionLlmToolManifest = {
  name: string
  label?: string
  description: string
  promptSnippet?: string
  promptGuidelines?: string[]
  parameters?: Record<string, unknown>
}

export type ExtensionManifest = {
  id: string
  name: string
  version: string
  entrypoints?: Record<string, string>
  ui?: {
    menuItems?: Array<{
      id: string
      label: string
      icon?: string
      location?: 'sidebar'
      order?: number
      badge?: string
      when?: string
      openMainView?: string
    }>
    mainViews?: Array<{
      viewId: string
      title: string
      webviewUrl: string
      initialRoute?: string
    }>
    quickActions?: Array<{
      id: string
      title: string
      description?: string
      deeplink?: {
        viewId: string
        target: string
        params?: Record<string, unknown>
      }
    }>
  }
  capabilities: Capability[]
  hooks?: Partial<Record<'onInstall' | 'onEnable' | 'onDisable' | 'onUninstall' | 'onStart' | 'onStop' | 'onHealthCheck', string>>
  apis?: {
    exposes?: ExtensionApiContract[]
    consumes?: ExtensionApiContract[]
  }
  llm?: {
    tools?: ExtensionLlmToolManifest[]
  }
  compat?: {
    minHostVersion?: string
    maxHostVersion?: string
  }
}

export type ExtensionHostCallResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: { code: 'unauthorized' | 'invalid_args' | 'not_found' | 'rate_limited' | 'internal'; message: string } }

type Subscription = {
  id: string
  extensionId: string
  topic: string
  options?: { projectId?: string; conversationId?: string }
}

type ExtensionRuntimeState = {
  manifests: Map<string, ExtensionManifest>
  extensionRoots: Map<string, string>
  subscriptions: Map<string, Subscription>
  capabilityUsage: Map<string, Set<Capability>>
  started: boolean
}

export type ExposedExtensionToolDefinition = ToolDefinition & {
  extensionId: string
}

const CHATON_BASE = path.join(os.homedir(), '.chaton')
const EXTENSIONS_DIR = path.join(CHATON_BASE, 'extensions')
const LOGS_DIR = path.join(CHATON_BASE, 'extensions', 'logs')
const FILES_ROOT = path.join(CHATON_BASE, 'extensions', 'data')
const BUILTIN_AUTOMATION_ID = '@chaton/automation'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const BUILTIN_AUTOMATION_DIR = path.join(__dirname, 'builtin', 'automation')
const AUTOMATION_TRIGGER_TOPICS = [
  'conversation.created',
  'conversation.message.received',
  'project.created',
  'conversation.agent.ended',
] as const

const EXTENSION_UI_BRIDGE_SCRIPT = `
(function () {
  if (window.chatonUi && typeof window.chatonUi.createModelPicker === 'function') return;
  function normalize(value) { return String(value || '').trim().toLowerCase(); }
  function createModelPicker(options) {
    var host = options && options.host;
    if (!host || !host.appendChild) throw new Error('createModelPicker requires a host HTMLElement');
    var labels = Object.assign({
      filterPlaceholder: 'Filter models...',
      more: 'more',
      scopedOnly: 'scoped only',
      noScoped: 'No scoped models',
      noModels: 'No models'
    }, (options && options.labels) || {});
    var root = document.createElement('div');
    root.className = 'chaton-model-picker';
    var row = document.createElement('div');
    row.className = 'chaton-model-picker-row';
    var select = document.createElement('select');
    select.className = 'chaton-model-picker-select';
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'chaton-model-picker-toggle';
    toggle.textContent = labels.more;
    row.appendChild(select);
    row.appendChild(toggle);
    var filterWrap = document.createElement('div');
    filterWrap.className = 'chaton-model-picker-filter-wrap';
    filterWrap.style.display = 'none';
    var filter = document.createElement('input');
    filter.className = 'chaton-model-picker-filter';
    filter.type = 'text';
    filter.placeholder = labels.filterPlaceholder;
    filterWrap.appendChild(filter);
    root.appendChild(row);
    root.appendChild(filterWrap);
    host.appendChild(root);
    var models = [];
    var selectedKey = null;
    var showAll = false;
    function render() {
      var needle = normalize(filter.value);
      var base = showAll ? models : models.filter(function (m) { return Boolean(m && m.scoped); });
      var visible = needle ? base.filter(function (m) {
        return normalize((m.id || '') + ' ' + (m.provider || '') + ' ' + (m.key || '')).includes(needle);
      }) : base;
      select.innerHTML = '';
      if (!visible.length) {
        var none = document.createElement('option');
        none.value = '';
        none.textContent = showAll ? labels.noModels : labels.noScoped;
        select.appendChild(none);
        select.disabled = true;
        selectedKey = null;
        return;
      }
      visible.forEach(function (model) {
        var opt = document.createElement('option');
        opt.value = model.key;
        opt.textContent = model.id + ' (' + model.provider + ')';
        select.appendChild(opt);
      });
      select.disabled = false;
      var fallback = visible[0] ? visible[0].key : null;
      var nextSelected = selectedKey && visible.some(function (m) { return m.key === selectedKey; })
        ? selectedKey
        : fallback;
      if (nextSelected) {
        selectedKey = nextSelected;
        select.value = nextSelected;
      }
    }
    toggle.addEventListener('click', function () {
      showAll = !showAll;
      filterWrap.style.display = showAll ? 'block' : 'none';
      toggle.textContent = showAll ? labels.scopedOnly : labels.more;
      render();
    });
    filter.addEventListener('input', render);
    select.addEventListener('change', function () {
      if (!select.value) return;
      selectedKey = select.value;
      if (options && typeof options.onChange === 'function') options.onChange(select.value);
    });
    return {
      setModels: function (nextModels) {
        models = Array.isArray(nextModels) ? nextModels.slice() : [];
        render();
      },
      setSelected: function (modelKey) {
        selectedKey = modelKey || null;
        render();
      },
      getSelected: function () { return selectedKey; },
      destroy: function () { root.remove(); }
    };
  }
  window.chatonUi = Object.assign({}, window.chatonUi || {}, { createModelPicker: createModelPicker });
})();
`

type AutomationTriggerTopic = (typeof AUTOMATION_TRIGGER_TOPICS)[number]

function isAutomationTriggerTopic(value: string): value is AutomationTriggerTopic {
  return (AUTOMATION_TRIGGER_TOPICS as readonly string[]).includes(value)
}

const AUTOMATION_MANIFEST: ExtensionManifest = {
  id: BUILTIN_AUTOMATION_ID,
  name: 'Chatons Automation',
  version: '1.0.0',
  capabilities: [
    'ui.menu',
    'ui.mainView',
    'events.subscribe',
    'queue.publish',
    'queue.consume',
    'storage.kv',
    'host.notifications',
    'host.conversations.read',
    'host.projects.read',
  ],
  hooks: {
    onStart: 'automation.onStart',
    onStop: 'automation.onStop',
    onHealthCheck: 'automation.onHealthCheck',
  },
  ui: {
    menuItems: [
      {
        id: 'automation.menu',
        label: 'Automatisations',
        icon: 'Gauge',
        location: 'sidebar',
        order: 10,
        openMainView: 'automation.main',
      },
    ],
    mainViews: [
      {
        viewId: 'automation.main',
        title: 'Automatisations',
        webviewUrl: 'chaton-extension://@chaton/automation/index.html',
        initialRoute: '/',
      },
    ],
    quickActions: [
      {
        id: 'automation.create',
        title: 'Créer automatisation',
        description: 'Ouvre la vue Automatisations sur le panneau de création.',
        deeplink: {
          viewId: 'automation.main',
          target: 'open-create-automation',
        },
      },
    ],
  },
  apis: {
    exposes: [
      { name: 'automation.rules.list', version: '1.0.0' },
      { name: 'automation.rules.save', version: '1.0.0' },
      { name: 'automation.rules.delete', version: '1.0.0' },
      { name: 'automation.runs.list', version: '1.0.0' },
      { name: 'automation.schedule_task', version: '1.0.0' },
      { name: 'automation.list_scheduled_tasks', version: '1.0.0' },
    ],
  },
  llm: {
    tools: [
      {
        name: 'automation.schedule_task',
        label: 'Schedule automation task',
        description: 'Create or update an automation rule that schedules a recurring or event-driven task for the user.',
        promptSnippet: 'Program a user automation task by creating an automation rule.',
        promptGuidelines: [
          'Use this tool when the user asks to program, schedule, or automate a recurring task.',
          'Always provide a clear human-readable rule name and the task instruction to run.',
        ],
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Human-readable automation name.' },
            instruction: { type: 'string', description: 'Natural-language task to automate.' },
            trigger: { type: 'string', description: 'Trigger topic, e.g. conversation.created or conversation.message.received.' },
            cooldown: { type: 'number', description: 'Cooldown in milliseconds between runs.' },
            projectId: { type: 'string', description: 'Optional target project id.' },
            modelKey: { type: 'string', description: 'Optional provider/model key to store with the task.' },
            notifyMessage: { type: 'string', description: 'Optional notification message.' },
          },
          required: ['name', 'instruction']
        }
      },
      {
        name: 'automation.list_scheduled_tasks',
        label: 'List scheduled automation tasks',
        description: 'List existing automation rules so the LLM can inspect already programmed tasks before creating or updating one.',
        promptSnippet: 'List current automation rules.',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Optional max number of rules.' }
          }
        }
      }
    ]
  },
}

const runtimeState: ExtensionRuntimeState = {
  manifests: new Map(),
  extensionRoots: new Map(),
  subscriptions: new Map(),
  capabilityUsage: new Map(),
  started: false,
}

function ensureDirs() {
  fs.mkdirSync(CHATON_BASE, { recursive: true })
  fs.mkdirSync(EXTENSIONS_DIR, { recursive: true })
  fs.mkdirSync(LOGS_DIR, { recursive: true })
  fs.mkdirSync(FILES_ROOT, { recursive: true })
}

function appendExtensionLog(extensionId: string, level: 'info' | 'warn' | 'error', event: string, context?: unknown) {
  ensureDirs()
  const logPath = path.join(LOGS_DIR, `${extensionId}.runtime.log`)
  const line = JSON.stringify({ timestamp: new Date().toISOString(), extensionId, level, event, context: context ?? null })
  fs.appendFileSync(logPath, `${line}\n`, 'utf8')
}

function normalizeManifest(value: unknown): ExtensionManifest | null {
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
  }
}

function readManifestFromExtensionDir(extensionId: string): ExtensionManifest | null {
  const manifestPath = path.join(EXTENSIONS_DIR, extensionId, 'chaton.extension.json')
  if (!fs.existsSync(manifestPath)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown
    return normalizeManifest(raw)
  } catch {
    return null
  }
}

function hasCapability(extensionId: string, capability: Capability): boolean {
  const manifest = runtimeState.manifests.get(extensionId)
  if (!manifest) return false
  return manifest.capabilities.includes(capability)
}

function trackCapability(extensionId: string, capability: Capability) {
  const current = runtimeState.capabilityUsage.get(extensionId) ?? new Set<Capability>()
  current.add(capability)
  runtimeState.capabilityUsage.set(extensionId, current)
}

function unauthorized(message: string): ExtensionHostCallResult {
  return { ok: false, error: { code: 'unauthorized', message } }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function normalizeTypeBoxSchema(value: unknown) {
  const record = asRecord(value)
  if (!record) return Type.Object({})
  return record as ReturnType<typeof Type.Object>
}

function parseTriggerDescription(input: string) {
  const text = String(input || '').trim().toLowerCase()
  if (text.includes('message')) return 'conversation.message.received'
  if (text.includes('projet') || text.includes('project')) return 'project.created'
  if (text.includes('fin') || text.includes('termine') || text.includes('ended')) return 'conversation.agent.ended'
  return 'conversation.created'
}

function parseCooldownToMs(input: string) {
  const text = String(input || '').trim().toLowerCase()
  let match = text.match(/(\d+)\s*(ms|millisecond|milliseconds)/)
  if (match) return Math.max(0, Number(match[1]) || 0)
  match = text.match(/(\d+)\s*(s|sec|secs|second|seconds)/)
  if (match) return (Number(match[1]) || 0) * 1000
  match = text.match(/(\d+)\s*(min|minute|minutes)/)
  if (match) return (Number(match[1]) || 0) * 60_000
  match = text.match(/(\d+)\s*(h|heure|heures|hour|hours)/)
  if (match) return (Number(match[1]) || 0) * 3_600_000
  return 0
}

function buildExtensionToolDefinitions(extensionId: string): ExposedExtensionToolDefinition[] {
  const manifest = runtimeState.manifests.get(extensionId)
  if (!manifest || !hasCapability(extensionId, 'llm.tools')) return []
  const toolManifests = Array.isArray(manifest.llm?.tools) ? manifest.llm?.tools ?? [] : []
  return toolManifests
    .filter((tool): tool is ExtensionLlmToolManifest => Boolean(tool && typeof tool.name === 'string' && typeof tool.description === 'string'))
    .map((tool) => ({
      extensionId,
      name: tool.name,
      label: typeof tool.label === 'string' && tool.label.trim() ? tool.label.trim() : tool.name,
      description: tool.description,
      promptSnippet: typeof tool.promptSnippet === 'string' ? tool.promptSnippet : undefined,
      promptGuidelines: Array.isArray(tool.promptGuidelines)
        ? tool.promptGuidelines.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : undefined,
      parameters: normalizeTypeBoxSchema(tool.parameters),
      execute: async (_toolCallId, params) => {
        trackCapability(extensionId, 'llm.tools')
        const result = extensionsCall('chatons-llm', extensionId, tool.name, '^1.0.0', params)
        if (!result.ok) {
          return {
            content: [{ type: 'text', text: result.error.message }],
            details: { extensionId, apiName: tool.name, ok: false },
            isError: true,
          }
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(result.data ?? null, null, 2) }],
          details: { extensionId, apiName: tool.name, ok: true, data: result.data ?? null },
        }
      },
    }))
}

export function getExposedExtensionTools(): ExposedExtensionToolDefinition[] {
  return Array.from(runtimeState.manifests.keys()).flatMap((extensionId) => buildExtensionToolDefinitions(extensionId))
}

export function initializeExtensionsRuntime() {
  ensureDirs()
  runtimeState.manifests.clear()
  runtimeState.extensionRoots.clear()
  runtimeState.subscriptions.clear()
  runtimeState.capabilityUsage.clear()

  const builtinManifest = (() => {
    const manifestPath = path.join(BUILTIN_AUTOMATION_DIR, 'chaton.extension.json')
    if (!fs.existsSync(manifestPath)) return null
    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown
      return normalizeManifest(raw)
    } catch {
      return null
    }
  })()
  runtimeState.manifests.set(BUILTIN_AUTOMATION_ID, builtinManifest ?? AUTOMATION_MANIFEST)
  runtimeState.extensionRoots.set(BUILTIN_AUTOMATION_ID, BUILTIN_AUTOMATION_DIR)

  const installed = listChatonsExtensions().extensions
  for (const extension of installed) {
    if (extension.id === BUILTIN_AUTOMATION_ID) {
      continue
    }
    const fromDir = readManifestFromExtensionDir(extension.id)
    if (fromDir) {
      runtimeState.manifests.set(extension.id, fromDir)
      runtimeState.extensionRoots.set(extension.id, path.join(EXTENSIONS_DIR, extension.id))
    }
  }

  for (const topic of AUTOMATION_TRIGGER_TOPICS) {
    subscribeExtension(BUILTIN_AUTOMATION_ID, topic)
  }

  runtimeState.started = true
  emitHostEvent('app.started', { startedAt: new Date().toISOString() })
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
    return {
      extensionId: manifest.id,
      menuItems: manifest.ui?.menuItems ?? [],
      mainViews: manifest.ui?.mainViews ?? [],
      capabilitiesDeclared: manifest.capabilities,
      capabilitiesUsed: usage,
      enabled: installedEntry?.enabled ?? manifest.id === BUILTIN_AUTOMATION_ID,
    }
  })
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

    runAutomationOnEvent(subscription.extensionId, topic, payload)
  }

  return { ok: true as const, event }
}

export function publishExtensionEvent(
  extensionId: string,
  topic: string,
  payload: unknown,
  meta?: { idempotencyKey?: string },
): ExtensionHostCallResult {
  if (!hasCapability(extensionId, 'events.publish')) {
    return unauthorized(`Extension ${extensionId} missing capability events.publish`)
  }
  trackCapability(extensionId, 'events.publish')

  if (topic.length > 120) {
    return { ok: false, error: { code: 'invalid_args', message: 'topic too long' } }
  }

  const queueResult = enqueueExtensionMessage(getDb(), {
    id: crypto.randomUUID(),
    topic,
    payload,
    idempotencyKey: meta?.idempotencyKey,
  })

  appendExtensionLog(extensionId, 'info', 'events.publish', { topic, deduplicated: queueResult.deduplicated })
  return { ok: true, data: { messageId: queueResult.id, deduplicated: queueResult.deduplicated } }
}

export function queueEnqueue(
  extensionId: string,
  topic: string,
  payload: unknown,
  opts?: { idempotencyKey?: string; availableAt?: string },
): ExtensionHostCallResult {
  if (!hasCapability(extensionId, 'queue.publish')) {
    return unauthorized(`Extension ${extensionId} missing capability queue.publish`)
  }
  trackCapability(extensionId, 'queue.publish')

  const result = enqueueExtensionMessage(getDb(), {
    id: crypto.randomUUID(),
    topic,
    payload,
    idempotencyKey: opts?.idempotencyKey,
    availableAt: opts?.availableAt,
  })

  return { ok: true, data: { id: result.id, deduplicated: result.deduplicated } }
}

export function queueConsume(
  extensionId: string,
  topic: string,
  consumerId: string,
  opts?: { limit?: number },
): ExtensionHostCallResult {
  if (!hasCapability(extensionId, 'queue.consume')) {
    return unauthorized(`Extension ${extensionId} missing capability queue.consume`)
  }
  trackCapability(extensionId, 'queue.consume')

  const claimed = claimQueueMessages(getDb(), { topic, consumerId, limit: opts?.limit })
  return {
    ok: true,
    data: claimed.map((message) => {
      let payload: unknown = null
      try {
        payload = JSON.parse(message.payload_json)
      } catch {
        payload = null
      }
      return {
        id: message.id,
        topic: message.topic,
        payload,
        attempts: message.attempts,
        createdAt: message.created_at,
      }
    }),
  }
}

export function queueAck(extensionId: string, messageId: string): ExtensionHostCallResult {
  if (!hasCapability(extensionId, 'queue.consume')) {
    return unauthorized(`Extension ${extensionId} missing capability queue.consume`)
  }
  trackCapability(extensionId, 'queue.consume')
  const ok = ackQueueMessage(getDb(), messageId)
  return ok ? { ok: true } : { ok: false, error: { code: 'not_found', message: 'message not found' } }
}

export function queueNack(extensionId: string, messageId: string, retryAt?: string, errorMessage?: string): ExtensionHostCallResult {
  if (!hasCapability(extensionId, 'queue.consume')) {
    return unauthorized(`Extension ${extensionId} missing capability queue.consume`)
  }
  trackCapability(extensionId, 'queue.consume')
  const result = nackQueueMessage(getDb(), { id: messageId, retryAt, error: errorMessage })
  if (!result.ok) {
    return { ok: false, error: { code: 'not_found', message: 'message not found' } }
  }
  return { ok: true, data: { deadLettered: result.deadLettered } }
}

export function queueListDeadLetters(extensionId: string, topic?: string): ExtensionHostCallResult {
  if (!hasCapability(extensionId, 'queue.consume')) {
    return unauthorized(`Extension ${extensionId} missing capability queue.consume`)
  }
  trackCapability(extensionId, 'queue.consume')
  const rows = listQueueMessages(getDb(), { topic, status: 'dead', limit: 200 })
  return {
    ok: true,
    data: rows.map((row) => ({
      id: row.id,
      topic: row.topic,
      attempts: row.attempts,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  }
}

function getFilesDirForExtension(extensionId: string): string {
  const dir = path.join(FILES_ROOT, extensionId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function sanitizeRelativePath(input: string): string | null {
  if (!input || input.includes('\0')) return null
  const normalized = path.normalize(input).replace(/^([/\\])+/, '')
  if (normalized.includes('..')) return null
  return normalized
}

export function storageKvGet(extensionId: string, key: string): ExtensionHostCallResult {
  if (!hasCapability(extensionId, 'storage.kv')) return unauthorized(`Extension ${extensionId} missing capability storage.kv`)
  trackCapability(extensionId, 'storage.kv')
  return { ok: true, data: extensionKvGet(getDb(), extensionId, key) }
}

export function storageKvSet(extensionId: string, key: string, value: unknown): ExtensionHostCallResult {
  if (!hasCapability(extensionId, 'storage.kv')) return unauthorized(`Extension ${extensionId} missing capability storage.kv`)
  trackCapability(extensionId, 'storage.kv')
  extensionKvSet(getDb(), extensionId, key, value)
  return { ok: true }
}

export function storageKvDeleteEntry(extensionId: string, key: string): ExtensionHostCallResult {
  if (!hasCapability(extensionId, 'storage.kv')) return unauthorized(`Extension ${extensionId} missing capability storage.kv`)
  trackCapability(extensionId, 'storage.kv')
  const removed = extensionKvDelete(getDb(), extensionId, key)
  return { ok: true, data: { removed } }
}

export function storageKvListEntries(extensionId: string): ExtensionHostCallResult {
  if (!hasCapability(extensionId, 'storage.kv')) return unauthorized(`Extension ${extensionId} missing capability storage.kv`)
  trackCapability(extensionId, 'storage.kv')
  return { ok: true, data: extensionKvList(getDb(), extensionId) }
}

export function storageFilesRead(extensionId: string, relativePath: string): ExtensionHostCallResult {
  if (!hasCapability(extensionId, 'storage.files')) return unauthorized(`Extension ${extensionId} missing capability storage.files`)
  trackCapability(extensionId, 'storage.files')
  const safe = sanitizeRelativePath(relativePath)
  if (!safe) return { ok: false, error: { code: 'invalid_args', message: 'invalid path' } }
  const target = path.join(getFilesDirForExtension(extensionId), safe)
  if (!fs.existsSync(target)) return { ok: false, error: { code: 'not_found', message: 'file not found' } }
  return { ok: true, data: fs.readFileSync(target, 'utf8') }
}

export function storageFilesWrite(extensionId: string, relativePath: string, content: string): ExtensionHostCallResult {
  if (!hasCapability(extensionId, 'storage.files')) return unauthorized(`Extension ${extensionId} missing capability storage.files`)
  trackCapability(extensionId, 'storage.files')
  const safe = sanitizeRelativePath(relativePath)
  if (!safe) return { ok: false, error: { code: 'invalid_args', message: 'invalid path' } }
  const root = getFilesDirForExtension(extensionId)
  const target = path.join(root, safe)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content, 'utf8')
  return { ok: true }
}

export function hostCall(extensionId: string, method: string, params?: Record<string, unknown>): ExtensionHostCallResult {
  try {
    switch (method) {
      case 'notifications.notify': {
        if (!hasCapability(extensionId, 'host.notifications')) return unauthorized(`Extension ${extensionId} missing capability host.notifications`)
        trackCapability(extensionId, 'host.notifications')
        const title = typeof params?.title === 'string' ? params.title : 'Notification'
        const body = typeof params?.body === 'string' ? params.body : ''
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('extension:notification', { title, body })
        }
        return { ok: true }
      }
      case 'conversations.list': {
        if (!hasCapability(extensionId, 'host.conversations.read')) return unauthorized(`Extension ${extensionId} missing capability host.conversations.read`)
        trackCapability(extensionId, 'host.conversations.read')
        const rows = listConversations(getDb())
        return {
          ok: true,
          data: rows.map((row) => ({
            id: row.id,
            projectId: row.project_id,
            title: row.title,
            updatedAt: row.updated_at,
            lastMessageAt: row.last_message_at,
          })),
        }
      }
      case 'projects.list': {
        if (!hasCapability(extensionId, 'host.projects.read')) return unauthorized(`Extension ${extensionId} missing capability host.projects.read`)
        trackCapability(extensionId, 'host.projects.read')
        const rows = listProjects(getDb())
        return {
          ok: true,
          data: rows.map((row) => ({ id: row.id, name: row.name, repoPath: row.repo_path, updatedAt: row.updated_at })),
        }
      }
      case 'open.mainView': {
        const viewId = typeof params?.viewId === 'string' ? params.viewId : null
        if (!viewId) return { ok: false, error: { code: 'invalid_args', message: 'viewId is required' } }
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('extensions:openMainView', { extensionId, viewId })
        }
        return { ok: true }
      }
      default:
        return { ok: false, error: { code: 'not_found', message: `Unknown host method: ${method}` } }
    }
  } catch (error) {
    return { ok: false, error: { code: 'internal', message: error instanceof Error ? error.message : String(error) } }
  }
}

function evaluateConditions(conditions: unknown, eventPayload: unknown): boolean {
  if (!Array.isArray(conditions) || conditions.length === 0) return true
  if (!eventPayload || typeof eventPayload !== 'object' || Array.isArray(eventPayload)) return false
  const record = eventPayload as Record<string, unknown>
  for (const condition of conditions) {
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return false
    const c = condition as Record<string, unknown>
    const field = typeof c.field === 'string' ? c.field : ''
    const operator = typeof c.operator === 'string' ? c.operator : 'equals'
    const value = c.value
    const actual = record[field]
    if (operator === 'equals' && actual !== value) return false
    if (operator === 'contains') {
      if (typeof actual !== 'string' || typeof value !== 'string' || !actual.includes(value)) return false
    }
  }
  return true
}

function executeAutomationAction(action: Record<string, unknown>, eventTopic: string, eventPayload: unknown): { ok: boolean; error?: string } {
  const type = typeof action.type === 'string' ? action.type : ''
  if (type === 'notify') {
    const title = typeof action.title === 'string' ? action.title : `Automation: ${eventTopic}`
    const body = typeof action.body === 'string' ? action.body : JSON.stringify(eventPayload)
    hostCall(BUILTIN_AUTOMATION_ID, 'notifications.notify', { title, body })
    return { ok: true }
  }
  if (type === 'enqueueEvent') {
    const topic = typeof action.topic === 'string' ? action.topic : `automation.${eventTopic}`
    const payload = action.payload ?? eventPayload
    queueEnqueue(BUILTIN_AUTOMATION_ID, topic, payload)
    return { ok: true }
  }
  if (type === 'runHostCommand') {
    const method = typeof action.method === 'string' ? action.method : ''
    if (!['notifications.notify', 'open.mainView'].includes(method)) {
      return { ok: false, error: `host command not allowed: ${method}` }
    }
    const result = hostCall(BUILTIN_AUTOMATION_ID, method, (action.params as Record<string, unknown> | undefined) ?? {})
    return result.ok ? { ok: true } : { ok: false, error: result.error.message }
  }
  if (type === 'setConversationTag') {
    return { ok: true }
  }
  return { ok: false, error: `unsupported action type: ${type}` }
}

function runAutomationOnEvent(extensionId: string, eventTopic: string, eventPayload: unknown) {
  if (extensionId !== BUILTIN_AUTOMATION_ID) return
  const db = getDb()
  const rules = listAutomationRules(db)
  const nowTs = Date.now()

  for (const rule of rules) {
    if (!rule.enabled) continue
    if (rule.trigger_topic !== eventTopic) continue

    let conditions: unknown[] = []
    let actions: Array<Record<string, unknown>> = []
    try {
      conditions = JSON.parse(rule.conditions_json) as unknown[]
    } catch {
      conditions = []
    }
    try {
      const parsed = JSON.parse(rule.actions_json) as unknown
      actions = Array.isArray(parsed) ? parsed.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item)) : []
    } catch {
      actions = []
    }

    const lastTriggered = rule.last_triggered_at ? Date.parse(rule.last_triggered_at) : 0
    if (Number.isFinite(lastTriggered) && rule.cooldown_ms > 0 && nowTs - lastTriggered < rule.cooldown_ms) {
      continue
    }

    if (!evaluateConditions(conditions, eventPayload)) {
      continue
    }

    let status: 'ok' | 'error' = 'ok'
    let errorMessage: string | undefined
    for (const action of actions) {
      const result = executeAutomationAction(action, eventTopic, eventPayload)
      if (!result.ok) {
        status = 'error'
        errorMessage = result.error
        break
      }
    }

    markAutomationRuleTriggered(db, rule.id)
    insertAutomationRun(db, {
      id: crypto.randomUUID(),
      ruleId: rule.id,
      eventTopic,
      eventPayloadJson: JSON.stringify(eventPayload),
      status,
      errorMessage,
    })
  }
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
    const db = getDb()
    if (apiName === 'automation.rules.list') {
      const rules = listAutomationRules(db).map((rule) => ({
        id: rule.id,
        name: rule.name,
        enabled: Boolean(rule.enabled),
        trigger: rule.trigger_topic,
        conditions: safeParseJson(rule.conditions_json, []),
        actions: safeParseJson(rule.actions_json, []),
        cooldown: rule.cooldown_ms,
        createdAt: rule.created_at,
        updatedAt: rule.updated_at,
      }))
      return { ok: true, data: rules }
    }
    if (apiName === 'automation.rules.save') {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return { ok: false, error: { code: 'invalid_args', message: 'payload object expected' } }
      }
      const p = payload as Record<string, unknown>
      const id = typeof p.id === 'string' && p.id ? p.id : crypto.randomUUID()
      const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim() : null
      const trigger = typeof p.trigger === 'string' ? p.trigger : null
      if (!name || !trigger) {
        return { ok: false, error: { code: 'invalid_args', message: 'name and trigger are required' } }
      }
      if (!isAutomationTriggerTopic(trigger)) {
        return {
          ok: false,
          error: {
            code: 'invalid_args',
            message: `trigger must be one of: ${AUTOMATION_TRIGGER_TOPICS.join(', ')}`,
          },
        }
      }
      const conditions = Array.isArray(p.conditions) ? p.conditions : []
      const actions = Array.isArray(p.actions) ? p.actions : []
      const cooldown = typeof p.cooldown === 'number' && Number.isFinite(p.cooldown) ? Math.max(0, Math.floor(p.cooldown)) : 0
      saveAutomationRule(db, {
        id,
        name,
        enabled: p.enabled !== false,
        triggerTopic: trigger,
        conditionsJson: JSON.stringify(conditions),
        actionsJson: JSON.stringify(actions),
        cooldownMs: cooldown,
      })
      return { ok: true, data: { id } }
    }
    if (apiName === 'automation.rules.delete') {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof (payload as Record<string, unknown>).id !== 'string') {
        return { ok: false, error: { code: 'invalid_args', message: 'id is required' } }
      }
      const ok = deleteAutomationRule(db, (payload as Record<string, string>).id)
      return ok ? { ok: true } : { ok: false, error: { code: 'not_found', message: 'rule not found' } }
    }
    if (apiName === 'automation.runs.list') {
      const params = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {}
      const rows = listAutomationRuns(db, {
        ruleId: typeof params.ruleId === 'string' ? params.ruleId : undefined,
        limit: typeof params.limit === 'number' ? params.limit : undefined,
      })
      return {
        ok: true,
        data: rows.map((row) => ({
          id: row.id,
          ruleId: row.rule_id,
          eventTopic: row.event_topic,
          eventPayload: safeParseJson(row.event_payload_json, null),
          status: row.status,
          errorMessage: row.error_message,
          createdAt: row.created_at,
        })),
      }
    }
    if (apiName === 'automation.schedule_task') {
      const params = asRecord(payload) ?? {}
      const instruction = typeof params.instruction === 'string' ? params.instruction.trim() : ''
      const name = typeof params.name === 'string' && params.name.trim()
        ? params.name.trim()
        : instruction.slice(0, 80) || 'Scheduled task'
      const triggerInput = typeof params.trigger === 'string' ? params.trigger.trim() : ''
      const trigger = isAutomationTriggerTopic(triggerInput) ? triggerInput : parseTriggerDescription(triggerInput || instruction)
      const cooldown = typeof params.cooldown === 'number' && Number.isFinite(params.cooldown)
        ? Math.max(0, Math.floor(params.cooldown))
        : parseCooldownToMs(instruction)
      if (!instruction) {
        return { ok: false, error: { code: 'invalid_args', message: 'instruction is required' } }
      }
      const action: Record<string, unknown> = {
        type: 'notify',
        title: `Automation: ${name}`,
        body: typeof params.notifyMessage === 'string' && params.notifyMessage.trim()
          ? params.notifyMessage.trim()
          : instruction,
        instruction,
      }
      if (typeof params.projectId === 'string' && params.projectId.trim()) action.projectId = params.projectId.trim()
      if (typeof params.modelKey === 'string' && params.modelKey.trim()) action.model = params.modelKey.trim()
      const id = typeof params.id === 'string' && params.id.trim() ? params.id.trim() : crypto.randomUUID()
      saveAutomationRule(db, {
        id,
        name,
        enabled: params.enabled !== false,
        triggerTopic: trigger,
        conditionsJson: JSON.stringify(Array.isArray(params.conditions) ? params.conditions : []),
        actionsJson: JSON.stringify([action]),
        cooldownMs: cooldown,
      })
      return {
        ok: true,
        data: {
          id,
          name,
          trigger,
          cooldown,
          instruction,
        },
      }
    }
    if (apiName === 'automation.list_scheduled_tasks') {
      const params = asRecord(payload) ?? {}
      const limit = typeof params.limit === 'number' && Number.isFinite(params.limit)
        ? Math.max(1, Math.min(200, Math.floor(params.limit)))
        : 50
      const rules = listAutomationRules(db)
        .slice(0, limit)
        .map((rule) => ({
          id: rule.id,
          name: rule.name,
          enabled: Boolean(rule.enabled),
          trigger: rule.trigger_topic,
          cooldown: rule.cooldown_ms,
          lastTriggeredAt: rule.last_triggered_at,
          actions: safeParseJson(rule.actions_json, []),
          updatedAt: rule.updated_at,
        }))
      return { ok: true, data: rules }
    }
  }

  return { ok: false, error: { code: 'not_found', message: `API ${apiName} not found on ${extensionId}` } }
}

function safeParseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function runExtensionsQueueWorkerCycle() {
  const topic = 'automation.events'
  const consume = queueConsume(BUILTIN_AUTOMATION_ID, topic, 'automation-worker', { limit: 20 })
  if (!consume.ok) return
  const messages = Array.isArray(consume.data) ? consume.data : []
  for (const message of messages) {
    const m = message as { id: string; payload?: unknown }
    try {
      if (m.payload && typeof m.payload === 'object' && !Array.isArray(m.payload)) {
        const payload = m.payload as Record<string, unknown>
        const topicName = typeof payload.topic === 'string' ? payload.topic : null
        if (topicName) {
          runAutomationOnEvent(BUILTIN_AUTOMATION_ID, topicName, payload.payload ?? payload)
        }
      }
      queueAck(BUILTIN_AUTOMATION_ID, m.id)
    } catch (error) {
      queueNack(BUILTIN_AUTOMATION_ID, m.id, undefined, error instanceof Error ? error.message : String(error))
    }
  }
}

export function getExtensionRuntimeHealth() {
  const manifests = listExtensionManifests()
  const deadLetters = listQueueMessages(getDb(), { status: 'dead', limit: 50 })
  return {
    ok: true as const,
    started: runtimeState.started,
    manifests: manifests.length,
    subscriptions: runtimeState.subscriptions.size,
    deadLetters: deadLetters.length,
    byExtension: manifests.map((manifest) => ({
      extensionId: manifest.id,
      capabilitiesDeclared: manifest.capabilities,
      capabilitiesUsed: Array.from(runtimeState.capabilityUsage.get(manifest.id) ?? new Set()),
    })),
  }
}

export function enrichExtensionsWithRuntimeFields(entries: ChatonsExtensionRegistryEntry[]) {
  return entries.map((entry) => {
    const manifest = getExtensionManifest(entry.id)
    return {
      ...entry,
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

export function getExtensionMainViewHtml(viewId: string): { ok: true; html: string } | { ok: false; message: string } {
  const manifests = listExtensionManifests()
  const match = manifests
    .flatMap((manifest) =>
      (manifest.ui?.mainViews ?? []).map((mainView) => ({
        extensionId: manifest.id,
        mainView,
      })),
    )
    .find((item) => item.mainView.viewId === viewId)

  if (!match) {
    return { ok: false, message: `main view not found: ${viewId}` }
  }

  const webviewUrl = match.mainView.webviewUrl
  if (!webviewUrl.startsWith('chaton-extension://')) {
    return { ok: false, message: `unsupported webviewUrl: ${webviewUrl}` }
  }

  const withoutScheme = webviewUrl.slice('chaton-extension://'.length)
  const expectedPrefix = `${match.extensionId}/`
  let relativePath = withoutScheme
  if (withoutScheme.startsWith(expectedPrefix)) {
    relativePath = withoutScheme.slice(expectedPrefix.length)
  }
  const extensionId = match.extensionId
  const rootsToTry = extensionId === BUILTIN_AUTOMATION_ID
    ? [BUILTIN_AUTOMATION_DIR, runtimeState.extensionRoots.get(extensionId), path.join(EXTENSIONS_DIR, extensionId)].filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      )
    : [runtimeState.extensionRoots.get(extensionId), path.join(EXTENSIONS_DIR, extensionId)].filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      )

  let targetPath: string | null = null
  for (const root of rootsToTry) {
    const candidate = path.resolve(root, relativePath)
    if (!candidate.startsWith(path.resolve(root))) {
      continue
    }
    if (fs.existsSync(candidate)) {
      targetPath = candidate
      break
    }
  }
  if (!targetPath) {
    const primaryRoot = rootsToTry[0] ?? path.join(EXTENSIONS_DIR, extensionId)
    return { ok: false, message: `view file not found: ${path.resolve(primaryRoot, relativePath)}` }
  }

  try {
    let html = fs.readFileSync(targetPath, 'utf8')
    const baseDir = path.dirname(targetPath)

    html = html.replace(/<script\s+[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (_match, srcRaw: string) => {
      const src = String(srcRaw || '')
      if (/^https?:\/\//i.test(src) || src.startsWith('data:')) {
        return _match
      }
      const scriptPath = path.resolve(baseDir, src)
      if (!scriptPath.startsWith(path.resolve(baseDir)) || !fs.existsSync(scriptPath)) {
        return _match
      }
      const content = fs.readFileSync(scriptPath, 'utf8')
      return `<script>\n${content}\n</script>`
    })

    html = html.replace(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (_match, hrefRaw: string) => {
      const href = String(hrefRaw || '')
      if (/^https?:\/\//i.test(href) || href.startsWith('data:')) {
        return _match
      }
      const cssPath = path.resolve(baseDir, href)
      if (!cssPath.startsWith(path.resolve(baseDir)) || !fs.existsSync(cssPath)) {
        return _match
      }
      const content = fs.readFileSync(cssPath, 'utf8')
      return `<style>\n${content}\n</style>`
    })

    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head[^>]*>/i, (match) => `${match}\n<script>\n${EXTENSION_UI_BRIDGE_SCRIPT}\n</script>`)
    } else {
      html = `<script>\n${EXTENSION_UI_BRIDGE_SCRIPT}\n</script>\n${html}`
    }

    return { ok: true, html }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
