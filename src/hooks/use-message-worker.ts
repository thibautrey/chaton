/**
 * Hook to use Web Worker for heavy message processing
 * Offloads CPU-intensive computations from the main thread
 * Falls back to main thread if worker is not available
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { computeComposerContextUsage } from '@/components/shell/composer/context-usage';

interface UseMessageWorkerOptions {
  enabled?: boolean;
}

interface ComposerContextUsageData {
  usedTokens: number;
  contextWindow: number;
  percentage: number;
  totalMessages?: number;
}

export function useMessageWorker(options?: UseMessageWorkerOptions) {
  const { enabled = true } = options || {};
  const workerRef = useRef<Worker | null>(null);
  const [contextUsage, setContextUsage] = useState<ComposerContextUsageData | null>(null);
  const pendingRef = useRef<Set<string>>(new Set());

  // Initialize worker on mount
  useEffect(() => {
    if (!enabled) return;
    
    try {
      // Import worker with Webpack worker syntax
      const WorkerClass = new Worker(
        new URL('../workers/message-processor.worker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = WorkerClass;
      
      // Message handler
      const handleMessage = (event: MessageEvent) => {
        const { type, result, error } = event.data;
        
        if (type === 'ERROR') {
          console.error('[Message Worker] Error:', error);
        } else if (type === 'COMPUTE_CONTEXT_USAGE_RESULT') {
          setContextUsage(result);
          pendingRef.current.delete('COMPUTE_CONTEXT_USAGE');
        }
      };
      
      WorkerClass.onmessage = handleMessage;
      WorkerClass.onerror = (error) => {
        console.error('[Message Worker] Runtime error:', error);
      };

      return () => {
        WorkerClass.terminate();
        workerRef.current = null;
      };
    } catch (error) {
      console.error('[Message Worker] Failed to initialize:', error);
      // Worker not available, will fallback to main thread
    }
  }, [enabled]);

  /**
   * Compute context usage in worker
   */
  const computeContextUsage = useCallback((
    messages: unknown[],
    contextWindow: number
  ) => {
    // If already computing, skip
    if (pendingRef.current.has('COMPUTE_CONTEXT_USAGE')) {
      return;
    }
    
    if (workerRef.current) {
      pendingRef.current.add('COMPUTE_CONTEXT_USAGE');
      workerRef.current.postMessage({
        type: 'COMPUTE_CONTEXT_USAGE',
        payload: { messages, contextWindow },
      });
    } else {
      // Fallback: compute on main thread
      // (This maintains compatibility if worker fails)
      const computed = computeComposerContextUsage(messages, contextWindow);
      setContextUsage(
        computed
          ? {
              ...computed,
              totalMessages: messages.length,
            }
          : null,
      );
    }
  }, []);

  return {
    computeContextUsage,
    contextUsage,
  };
}

export type { ComposerContextUsageData };
