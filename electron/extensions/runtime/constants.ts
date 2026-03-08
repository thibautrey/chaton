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
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
export const BUILTIN_AUTOMATION_DIR = path.join(__dirname, '..', 'builtin', 'automation')
export const BUILTIN_MEMORY_DIR = path.join(__dirname, '..', 'builtin', 'memory')
export const AUTOMATION_TRIGGER_TOPICS = [
  'conversation.created',
  'conversation.message.received',
  'project.created',
  'conversation.agent.ended',
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
          required: ['name', 'instruction'],
        },
      },
      {
        name: 'automation.list_scheduled_tasks',
        label: 'List scheduled automation tasks',
        description: 'List existing automation rules so the LLM can inspect already programmed tasks before creating or updating one.',
        promptSnippet: 'List current automation rules.',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Optional max number of rules.' },
          },
        },
      },
      {
        name: 'display_action_suggestions',
        label: 'Display action suggestions',
        description: 'Display a choice menu of action badges in the composer for the user to click. Useful for guiding users through decisions without requiring typed input.',
        promptSnippet: 'Display suggested actions as clickable badges in the composer.',
        promptGuidelines: [
          'Use this tool to present multiple options to the user as a choice menu.',
          'Keep labels short (max 30 chars) and action messages concise.',
          'Limit suggestions to 4 or fewer for good UI layout.',
          'Each action message should be a complete instruction or question the user would enter.',
        ],
        parameters: {
          type: 'object',
          properties: {
            suggestions: {
              type: 'array',
              minItems: 1,
              maxItems: 4,
              description: 'Array of action suggestions to display (max 4 for UI fit)',
              items: {
                type: 'object',
                properties: {
                  label: {
                    type: 'string',
                    description: 'Short button text (recommended max 30 chars)',
                    maxLength: 50,
                  },
                  message: {
                    type: 'string',
                    description: 'The message to send when user clicks this action',
                  },
                  id: {
                    type: 'string',
                    description: 'Optional unique ID for this suggestion (auto-generated if omitted)',
                  },
                },
                required: ['label', 'message'],
              },
            },
          },
          required: ['suggestions'],
        },
      },
    ],
  },
}
