import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

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

type HookResult = {
  ok: boolean
  message: string
  targetPath?: string
}

const CHATON_BASE = path.join(os.homedir(), '.chaton')
const EXTENSIONS_DIR = path.join(CHATON_BASE, 'extensions')
const REGISTRY_PATH = path.join(CHATON_BASE, 'extensions', 'registry.json')
const LOGS_DIR = path.join(CHATON_BASE, 'extensions', 'logs')
const NPM_CACHE_PATH = path.join(CHATON_BASE, 'extensions', 'npm-index-cache.json')
const NPM_CATALOG_TTL_MS = 1000 * 60 * 30
const NPM_EXTENSION_PREFIX = '@chaton'

const BUILTIN_QWEN_EXTENSION: Omit<ChatonsExtensionRegistryEntry, 'enabled' | 'health' | 'lastRunAt' | 'lastRunStatus' | 'lastError'> = {
  id: 'qwen-schema-sanitizer',
  name: 'Qwen Schema Sanitizer',
  version: '1.0.0',
  description: 'Patch runtime Pi openai-completions schema conversion for Qwen/LiteLLM compatibility.',
  installSource: 'builtin',
}

const BUILTIN_EXAMPLE_EXTENSION: Omit<ChatonsExtensionRegistryEntry, 'enabled' | 'health' | 'lastRunAt' | 'lastRunStatus' | 'lastError'> = {
  id: 'chatons-example-extension',
  name: 'Chatons Example Extension',
  version: '1.0.0',
  description: 'Extension d’exemple embarquée qui documente les APIs: sidebar, notifications, UI hooks, lecture/écriture projet.',
  installSource: 'builtin',
  config: {
    requiresRestart: false,
    sandboxed: true,
    interfaces: ['sidebarMenu', 'notifications', 'projectReadWrite', 'uiSlots'],
  },
}

const BUILTIN_AUTOMATION_EXTENSION: Omit<ChatonsExtensionRegistryEntry, 'enabled' | 'health' | 'lastRunAt' | 'lastRunStatus' | 'lastError'> = {
  id: '@chaton/automation',
  name: 'Chatons Automation',
  version: '1.1.0',
  description: 'Extension d’automatisation intégrée pour créer et gérer des règles d’automatisation.',
  installSource: 'builtin',
}

const SANITIZER_MARKER = '_qwen3SanitizeDesc'

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
        ...BUILTIN_QWEN_EXTENSION,
        enabled: true,
        health: 'warning',
      },
      {
        ...BUILTIN_EXAMPLE_EXTENSION,
        enabled: true,
        health: 'ok',
      },
      {
        ...BUILTIN_AUTOMATION_EXTENSION,
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
    if (!existing.has(BUILTIN_QWEN_EXTENSION.id)) {
      parsed.extensions.push({
        ...BUILTIN_QWEN_EXTENSION,
        enabled: true,
        health: 'warning',
      })
    }
    if (!existing.has(BUILTIN_EXAMPLE_EXTENSION.id)) {
      parsed.extensions.push({
        ...BUILTIN_EXAMPLE_EXTENSION,
        enabled: true,
        health: 'ok',
      })
    }
    if (!existing.has(BUILTIN_AUTOMATION_EXTENSION.id)) {
      parsed.extensions.push({
        ...BUILTIN_AUTOMATION_EXTENSION,
        enabled: true,
        health: 'ok',
      })
    }

    return {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      extensions: parsed.extensions.filter((entry) => entry && typeof entry.id === 'string'),
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

function appendLog(extensionId: string, message: string) {
  ensureBaseDirs()
  const logPath = path.join(LOGS_DIR, `${extensionLogFileSafeId(extensionId)}.log`)
  const line = `[${new Date().toISOString()}] ${message}\n`
  fs.appendFileSync(logPath, line, 'utf8')
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

function normalizeNpmSearchEntry(entry: unknown): ChatonsExtensionCatalogEntry | null {
  if (!entry || typeof entry !== 'object') return null
  const e = entry as Record<string, unknown>
  const name = typeof e.name === 'string' ? e.name : ''
  if (!name.startsWith(`${NPM_EXTENSION_PREFIX}/`)) return null
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
      id: BUILTIN_QWEN_EXTENSION.id,
      name: BUILTIN_QWEN_EXTENSION.name,
      version: BUILTIN_QWEN_EXTENSION.version,
      description: BUILTIN_QWEN_EXTENSION.description,
      source: 'builtin',
      requiresRestart: false,
    },
    {
      id: BUILTIN_EXAMPLE_EXTENSION.id,
      name: BUILTIN_EXAMPLE_EXTENSION.name,
      version: BUILTIN_EXAMPLE_EXTENSION.version,
      description: BUILTIN_EXAMPLE_EXTENSION.description,
      source: 'builtin',
      requiresRestart: false,
    },
    {
      id: BUILTIN_AUTOMATION_EXTENSION.id,
      name: BUILTIN_AUTOMATION_EXTENSION.name,
      version: BUILTIN_AUTOMATION_EXTENSION.version,
      description: BUILTIN_AUTOMATION_EXTENSION.description,
      source: 'builtin',
      requiresRestart: false,
    },
  ]
}

function refreshNpmCatalog(): NpmCatalogCache {
  const result = runNpmJson(['search', `${NPM_EXTENSION_PREFIX}/*`, '--json']) as unknown
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
  if (id === BUILTIN_QWEN_EXTENSION.id) return BUILTIN_QWEN_EXTENSION
  if (id === BUILTIN_EXAMPLE_EXTENSION.id) return BUILTIN_EXAMPLE_EXTENSION
  if (id === BUILTIN_AUTOMATION_EXTENSION.id) return BUILTIN_AUTOMATION_EXTENSION
  return null
}

function installNpmExtensionToRegistry(id: string) {
  if (!id.startsWith(`${NPM_EXTENSION_PREFIX}/`)) {
    return { ok: false as const, message: `Nom npm invalide: ${id}` }
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

  const version = typeof pkgMeta.version === 'string' ? pkgMeta.version : '0.0.0'
  const description = typeof pkgMeta.description === 'string' ? pkgMeta.description : ''
  const requiresRestart = extractRequiresRestart(pkgMeta)
  const extensionDir = path.join(EXTENSIONS_DIR, id)
  fs.mkdirSync(extensionDir, { recursive: true })
  fs.writeFileSync(
    path.join(extensionDir, 'package.json'),
    `${JSON.stringify({ name: id, version, description }, null, 2)}\n`,
    'utf8',
  )

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
          health: 'warning',
          config: { requiresRestart, sandboxed: true },
        },
      ],
    }
  })

  return { ok: true as const, extension: registry.extensions.find((entry) => entry.id === id) }
}

function findOpenAiCompletionsCandidates(): string[] {
  const home = os.homedir()
  const appLocalRoot = process.cwd()
  const candidates: string[] = []
  const requireFromHere = createRequire(import.meta.url)

  // 1) Highest priority: resolve the exact package instance used by this Electron process.
  try {
    const piAiPkg = requireFromHere.resolve('@mariozechner/pi-ai/package.json')
    const fromResolvedPiAi = path.join(path.dirname(piAiPkg), 'dist', 'providers', 'openai-completions.js')
    if (fs.existsSync(fromResolvedPiAi)) {
      candidates.push(fromResolvedPiAi)
    }
  } catch {
    // ignore and continue with static fallbacks
  }

  try {
    const piCodingAgentEntrypoint = requireFromHere.resolve('@mariozechner/pi-coding-agent')
    const piCodingAgentDir = path.dirname(piCodingAgentEntrypoint)
    const fromResolvedAgentNested = path.join(
      piCodingAgentDir,
      '..',
      'node_modules',
      '@mariozechner',
      'pi-ai',
      'dist',
      'providers',
      'openai-completions.js',
    )
    if (fs.existsSync(fromResolvedAgentNested)) {
      candidates.push(path.normalize(fromResolvedAgentNested))
    }
  } catch {
    // ignore and continue with static fallbacks
  }

  const explicitPaths = [
    path.join(appLocalRoot, 'node_modules', '@mariozechner', 'pi-ai', 'dist', 'providers', 'openai-completions.js'),
    path.join(appLocalRoot, 'node_modules', '@mariozechner', 'pi-coding-agent', 'node_modules', '@mariozechner', 'pi-ai', 'dist', 'providers', 'openai-completions.js'),
    path.join(home, '.nvm', 'versions', 'node', 'v22.20.0', 'lib', 'node_modules', '@mariozechner', 'pi-coding-agent', 'node_modules', '@mariozechner', 'pi-ai', 'dist', 'providers', 'openai-completions.js'),
    path.join(home, '.nvm', 'versions', 'node', 'v22.20.0', 'lib', 'node_modules', '@mariozechner', 'pi-ai', 'dist', 'providers', 'openai-completions.js'),
    path.join('/usr/local/lib/node_modules', '@mariozechner', 'pi-coding-agent', 'node_modules', '@mariozechner', 'pi-ai', 'dist', 'providers', 'openai-completions.js'),
    path.join('/usr/local/lib/node_modules', '@mariozechner', 'pi-ai', 'dist', 'providers', 'openai-completions.js'),
    path.join('/usr/lib/node_modules', '@mariozechner', 'pi-coding-agent', 'node_modules', '@mariozechner', 'pi-ai', 'dist', 'providers', 'openai-completions.js'),
    path.join('/usr/lib/node_modules', '@mariozechner', 'pi-ai', 'dist', 'providers', 'openai-completions.js'),
    path.join(home, '.npm-global', 'lib', 'node_modules', '@mariozechner', 'pi-coding-agent', 'node_modules', '@mariozechner', 'pi-ai', 'dist', 'providers', 'openai-completions.js'),
  ]

  for (const candidate of explicitPaths) {
    if (fs.existsSync(candidate)) {
      candidates.push(candidate)
    }
  }

  const nvmRoot = path.join(home, '.nvm', 'versions', 'node')
  if (fs.existsSync(nvmRoot)) {
    let versions: string[] = []
    try {
      versions = fs.readdirSync(nvmRoot)
    } catch {
      versions = []
    }
    for (const version of versions) {
      const candidate = path.join(
        nvmRoot,
        version,
        'lib',
        'node_modules',
        '@mariozechner',
        'pi-coding-agent',
        'node_modules',
        '@mariozechner',
        'pi-ai',
        'dist',
        'providers',
        'openai-completions.js',
      )
      if (fs.existsSync(candidate)) {
        candidates.push(candidate)
      }
    }
  }

  return Array.from(new Set(candidates))
}

function buildQwenPatchBlock(): string {
  return `
// --- Qwen3 schema sanitizer (injected by Chatons extension manager) ---
function _qwen3SanitizeDesc(desc) {
    if (!desc || typeof desc !== 'string') return '';
    let s = desc.replace(/\\n\\s*/g, ' ').trim();
    s = s.replace(/\\{[^{}]*(?:\\{[^{}]*\\}[^{}]*)*\\}/g, 'object');
    if (s.length > 180) s = s.substring(0, 177) + '...';
    return s;
}
function _qwen3EnsureType(node) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return node;
    const keys = Object.keys(node);
    if (!keys.includes('type') && !keys.includes('anyOf') && !keys.includes('oneOf') &&
        !keys.includes('allOf') && !keys.includes('$ref') && !keys.includes('enum') && !keys.includes('const')) {
        return { type: 'string', ...node };
    }
    return node;
}
function _qwen3SanitizeSchema(node) {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(_qwen3SanitizeSchema);
    let n = { ..._qwen3EnsureType(node) };
    if (n.description) n.description = _qwen3SanitizeDesc(n.description);
    if (n.properties && typeof n.properties === 'object') {
        const props = {};
        for (const [k, v] of Object.entries(n.properties)) props[k] = _qwen3SanitizeSchema(v);
        n.properties = props;
    }
    if (n.items) n.items = _qwen3SanitizeSchema(n.items);
    for (const kw of ['anyOf', 'oneOf', 'allOf']) {
        if (Array.isArray(n[kw])) n[kw] = n[kw].map(_qwen3SanitizeSchema);
    }
    if (n.additionalProperties && typeof n.additionalProperties === 'object')
        n.additionalProperties = _qwen3SanitizeSchema(n.additionalProperties);
    for (const [k, v] of Object.entries(n)) {
        if (k === 'description' || k === 'properties' || k === 'items' || k === 'additionalProperties' || k === 'anyOf' || k === 'oneOf' || k === 'allOf') continue;
        if (v && typeof v === 'object') n[k] = _qwen3SanitizeSchema(v);
    }
    return n;
}
function _qwen3SanitizeTool(tool) {
    return {
        ...tool,
        description: _qwen3SanitizeDesc(tool.description || ''),
        parameters: _qwen3SanitizeSchema(tool.parameters),
    };
}
function _isQwen3Model(modelId) {
    return modelId && modelId.toLowerCase().includes('qwen');
}
// --- end Qwen3 schema sanitizer ---
`
}

function patchOpenAiCompletionsFile(targetPath: string): HookResult {
  let source = ''
  try {
    source = fs.readFileSync(targetPath, 'utf8')
  } catch (error) {
    return { ok: false, message: `Unable to read target file: ${error instanceof Error ? error.message : String(error)}` }
  }

  if (source.includes(SANITIZER_MARKER)) {
    let upgraded = source
    upgraded = upgraded.replace(
      '_isQwen3Model(model.id) ? context.tools.map(_qwen3SanitizeTool) : context.tools',
      'context.tools.map(_qwen3SanitizeTool)',
    )
    upgraded = upgraded.replace(
      'if (n.additionalProperties && typeof n.additionalProperties === \'object\')\n        n.additionalProperties = _qwen3SanitizeSchema(n.additionalProperties);\n    return n;',
      'if (n.additionalProperties && typeof n.additionalProperties === \'object\')\n        n.additionalProperties = _qwen3SanitizeSchema(n.additionalProperties);\n    for (const [k, v] of Object.entries(n)) {\n        if (k === \'description\' || k === \'properties\' || k === \'items\' || k === \'additionalProperties\' || k === \'anyOf\' || k === \'oneOf\' || k === \'allOf\') continue;\n        if (v && typeof v === \'object\') n[k] = _qwen3SanitizeSchema(v);\n    }\n    return n;',
    )
    if (upgraded !== source) {
      try {
        fs.writeFileSync(targetPath, upgraded, 'utf8')
        return { ok: true, message: 'Patch upgraded', targetPath }
      } catch (error) {
        return { ok: false, message: `Unable to upgrade patched file: ${error instanceof Error ? error.message : String(error)}`, targetPath }
      }
    }
    return { ok: true, message: 'Already patched', targetPath }
  }

  const convertToolsIndex = source.indexOf('function convertTools(')
  if (convertToolsIndex < 0) {
    return { ok: false, message: 'convertTools function not found', targetPath }
  }

  const patchedWithBlock = `${source.slice(0, convertToolsIndex)}${buildQwenPatchBlock()}\n${source.slice(convertToolsIndex)}`
  const toolsPattern = /if \(context\.tools\) \{\n(\s+)params\.tools = convertTools\(context\.tools(?:, compat)?\);/
  if (!toolsPattern.test(patchedWithBlock)) {
    return { ok: false, message: 'Unable to find context.tools assignment pattern', targetPath }
  }

  const patched = patchedWithBlock.replace(toolsPattern, (match, indent) => {
    const originalCall = match.match(/convertTools\([^)]+\)/)
    if (!originalCall) {
      return match
    }
    return `if (context.tools) {\n${indent}const toolsToConvert = context.tools.map(_qwen3SanitizeTool);\n${indent}params.tools = ${originalCall[0].replace('context.tools', 'toolsToConvert')};`
  })

  try {
    const backupPath = `${targetPath}.chaton-bak`
    if (!fs.existsSync(backupPath)) {
      fs.writeFileSync(backupPath, source, 'utf8')
    }
    fs.writeFileSync(targetPath, patched, 'utf8')
    return { ok: true, message: 'Patch applied', targetPath }
  } catch (error) {
    return { ok: false, message: `Unable to write target file: ${error instanceof Error ? error.message : String(error)}`, targetPath }
  }
}

function runQwenSchemaPatch(): HookResult {
  const candidates = findOpenAiCompletionsCandidates()
  if (candidates.length === 0) {
    return { ok: false, message: 'No openai-completions.js target found' }
  }

  // Candidate list is already priority-ordered (resolved runtime package first).
  const first = candidates[0]
  if (first) {
    return patchOpenAiCompletionsFile(first)
  }

  const appLocalRoot = process.cwd()
  const preferredLocal = candidates.find((candidate) => candidate.startsWith(path.join(appLocalRoot, 'node_modules')))
  if (preferredLocal) {
    return patchOpenAiCompletionsFile(preferredLocal)
  }

  const preferred = candidates.find((candidate) => candidate.includes('@mariozechner/pi-coding-agent/node_modules/@mariozechner/pi-ai'))
  const target = preferred ?? candidates[0]
  return patchOpenAiCompletionsFile(target)
}

function setRegistryEntry(update: (registry: RegistryFile) => RegistryFile) {
  const next = update(safeReadRegistry())
  writeRegistry(next)
  return next
}

export function listChatonsExtensions() {
  const registry = safeReadRegistry()
  return { ok: true as const, extensions: registry.extensions }
}

export function installChatonsExtension(id: string) {
  const builtin = getRegistryEntryFromBuiltin(id)
  if (!builtin) {
    return installNpmExtensionToRegistry(id)
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
          health: id === BUILTIN_QWEN_EXTENSION.id ? 'warning' : 'ok',
        },
      ],
    }
  })

  const extension = registry.extensions.find((entry) => entry.id === id)
  return { ok: true as const, extension }
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
  if (id === BUILTIN_QWEN_EXTENSION.id || id === BUILTIN_EXAMPLE_EXTENSION.id) {
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
  const logPath = path.join(LOGS_DIR, `${extensionLogFileSafeId(id)}.log`)
  if (!fs.existsSync(logPath)) {
    return { ok: true as const, id, content: '' }
  }
  return { ok: true as const, id, content: fs.readFileSync(logPath, 'utf8') }
}

function persistHookResult(extensionId: string, result: HookResult) {
  const now = new Date().toISOString()
  const registry = setRegistryEntry((state) => ({
    ...state,
    extensions: state.extensions.map((entry) => {
      if (entry.id !== extensionId) return entry
      return {
        ...entry,
        health: result.ok ? 'ok' : 'error',
        lastRunAt: now,
        lastRunStatus: result.ok ? 'ok' : 'error',
        lastError: result.ok ? undefined : result.message,
      }
    }),
  }))

  const target = result.targetPath ? ` target=${result.targetPath}` : ''
  appendLog(extensionId, `${result.ok ? 'OK' : 'ERROR'} ${result.message}${target}`)
  return registry
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
  const reports: Array<{ id: string; ok: boolean; message: string }> = []

  for (const extension of enabled) {
    if (extension.id === BUILTIN_QWEN_EXTENSION.id) {
      const result = runQwenSchemaPatch()
      persistHookResult(extension.id, result)
      reports.push({ id: extension.id, ok: result.ok, message: result.message })
      continue
    }

    reports.push({ id: extension.id, ok: true, message: 'No beforePiLaunch hook defined' })
  }

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
