import path from 'node:path'
import { spawn } from 'node:child_process'
import { listChatonsExtensions } from '../manager.js'
import { FILES_ROOT } from './constants.js'
import { appendExtensionLog } from './logging.js'
import { getExtensionRoot } from './manifest.js'
import { runtimeState } from './state.js'

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

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForReadyUrl(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      // ignore while starting
    }
    await sleep(300)
  }
  return false
}

export async function ensureExtensionServerStarted(extensionId: string) {
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

  const args = Array.isArray(start.args) ? start.args : []
  const child = spawn(start.command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  runtimeState.serverProcesses.set(extensionId, child)

  child.once('error', (error) => {
    appendExtensionLog(extensionId, 'error', 'server.start.error', {
      message: error instanceof Error ? error.message : String(error),
    })
  })

  const onExit = (code: number | null) => {
    const prev = runtimeState.serverStatus.get(extensionId) ?? {}
    runtimeState.serverStatus.set(extensionId, {
      ...prev,
      lastExitAt: new Date().toISOString(),
      lastExitCode: code,
      ready: prev.ready && start.expectExit === true ? prev.ready : false,
    })
    appendExtensionLog(extensionId, 'info', 'server.exit', { code })
    runtimeState.serverProcesses.delete(extensionId)
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
    const readyTimeout = typeof start.readyTimeoutMs === 'number' && Number.isFinite(start.readyTimeoutMs)
      ? Math.max(500, Math.floor(start.readyTimeoutMs))
      : 8000
    const ready = await waitForReadyUrl(start.readyUrl, readyTimeout)
    const prev = runtimeState.serverStatus.get(extensionId) ?? {}
    runtimeState.serverStatus.set(extensionId, {
      ...prev,
      ready,
      lastError: ready ? undefined : `Server not ready after ${readyTimeout}ms (${start.readyUrl})`,
    })
    appendExtensionLog(extensionId, ready ? 'info' : 'warn', 'server.ready', {
      ready,
      readyUrl: start.readyUrl,
      readyTimeout,
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
