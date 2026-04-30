import path from 'node:path'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { listChatonsExtensions } from '../manager.js'
import { FILES_ROOT } from './constants.js'
import { appendExtensionLog } from './logging.js'
import { getExtensionRoot } from './manifest.js'
import { runtimeState } from './state.js'

// Create a require function relative to this file's location
const requireFromHere = createRequire(import.meta.url)
const READY_URL_PROBE_TIMEOUT_MS = 1000
const serverStartPromises = new Map<string, Promise<void>>()

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

function normalizePathInsideExtension(root: string, raw: string | undefined) {
  if (!raw || typeof raw !== 'string') return null
  const candidate = path.resolve(root, raw)
  if (!candidate.startsWith(path.resolve(root))) return null
  return candidate
}

function resolveNodeCommand(env: Record<string, string>) {
  const execPath = process.execPath
  if (execPath && fs.existsSync(execPath)) {
    if (process.versions.electron) {
      return {
        command: execPath,
        argsPrefix: [] as string[],
        env: {
          ...env,
          ELECTRON_RUN_AS_NODE: '1',
        },
      }
    }
    return { command: execPath, argsPrefix: [] as string[], env }
  }
  return null
}

function resolveBundledCliPath(packageName: string, relativePath: string[]): string | null {
  const candidates = new Set<string>()

  try {
    const packagePath = requireFromHere.resolve(`${packageName}/package.json`)
    const packageDir = path.dirname(packagePath)
    candidates.add(path.join(packageDir, ...relativePath))
  } catch {
    // Keep probing packaged locations below.
  }

  const roots = [
    process.cwd(),
    process.resourcesPath,
    path.join(process.resourcesPath || '', 'app.asar.unpacked'),
    path.join(process.resourcesPath || '', packageName),
    path.join(process.resourcesPath || '', 'resources', packageName),
  ]

  for (const root of roots) {
    if (!root) continue
    candidates.add(path.join(root, packageName, ...relativePath))
    candidates.add(path.join(root, 'resources', packageName, ...relativePath))
    candidates.add(path.join(root, 'node_modules', packageName, ...relativePath))
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  return null
}

function resolvePackageManagerCommand(
  command: string,
  env: Record<string, string>,
): { command: string; argsPrefix?: string[]; env: Record<string, string> } | null {
  const trimmed = String(command || '').trim()
  const lower = trimmed.toLowerCase()
  if (!lower) return null

  const node = resolveNodeCommand(env)
  if (!node) return null

  const packageManagerCliByName = new Map<string, string[]>([
    ['npm', ['npm', 'bin', 'npm-cli.js']],
    ['pnpm', ['pnpm', 'bin', 'pnpm.cjs']],
    ['yarn', ['yarn', 'bin', 'yarn.js']],
  ])
  const cliRelativePath = packageManagerCliByName.get(lower)
  if (!cliRelativePath) return null

  const candidates = new Set<string>()

  const bundledCli = resolveBundledCliPath(cliRelativePath[0], cliRelativePath.slice(1))
  if (bundledCli) {
    candidates.add(bundledCli)
  }

  // Priority 2: Check process.resourcesPath based locations (for packaged Electron apps)
  if (process.resourcesPath) {
    candidates.add(path.join(process.resourcesPath, 'node_modules', ...cliRelativePath))
    candidates.add(path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', ...cliRelativePath))
    candidates.add(path.join(process.resourcesPath, cliRelativePath[0], ...cliRelativePath.slice(1)))
    candidates.add(path.join(process.resourcesPath, 'resources', ...cliRelativePath))
  }

  // Priority 3: Check relative to node command
  const nodeDir = path.dirname(node.command)
  candidates.add(path.join(nodeDir, 'node_modules', ...cliRelativePath))
  candidates.add(path.join(nodeDir, '..', 'node_modules', ...cliRelativePath))

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue
    return {
      command: node.command,
      argsPrefix: [...(node.argsPrefix ?? []), candidate],
      env: node.env,
    }
  }

  return null
}

function resolveServerCommand(command: string, env: Record<string, string>) {
  const trimmed = String(command || '').trim()
  const lower = trimmed.toLowerCase()
  if (lower === 'node' || lower === 'node.exe') {
    return resolveNodeCommand(env) ?? { command: trimmed, env }
  }
  if (lower === 'npm' || lower === 'npm.cmd' || lower === 'npm.exe') {
    return resolvePackageManagerCommand('npm', env) ?? { command: trimmed, env }
  }
  if (lower === 'pnpm' || lower === 'pnpm.cmd' || lower === 'pnpm.exe') {
    return resolvePackageManagerCommand('pnpm', env) ?? { command: trimmed, env }
  }
  if (lower === 'yarn' || lower === 'yarn.cmd' || lower === 'yarn.exe') {
    return resolvePackageManagerCommand('yarn', env) ?? { command: trimmed, env }
  }
  return { command: trimmed, env }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function resolveReadyTimeoutMs(readyTimeoutMs: number | undefined) {
  return typeof readyTimeoutMs === 'number' && Number.isFinite(readyTimeoutMs)
    ? Math.max(500, Math.floor(readyTimeoutMs))
    : 8000
}

async function isReadyUrlLive(url: string, timeoutMs = READY_URL_PROBE_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1, Math.floor(timeoutMs)))
  try {
    const res = await fetch(url, { signal: controller.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function waitForReadyUrl(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    if (await isReadyUrlLive(url, Math.min(READY_URL_PROBE_TIMEOUT_MS, remaining))) return true
    const sleepMs = Math.min(300, deadline - Date.now())
    if (sleepMs > 0) await sleep(sleepMs)
  }
  return false
}

export async function ensureExtensionServerStarted(extensionId: string) {
  const inFlight = serverStartPromises.get(extensionId)
  if (inFlight) {
    appendExtensionLog(extensionId, 'info', 'server.start.skipped', { reason: 'already_starting' })
    return inFlight
  }

  const promise = ensureExtensionServerStartedOnce(extensionId)
  serverStartPromises.set(extensionId, promise)
  try {
    await promise
  } finally {
    if (serverStartPromises.get(extensionId) === promise) {
      serverStartPromises.delete(extensionId)
    }
  }
}

async function ensureExtensionServerStartedOnce(extensionId: string) {
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

  const readyTimeout = start.readyUrl ? resolveReadyTimeoutMs(start.readyTimeoutMs) : null
  if (start.readyUrl && await isReadyUrlLive(start.readyUrl)) {
    const prev = runtimeState.serverStatus.get(extensionId) ?? {}
    runtimeState.serverStatus.set(extensionId, {
      ...prev,
      ready: true,
      lastError: undefined,
    })
    appendExtensionLog(extensionId, 'info', 'server.start.skipped', {
      reason: 'ready_url_already_live',
      readyUrl: start.readyUrl,
    })
    appendExtensionLog(extensionId, 'info', 'server.ready', {
      ready: true,
      readyUrl: start.readyUrl,
      readyTimeout,
      reusedExisting: true,
    })
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
  const resolved = resolveServerCommand(start.command, env)

  const args = Array.isArray(start.args) ? start.args : []
  const child = spawn(resolved.command, [...(resolved.argsPrefix ?? []), ...args], {
    cwd,
    env: resolved.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  runtimeState.serverProcesses.set(extensionId, child)
  runtimeState.serverStatus.set(extensionId, {
    ...runtimeState.serverStatus.get(extensionId),
    pid: child.pid ?? undefined,
  })

  child.once('error', (error) => {
    appendExtensionLog(extensionId, 'error', 'server.start.error', {
      message: error instanceof Error ? error.message : String(error),
    })
  })

  const onExit = (code: number | null) => {
    runtimeState.serverProcesses.delete(extensionId)
    void (async () => {
      const prev = runtimeState.serverStatus.get(extensionId) ?? {}
      const ready =
        start.expectExit === true
          ? prev.ready === true
          : start.readyUrl
            ? await isReadyUrlLive(start.readyUrl)
            : false
      runtimeState.serverStatus.set(extensionId, {
        ...prev,
        pid: undefined,
        lastExitAt: new Date().toISOString(),
        lastExitCode: code,
        ready,
        lastError:
          ready
            ? undefined
            : prev.lastError ?? (code !== null && code !== 0 ? `Server exited with code ${code}` : prev.lastError),
      })
      appendExtensionLog(extensionId, 'info', 'server.exit', {
        code,
        readyAfterExit: ready,
        readyUrl: start.readyUrl ?? null,
      })
    })()
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
    const effectiveReadyTimeout = readyTimeout ?? resolveReadyTimeoutMs(start.readyTimeoutMs)
    const ready = await waitForReadyUrl(start.readyUrl, effectiveReadyTimeout)
    const prev = runtimeState.serverStatus.get(extensionId) ?? {}
    runtimeState.serverStatus.set(extensionId, {
      ...prev,
      ready,
      lastError: ready ? undefined : `Server not ready after ${effectiveReadyTimeout}ms (${start.readyUrl})`,
    })
    appendExtensionLog(extensionId, ready ? 'info' : 'warn', 'server.ready', {
      ready,
      readyUrl: start.readyUrl,
      readyTimeout: effectiveReadyTimeout,
    })
  } else {
    const prev = runtimeState.serverStatus.get(extensionId) ?? {}
    runtimeState.serverStatus.set(extensionId, { ...prev, ready: true })
    appendExtensionLog(extensionId, 'info', 'server.ready', { ready: true, readyUrl: null, readyTimeout: null })
  }
}

export function stopExtensionServer(extensionId: string) {
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
