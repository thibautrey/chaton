import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ExtensionManifest } from './types.js'

export const CHATON_BASE = path.join(os.homedir(), '.chaton')
export const EXTENSIONS_DIR = path.join(CHATON_BASE, 'extensions')
export const LOGS_DIR = path.join(CHATON_BASE, 'extensions', 'logs')
export const FILES_ROOT = path.join(CHATON_BASE, 'extensions', 'data')
export const BUILTIN_AUTOMATION_ID = '@chaton/automation'
export const BUILTIN_MEMORY_ID = '@chaton/memory'
export const BUILTIN_BROWSER_ID = '@chaton/browser'
export const BUILTIN_IDE_LAUNCHER_ID = '@chaton/ide-launcher'
export const BUILTIN_TPS_MONITOR_ID = '@chaton/tps-monitor'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
export const BUILTIN_AUTOMATION_DIR = path.join(__dirname, '..', 'builtin', 'automation')
export const BUILTIN_MEMORY_DIR = path.join(__dirname, '..', 'builtin', 'memory')
export const BUILTIN_BROWSER_DIR = path.join(__dirname, '..', 'builtin', 'browser')
export const BUILTIN_IDE_LAUNCHER_DIR = path.join(__dirname, '..', 'builtin', 'ide-launcher')
export const BUILTIN_TPS_MONITOR_DIR = path.join(__dirname, '..', 'builtin', 'tps-monitor')
export const AUTOMATION_TRIGGER_TOPICS = [
  'conversation.created',
  'conversation.message.received',
  'project.created',
  'conversation.agent.ended',
  'cron',
  'extension.event',
] as const
export const PI_TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/
export const ICON_EXTENSIONS = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
])

export const AUTOMATION_MANIFEST: ExtensionManifest = {
  id: BUILTIN_AUTOMATION_ID,
  name: 'Chatons Automation',
  version: '1.6.2',
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
        title: 'Creer automatisation',
        description: 'Ouvre la vue Automatisations sur le panneau de creation.',
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
      { name: 'automation.publish_extension_event', version: '1.0.0' },
    ],
  },
  llm: {
    tools: [
      {
        name: 'automation.schedule_task',
        label: 'Schedule automation task',
        description: 'Create or update an automation rule that schedules a recurring or event-driven task for the user. Supports cron expressions and natural language scheduling.',
        promptSnippet: 'Program a user automation task by creating an automation rule.',
        promptGuidelines: [
          'Use this tool when the user asks to program, schedule, or automate a recurring task.',
          'Always provide a clear human-readable rule name and the task instruction to run.',
          'For cron-based scheduling, you can use standard cron expressions (e.g., "0 9 * * *" for 9am daily) or natural language patterns like "every day at 9am", "every monday at 2pm", "every 5 minutes", etc.',
          'The trigger parameter can be: "conversation.created", "conversation.message.received", "project.created", "conversation.agent.ended", or "cron".',
          'If the user describes a time-based schedule, use trigger="cron" and let the system parse the natural language or provide explicit cron syntax.',
        ],
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Human-readable automation name.' },
            instruction: { type: 'string', description: 'Natural-language task to automate.' },
            trigger: { type: 'string', description: 'Trigger topic: "conversation.created", "conversation.message.received", "project.created", "conversation.agent.ended", or "cron" for time-based scheduling.' },
            cronExpression: { type: 'string', description: 'For cron triggers: optional explicit cron expression (e.g., "0 9 * * *"). If omitted, will try to parse from trigger or instruction.' },
            cooldown: { type: 'number', description: 'Cooldown in milliseconds between runs (optional).' },
            projectId: { type: 'string', description: 'Optional target project id.' },
            modelKey: { type: 'string', description: 'Optional provider/model key to store with the task.' },
            notifyMessage: { type: 'string', description: 'Optional notification message.' },
          },
          required: ['name', 'instruction'],
        },
      },
      {
        name: 'automation.list_scheduled_tasks',
        label: 'List scheduled automation tasks',
        description: 'List existing automation rules so the LLM can inspect already programmed tasks before creating or updating one. Shows cron expressions for scheduled tasks.',
        promptSnippet: 'List current automation rules.',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Optional max number of rules.' },
          },
        },
      },
    ],
  },
}
