/**
 * Batching utility to prevent style thrashing
 * Groups multiple state updates into a single React batch
 */

import { unstable_batchedUpdates } from 'react-dom';

/**
 * Batch multiple state setter calls to prevent Blink rendering engine
 * from recalculating styles multiple times
 * 
 * @param updates - Array of state setter functions
 * @example
 * batchStateUpdates([
 *   () => setMessages(newMessages),
 *   () => setLoading(false),
 *   () => setScrollPosition(0),
 * ]);
 */
export function batchStateUpdates(updates: (() => void)[]) {
  unstable_batchedUpdates(() => {
    for (const update of updates) {
      update();
    }
  });
}

/**
 * Create a debounced state setter that batches updates
 * Useful for high-frequency updates like scroll position
 */
export function createDebouncedBatchedSetter<T>(
  setter: (value: T) => void,
  delay: number = 100,
) {
  let timeoutId: NodeJS.Timeout | null = null;
  let pendingValue: T | null = null;

  return (value: T) => {
    pendingValue = value;

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      unstable_batchedUpdates(() => {
        if (pendingValue !== null) {
          setter(pendingValue);
        }
      });
      timeoutId = null;
      pendingValue = null;
    }, delay);
  };
}

/**
 * Batch updates on the next idle time using requestIdleCallback
 * Prevents layout thrashing during scroll or animation
 */
export function batchUpdatesWhenIdle(updates: (() => void)[], timeout: number = 50) {
  if (typeof requestIdleCallback === 'undefined') {
    // Fallback for browsers without requestIdleCallback
    batchStateUpdates(updates);
    return;
  }

  requestIdleCallback(
    () => {
      batchStateUpdates(updates);
    },
    { timeout },
  );
}
