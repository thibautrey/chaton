import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { promisify } from 'node:util'
import path from 'node:path'
import os from 'node:os'
import { AuthStorage, ModelRegistry, SettingsManager } from '@mariozechner/pi-coding-agent'

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
} from '../pi-sdk-runtime.js'
import {
  getChatonExtensionLogs,
  installChatonExtension,
  listChatonExtensions,
  removeChatonExtension,
  runChatonExtensionHealthCheck,
  toggleChatonExtension,
} from '../extensions/manager.js'

const execFileAsync = promisify(execFile)
const DEFAULT_PATH_SEGMENTS = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']

function buildPiEnv() {
  const home = os.homedir()
  const nvmBin = path.join(home, '.nvm', 'versions', 'node', 'v22.20.0', 'bin')
  const npmPrefix = path.join(home, '.npm-global')
  const npmGlobalBin = path.join(npmPrefix, 'bin')
  const existingPath = process.env.PATH ?? ''
  const nextPath = [nvmBin, npmGlobalBin, ...DEFAULT_PATH_SEGMENTS, existingPath].filter(Boolean).join(':')
  return {
    ...process.env,
    HOME: home,
    PATH: nextPath,
    NPM_CONFIG_PREFIX: npmPrefix,
    npm_config_prefix: npmPrefix,
    npm_prefix: npmPrefix,
    TERM: 'dumb',
  }
}

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

type GitModifiedFileStat = {
  path: string
  added: number
  removed: number
}

type GitDiffSummaryResult =
  | { ok: true; files: GitModifiedFileStat[]; totals: { added: number; removed: number; files: number } }
  | { ok: false; reason: 'project_not_found' | 'not_git_repo' | 'git_not_available' | 'unknown'; message?: string }

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
  const settingsPath = path.join(os.homedir(), '.pi', 'agent', 'settings.json')
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
  return path.join(os.homedir(), '.pi', 'agent', 'settings.json')
}

function getPiModelsPath() {
  return path.join(os.homedir(), '.pi', 'agent', 'models.json')
}

function getPiBinaryPath() {
  return path.join(os.homedir(), '.pi', 'agent', 'bin', 'pi')
}

function getPiAgentDir() {
  return path.join(os.homedir(), '.pi', 'agent')
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
        env: buildPiEnv(),
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

async function getGitDiffSummaryForProject(projectId: string): Promise<GitDiffSummaryResult> {
  const db = getDb()
  const project = listProjects(db).find((item) => item.id === projectId)
  if (!project) {
    return { ok: false, reason: 'project_not_found' }
  }
  if (!isGitRepo(project.repo_path)) {
    return { ok: false, reason: 'not_git_repo' }
  }

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', project.repo_path, 'diff', '--numstat', '--'],
      {
        timeout: 10_000,
        maxBuffer: 2 * 1024 * 1024,
        env: buildPiEnv(),
      },
    )

    const files: GitModifiedFileStat[] = []
    for (const line of (stdout ?? '').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const [addedRaw, removedRaw, ...pathParts] = trimmed.split('\t')
      const filePath = pathParts.join('\t').trim()
      if (!filePath) continue
      const added = addedRaw === '-' ? 0 : Number.parseInt(addedRaw, 10)
      const removed = removedRaw === '-' ? 0 : Number.parseInt(removedRaw, 10)
      files.push({
        path: filePath,
        added: Number.isFinite(added) ? added : 0,
        removed: Number.isFinite(removed) ? removed : 0,
      })
    }

    const totals = files.reduce(
      (acc, file) => ({
        files: acc.files + 1,
        added: acc.added + file.added,
        removed: acc.removed + file.removed,
      }),
      { files: 0, added: 0, removed: 0 },
    )

    return { ok: true, files, totals }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.toLowerCase().includes('enoent')) {
      return { ok: false, reason: 'git_not_available', message }
    }
    return { ok: false, reason: 'unknown', message }
  }
}

function isNpmEnotemptyRemoveError(result: PiCommandResult): boolean {
  if (result.ok) {
    return false
  }
  const haystack = `${result.message ?? ''}\n${result.stderr}\n${result.stdout}`.toLowerCase()
  return haystack.includes('enotempty') && haystack.includes('npm') && haystack.includes('rename')
}

function extractPackageNameFromSource(source: string): string | null {
  if (!source || !source.startsWith('npm:')) {
    return null
  }
  const name = source.slice('npm:'.length).trim()
  return name.length > 0 ? name : null
}

function collectNpmGlobalNodeModulesRoots(envPath: string): string[] {
  const roots = new Set<string>()
  const bins = envPath.split(':').filter((entry) => entry.length > 0)
  for (const binPath of bins) {
    if (binPath.endsWith('/bin')) {
      roots.add(path.resolve(binPath, '..', 'lib', 'node_modules'))
      roots.add(path.resolve(binPath, '..', '..', 'lib', 'node_modules'))
    }
  }
  return Array.from(roots)
}

function cleanupNpmStaleRenameDirs(packageName: string): number {
  const env = buildPiEnv()
  const roots = collectNpmGlobalNodeModulesRoots(env.PATH ?? '')
  let removed = 0

  for (const root of roots) {
    if (!fs.existsSync(root)) {
      continue
    }
    let entries: string[] = []
    try {
      entries = fs.readdirSync(root)
    } catch {
      continue
    }

    const prefix = `.${packageName}-`
    for (const entry of entries) {
      if (!entry.startsWith(prefix)) {
        continue
      }
      const target = path.join(root, entry)
      try {
        fs.rmSync(target, { recursive: true, force: true })
        removed += 1
      } catch {
        // Best effort cleanup: ignore and keep going.
      }
    }
  }

  return removed
}

async function runPiRemoveWithFallback(source: string, local?: boolean): Promise<PiCommandResult> {
  const args = ['remove', source, ...(local ? ['-l'] : [])]
  const first = await runPiExec(args, 30_000)
  if (!isNpmEnotemptyRemoveError(first)) {
    return first
  }

  const packageName = extractPackageNameFromSource(source)
  if (!packageName) {
    return first
  }

  const removedDirs = cleanupNpmStaleRenameDirs(packageName)
  const second = await runPiExec(args, 30_000)
  if (second.ok) {
    return second
  }

  return {
    ...second,
    message: `Échec de désinstallation après nettoyage npm (dirs nettoyés: ${removedDirs}). ${
      second.message ?? 'Erreur inconnue.'
    }`,
  }
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

const THINKING_LEVELS: Array<'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'> = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
]

async function listPiModels(): Promise<PiModelsResult> {
  try {
    const agentDir = getPiAgentDir()
    const authStorage = AuthStorage.create(path.join(agentDir, 'auth.json'))
    const modelRegistry = new ModelRegistry(authStorage, path.join(agentDir, 'models.json'))
    const available = modelRegistry.getAvailable()
    const allModels = modelRegistry.getAll()
    const enabledScopedModels = parseEnabledScopedModels()
    const scopedAvailable = enabledScopedModels.size > 0
      ? available.filter((model) => enabledScopedModels.has(`${model.provider}/${model.id}`))
      : available
    const source =
      scopedAvailable.length > 0
        ? scopedAvailable
        : available.length > 0
          ? available
          : allModels
    const models = source
      .map((model) => {
        const key = `${model.provider}/${model.id}`
        return {
          id: model.id,
          provider: model.provider,
          key,
          scoped: enabledScopedModels.has(key),
          supportsThinking: Boolean(model.reasoning),
          thinkingLevels: Boolean(model.reasoning) ? THINKING_LEVELS : [],
        } satisfies PiModel
      })
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
  const listResult = await syncPiModelsCache()
  if (!listResult.ok) {
    return listResult
  }

  const modelExists = listResult.models.some((model) => model.provider === provider && model.id === id)
  if (!modelExists) {
    return { ok: false, reason: 'invalid_model' }
  }

  const agentDir = getPiAgentDir()
  const settingsManager = SettingsManager.create(process.cwd(), agentDir)
  const key = `${provider}/${id}`
  const enabledModels = new Set(settingsManager.getEnabledModels() ?? [])
  if (scoped) {
    enabledModels.add(key)
  } else {
    enabledModels.delete(key)
  }

  try {
    settingsManager.setEnabledModels(Array.from(enabledModels))
    await settingsManager.flush()
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
      const payload = message as { id?: string; role?: string; message?: { role?: string } }
      const role = payload?.role ?? payload?.message?.role ?? 'unknown'
      return {
        id: payload.id ?? `${conversationId}-${index}`,
        role,
        payloadJson: JSON.stringify(message),
      }
    })
  replaceConversationMessagesCache(db, conversationId, messages)
}

const LONGUEUR_MAX_TITRE = 60
const NOMBRE_MOTS_MIN_TITRE = 3
const NOMBRE_MOTS_MAX_TITRE = 7
const AFFINAGE_TITRE_IA_ACTIVE = true

function normaliserTitre(raw: string): string {
  return raw
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim()
}

function compterMots(texte: string): number {
  return texte.split(/\s+/).filter((mot) => mot.trim().length > 0).length
}

function tronquerTitreParMots(texte: string, longueurMax: number): string {
  const mots = texte.split(/\s+/).filter((mot) => mot.trim().length > 0)
  let resultat = ''
  for (const mot of mots) {
    const candidat = resultat.length === 0 ? mot : `${resultat} ${mot}`
    if (candidat.length > longueurMax) {
      break
    }
    resultat = candidat
  }
  return resultat.trim()
}

function sanitiserTitreStrict(raw: string): string | null {
  const normalise = normaliserTitre(raw)
  if (!normalise) {
    return null
  }
  const tronque = tronquerTitreParMots(normalise, LONGUEUR_MAX_TITRE)
  if (!tronque) {
    return null
  }
  const mots = compterMots(tronque)
  if (mots < NOMBRE_MOTS_MIN_TITRE || mots > NOMBRE_MOTS_MAX_TITRE) {
    return null
  }
  return tronque
}

function construireTitreDeterministe(firstMessage: string): string {
  const messageNettoye = firstMessage
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[\[\]{}()*_#>~|]/g, ' ')
    .replace(/[^\p{L}\p{N}\s'’-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const mots = messageNettoye.split(/\s+/).filter((mot) => mot.trim().length > 0)
  const base = mots.slice(0, NOMBRE_MOTS_MAX_TITRE).join(' ').trim()
  const titre = tronquerTitreParMots(base, LONGUEUR_MAX_TITRE)

  if (titre && compterMots(titre) >= NOMBRE_MOTS_MIN_TITRE) {
    return titre
  }

  return 'Nouvelle discussion'
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

  return sanitiserTitreStrict(result.stdout)
}

function diffuserTitreConversation(conversationId: string, title: string) {
  const payload = {
    conversationId,
    title,
    updatedAt: new Date().toISOString(),
  }
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('workspace:conversationUpdated', payload)
  }
  return payload
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
  ipcMain.handle('workspace:getGitDiffSummary', (_event, projectId: string) => getGitDiffSummaryForProject(projectId))

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
        return runPiRemoveWithFallback(params.source, params.local)
      case 'update':
        return runPiExec(['update', ...(params?.source ? [params.source] : [])], 45_000)
      case 'config':
        return runPiExec(['config'], 15_000)
      default:
        return { ok: false, code: 1, command: [], stdout: '', stderr: '', ranAt: new Date().toISOString(), message: 'Action non supportée' }
    }
  })
  ipcMain.handle('pi:getDiagnostics', () => getPiDiagnostics())
  ipcMain.handle('extensions:list', () => listChatonExtensions())
  ipcMain.handle('extensions:install', (_event, id: string) => installChatonExtension(id))
  ipcMain.handle('extensions:toggle', (_event, id: string, enabled: boolean) => toggleChatonExtension(id, enabled))
  ipcMain.handle('extensions:remove', (_event, id: string) => removeChatonExtension(id))
  ipcMain.handle('extensions:runHealthCheck', () => runChatonExtensionHealthCheck())
  ipcMain.handle('extensions:getLogs', (_event, id: string) => getChatonExtensionLogs(id))
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

    const titreActuel = conversation.title.trim()
    const titreParDefaut = /^Nouveau\s+fil\s*[-–—:]\s*/i.test(titreActuel)
    const titreVide = titreActuel.length === 0
    if (!titreParDefaut && !titreVide) {
      return { ok: true as const, skipped: true as const }
    }

    const titreDeterministe = construireTitreDeterministe(safeMessage)
    const updatedDeterministe = updateConversationTitle(db, conversationId, titreDeterministe)
    if (!updatedDeterministe) {
      return { ok: false as const, reason: 'conversation_not_found' as const }
    }
    diffuserTitreConversation(conversationId, titreDeterministe)

    if (!AFFINAGE_TITRE_IA_ACTIVE) {
      return { ok: true as const, title: titreDeterministe, source: 'deterministic' as const }
    }

    const project = listProjects(db).find((item) => item.id === conversation.project_id)
    if (!project) {
      return { ok: true as const, title: titreDeterministe, source: 'deterministic' as const }
    }

    const provider = conversation.model_provider ?? 'openai-codex'
    const modelId = conversation.model_id ?? 'gpt-5.3-codex'
    const titreAffine = await generateConversationTitleFromPi({
      provider,
      modelId,
      repoPath: project.repo_path,
      firstMessage: safeMessage,
    })

    if (!titreAffine || titreAffine === titreDeterministe) {
      return { ok: true as const, title: titreDeterministe, source: 'deterministic' as const }
    }

    const updatedAffine = updateConversationTitle(db, conversationId, titreAffine)
    if (!updatedAffine) {
      return { ok: true as const, title: titreDeterministe, source: 'deterministic' as const }
    }

    diffuserTitreConversation(conversationId, titreAffine)
    return { ok: true as const, title: titreAffine, source: 'ai' as const }
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
