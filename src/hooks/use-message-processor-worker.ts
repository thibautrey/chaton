/**
 * Hook to interact with message processor Web Worker
 * Offloads heavy computation from main thread
 */

import { useEffect, useRef, useCallback } from 'react'

interface WorkerTask {
  id: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolve: (value: any) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reject: (reason: any) => void
}

/**
 * useMessageProcessorWorker - Use Web Worker for heavy computations
 *
 * @example
 * const worker = useMessageProcessorWorker();
 * const parsed = await worker.parseMessage(msg);
 */
export function useMessageProcessorWorker() {
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef<Map<string, WorkerTask>>(new Map())
  const counterRef = useRef(0)

  // Initialize worker on first use
  const getWorker = useCallback((): Worker | null => {
    if (!workerRef.current) {
      if (typeof Worker !== 'undefined') {
        try {
          workerRef.current = new Worker(
            new URL('../workers/message-processor.worker.ts', import.meta.url),
            { type: 'module' },
          )

          // Handle messages from worker
          workerRef.current.onmessage = (event) => {
            const { id, data, error } = event.data
            const task = pendingRef.current.get(id)

            if (task) {
              if (error) {
                task.reject(new Error(error))
              } else {
                task.resolve(data)
              }
              pendingRef.current.delete(id)
            }
          }

          // Handle worker errors
          workerRef.current.onerror = (error) => {
            console.error('Worker error:', error)
            // Reject all pending tasks
            for (const task of pendingRef.current.values()) {
              task.reject(error)
            }
            pendingRef.current.clear()
          }
        } catch (e) {
          console.warn('Failed to create worker, falling back to main thread', e)
          return null
        }
      }
    }
    return workerRef.current!
  }, [])

  const sendTask = useCallback(
    async (type: string, data: unknown): Promise<unknown> => {
      const worker = getWorker()
      if (!worker) {
        // Fallback if worker not available
        console.warn('Worker not available, processing on main thread')
        return data
      }

      const id = `task-${++counterRef.current}`
      return new Promise((resolve, reject) => {
        pendingRef.current.set(id, { id, resolve, reject })

        // Timeout after 5 seconds
        const timeout = setTimeout(() => {
          pendingRef.current.delete(id)
          reject(new Error(`Worker task ${id} timed out`))
        }, 5000)

        try {
          worker.postMessage({ id, type, data })
        } catch (error) {
          clearTimeout(timeout)
          pendingRef.current.delete(id)
          reject(error)
        }
      })
    },
    [getWorker],
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
      pendingRef.current.clear()
    }
  }, [])

  return {
    parseMessage: (msg: unknown) => sendTask('parse-message', msg),
    highlightCode: (code: string, language?: string) =>
      sendTask('highlight-code', { code, language }),
    parseMarkdown: (markdown: string) => sendTask('parse-markdown', markdown),
    terminate: () => {
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    },
  }
}

/**
 * Global singleton worker instance (optional)
 */
const globalWorker: ReturnType<typeof useMessageProcessorWorker> | null = null

export function getGlobalMessageProcessorWorker() {
  if (!globalWorker) {
    // For non-React contexts, would need different initialization
    // This is a simplified placeholder
  }
  return globalWorker
}
