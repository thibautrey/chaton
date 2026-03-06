import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
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
  | 'host.conversations.write'

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
  kind?: 'channel'
  icon?: string
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
      icon?: string
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
  server?: {
    start?: {
      command: string
      args?: string[]
      cwd?: string
      env?: Record<string, string>
      readyUrl?: string
      healthUrl?: string
      expectExit?: boolean
      startTimeoutMs?: number
      readyTimeoutMs?: number
    }
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
  serverProcesses: Map<string, import('node:child_process').ChildProcess>
  serverStatus: Map<
    string,
    {
      startedAt?: string
      pid?: number
      ready?: boolean
      lastError?: string
      lastExitAt?: string
      lastExitCode?: number | null
    }
  >
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
const BUILTIN_MEMORY_ID = '@chaton/memory'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const BUILTIN_AUTOMATION_DIR = path.join(__dirname, 'builtin', 'automation')
const BUILTIN_MEMORY_DIR = path.join(__dirname, 'builtin', 'memory')
const AUTOMATION_TRIGGER_TOPICS = [
  'conversation.created',
  'conversation.message.received',
  'project.created',
  'conversation.agent.ended',
] as const
const PI_TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/

const ICON_EXTENSIONS = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
])

const EXTENSION_UI_BRIDGE_SCRIPT = `
(function () {
  function normalize(value) { return String(value || '').trim().toLowerCase(); }

  function ensureExtensionUiStyles() {
    if (document.getElementById('chaton-extension-ui-style')) return;
    var style = document.createElement('style');
    style.id = 'chaton-extension-ui-style';
    style.textContent = [
      ':root {',
      '  --chaton-ui-background: hsl(220 12% 96%);',
      '  --chaton-ui-foreground: hsl(222 12% 14%);',
      '  --chaton-ui-card: hsl(0 0% 100%);',
      '  --chaton-ui-primary: hsl(220 7% 32%);',
      '  --chaton-ui-primary-foreground: hsl(0 0% 100%);',
      '  --chaton-ui-muted: hsl(220 10% 92%);',
      '  --chaton-ui-muted-foreground: hsl(220 6% 44%);',
      '  --chaton-ui-accent: hsl(220 10% 93%);',
      '  --chaton-ui-accent-foreground: hsl(222 12% 16%);',
      '  --chaton-ui-border: hsl(220 9% 85%);',
      '  --chaton-ui-input: hsl(220 9% 85%);',
      '  --chaton-ui-ring: hsl(220 9% 70%);',
      '}',
      '.chaton-model-picker { width: 100%; }',
      '.chaton-model-picker-row { display: flex; gap: 8px; }',
      '.chaton-model-picker-select, .chaton-model-picker-filter { width: 100%; border: 1px solid var(--chaton-ui-input); background: var(--chaton-ui-card); color: var(--chaton-ui-foreground); border-radius: 12px; padding: 10px 12px; font: inherit; }',
      '.chaton-model-picker-toggle { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; border-radius: 12px; border: 1px solid var(--chaton-ui-border); background: var(--chaton-ui-card); color: var(--chaton-ui-foreground); padding: 0 14px; font: inherit; cursor: pointer; }',
      '.chaton-model-picker-toggle:hover { background: var(--chaton-ui-accent); color: var(--chaton-ui-accent-foreground); }',
      '.chaton-model-picker-filter-wrap { margin-top: 8px; }',
      '.chaton-model-picker-select:focus-visible, .chaton-model-picker-filter:focus-visible, .chaton-model-picker-toggle:focus-visible { outline: 2px solid var(--chaton-ui-ring); outline-offset: 2px; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function createButton(options) {
    ensureExtensionUiStyles();
    var button = document.createElement('button');
    button.type = options && options.type || 'button';
    button.className = 'chaton-ui-button chaton-ui-button--' + ((options && options.variant) || 'default');
    button.textContent = options && options.text || '';
    return button;
  }

  function createModelPicker(options) {
    ensureExtensionUiStyles();
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

  function createExtensionComponents() {
    ensureExtensionUiStyles();
    function cls() {
      return Array.prototype.slice.call(arguments).filter(Boolean).join(' ');
    }
    function el(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (typeof text === 'string') node.textContent = text;
      return node;
    }
    function createBadge(options) {
      var node = el('span', cls('chaton-ui-badge', 'chaton-ui-badge--' + ((options && options.variant) || 'secondary')));
      node.textContent = options && options.text || '';
      return node;
    }
    return { cls: cls, el: el, createButton: createButton, createBadge: createBadge, ensureStyles: ensureExtensionUiStyles };
  }

  window.chatonUi = Object.assign({}, window.chatonUi || {}, {
    ensureStyles: ensureExtensionUiStyles,
    createButton: createButton,
    createModelPicker: createModelPicker,
    createComponents: createExtensionComponents,
  });

  function registerExtensionServer(payload) {
    try {
      if (!payload || typeof payload !== 'object') return { ok: false, message: 'invalid payload' };
      var id = typeof payload.extensionId === 'string' ? payload.extensionId.trim() : '';
      if (!id) return { ok: false, message: 'extensionId is required' };
      if (!payload.command || typeof payload.command !== 'string') return { ok: false, message: 'command is required' };
      var hostBridge = typeof window.__chatonRegisterExtensionServer === 'function'
        ? window.__chatonRegisterExtensionServer
        : null;
      if (!hostBridge) return { ok: false, message: 'host bridge not available' };
      return hostBridge({
        extensionId: id,
        command: payload.command,
        args: Array.isArray(payload.args) ? payload.args : undefined,
        cwd: typeof payload.cwd === 'string' ? payload.cwd : undefined,
        env: typeof payload.env === 'object' && payload.env !== null ? payload.env : undefined,
        readyUrl: typeof payload.readyUrl === 'string' ? payload.readyUrl : undefined,
        healthUrl: typeof payload.healthUrl === 'string' ? payload.healthUrl : undefined,
        expectExit: payload.expectExit === true,
        startTimeoutMs: typeof payload.startTimeoutMs === 'number' ? payload.startTimeoutMs : undefined,
        readyTimeoutMs: typeof payload.readyTimeoutMs === 'number' ? payload.readyTimeoutMs : undefined,
      });
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  window.chaton = Object.assign({}, window.chaton || {}, {
    registerExtensionServerFromUi: registerExtensionServer,
  });
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

const MEMORY_EMBEDDING_MODEL = 'chatons-local-hash-trigram-v1'
const MEMORY_VECTOR_SIZE = 256

const runtimeState: ExtensionRuntimeState = {
  manifests: new Map(),
  extensionRoots: new Map(),
  subscriptions: new Map(),
  capabilityUsage: new Map(),
  serverProcesses: new Map(),
  serverStatus: new Map(),
  started: false,
}

function normalizeExtensionEnv(env: Record<string, unknown> | undefined): Record<string, string> {
  if (!env || typeof env !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (!key || typeof key !== 'string') continue
    if (value === undefined || value === null) continue
    out[key] = String(value)
  }
  return out
}

function getExtensionRoot(extensionId: string) {
  return runtimeState.extensionRoots.get(extensionId) ?? path.join(EXTENSIONS_DIR, extensionId)
}

function normalizePathInsideExtension(root: string, raw: string | undefined) {
  if (!raw || typeof raw !== 'string') return null
  const candidate = path.resolve(root, raw)
  if (!candidate.startsWith(path.resolve(root))) return null
  return candidate
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForReadyUrl(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      // ignore while starting
    }
    await sleep(300)
  }
  return false
}

async function ensureExtensionServerStarted(extensionId: string) {
  const manifest = runtimeState.manifests.get(extensionId)
  const start = manifest?.server?.start
  if (!start || !start.command) {
    appendExtensionLog(extensionId, 'info', 'server.start.skipped', { reason: 'missing_start_command' })
    return
  }

  const registryEntry = listChatonsExtensions().extensions.find((entry) => entry.id === extensionId)
  if (registryEntry && registryEntry.enabled === false) {
    appendExtensionLog(extensionId, 'info', 'server.start.skipped', { reason: 'extension_disabled' })
    return
  }

  const existing = runtimeState.serverProcesses.get(extensionId)
  if (existing && !existing.killed && existing.exitCode === null) {
    appendExtensionLog(extensionId, 'info', 'server.start.skipped', { reason: 'already_running' })
    return
  }

  const root = getExtensionRoot(extensionId)
  const cwd = normalizePathInsideExtension(root, start.cwd) ?? root
  const status = runtimeState.serverStatus.get(extensionId) ?? {}
  const now = new Date().toISOString()
  runtimeState.serverStatus.set(extensionId, { ...status, startedAt: now, ready: false, lastError: undefined })
  appendExtensionLog(extensionId, 'info', 'server.start.begin', {
    root,
    cwd,
    command: start.command,
    args: Array.isArray(start.args) ? start.args : [],
    readyUrl: start.readyUrl ?? null,
  })

  const env = {
    ...process.env,
    CHATON_EXTENSION_ID: extensionId,
    CHATON_EXTENSION_ROOT: root,
    CHATON_EXTENSION_DATA_DIR: path.join(FILES_ROOT, extensionId),
    ...normalizeExtensionEnv(start.env),
  }

  const args = Array.isArray(start.args) ? start.args : []
  const child = spawn(start.command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  runtimeState.serverProcesses.set(extensionId, child)

  child.once('error', (error) => {
    appendExtensionLog(extensionId, 'error', 'server.start.error', {
      message: error instanceof Error ? error.message : String(error),
    })
  })

  const onExit = (code: number | null) => {
    const prev = runtimeState.serverStatus.get(extensionId) ?? {}
    runtimeState.serverStatus.set(extensionId, {
      ...prev,
      lastExitAt: new Date().toISOString(),
      lastExitCode: code,
      ready: prev.ready && start.expectExit === true ? prev.ready : false,
    })
    appendExtensionLog(extensionId, 'info', 'server.exit', { code })
    runtimeState.serverProcesses.delete(extensionId)
  }
  child.once('exit', onExit)

  const handleChunk = (stream: 'stdout' | 'stderr') => (chunk: Buffer) => {
    const text = chunk.toString('utf8')
    appendExtensionLog(extensionId, stream === 'stdout' ? 'info' : 'warn', 'server.log', {
      stream,
      text,
    })
  }
  child.stdout?.on('data', handleChunk('stdout'))
  child.stderr?.on('data', handleChunk('stderr'))

  if (start.readyUrl) {
    const readyTimeout = typeof start.readyTimeoutMs === 'number' && Number.isFinite(start.readyTimeoutMs)
      ? Math.max(500, Math.floor(start.readyTimeoutMs))
      : 8000
    const ready = await waitForReadyUrl(start.readyUrl, readyTimeout)
    const prev = runtimeState.serverStatus.get(extensionId) ?? {}
    runtimeState.serverStatus.set(extensionId, {
      ...prev,
      ready,
      lastError: ready ? undefined : `Server not ready after ${readyTimeout}ms (${start.readyUrl})`,
    })
    appendExtensionLog(extensionId, ready ? 'info' : 'warn', 'server.ready', {
      ready,
      readyUrl: start.readyUrl,
      readyTimeout,
    })
  } else {
    const prev = runtimeState.serverStatus.get(extensionId) ?? {}
    runtimeState.serverStatus.set(extensionId, { ...prev, ready: true })
    appendExtensionLog(extensionId, 'info', 'server.ready', { ready: true, readyUrl: null, readyTimeout: null })
  }
}

function stopExtensionServer(extensionId: string) {
  const child = runtimeState.serverProcesses.get(extensionId)
  if (!child) return
  try {
    child.kill('SIGTERM')
  } catch {
    // ignore
  }
  runtimeState.serverProcesses.delete(extensionId)
}

export function registerExtensionServer(payload: {
  extensionId: string
  command: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  readyUrl?: string
  healthUrl?: string
  expectExit?: boolean
  startTimeoutMs?: number
  readyTimeoutMs?: number
}) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false as const, message: 'invalid payload' }
  }
  const extensionId = String(payload.extensionId || '').trim()
  const command = String(payload.command || '').trim()
  if (!extensionId || !command) {
    return { ok: false as const, message: 'extensionId and command are required' }
  }
  const manifest = runtimeState.manifests.get(extensionId)
  const server = {
    start: {
      command,
      args: Array.isArray(payload.args) ? payload.args : undefined,
      cwd: typeof payload.cwd === 'string' ? payload.cwd : undefined,
      env: payload.env,
      readyUrl: typeof payload.readyUrl === 'string' ? payload.readyUrl : undefined,
      healthUrl: typeof payload.healthUrl === 'string' ? payload.healthUrl : undefined,
      expectExit: payload.expectExit === true,
      startTimeoutMs: typeof payload.startTimeoutMs === 'number' ? payload.startTimeoutMs : undefined,
      readyTimeoutMs: typeof payload.readyTimeoutMs === 'number' ? payload.readyTimeoutMs : undefined,
    },
  }

  if (manifest) {
    manifest.server = server
  } else {
    runtimeState.manifests.set(extensionId, {
      id: extensionId,
      name: extensionId,
      version: '0.0.0',
      capabilities: [],
      server,
    })
  }

  runtimeState.serverStatus.set(extensionId, {
    startedAt: undefined,
    ready: false,
    lastError: undefined,
  })

  void ensureExtensionServerStarted(extensionId)
  return { ok: true as const }
}

function ensureDirs() {
  fs.mkdirSync(CHATON_BASE, { recursive: true })
  fs.mkdirSync(EXTENSIONS_DIR, { recursive: true })
  fs.mkdirSync(LOGS_DIR, { recursive: true })
  fs.mkdirSync(FILES_ROOT, { recursive: true })
}

function extensionLogFileSafeId(extensionId: string) {
  return String(extensionId || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function appendExtensionLog(extensionId: string, level: 'info' | 'warn' | 'error', event: string, context?: unknown) {
  ensureDirs()
  const logPath = path.join(LOGS_DIR, `${extensionLogFileSafeId(extensionId)}.runtime.log`)
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
    kind: m.kind === 'channel' ? 'channel' : undefined,
    icon: typeof m.icon === 'string' && m.icon.trim().length > 0 ? m.icon.trim() : undefined,
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
    server: m.server && typeof m.server === 'object' && !Array.isArray(m.server)
      ? (m.server as ExtensionManifest['server'])
      : undefined,
  }
}

function getExtensionRootCandidates(extensionId: string): string[] {
  return [
    runtimeState.extensionRoots.get(extensionId),
    path.join(EXTENSIONS_DIR, extensionId),
    path.join(EXTENSIONS_DIR, 'extensions', extensionId),
  ].filter((value, index, array): value is string => typeof value === 'string' && value.length > 0 && array.indexOf(value) === index)
}

function readManifestFromExtensionDir(extensionId: string): { manifest: ExtensionManifest; root: string } | null {
  for (const root of getExtensionRootCandidates(extensionId)) {
    const manifestPath = path.join(root, 'chaton.extension.json')
    if (!fs.existsSync(manifestPath)) continue
    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown
      const manifest = normalizeManifest(raw)
      if (manifest) return { manifest, root }
    } catch {
      // ignore invalid manifest candidates and continue searching fallback roots
    }
  }
  return null
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

function sanitizePiToolName(input: string) {
  return String(input || '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function resolveIconFilePath(extensionId: string, iconPath: string): string | null {
  const relative = String(iconPath || '').trim()
  if (!relative) return null
  const rootsToTry = (extensionId === BUILTIN_AUTOMATION_ID || extensionId === BUILTIN_MEMORY_ID)
    ? [
        extensionId === BUILTIN_AUTOMATION_ID ? BUILTIN_AUTOMATION_DIR : BUILTIN_MEMORY_DIR,
        ...getExtensionRootCandidates(extensionId),
      ].filter((value, index, array): value is string => typeof value === 'string' && value.length > 0 && array.indexOf(value) === index)
    : getExtensionRootCandidates(extensionId)

  for (const root of rootsToTry) {
    const candidate = path.resolve(root, relative)
    if (!candidate.startsWith(path.resolve(root))) continue
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function resolveIconDataUrl(extensionId: string, iconPath: string): string | null {
  const target = resolveIconFilePath(extensionId, iconPath)
  if (!target) return null
  const ext = path.extname(target).toLowerCase()
  const mime = ICON_EXTENSIONS.get(ext)
  if (!mime) return null
  try {
    const data = fs.readFileSync(target)
    return `data:${mime};base64,${data.toString('base64')}`
  } catch {
    return null
  }
}

type MemoryScope = 'global' | 'project'
type MemoryListScope = MemoryScope | 'all'

type MemoryRow = {
  id: string
  scope: MemoryScope
  project_id: string | null
  kind: string
  title: string | null
  content: string
  tags_json: string
  source: string
  conversation_id: string | null
  embedding_model: string
  embedding_json: string
  created_at: string
  updated_at: string
  last_accessed_at: string | null
  access_count: number
  archived: number
}

function memoryNormalizeText(input: string) {
  return String(input || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function memoryHashToken(token: string) {
  let hash = 2166136261
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0)
}

function memoryBuildEmbedding(text: string) {
  const normalized = ` ${memoryNormalizeText(text)} `
  const vector = new Array<number>(MEMORY_VECTOR_SIZE).fill(0)
  for (let i = 0; i < normalized.length - 2; i += 1) {
    const gram = normalized.slice(i, i + 3)
    const hash = memoryHashToken(gram)
    const idx = hash % MEMORY_VECTOR_SIZE
    vector[idx] += 1
  }
  let norm = 0
  for (const value of vector) norm += value * value
  norm = Math.sqrt(norm) || 1
  return vector.map((value) => Number((value / norm).toFixed(6)))
}

function memoryCosineSimilarity(a: number[], b: number[]) {
  const len = Math.min(a.length, b.length)
  let dot = 0
  for (let i = 0; i < len; i += 1) dot += a[i] * b[i]
  return dot
}

function memorySafeParseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function memoryReadTags(row: MemoryRow) {
  return memorySafeParseJson<string[]>(row.tags_json, [])
}

function memoryHydrateRow(row: MemoryRow) {
  return {
    id: row.id,
    scope: row.scope,
    projectId: row.project_id,
    kind: row.kind,
    title: row.title,
    content: row.content,
    tags: memoryReadTags(row),
    source: row.source,
    conversationId: row.conversation_id,
    embeddingModel: row.embedding_model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastAccessedAt: row.last_accessed_at,
    accessCount: row.access_count,
    archived: Boolean(row.archived),
  }
}

function memoryListRows(filters?: {
  scope?: MemoryListScope
  projectId?: string
  kind?: string
  includeArchived?: boolean
  limit?: number
}) {
  const db = getDb()
  const conditions: string[] = []
  const params: unknown[] = []

  if (!filters?.includeArchived) conditions.push('archived = 0')
  if (filters?.scope === 'global') conditions.push("scope = 'global'")
  if (filters?.scope === 'project') conditions.push("scope = 'project'")
  if (filters?.projectId) {
    conditions.push('project_id = ?')
    params.push(filters.projectId)
  }
  if (filters?.kind) {
    conditions.push('kind = ?')
    params.push(filters.kind)
  }

  let sql = 'SELECT * FROM memory_entries'
  if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`
  sql += ' ORDER BY updated_at DESC'
  if (filters?.limit && Number.isFinite(filters.limit)) sql += ` LIMIT ${Math.max(1, Math.floor(filters.limit))}`

  return db.prepare(sql).all(...params) as MemoryRow[]
}

function memoryTouch(id: string) {
  const db = getDb()
  const now = new Date().toISOString()
  db.prepare('UPDATE memory_entries SET last_accessed_at = ?, access_count = access_count + 1 WHERE id = ?').run(now, id)
}

function memoryValidateScope(scope: unknown): scope is MemoryScope {
  return scope === 'global' || scope === 'project'
}

function memoryUpsert(payload: unknown): ExtensionHostCallResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: { code: 'invalid_args', message: 'payload object expected' } }
  }
  const p = payload as Record<string, unknown>
  const scope = p.scope
  if (!memoryValidateScope(scope)) {
    return { ok: false, error: { code: 'invalid_args', message: 'scope must be global or project' } }
  }
  const projectId = typeof p.projectId === 'string' && p.projectId.trim() ? p.projectId.trim() : null
  if (scope === 'project' && !projectId) {
    return { ok: false, error: { code: 'invalid_args', message: 'projectId is required when scope=project' } }
  }
  const content = typeof p.content === 'string' ? p.content.trim() : ''
  if (!content) {
    return { ok: false, error: { code: 'invalid_args', message: 'content is required' } }
  }
  const db = getDb()
  const now = new Date().toISOString()
  const id = typeof p.id === 'string' && p.id.trim() ? p.id.trim() : crypto.randomUUID()
  const title = typeof p.title === 'string' && p.title.trim() ? p.title.trim() : null
  const kind = typeof p.kind === 'string' && p.kind.trim() ? p.kind.trim() : 'fact'
  const tags = Array.isArray(p.tags) ? p.tags.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()) : []
  const source = typeof p.source === 'string' && p.source.trim() ? p.source.trim() : 'manual'
  const conversationId = typeof p.conversationId === 'string' && p.conversationId.trim() ? p.conversationId.trim() : null
  const embedding = memoryBuildEmbedding([title || '', kind, content, tags.join(' ')].filter(Boolean).join('\n'))

  const existing = db.prepare('SELECT id FROM memory_entries WHERE id = ?').get(id) as { id: string } | undefined
  if (existing) {
    db.prepare(`UPDATE memory_entries
      SET scope = ?, project_id = ?, kind = ?, title = ?, content = ?, tags_json = ?, source = ?, conversation_id = ?,
          embedding_model = ?, embedding_json = ?, updated_at = ?
      WHERE id = ?`).run(
      scope,
      projectId,
      kind,
      title,
      content,
      JSON.stringify(tags),
      source,
      conversationId,
      MEMORY_EMBEDDING_MODEL,
      JSON.stringify(embedding),
      now,
      id,
    )
  } else {
    db.prepare(`INSERT INTO memory_entries (
      id, scope, project_id, kind, title, content, tags_json, source, conversation_id,
      embedding_model, embedding_json, created_at, updated_at, archived
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
      id,
      scope,
      projectId,
      kind,
      title,
      content,
      JSON.stringify(tags),
      source,
      conversationId,
      MEMORY_EMBEDDING_MODEL,
      JSON.stringify(embedding),
      now,
      now,
    )
  }

  const row = db.prepare('SELECT * FROM memory_entries WHERE id = ?').get(id) as MemoryRow | undefined
  return { ok: true, data: row ? memoryHydrateRow(row) : { id } }
}

function memorySearch(payload: unknown): ExtensionHostCallResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: { code: 'invalid_args', message: 'payload object expected' } }
  }
  const p = payload as Record<string, unknown>
  const query = typeof p.query === 'string' ? p.query.trim() : ''
  if (!query) {
    return { ok: false, error: { code: 'invalid_args', message: 'query is required' } }
  }
  const scope = p.scope === 'global' || p.scope === 'project' || p.scope === 'all' ? p.scope : 'all'
  const projectId = typeof p.projectId === 'string' && p.projectId.trim() ? p.projectId.trim() : undefined
  const kind = typeof p.kind === 'string' && p.kind.trim() ? p.kind.trim() : undefined
  const includeArchived = p.includeArchived === true
  const limit = typeof p.limit === 'number' && Number.isFinite(p.limit) ? Math.max(1, Math.floor(p.limit)) : 10
  const tagsFilter = Array.isArray(p.tags) ? p.tags.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim().toLowerCase()) : []
  const queryEmbedding = memoryBuildEmbedding(query)
  const rows = memoryListRows({ scope, projectId, kind, includeArchived, limit: 500 })

  const ranked = rows
    .map((row) => {
      const embedding = memorySafeParseJson<number[]>(row.embedding_json, [])
      const tags = memoryReadTags(row)
      const lowerTags = tags.map((tag) => tag.toLowerCase())
      if (tagsFilter.length > 0 && !tagsFilter.every((tag) => lowerTags.includes(tag))) return null
      let score = memoryCosineSimilarity(queryEmbedding, embedding)
      const haystack = `${row.title || ''}\n${row.kind}\n${row.content}\n${tags.join(' ')}`.toLowerCase()
      const normalizedQuery = query.toLowerCase()
      if (haystack.includes(normalizedQuery)) score += 0.2
      return { row, score }
    })
    .filter((item): item is { row: MemoryRow; score: number } => item !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => ({ ...memoryHydrateRow(item.row), score: Number(item.score.toFixed(4)) }))

  for (const item of ranked) memoryTouch(item.id)
  return { ok: true, data: ranked }
}

function memoryGet(payload: unknown): ExtensionHostCallResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof (payload as Record<string, unknown>).id !== 'string') {
    return { ok: false, error: { code: 'invalid_args', message: 'id is required' } }
  }
  const id = ((payload as Record<string, unknown>).id as string).trim()
  const row = getDb().prepare('SELECT * FROM memory_entries WHERE id = ?').get(id) as MemoryRow | undefined
  if (!row) return { ok: false, error: { code: 'not_found', message: 'memory not found' } }
  memoryTouch(id)
  return { ok: true, data: memoryHydrateRow(row) }
}

function memoryUpdate(payload: unknown): ExtensionHostCallResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof (payload as Record<string, unknown>).id !== 'string') {
    return { ok: false, error: { code: 'invalid_args', message: 'id is required' } }
  }
  const p = payload as Record<string, unknown>
  const id = String(p.id).trim()
  const db = getDb()
  const row = db.prepare('SELECT * FROM memory_entries WHERE id = ?').get(id) as MemoryRow | undefined
  if (!row) return { ok: false, error: { code: 'not_found', message: 'memory not found' } }

  const title = typeof p.title === 'string' ? p.title.trim() || null : row.title
  const content = typeof p.content === 'string' ? p.content.trim() || row.content : row.content
  const kind = typeof p.kind === 'string' && p.kind.trim() ? p.kind.trim() : row.kind
  const tags = Array.isArray(p.tags) ? p.tags.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()) : memoryReadTags(row)
  const archived = typeof p.archived === 'boolean' ? (p.archived ? 1 : 0) : row.archived
  const updatedAt = new Date().toISOString()
  const embedding = memoryBuildEmbedding([title || '', kind, content, tags.join(' ')].filter(Boolean).join('\n'))

  db.prepare(`UPDATE memory_entries
    SET title = ?, content = ?, kind = ?, tags_json = ?, archived = ?, embedding_model = ?, embedding_json = ?, updated_at = ?
    WHERE id = ?`).run(
    title,
    content,
    kind,
    JSON.stringify(tags),
    archived,
    MEMORY_EMBEDDING_MODEL,
    JSON.stringify(embedding),
    updatedAt,
    id,
  )

  const next = db.prepare('SELECT * FROM memory_entries WHERE id = ?').get(id) as MemoryRow
  return { ok: true, data: memoryHydrateRow(next) }
}

function memoryDelete(payload: unknown): ExtensionHostCallResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof (payload as Record<string, unknown>).id !== 'string') {
    return { ok: false, error: { code: 'invalid_args', message: 'id is required' } }
  }
  const id = ((payload as Record<string, unknown>).id as string).trim()
  const info = getDb().prepare('DELETE FROM memory_entries WHERE id = ?').run(id)
  if (info.changes < 1) return { ok: false, error: { code: 'not_found', message: 'memory not found' } }
  return { ok: true, data: { id, deleted: true } }
}

function memoryList(payload: unknown): ExtensionHostCallResult {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {}
  const scope = p.scope === 'global' || p.scope === 'project' || p.scope === 'all' ? p.scope : 'all'
  const projectId = typeof p.projectId === 'string' && p.projectId.trim() ? p.projectId.trim() : undefined
  const kind = typeof p.kind === 'string' && p.kind.trim() ? p.kind.trim() : undefined
  const includeArchived = p.includeArchived === true
  const limit = typeof p.limit === 'number' && Number.isFinite(p.limit) ? Math.max(1, Math.floor(p.limit)) : 50
  return { ok: true, data: memoryListRows({ scope, projectId, kind, includeArchived, limit }).map(memoryHydrateRow) }
}

function resolvePiToolName(extensionId: string, manifestToolName: string, usedNames: Set<string>) {
  const raw = String(manifestToolName || '').trim()
  const directlyUsable = PI_TOOL_NAME_PATTERN.test(raw)
  const base = directlyUsable
    ? raw
    : sanitizePiToolName(`${sanitizePiToolName(extensionId)}_${sanitizePiToolName(raw)}`) || 'extension_tool'

  let resolved = base
  let suffix = 2
  while (usedNames.has(resolved)) {
    resolved = `${base}_${suffix}`
    suffix += 1
  }
  usedNames.add(resolved)

  return { resolved, renamed: resolved !== raw, reason: directlyUsable ? (resolved !== raw ? 'duplicate' : null) : 'invalid' }
}

function buildExtensionToolDefinitions(extensionId: string): ExposedExtensionToolDefinition[] {
  const manifest = runtimeState.manifests.get(extensionId)
  if (!manifest || !hasCapability(extensionId, 'llm.tools')) return []
  const toolManifests = Array.isArray(manifest.llm?.tools) ? manifest.llm?.tools ?? [] : []
  const usedToolNames = new Set<string>()
  const exposedTools: ExposedExtensionToolDefinition[] = []

  for (const entry of toolManifests) {
    if (!entry || typeof entry.name !== 'string' || typeof entry.description !== 'string') {
      appendExtensionLog(extensionId, 'warn', 'llm.tool_manifest_invalid', {
        reason: 'missing_name_or_description',
      })
      continue
    }

    const resolvedName = resolvePiToolName(extensionId, entry.name, usedToolNames)
    if (resolvedName.renamed) {
      appendExtensionLog(extensionId, 'warn', 'llm.tool_name_normalized', {
        reason: resolvedName.reason,
        manifestName: entry.name,
        exposedName: resolvedName.resolved,
      })
    }

    const apiName = entry.name
    exposedTools.push({
      extensionId,
      name: resolvedName.resolved,
      label: typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : apiName,
      description: entry.description,
      promptSnippet: typeof entry.promptSnippet === 'string' ? entry.promptSnippet : undefined,
      promptGuidelines: Array.isArray(entry.promptGuidelines)
        ? entry.promptGuidelines.filter((guideline): guideline is string => typeof guideline === 'string' && guideline.trim().length > 0)
        : undefined,
      parameters: normalizeTypeBoxSchema(entry.parameters),
      execute: async (_toolCallId, params) => {
        trackCapability(extensionId, 'llm.tools')
        const result = extensionsCall('chatons-llm', extensionId, apiName, '^1.0.0', params)
        if (!result.ok) {
          return {
            content: [{ type: 'text', text: result.error.message }],
            details: { extensionId, apiName, exposedToolName: resolvedName.resolved, ok: false },
            isError: true,
          }
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(result.data ?? null, null, 2) }],
          details: { extensionId, apiName, exposedToolName: resolvedName.resolved, ok: true, data: result.data ?? null },
        }
      },
    })
  }

  return exposedTools
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

  const builtinMemoryManifest = (() => {
    const manifestPath = path.join(BUILTIN_MEMORY_DIR, 'chaton.extension.json')
    if (!fs.existsSync(manifestPath)) return null
    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown
      return normalizeManifest(raw)
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

  for (const topic of AUTOMATION_TRIGGER_TOPICS) {
    subscribeExtension(BUILTIN_AUTOMATION_ID, topic)
  }

  runtimeState.started = true
  emitHostEvent('app.started', { startedAt: new Date().toISOString() })

  for (const manifest of runtimeState.manifests.values()) {
    if (manifest.server?.start) {
      void ensureExtensionServerStarted(manifest.id)
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
            modelProvider: row.model_provider,
            modelId: row.model_id,
            thinkingLevel: row.thinking_level,
          })),
        }
      }
      case 'channels.upsertGlobalThread': {
        if (!hasCapability(extensionId, 'host.conversations.write')) return unauthorized(`Extension ${extensionId} missing capability host.conversations.write`)
        trackCapability(extensionId, 'host.conversations.write')
        const key = typeof params?.mappingKey === 'string' ? params.mappingKey.trim() : ''
        if (!key) return { ok: false, error: { code: 'invalid_args', message: 'mappingKey is required' } }
        const title = typeof params?.title === 'string' && params.title.trim() ? params.title.trim() : 'Nouveau fil'
        const modelKey = typeof params?.modelKey === 'string' && params.modelKey.trim() ? params.modelKey.trim() : null
        const now = new Date().toISOString()
        const mappingStore = asRecord(extensionKvGet(getDb(), extensionId, 'channel.threadMappings')) ?? {}
        const existing = asRecord(mappingStore[key])
        const existingConversationId = typeof existing?.chatonsConversationId === 'string' ? existing.chatonsConversationId : null
        const db = getDb()
        if (existingConversationId) {
          const row = listConversations(db).find((item) => item.id === existingConversationId)
          if (row && row.project_id == null) {
            return {
              ok: true,
              data: {
                created: false,
                conversation: {
                  id: row.id,
                  projectId: row.project_id,
                  title: row.title,
                  updatedAt: row.updated_at,
                  lastMessageAt: row.last_message_at,
                  modelProvider: row.model_provider,
                  modelId: row.model_id,
                  thinkingLevel: row.thinking_level,
                },
              },
            }
          }
        }
        const conversationId = crypto.randomUUID()
        let modelProvider: string | null = null
        let modelId: string | null = null
        if (modelKey && modelKey.includes('/')) {
          const idx = modelKey.indexOf('/')
          modelProvider = modelKey.slice(0, idx) || null
          modelId = modelKey.slice(idx + 1) || null
        }
        const insertConversation = (globalThis as Record<string, unknown>).__chatonsInsertConversation as ((db: ReturnType<typeof getDb>, row: {
          id: string
          projectId: string | null
          title: string
          modelProvider: string | null
          modelId: string | null
          thinkingLevel: string | null
          worktreePath: string | null
          accessMode: 'secure' | 'open'
        }) => void) | undefined
        const findConversationById = (globalThis as Record<string, unknown>).__chatonsFindConversationById as ((db: ReturnType<typeof getDb>, conversationId: string) => { id: string; project_id: string | null; title: string; updated_at: string; last_message_at: string; model_provider: string | null; model_id: string | null; thinking_level: string | null } | null) | undefined
        if (!insertConversation || !findConversationById) {
          return { ok: false, error: { code: 'internal', message: 'conversation write bridge is not initialized' } }
        }
        insertConversation(db, {
          id: conversationId,
          projectId: null,
          title,
          modelProvider,
          modelId,
          thinkingLevel: null,
          worktreePath: null,
          accessMode: 'secure',
        })
        const created = findConversationById(db, conversationId)
        if (!created) return { ok: false, error: { code: 'internal', message: 'failed to create conversation' } }
        extensionKvSet(db, extensionId, 'channel.threadMappings', {
          ...mappingStore,
          [key]: {
            ...existing,
            chatonsConversationId: conversationId,
            modelKey,
            updatedAt: now,
          },
        })
        emitHostEvent('conversation.created', { conversationId, projectId: null })
        return {
          ok: true,
          data: {
            created: true,
            conversation: {
              id: created.id,
              projectId: created.project_id,
              title: created.title,
              updatedAt: created.updated_at,
              lastMessageAt: created.last_message_at,
              modelProvider: created.model_provider,
              modelId: created.model_id,
              thinkingLevel: created.thinking_level,
            },
          },
        }
      }
      case 'channels.ingestMessage': {
        if (!hasCapability(extensionId, 'host.conversations.write')) return unauthorized(`Extension ${extensionId} missing capability host.conversations.write`)
        trackCapability(extensionId, 'host.conversations.write')
        const conversationId = typeof params?.conversationId === 'string' ? params.conversationId.trim() : ''
        const message = typeof params?.message === 'string' ? params.message : ''
        const idempotencyKey = typeof params?.idempotencyKey === 'string' ? params.idempotencyKey.trim() : ''
        if (!conversationId || !message.trim()) return { ok: false, error: { code: 'invalid_args', message: 'conversationId and message are required' } }
        const bridge = (globalThis as Record<string, unknown>).__chatonsChannelBridge as {
          ingestExternalMessage?: (args: { extensionId: string; conversationId: string; message: string; idempotencyKey?: string | null; metadata?: Record<string, unknown> | null }) => Promise<{ ok: true; reply?: string | null } | { ok: false; message: string }>
        } | undefined
        if (!bridge?.ingestExternalMessage) {
          return { ok: false, error: { code: 'internal', message: 'channel ingestion bridge is not initialized' } }
        }
        return bridge.ingestExternalMessage({
          extensionId,
          conversationId,
          message,
          idempotencyKey: idempotencyKey || null,
          metadata: asRecord(params?.metadata) ?? null,
        }) as unknown as ExtensionHostCallResult
      }
      case 'conversations.getMessages': {
        if (!hasCapability(extensionId, 'host.conversations.read')) return unauthorized(`Extension ${extensionId} missing capability host.conversations.read`)
        trackCapability(extensionId, 'host.conversations.read')
        const conversationId = typeof params?.conversationId === 'string' ? params.conversationId.trim() : ''
        if (!conversationId) return { ok: false, error: { code: 'invalid_args', message: 'conversationId is required' } }
        const getMessages = (globalThis as Record<string, unknown>).__chatonsListConversationMessages as ((conversationId: string) => Array<{ id: string; role: string; payloadJson: string }>) | undefined
        if (!getMessages) {
          return { ok: false, error: { code: 'internal', message: 'conversation message bridge is not initialized' } }
        }
        return { ok: true, data: getMessages(conversationId) }
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
    appendExtensionLog('extensions-runtime', 'warn', 'main_view.lookup.failed', { viewId })
    return { ok: false, message: `main view not found: ${viewId}` }
  }

  appendExtensionLog(match.extensionId, 'info', 'main_view.lookup.ok', {
    viewId,
    webviewUrl: match.mainView.webviewUrl,
  })

  const webviewUrl = match.mainView.webviewUrl
  if (!webviewUrl.startsWith('chaton-extension://')) {
    return { ok: false, message: `unsupported webviewUrl: ${webviewUrl}` }
  }

  void ensureExtensionServerStarted(match.extensionId)

  const withoutScheme = webviewUrl.slice('chaton-extension://'.length)
  const expectedPrefix = `${match.extensionId}/`
  let relativePath = withoutScheme
  if (withoutScheme.startsWith(expectedPrefix)) {
    relativePath = withoutScheme.slice(expectedPrefix.length)
  }
  const extensionId = match.extensionId
  const rootsToTry = (extensionId === BUILTIN_AUTOMATION_ID || extensionId === BUILTIN_MEMORY_ID)
    ? [
        extensionId === BUILTIN_AUTOMATION_ID ? BUILTIN_AUTOMATION_DIR : BUILTIN_MEMORY_DIR,
        ...getExtensionRootCandidates(extensionId),
      ].filter((value, index, array): value is string => typeof value === 'string' && value.length > 0 && array.indexOf(value) === index)
    : getExtensionRootCandidates(extensionId)

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
    appendExtensionLog(extensionId, 'warn', 'main_view.file.missing', {
      viewId,
      relativePath,
      rootsToTry,
      primaryRoot,
    })
    return { ok: false, message: `view file not found: ${path.resolve(primaryRoot, relativePath)}` }
  }

  appendExtensionLog(extensionId, 'info', 'main_view.file.resolved', {
    viewId,
    relativePath,
    targetPath,
    rootsToTry,
  })

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
