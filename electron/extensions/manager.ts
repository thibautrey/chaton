import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'

export type ChatonsExtensionHealth = 'ok' | 'warning' | 'error'
export type ChatonsExtensionInstallSource = 'builtin' | 'localPath' | 'git'
export type ChatonsExtensionCatalogSource = 'builtin' | 'npmRegistry'

export type ChatonsExtensionRegistryEntry = {
  id: string
  name: string
  version: string
  description: string
  enabled: boolean
  installSource: ChatonsExtensionInstallSource
  health: ChatonsExtensionHealth
  lastRunAt?: string
  lastRunStatus?: 'ok' | 'error'
  lastError?: string
  config?: Record<string, unknown>
  capabilitiesDeclared?: string[]
  capabilitiesUsed?: string[]
  healthDetails?: Record<string, unknown>
  apiContracts?: Record<string, unknown>
  manifestDigest?: string | null
  installed?: boolean
}

type RegistryFile = {
  version: number
  extensions: ChatonsExtensionRegistryEntry[]
}

export type ChatonsExtensionCatalogEntry = {
  id: string
  name: string
  version: string
  description: string
  source: ChatonsExtensionCatalogSource
  requiresRestart: boolean
}

type NpmCatalogCache = {
  updatedAt: string
  entries: ChatonsExtensionCatalogEntry[]
}

export type ChatonsExtensionInstallState = {
  id: string
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled'
  startedAt?: string
  finishedAt?: string
  message?: string
  pid?: number
}

const CHATON_BASE = path.join(os.homedir(), '.chaton')
const EXTENSIONS_DIR = path.join(CHATON_BASE, 'extensions')
const REGISTRY_PATH = path.join(CHATON_BASE, 'extensions', 'registry.json')
const LOGS_DIR = path.join(CHATON_BASE, 'extensions', 'logs')
const NPM_CACHE_PATH = path.join(CHATON_BASE, 'extensions', 'npm-index-cache.json')
const NPM_CATALOG_TTL_MS = 1000 * 60 * 30

const BUILTIN_AUTOMATION_EXTENSION: Omit<ChatonsExtensionRegistryEntry, 'enabled' | 'health' | 'lastRunAt' | 'lastRunStatus' | 'lastError'> = {
  id: '@chaton/automation',
  name: 'Chatons Automation',
  version: '1.1.0',
  description: 'Extension d’automatisation intégrée pour créer et gérer des règles d’automatisation.',
  installSource: 'builtin',
}

const BUILTIN_MEMORY_EXTENSION: Omit<ChatonsExtensionRegistryEntry, 'enabled' | 'health' | 'lastRunAt' | 'lastRunStatus' | 'lastError'> = {
  id: '@chaton/memory',
  name: 'Chatons Memory',
  version: '1.0.0',
  description: 'Extension mémoire intégrée avec stockage interne SQLite et recherche sémantique locale.',
  installSource: 'builtin',
}

const installProcesses = new Map<string, ChildProcess>()
const installStates = new Map<string, ChatonsExtensionInstallState>()

function ensureBaseDirs() {
  fs.mkdirSync(CHATON_BASE, { recursive: true })
  fs.mkdirSync(EXTENSIONS_DIR, { recursive: true })
  fs.mkdirSync(LOGS_DIR, { recursive: true })
}

function defaultRegistry(): RegistryFile {
  return {
    version: 1,
    extensions: [
      {
        ...BUILTIN_AUTOMATION_EXTENSION,
        enabled: true,
        health: 'ok',
      },
      {
        ...BUILTIN_MEMORY_EXTENSION,
        enabled: true,
        health: 'ok',
      },
    ],
  }
}

function safeReadRegistry(): RegistryFile {
  ensureBaseDirs()
  if (!fs.existsSync(REGISTRY_PATH)) {
    const next = defaultRegistry()
    fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    return next
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')) as RegistryFile
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.extensions)) {
      return defaultRegistry()
    }

    const existing = new Map(parsed.extensions.map((entry) => [entry.id, entry]))
    if (!existing.has(BUILTIN_AUTOMATION_EXTENSION.id)) {
      parsed.extensions.push({
        ...BUILTIN_AUTOMATION_EXTENSION,
        enabled: true,
        health: 'ok',
      })
    }
    if (!existing.has(BUILTIN_MEMORY_EXTENSION.id)) {
      parsed.extensions.push({
        ...BUILTIN_MEMORY_EXTENSION,
        enabled: true,
        health: 'ok',
      })
    }

    return {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      extensions: parsed.extensions.filter(
        (entry) => entry && typeof entry.id === 'string' && entry.id !== 'qwen-schema-sanitizer' && entry.id !== 'chatons-example-extension',
      ),
    }
  } catch {
    return defaultRegistry()
  }
}

function writeRegistry(registry: RegistryFile) {
  ensureBaseDirs()
  fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`, 'utf8')
}

function extensionLogFileSafeId(extensionId: string) {
  return String(extensionId || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeRequiresRestart(value: unknown): boolean {
  return value === true
}

function extractRequiresRestart(pkg: Record<string, unknown> | null | undefined): boolean {
  if (!pkg || typeof pkg !== 'object') return false
  const chatons = pkg.chatons
  if (chatons && typeof chatons === 'object' && chatons !== null) {
    const maybe = (chatons as Record<string, unknown>).requiresRestart
    if (normalizeRequiresRestart(maybe)) return true
  }
  return normalizeRequiresRestart(pkg.requiresRestart)
}

function readNpmCache(): NpmCatalogCache | null {
  if (!fs.existsSync(NPM_CACHE_PATH)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(NPM_CACHE_PATH, 'utf8')) as NpmCatalogCache
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entries) || typeof parsed.updatedAt !== 'string') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeNpmCache(entries: ChatonsExtensionCatalogEntry[]) {
  const payload: NpmCatalogCache = {
    updatedAt: new Date().toISOString(),
    entries,
  }
  fs.writeFileSync(NPM_CACHE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

function isNpmCatalogCacheFresh(cache: NpmCatalogCache | null): boolean {
  if (!cache) return false
  const updated = Date.parse(cache.updatedAt)
  if (!Number.isFinite(updated)) return false
  return Date.now() - updated < NPM_CATALOG_TTL_MS
}

function runNpmJson(args: string[]): unknown {
  const result = spawnSync('npm', args, {
    encoding: 'utf8',
    timeout: 20_000,
    maxBuffer: 2 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `npm ${args.join(' ')} failed`)
  }
  const content = result.stdout?.trim()
  if (!content) {
    throw new Error(`npm ${args.join(' ')} returned empty output`)
  }
  return JSON.parse(content)
}

function isValidPublishedExtensionPackageName(name: string): boolean {
  return /^@[^/]+\/chatons-[a-z0-9][a-z0-9-]*$/i.test(name)
}

function normalizeNpmSearchEntry(entry: unknown): ChatonsExtensionCatalogEntry | null {
  if (!entry || typeof entry !== 'object') return null
  const e = entry as Record<string, unknown>
  const name = typeof e.name === 'string' ? e.name : ''
  if (!isValidPublishedExtensionPackageName(name)) return null
  return {
    id: name,
    name,
    version: typeof e.version === 'string' ? e.version : '0.0.0',
    description: typeof e.description === 'string' ? e.description : '',
    source: 'npmRegistry',
    requiresRestart: false,
  }
}

function listBundledCatalogEntries(): ChatonsExtensionCatalogEntry[] {
  return [
    {
      id: BUILTIN_AUTOMATION_EXTENSION.id,
      name: BUILTIN_AUTOMATION_EXTENSION.name,
      version: BUILTIN_AUTOMATION_EXTENSION.version,
      description: BUILTIN_AUTOMATION_EXTENSION.description,
      source: 'builtin',
      requiresRestart: false,
    },
    {
      id: BUILTIN_MEMORY_EXTENSION.id,
      name: BUILTIN_MEMORY_EXTENSION.name,
      version: BUILTIN_MEMORY_EXTENSION.version,
      description: BUILTIN_MEMORY_EXTENSION.description,
      source: 'builtin',
      requiresRestart: false,
    },
  ]
}

function refreshNpmCatalog(): NpmCatalogCache {
  const result = runNpmJson(['search', 'chatons-', '--json']) as unknown
  const raw = Array.isArray(result) ? result : []
  const entries = raw
    .map(normalizeNpmSearchEntry)
    .filter((entry): entry is ChatonsExtensionCatalogEntry => entry !== null)
  writeNpmCache(entries)
  return {
    updatedAt: new Date().toISOString(),
    entries,
  }
}

function getNpmCatalogCachedOrFresh() {
  const cache = readNpmCache()
  if (cache && isNpmCatalogCacheFresh(cache)) {
    return { entries: cache.entries, updatedAt: cache.updatedAt, source: 'cache' as const }
  }
  try {
    const fresh = refreshNpmCatalog()
    return { entries: fresh.entries, updatedAt: fresh.updatedAt, source: 'npm' as const }
  } catch {
    return {
      entries: cache?.entries ?? [],
      updatedAt: cache?.updatedAt ?? new Date(0).toISOString(),
      source: 'cache' as const,
    }
  }
}

function getRegistryEntryFromBuiltin(id: string): Omit<ChatonsExtensionRegistryEntry, 'enabled' | 'health' | 'lastRunAt' | 'lastRunStatus' | 'lastError'> | null {
  if (id === BUILTIN_AUTOMATION_EXTENSION.id) return BUILTIN_AUTOMATION_EXTENSION
  if (id === BUILTIN_MEMORY_EXTENSION.id) return BUILTIN_MEMORY_EXTENSION
  return null
}

function setRegistryEntry(update: (registry: RegistryFile) => RegistryFile) {
  const next = update(safeReadRegistry())
  writeRegistry(next)
  return next
}

function setInstallState(id: string, next: Partial<ChatonsExtensionInstallState>) {
  const current = installStates.get(id) ?? { id, status: 'idle' as const }
  const merged: ChatonsExtensionInstallState = { ...current, ...next, id }
  installStates.set(id, merged)
  return merged
}

function upsertInstalledExtensionFromPackage(id: string, pkgMeta: Record<string, unknown>) {
  const version = typeof pkgMeta.version === 'string' ? pkgMeta.version : '0.0.0'
  const description = typeof pkgMeta.description === 'string' ? pkgMeta.description : ''
  const requiresRestart = extractRequiresRestart(pkgMeta)

  const registry = setRegistryEntry((current) => {
    const existing = current.extensions.find((entry) => entry.id === id)
    if (existing) {
      return {
        ...current,
        extensions: current.extensions.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                name: id,
                version,
                description,
                enabled: true,
                installSource: 'localPath',
                health: 'ok',
                lastError: undefined,
                config: { ...(entry.config ?? {}), requiresRestart, sandboxed: true },
              }
            : entry,
        ),
      }
    }
    return {
      ...current,
      extensions: [
        ...current.extensions,
        {
          id,
          name: id,
          version,
          description,
          enabled: true,
          installSource: 'localPath',
          health: 'ok',
          config: { requiresRestart, sandboxed: true },
        },
      ],
    }
  })

  return registry.extensions.find((entry) => entry.id === id)
}

function startNpmExtensionInstall(id: string) {
  if (!isValidPublishedExtensionPackageName(id)) {
    return { ok: false as const, message: `Nom npm invalide. Format attendu: @user/chatons-extension-name (${id})` }
  }
  if (installProcesses.has(id)) {
    return { ok: false as const, message: 'Une installation est deja en cours pour cette extension.' }
  }

  let pkgMeta: Record<string, unknown>
  try {
    const raw = runNpmJson(['view', id, '--json']) as unknown
    pkgMeta = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : `Impossible de lire le package npm ${id}`,
    }
  }

  const extensionDir = path.join(EXTENSIONS_DIR, id)
  fs.mkdirSync(extensionDir, { recursive: true })
  const logPath = path.join(LOGS_DIR, `${extensionLogFileSafeId(id)}.install.log`)
  fs.writeFileSync(logPath, '', 'utf8')

  const child = spawn('npm', ['install', id, '--no-save'], {
    cwd: extensionDir,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  installProcesses.set(id, child)
  setInstallState(id, {
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: undefined,
    message: 'Installation npm en cours...',
    pid: child.pid,
  })

  child.stdout?.on('data', (chunk) => {
    fs.appendFileSync(logPath, String(chunk))
  })
  child.stderr?.on('data', (chunk) => {
    fs.appendFileSync(logPath, String(chunk))
  })

  child.on('error', (error) => {
    installProcesses.delete(id)
    setInstallState(id, {
      status: 'error',
      finishedAt: new Date().toISOString(),
      message: error.message,
      pid: undefined,
    })
  })

  child.on('close', (code, signal) => {
    installProcesses.delete(id)
    const current = installStates.get(id)
    if (current?.status === 'cancelled') {
      setInstallState(id, {
        finishedAt: new Date().toISOString(),
        message: signal ? `Installation annulee (${signal}).` : 'Installation annulee.',
        pid: undefined,
      })
      return
    }
    if (code === 0) {
      const extension = upsertInstalledExtensionFromPackage(id, pkgMeta)
      setInstallState(id, {
        status: 'done',
        finishedAt: new Date().toISOString(),
        message: 'Installation terminee.',
        pid: undefined,
      })
      if (!extension) {
        setInstallState(id, {
          status: 'error',
          finishedAt: new Date().toISOString(),
          message: 'Installation terminee mais extension introuvable dans le registre.',
          pid: undefined,
        })
      }
      return
    }
    setInstallState(id, {
      status: 'error',
      finishedAt: new Date().toISOString(),
      message: `npm install a echoue${typeof code === 'number' ? ` (code ${code})` : ''}.`,
      pid: undefined,
    })
  })

  return { ok: true as const, started: true, state: installStates.get(id), extension: null }
}

export function listChatonsExtensions() {
  const registry = safeReadRegistry()
  return { ok: true as const, extensions: registry.extensions }
}

export function installChatonsExtension(id: string) {
  const builtin = getRegistryEntryFromBuiltin(id)
  if (!builtin) {
    return startNpmExtensionInstall(id)
  }

  const registry = setRegistryEntry((current) => {
    const existing = current.extensions.find((entry) => entry.id === id)
    if (existing) {
      return {
        ...current,
        extensions: current.extensions.map((entry) => (entry.id === id ? { ...entry, enabled: true } : entry)),
      }
    }

    return {
      ...current,
      extensions: [
        ...current.extensions,
        {
          ...builtin,
          enabled: true,
          health: 'ok',
        },
      ],
    }
  })

  const extension = registry.extensions.find((entry) => entry.id === id)
  setInstallState(id, {
    status: 'done',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    message: 'Extension integree activee.',
    pid: undefined,
  })
  return { ok: true as const, extension, started: false, state: installStates.get(id) }
}

export function getChatonsExtensionInstallState(id: string) {
  return { ok: true as const, state: installStates.get(id) ?? { id, status: 'idle' as const } }
}

export function cancelChatonsExtensionInstall(id: string) {
  const child = installProcesses.get(id)
  if (!child) {
    const state = installStates.get(id)
    if (state?.status === 'running') {
      setInstallState(id, { status: 'error', finishedAt: new Date().toISOString(), message: 'Processus d installation introuvable.' })
    }
    return { ok: false as const, message: 'Aucune installation en cours pour cette extension.' }
  }
  setInstallState(id, {
    status: 'cancelled',
    finishedAt: new Date().toISOString(),
    message: 'Annulation de l installation...',
    pid: undefined,
  })
  const killed = child.kill('SIGTERM')
  installProcesses.delete(id)
  return { ok: killed as boolean, message: killed ? 'Installation annulee.' : 'Impossible d annuler l installation.' }
}

export function toggleChatonsExtension(id: string, enabled: boolean) {
  const current = safeReadRegistry()
  const exists = current.extensions.some((entry) => entry.id === id)
  if (!exists) {
    return { ok: false as const, message: 'Extension not found' }
  }

  const registry = setRegistryEntry((state) => ({
    ...state,
    extensions: state.extensions.map((entry) => (entry.id === id ? { ...entry, enabled } : entry)),
  }))

  return { ok: true as const, id, enabled, extensions: registry.extensions }
}

export function removeChatonsExtension(id: string) {
  if (id === BUILTIN_AUTOMATION_EXTENSION.id || id === BUILTIN_MEMORY_EXTENSION.id) {
    return { ok: false as const, message: 'Builtin extension cannot be removed' }
  }

  const extensionDir = path.join(EXTENSIONS_DIR, id)
  try {
    if (fs.existsSync(extensionDir)) {
      fs.rmSync(extensionDir, { recursive: true, force: true })
    }
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : String(error) }
  }

  const registry = setRegistryEntry((state) => ({
    ...state,
    extensions: state.extensions.filter((entry) => entry.id !== id),
  }))

  return { ok: true as const, id, extensions: registry.extensions }
}

export function getChatonsExtensionLogs(id: string) {
  const runtimeLogPath = path.join(LOGS_DIR, `${extensionLogFileSafeId(id)}.log`)
  const installLogPath = path.join(LOGS_DIR, `${extensionLogFileSafeId(id)}.install.log`)
  const content = [runtimeLogPath, installLogPath]
    .filter((candidate) => fs.existsSync(candidate))
    .map((candidate) => fs.readFileSync(candidate, 'utf8'))
    .join('\n')
  return { ok: true as const, id, content }
}

export function runChatonsExtensionHealthCheck() {
  const registry = safeReadRegistry()
  const report = registry.extensions.map((extension) => ({
    id: extension.id,
    enabled: extension.enabled,
    health: extension.health,
    lastRunStatus: extension.lastRunStatus ?? null,
    lastError: extension.lastError ?? null,
  }))
  return { ok: true as const, report }
}

export function runBeforePiLaunchHooks() {
  const registry = safeReadRegistry()
  const enabled = registry.extensions.filter((entry) => entry.enabled)
  const reports = enabled.map((extension) => ({
    id: extension.id,
    ok: true,
    message: 'No beforePiLaunch hook defined',
  }))

  return { ok: true as const, report: reports }
}

export function getChatonsExtensionsBaseDir() {
  ensureBaseDirs()
  return EXTENSIONS_DIR
}

export function listChatonsExtensionCatalog() {
  const bundled = listBundledCatalogEntries()
  const npm = getNpmCatalogCachedOrFresh()
  return {
    ok: true as const,
    updatedAt: npm.updatedAt,
    source: npm.source,
    entries: [...bundled, ...npm.entries],
  }
}
