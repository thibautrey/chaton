import crypto from 'node:crypto'
import electron from 'electron'
import { getDb } from '../../db/index.js'
import { listConversations } from '../../db/repos/conversations.js'
import { listProjects, findProjectById } from '../../db/repos/projects.js'
import { extensionKvGet, extensionKvSet } from '../../db/repos/extension-kv.js'
import { hasCapability, trackCapability } from './capabilities.js'
import { BUILTIN_AUTOMATION_ID } from './constants.js'
import { asRecord, unauthorized } from './helpers.js'
import { runtimeState } from './state.js'
import type { ExtensionHostCallResult } from './types.js'
import { isErrorResult, normalizeRuntimeContextId, normalizeRuntimeViewId } from './validation.js'

const { BrowserWindow } = electron

const MAX_NOTIFICATION_TITLE_LENGTH = 160
const MAX_NOTIFICATION_BODY_LENGTH = 2_000
const MAX_NOTIFICATION_LINK_LABEL_LENGTH = 80

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value
}

function normalizeNotificationUrl(href: unknown): string | null {
  if (typeof href !== 'string' || !href.trim()) return null
  try {
    const url = new URL(href.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

function normalizeNotificationDeeplink(href: unknown): string | null {
  if (typeof href !== 'string' || !href.trim()) return null
  const value = href.trim()
  const match = value.match(/^([a-zA-Z][a-zA-Z0-9_-]{0,40}):([a-zA-Z0-9._:-]{1,160})$/)
  if (!match) return null
  const [, type, target] = match
  if (!['conversation', 'project', 'settings', 'workspace', 'automation-suggestion'].includes(type)) return null
  return `${type}:${target}`
}

function normalizeNotificationLink(linkInput: { type?: unknown; href?: unknown; label?: unknown } | null) {
  if (!linkInput) return undefined
  const href = linkInput.type === 'url'
    ? normalizeNotificationUrl(linkInput.href)
    : linkInput.type === 'deeplink'
      ? normalizeNotificationDeeplink(linkInput.href)
      : null
  if (!href) return undefined
  return {
    type: linkInput.type,
    href,
    label: typeof linkInput.label === 'string' && linkInput.label.trim()
      ? truncateText(linkInput.label.trim(), MAX_NOTIFICATION_LINK_LABEL_LENGTH)
      : undefined,
  }
}

export type HostEventEmitter = (topic: string, payload: unknown) => { ok: true; event: { topic: string; payload: unknown; publishedAt: string } }

export function createHostCall(emitHostEvent: HostEventEmitter) {
  return function hostCall(extensionId: string, method: string, params?: Record<string, unknown>): ExtensionHostCallResult | Promise<ExtensionHostCallResult> {
    try {
      switch (method) {
        case 'notifications.notify': {
          if (!hasCapability(extensionId, 'host.notifications')) return unauthorized(`Extension ${extensionId} missing capability host.notifications`)
          trackCapability(extensionId, 'host.notifications')
          const title = truncateText(typeof params?.title === 'string' && params.title.trim() ? params.title.trim() : 'Notification', MAX_NOTIFICATION_TITLE_LENGTH)
          const body = truncateText(typeof params?.body === 'string' ? params.body : '', MAX_NOTIFICATION_BODY_LENGTH)
          const linkInput =
            params?.link && typeof params.link === 'object' && !Array.isArray(params.link)
              ? (params.link as { type?: unknown; href?: unknown; label?: unknown })
              : null
          const meta =
            params?.meta && typeof params.meta === 'object' && !Array.isArray(params.meta)
              ? params.meta
              : undefined
          const link = normalizeNotificationLink(linkInput)
          for (const win of BrowserWindow.getAllWindows()) {
            if (win.isDestroyed()) continue;
            const webContents = win.webContents;
            if (webContents.isDestroyed()) continue;
            try {
              webContents.send('extension:notification', { title, body, link, meta });
            } catch (err) {
              console.warn("[hostCall extension:notification] Failed to send to window:", err);
            }
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
          const hiddenFromSidebar = params?.hiddenFromSidebar === true
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
            channelExtensionId?: string | null
            hiddenFromSidebar?: boolean
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
            channelExtensionId: extensionId,
            hiddenFromSidebar,
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
        case 'channels.reportStatus': {
          if (!hasCapability(extensionId, 'host.conversations.write')) return unauthorized(`Extension ${extensionId} missing capability host.conversations.write`)
          trackCapability(extensionId, 'host.conversations.write')
          const configured = params?.configured === true
          const connected = params?.connected === true
          const lastActivity = typeof params?.lastActivity === 'string' ? params.lastActivity : null
          const issues = Array.isArray(params?.issues) ? params.issues.map(i => String(i)).filter(Boolean) : []
          const info = typeof params?.info === 'string' ? params.info : null
          
          const status = {
            configured,
            connected,
            lastActivity,
            issues,
            info,
            updatedAt: new Date().toISOString(),
          }
          
          runtimeState.channelStatus.set(extensionId, status)
          
          return { ok: true, data: { statusUpdated: true } }
        }
        case 'channels.getStatus': {
          if (!hasCapability(extensionId, 'host.conversations.write')) return unauthorized(`Extension ${extensionId} missing capability host.conversations.write`)
          trackCapability(extensionId, 'host.conversations.write')
          const status = runtimeState.channelStatus.get(extensionId) ?? null
          return { ok: true, data: status }
        }
        case 'channels.ingestMessage': {
          if (!hasCapability(extensionId, 'host.conversations.write')) return unauthorized(`Extension ${extensionId} missing capability host.conversations.write`)
          trackCapability(extensionId, 'host.conversations.write')
          const normalizedConversationId = normalizeRuntimeContextId(typeof params?.conversationId === 'string' ? params.conversationId : undefined, 'conversationId')
          if (isErrorResult(normalizedConversationId)) return normalizedConversationId
          const conversationId = normalizedConversationId ?? ''
          const message = typeof params?.message === 'string' ? params.message : ''
          const normalizedIdempotencyKey = normalizeRuntimeContextId(typeof params?.idempotencyKey === 'string' ? params.idempotencyKey : undefined, 'idempotencyKey')
          if (isErrorResult(normalizedIdempotencyKey)) return normalizedIdempotencyKey
          const idempotencyKey = normalizedIdempotencyKey ?? ''
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
          }).then((result) => {
            if (result.ok) {
              return { ok: true as const, data: { reply: result.reply ?? null } }
            } else {
              return { ok: false as const, error: { code: 'internal' as const, message: result.message } }
            }
          })
        }
        case 'conversations.getMessages': {
          if (!hasCapability(extensionId, 'host.conversations.read')) return unauthorized(`Extension ${extensionId} missing capability host.conversations.read`)
          trackCapability(extensionId, 'host.conversations.read')
          const normalizedConversationId = normalizeRuntimeContextId(typeof params?.conversationId === 'string' ? params.conversationId : undefined, 'conversationId')
          if (isErrorResult(normalizedConversationId)) return normalizedConversationId
          const conversationId = normalizedConversationId ?? ''
          if (!conversationId) return { ok: false, error: { code: 'invalid_args', message: 'conversationId is required' } }
          const getMessages = (globalThis as Record<string, unknown>).__chatonsListConversationMessages as ((conversationId: string) => Array<{ id: string; role: string; payloadJson: string }>) | undefined
          if (!getMessages) {
            return { ok: false, error: { code: 'internal', message: 'conversation message bridge is not initialized' } }
          }
          const rows = getMessages(conversationId)
          // Map snake_case DB columns to camelCase for extension consumers
          const data = rows.map((row: Record<string, unknown>) => ({
            id: row.id,
            role: row.role,
            payloadJson: row.payload_json ?? row.payloadJson ?? '{}',
            createdAt: row.created_at ?? row.createdAt ?? null,
            updatedAt: row.updated_at ?? row.updatedAt ?? null,
          }))
          return { ok: true, data }
        }
        case 'projects.list': {
          if (!hasCapability(extensionId, 'host.projects.read')) return unauthorized(`Extension ${extensionId} missing capability host.projects.read`)
          trackCapability(extensionId, 'host.projects.read')
          const rows = listProjects(getDb())
          return {
            ok: true,
            data: rows.map((row) => ({
              id: row.id,
              name: row.name,
              repoPath: row.repo_path,
              repoName: row.repo_name,
              location: row.location ?? 'local',
              cloudInstanceId: row.cloud_instance_id ?? null,
              organizationId: row.organization_id ?? null,
              organizationName: row.organization_name ?? null,
              cloudStatus: row.cloud_status ?? null,
              isArchived: row.is_archived === 1,
              isHidden: row.is_hidden === 1,
              icon: row.icon,
              updatedAt: row.updated_at,
              createdAt: row.created_at,
            })),
          }
        }
        case 'projects.get': {
          if (!hasCapability(extensionId, 'host.projects.read')) return unauthorized(`Extension ${extensionId} missing capability host.projects.read`)
          trackCapability(extensionId, 'host.projects.read')
          const normalizedProjectId = normalizeRuntimeContextId(typeof params?.projectId === 'string' ? params.projectId : undefined, 'projectId')
          if (isErrorResult(normalizedProjectId)) return normalizedProjectId
          const projectId = normalizedProjectId ?? ''
          if (!projectId) return { ok: false, error: { code: 'invalid_args', message: 'projectId is required' } }
          const row = findProjectById(getDb(), projectId)
          if (!row) return { ok: false, error: { code: 'not_found', message: 'Project not found' } }
          return {
            ok: true,
            data: {
              id: row.id,
              name: row.name,
              repoPath: row.repo_path,
              repoName: row.repo_name,
              location: row.location ?? 'local',
              cloudInstanceId: row.cloud_instance_id ?? null,
              organizationId: row.organization_id ?? null,
              organizationName: row.organization_name ?? null,
              cloudStatus: row.cloud_status ?? null,
              isArchived: row.is_archived === 1,
              isHidden: row.is_hidden === 1,
              icon: row.icon,
              updatedAt: row.updated_at,
              createdAt: row.created_at,
            },
          }
        }
        case 'open.mainView': {
          if (!hasCapability(extensionId, 'ui.mainView')) return unauthorized(`Extension ${extensionId} missing capability ui.mainView`)
          const normalizedViewId = normalizeRuntimeViewId(typeof params?.viewId === 'string' ? params.viewId : undefined)
          if (isErrorResult(normalizedViewId)) return normalizedViewId
          const viewId = normalizedViewId
          const manifest = runtimeState.manifests.get(extensionId)
          const ownsView = (manifest?.ui?.mainViews ?? []).some((mainView) => mainView.viewId === viewId)
          if (!ownsView) return { ok: false, error: { code: 'not_found', message: `main view not found for extension: ${viewId}` } }
          trackCapability(extensionId, 'ui.mainView')
          for (const win of BrowserWindow.getAllWindows()) {
            if (win.isDestroyed()) continue;
            const webContents = win.webContents;
            if (webContents.isDestroyed()) continue;
            try {
              webContents.send('extensions:openMainView', { extensionId, viewId });
            } catch (err) {
              console.warn("[hostCall open.mainView] Failed to send to window:", err);
            }
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
}

export function builtinAutomationNotify(hostCall: ReturnType<typeof createHostCall>, eventTopic: string, eventPayload: unknown) {
  const title = `Automation: ${eventTopic}`
  const body = JSON.stringify(eventPayload)
  hostCall(BUILTIN_AUTOMATION_ID, 'notifications.notify', { title, body })
}
