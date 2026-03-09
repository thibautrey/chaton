import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import crypto from 'node:crypto'

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
  npmPublishedVersion?: string | null
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
  category?: string
  tags?: string[]
  author?: string
  downloadCount?: number
  rating?: number
  lastUpdated?: string
  featured?: boolean
  popularity?: 'new' | 'trending' | 'popular' | 'recommended'
  icon?: string
  iconUrl?: string
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
const NPM_TOKEN_PATH = path.join(CHATON_BASE, 'npm-token.enc')
const NPM_CATALOG_TTL_MS = 1000 * 60 * 30

// Encryption key is derived from machine hostname + fixed salt for non-trivial storage
// This is NOT Fort Knox - the goal is to avoid plaintext in config, not military-grade security
const getEncryptionKey = () => {
  const hostname = os.hostname()
  const salt = Buffer.from('chatons-npm-token-storage')
  return crypto.pbkdf2Sync(hostname, salt, 100000, 32, 'sha256')
}

const encryptToken = (token: string): string => {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', getEncryptionKey(), iv)
  let encrypted = cipher.update(token, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

const decryptToken = (encrypted: string): string | null => {
  try {
    const [ivHex, encryptedHex] = encrypted.split(':')
    if (!ivHex || !encryptedHex) return null
    const iv = Buffer.from(ivHex, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv)
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch {
    return null
  }
}

const saveNpmToken = (token: string): boolean => {
  try {
    ensureBaseDirs()
    const encrypted = encryptToken(token)
    fs.writeFileSync(NPM_TOKEN_PATH, encrypted, 'utf8')
    // Set restrictive permissions (readable/writable by owner only)
    fs.chmodSync(NPM_TOKEN_PATH, 0o600)
    return true
  } catch {
    return false
  }
}

const loadNpmToken = (): string | null => {
  try {
    if (!fs.existsSync(NPM_TOKEN_PATH)) return null
    const encrypted = fs.readFileSync(NPM_TOKEN_PATH, 'utf8')
    return decryptToken(encrypted)
  } catch {
    return null
  }
}

const clearNpmToken = (): boolean => {
  try {
    if (fs.existsSync(NPM_TOKEN_PATH)) {
      fs.unlinkSync(NPM_TOKEN_PATH)
    }
    return true
  } catch {
    return false
  }
}

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

const BUILTIN_BROWSER_EXTENSION: Omit<ChatonsExtensionRegistryEntry, 'enabled' | 'health' | 'lastRunAt' | 'lastRunStatus' | 'lastError'> = {
  id: '@chaton/browser',
  name: 'Chatons Browser',
  version: '1.0.0',
  description: 'Extension navigateur intégrée pour ouvrir des pages web, lire leur contenu et interagir avec elles.',
  installSource: 'builtin',
}

const installProcesses = new Map<string, ChildProcess>()
const installStates = new Map<string, ChatonsExtensionInstallState>()

// In-memory registry cache to avoid re-reading disk + re-discovering on every call
let registryCache: RegistryFile | null = null
let registryCacheTime = 0
const REGISTRY_CACHE_TTL_MS = 30_000 // 30s — plenty for UI reads

// npm published version cache (TTL-based, survives across calls)
const npmVersionCache = new Map<string, { version: string | null; fetchedAt: number }>()
const NPM_VERSION_CACHE_TTL_MS = 1000 * 60 * 60 // 1 hour
let npmVersionUpdateRunning = false

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
  } catch {
    return null
  }
}

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
      {
        ...BUILTIN_BROWSER_EXTENSION,
        enabled: true,
        health: 'ok',
      },
    ],
  }
}

function safeReadRegistry(): RegistryFile {
  // Return cached registry if fresh enough
  if (registryCache && (Date.now() - registryCacheTime) < REGISTRY_CACHE_TTL_MS) {
    return registryCache
  }

  ensureBaseDirs()
  let registry: RegistryFile

  if (!fs.existsSync(REGISTRY_PATH)) {
    registry = defaultRegistry()
    fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`, 'utf8')
  } else {
    try {
      const parsed = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')) as RegistryFile
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.extensions)) {
        registry = defaultRegistry()
      } else {
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
        if (!existing.has(BUILTIN_BROWSER_EXTENSION.id)) {
          parsed.extensions.push({
            ...BUILTIN_BROWSER_EXTENSION,
            enabled: true,
            health: 'ok',
          })
        }

        registry = {
          version: typeof parsed.version === 'number' ? parsed.version : 1,
          extensions: parsed.extensions.filter(
            (entry) => entry && typeof entry.id === 'string' && entry.id !== 'qwen-schema-sanitizer' && entry.id !== 'chatons-example-extension',
          ),
        }
      }
    } catch {
      registry = defaultRegistry()
    }
  }

  const merged = mergeRegistryWithDiscoveredExtensions(registry)
  if (JSON.stringify(merged) !== JSON.stringify(registry)) {
    writeRegistry(merged)
  }

  // Populate cache
  registryCache = merged
  registryCacheTime = Date.now()

  return merged
}

function writeRegistry(registry: RegistryFile) {
  ensureBaseDirs()
  fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`, 'utf8')
  // Invalidate cache so next read picks up changes
  registryCache = registry
  registryCacheTime = Date.now()
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

const CHATONS_CATALOG_URL = 'https://www.chatons.ai/extensions-catalog.json'

function checkNpmLoginStatus(): { loggedIn: boolean; username?: string } {
  try {
    const result = spawnSync('npm', ['whoami'], {
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: 1 * 1024 * 1024,
    })
    if (result.status === 0 && result.stdout?.trim()) {
      return { loggedIn: true, username: result.stdout.trim() }
    }
    return { loggedIn: false }
  } catch (error) {
    return { loggedIn: false }
  }
}

function setNpmToken(token: string): boolean {
  try {
    // Append token to .npmrc file (don't overwrite existing config)
    const homeDir = os.homedir()
    const npmrcPath = path.join(homeDir, '.npmrc')
    const npmrcContent = `//registry.npmjs.org/:_authToken=${token}\n`
    
    // Append to existing file (or create new one)
    if (fs.existsSync(npmrcPath)) {
      const existing = fs.readFileSync(npmrcPath, 'utf8')
      // Remove old token if it exists
      const lines = existing.split('\n').filter(line => !line.includes('registry.npmjs.org/:_authToken'))
      fs.writeFileSync(npmrcPath, [...lines, npmrcContent].filter(l => l.trim()).join('\n'), 'utf8')
    } else {
      fs.writeFileSync(npmrcPath, npmrcContent, 'utf8')
    }
    return true
  } catch (error) {
    return false
  }
}

/**
 * Fetch the currently published version of a package on npm.
 * Uses async child_process.exec to avoid blocking the event loop.
 */
function getNpmPublishedVersionAsync(packageName: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn('npm', ['view', packageName, 'version'], {
      encoding: 'utf8',
      timeout: 15_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    } as Parameters<typeof spawn>[2])
    let stdout = ''
    child.stdout?.on('data', (chunk: Buffer) => { stdout += String(chunk) })
    child.on('error', () => resolve(null))
    child.on('close', (code: number | null) => {
      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim())
      } else {
        resolve(null)
      }
    })
  })
}

function isValidPublishedExtensionPackageName(name: string): boolean {
  return /^@[^/]+\/chatons-[a-z0-9][a-z0-9-]*$/i.test(name)
}

/**
 * Convert a website catalog entry into the internal catalog format.
 * The website catalog (from chatons.ai) already has rich metadata.
 */
function normalizeChatonsCatalogEntry(
  entry: Record<string, unknown>,
  category: string,
): ChatonsExtensionCatalogEntry | null {
  const id = typeof entry.id === 'string' ? entry.id : ''
  if (!id) return null

  const name = typeof entry.name === 'string' ? entry.name : id
  const version = typeof entry.version === 'string' ? entry.version : '0.0.0'
  const description = typeof entry.description === 'string' ? entry.description : ''
  const author = typeof entry.author === 'string' ? entry.author : undefined
  const keywords = Array.isArray(entry.keywords) ? (entry.keywords as string[]) : []
  const iconUrl = typeof entry.iconUrl === 'string' && entry.iconUrl
    ? `https://www.chatons.ai${entry.iconUrl}`
    : undefined

  // Determine popularity from recency
  const lastUpdated = typeof entry.lastUpdated === 'string' ? entry.lastUpdated : undefined
  let popularity: 'new' | 'trending' | 'popular' | 'recommended' | undefined = undefined
  if (category === 'builtin') {
    popularity = 'recommended'
  } else if (lastUpdated) {
    const daysSince = (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60 * 24)
    if (daysSince < 30) popularity = 'new'
  }

  return {
    id,
    name,
    version,
    description,
    source: category === 'builtin' ? 'builtin' : 'npmRegistry',
    requiresRestart: false,
    category: mapCatalogCategory(category, id),
    tags: keywords.slice(0, 3),
    author,
    lastUpdated,
    popularity,
    featured: category === 'builtin',
    iconUrl,
  }
}

function mapCatalogCategory(category: string, id: string): string {
  if (category === 'builtin') {
    if (id.includes('automation')) return 'Automation'
    if (id.includes('memory')) return 'Memory & Storage'
    if (id.includes('browser')) return 'Web & APIs'
    return 'General'
  }
  if (category === 'channel') return 'Channels'
  // For tools, use keyword/name heuristics
  const nameStr = id.toLowerCase()
  if (nameStr.includes('linear') || nameStr.includes('project')) return 'Productivity'
  if (nameStr.includes('usage') || nameStr.includes('tracker') || nameStr.includes('analytics')) return 'Analytics'
  return 'Tools'
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
      category: 'Automation',
      tags: ['automation', 'builtin', 'recommended'],
      author: 'Chatons',
      popularity: 'recommended',
      featured: true,
    },
    {
      id: BUILTIN_MEMORY_EXTENSION.id,
      name: BUILTIN_MEMORY_EXTENSION.name,
      version: BUILTIN_MEMORY_EXTENSION.version,
      description: BUILTIN_MEMORY_EXTENSION.description,
      source: 'builtin',
      requiresRestart: false,
      category: 'Memory & Storage',
      tags: ['memory', 'builtin', 'recommended'],
      author: 'Chatons',
      popularity: 'recommended',
      featured: true,
    },
    {
      id: BUILTIN_BROWSER_EXTENSION.id,
      name: BUILTIN_BROWSER_EXTENSION.name,
      version: BUILTIN_BROWSER_EXTENSION.version,
      description: BUILTIN_BROWSER_EXTENSION.description,
      source: 'builtin',
      requiresRestart: false,
      category: 'Web & APIs',
      tags: ['browser', 'web', 'automation', 'builtin', 'recommended'],
      author: 'Chatons',
      popularity: 'recommended',
      featured: true,
    },
  ]
}

/**
 * Fetch the extension catalog from chatons.ai and convert it to internal format.
 */
async function fetchChatonsCatalog(): Promise<ChatonsExtensionCatalogEntry[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(CHATONS_CATALOG_URL, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json() as Record<string, unknown>

    const entries: ChatonsExtensionCatalogEntry[] = []

    // Process each category from the website catalog
    for (const category of ['builtin', 'channel', 'tool'] as const) {
      const items = data[category]
      if (!Array.isArray(items)) continue
      for (const item of items) {
        if (!item || typeof item !== 'object') continue
        const entry = normalizeChatonsCatalogEntry(item as Record<string, unknown>, category)
        if (entry) entries.push(entry)
      }
    }

    return entries
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Synchronous refresh using spawnSync for backward compatibility.
 * Fetches from chatons.ai using a child process to avoid blocking.
 */
function refreshCatalogSync(): NpmCatalogCache {
  try {
    const result = spawnSync('node', ['-e', `
      fetch('${CHATONS_CATALOG_URL}')
        .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
        .then(d => process.stdout.write(JSON.stringify(d)))
        .catch(e => { process.stderr.write(e.message); process.exit(1); });
    `], {
      encoding: 'utf8',
      timeout: 20_000,
      maxBuffer: 2 * 1024 * 1024,
    })

    if (result.status !== 0) {
      throw new Error(result.stderr?.trim() || 'Failed to fetch catalog from chatons.ai')
    }

    const data = JSON.parse(result.stdout) as Record<string, unknown>
    const entries: ChatonsExtensionCatalogEntry[] = []

    for (const category of ['builtin', 'channel', 'tool'] as const) {
      const items = data[category]
      if (!Array.isArray(items)) continue
      for (const item of items) {
        if (!item || typeof item !== 'object') continue
        const entry = normalizeChatonsCatalogEntry(item as Record<string, unknown>, category)
        if (entry) entries.push(entry)
      }
    }

    writeNpmCache(entries)
    return { updatedAt: new Date().toISOString(), entries }
  } catch (error) {
    throw error
  }
}

function getNpmCatalogCachedOrFresh() {
  const cache = readNpmCache()
  if (cache && isNpmCatalogCacheFresh(cache)) {
    return { entries: cache.entries, updatedAt: cache.updatedAt, source: 'cache' as const }
  }
  try {
    const fresh = refreshCatalogSync()
    return { entries: fresh.entries, updatedAt: fresh.updatedAt, source: 'chatons' as const }
  } catch {
    return {
      entries: cache?.entries ?? [],
      updatedAt: cache?.updatedAt ?? new Date(0).toISOString(),
      source: 'cache' as const,
    }
  }
}

async function getNpmCatalogCachedOrFreshAsync() {
  const cache = readNpmCache()
  if (cache && isNpmCatalogCacheFresh(cache)) {
    return { entries: cache.entries, updatedAt: cache.updatedAt, source: 'cache' as const }
  }
  try {
    const entries = await fetchChatonsCatalog()
    writeNpmCache(entries)
    return { entries, updatedAt: new Date().toISOString(), source: 'chatons' as const }
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
  if (id === BUILTIN_BROWSER_EXTENSION.id) return BUILTIN_BROWSER_EXTENSION
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

function normalizeInstalledExtensionEntryFromDisk(extensionId: string, rootDir: string): ChatonsExtensionRegistryEntry | null {
  const manifestPath = path.join(rootDir, 'chaton.extension.json')
  if (!fs.existsSync(manifestPath)) return null

  const manifest = readJsonFile(manifestPath)
  if (!manifest) return null

  const id = typeof manifest.id === 'string' ? manifest.id.trim() : ''
  const name = typeof manifest.name === 'string' ? manifest.name.trim() : ''
  const version = typeof manifest.version === 'string' ? manifest.version.trim() : '0.0.0'
  const description = typeof manifest.description === 'string' ? manifest.description : ''
  if (!id || id !== extensionId || !name || !version) return null

  const packageJson = readJsonFile(path.join(rootDir, 'package.json'))
  const chatons = packageJson?.chatons && typeof packageJson.chatons === 'object' ? packageJson.chatons as Record<string, unknown> : null
  const requiresRestart = extractRequiresRestart(packageJson)
  
  // Extract the npm package name if available
  const npmPackageName = typeof packageJson?.name === 'string' ? packageJson.name.trim() : null

  return {
    id,
    name,
    version,
    description,
    enabled: true,
    installSource: 'localPath',
    health: 'ok',
    config: {
      ...(requiresRestart ? { requiresRestart } : {}),
      ...(chatons ? { sandboxed: true } : {}),
      ...(npmPackageName ? { npmPackageName } : {}),
    },
  }
}

function discoverInstalledExtensionsFromDisk(): ChatonsExtensionRegistryEntry[] {
  ensureBaseDirs()
  const discovered = new Map<string, ChatonsExtensionRegistryEntry>()
  const rootsToScan = [EXTENSIONS_DIR, path.join(EXTENSIONS_DIR, 'extensions')]

  for (const baseDir of rootsToScan) {
    if (!fs.existsSync(baseDir)) continue
    const scopeEntries = fs.readdirSync(baseDir, { withFileTypes: true })
    for (const scopeEntry of scopeEntries) {
      if (!scopeEntry.isDirectory()) continue
      const scopePath = path.join(baseDir, scopeEntry.name)

      if (scopeEntry.name.startsWith('@')) {
        const packageEntries = fs.readdirSync(scopePath, { withFileTypes: true })
        for (const packageEntry of packageEntries) {
          if (!packageEntry.isDirectory()) continue
          const extensionId = `${scopeEntry.name}/${packageEntry.name}`
          const entry = normalizeInstalledExtensionEntryFromDisk(extensionId, path.join(scopePath, packageEntry.name))
          if (entry) discovered.set(entry.id, entry)
        }
        continue
      }

      const entry = normalizeInstalledExtensionEntryFromDisk(scopeEntry.name, scopePath)
      if (entry) discovered.set(entry.id, entry)
    }
  }

  return Array.from(discovered.values())
}

function mergeRegistryWithDiscoveredExtensions(registry: RegistryFile) {
  const discovered = discoverInstalledExtensionsFromDisk()
  if (!discovered.length) return registry

  const byId = new Map(registry.extensions.map((entry) => [entry.id, entry]))
  let changed = false

  for (const discoveredEntry of discovered) {
    const existing = byId.get(discoveredEntry.id)
    if (!existing) {
      byId.set(discoveredEntry.id, discoveredEntry)
      changed = true
      continue
    }

    const merged: ChatonsExtensionRegistryEntry = {
      ...discoveredEntry,
      enabled: existing.enabled,
      health: existing.health,
      lastRunAt: existing.lastRunAt,
      lastRunStatus: existing.lastRunStatus,
      lastError: existing.lastError,
      config: { ...(discoveredEntry.config ?? {}), ...(existing.config ?? {}) },
      capabilitiesDeclared: existing.capabilitiesDeclared,
      capabilitiesUsed: existing.capabilitiesUsed,
      healthDetails: existing.healthDetails,
      apiContracts: existing.apiContracts,
      manifestDigest: existing.manifestDigest,
      installed: existing.installed,
      npmPublishedVersion: existing.npmPublishedVersion,
    }

    if (JSON.stringify(existing) !== JSON.stringify(merged)) {
      byId.set(discoveredEntry.id, merged)
      changed = true
    }
  }

  if (!changed) return registry
  return {
    ...registry,
    extensions: Array.from(byId.values()),
  }
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

/** Run an npm CLI command and parse the JSON output. Used for install-time metadata lookups. */
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
    
    // Extract detailed error from log file
    let errorDetails = ''
    try {
      const logContent = fs.readFileSync(logPath, 'utf8')
      const lines = logContent.split('\n').filter(l => l.trim())
      const errorLines = lines.filter(l => 
        l.toLowerCase().includes('error') || 
        l.toLowerCase().includes('failed') || 
        l.toLowerCase().includes('404') ||
        l.toLowerCase().includes('403') ||
        l.toLowerCase().includes('401')
      )
      if (errorLines.length > 0) {
        errorDetails = '\n\n' + errorLines.slice(-3).join('\n')
      } else if (lines.length > 0) {
        errorDetails = '\n\n' + lines.slice(-2).join('\n')
      }
    } catch (e) {
      // If we can't read the log, just include the code
    }
    
    const baseMessage = `npm install a echoue${typeof code === 'number' ? ` (code ${code})` : ''}.`
    setInstallState(id, {
      status: 'error',
      finishedAt: new Date().toISOString(),
      message: baseMessage + errorDetails,
      pid: undefined,
    })
  })

  return { ok: true as const, started: true, state: installStates.get(id), extension: null }
}

export function listChatonsExtensions() {
  const registry = safeReadRegistry()
  // Asynchronously update npm published versions in the background (non-blocking, debounced)
  if (!npmVersionUpdateRunning) {
    npmVersionUpdateRunning = true
    setImmediate(() => {
      void updateNpmPublishedVersionsAsync(registry.extensions).finally(() => {
        npmVersionUpdateRunning = false
      })
    })
  }
  return { ok: true as const, extensions: registry.extensions }
}

/**
 * Update npmPublishedVersion for locally installed extensions.
 * Runs fully async — no event loop blocking.
 * Results are cached with a 1-hour TTL per package.
 */
async function updateNpmPublishedVersionsAsync(extensions: ChatonsExtensionRegistryEntry[]) {
  let updated = false
  const now = Date.now()

  for (const ext of extensions) {
    if (ext.installSource !== 'localPath') continue
    if (!ext.config || !ext.config['npmPackageName']) continue

    const packageName = String(ext.config['npmPackageName'])

    // Check TTL cache first
    const cached = npmVersionCache.get(packageName)
    if (cached && (now - cached.fetchedAt) < NPM_VERSION_CACHE_TTL_MS) {
      if (cached.version !== ext.npmPublishedVersion) {
        ext.npmPublishedVersion = cached.version
        updated = true
      }
      continue
    }

    const currentNpmVersion = await getNpmPublishedVersionAsync(packageName)
    npmVersionCache.set(packageName, { version: currentNpmVersion, fetchedAt: Date.now() })

    if (currentNpmVersion !== ext.npmPublishedVersion) {
      ext.npmPublishedVersion = currentNpmVersion
      updated = true
    }
  }

  if (updated) {
    setRegistryEntry((current) => ({
      ...current,
      extensions: extensions,
    }))
  }
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
  if (id === BUILTIN_AUTOMATION_EXTENSION.id || id === BUILTIN_MEMORY_EXTENSION.id || id === BUILTIN_BROWSER_EXTENSION.id) {
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
  const catalog = getNpmCatalogCachedOrFresh()
  // Website catalog already includes builtins, channels, and tools
  // Fall back to local builtins if the catalog is empty
  const entries = catalog.entries.length > 0
    ? catalog.entries
    : listBundledCatalogEntries()
  return {
    ok: true as const,
    updatedAt: catalog.updatedAt,
    source: catalog.source,
    entries,
  }
}

export function getExtensionMarketplace() {
  const catalog = listChatonsExtensionCatalog()
  if (!catalog.ok) {
    return {
      ok: false as const,
      message: 'Failed to load marketplace',
    }
  }

  const entries = catalog.entries

  // Organize by category
  const byCategory: Record<string, ChatonsExtensionCatalogEntry[]> = {}
  for (const entry of entries) {
    const cat = entry.category ?? 'General'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(entry)
  }

  // Get featured extensions
  const featured = entries.filter(e => e.featured === true).slice(0, 6)

  // Get new extensions (last 30 days)
  const new_extensions = entries
    .filter(e => e.popularity === 'new')
    .sort((a, b) => {
      const aTime = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0
      const bTime = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0
      return bTime - aTime
    })
    .slice(0, 8)

  // Get trending (builtin + recommended)
  const trending = entries
    .filter(e => e.popularity === 'recommended' || e.popularity === 'popular')
    .slice(0, 8)

  return {
    ok: true as const,
    featured,
    new: new_extensions,
    trending,
    byCategory: Object.entries(byCategory).map(([name, items]) => ({
      name,
      count: items.length,
      items: items.slice(0, 12), // Limit items per category
    })),
    updatedAt: catalog.updatedAt,
    source: catalog.source,
  }
}

export async function getExtensionMarketplaceAsync() {
  const catalog = await getNpmCatalogCachedOrFreshAsync()
  // Website catalog already includes builtins, channels, and tools
  const entries = catalog.entries.length > 0
    ? catalog.entries
    : listBundledCatalogEntries()

  // Organize by category
  const byCategory: Record<string, ChatonsExtensionCatalogEntry[]> = {}
  for (const entry of entries) {
    const cat = entry.category ?? 'General'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(entry)
  }

  // Get featured extensions
  const featured = entries.filter(e => e.featured === true).slice(0, 6)

  // Get new extensions (last 30 days)
  const new_extensions = entries
    .filter(e => e.popularity === 'new')
    .sort((a, b) => {
      const aTime = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0
      const bTime = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0
      return bTime - aTime
    })
    .slice(0, 8)

  // Get trending (builtin + recommended)
  const trending = entries
    .filter(e => e.popularity === 'recommended' || e.popularity === 'popular')
    .slice(0, 8)

  return {
    ok: true as const,
    featured,
    new: new_extensions,
    trending,
    byCategory: Object.entries(byCategory).map(([name, items]) => ({
      name,
      count: items.length,
      items: items.slice(0, 12),
    })),
    updatedAt: catalog.updatedAt,
    source: catalog.source,
  }
}

export function checkForExtensionUpdates() {
  const registry = safeReadRegistry()
  const npm = getNpmCatalogCachedOrFresh()
  
  const updates: Array<{ id: string; currentVersion: string; latestVersion: string }> = []
  
  for (const extension of registry.extensions) {
    if (extension.installSource !== 'localPath') continue
    
    const catalogEntry = npm.entries.find(entry => entry.id === extension.id)
    if (!catalogEntry) continue
    
    if (catalogEntry.version !== extension.version) {
      updates.push({
        id: extension.id,
        currentVersion: extension.version,
        latestVersion: catalogEntry.version,
      })
    }
  }
  
  return { ok: true as const, updates }
}

export function updateChatonsExtension(id: string) {
  const registry = safeReadRegistry()
  const extension = registry.extensions.find(entry => entry.id === id)
  
  if (!extension) {
    return { ok: false as const, message: 'Extension not found' }
  }
  
  if (extension.installSource !== 'localPath') {
    return { ok: false as const, message: 'Only npm-installed extensions can be updated' }
  }
  
  const npm = getNpmCatalogCachedOrFresh()
  const catalogEntry = npm.entries.find(entry => entry.id === id)
  
  if (!catalogEntry) {
    return { ok: false as const, message: 'Extension not found in npm catalog' }
  }
  
  if (catalogEntry.version === extension.version) {
    return { ok: false as const, message: 'Extension is already up to date' }
  }
  
  const extensionDir = path.join(EXTENSIONS_DIR, id)
  const logPath = path.join(LOGS_DIR, `${extensionLogFileSafeId(id)}.update.log`)
  fs.writeFileSync(logPath, '', 'utf8')
  
  const child = spawn('npm', ['update', id], {
    cwd: extensionDir,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  
  installProcesses.set(id, child)
  setInstallState(id, {
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: undefined,
    message: 'Update en cours...',
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
        message: signal ? `Update annulee (${signal}).` : 'Update annulee.',
        pid: undefined,
      })
      return
    }
    if (code === 0) {
      const updatedRegistry = setRegistryEntry((currentRegistry) => ({
        ...currentRegistry,
        extensions: currentRegistry.extensions.map((entry) =>
          entry.id === id ? { ...entry, version: catalogEntry.version } : entry,
        ),
      }))
      
      setInstallState(id, {
        status: 'done',
        finishedAt: new Date().toISOString(),
        message: 'Update terminee.',
        pid: undefined,
      })
      return
    }
    
    // Extract detailed error from log file
    let errorDetails = ''
    try {
      const logContent = fs.readFileSync(logPath, 'utf8')
      const lines = logContent.split('\n').filter(l => l.trim())
      const errorLines = lines.filter(l => 
        l.toLowerCase().includes('error') || 
        l.toLowerCase().includes('failed') || 
        l.toLowerCase().includes('404') ||
        l.toLowerCase().includes('403') ||
        l.toLowerCase().includes('401')
      )
      if (errorLines.length > 0) {
        errorDetails = '\n\n' + errorLines.slice(-3).join('\n')
      } else if (lines.length > 0) {
        errorDetails = '\n\n' + lines.slice(-2).join('\n')
      }
    } catch (e) {
      // If we can't read the log, just include the code
    }
    
    const baseMessage = `npm update a echoue${typeof code === 'number' ? ` (code ${code})` : ''}.`
    setInstallState(id, {
      status: 'error',
      finishedAt: new Date().toISOString(),
      message: baseMessage + errorDetails,
      pid: undefined,
    })
  })
  
  return { ok: true as const, started: true, state: installStates.get(id) }
}

export function updateAllChatonsExtensions() {
  const registry = safeReadRegistry()
  const npm = getNpmCatalogCachedOrFresh()
  
  const extensionsToUpdate = registry.extensions.filter(extension => {
    if (extension.installSource !== 'localPath') return false
    const catalogEntry = npm.entries.find(entry => entry.id === extension.id)
    return catalogEntry && catalogEntry.version !== extension.version
  })
  
  const results = []
  
  for (const extension of extensionsToUpdate) {
    const result = updateChatonsExtension(extension.id)
    results.push({
      id: extension.id,
      success: result.ok,
      message: result.ok ? 'Update started' : result.message,
    })
  }
  
  return { ok: true as const, results }
}

/**
 * Synchronizes version numbers between chaton.extension.json and package.json
 * for an extension directory. Uses the HIGHER version to avoid conflicts.
 * This ensures npm publish works correctly even if versions get out of sync.
 * 
 * Returns the synchronized version and logs any changes for transparency.
 */
function syncExtensionVersions(extensionDir: string, logPath: string): { 
  success: boolean
  syncedVersion: string
  changedFiles: string[]
  message: string 
} {
  const changedFiles: string[] = []
  
  try {
    // Paths to the two manifest files
    const chatonManifestPath = path.join(extensionDir, 'chaton.extension.json')
    const packageJsonPath = path.join(extensionDir, 'package.json')
    
    // Read both files
    const chatonManifest = readJsonFile(chatonManifestPath)
    const packageJson = readJsonFile(packageJsonPath)
    
    if (!chatonManifest) {
      const msg = 'chaton.extension.json not found or invalid'
      fs.appendFileSync(logPath, `⚠️  Auto-sync: ${msg}\n`)
      return { success: false, syncedVersion: '', changedFiles: [], message: msg }
    }
    
    if (!packageJson) {
      const msg = 'package.json not found or invalid'
      fs.appendFileSync(logPath, `⚠️  Auto-sync: ${msg}\n`)
      return { success: false, syncedVersion: '', changedFiles: [], message: msg }
    }
    
    const chatonVersion = String(chatonManifest.version || '0.0.0').trim()
    const packageVersion = String(packageJson.version || '0.0.0').trim()
    
    // Parse versions to compare
    const parseChatonsVersion = (v: string) => {
      const parts = v.split('.')
      return {
        major: parseInt(parts[0] || '0', 10),
        minor: parseInt(parts[1] || '0', 10),
        patch: parseInt(parts[2] || '0', 10),
      }
    }
    
    const cVer = parseChatonsVersion(chatonVersion)
    const pVer = parseChatonsVersion(packageVersion)
    
    // Determine which version is higher
    let useVersion = chatonVersion
    let isSync = chatonVersion === packageVersion
    
    if (!isSync) {
      if (cVer.major > pVer.major || 
          (cVer.major === pVer.major && cVer.minor > pVer.minor) ||
          (cVer.major === pVer.major && cVer.minor === pVer.minor && cVer.patch > pVer.patch)) {
        useVersion = chatonVersion
      } else {
        useVersion = packageVersion
      }
    }
    
    // Update files if needed
    if (chatonVersion !== useVersion) {
      chatonManifest.version = useVersion
      fs.writeFileSync(chatonManifestPath, JSON.stringify(chatonManifest, null, 2) + '\n', 'utf8')
      changedFiles.push('chaton.extension.json')
      fs.appendFileSync(logPath, `✓ Auto-synced chaton.extension.json: ${chatonVersion} → ${useVersion}\n`)
    }
    
    if (packageVersion !== useVersion) {
      packageJson.version = useVersion
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8')
      changedFiles.push('package.json')
      fs.appendFileSync(logPath, `✓ Auto-synced package.json: ${packageVersion} → ${useVersion}\n`)
    }
    
    if (changedFiles.length > 0) {
      const msg = `Version sync: ${chatonVersion !== packageVersion ? 'DESYNC FIXED' : 'ALREADY SYNCED'} → v${useVersion} (updated: ${changedFiles.join(', ')})`
      fs.appendFileSync(logPath, `✓ ${msg}\n`)
      return { success: true, syncedVersion: useVersion, changedFiles, message: msg }
    } else {
      const msg = `Version already synchronized at v${useVersion}`
      fs.appendFileSync(logPath, `✓ ${msg}\n`)
      return { success: true, syncedVersion: useVersion, changedFiles: [], message: msg }
    }
    
  } catch (error) {
    const msg = `Failed to sync versions: ${error instanceof Error ? error.message : String(error)}`
    fs.appendFileSync(logPath, `✗ Auto-sync error: ${msg}\n`)
    return { success: false, syncedVersion: '', changedFiles: [], message: msg }
  }
}

export function publishChatonsExtension(id: string, npmToken?: string) {
  const registry = safeReadRegistry()
  const extension = registry.extensions.find(entry => entry.id === id)
  
  if (!extension) {
    return { ok: false as const, message: 'Extension not found' }
  }
  
  if (extension.installSource !== 'localPath') {
    return { ok: false as const, message: 'Only locally installed extensions can be published' }
  }
  
  const extensionDir = path.join(EXTENSIONS_DIR, id)
  if (!fs.existsSync(extensionDir)) {
    return { ok: false as const, message: 'Extension directory not found' }
  }
  
  // Look for package.json in the correct location:
  // If the extension was installed via npm, it's under node_modules
  // Otherwise it might be at the root (for local development)
  let packageJsonPath = path.join(extensionDir, 'package.json')
  if (!fs.existsSync(packageJsonPath)) {
    // Check under node_modules for npm-installed packages
    packageJsonPath = path.join(extensionDir, 'node_modules', id, 'package.json')
    if (!fs.existsSync(packageJsonPath)) {
      return { ok: false as const, message: 'package.json not found in extension directory' }
    }
  }
  
  const packageJson = readJsonFile(packageJsonPath)
  if (!packageJson) {
    return { ok: false as const, message: 'Invalid package.json' }
  }
  
  const name = typeof packageJson.name === 'string' ? packageJson.name.trim() : ''
  if (!name || !isValidPublishedExtensionPackageName(name)) {
    return { ok: false as const, message: `Invalid package name. Expected format: @user/chatons-extension-name (${name})` }
  }
  
  const version = typeof packageJson.version === 'string' ? packageJson.version.trim() : '0.0.0'
  if (!version) {
    return { ok: false as const, message: 'Invalid package version' }
  }
  
  // Check if user is logged in to npm
  const loginStatus = checkNpmLoginStatus()
  
  // Determine which token to use: provided token, stored token, or request new one
  let effectiveToken = npmToken
  if (!effectiveToken && !loginStatus.loggedIn) {
    const storedToken = loadNpmToken()
    effectiveToken = storedToken ?? undefined
  }
  
  if (!effectiveToken && !loginStatus.loggedIn) {
    return {
      ok: false as const,
      message: 'Not logged in to npm. Please provide an npm token.',
      requiresNpmLogin: true,
      npmLoginHelp: 'Get your npm token from https://www.npmjs.com/settings/{{your-username}}/tokens'
    }
  }
  
  // If a new token is provided, save it for future use
  if (npmToken && !loginStatus.loggedIn) {
    const savedSuccessfully = saveNpmToken(npmToken)
    if (!savedSuccessfully) {
      return { ok: false as const, message: 'Failed to save npm token. Publish may fail.' }
    }
  }
  
  // Also ensure token is available in ~/.npmrc as backup
  if (effectiveToken && !loginStatus.loggedIn) {
    const tokenSetSuccess = setNpmToken(effectiveToken)
    if (!tokenSetSuccess) {
      return { ok: false as const, message: 'Failed to set npm token' }
    }
  }
  
  const logPath = path.join(LOGS_DIR, `${extensionLogFileSafeId(id)}.publish.log`)
  fs.writeFileSync(logPath, '', 'utf8')
  
  // Auto-sync version numbers between chaton.extension.json and package.json
  // This ensures npm publish works even if versions get out of sync
  fs.appendFileSync(logPath, `${'='.repeat(70)}\n`)
  fs.appendFileSync(logPath, `Publishing: ${id}\n`)
  fs.appendFileSync(logPath, `Start time: ${new Date().toISOString()}\n`)
  fs.appendFileSync(logPath, `${'='.repeat(70)}\n`)
  fs.appendFileSync(logPath, `\n📋 Pre-publish checks:\n`)
  
  const syncResult = syncExtensionVersions(extensionDir, logPath)
  if (!syncResult.success) {
    fs.appendFileSync(logPath, `\n❌ Version sync failed: ${syncResult.message}\n`)
    // Continue anyway, let npm handle it
  } else {
    fs.appendFileSync(logPath, `✓ Version sync completed: ${syncResult.message}\n`)
  }
  fs.appendFileSync(logPath, `\n📦 Executing npm publish...\n`)
  
  // Determine the working directory for npm publish
  // If installed via npm, it's under node_modules; otherwise it's the extension root
  let publishCwd = extensionDir
  if (fs.existsSync(path.join(extensionDir, 'node_modules', id))) {
    publishCwd = path.join(extensionDir, 'node_modules', id)
  }
  
  // Pass npm token via environment variables for reliable npm CLI authentication.
  // This is more reliable than relying solely on ~/.npmrc since the npm CLI process
  // gets the token directly in its environment without file system timing issues.
  const spawnEnv = { ...process.env }
  if (effectiveToken) {
    // npm_config__authToken is the env var npm CLI looks for
    spawnEnv.npm_config__authToken = effectiveToken
  }
  
  const child = spawn('npm', ['publish', '--access', 'public'], {
    cwd: publishCwd,
    env: spawnEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  
  installProcesses.set(id, child)
  setInstallState(id, {
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: undefined,
    message: 'Publishing to npm...',
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
        message: signal ? `Publish cancelled (${signal}).` : 'Publish cancelled.',
        pid: undefined,
      })
      return
    }
    if (code === 0) {
      setInstallState(id, {
        status: 'done',
        finishedAt: new Date().toISOString(),
        message: 'Publish successful.',
        pid: undefined,
      })
      return
    }
    
    // Extract detailed error from log file
    let errorDetails = ''
    try {
      const logContent = fs.readFileSync(logPath, 'utf8')
      // Extract the most relevant error lines (usually at the end)
      const lines = logContent.split('\n').filter(l => l.trim())
      const errorLines = lines.filter(l => 
        l.toLowerCase().includes('error') || 
        l.toLowerCase().includes('failed') || 
        l.toLowerCase().includes('403') ||
        l.toLowerCase().includes('401') ||
        l.toLowerCase().includes('unauthorized') ||
        l.toLowerCase().includes('forbidden')
      )
      if (errorLines.length > 0) {
        // Take last 3 error lines for context
        errorDetails = '\n\n' + errorLines.slice(-3).join('\n')
      } else if (lines.length > 0) {
        // Fall back to last few lines if no specific error found
        errorDetails = '\n\n' + lines.slice(-2).join('\n')
      }
    } catch (e) {
      // If we can't read the log, just include the code
    }
    
    const baseMessage = `npm publish failed${typeof code === 'number' ? ` (code ${code})` : ''}.`
    const detailedMessage = baseMessage + (errorDetails ? `${errorDetails}` : '')
    
    setInstallState(id, {
      status: 'error',
      finishedAt: new Date().toISOString(),
      message: detailedMessage,
      pid: undefined,
    })
  })
  
  return { ok: true as const, started: true, state: installStates.get(id) }
}

export function checkStoredNpmToken() {
  const token = loadNpmToken()
  return { ok: true as const, hasToken: !!token }
}

export function clearStoredNpmToken() {
  const success = clearNpmToken()
  return { ok: success as boolean, message: success ? 'Token cleared successfully' : 'Failed to clear token' }
}
