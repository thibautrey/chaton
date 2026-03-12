/**
 * React Optimization Utilities
 * Provides tools for batching updates and optimizing renders
 */

/**
 * Batch multiple state updates into a single render
 * @param updates - Array of state setter functions
 * @param callback - Optional callback after all updates are batched
 */
export async function batchUpdates(
  updates: Array<() => void | Promise<void>>,
  callback?: () => void
): Promise<void> {
  // Use React 18's automatic batching for synchronous updates
  for (const update of updates) {
    const result = update();
    if (result instanceof Promise) {
      await result;
    }
  }

  if (callback) {
    callback();
  }
}

/**
 * Chunked processing with requestIdleCallback
 * Processes items in chunks to avoid blocking the main thread
 */
export async function processInChunks<T, R>(
  items: T[],
  processor: (item: T) => R,
  chunkSize: number = 10,
  onProgress?: (processed: number, total: number) => void
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);

    // Process chunk synchronously
    for (const item of chunk) {
      results.push(processor(item));
    }

    // Yield to the browser if not the last chunk
    if (i + chunkSize < items.length) {
      await new Promise((resolve) => {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => resolve(undefined), { timeout: 50 });
        } else {
          setTimeout(() => resolve(undefined), 0);
        }
      });
    }

    // Progress callback
    if (onProgress) {
      onProgress(Math.min(i + chunkSize, items.length), items.length);
    }
  }

  return results;
}

/**
 * Debounce a function call
 * Useful for expensive operations triggered frequently (e.g., scroll, resize)
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      func(...args);
      timeout = null;
    }, wait);
  };
}

/**
 * Throttle a function call
 * Ensures function is called at most once every X milliseconds
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Memoize function result based on arguments
 * @param fn - Function to memoize
 * @param resolver - Optional function to generate cache key from arguments
 */
export function memoize<T extends (...args: unknown[]) => unknown>(
  fn: T,
  resolver?: (...args: Parameters<T>) => string
): (...args: Parameters<T>) => ReturnType<T> {
  const cache = new Map<string, ReturnType<T>>();

  return (...args: Parameters<T>): ReturnType<T> => {
    const key = resolver ? resolver(...args) : JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const result = fn(...args) as ReturnType<T>;
    cache.set(key, result);

    // Limit cache size to prevent memory issues
    if (cache.size > 100) {
      const firstKey = cache.keys().next().value;
      if (firstKey) {
        cache.delete(firstKey);
      }
    }

    return result;
  };
}

/**
 * Run function with timeout to avoid long tasks
 * Chunks work into smaller segments with requestIdleCallback
 */
export async function scheduleWork<T>(
  work: () => T,
  options?: { timeout?: number; highPriority?: boolean }
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = options?.timeout ?? 5000;
    const highPriority = options?.highPriority ?? false;

    let timeoutId: NodeJS.Timeout | null = null;

    const executeWork = () => {
      try {
        if (timeoutId) clearTimeout(timeoutId);
        const result = work();
        resolve(result);
      } catch (error) {
        if (timeoutId) clearTimeout(timeoutId);
        reject(error);
      }
    };

    if (typeof requestIdleCallback !== 'undefined' && !highPriority) {
      requestIdleCallback(() => executeWork(), { timeout });
    } else {
      // Fallback to setTimeout if requestIdleCallback not available
      timeoutId = setTimeout(executeWork, 0);
    }
  });
}

/**
 * Defer execution until browser is idle
 * Useful for non-critical operations
 */
export function deferredExecution<T>(
  fn: () => T,
  options?: { timeout?: number }
): Promise<T> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(
        () => {
          const result = fn();
          resolve(result);
        },
        { timeout: options?.timeout ?? 2000 }
      );
    } else {
      // Fallback for browsers without requestIdleCallback
      setTimeout(() => {
        const result = fn();
        resolve(result);
      }, 0);
    }
  });
}
