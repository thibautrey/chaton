import http from 'node:http'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  AuthStorage,
  createAgentSession,
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
  type AgentSession,
} from '@mariozechner/pi-coding-agent'
import type { CloudRuntimeAccessGrant } from '../../packages/domain/index.js'
import type {
  CloudConversationMessageRecord,
  CloudRuntimeSessionCreateResponse,
  MemoryListRequest,
  MemorySearchRequest,
  MemoryUpdateRequest,
  MemoryUpsertRequest,
} from '../../packages/protocol/index.js'
import { createRuntimeStore, type RuntimeMessage, type RuntimeSession } from './store.ts'

const port = Number.parseInt(process.env.PORT ?? '4002', 10)
const version = process.env.CHATONS_CLOUD_VERSION ?? '0.1.0'
const realtimePublishUrl =
  process.env.CHATONS_REALTIME_PUBLISH_URL ?? 'http://127.0.0.1:4001/v1/realtime/events'
const cloudApiBaseUrl =
  process.env.CHATONS_CLOUD_API_URL ?? 'http://127.0.0.1:4000'
const runtimeOwnerId =
  process.env.CHATONS_RUNTIME_OWNER_ID?.trim() || `runtime-${crypto.randomUUID()}`
const leaseTtlSeconds = Number.parseInt(process.env.CHATONS_RUNTIME_LEASE_TTL_SECONDS ?? '60', 10)
const leaseHeartbeatIntervalMs = Math.max(5_000, Math.floor((leaseTtlSeconds * 1000) / 2))
const maxJsonBodyBytes = Number.parseInt(
  process.env.CHATONS_CLOUD_MAX_JSON_BODY_BYTES ?? '1048576',
  10,
)
const internalServiceToken = process.env.CHATONS_INTERNAL_SERVICE_TOKEN?.trim() ?? ''
const runtimeRootDir =
  process.env.CHATONS_RUNTIME_ROOT_DIR?.trim() ||
  path.join(os.tmpdir(), 'chatons-cloud-runtime')
const execFileAsync = promisify(execFile)

const runtimeStore = createRuntimeStore()
const agentRuntimeBySessionId = new Map<string, RuntimeAgentState>()

type RuntimeAgentState = {
  sessionId: string
  conversationId: string
  organizationId: string
  projectId: string | null
  cloudInstanceId: string
  agentDir: string
  cwd: string
  piSessionFile: string
  session: AgentSession
  projectSourceDir: string | null
  worktreePath: string | null
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true })
}

function sanitizeSegment(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, '-')
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2))
}

function removeDirIfExists(targetPath: string): void {
  if (!targetPath.trim() || !fs.existsSync(targetPath)) {
    return
  }
  fs.rmSync(targetPath, { recursive: true, force: true })
}

function buildGitAuthenticatedUrl(
  cloneUrl: string,
  accessToken: string | null,
  authMode: CloudRuntimeAccessGrant['repository'] extends infer T
    ? T extends { authMode: infer U }
      ? U
      : never
    : never,
): string {
  if (authMode !== 'token' || !accessToken?.trim()) {
    return cloneUrl
  }
  const parsed = new URL(cloneUrl)
  if (parsed.protocol !== 'https:') {
    throw new Error('Repository token auth currently requires an HTTPS clone URL')
  }
  parsed.username = 'x-access-token'
  parsed.password = accessToken
  return parsed.toString()
}

async function execGit(args: string[], cwd?: string): Promise<void> {
  try {
    await execFileAsync('git', cwd ? ['-C', cwd, ...args] : args, {
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`git ${args.join(' ')} failed: ${message}`)
  }
}

async function cloudMemoryRequest<T>(
  pathName: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    accessToken?: string
    internal?: boolean
    body?: unknown
    query?: Record<string, string | number | boolean | null | undefined>
  },
): Promise<T> {
  const base = new URL(pathName, cloudApiBaseUrl)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === null || value === '') continue
    base.searchParams.set(key, String(value))
  }
  const headers: Record<string, string> = {}
  if (options.internal) {
    headers.authorization = `Bearer ${internalServiceToken}`
  } else if (options.accessToken) {
    headers.authorization = `Bearer ${options.accessToken}`
  }
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
  }

  const response = await fetch(base.toString(), {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${base.pathname} failed: ${response.status}`)
  }
  return (await response.json()) as T
}

function createCloudMemoryTools(
  runtimeSession: RuntimeSession,
  grant: CloudRuntimeAccessGrant,
): ToolDefinition[] {
  const accessToken = runtimeSession.accessToken
  const defaultProjectId = runtimeSession.projectId ?? grant.project?.id ?? null

  return [
    {
      name: 'memory.search',
      label: 'Search memory',
      description: 'Search Chatons cloud memory across user and project context.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          scope: { type: 'string' },
          projectId: { type: 'string' },
          limit: { type: 'number' },
          kind: { type: 'string' },
          includeArchived: { type: 'boolean' },
        },
        required: ['query'],
      } as never,
      execute: async (_toolCallId, params) => {
        const payload = await cloudMemoryRequest<{ items: unknown[] }>('/v1/memory/search', {
          method: 'GET',
          accessToken,
          query: {
            query: (params as MemorySearchRequest).query,
            scope: (params as MemorySearchRequest).scope ?? 'all',
            projectId: (params as MemorySearchRequest).projectId ?? defaultProjectId,
            limit: (params as MemorySearchRequest).limit ?? 10,
            kind: (params as MemorySearchRequest).kind ?? undefined,
            includeArchived: (params as MemorySearchRequest).includeArchived === true,
          },
        })
        return {
          content: [{ type: 'text', text: JSON.stringify(payload.items ?? [], null, 2) }],
          details: { ok: true, data: payload.items ?? [] },
        } as never
      },
    },
    {
      name: 'memory.list',
      label: 'List memories',
      description: 'List Chatons cloud memory entries.',
      parameters: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          projectId: { type: 'string' },
          kind: { type: 'string' },
          limit: { type: 'number' },
          includeArchived: { type: 'boolean' },
        },
      } as never,
      execute: async (_toolCallId, params) => {
        const request = params as MemoryListRequest
        const payload = await cloudMemoryRequest<{ items: unknown[] }>('/v1/memory', {
          method: 'GET',
          accessToken,
          query: {
            scope: request.scope ?? 'all',
            projectId: request.projectId ?? defaultProjectId,
            kind: request.kind ?? undefined,
            limit: request.limit ?? 50,
            includeArchived: request.includeArchived === true,
          },
        })
        return {
          content: [{ type: 'text', text: JSON.stringify(payload.items ?? [], null, 2) }],
          details: { ok: true, data: payload.items ?? [] },
        } as never
      },
    },
    {
      name: 'memory.get',
      label: 'Get memory',
      description: 'Fetch one Chatons cloud memory entry by id.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      } as never,
      execute: async (_toolCallId, params) => {
        const payload = await cloudMemoryRequest<{ item: unknown }>(`/v1/memory/${encodeURIComponent((params as { id: string }).id)}`, {
          method: 'GET',
          accessToken,
        })
        return {
          content: [{ type: 'text', text: JSON.stringify(payload.item ?? null, null, 2) }],
          details: { ok: true, data: payload.item ?? null },
        } as never
      },
    },
    {
      name: 'memory.upsert',
      label: 'Store memory',
      description: 'Create or update Chatons cloud memory.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          scope: { type: 'string' },
          projectId: { type: 'string' },
          kind: { type: 'string' },
          title: { type: 'string' },
          content: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          source: { type: 'string' },
          conversationId: { type: 'string' },
          topicKey: { type: 'string' },
          confidence: { type: 'number' },
          visibility: { type: 'string' },
        },
        required: ['scope', 'content'],
      } as never,
      execute: async (_toolCallId, params) => {
        const request = params as MemoryUpsertRequest
        const payload = await cloudMemoryRequest<{ item: unknown }>('/v1/memory', {
          method: 'POST',
          accessToken,
          body: {
            ...request,
            projectId: request.projectId ?? defaultProjectId,
          },
        })
        return {
          content: [{ type: 'text', text: JSON.stringify(payload.item ?? null, null, 2) }],
          details: { ok: true, data: payload.item ?? null },
        } as never
      },
    },
    {
      name: 'memory.update',
      label: 'Update memory',
      description: 'Update Chatons cloud memory metadata.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          content: { type: 'string' },
          kind: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          archived: { type: 'boolean' },
          status: { type: 'string' },
          topicKey: { type: 'string' },
          confidence: { type: 'number' },
          visibility: { type: 'string' },
        },
        required: ['id'],
      } as never,
      execute: async (_toolCallId, params) => {
        const request = params as MemoryUpdateRequest
        const payload = await cloudMemoryRequest<{ item: unknown }>(`/v1/memory/${encodeURIComponent(request.id)}`, {
          method: 'PATCH',
          accessToken,
          body: request,
        })
        return {
          content: [{ type: 'text', text: JSON.stringify(payload.item ?? null, null, 2) }],
          details: { ok: true, data: payload.item ?? null },
        } as never
      },
    },
    {
      name: 'memory.delete',
      label: 'Delete memory',
      description: 'Delete Chatons cloud memory.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      } as never,
      execute: async (_toolCallId, params) => {
        const payload = await cloudMemoryRequest<{ ok: boolean }>(`/v1/memory/${encodeURIComponent((params as { id: string }).id)}`, {
          method: 'DELETE',
          accessToken,
        })
        return {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
          details: { ok: true, data: payload },
        } as never
      },
    },
    {
      name: 'memory.stats',
      label: 'Memory stats',
      description: 'Return cloud memory counts and breakdowns.',
      parameters: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          projectId: { type: 'string' },
          kind: { type: 'string' },
          includeArchived: { type: 'boolean' },
        },
      } as never,
      execute: async (_toolCallId, params) => {
        const request = params as MemoryListRequest
        const payload = await cloudMemoryRequest<unknown>('/v1/memory/stats', {
          method: 'GET',
          accessToken,
          query: {
            scope: request.scope ?? 'all',
            projectId: request.projectId ?? defaultProjectId,
            kind: request.kind ?? undefined,
            includeArchived: request.includeArchived === true,
          },
        })
        return {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
          details: { ok: true, data: payload },
        } as never
      },
    },
  ]
}

async function ensureProjectSourceCheckout(
  projectSourceDir: string,
  grant: CloudRuntimeAccessGrant,
): Promise<void> {
  if (grant.project?.kind !== 'repository' || !grant.repository?.cloneUrl) {
    ensureDir(projectSourceDir)
    return
  }

  const cloneUrl = buildGitAuthenticatedUrl(
    grant.repository.cloneUrl,
    grant.repository.accessToken,
    grant.repository.authMode,
  )
  const defaultBranch = grant.repository.defaultBranch?.trim() || ''
  const gitDir = path.join(projectSourceDir, '.git')

  if (!fs.existsSync(gitDir)) {
    ensureDir(path.dirname(projectSourceDir))
    removeDirIfExists(projectSourceDir)
    const cloneArgs = ['clone']
    if (defaultBranch) {
      cloneArgs.push('--branch', defaultBranch, '--single-branch')
    }
    cloneArgs.push(cloneUrl, projectSourceDir)
    try {
      await execGit(cloneArgs)
      await execGit(['config', 'core.logAllRefUpdates', 'true'], projectSourceDir)
    } catch (error) {
      removeDirIfExists(projectSourceDir)
      throw error
    }
    return
  }

  await execGit(['remote', 'set-url', 'origin', cloneUrl], projectSourceDir)
  await execGit(['fetch', '--prune', 'origin'], projectSourceDir)

  const targetRef = defaultBranch ? `origin/${defaultBranch}` : 'origin/HEAD'
  try {
    await execGit(['checkout', '--force', targetRef], projectSourceDir)
  } catch {
    if (defaultBranch) {
      await execGit(['checkout', '--force', defaultBranch], projectSourceDir)
    }
  }
  await execGit(['reset', '--hard', targetRef], projectSourceDir).catch(async () => {
    if (defaultBranch) {
      await execGit(['reset', '--hard', `origin/${defaultBranch}`], projectSourceDir)
    }
  })
  await execGit(['clean', '-fdx'], projectSourceDir)
}

async function ensureConversationWorktree(
  projectSourceDir: string,
  worktreePath: string,
  conversationId: string,
): Promise<void> {
  if (fs.existsSync(path.join(worktreePath, '.git'))) {
    return
  }

  ensureDir(path.dirname(worktreePath))
  const branchName = `chatons/cloud-${sanitizeSegment(conversationId).slice(0, 32)}`

  try {
    await execGit(
      ['worktree', 'add', '-B', branchName, worktreePath, 'HEAD'],
      projectSourceDir,
    )
  } catch (error) {
    removeDirIfExists(worktreePath)
    throw error
  }
}

async function ensureRepositoryWorkspace(
  runtimeSession: RuntimeSession,
  grant: CloudRuntimeAccessGrant,
): Promise<{ cwd: string; projectSourceDir: string | null; worktreePath: string | null }> {
  const sessionRoot = path.join(runtimeRootDir, sanitizeSegment(runtimeSession.id))
  if (grant.project?.kind !== 'repository' || !grant.repository?.cloneUrl || !grant.project?.id) {
    const chatOnlyDir = path.join(sessionRoot, 'chat-only')
    ensureDir(chatOnlyDir)
    return {
      cwd: chatOnlyDir,
      projectSourceDir: null,
      worktreePath: null,
    }
  }

  const repoRoot = path.join(
    runtimeRootDir,
    'projects',
    sanitizeSegment(grant.organization.id),
    sanitizeSegment(grant.project.id),
  )
  const projectSourceDir = path.join(repoRoot, 'source')
  const worktreePath = path.join(repoRoot, 'worktrees', sanitizeSegment(runtimeSession.conversationId))

  await ensureProjectSourceCheckout(projectSourceDir, grant)
  await ensureConversationWorktree(projectSourceDir, worktreePath, runtimeSession.conversationId)

  if (!fs.existsSync(path.join(worktreePath, '.git'))) {
    throw new Error(`Worktree created without git metadata at ${worktreePath}`)
  }

  return {
    cwd: worktreePath,
    projectSourceDir,
    worktreePath,
  }
}

async function removeRuntimeWorkspace(agentState: RuntimeAgentState): Promise<void> {
  try {
    if (agentState.projectSourceDir && agentState.worktreePath) {
      await execGit(['worktree', 'remove', '--force', agentState.worktreePath], agentState.projectSourceDir)
      return
    }
  } catch (error) {
    console.warn('[runtime-headless] failed to remove git worktree cleanly', error)
  }

  if (agentState.worktreePath) {
    removeDirIfExists(agentState.worktreePath)
  } else {
    removeDirIfExists(path.dirname(agentState.agentDir))
  }
}

function getProviderApi(kind: CloudRuntimeAccessGrant['providers'][number]['kind']): string {
  switch (kind) {
    case 'openai':
    case 'anthropic':
    case 'google':
      return 'openai-completions'
    case 'github-copilot':
      return 'anthropic-messages'
    default:
      return 'openai-completions'
  }
}

function toModelsJson(grant: CloudRuntimeAccessGrant): Record<string, unknown> {
  const providers = Object.fromEntries(
    grant.providers
      .filter((provider) => provider.supportsCloudRuntime && provider.secret.trim().length > 0)
      .map((provider) => [
        provider.kind,
        {
          name: provider.label,
          api: getProviderApi(provider.kind),
          baseUrl: provider.baseUrl,
          models: provider.models.map((model) => ({
            id: model.id,
            name: model.label,
          })),
        },
      ]),
  )
  return { providers }
}

function toAuthJson(grant: CloudRuntimeAccessGrant): Record<string, unknown> {
  return Object.fromEntries(
    grant.providers
      .filter((provider) => provider.supportsCloudRuntime && provider.secret.trim().length > 0)
      .map((provider) => [
        provider.kind,
        {
          type: provider.credentialType === 'oauth' ? 'oauth' : 'api-key',
          key: provider.secret,
        },
      ]),
  )
}

function toSettingsJson(session: RuntimeSession): Record<string, unknown> {
  const defaultProvider = session.modelProvider ?? null
  const defaultModel = session.modelId ?? null
  const enabledModels =
    defaultProvider && defaultModel ? [`${defaultProvider}/${defaultModel}`] : []
  return {
    enabledModels,
    defaultProvider,
    defaultModel,
    theme: 'dark',
    editor: 'vscode',
  }
}

function toRealtimeContentText(text: string): Array<{ type: 'text'; text: string }> {
  return [{ type: 'text', text }]
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      const record = part as Record<string, unknown>
      return record.type === 'text' && typeof record.text === 'string' ? record.text : ''
    })
    .filter((part) => part.trim().length > 0)
    .join('\n\n')
}

function syncRuntimeMessagesFromPi(runtimeSession: RuntimeSession, piSession: AgentSession): void {
  runtimeSession.messages = (piSession.messages as Array<Record<string, unknown>>)
    .map((message) => {
      const role =
        message.role === 'assistant' || message.role === 'user'
          ? message.role
          : null
      if (!role) {
        return null
      }
      const id =
        typeof message.id === 'string'
          ? message.id
          : `${role}-${crypto.randomUUID()}`
      const timestamp =
        typeof message.timestamp === 'number'
          ? message.timestamp
          : Date.now()
      const content = extractTextContent(message.content)
      return {
        id,
        role,
        content,
        timestamp,
      } satisfies RuntimeMessage
    })
    .filter((message): message is RuntimeMessage => message !== null)
}

function toSnapshotFromPi(
  runtimeSession: RuntimeSession,
  agentState: RuntimeAgentState | null,
): {
  status: RuntimeSession['status']
  state: Record<string, unknown>
  messages: Array<Record<string, unknown>>
} {
  if (!agentState) {
    return toSnapshot(runtimeSession)
  }
  syncRuntimeMessagesFromPi(runtimeSession, agentState.session)
  return {
    status: runtimeSession.status,
    state: {
      model:
        runtimeSession.modelProvider && runtimeSession.modelId
          ? {
              provider: runtimeSession.modelProvider,
              id: runtimeSession.modelId,
            }
          : null,
      thinkingLevel: runtimeSession.thinkingLevel ?? agentState.session.thinkingLevel ?? 'medium',
      isStreaming: runtimeSession.status === 'streaming',
      isCompacting: false,
      steeringMode: 'all',
      followUpMode: 'all',
      sessionFile: agentState.piSessionFile,
      sessionId: runtimeSession.id,
      autoCompactionEnabled: false,
      messageCount: runtimeSession.messages.length,
      pendingMessageCount: 0,
    },
    messages: (agentState.session.messages as Array<Record<string, unknown>>).map((message) => ({
      ...message,
      content: Array.isArray(message.content)
        ? message.content
        : toRealtimeContentText(extractTextContent(message.content)),
      message: {
        id:
          typeof message.id === 'string'
            ? message.id
            : `${String(message.role ?? 'message')}-${crypto.randomUUID()}`,
        role: typeof message.role === 'string' ? message.role : 'assistant',
        content: Array.isArray(message.content)
          ? message.content
          : toRealtimeContentText(extractTextContent(message.content)),
      },
    })),
  }
}

async function createRuntimeAgent(
  runtimeSession: RuntimeSession,
  grant: CloudRuntimeAccessGrant,
): Promise<RuntimeAgentState> {
  ensureDir(runtimeRootDir)
  const sessionRoot = path.join(runtimeRootDir, sanitizeSegment(runtimeSession.id))
  const agentDir = path.join(sessionRoot, 'agent')
  const workspace = await ensureRepositoryWorkspace(runtimeSession, grant)
  const workingDir = workspace.cwd
  ensureDir(agentDir)
  ensureDir(path.join(agentDir, 'sessions'))

  writeJson(path.join(agentDir, 'models.json'), toModelsJson(grant))
  writeJson(path.join(agentDir, 'auth.json'), toAuthJson(grant))
  writeJson(path.join(agentDir, 'settings.json'), toSettingsJson(runtimeSession))

  const authStorage = AuthStorage.create(path.join(agentDir, 'auth.json'))
  const modelRegistry = new ModelRegistry(authStorage, path.join(agentDir, 'models.json'))
  const settingsManager = await SettingsManager.create(workingDir, agentDir)
  const resourceLoader = new DefaultResourceLoader({
    cwd: workingDir,
    agentDir,
    settingsManager,
  })
  await resourceLoader.reload()
  const piSessionFile = path.join(agentDir, 'sessions', `${sanitizeSegment(runtimeSession.id)}.jsonl`)
  const sessionManager = fs.existsSync(piSessionFile)
    ? SessionManager.open(piSessionFile, path.dirname(piSessionFile))
    : SessionManager.create(workingDir, path.dirname(piSessionFile))

  const tools =
    grant.project?.workspaceCapability === 'full_tools'
      ? [
          createReadTool(workingDir),
          createBashTool(workingDir),
          createEditTool(workingDir),
          createWriteTool(workingDir),
        ]
      : []
  const memoryTools = createCloudMemoryTools(runtimeSession, grant)

  const defaultProvider =
    runtimeSession.modelProvider ??
    grant.providers.find((provider) => provider.defaultModel)?.kind ??
    grant.providers[0]?.kind ??
    null
  const defaultModelId =
    runtimeSession.modelId ??
    grant.providers.find((provider) => provider.kind === defaultProvider)?.defaultModel ??
    grant.providers.find((provider) => provider.defaultModel)?.defaultModel ??
    grant.providers[0]?.models[0]?.id ??
    null

  const model =
    defaultProvider && defaultModelId
      ? modelRegistry.find(defaultProvider, defaultModelId)
      : null

  const { session } = await createAgentSession({
    cwd: workingDir,
    agentDir,
    authStorage,
    modelRegistry,
    settingsManager,
    resourceLoader,
    sessionManager,
    tools: [...tools, ...memoryTools],
    ...(model ? { model } : {}),
    thinkingLevel: (runtimeSession.thinkingLevel ?? 'medium') as never,
  })

  runtimeSession.modelProvider = session.model?.provider ?? runtimeSession.modelProvider
  runtimeSession.modelId = session.model?.id ?? runtimeSession.modelId
  runtimeSession.thinkingLevel = session.thinkingLevel ?? runtimeSession.thinkingLevel

  return {
    sessionId: runtimeSession.id,
    conversationId: runtimeSession.conversationId,
    organizationId: grant.organization.id,
    projectId: runtimeSession.projectId ?? grant.project?.id ?? null,
    cloudInstanceId: runtimeSession.cloudInstanceId,
    agentDir,
    cwd: workingDir,
    piSessionFile,
    session,
    projectSourceDir: workspace.projectSourceDir,
    worktreePath: workspace.worktreePath,
  }
}

function attachAgentRealtimeBridge(
  runtimeSession: RuntimeSession,
  agentState: RuntimeAgentState,
): void {
  agentState.session.subscribe((event) => {
    if (event.type === 'agent_start') {
      runtimeSession.status = 'streaming'
      runtimeSession.updatedAt = new Date().toISOString()
      void runtimeStore.updateSession(runtimeSession)
      void publishRealtimeEvent({
        cloudInstanceId: runtimeSession.cloudInstanceId,
        organizationId: agentState.organizationId,
        projectId: agentState.projectId,
        conversationId: runtimeSession.conversationId,
        payload: {
          event: {
            type: 'runtime_status',
            status: 'streaming',
            message: 'Cloud runtime streaming',
          },
        },
      })
      return
    }

    if (event.type === 'tool_execution_start') {
      void publishRealtimeEvent({
        cloudInstanceId: runtimeSession.cloudInstanceId,
        organizationId: agentState.organizationId,
        projectId: agentState.projectId,
        conversationId: runtimeSession.conversationId,
        payload: {
          event: {
            type: 'tool_execution_start',
            toolCallId: event.toolCallId,
            toolName: event.toolName,
          },
        },
      })
      return
    }

    if (event.type === 'tool_execution_end') {
      void publishRealtimeEvent({
        cloudInstanceId: runtimeSession.cloudInstanceId,
        organizationId: agentState.organizationId,
        projectId: agentState.projectId,
        conversationId: runtimeSession.conversationId,
        payload: {
          event: {
            type: 'tool_execution_end',
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            result: (event as Record<string, unknown>).result ?? null,
          },
        },
      })
      return
    }

    if (event.type === 'message_update') {
      syncRuntimeMessagesFromPi(runtimeSession, agentState.session)
      runtimeSession.updatedAt = new Date().toISOString()
      void runtimeStore.updateSession(runtimeSession)
      void persistConversationMessages(runtimeSession)
      void publishRealtimeEvent({
        cloudInstanceId: runtimeSession.cloudInstanceId,
        organizationId: agentState.organizationId,
        projectId: agentState.projectId,
        conversationId: runtimeSession.conversationId,
        payload: {
          event: {
            type: 'message_update',
            ...(event as Record<string, unknown>),
          },
        },
      })
      return
    }

    if (event.type === 'agent_end') {
      syncRuntimeMessagesFromPi(runtimeSession, agentState.session)
      runtimeSession.status = 'ready'
      runtimeSession.updatedAt = new Date().toISOString()
      void runtimeStore.updateSession(runtimeSession)
      void persistConversationMessages(runtimeSession)
      void publishRealtimeEvent({
        cloudInstanceId: runtimeSession.cloudInstanceId,
        organizationId: agentState.organizationId,
        projectId: agentState.projectId,
        conversationId: runtimeSession.conversationId,
        payload: {
          event: {
            type: 'agent_end',
          },
        },
      })
      void publishRealtimeEvent({
        cloudInstanceId: runtimeSession.cloudInstanceId,
        organizationId: agentState.organizationId,
        projectId: agentState.projectId,
        conversationId: runtimeSession.conversationId,
        payload: {
          event: {
            type: 'runtime_status',
            status: 'ready',
            message: 'Cloud runtime ready',
          },
        },
      })
    }
  })
}

async function getOrCreateRuntimeAgent(
  runtimeSession: RuntimeSession,
  grant: CloudRuntimeAccessGrant,
): Promise<RuntimeAgentState> {
  const existing = agentRuntimeBySessionId.get(runtimeSession.id)
  if (existing) {
    return existing
  }
  const created = await createRuntimeAgent(runtimeSession, grant)
  attachAgentRealtimeBridge(runtimeSession, created)
  agentRuntimeBySessionId.set(runtimeSession.id, created)
  return created
}

function buildLeaseExpiresAt(): string {
  return new Date(Date.now() + leaseTtlSeconds * 1000).toISOString()
}

async function refreshOwnedSessionLeases(): Promise<void> {
  const sessions = await runtimeStore.listSessionsByOwner(runtimeOwnerId)
  const nextLease = buildLeaseExpiresAt()
  for (const session of sessions) {
    await runtimeStore.touchSessionLease(session.id, runtimeOwnerId, nextLease).catch(() => null)
  }
}

function getBearerToken(request: http.IncomingMessage): string | null {
  const header = request.headers.authorization
  if (!header) {
    return null
  }
  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null
  }
  return token.trim()
}

function json(
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  })
  // Safely serialize payload, filtering out sensitive properties
  const safePayload = sanitizeForJson(payload)
  response.end(JSON.stringify(safePayload))
}

/**
 * Sanitizes data for JSON serialization by removing sensitive properties.
 * This prevents stack traces, internal paths, and other sensitive info from leaking.
 */
function sanitizeForJson(data: unknown): unknown {
  // Return primitives and null as-is
  if (data === null || data === undefined || typeof data !== 'object') {
    return data
  }

  // Handle arrays - sanitize each element
  if (Array.isArray(data)) {
    return data.map(sanitizeForJson)
  }

  // Handle Error objects - return only safe properties
  if (data instanceof Error) {
    return {
      name: 'Error',
      message: data.message || 'An error occurred',
    }
  }

  // Handle plain objects - filter out sensitive properties recursively
  const result: Record<string, unknown> = {}
  const sensitiveKeys = new Set([
    'stack',
    'description',
    '__proto__',
    'constructor',
    'prototype',
    'fileName',
    'lineNumber',
    'columnNumber',
    'source',
    'stackTrace',
    'cause',
    'originalError',
    'innerError',
    'nestedError',
    'details',
    'config',
    'headers',
    'request',
    'response',
  ])

  for (const [key, value] of Object.entries(data)) {
    // Skip sensitive keys (case-insensitive check for extra safety)
    const lowerKey = key.toLowerCase()
    let isSensitive = sensitiveKeys.has(key) || sensitiveKeys.has(lowerKey)
    
    // Also skip keys that look like they might contain stack traces
    if (!isSensitive && (key.includes('stack') || key.includes('trace') || key.includes('stackTrace'))) {
      isSensitive = true
    }

    if (!isSensitive) {
      result[key] = sanitizeForJson(value)
    }
  }

  return result
}

async function readJsonBody<T>(request: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  let totalSize = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalSize += buffer.length
    if (totalSize > maxJsonBodyBytes) {
      const error = new Error(`Request body exceeds ${maxJsonBodyBytes} bytes`)
      ;(error as Error & { statusCode?: number }).statusCode = 413
      throw error
    }
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return JSON.parse(text) as T
}

async function fetchAccessGrant(params: {
  accessToken: string
  cloudInstanceId: string
  projectId?: string | null
  conversationId?: string | null
}): Promise<CloudRuntimeAccessGrant | null> {
  if (!internalServiceToken) {
    throw new Error('Missing CHATONS_INTERNAL_SERVICE_TOKEN')
  }
  const response = await fetch(
    new URL('/v1/internal/runtime/access', cloudApiBaseUrl).toString(),
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${internalServiceToken}`,
      },
      body: JSON.stringify(params),
    },
  )
  if (response.status === 404 || response.status === 401) {
    return null
  }
  if (!response.ok) {
    throw new Error(`Cloud access lookup failed with status ${response.status}`)
  }
  return (await response.json()) as CloudRuntimeAccessGrant
}

async function requireSessionAccess(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  sessionId: string,
): Promise<{ session: RuntimeSession; grant: CloudRuntimeAccessGrant } | null> {
  const accessToken = getBearerToken(request)
  if (!accessToken) {
    json(response, 401, {
      error: 'unauthorized',
      message: 'Missing bearer token',
    })
    return null
  }
  const session = await runtimeStore.getSession(sessionId)
  if (!session) {
    json(response, 404, {
      error: 'not_found',
      message: 'Runtime session not found',
    })
    return null
  }
  const grant = await fetchAccessGrant({
    accessToken,
    cloudInstanceId: session.cloudInstanceId,
    projectId: session.projectId,
    conversationId: session.conversationId,
  })
  if (!grant || grant.user.id !== session.userId) {
    json(response, 403, {
      error: 'forbidden',
      message: 'Cloud runtime session access denied',
    })
    return null
  }
  return { session, grant }
}

async function publishRealtimeEvent(event: {
  cloudInstanceId: string
  organizationId: string
  projectId?: string | null
  conversationId?: string
  payload: {
    event: {
      type: string
      [key: string]: unknown
    }
  }
}): Promise<void> {
  const envelope = {
    id: crypto.randomUUID(),
    type: 'conversation.event',
    ts: new Date().toISOString(),
    organizationId: event.organizationId,
    projectId: event.projectId ?? undefined,
    conversationId: event.conversationId,
    payload: event.payload,
  }

  const response = await fetch(realtimePublishUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${internalServiceToken}`,
    },
    body: JSON.stringify({
      cloudInstanceId: event.cloudInstanceId,
      event: envelope,
    }),
  })
  if (!response.ok) {
    throw new Error(`Realtime publish failed with status ${response.status}`)
  }
}

async function persistConversationMessages(session: RuntimeSession): Promise<void> {
  const messages: CloudConversationMessageRecord[] = session.messages.map((message) => ({
    id: message.id,
    role: message.role,
    timestamp: message.timestamp,
    content: message.content,
  }))

  const response = await fetch(
    new URL(
      `/v1/conversations/${encodeURIComponent(session.conversationId)}/messages`,
      cloudApiBaseUrl,
    ).toString(),
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({
        messages,
      }),
    },
  )
  if (!response.ok) {
    throw new Error(`Transcript persistence failed with status ${response.status}`)
  }
}

function toSnapshot(session: RuntimeSession): {
  status: RuntimeSession['status']
  state: Record<string, unknown>
  messages: Array<Record<string, unknown>>
} {
  return {
    status: session.status,
    state: {
      model:
        session.modelProvider && session.modelId
          ? {
              provider: session.modelProvider,
              id: session.modelId,
            }
          : null,
      thinkingLevel: session.thinkingLevel ?? 'medium',
      isStreaming: session.status === 'streaming',
      isCompacting: false,
      steeringMode: 'all',
      followUpMode: 'all',
      sessionFile: session.id,
      sessionId: session.id,
      autoCompactionEnabled: false,
      messageCount: session.messages.length,
      pendingMessageCount: 0,
    },
    messages: session.messages.map((message) => ({
      id: message.id,
      role: message.role,
      timestamp: message.timestamp,
      content: message.content,
      message: {
        id: message.id,
        role: message.role,
        content: message.content,
      },
    })),
  }
}

async function handleRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  const method = request.method ?? 'GET'
  const url = request.url ?? '/'

  if (method === 'GET' && url === '/healthz') {
    json(response, 200, {
      ok: true,
      service: 'runtime-headless',
      version,
      timestamp: new Date().toISOString(),
      store: runtimeStore.mode,
    })
    return
  }

  if (method === 'GET' && url === '/readyz') {
    response.writeHead(204)
    response.end()
    return
  }

  if (method === 'POST' && url === '/v1/runtime/sessions') {
    const accessToken = getBearerToken(request)
    if (!accessToken) {
      json(response, 401, {
        error: 'unauthorized',
        message: 'Missing bearer token',
      })
      return
    }

    const body = await readJsonBody<{
      conversationId: string
      projectId?: string | null
      cloudInstanceId?: string
      modelProvider?: string | null
      modelId?: string | null
      thinkingLevel?: string | null
    }>(request)
    if (!body.conversationId || !body.cloudInstanceId) {
      json(response, 400, {
        error: 'invalid_request',
        message: 'conversationId and cloudInstanceId are required',
      })
      return
    }

    const grant = await fetchAccessGrant({
      accessToken,
      cloudInstanceId: body.cloudInstanceId,
      projectId: body.projectId ?? null,
      conversationId: body.conversationId,
    })
    if (!grant) {
      json(response, 403, {
        error: 'forbidden',
        message: 'Cloud runtime access denied',
      })
      return
    }
    if (!grant.user.subscription.id) {
      const payload: CloudRuntimeSessionCreateResponse = {
        error: 'subscription_required',
        message: 'An active subscription is required to create a cloud runtime session.',
        usage: grant.usage,
      }
      json(response, 403, payload)
      return
    }
    if (grant.usage.activeParallelSessions >= grant.usage.parallelSessionsLimit) {
      const payload: CloudRuntimeSessionCreateResponse = {
        error: 'parallel_session_limit_reached',
        message: `Parallel session limit reached for ${grant.user.subscription.label}.`,
        usage: grant.usage,
      }
      json(response, 429, payload)
      return
    }

    const sessionId = `runtime-session-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const session: RuntimeSession = {
      id: sessionId,
      userId: grant.user.id,
      conversationId: body.conversationId,
      projectId: body.projectId ?? grant.project?.id ?? null,
      cloudInstanceId: grant.cloudInstance.id,
      ownerId: runtimeOwnerId,
      leaseExpiresAt: buildLeaseExpiresAt(),
      status: 'starting',
      modelProvider: body.modelProvider ?? grant.conversation?.modelProvider ?? null,
      modelId: body.modelId ?? grant.conversation?.modelId ?? null,
      thinkingLevel: body.thinkingLevel ?? null,
      messages: [],
      createdAt: now,
      updatedAt: now,
      accessToken,
      subscriptionPlan: grant.user.subscription.id,
      subscriptionLabel: grant.user.subscription.label,
      parallelSessionsLimit: grant.user.subscription.parallelSessionsLimit,
    }
    const acquired = await runtimeStore.acquireConversationSession(session)
    if (!acquired.created) {
      acquired.session.accessToken = accessToken
      acquired.session.leaseExpiresAt = buildLeaseExpiresAt()
      acquired.session.updatedAt = new Date().toISOString()
      await runtimeStore.updateSession(acquired.session)
      await getOrCreateRuntimeAgent(acquired.session, grant)
      const payload: CloudRuntimeSessionCreateResponse = {
        id: acquired.session.id,
        status: acquired.session.status,
        usage: grant.usage,
      }
      json(response, 200, payload)
      return
    }

    const agentState = await getOrCreateRuntimeAgent(session, grant)
    syncRuntimeMessagesFromPi(session, agentState.session)
    session.status = 'ready'
    session.updatedAt = new Date().toISOString()
    await runtimeStore.updateSession(session)
    await persistConversationMessages(session)
    await publishRealtimeEvent({
      cloudInstanceId: session.cloudInstanceId,
      organizationId: grant.organization.id,
      projectId: session.projectId,
      conversationId: session.conversationId,
      payload: {
        event: {
          type: 'runtime_status',
          status: 'ready',
          message: 'Cloud runtime ready',
        },
      },
    })

    const payload: CloudRuntimeSessionCreateResponse = {
      id: sessionId,
      status: session.status,
      usage: grant.usage,
    }
    json(response, 201, payload)
    return
  }

  if (method === 'GET' && url.startsWith('/v1/runtime/sessions/')) {
    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const parts = parsed.pathname.split('/').filter(Boolean)
    const sessionId = parts[3] ?? ''
    const access = await requireSessionAccess(request, response, sessionId)
    if (!access) {
      return
    }

    const agentState = agentRuntimeBySessionId.get(access.session.id) ?? null
    json(response, 200, toSnapshotFromPi(access.session, agentState))
    return
  }

  if (method === 'POST' && url.match(/^\/v1\/runtime\/sessions\/[^/]+\/commands$/)) {
    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const parts = parsed.pathname.split('/').filter(Boolean)
    const sessionId = parts[3] ?? ''
    const access = await requireSessionAccess(request, response, sessionId)
    if (!access) {
      return
    }
    const session = access.session
    const agentState = await getOrCreateRuntimeAgent(session, access.grant)

    await runtimeStore.touchSessionLease(
      session.id,
      runtimeOwnerId,
      buildLeaseExpiresAt(),
    )
    session.ownerId = runtimeOwnerId
    session.leaseExpiresAt = buildLeaseExpiresAt()

    const body = await readJsonBody<{
      type: string
      message?: string
      provider?: string
      modelId?: string
      level?: string
    }>(request)

    if (body.type === 'set_model') {
      session.modelProvider = body.provider ?? session.modelProvider
      session.modelId = body.modelId ?? session.modelId
      if (session.modelProvider && session.modelId) {
        const model = agentState.session.modelRegistry.find(session.modelProvider, session.modelId)
        if (!model) {
          json(response, 400, {
            id: crypto.randomUUID(),
            type: 'response',
            command: 'set_model',
            success: false,
            error: `Model not found: ${session.modelProvider}/${session.modelId}`,
          })
          return
        }
        await agentState.session.setModel(model)
      }
      session.updatedAt = new Date().toISOString()
      syncRuntimeMessagesFromPi(session, agentState.session)
      await runtimeStore.updateSession(session)
      await publishRealtimeEvent({
        cloudInstanceId: session.cloudInstanceId,
        organizationId: access.grant.organization.id,
        projectId: session.projectId,
        conversationId: session.conversationId,
        payload: {
          event: {
            type: 'runtime_status',
            status: 'ready',
            message: 'Model updated',
          },
        },
      })
      json(response, 200, {
        id: crypto.randomUUID(),
        type: 'response',
        command: 'set_model',
        success: true,
      })
      return
    }

    if (body.type === 'set_thinking_level') {
      session.thinkingLevel = body.level ?? session.thinkingLevel
      if (session.thinkingLevel) {
        agentState.session.setThinkingLevel(session.thinkingLevel as never)
      }
      session.updatedAt = new Date().toISOString()
      await runtimeStore.updateSession(session)
      await publishRealtimeEvent({
        cloudInstanceId: session.cloudInstanceId,
        organizationId: access.grant.organization.id,
        projectId: session.projectId,
        conversationId: session.conversationId,
        payload: {
          event: {
            type: 'runtime_status',
            status: 'ready',
            message: 'Thinking level updated',
          },
        },
      })
      json(response, 200, {
        id: crypto.randomUUID(),
        type: 'response',
        command: 'set_thinking_level',
        success: true,
      })
      return
    }

    if (body.type === 'prompt' || body.type === 'follow_up' || body.type === 'steer') {
      if (typeof body.message === 'string' && body.message.trim()) {
        if (body.type === 'prompt') {
          await agentState.session.prompt(body.message)
        } else if (body.type === 'follow_up') {
          await agentState.session.followUp(body.message)
        } else {
          await agentState.session.steer(body.message)
        }
      }

      syncRuntimeMessagesFromPi(session, agentState.session)
      session.status = 'ready'
      session.leaseExpiresAt = buildLeaseExpiresAt()
      session.updatedAt = new Date().toISOString()
      await runtimeStore.updateSession(session)
      await persistConversationMessages(session)

      json(response, 200, {
        id: crypto.randomUUID(),
        type: 'response',
        command: body.type,
        success: true,
      })
      return
    }

    if (body.type === 'abort') {
      await agentState.session.abort()
      syncRuntimeMessagesFromPi(session, agentState.session)
      session.status = 'ready'
      session.updatedAt = new Date().toISOString()
      await runtimeStore.updateSession(session)
      json(response, 200, {
        id: crypto.randomUUID(),
        type: 'response',
        command: 'abort',
        success: true,
      })
      return
    }

    json(response, 400, {
      id: crypto.randomUUID(),
      type: 'response',
      command: body.type,
      success: false,
      error: `Unsupported command: ${body.type}`,
    })
    return
  }

  if (method === 'DELETE' && url.startsWith('/v1/runtime/sessions/')) {
    const parsed = new URL(url, `http://127.0.0.1:${port}`)
    const parts = parsed.pathname.split('/').filter(Boolean)
    const sessionId = parts[3] ?? ''
    const access = await requireSessionAccess(request, response, sessionId)
    if (!access) {
      return
    }
    const session = access.session
    const agentState = agentRuntimeBySessionId.get(sessionId)
    if (agentState) {
      agentState.session.dispose()
      await removeRuntimeWorkspace(agentState)
      agentRuntimeBySessionId.delete(sessionId)
    }
    session.status = 'stopped'
    session.leaseExpiresAt = new Date().toISOString()
    session.updatedAt = new Date().toISOString()
    await runtimeStore.updateSession(session)
    await runtimeStore.deleteSession(sessionId)
    response.writeHead(204)
    response.end()
    return
  }

  json(response, 404, {
    error: 'not_found',
    message: `No route for ${method} ${url}`,
  })
}

const server = http.createServer((request, response) => {
  void handleRequest(request, response).catch((error) => {
    const statusCode =
      typeof (error as { statusCode?: unknown })?.statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : 500
    json(response, statusCode, {
      error: statusCode >= 500 ? 'internal_error' : 'invalid_request',
      message:
        statusCode >= 500
          ? 'An unexpected server error occurred'
          : error instanceof Error
            ? error.message
            : String(error),
    })
  })
})

void runtimeStore.init().catch((error) => {
  console.error('[runtime-headless] failed to initialize store', error)
  process.exitCode = 1
})

const leaseHeartbeat = setInterval(() => {
  void refreshOwnedSessionLeases().catch((error) => {
    console.warn('[runtime-headless] failed to refresh session leases', error)
  })
}, leaseHeartbeatIntervalMs)

leaseHeartbeat.unref?.()

server.listen(port, '0.0.0.0', () => {
  console.log(`runtime-headless listening on :${port}`)
})
