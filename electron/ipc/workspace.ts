import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { promisify } from 'node:util'
import path from 'node:path'
import os from 'node:os'

import { getDb } from '../db/index.js'
import {
  deleteConversationById,
  findConversationById,
  insertConversation,
  listConversations,
  listConversationsByProjectId,
  listConversationMessagesCache,
  replaceConversationMessagesCache,
  updateConversationTitle,
  type DbConversation,
} from '../db/repos/conversations.js'
import { listPiModelsCache, replacePiModelsCache } from '../db/repos/pi-models-cache.js'
import { getLanguagePreference, saveLanguagePreference } from '../db/repos/settings.js'
import { deleteProjectById, findProjectByRepoPath, insertProject, listProjects } from '../db/repos/projects.js'
import { getSidebarSettings, saveSidebarSettings, type DbSidebarSettings } from '../db/repos/settings.js'
import {
  PiSessionRuntimeManager,
  type PiRendererEvent,
  type RpcCommand,
  type RpcExtensionUiResponse,
  type RpcResponse,
} from '../pi-rpc.js'

const execFileAsync = promisify(execFile)

type WorkspacePayload = {
  projects: Array<{
    id: string
    name: string
    repoPath: string
    repoName: string
    isArchived: boolean
    createdAt: string
    updatedAt: string
  }>
  conversations: Array<{
    id: string
    projectId: string
    title: string
    status: 'active' | 'done' | 'archived'
    isRelevant: boolean
    createdAt: string
    updatedAt: string
    lastMessageAt: string
    modelProvider: string | null
    modelId: string | null
    thinkingLevel: string | null
    lastRuntimeError: string | null
  }>
  settings: DbSidebarSettings
}

type PiModel = {
  id: string
  provider: string
  scoped: boolean
  key: string
  supportsThinking: boolean
  thinkingLevels: Array<'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'>
}

type PiModelsResult =
  | { ok: true; models: PiModel[] }
  | { ok: false; reason: 'pi_not_available' | 'unknown'; message?: string }

type SetPiModelScopedResult =
  | { ok: true; models: PiModel[] }
  | { ok: false; reason: 'pi_not_available' | 'invalid_model' | 'unknown'; message?: string }

type PiCommandAction = 'list' | 'list-models' | 'install' | 'remove' | 'update' | 'config'
type PiCommandResult = {
  ok: boolean
  code: number
  command: string[]
  stdout: string
  stderr: string
  ranAt: string
  message?: string
}

const piRuntimeManager = new PiSessionRuntimeManager()

function mapConversation(c: DbConversation) {
  return {
    id: c.id,
    projectId: c.project_id,
    title: c.title,
    status: c.status,
    isRelevant: Boolean(c.is_relevant),
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    lastMessageAt: c.last_message_at,
    modelProvider: c.model_provider,
    modelId: c.model_id,
    thinkingLevel: c.thinking_level,
    lastRuntimeError: c.last_runtime_error,
  }
}

function toWorkspacePayload(): WorkspacePayload {
  const db = getDb()
  const projects = listProjects(db).map((p) => ({
    id: p.id,
    name: p.name,
    repoPath: p.repo_path,
    repoName: p.repo_name,
    isArchived: Boolean(p.is_archived),
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }))

  const conversations = listConversations(db).map(mapConversation)

  return {
    projects,
    conversations,
    settings: getSidebarSettings(db),
  }
}

function isGitRepo(folderPath: string) {
  return fs.existsSync(path.join(folderPath, '.git'))
}

function parseEnabledScopedModels(): Set<string> {
  const settingsPath = path.join(process.env.HOME ?? '', '.pi', 'agent', 'settings.json')
  if (!settingsPath || !fs.existsSync(settingsPath)) {
    return new Set()
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as { enabledModels?: unknown }
    if (!Array.isArray(parsed.enabledModels)) {
      return new Set()
    }

    return new Set(parsed.enabledModels.filter((value): value is string => typeof value === 'string'))
  } catch {
    return new Set()
  }
}

function getPiSettingsPath() {
  return path.join(process.env.HOME ?? '', '.pi', 'agent', 'settings.json')
}

function getPiModelsPath() {
  return path.join(process.env.HOME ?? '', '.pi', 'agent', 'models.json')
}

function getPiBinaryPath() {
  return path.join(process.env.HOME ?? '', '.pi', 'agent', 'bin', 'pi')
}

function readJsonFile(filePath: string): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  if (!filePath || !fs.existsSync(filePath)) {
    return { ok: false, message: `Fichier introuvable: ${filePath}` }
  }

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, message: `JSON invalide dans ${filePath}: objet attendu` }
    }
    return { ok: true, value: raw as Record<string, unknown> }
  } catch (error) {
    return { ok: false, message: `JSON invalide dans ${filePath}: ${error instanceof Error ? error.message : String(error)}` }
  }
}

function backupFile(filePath: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${filePath}.bak.${stamp}`
  fs.copyFileSync(filePath, backupPath)
}

function atomicWriteJson(filePath: string, data: Record<string, unknown>) {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const tmpPath = path.join(dir, `${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`)
  fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  fs.renameSync(tmpPath, filePath)
}

function validateModelsJson(next: Record<string, unknown>): string | null {
  const providers = next.providers
  if (providers !== undefined) {
    if (!providers || typeof providers !== 'object' || Array.isArray(providers)) {
      return 'models.json: "providers" doit être un objet.'
    }
    for (const [providerName, providerConfig] of Object.entries(providers as Record<string, unknown>)) {
      if (!providerConfig || typeof providerConfig !== 'object' || Array.isArray(providerConfig)) {
        return `models.json: provider "${providerName}" invalide (objet attendu).`
      }
      const modelList = (providerConfig as Record<string, unknown>).models
      if (modelList !== undefined && !Array.isArray(modelList)) {
        return `models.json: provider "${providerName}" -> "models" doit être un tableau.`
      }
      if (Array.isArray(modelList)) {
        for (const model of modelList) {
          if (!model || typeof model !== 'object' || Array.isArray(model)) {
            return `models.json: provider "${providerName}" contient un modèle invalide.`
          }
          const id = (model as Record<string, unknown>).id
          if (typeof id !== 'string' || id.trim().length === 0) {
            return `models.json: provider "${providerName}" contient un modèle sans id valide.`
          }
        }
      }
    }
  }
  return null
}

function sanitizePiSettings(next: Record<string, unknown>): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  const sanitized = { ...next }
  if (sanitized.enabledModels !== undefined) {
    if (!Array.isArray(sanitized.enabledModels)) {
      return { ok: false, message: 'settings.json: "enabledModels" doit être un tableau.' }
    }
    sanitized.enabledModels = (sanitized.enabledModels as unknown[]).filter((item): item is string => typeof item === 'string')
  }
  return { ok: true, value: sanitized }
}

function runPiExec(args: string[], timeout = 20_000, cwd?: string): Promise<PiCommandResult> {
  const piPath = getPiBinaryPath()
  if (!piPath || !fs.existsSync(piPath)) {
    return Promise.resolve({
      ok: false,
      code: -1,
      command: [piPath, ...args],
      stdout: '',
      stderr: '',
      ranAt: new Date().toISOString(),
      message: 'Pi non disponible',
    })
  }

  return new Promise((resolve) => {
    execFile(
      piPath,
      args,
      {
        cwd,
        timeout,
        maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, TERM: 'dumb' },
      },
      (error, stdout, stderr) => {
        const code = (error as { code?: number } | null)?.code ?? 0
        resolve({
          ok: !error,
          code: typeof code === 'number' ? code : 1,
          command: [piPath, ...args],
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          ranAt: new Date().toISOString(),
          message: error ? (error instanceof Error ? error.message : String(error)) : undefined,
        })
      },
    )
  })
}

function getPiConfigSnapshot() {
  const settingsPath = getPiSettingsPath()
  const modelsPath = getPiModelsPath()
  const settingsResult = readJsonFile(settingsPath)
  const modelsResult = readJsonFile(modelsPath)
  const errors: string[] = []
  if (!settingsResult.ok) errors.push(settingsResult.message)
  if (!modelsResult.ok) errors.push(modelsResult.message)
  return {
    settingsPath,
    modelsPath,
    settings: settingsResult.ok ? settingsResult.value : null,
    models: modelsResult.ok ? modelsResult.value : null,
    errors,
  }
}

function getPiDiagnostics() {
  const piPath = getPiBinaryPath()
  const settingsPath = getPiSettingsPath()
  const modelsPath = getPiModelsPath()
  const checks: Array<{ id: string; level: 'info' | 'warning' | 'error'; message: string }> = []

  if (!fs.existsSync(piPath)) checks.push({ id: 'pi-missing', level: 'error', message: 'Binaire Pi introuvable.' })
  if (!fs.existsSync(settingsPath)) checks.push({ id: 'settings-missing', level: 'error', message: 'settings.json introuvable.' })
  if (!fs.existsSync(modelsPath)) checks.push({ id: 'models-missing', level: 'warning', message: 'models.json introuvable.' })

  const settings = readJsonFile(settingsPath)
  if (!settings.ok) {
    checks.push({ id: 'settings-invalid', level: 'error', message: settings.message })
  }
  const models = readJsonFile(modelsPath)
  if (!models.ok) {
    checks.push({ id: 'models-invalid', level: 'warning', message: models.message })
  }

  if (settings.ok) {
    const enabledModels = Array.isArray(settings.value.enabledModels)
      ? settings.value.enabledModels.filter((item): item is string => typeof item === 'string')
      : []
    const defaultProvider = typeof settings.value.defaultProvider === 'string' ? settings.value.defaultProvider : null
    const defaultModel = typeof settings.value.defaultModel === 'string' ? settings.value.defaultModel : null

    if (defaultProvider && defaultModel && models.ok) {
      const providers = (models.value.providers ?? {}) as Record<string, unknown>
      const providerNode = providers[defaultProvider]
      const providerModels = providerNode && typeof providerNode === 'object' ? (providerNode as Record<string, unknown>).models : null
      const found = Array.isArray(providerModels)
        ? providerModels.some((item) => typeof (item as { id?: unknown })?.id === 'string' && (item as { id: string }).id === defaultModel)
        : false
      if (!found) {
        checks.push({ id: 'default-model-missing', level: 'warning', message: 'Le modèle par défaut n’existe pas dans models.json.' })
      }
    }

    if (enabledModels.length === 0) {
      checks.push({ id: 'enabled-empty', level: 'info', message: 'Aucun modèle scoped dans enabledModels.' })
    }
  }

  if (checks.length === 0) {
    checks.push({ id: 'ok', level: 'info', message: 'Aucun problème détecté.' })
  }

  return { piPath, settingsPath, modelsPath, checks }
}

function readPiSettings(): { enabledModels: string[]; raw: Record<string, unknown> } | null {
  const settingsPath = getPiSettingsPath()
  if (!settingsPath || !fs.existsSync(settingsPath)) {
    return null
  }

  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>
    const enabledModels = Array.isArray(raw.enabledModels)
      ? raw.enabledModels.filter((value): value is string => typeof value === 'string')
      : []

    return { enabledModels, raw }
  } catch {
    return null
  }
}

const THINKING_LEVELS: Array<'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'> = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
]

function parsePiListModels(stdout: string, enabledScopedModels: Set<string>): PiModel[] {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return []
  }

  const rows: PiModel[] = []

  for (const line of lines) {
    if (line.startsWith('provider')) {
      continue
    }

    const columns = line.split(/\s{2,}/)
    if (columns.length < 2) {
      continue
    }

    const provider = columns[0]
    const id = columns[1]
    const key = `${provider}/${id}`
    rows.push({
      id,
      provider,
      key,
      scoped: enabledScopedModels.has(key),
      supportsThinking: columns[4] === 'yes',
      thinkingLevels: columns[4] === 'yes' ? THINKING_LEVELS : [],
    })
  }

  return rows
}

async function listPiModels(): Promise<PiModelsResult> {
  const piPath = path.join(process.env.HOME ?? '', '.pi', 'agent', 'bin', 'pi')
  if (!piPath || !fs.existsSync(piPath)) {
    return { ok: false, reason: 'pi_not_available' }
  }

  try {
    const { stdout } = await execFileAsync(piPath, ['--list-models'], {
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        TERM: 'dumb',
      },
    })

    const enabledScopedModels = parseEnabledScopedModels()
    const models = parsePiListModels(stdout, enabledScopedModels)
      .filter((model, index, array) => {
        const first = array.findIndex((candidate) => candidate.provider === model.provider && candidate.id === model.id)
        return first === index
      })
      .sort((a, b) => {
        if (a.provider !== b.provider) {
          return a.provider.localeCompare(b.provider)
        }
        return a.id.localeCompare(b.id)
      })

    return { ok: true, models }
  } catch (error) {
    return {
      ok: false,
      reason: 'unknown',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

function listPiModelsFromCache(): PiModel[] {
  const db = getDb()
  const enabledScopedModels = parseEnabledScopedModels()
  return listPiModelsCache(db).map((model) => ({
    id: model.id,
    provider: model.provider,
    key: model.key,
    scoped: enabledScopedModels.has(model.key),
    supportsThinking: Boolean(model.supports_thinking),
    thinkingLevels: (() => {
      if (!model.thinking_levels_json) {
        return []
      }
      try {
        const parsed = JSON.parse(model.thinking_levels_json) as unknown
        if (!Array.isArray(parsed)) {
          return []
        }
        return parsed.filter((value): value is 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' =>
          THINKING_LEVELS.includes(value as 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'),
        )
      } catch {
        return []
      }
    })(),
  }))
}

async function syncPiModelsCache(): Promise<PiModelsResult> {
  const result = await listPiModels()
  if (!result.ok) {
    return result
  }

  const db = getDb()
  replacePiModelsCache(
    db,
    result.models.map((model) => ({
      key: model.key,
      provider: model.provider,
      id: model.id,
      supportsThinking: model.supportsThinking,
      thinkingLevels: model.thinkingLevels,
    })),
  )
  return result
}

async function listPiModelsCached(): Promise<PiModelsResult> {
  const cached = listPiModelsFromCache()
  if (cached.length > 0) {
    return { ok: true, models: cached }
  }
  return syncPiModelsCache()
}

async function setPiModelScoped(provider: string, id: string, scoped: boolean): Promise<SetPiModelScopedResult> {
  const settingsPath = getPiSettingsPath()
  if (!settingsPath || !fs.existsSync(settingsPath)) {
    return { ok: false, reason: 'pi_not_available' }
  }

  const listResult = await syncPiModelsCache()
  if (!listResult.ok) {
    return listResult
  }

  const modelExists = listResult.models.some((model) => model.provider === provider && model.id === id)
  if (!modelExists) {
    return { ok: false, reason: 'invalid_model' }
  }

  const current = readPiSettings()
  if (!current) {
    return { ok: false, reason: 'unknown', message: 'Impossible de lire settings.json' }
  }

  const key = `${provider}/${id}`
  const enabledModels = new Set(current.enabledModels)
  if (scoped) {
    enabledModels.add(key)
  } else {
    enabledModels.delete(key)
  }

  const next = {
    ...current.raw,
    enabledModels: Array.from(enabledModels),
  }

  try {
    fs.writeFileSync(settingsPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  } catch (error) {
    return {
      ok: false,
      reason: 'unknown',
      message: error instanceof Error ? error.message : String(error),
    }
  }

  return syncPiModelsCache()
}

function cacheMessagesFromSnapshot(conversationId: string, snapshot: { messages: unknown[] }) {
  const db = getDb()
  const messages = (snapshot.messages ?? [])
    .map((message, index) => {
      const payload = message as { id?: string; message?: { role?: string } }
      const role = payload?.message?.role ?? 'unknown'
      return {
        id: payload.id ?? `${conversationId}-${index}`,
        role,
        payloadJson: JSON.stringify(message),
      }
    })
  replaceConversationMessagesCache(db, conversationId, messages)
}

function sanitizeGeneratedTitle(raw: string): string | null {
  const oneLine = raw.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim()
  const trimmedQuotes = oneLine.replace(/^["'`]+|["'`]+$/g, '').trim()
  if (trimmedQuotes.length === 0) {
    return null
  }
  const truncated = trimmedQuotes.slice(0, 80).trim()
  return truncated.length > 0 ? truncated : null
}

function generateConversationTitlePrompt(firstMessage: string): string {
  return [
    'Tu génères un titre de fil de discussion.',
    'Contraintes strictes:',
    '- Répondre avec UN seul titre, sans guillemets.',
    '- 3 à 7 mots.',
    '- Maximum 60 caractères.',
    '- En français.',
    '',
    'Premier message utilisateur:',
    firstMessage,
  ].join('\n')
}

async function generateConversationTitleFromPi(params: {
  provider: string
  modelId: string
  repoPath: string
  firstMessage: string
}): Promise<string | null> {
  const piPath = getPiBinaryPath()
  if (!piPath || !fs.existsSync(piPath)) {
    return null
  }

  const prompt = generateConversationTitlePrompt(params.firstMessage)
  const modelKey = `${params.provider}/${params.modelId}`
  const primary = await runPiExec(['--model', modelKey, '-p', prompt], 20_000, params.repoPath)
  const result = primary.ok ? primary : await runPiExec(['-m', modelKey, '-p', prompt], 20_000, params.repoPath)
  if (!result.ok) {
    return null
  }

  return sanitizeGeneratedTitle(result.stdout)
}

export function registerWorkspaceIpc() {
  piRuntimeManager.subscribe((event: PiRendererEvent) => {
    if (event.event.type === 'agent_end') {
      void piRuntimeManager
        .getSnapshot(event.conversationId)
        .then((snapshot) => cacheMessagesFromSnapshot(event.conversationId, snapshot))
        .catch(() => undefined)
    }
  })

  ipcMain.handle('dialog:pickProjectFolder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Ajouter un nouveau projet',
      buttonLabel: 'Importer',
      properties: ['openDirectory', 'createDirectory'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.handle('workspace:getInitialState', () => toWorkspacePayload())

  ipcMain.handle('workspace:updateSettings', (_event, settings: DbSidebarSettings) => {
    const db = getDb()
    saveSidebarSettings(db, settings)
    return settings
  })

  ipcMain.handle('models:listPi', async () => listPiModelsCached())
  ipcMain.handle('models:syncPi', async () => syncPiModelsCache())
  ipcMain.handle('models:setPiScoped', async (_event, provider: string, id: string, scoped: boolean) =>
    setPiModelScoped(provider, id, scoped),
  )
  ipcMain.handle('pi:getConfigSnapshot', () => getPiConfigSnapshot())
  ipcMain.handle('pi:updateSettingsJson', (_event, next: unknown) => {
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      return { ok: false as const, message: 'settings.json invalide: objet attendu.' }
    }
    const valid = sanitizePiSettings(next as Record<string, unknown>)
    if (!valid.ok) {
      return { ok: false as const, message: valid.message }
    }
    const settingsPath = getPiSettingsPath()
    try {
      if (fs.existsSync(settingsPath)) {
        backupFile(settingsPath)
      }
      atomicWriteJson(settingsPath, valid.value)
      return { ok: true as const }
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : String(error) }
    }
  })
  ipcMain.handle('pi:updateModelsJson', (_event, next: unknown) => {
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      return { ok: false as const, message: 'models.json invalide: objet attendu.' }
    }
    const error = validateModelsJson(next as Record<string, unknown>)
    if (error) {
      return { ok: false as const, message: error }
    }
    const modelsPath = getPiModelsPath()
    try {
      if (fs.existsSync(modelsPath)) {
        backupFile(modelsPath)
      }
      atomicWriteJson(modelsPath, next as Record<string, unknown>)
      return { ok: true as const }
    } catch (writeError) {
      return { ok: false as const, message: writeError instanceof Error ? writeError.message : String(writeError) }
    }
  })
  ipcMain.handle('pi:runCommand', async (_event, action: PiCommandAction, params: { search?: string; source?: string; local?: boolean }) => {
    switch (action) {
      case 'list':
        return runPiExec(['list'])
      case 'list-models':
        return runPiExec(['--list-models', ...(params?.search ? [params.search] : [])])
      case 'install':
        if (!params?.source) {
          return { ok: false, code: 1, command: ['install'], stdout: '', stderr: '', ranAt: new Date().toISOString(), message: 'source requis' }
        }
        return runPiExec(['install', params.source, ...(params.local ? ['-l'] : [])], 30_000)
      case 'remove':
        if (!params?.source) {
          return { ok: false, code: 1, command: ['remove'], stdout: '', stderr: '', ranAt: new Date().toISOString(), message: 'source requis' }
        }
        return runPiExec(['remove', params.source, ...(params.local ? ['-l'] : [])], 30_000)
      case 'update':
        return runPiExec(['update', ...(params?.source ? [params.source] : [])], 45_000)
      case 'config':
        return runPiExec(['config'], 15_000)
      default:
        return { ok: false, code: 1, command: [], stdout: '', stderr: '', ranAt: new Date().toISOString(), message: 'Action non supportée' }
    }
  })
  ipcMain.handle('pi:getDiagnostics', () => getPiDiagnostics())
  ipcMain.handle('pi:openPath', async (_event, target: 'settings' | 'models' | 'sessions') => {
    const base = path.join(os.homedir(), '.pi', 'agent')
    const targetPath =
      target === 'settings' ? getPiSettingsPath() : target === 'models' ? getPiModelsPath() : path.join(base, 'sessions')
    try {
      await shell.openPath(targetPath)
      return { ok: true as const }
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : String(error) }
    }
  })
  ipcMain.handle('pi:exportSessionHtml', async (_event, sessionFile: string, outputFile?: string) => {
    if (!sessionFile || typeof sessionFile !== 'string') {
      return { ok: false, code: 1, command: [], stdout: '', stderr: '', ranAt: new Date().toISOString(), message: 'sessionFile requis' }
    }
    const args = ['--export', sessionFile]
    if (outputFile && outputFile.trim().length > 0) {
      args.push(outputFile)
    }
    return runPiExec(args, 45_000)
  })

  ipcMain.handle(
    'conversations:createForProject',
    (
      _event,
      projectId: string,
      options?: { modelProvider?: string; modelId?: string; thinkingLevel?: string },
    ) => {
    const db = getDb()
    const project = listProjects(db).find((item) => item.id === projectId)
    if (!project) {
      return { ok: false as const, reason: 'project_not_found' as const }
    }

    const conversationId = crypto.randomUUID()
    insertConversation(db, {
      id: conversationId,
      projectId,
      title: `Nouveau fil - ${project.name}`,
      modelProvider: options?.modelProvider ?? null,
      modelId: options?.modelId ?? null,
      thinkingLevel: options?.thinkingLevel ?? null,
    })

    const conversation = findConversationById(db, conversationId)
    if (!conversation) {
      return { ok: false as const, reason: 'unknown' as const }
    }

    return {
      ok: true as const,
      conversation: mapConversation(conversation),
    }
  },
  )

  ipcMain.handle('conversations:delete', async (_event, conversationId: string) => {
    await piRuntimeManager.stop(conversationId)

    const db = getDb()
    const deleted = deleteConversationById(db, conversationId)
    if (!deleted) {
      return { ok: false as const, reason: 'conversation_not_found' as const }
    }

    return { ok: true as const }
  })

  ipcMain.handle('projects:delete', async (_event, projectId: string) => {
    const db = getDb()
    const project = listProjects(db).find((item) => item.id === projectId)
    if (!project) {
      return { ok: false as const, reason: 'project_not_found' as const }
    }

    const projectConversations = listConversationsByProjectId(db, projectId)
    await Promise.all(projectConversations.map((conversation) => piRuntimeManager.stop(conversation.id)))

    const deleted = deleteProjectById(db, projectId)
    if (!deleted) {
      return { ok: false as const, reason: 'unknown' as const }
    }

    return { ok: true as const }
  })

  ipcMain.handle('conversations:getMessageCache', (_event, conversationId: string) => {
    const db = getDb()
    const rows = listConversationMessagesCache(db, conversationId)
    return rows.map((row) => {
      try {
        return JSON.parse(row.payload_json)
      } catch {
        return null
      }
    }).filter((item) => item !== null)
  })

  ipcMain.handle('conversations:requestAutoTitle', async (_event, conversationId: string, firstMessage: string) => {
    const safeMessage = typeof firstMessage === 'string' ? firstMessage.trim() : ''
    if (!safeMessage) {
      return { ok: false as const, reason: 'empty_message' as const }
    }

    const db = getDb()
    const conversation = findConversationById(db, conversationId)
    if (!conversation) {
      return { ok: false as const, reason: 'conversation_not_found' as const }
    }

    const startsWithDefault = conversation.title.startsWith('Nouveau fil - ')
    if (!startsWithDefault) {
      return { ok: true as const, skipped: true as const }
    }

    const project = listProjects(db).find((item) => item.id === conversation.project_id)
    if (!project) {
      return { ok: false as const, reason: 'project_not_found' as const }
    }

    const provider = conversation.model_provider ?? 'openai-codex'
    const modelId = conversation.model_id ?? 'gpt-5.3-codex'
    const generatedTitle = await generateConversationTitleFromPi({
      provider,
      modelId,
      repoPath: project.repo_path,
      firstMessage: safeMessage,
    })

    if (!generatedTitle) {
      return { ok: false as const, reason: 'title_generation_failed' as const }
    }

    const updated = updateConversationTitle(db, conversationId, generatedTitle)
    if (!updated) {
      return { ok: false as const, reason: 'conversation_not_found' as const }
    }

    const payload = {
      conversationId,
      title: generatedTitle,
      updatedAt: new Date().toISOString(),
    }
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('workspace:conversationUpdated', payload)
    }

    return { ok: true as const, title: generatedTitle }
  })

  ipcMain.handle('pi:startSession', (_event, conversationId: string) => piRuntimeManager.start(conversationId))
  ipcMain.handle('pi:stopSession', (_event, conversationId: string) => piRuntimeManager.stop(conversationId))
  ipcMain.handle('pi:sendCommand', (_event, conversationId: string, command: RpcCommand): Promise<RpcResponse> =>
    piRuntimeManager.sendCommand(conversationId, command),
  )
  ipcMain.handle('pi:getSnapshot', (_event, conversationId: string) => piRuntimeManager.getSnapshot(conversationId))
  ipcMain.handle('pi:respondExtensionUi', (_event, conversationId: string, response: RpcExtensionUiResponse) =>
    piRuntimeManager.respondExtensionUi(conversationId, response),
  )

  ipcMain.handle('settings:getLanguagePreference', () => {
    const db = getDb()
    return getLanguagePreference(db)
  })

  ipcMain.handle('settings:updateLanguagePreference', (_event, language: string) => {
    const db = getDb()
    saveLanguagePreference(db, language)
  })

  ipcMain.handle('projects:importFromFolder', (_event, folderPath: string) => {
    const db = getDb()

    if (!folderPath || !isGitRepo(folderPath)) {
      return { ok: false, reason: 'not_git_repo' as const }
    }

    const existing = findProjectByRepoPath(db, folderPath)
    if (existing) {
      return {
        ok: true,
        duplicate: true,
        project: {
          id: existing.id,
          name: existing.name,
          repoPath: existing.repo_path,
          repoName: existing.repo_name,
          isArchived: Boolean(existing.is_archived),
          createdAt: existing.created_at,
          updatedAt: existing.updated_at,
        },
      }
    }

    const repoName = path.basename(folderPath)
    const id = crypto.randomUUID()
    insertProject(db, {
      id,
      name: repoName,
      repoName,
      repoPath: folderPath,
    })

    const project = listProjects(db).find((p) => p.id === id)
    if (!project) {
      return { ok: false, reason: 'unknown' as const }
    }

    return {
      ok: true,
      duplicate: false,
      project: {
        id: project.id,
        name: project.name,
        repoPath: project.repo_path,
        repoName: project.repo_name,
        isArchived: Boolean(project.is_archived),
        createdAt: project.created_at,
        updatedAt: project.updated_at,
      },
    }
  })
}

export async function stopPiRuntimes() {
  await piRuntimeManager.stopAll()
}
