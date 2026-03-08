/**
 * Extension sandbox manager.
 *
 * Runs each non-builtin extension handler in a separate worker_threads
 * Worker with CPU and memory limits. Provides the same API surface as
 * the old in-process handler loading, but isolated.
 *
 * Resource limits per worker:
 *   - maxOldGenerationSizeMb: heap cap (default 128 MB)
 *   - maxYoungGenerationSizeMb: nursery cap (default 32 MB)
 *   - stackSizeMb: call-stack cap (default 4 MB)
 *
 * Each call has a configurable timeout (default 60 s).
 */
import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { appendExtensionLog } from './logging.js'
import { runtimeState } from './state.js'
import { storageKvGet, storageKvSet } from './storage.js'
import type { ExtensionHostCallResult } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Compiled worker script path (adjacent to this file after tsc)
const WORKER_SCRIPT = path.join(__dirname, 'sandbox-worker.js')

// Default resource limits per extension worker
const DEFAULT_RESOURCE_LIMITS = {
  maxOldGenerationSizeMb: 128,  // Max heap size
  maxYoungGenerationSizeMb: 32, // Max young generation size
  stackSizeMb: 4,               // Max stack size
}

// Max time a single handler call can take before being killed
const CALL_TIMEOUT_MS = 60_000

// Max time to wait for worker to become ready
const READY_TIMEOUT_MS = 10_000

type PendingCall = {
  resolve: (result: ExtensionHostCallResult) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type SandboxedWorker = {
  worker: Worker
  extensionId: string
  ready: boolean
  pendingCalls: Map<string, PendingCall>
  callCounter: number
  createdAt: number
  lastCallAt: number
}

// Active workers keyed by extension ID
const workers = new Map<string, SandboxedWorker>()

/**
 * Spawn a new worker for an extension handler.
 */
function spawnWorker(extensionId: string, handlerPath: string): Promise<SandboxedWorker> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_SCRIPT, {
      workerData: { extensionId, handlerPath },
      resourceLimits: { ...DEFAULT_RESOURCE_LIMITS },
      // Prevent the worker from keeping the process alive
      // if the main thread wants to exit
    })

    const entry: SandboxedWorker = {
      worker,
      extensionId,
      ready: false,
      pendingCalls: new Map(),
      callCounter: 0,
      createdAt: Date.now(),
      lastCallAt: 0,
    }

    const readyTimer = setTimeout(() => {
      if (!entry.ready) {
        worker.terminate()
        reject(new Error(`Worker for ${extensionId} did not become ready within ${READY_TIMEOUT_MS}ms`))
      }
    }, READY_TIMEOUT_MS)

    worker.on('message', (msg: {
      type: string
      id?: string
      result?: unknown
      method?: string
      args?: unknown[]
      message?: string
    }) => {
      if (msg.type === 'ready') {
        entry.ready = true
        clearTimeout(readyTimer)
        workers.set(extensionId, entry)
        appendExtensionLog(extensionId, 'info', 'sandbox.ready', {
          pid: worker.threadId,
          limits: DEFAULT_RESOURCE_LIMITS,
        })
        resolve(entry)
        return
      }

      if (msg.type === 'result') {
        const pending = entry.pendingCalls.get(msg.id!)
        if (pending) {
          entry.pendingCalls.delete(msg.id!)
          clearTimeout(pending.timer)
          pending.resolve(msg.result as ExtensionHostCallResult)
        }
        return
      }

      // Worker needs to call a main-thread service (storage, etc.)
      if (msg.type === 'proxy') {
        void handleProxyCall(extensionId, msg.id!, msg.method!, msg.args as unknown[])
          .then((result) => {
            if (entry.ready && !worker.threadId) return // worker died
            worker.postMessage({ type: 'proxy_response', id: msg.id, result })
          })
          .catch((err) => {
            worker.postMessage({
              type: 'proxy_response',
              id: msg.id,
              result: { ok: false, error: { code: 'internal', message: String(err) } },
            })
          })
        return
      }

      if (msg.type === 'error') {
        appendExtensionLog(extensionId, 'error', 'sandbox.error', {
          message: msg.message,
        })
        if (extensionId === '@thibautrey/chatons-extension-linear') {
          console.warn(`[linear-debug] sandbox worker message: ${String(msg.message ?? '')}`)
        }
        return
      }
    })

    worker.on('error', (err) => {
      appendExtensionLog(extensionId, 'error', 'sandbox.worker_error', {
        message: err.message,
        stack: err.stack,
      })
      // Reject all pending calls
      for (const [id, pending] of entry.pendingCalls) {
        clearTimeout(pending.timer)
        pending.resolve({
          ok: false,
          error: { code: 'internal', message: `Worker crashed: ${err.message}` },
        })
      }
      entry.pendingCalls.clear()
      workers.delete(extensionId)
    })

    worker.on('exit', (code) => {
      appendExtensionLog(extensionId, 'info', 'sandbox.exit', { code })
      // Reject all pending calls
      for (const [id, pending] of entry.pendingCalls) {
        clearTimeout(pending.timer)
        pending.resolve({
          ok: false,
          error: { code: 'internal', message: `Worker exited with code ${code}` },
        })
      }
      entry.pendingCalls.clear()
      workers.delete(extensionId)
    })
  })
}

/**
 * Handle a proxy call from the worker (e.g. storageKvGet, storageKvSet).
 * These run in the main thread where DB access is available.
 */
async function handleProxyCall(
  extensionId: string,
  callId: string,
  method: string,
  args: unknown[],
): Promise<unknown> {
  switch (method) {
    case 'storageKvGet': {
      const [extId, key] = args as [string, string]
      return storageKvGet(extId, key)
    }
    case 'storageKvSet': {
      const [extId, key, value] = args as [string, string, unknown]
      return storageKvSet(extId, key, value)
    }
    default:
      return {
        ok: false,
        error: { code: 'not_found', message: `Unknown proxy method: ${method}` },
      }
  }
}

/**
 * Get or create a sandboxed worker for an extension.
 */
async function getOrCreateWorker(extensionId: string): Promise<SandboxedWorker | null> {
  const existing = workers.get(extensionId)
  if (existing && existing.ready) {
    if (extensionId === '@thibautrey/chatons-extension-linear') {
      console.warn(`[linear-debug] reusing worker for ${extensionId}`)
    }
    return existing
  }

  const root = runtimeState.extensionRoots.get(extensionId)
  if (!root) {
    return null
  }

  const handlerPath = path.join(root, 'handler.js')
  if (extensionId === '@thibautrey/chatons-extension-linear') {
    console.warn(`[linear-debug] spawning worker extensionId=${extensionId} root=${root} handlerPath=${handlerPath}`)
  }
  try {
    return await spawnWorker(extensionId, handlerPath)
  } catch (err) {
    appendExtensionLog(extensionId, 'error', 'sandbox.spawn_failed', {
      message: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Execute a handler call in the extension's sandboxed worker.
 *
 * This is the main entry point used by extensionsCall() in runtime.ts.
 */
export async function callExtensionHandler(
  extensionId: string,
  apiName: string,
  payload: unknown,
): Promise<ExtensionHostCallResult> {
  if (extensionId === '@thibautrey/chatons-extension-linear') {
    console.warn(`[linear-debug] callExtensionHandler extensionId=${extensionId} apiName=${apiName}`)
  }
  const entry = await getOrCreateWorker(extensionId)
  if (!entry) {
    return {
      ok: false,
      error: { code: 'not_found', message: `No handler available for extension ${extensionId}` },
    }
  }

  const callId = `call_${++entry.callCounter}`
  entry.lastCallAt = Date.now()

  return new Promise<ExtensionHostCallResult>((resolve) => {
    const timer = setTimeout(() => {
      entry.pendingCalls.delete(callId)
      appendExtensionLog(extensionId, 'warn', 'sandbox.call_timeout', {
        apiName,
        timeoutMs: CALL_TIMEOUT_MS,
      })
      resolve({
        ok: false,
        error: {
          code: 'internal',
          message: `Extension handler call timed out after ${CALL_TIMEOUT_MS / 1000}s`,
        },
      })

      // Kill and restart the worker if a call times out (it's likely stuck)
      terminateWorker(extensionId)
    }, CALL_TIMEOUT_MS)

    entry.pendingCalls.set(callId, { resolve, reject: () => {}, timer })
    entry.worker.postMessage({ type: 'call', id: callId, apiName, payload })
  })
}

/**
 * Terminate a worker for an extension.
 */
export function terminateWorker(extensionId: string): void {
  const entry = workers.get(extensionId)
  if (!entry) return

  try {
    entry.worker.postMessage({ type: 'shutdown' })
  } catch {
    // ignore - worker may already be dead
  }

  // Force kill after 2 seconds if graceful shutdown fails
  setTimeout(() => {
    try {
      entry.worker.terminate()
    } catch {
      // ignore
    }
  }, 2_000)

  workers.delete(extensionId)
}

/**
 * Terminate all extension workers. Called during app shutdown.
 */
export function terminateAllWorkers(): void {
  for (const [extensionId] of workers) {
    terminateWorker(extensionId)
  }
}

/**
 * Check if a handler is available for an extension (file exists on disk).
 * Does NOT load or spawn anything.
 */
export function hasExtensionHandler(extensionId: string): boolean {
  const root = runtimeState.extensionRoots.get(extensionId)
  if (!root) {
    if (extensionId === '@thibautrey/chatons-extension-linear') {
      console.warn(`[linear-debug] hasExtensionHandler missing-root extensionId=${extensionId}`)
    }
    return false
  }
  const handlerPath = path.join(root, 'handler.js')
  try {
    require.resolve(handlerPath)
    if (extensionId === '@thibautrey/chatons-extension-linear') {
      console.warn(`[linear-debug] hasExtensionHandler resolved extensionId=${extensionId} handlerPath=${handlerPath}`)
    }
    return true
  } catch (error) {
    if (extensionId === '@thibautrey/chatons-extension-linear') {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[linear-debug] hasExtensionHandler unresolved extensionId=${extensionId} handlerPath=${handlerPath} error=${message}`)
    }
    return false
  }
}

/**
 * Get stats about all active extension workers.
 */
export function getWorkerStats(): Array<{
  extensionId: string
  threadId: number
  ready: boolean
  pendingCalls: number
  createdAt: number
  lastCallAt: number
}> {
  return Array.from(workers.values()).map((entry) => ({
    extensionId: entry.extensionId,
    threadId: entry.worker.threadId,
    ready: entry.ready,
    pendingCalls: entry.pendingCalls.size,
    createdAt: entry.createdAt,
    lastCallAt: entry.lastCallAt,
  }))
}
