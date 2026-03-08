/**
 * Extension sandbox worker script.
 *
 * Runs inside a worker_threads Worker with resource limits.
 * Loads the extension handler.js and proxies calls between the
 * main thread and the handler function.
 *
 * Communication protocol (via parentPort):
 *
 *   Main -> Worker:
 *     { type: 'call', id, apiName, payload }
 *     { type: 'shutdown' }
 *
 *   Worker -> Main:
 *     { type: 'result', id, result }
 *     { type: 'proxy', id, method, args }   // request main-thread service
 *     { type: 'ready' }
 *     { type: 'error', id?, message }
 *
 *   Main -> Worker (proxy response):
 *     { type: 'proxy_response', id, result }
 */
import { parentPort, workerData } from "node:worker_threads";

import { pathToFileURL } from "node:url";

if (!parentPort) {
  process.exit(1);
}

const port = parentPort;

const { extensionId, handlerPath } = workerData as {
  extensionId: string;
  handlerPath: string;
};

// Pending proxy calls waiting for main thread response
const pendingProxyCalls = new Map<
  string,
  {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  }
>();

let proxyCallCounter = 0;

// Create a proxy context that forwards storage/db calls to the main thread
function createProxyStorageKvGet(extId: string, key: string): unknown {
  return sendProxyCall("storageKvGet", [extId, key]);
}

function createProxyStorageKvSet(
  extId: string,
  key: string,
  value: unknown,
): unknown {
  return sendProxyCall("storageKvSet", [extId, key, value]);
}

function sendProxyCall(method: string, args: unknown[]): Promise<unknown> {
  const id = `proxy_${++proxyCallCounter}`;
  return new Promise((resolve, reject) => {
    pendingProxyCalls.set(id, { resolve, reject });
    port.postMessage({ type: "proxy", id, method, args });

    // Timeout proxy calls after 30 seconds
    setTimeout(() => {
      if (pendingProxyCalls.has(id)) {
        pendingProxyCalls.delete(id);
        reject(new Error(`Proxy call ${method} timed out after 30s`));
      }
    }, 30_000);
  });
}

// Load handler
let handlerFn:
  | ((
      apiName: string,
      payload: unknown,
      ctx: Record<string, unknown>,
    ) => unknown | Promise<unknown>)
  | null = null;

async function loadHandler() {
  try {
    // Prefer dynamic import so extensions declared as ESM via package.json
    // `type: module` load correctly inside the sandbox worker.
    const mod = await import(pathToFileURL(handlerPath).href);
    handlerFn =
      typeof mod === "function"
        ? mod
        : typeof mod.default === "function"
          ? mod.default
          : null;
    if (handlerFn) return;
  } catch (importErr) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(handlerPath);
      handlerFn =
        typeof mod === "function"
          ? mod
          : typeof mod.default === "function"
            ? mod.default
            : null;
      if (handlerFn) return;
    } catch (requireErr) {
      const importMessage =
        importErr instanceof Error ? importErr.message : String(importErr);
      const requireMessage =
        requireErr instanceof Error ? requireErr.message : String(requireErr);
      port.postMessage({
        type: "error",
        message: `Failed to load handler: import=${importMessage}; require=${requireMessage}`,
      });
      process.exit(1);
    }
  }

  port.postMessage({
    type: "error",
    message: `No valid handler function exported from ${handlerPath}`,
  });
  process.exit(1);
}

// Build the context object that mirrors what the main thread provides
const workerCtx = {
  extensionId,
  // These proxy back to the main thread for actual DB operations
  storageKvGet: createProxyStorageKvGet,
  storageKvSet: createProxyStorageKvSet,
  // getDb is not available in the worker (intentional isolation)
  getDb: () => {
    throw new Error(
      "getDb is not available in extension sandbox. Use storageKvGet/storageKvSet instead.",
    );
  },
};

// Handle messages from main thread
port.on(
  "message",
  async (msg: {
    type: string;
    id?: string;
    apiName?: string;
    payload?: unknown;
    result?: unknown;
  }) => {
    if (msg.type === "shutdown") {
      process.exit(0);
    }

    if (msg.type === "proxy_response") {
      // Response to a proxy call we made
      const pending = pendingProxyCalls.get(msg.id!);
      if (pending) {
        pendingProxyCalls.delete(msg.id!);
        pending.resolve(msg.result);
      }
      return;
    }

    if (msg.type === "call") {
      const { id, apiName, payload } = msg;
      try {
        const result = await Promise.resolve(
          handlerFn!(apiName!, payload, workerCtx),
        );
        port.postMessage({ type: "result", id, result });
      } catch (err) {
        port.postMessage({
          type: "result",
          id,
          result: {
            ok: false,
            error: {
              code: "internal",
              message: err instanceof Error ? err.message : String(err),
            },
          },
        });
      }
    }
  },
);

void loadHandler().then(() => {
  port.postMessage({ type: "ready" });
});
