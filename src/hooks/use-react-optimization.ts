/**
 * React optimization hooks
 * Provides useful hooks for optimizing React component performance
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import {
  batchUpdates,
  processInChunks,
  debounce as debounceUtil,
  throttle as throttleUtil,
  deferredExecution,
} from '@/utils/react-optimization';

/**
 * Hook for debouncing state updates
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook for debouncing callback functions
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const debouncedRef = useRef(debounceUtil(callback, delay));

  useEffect(() => {
    debouncedRef.current = debounceUtil(callback, delay);
  }, [callback, delay]);

  return useCallback((...args: Parameters<T>): ReturnType<T> => {
    return (debouncedRef.current as T)(...args);
  }, []) as T;
}

/**
 * Hook for throttling callback functions
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  limit: number
): T {
  const throttledRef = useRef(throttleUtil(callback, limit));

  useEffect(() => {
    throttledRef.current = throttleUtil(callback, limit);
  }, [callback, limit]);

  return useCallback((...args: Parameters<T>): ReturnType<T> => {
    return (throttledRef.current as T)(...args);
  }, []) as T;
}

/**
 * Hook for batch updating multiple state values
 */
export function useBatchUpdates() {
  const updateRef = useRef<Array<() => void>>([]);

  const addUpdate = useCallback((update: () => void) => {
    updateRef.current.push(update);
  }, []);

  const flushUpdates = useCallback(async () => {
    const updates = updateRef.current;
    updateRef.current = [];
    await batchUpdates(updates);
  }, []);

  return { addUpdate, flushUpdates };
}

/**
 * Hook for processing items in chunks
 */
export function useChunkedProcessing<T, R>(
  items: T[],
  processor: (item: T) => R,
  chunkSize?: number
) {
  const [results, setResults] = useState<R[]>([]);
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const process = async () => {
      setIsProcessing(true);
      try {
        const result = await processInChunks(items, processor, chunkSize, (processed) => {
          if (!cancelled) {
            setProgress((processed / items.length) * 100);
          }
        });
        if (!cancelled) {
          setResults(result);
          setProgress(100);
        }
      } finally {
        if (!cancelled) {
          setIsProcessing(false);
        }
      }
    };

    process();

    return () => {
      cancelled = true;
    };
  }, [items, processor, chunkSize]);

  return { results, progress, isProcessing };
}

/**
 * Hook for deferred execution of non-critical work
 */
export function useDeferredWork<T>(
  work: () => T,
  deps?: React.DependencyList
): { result: T | null; isComplete: boolean } {
  const [result, setResult] = useState<T | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    let cancelled = false;

    deferredExecution(work).then((res) => {
      if (!cancelled) {
        setResult(res);
        setIsComplete(true);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { result, isComplete };
}

/**
 * Hook for scroll optimization with debouncing
 */
export function useOptimizedScroll(callback: (scrollY: number) => void, delay: number = 100) {
  const debouncedCallback = useDebouncedCallback<(scrollY: number) => void>(callback, delay);

  useEffect(() => {
    const handleScroll = () => {
      debouncedCallback(window.scrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [debouncedCallback]);
}

/**
 * Hook for window resize optimization with throttling
 */
export function useOptimizedResize(callback: (width: number, height: number) => void, limit: number = 100) {
  const throttledCallback = useThrottledCallback<(width: number, height: number) => void>(callback, limit);

  useEffect(() => {
    const handleResize = () => {
      throttledCallback(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [throttledCallback]);
}
